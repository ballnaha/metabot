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
from .models import Action, PendingTrade, Recommendation, IndicatorSnapshot, StrategySignal

log = logging.getLogger("metabot.trader")

_SLOT_RESERVATION_TTL_SECONDS = 30
_slot_lock = threading.Lock()
_slot_reservations: dict[str, float] = {}


def magic_for_symbol(symbol: str) -> int:
    group = market_group(symbol)
    if group == "gold":  return settings.gold_magic
    if group == "stock": return settings.stock_magic
    if group == "forex": return settings.forex_magic
    return settings.magic


def max_slots_for_symbol(symbol: str) -> int:
    group = market_group(symbol)
    if group == "crypto": return max(1, settings.max_crypto_open_trades or settings.max_open_trades)
    if group == "gold":   return max(1, settings.max_gold_open_trades   or settings.max_open_trades)
    if group == "stock":  return max(1, settings.max_stock_open_trades  or settings.max_open_trades)
    if group == "forex":  return max(1, settings.max_forex_open_trades  or settings.max_open_trades)
    return max(1, settings.max_open_trades)


def risk_limits_for_symbol(symbol: str) -> tuple[float, float]:
    """Return (risk fraction, max lot) for the symbol's asset group."""
    group = market_group(symbol)
    if group == "stock":
        return settings.stock_risk_per_trade, settings.stock_max_lot
    if group == "forex":
        return settings.forex_risk_per_trade, settings.forex_max_lot
    return settings.risk_per_trade, settings.max_lot


def get_group_slot_status(group: str) -> tuple[int, int]:
    """Return (used_slots, max_slots) for a given market group."""
    try:
        open_pos = mt5_client.positions()
    except Exception as e:
        log.warning("Could not fetch open positions: %s", e)
        open_pos = []

    bot_pos = [p for p in open_pos if _is_bot_position(p)]
    
    with _slot_lock:
        _prune_slot_reservations()
        reserved_symbols = set(_slot_reservations.keys())
        
    group_positions = [p for p in bot_pos if market_group(p["symbol"]) == group]
    reserved_group_count = sum(1 for s in reserved_symbols if market_group(s) == group)
    
    if group == "crypto":   max_slots = max(1, settings.max_crypto_open_trades or settings.max_open_trades)
    elif group == "gold":   max_slots = max(1, settings.max_gold_open_trades   or settings.max_open_trades)
    elif group == "stock":  max_slots = max(1, settings.max_stock_open_trades  or settings.max_open_trades)
    elif group == "forex":  max_slots = max(1, settings.max_forex_open_trades  or settings.max_open_trades)
    else:                   max_slots = max(1, settings.max_open_trades)
    
    used_slots = len(group_positions) + reserved_group_count
    return used_slots, max_slots


def _same_slot_group(position_symbol: str, target_symbol: str) -> bool:
    return market_group(position_symbol) == market_group(target_symbol)


def _prune_slot_reservations(now: float | None = None) -> None:
    now = now or time.monotonic()
    expired = [sym for sym, expires_at in _slot_reservations.items() if expires_at <= now]
    for sym in expired:
        _slot_reservations.pop(sym, None)


def _bot_magic_numbers() -> set[int]:
    """Return the set of magic numbers the bot currently uses."""
    # MT5 reserves magic=0 for manual trades. Some optional groups use 0 until
    # configured, so including it would accidentally classify every manual
    # position as a bot position.
    return {
        value for value in (
            settings.magic, settings.gold_magic, settings.stock_magic, settings.forex_magic
        ) if int(value or 0) != 0
    }


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
        # The single manager instance is shared by the API (now served on a
        # threadpool) and the worker thread. This guards the _pending map and,
        # crucially, makes the confirm() status check-and-claim atomic so the
        # same pending trade can't be executed twice by concurrent callers.
        self._lock = threading.RLock()

    @staticmethod
    def _mark_risk_blocked(rec: Recommendation) -> None:
        rec.risk_blocked = True
        rec.risk_reason = "lot ขั้นต่ำทำให้ความเสี่ยงหรือมูลค่าสัญญาเกินงบที่ตั้งไว้"
        rec.action = Action.HOLD
        rec.summary = (rec.summary or "") + f" | SKIP (Risk): {rec.risk_reason}"

    def evaluate_technical_signal(
        self,
        symbol: str,
        timeframe: str,
        strategy_name: Optional[str] = None,
    ) -> tuple[IndicatorSnapshot, StrategySignal]:
        # 220, not 200: forex_trend_pullback needs len(df) >= 220 and silently
        # HOLDs (confidence 0.0) on a shorter frame. Extra history is a no-op
        # for every other strategy, which all index from the tail.
        df = mt5_client.get_rates(symbol, timeframe, 220)
        snap = indicators.compute(df, symbol, timeframe)
        sig = strategy.apply(df, snap, strategy_name)
        return snap, sig

    async def stage_and_execute(
        self,
        symbol: str,
        snap: IndicatorSnapshot,
        use_ai: bool,
    ) -> tuple[Recommendation, Optional[PendingTrade]]:
        # 1. Double check slot status with lock
        ok, slot_reason = reserve_trade_slot(symbol)
        if not ok:
            # Slot was taken in the meantime
            rec = Recommendation(
                symbol=symbol,
                timeframe=snap.timeframe,
                price=snap.price,
                action=Action.HOLD,
                confidence=0.0,
                summary=slot_reason
            )
            return rec, None

        # 2. Gather AI opinions if enabled
        opinions = (
            await advisor.gather_opinions(snap)
            if use_ai
            else []
        )
        rec = advisor.decide(snap, opinions, use_ai)
        rec.suggested_lot = self.risk_lot(symbol, rec)

        if rec.action == Action.HOLD:
            release_trade_slot(symbol)
            return rec, None

        # risk_lot returns 0.0 when the broker's min lot would over-expose the
        # account beyond the configured limit — skip rather than over-trade.
        if not rec.suggested_lot:
            release_trade_slot(symbol)
            self._mark_risk_blocked(rec)
            return rec, None

        # Capture the live mid-price now — this is the moment the signal becomes
        # actionable. Drift is then measured against this, not the (much older)
        # closed-candle price, so it reflects real decision->fill slippage.
        try:
            tick = mt5_client.get_tick(symbol)
            bid, ask = float(tick.get("bid") or 0.0), float(tick.get("ask") or 0.0)
            if bid > 0 and ask > 0:
                rec.signal_ref_price = (bid + ask) / 2
        except Exception as e:
            log.debug("Live ref price capture failed for %s: %s", symbol, e)

        # 3. Stage and confirm
        pending = self.stage(rec)
        self.confirm(pending.id, slot_reserved=True)
        return rec, self._pending.get(pending.id)

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

        # risk_lot returns 0.0 when the broker's min lot would over-expose the
        # account beyond MIN_LOT_STAKE_MULTIPLE. Surface that as a non-actionable
        # signal so manual preview/staging paths don't offer an empty trade.
        if rec.action != Action.HOLD and not rec.suggested_lot:
            self._mark_risk_blocked(rec)
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
    @staticmethod
    def _notional_per_lot(info: dict, entry_price: float) -> float:
        """Estimate gross notional per lot in the account currency.

        MT5 reports tick value in the account currency. Using it avoids mixing
        quote-currency notionals (for example JPY on USDJPY) with USD equity.
        """
        tick_size = float(info.get("trade_tick_size") or 0.0)
        tick_value = float(info.get("trade_tick_value") or 0.0)
        if entry_price > 0 and tick_size > 0 and tick_value > 0:
            return entry_price * tick_value / tick_size
        contract_size = float(info.get("trade_contract_size") or 1.0)
        return entry_price * contract_size

    def _guard_min_lot_exposure(
        self,
        symbol: str,
        info: dict,
        lot: float,
        entry_price: float,
        target_budget: float,
        budget_label: str,
    ) -> float:
        """Flag (and optionally veto) a position the broker's min lot inflated.

        ``lot`` is the final, normalized lot. When the broker's minimum lot
        forces a position worth more than ``target_budget`` (the stake, or the
        notional implied by the risk budget), the trade is larger than intended.
        We always log it; if it exceeds ``min_lot_stake_multiple`` we return 0.0
        so the caller skips the trade rather than silently over-exposing.
        """
        notional = lot * self._notional_per_lot(info, entry_price)
        if target_budget <= 0 or notional <= 0:
            return lot

        ratio = notional / target_budget
        if ratio <= 1.0:
            return lot

        limit = settings.min_lot_stake_multiple
        if limit and ratio > limit:
            log.warning(
                "Skip %s: min lot %.2f → notional %.2f is %.1f× the %s %.2f "
                "(limit %.1f×). Stake too small for this symbol.",
                symbol, lot, notional, ratio, budget_label, target_budget, limit,
            )
            return 0.0

        log.warning(
            "%s min lot %.2f → notional %.2f is %.1f× the %s %.2f — "
            "position larger than intended.",
            symbol, lot, notional, ratio, budget_label, target_budget,
        )
        return lot

    def _cap_notional_to_equity(
        self, symbol: str, info: dict, lot: float, entry_price: float, equity: float
    ) -> float:
        """Cap a lot so its notional stays within max_notional_to_equity × equity.

        A tight stop can make risk-based sizing pick a large lot whose notional
        dwarfs the account (small $ risk but big gap/slippage exposure). This is
        the second risk layer: bound the position's gross size regardless of SL.
        Returns the (possibly reduced) lot; never raises it.
        """
        cap_mult = settings.max_notional_to_equity
        denom = self._notional_per_lot(info, entry_price)
        if not cap_mult or cap_mult <= 0 or equity <= 0 or denom <= 0:
            return lot

        max_notional = equity * cap_mult
        max_lot_by_notional = max_notional / denom
        if lot <= max_lot_by_notional:
            return lot

        if max_lot_by_notional < float(info.get("volume_min") or 0.0):
            log.warning(
                "Skip %s: broker minimum lot exceeds %.1f× equity notional cap.",
                symbol, cap_mult,
            )
            return 0.0
        capped = mt5_client.normalize_lot(symbol, max_lot_by_notional)
        log.warning(
            "%s lot %.2f (notional %.2f) exceeds %.1f× equity cap (%.2f) — "
            "reduced to %.2f.",
            symbol, lot, lot * denom, cap_mult, max_notional, capped,
        )
        return capped

    def risk_lot(self, symbol: str, rec: Recommendation) -> float:
        try:
            acct = mt5_client.account_info()
            info = mt5_client.symbol_info(symbol)
        except Exception as e:  # noqa: BLE001
            log.warning("risk_lot fallback (%s): %s", symbol, e)
            return 0.01

        # Expose contract size so clients can show the position's notional value.
        rec.contract_size = info.get("trade_contract_size", 1.0) or 1.0

        # Expose the minimum policy budgets implied by the broker minimum lot.
        min_lot = float(info.get("volume_min") or 0.0)
        min_lot_notional = min_lot * self._notional_per_lot(info, rec.price)
        rec.risk_budget_currency = str(acct.get("currency") or "USD")
        if min_lot_notional > 0:
            if settings.min_lot_stake_multiple > 0:
                rec.required_stake_budget = (
                    min_lot_notional / settings.min_lot_stake_multiple
                )
            if settings.max_notional_to_equity > 0:
                rec.required_equity = (
                    min_lot_notional / settings.max_notional_to_equity
                )

        risk_pct, max_lot = risk_limits_for_symbol(symbol)

        # Freqtrade-style equal slots division sizing
        if settings.position_sizing_mode == "equal_slots":
            max_slots = max_slots_for_symbol(symbol)
            if settings.stake_amount > 0:
                stake_amount = settings.stake_amount
            else:
                stake_amount = acct["equity"] / max_slots

            entry_price   = rec.price
            notional_per_lot = self._notional_per_lot(info, entry_price)

            if entry_price <= 0 or notional_per_lot <= 0:
                return mt5_client.normalize_lot(symbol, info["volume_min"])

            lot = stake_amount / notional_per_lot
            lot = mt5_client.normalize_lot(symbol, min(lot, max_lot))
            lot = self._cap_notional_to_equity(symbol, info, lot, entry_price, acct["equity"])
            if lot <= 0:
                return 0.0
            return self._guard_min_lot_exposure(
                symbol, info, lot, entry_price, stake_amount, "stake"
            )

        # Risk sizing based on SL distance
        risk_amount = acct["equity"] * risk_pct
        if not rec.stop_loss:
            return mt5_client.normalize_lot(symbol, info["volume_min"])

        sl_dist    = abs(rec.price - rec.stop_loss)
        tick_size  = info["trade_tick_size"] or info["point"]
        tick_value = info["trade_tick_value"] or 1.0
        if sl_dist <= 0 or tick_size <= 0 or tick_value <= 0:
            return mt5_client.normalize_lot(symbol, info["volume_min"])

        loss_per_lot = (sl_dist / tick_size) * tick_value
        lot = risk_amount / loss_per_lot if loss_per_lot > 0 else info["volume_min"]
        lot = mt5_client.normalize_lot(symbol, min(lot, max_lot))
        lot = self._cap_notional_to_equity(symbol, info, lot, rec.price, acct["equity"])
        if lot <= 0:
            return 0.0
        # Budget here is the notional the risk amount was meant to control: a min
        # lot that risks far more than risk_amount also over-exposes notionally.
        target_notional = (
            (risk_amount / loss_per_lot) * self._notional_per_lot(info, rec.price)
            if loss_per_lot > 0 else 0.0
        )
        return self._guard_min_lot_exposure(
            symbol, info, lot, rec.price, target_notional, "risk-implied notional"
        )

    def _prepare_market_execution(self, rec: Recommendation) -> dict:
        """Rebase strategy levels around the executable quote and reject bad fills.

        Indicators are calculated from the last closed candle (normally bid
        prices), while a BUY is filled at ask and a SELL at bid.  Sending the
        candle-based SL/TP unchanged silently destroys the intended R:R when
        spread is wide or price has moved since the candle closed.
        """
        if rec.action not in (Action.BUY, Action.SELL):
            raise ValueError("Market execution requires BUY or SELL")
        if not rec.stop_loss:
            raise ValueError("Trade rejected: strategy did not provide a stop loss")

        tick = mt5_client.get_tick(rec.symbol)
        info = mt5_client.symbol_info(rec.symbol)
        bid = float(tick.get("bid") or 0.0)
        ask = float(tick.get("ask") or 0.0)
        if bid <= 0 or ask <= 0 or ask < bid:
            raise ValueError(f"Trade rejected: invalid quote bid={bid} ask={ask}")

        signal_price = float(rec.price)
        sl_distance = abs(signal_price - float(rec.stop_loss))
        if sl_distance <= 0:
            raise ValueError("Trade rejected: stop-loss distance is zero")

        spread = ask - bid
        spread_ratio = spread / sl_distance
        spread_limit = (
            settings.crypto_max_spread_to_sl
            if market_group(rec.symbol) == "crypto"
            else settings.max_spread_to_sl
        )
        max_spread_ratio = max(0.0, spread_limit)
        if max_spread_ratio and spread_ratio > max_spread_ratio:
            raise ValueError(
                f"Trade rejected: spread {spread:g} is {spread_ratio:.0%} of SL distance "
                f"(limit {max_spread_ratio:.0%})"
            )

        # Measure drift against the live price captured when the signal was
        # decided, falling back to the closed-candle price only if it is missing.
        # On higher timeframes the closed candle can be hours old, so comparing
        # against it conflates normal intra-candle movement with real slippage
        # and inflates drift toward 100%. The decision-time mid avoids that.
        drift_ref = rec.signal_ref_price if rec.signal_ref_price else signal_price
        drift = abs(bid - drift_ref)
        drift_ratio = drift / sl_distance
        max_drift_ratio = max(0.0, settings.max_entry_drift_to_sl)
        if max_drift_ratio and drift_ratio > max_drift_ratio:
            raise ValueError(
                f"Trade rejected: price moved {drift_ratio:.0%} of SL distance since signal "
                f"(limit {max_drift_ratio:.0%})"
            )

        tp_distance = (
            abs(float(rec.take_profit) - signal_price)
            if rec.take_profit
            else sl_distance * settings.default_rr
        )
        entry = ask if rec.action == Action.BUY else bid
        if rec.action == Action.BUY:
            stop_loss = entry - sl_distance
            take_profit = entry + tp_distance
        else:
            stop_loss = entry + sl_distance
            take_profit = entry - tp_distance

        digits = int(info.get("digits", 6))
        rec.price = round(entry, digits)
        rec.stop_loss = round(stop_loss, digits)
        rec.take_profit = round(take_profit, digits)
        return {
            "signal_price": signal_price,
            "entry_price": rec.price,
            "spread": spread,
            "spread_to_sl": spread_ratio,
            "drift_to_sl": drift_ratio,
        }

    # ------------------------------------------------------------------ #
    # Pending trade lifecycle
    # ------------------------------------------------------------------ #
    def stage(self, rec: Recommendation, lot: Optional[float] = None) -> PendingTrade:
        lot = lot or rec.suggested_lot or self.risk_lot(rec.symbol, rec)
        pending = PendingTrade(id=uuid.uuid4().hex[:8], recommendation=rec, lot=lot)
        with self._lock:
            self._pending[pending.id] = pending
        return pending

    def get(self, pending_id: str) -> Optional[PendingTrade]:
        with self._lock:
            return self._pending.get(pending_id)

    def list_pending(self) -> List[PendingTrade]:
        with self._lock:
            return [p for p in self._pending.values() if p.status == "pending"]

    def cancel(self, pending_id: str) -> Optional[PendingTrade]:
        with self._lock:
            p = self._pending.get(pending_id)
            if p and p.status == "pending":
                p.status = "cancelled"
            return p

    def confirm(self, pending_id: str, lot: Optional[float] = None, slot_reserved: bool = False) -> PendingTrade:
        # Atomically claim the trade: check it's still pending and flip it to
        # "executing" under the lock, so a second concurrent confirm() for the
        # same id loses the race and can't fire a duplicate order. The slow
        # order_send runs outside the lock (it has its own MT5 lock).
        with self._lock:
            p = self._pending.get(pending_id)
            if p is None:
                raise KeyError(f"Unknown pending trade {pending_id}")
            if p.status != "pending":
                raise ValueError(f"Trade {pending_id} is already {p.status}")
            p.status = "executing"

        rec = p.recommendation
        use_lot = lot or p.lot
        if not slot_reserved:
            ok, reason = reserve_trade_slot(rec.symbol)
            if not ok:
                p.result = {"ok": False, "error": reason}
                p.status = "failed"
                return p

        try:
            execution = self._prepare_market_execution(rec)
            strategy_name = rec.indicators.strategy_name or "unknown"
            order_comment = f"mb|{strategy_name}"[:31]
            result = mt5_client.order_send(
                symbol=rec.symbol,
                action=rec.action,
                lot=use_lot,
                sl=rec.stop_loss,
                tp=rec.take_profit,
                comment=order_comment,
                magic=magic_for_symbol(rec.symbol),
            )
            result["execution"] = execution
            result["strategy"] = strategy_name
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
