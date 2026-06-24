"""Pluggable trading strategies.

A *strategy* turns indicator values into a technical signal (BUY / SELL / HOLD
with a confidence and reasons). It is separate from the AI advisors: the chosen
strategy's signal is shown to the user, fed into the AI prompt, and counted as a
confidence-weighted vote in advisor.merge().

Add your own strategy in three steps:

    from .strategy import Strategy, register
    from .models import Action, StrategySignal

    @register
    class MyStrategy(Strategy):
        name = "my_strategy"
        description = "what it does"

        def evaluate(self, df, snap) -> StrategySignal:
            ...
            return StrategySignal(action=Action.BUY, confidence=0.7,
                                  reasons=["why"])

Then set STRATEGY=my_strategy in .env (or pass "strategy" to /api/analyze).
"""
from __future__ import annotations

from typing import Dict, List, Optional, Type

import pandas as pd

from .config import settings
from .models import Action, IndicatorSnapshot, StrategySignal


class Strategy:
    """Base class. Subclass and implement evaluate()."""

    name: str = "base"
    description: str = ""

    def evaluate(self, df: pd.DataFrame, snap: IndicatorSnapshot) -> StrategySignal:
        raise NotImplementedError

    # -- helpers shared by strategies -------------------------------------
    def atr_levels(
        self, snap: IndicatorSnapshot, action: Action
    ) -> tuple[Optional[float], Optional[float]]:
        """Default SL/TP from ATR, respecting settings.atr_sl_mult / default_rr."""
        if action == Action.HOLD:
            return None, None
        atr = snap.atr or (snap.price * 0.005)
        dist = settings.atr_sl_mult * atr
        if action == Action.BUY:
            return round(snap.price - dist, 6), round(
                snap.price + dist * settings.default_rr, 6
            )
        return round(snap.price + dist, 6), round(
            snap.price - dist * settings.default_rr, 6
        )

    @staticmethod
    def _vote(bull: List[str], bear: List[str]) -> StrategySignal:
        """Turn agreeing/disagreeing reason lists into a signal."""
        total = len(bull) + len(bear)
        if total == 0:
            return StrategySignal(action=Action.HOLD, confidence=0.0)
        if len(bull) > len(bear):
            return StrategySignal(
                action=Action.BUY, confidence=len(bull) / total, reasons=bull
            )
        if len(bear) > len(bull):
            return StrategySignal(
                action=Action.SELL, confidence=len(bear) / total, reasons=bear
            )
        return StrategySignal(
            action=Action.HOLD, confidence=0.0, reasons=bull + bear
        )


# --------------------------------------------------------------------------- #
# Registry
# --------------------------------------------------------------------------- #
_REGISTRY: Dict[str, Strategy] = {}


def register(cls: Type[Strategy]) -> Type[Strategy]:
    _REGISTRY[cls.name] = cls()
    return cls


def get_strategy(name: Optional[str] = None) -> Strategy:
    key = (name or settings.strategy or "ema_macd_rsi").lower()
    if key not in _REGISTRY:
        raise KeyError(
            f"Unknown strategy '{key}'. Available: {', '.join(_REGISTRY)}"
        )
    return _REGISTRY[key]


def list_strategies() -> List[dict]:
    return [
        {"name": s.name, "description": s.description} for s in _REGISTRY.values()
    ]


def apply(
    df: pd.DataFrame, snap: IndicatorSnapshot, name: Optional[str] = None
) -> StrategySignal:
    """Run the chosen strategy and stamp its result onto the snapshot."""
    strat = get_strategy(name)
    sig = strat.evaluate(df, snap)
    snap.strategy_name = strat.name
    snap.strategy_confidence = round(sig.confidence, 2)
    snap.rule_bias = sig.action
    snap.rule_reasons = sig.reasons
    snap.strategy_sl = sig.stop_loss
    snap.strategy_tp = sig.take_profit
    return sig


# --------------------------------------------------------------------------- #
# Built-in strategies
# --------------------------------------------------------------------------- #
@register
class EmaMacdRsiStrategy(Strategy):
    """Confluence of EMA trend, MACD momentum and RSI extremes (the default)."""

    name = "ema_macd_rsi"
    description = (
        "กลยุทธ์พื้นฐานที่ดู 3 อย่างพร้อมกัน: แนวโน้มราคา, แรงส่งของตลาด, "
        "และราคาว่าแพงหรือถูกเกินไป เหมาะสำหรับเริ่มต้นเพราะรอหลายสัญญาณช่วยยืนยันก่อน"
    )

    def evaluate(self, df, snap):
        bull: List[str] = []
        bear: List[str] = []

        if snap.ema_fast is not None and snap.ema_slow is not None:
            if snap.ema_fast > snap.ema_slow:
                bull.append("EMA12 > EMA26 (uptrend)")
            else:
                bear.append("EMA12 < EMA26 (downtrend)")

        if snap.macd_hist is not None:
            if snap.macd_hist > 0:
                bull.append("MACD histogram positive")
            else:
                bear.append("MACD histogram negative")

        if snap.rsi is not None:
            if snap.rsi < 30:
                bull.append(f"RSI oversold ({snap.rsi:.0f})")
            elif snap.rsi > 70:
                bear.append(f"RSI overbought ({snap.rsi:.0f})")

        sig = self._vote(bull, bear)
        sig.stop_loss, sig.take_profit = self.atr_levels(snap, sig.action)
        return sig


@register
class TrendFollowStrategy(Strategy):
    """Follow the trend: trade in the EMA direction while momentum confirms."""

    name = "trend"
    description = (
        "กลยุทธ์ตามเทรนด์ ถ้าราคากำลังไหลขึ้นก็หาโอกาสซื้อ ถ้ากำลังไหลลงก็หาโอกาสขาย "
        "เหมาะกับตลาดที่วิ่งเป็นทิศทางชัด ไม่เหมาะกับตลาดแกว่งแคบไปมา"
    )

    def evaluate(self, df, snap):
        close = df["close"]
        ema50 = close.ewm(span=50, adjust=False).mean()
        slope = ema50.iloc[-1] - ema50.iloc[-5] if len(ema50) >= 5 else 0.0
        bull: List[str] = []
        bear: List[str] = []

        if snap.price > ema50.iloc[-1]:
            bull.append("price above EMA50")
        else:
            bear.append("price below EMA50")

        if slope > 0:
            bull.append("EMA50 rising")
        elif slope < 0:
            bear.append("EMA50 falling")

        if snap.macd_hist is not None:
            (bull if snap.macd_hist > 0 else bear).append("MACD momentum")

        sig = self._vote(bull, bear)
        # Trend trades need agreement; require >=2/3 to act.
        if sig.confidence < 0.66:
            sig.action = Action.HOLD
        sig.stop_loss, sig.take_profit = self.atr_levels(snap, sig.action)
        return sig


@register
class MeanReversionStrategy(Strategy):
    """Fade extremes: buy lower Bollinger band, sell upper, with RSI confirm."""

    name = "mean_reversion"
    description = (
        "กลยุทธ์รอราคายืดมากเกินไปแล้วคาดว่าจะเด้งกลับ เช่น ลงแรงจนเริ่มถูกเกินไปค่อยซื้อ "
        "หรือขึ้นแรงจนแพงเกินไปค่อยขาย เหมาะกับตลาดไซด์เวย์มากกว่าตลาดที่เทรนด์แรง"
    )

    def evaluate(self, df, snap):
        bull: List[str] = []
        bear: List[str] = []

        if snap.bb_lower is not None and snap.price <= snap.bb_lower:
            bull.append("price at/below lower Bollinger band")
        if snap.bb_upper is not None and snap.price >= snap.bb_upper:
            bear.append("price at/above upper Bollinger band")

        if snap.rsi is not None:
            if snap.rsi < 35:
                bull.append(f"RSI low ({snap.rsi:.0f})")
            elif snap.rsi > 65:
                bear.append(f"RSI high ({snap.rsi:.0f})")

        sig = self._vote(bull, bear)
        # For mean reversion, target the middle band (price), stop beyond ATR.
        if sig.action != Action.HOLD:
            atr = snap.atr or (snap.price * 0.005)
            dist = settings.atr_sl_mult * atr
            mid = (snap.bb_upper + snap.bb_lower) / 2 if snap.bb_upper else snap.price
            if sig.action == Action.BUY:
                sig.stop_loss = round(snap.price - dist, 6)
                sig.take_profit = round(mid, 6)
            else:
                sig.stop_loss = round(snap.price + dist, 6)
                sig.take_profit = round(mid, 6)
        return sig


@register
class BreakoutStrategy(Strategy):
    """Trade breaks of the recent N-bar high/low (Donchian-style)."""

    name = "breakout"
    description = (
        "กลยุทธ์เบรกเอาท์ รอให้ราคาทะลุกรอบสูงสุดหรือต่ำสุดล่าสุดก่อนค่อยเข้าเทรด "
        "เหมาะกับจังหวะที่ตลาดกำลังเริ่มวิ่งแรง แต่ต้องระวังการหลอกทะลุแล้วราคากลับตัว"
    )

    lookback = 20

    def evaluate(self, df, snap):
        if len(df) < self.lookback + 1:
            return StrategySignal(action=Action.HOLD, confidence=0.0)
        window = df.iloc[-(self.lookback + 1) : -1]
        hi = window["high"].max()
        lo = window["low"].min()
        bull: List[str] = []
        bear: List[str] = []

        if snap.price > hi:
            bull.append(f"break above {self.lookback}-bar high {hi:.5f}")
        elif snap.price < lo:
            bear.append(f"break below {self.lookback}-bar low {lo:.5f}")

        if snap.macd_hist is not None and bull and snap.macd_hist > 0:
            bull.append("momentum confirms")
        if snap.macd_hist is not None and bear and snap.macd_hist < 0:
            bear.append("momentum confirms")

        sig = self._vote(bull, bear)
        sig.stop_loss, sig.take_profit = self.atr_levels(snap, sig.action)
        return sig
