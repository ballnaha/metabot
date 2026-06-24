"""Trade orchestration: analysis -> recommendation -> immediate execution.

The flow lives here:
  1. analyze() builds a Recommendation.
  2. analyze_and_stage() stages the trade and immediately calls confirm() to send the order to MT5.
"""
from __future__ import annotations

import logging
import uuid
from typing import Dict, List, Optional

from . import advisor, indicators, mt5_client, strategy
from .config import settings
from .models import Action, PendingTrade, Recommendation

log = logging.getLogger("metabot.trader")


class TradeManager:
    def __init__(self) -> None:
        self._pending: Dict[str, PendingTrade] = {}

    # ------------------------------------------------------------------ #
    # Analysis
    # ------------------------------------------------------------------ #
    async def analyze(
        self,
        symbol: str,
        timeframe: Optional[str] = None,
        bars: int = 200,
        strategy_name: Optional[str] = None,
        use_ai: Optional[bool] = None,
    ) -> Recommendation:
        timeframe = (timeframe or settings.default_timeframe).upper()
        use_ai = settings.use_ai if use_ai is None else use_ai
        df = mt5_client.get_rates(symbol, timeframe, bars)
        snap = indicators.compute(df, symbol, timeframe)
        sig = strategy.apply(df, snap, strategy_name)  # stamps signal onto snap
        # Only spend AI calls when AI is on AND the strategy has an actionable
        # signal to filter.
        opinions = (
            await advisor.gather_opinions(snap)
            if use_ai and sig.action != Action.HOLD
            else []
        )
        rec = advisor.decide(snap, opinions, use_ai)
        rec.suggested_lot = self.risk_lot(symbol, rec)
        return rec

    async def analyze_and_stage(
        self,
        symbol: str,
        timeframe: Optional[str] = None,
        bars: int = 200,
        strategy_name: Optional[str] = None,
        use_ai: Optional[bool] = None,
    ) -> tuple[Recommendation, Optional[PendingTrade]]:
        """Analyze and, if actionable, create a pending trade (or auto-execute)."""
        # Check active positions to implement Freqtrade slot checks
        try:
            open_pos = mt5_client.positions()
            # Only count positions opened by this bot's magic number
            bot_positions = [p for p in open_pos if p.get("magic") == settings.magic]
        except Exception as e:
            log.warning("Could not fetch open positions to check slots: %s", e)
            bot_positions = []

        # 1. Do not enter another position on the same symbol (no double entry)
        if any(p["symbol"].upper() == symbol.upper() for p in bot_positions):
            log.info("Symbol %s already has an active open position managed by the bot. Skipping new trade signal.", symbol)
            rec = await self.analyze(symbol, timeframe, bars, strategy_name, use_ai)
            rec.action = Action.HOLD
            rec.summary = f"Already holding an active position on {symbol}."
            return rec, None

        # Check active pending trades for this symbol (prevent duplicate alerts/signals in pending state)
        pending_trades = self.list_pending()
        if any(p.recommendation.symbol.upper() == symbol.upper() for p in pending_trades):
            log.info("Symbol %s already has an active pending trade. Skipping new trade signal.", symbol)
            rec = await self.analyze(symbol, timeframe, bars, strategy_name, use_ai)
            rec.action = Action.HOLD
            rec.summary = f"Already have a pending trade for {symbol}."
            return rec, None

        # 2. Prevent entry if maximum open trade slots are filled
        if len(bot_positions) >= settings.max_open_trades:
            log.info("Max open trades limit reached (%s/%s). Skipping new entry for %s.",
                     len(bot_positions), settings.max_open_trades, symbol)
            rec = await self.analyze(symbol, timeframe, bars, strategy_name, use_ai)
            rec.action = Action.HOLD
            rec.summary = f"Max open trades limit reached ({len(bot_positions)}/{settings.max_open_trades})."
            return rec, None

        rec = await self.analyze(symbol, timeframe, bars, strategy_name, use_ai)
        if rec.action == Action.HOLD:
            return rec, None

        pending = self.stage(rec)
        self.confirm(pending.id)
        return rec, self._pending.get(pending.id)

    # ------------------------------------------------------------------ #
    # Risk sizing
    # ------------------------------------------------------------------ #
    def risk_lot(self, symbol: str, rec: Recommendation) -> float:
        try:
            acct = mt5_client.account_info()
            info = mt5_client.symbol_info(symbol)
        except Exception as e:  # noqa: BLE001
            log.warning("risk_lot fallback (%s): %s", symbol, e)
            return 0.01

        # Freqtrade-style equal slots division sizing
        if settings.position_sizing_mode == "equal_slots":
            max_slots = max(1, settings.max_open_trades)
            if settings.stake_amount > 0:
                stake_amount = settings.stake_amount
            else:
                stake_amount = acct["equity"] / max_slots
            
            entry_price = rec.price
            contract_size = info.get("trade_contract_size", 1.0) or 1.0
            
            if entry_price <= 0 or contract_size <= 0:
                return mt5_client.normalize_lot(symbol, info["volume_min"])
                
            lot = stake_amount / (entry_price * contract_size)
            lot = min(lot, settings.max_lot)
            return mt5_client.normalize_lot(symbol, lot)
            
        else:
            # Risk Sizing based on Stop Loss distance (1% risk)
            risk_amount = acct["equity"] * settings.risk_per_trade
            if not rec.stop_loss:
                return mt5_client.normalize_lot(symbol, info["volume_min"])

            sl_dist = abs(rec.price - rec.stop_loss)
            tick_size = info["trade_tick_size"] or info["point"]
            tick_value = info["trade_tick_value"] or 1.0
            if sl_dist <= 0 or tick_size <= 0 or tick_value <= 0:
                return mt5_client.normalize_lot(symbol, info["volume_min"])

            loss_per_lot = (sl_dist / tick_size) * tick_value
            lot = risk_amount / loss_per_lot if loss_per_lot > 0 else info["volume_min"]
            lot = min(lot, settings.max_lot)
            return mt5_client.normalize_lot(symbol, lot)

    # ------------------------------------------------------------------ #
    # Pending trade lifecycle
    # ------------------------------------------------------------------ #
    def stage(self, rec: Recommendation, lot: Optional[float] = None) -> PendingTrade:
        lot = lot or rec.suggested_lot or self.risk_lot(rec.symbol, rec)
        pending = PendingTrade(id=uuid.uuid4().hex[:8], recommendation=rec, lot=lot)
        self._pending[pending.id] = pending
        return pending

    def get(self, pending_id: str) -> Optional[PendingTrade]:
        return self._pending.get(pending_id)

    def list_pending(self) -> List[PendingTrade]:
        return [p for p in self._pending.values() if p.status == "pending"]

    def cancel(self, pending_id: str) -> Optional[PendingTrade]:
        p = self._pending.get(pending_id)
        if p and p.status == "pending":
            p.status = "cancelled"
        return p

    def confirm(self, pending_id: str, lot: Optional[float] = None) -> PendingTrade:
        p = self._pending.get(pending_id)
        if p is None:
            raise KeyError(f"Unknown pending trade {pending_id}")
        if p.status != "pending":
            raise ValueError(f"Trade {pending_id} is already {p.status}")

        rec = p.recommendation
        use_lot = lot or p.lot
        try:
            result = mt5_client.order_send(
                symbol=rec.symbol,
                action=rec.action,
                lot=use_lot,
                sl=rec.stop_loss,
                tp=rec.take_profit,
                comment=f"metabot-{rec.action.value}",
            )
            p.result = result
            p.status = "executed" if result.get("ok") else "failed"
        except Exception as e:  # noqa: BLE001
            p.result = {"ok": False, "error": str(e)}
            p.status = "failed"
        return p


# Single shared instance used by the API and the Telegram bot.
manager = TradeManager()
