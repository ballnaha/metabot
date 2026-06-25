"""Trade orchestration: analysis -> recommendation -> immediate execution.

The flow lives here:
  1. analyze() builds a Recommendation.
  2. analyze_and_stage() stages the trade and immediately calls confirm() to send the order to MT5.
"""
from __future__ import annotations

import logging
import threading
import time
import uuid
from typing import Dict, List, Optional

from . import advisor, indicators, mt5_client, strategy
from .config import settings
from .market_groups import market_group
from .models import Action, PendingTrade, Recommendation

log = logging.getLogger("metabot.trader")

_SLOT_RESERVATION_TTL_SECONDS = 30
_slot_lock = threading.Lock()
_slot_reservations: dict[str, float] = {}


def magic_for_symbol(symbol: str) -> int:
    group = market_group(symbol)
    if group == "gold":  return settings.gold_magic
    if group == "stock": return settings.stock_magic
    return settings.magic


def max_slots_for_symbol(symbol: str) -> int:
    group = market_group(symbol)
    if group == "crypto": return max(1, settings.max_crypto_open_trades or settings.max_open_trades)
    if group == "gold":   return max(1, settings.max_gold_open_trades   or settings.max_open_trades)
    if group == "stock":  return max(1, settings.max_stock_open_trades  or settings.max_open_trades)
    return max(1, settings.max_open_trades)


def _same_slot_group(position_symbol: str, target_symbol: str) -> bool:
    return market_group(position_symbol) == market_group(target_symbol)


def _prune_slot_reservations(now: float | None = None) -> None:
    now = now or time.monotonic()
    expired = [sym for sym, expires_at in _slot_reservations.items() if expires_at <= now]
    for sym in expired:
        _slot_reservations.pop(sym, None)


def _bot_magic_numbers() -> set[int]:
    """Return the set of magic numbers the bot currently uses."""
    return {settings.magic, settings.gold_magic, settings.stock_magic}


def _is_bot_position(pos: dict) -> bool:
    """True only if this position was opened by the current bot instance."""
    return pos.get("magic") in _bot_magic_numbers()


def _can_open_new_trade_unlocked(symbol: str) -> tuple[bool, str]:
    try:
        open_pos = mt5_client.positions()
    except Exception as e:
        log.warning("Could not fetch open positions to check slots: %s", e)
        open_pos = []

    # Only consider positions that belong to this bot (matching magic number).
    # Positions with a different or old magic are ignored so a magic-number
    # change doesn't permanently lock the bot out of a symbol.
    bot_pos = [p for p in open_pos if _is_bot_position(p)]

    symbol_upper = symbol.upper()
    reserved_symbols = set(_slot_reservations.keys())
    if any(p["symbol"].upper() == symbol_upper for p in bot_pos) or symbol_upper in reserved_symbols:
        return False, f"Already holding or opening an active position on {symbol_upper}."

    group_positions = [p for p in bot_pos if _same_slot_group(p["symbol"], symbol_upper)]
    reserved_group_count = sum(1 for s in reserved_symbols if _same_slot_group(s, symbol_upper))
    max_slots = max_slots_for_symbol(symbol_upper)
    used_slots = len(group_positions) + reserved_group_count
    if used_slots >= max_slots:
        group = market_group(symbol_upper)
        return False, f"Max {group} open trades limit reached ({used_slots}/{max_slots})."

    return True, ""


def can_open_new_trade(symbol: str) -> tuple[bool, str]:
    with _slot_lock:
        _prune_slot_reservations()
        return _can_open_new_trade_unlocked(symbol)


def reserve_trade_slot(symbol: str) -> tuple[bool, str]:
    symbol_upper = symbol.upper()
    with _slot_lock:
        _prune_slot_reservations()
        ok, reason = _can_open_new_trade_unlocked(symbol_upper)
        if not ok:
            return False, reason
        _slot_reservations[symbol_upper] = time.monotonic() + _SLOT_RESERVATION_TTL_SECONDS
        return True, ""


def release_trade_slot(symbol: str, keep_after_success: bool = False) -> None:
    symbol_upper = symbol.upper()
    with _slot_lock:
        if keep_after_success:
            _slot_reservations[symbol_upper] = time.monotonic() + _SLOT_RESERVATION_TTL_SECONDS
        else:
            _slot_reservations.pop(symbol_upper, None)


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
        # 1. Do not enter another position on the same symbol (no double entry)
        ok, slot_reason = can_open_new_trade(symbol)
        if not ok:
            log.info("%s Skipping new trade signal for %s.", slot_reason, symbol)
            rec = await self.analyze(symbol, timeframe, bars, strategy_name, use_ai)
            rec.action = Action.HOLD
            rec.summary = slot_reason
            return rec, None

        # Check active pending trades for this symbol (prevent duplicate alerts/signals in pending state)
        pending_trades = self.list_pending()
        if any(p.recommendation.symbol.upper() == symbol.upper() for p in pending_trades):
            log.info("Symbol %s already has an active pending trade. Skipping new trade signal.", symbol)
            rec = await self.analyze(symbol, timeframe, bars, strategy_name, use_ai)
            rec.action = Action.HOLD
            rec.summary = f"Already have a pending trade for {symbol}."
            return rec, None

        rec = await self.analyze(symbol, timeframe, bars, strategy_name, use_ai)
        if rec.action == Action.HOLD:
            return rec, None

        ok, slot_reason = reserve_trade_slot(symbol)
        if not ok:
            rec.action = Action.HOLD
            rec.summary = slot_reason
            return rec, None

        pending = self.stage(rec)
        self.confirm(pending.id, slot_reserved=True)
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
            max_slots = max_slots_for_symbol(symbol)
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

    def confirm(self, pending_id: str, lot: Optional[float] = None, slot_reserved: bool = False) -> PendingTrade:
        p = self._pending.get(pending_id)
        if p is None:
            raise KeyError(f"Unknown pending trade {pending_id}")
        if p.status != "pending":
            raise ValueError(f"Trade {pending_id} is already {p.status}")

        rec = p.recommendation
        use_lot = lot or p.lot
        if not slot_reserved:
            ok, reason = reserve_trade_slot(rec.symbol)
            if not ok:
                p.result = {"ok": False, "error": reason}
                p.status = "failed"
                return p

        try:
            result = mt5_client.order_send(
                symbol=rec.symbol,
                action=rec.action,
                lot=use_lot,
                sl=rec.stop_loss,
                tp=rec.take_profit,
                comment=f"metabot-{rec.action.value}",
                magic=magic_for_symbol(rec.symbol),
            )
            p.result = result
            p.status = "executed" if result.get("ok") else "failed"
            release_trade_slot(rec.symbol, keep_after_success=result.get("ok", False))
        except Exception as e:  # noqa: BLE001
            release_trade_slot(rec.symbol)
            p.result = {"ok": False, "error": str(e)}
            p.status = "failed"
        return p


# Single shared instance used by the API and the Telegram bot.
manager = TradeManager()
