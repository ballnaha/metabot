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
from .market_groups import market_group
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
        """Default SL/TP from ATR, using asset-class-specific multipliers."""
        if action == Action.HOLD:
            return None, None
        is_stock = market_group(snap.symbol) == "stock"
        sl_mult = settings.stock_atr_sl_mult if is_stock else settings.atr_sl_mult
        rr      = settings.stock_rr          if is_stock else settings.default_rr
        atr  = snap.atr or (snap.price * 0.005)
        dist = sl_mult * atr
        if action == Action.BUY:
            return round(snap.price - dist, 6), round(snap.price + dist * rr, 6)
        return round(snap.price + dist, 6), round(snap.price - dist * rr, 6)

    @staticmethod
    def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
        return max(low, min(high, value))

    @classmethod
    def _strength(cls, value: float, scale: float) -> float:
        if scale <= 0:
            return 0.0
        return cls._clamp(abs(value) / scale)

    @classmethod
    def _weighted_signal(
        cls,
        bull_score: float,
        bear_score: float,
        max_score: float,
        bull_reasons: List[str],
        bear_reasons: List[str],
        threshold: float = 0.22,
    ) -> StrategySignal:
        """Convert weighted indicator strength into a continuous signal score.

        Confidence here is a signal-strength score, not a win probability. The
        threshold prevents very small numerical tilts from becoming trades.
        """
        if max_score <= 0:
            return StrategySignal(action=Action.HOLD, confidence=0.0)

        net = (bull_score - bear_score) / max_score
        strength = cls._clamp(abs(net))
        if strength < threshold:
            return StrategySignal(
                action=Action.HOLD,
                confidence=round(strength, 2),
                reasons=bull_reasons + bear_reasons,
            )

        confidence = round(cls._clamp(0.25 + (0.75 * strength)), 2)
        if net > 0:
            return StrategySignal(action=Action.BUY, confidence=confidence, reasons=bull_reasons)
        return StrategySignal(action=Action.SELL, confidence=confidence, reasons=bear_reasons)

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
        bull_score = bear_score = max_score = 0.0
        bull: List[str] = []
        bear: List[str] = []
        atr = snap.atr or (snap.price * 0.005)

        if snap.ema_fast is not None and snap.ema_slow is not None:
            weight = 0.40
            spread = snap.ema_fast - snap.ema_slow
            strength = self._strength(spread, atr)
            max_score += weight
            if spread > 0:
                bull_score += weight * strength
                bull.append(f"EMA trend +{strength:.0%}")
            elif spread < 0:
                bear_score += weight * strength
                bear.append(f"EMA trend -{strength:.0%}")

        if snap.macd_hist is not None:
            weight = 0.35
            strength = self._strength(snap.macd_hist, atr * 0.35)
            max_score += weight
            if snap.macd_hist > 0:
                bull_score += weight * strength
                bull.append(f"MACD momentum +{strength:.0%}")
            elif snap.macd_hist < 0:
                bear_score += weight * strength
                bear.append(f"MACD momentum -{strength:.0%}")

        if snap.rsi is not None:
            weight = 0.25
            max_score += weight
            if snap.rsi < 45:
                strength = self._clamp((45 - snap.rsi) / 25)
                bull_score += weight * strength
                bull.append(f"RSI oversold {snap.rsi:.0f} ({strength:.0%})")
            elif snap.rsi > 55:
                strength = self._clamp((snap.rsi - 55) / 25)
                bear_score += weight * strength
                bear.append(f"RSI overbought {snap.rsi:.0f} ({strength:.0%})")

        sig = self._weighted_signal(bull_score, bear_score, max_score, bull, bear)
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
        atr = snap.atr or (snap.price * 0.005)
        bull_score = bear_score = max_score = 0.0
        bull: List[str] = []
        bear: List[str] = []

        price_gap = snap.price - ema50.iloc[-1]
        weight = 0.45
        strength = self._strength(price_gap, atr * 1.5)
        max_score += weight
        if price_gap > 0:
            bull_score += weight * strength
            bull.append(f"price above EMA50 ({strength:.0%})")
        elif price_gap < 0:
            bear_score += weight * strength
            bear.append(f"price below EMA50 ({strength:.0%})")

        weight = 0.30
        strength = self._strength(slope, atr * 0.35)
        max_score += weight
        if slope > 0:
            bull_score += weight * strength
            bull.append(f"EMA50 rising ({strength:.0%})")
        elif slope < 0:
            bear_score += weight * strength
            bear.append(f"EMA50 falling ({strength:.0%})")

        if snap.macd_hist is not None:
            weight = 0.25
            strength = self._strength(snap.macd_hist, atr * 0.35)
            max_score += weight
            if snap.macd_hist > 0:
                bull_score += weight * strength
                bull.append(f"MACD momentum +{strength:.0%}")
            elif snap.macd_hist < 0:
                bear_score += weight * strength
                bear.append(f"MACD momentum -{strength:.0%}")

        sig = self._weighted_signal(bull_score, bear_score, max_score, bull, bear, threshold=0.28)
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
        bull_score = bear_score = max_score = 0.0
        bull: List[str] = []
        bear: List[str] = []
        atr = snap.atr or (snap.price * 0.005)

        if snap.bb_lower is not None and snap.bb_upper is not None:
            weight = 0.55
            max_score += weight
            band_width = max(snap.bb_upper - snap.bb_lower, atr)
            mid = (snap.bb_upper + snap.bb_lower) / 2
            if snap.price < mid:
                strength = self._clamp((mid - snap.price) / (band_width / 2))
                bull_score += weight * strength
                bull.append(f"below Bollinger midpoint ({strength:.0%})")
            elif snap.price > mid:
                strength = self._clamp((snap.price - mid) / (band_width / 2))
                bear_score += weight * strength
                bear.append(f"above Bollinger midpoint ({strength:.0%})")

        if snap.rsi is not None:
            weight = 0.45
            max_score += weight
            if snap.rsi < 40:
                strength = self._clamp((40 - snap.rsi) / 20)
                bull_score += weight * strength
                bull.append(f"RSI oversold {snap.rsi:.0f} ({strength:.0%})")
            elif snap.rsi > 60:
                strength = self._clamp((snap.rsi - 60) / 20)
                bear_score += weight * strength
                bear.append(f"RSI overbought {snap.rsi:.0f} ({strength:.0%})")

        sig = self._weighted_signal(bull_score, bear_score, max_score, bull, bear, threshold=0.32)
        if sig.action != Action.HOLD:
            atr = snap.atr or (snap.price * 0.005)
            is_stock = market_group(snap.symbol) == "stock"
            dist = (settings.stock_atr_sl_mult if is_stock else settings.atr_sl_mult) * atr
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
        atr = snap.atr or (snap.price * 0.005)
        bull_score = bear_score = max_score = 0.0
        bull: List[str] = []
        bear: List[str] = []

        weight = 0.65
        max_score += weight
        if snap.price > hi:
            strength = self._strength(snap.price - hi, atr)
            bull_score += weight * strength
            bull.append(f"break above {self.lookback}-bar high ({strength:.0%})")
        elif snap.price < lo:
            strength = self._strength(lo - snap.price, atr)
            bear_score += weight * strength
            bear.append(f"break below {self.lookback}-bar low ({strength:.0%})")

        if snap.macd_hist is not None:
            weight = 0.35
            strength = self._strength(snap.macd_hist, atr * 0.35)
            max_score += weight
            if snap.macd_hist > 0:
                bull_score += weight * strength
                bull.append(f"breakout momentum +{strength:.0%}")
            elif snap.macd_hist < 0:
                bear_score += weight * strength
                bear.append(f"breakout momentum -{strength:.0%}")

        sig = self._weighted_signal(bull_score, bear_score, max_score, bull, bear, threshold=0.35)
        sig.stop_loss, sig.take_profit = self.atr_levels(snap, sig.action)
        return sig
