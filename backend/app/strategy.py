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


ALL_GROUPS = ("crypto", "gold", "stock", "forex")

# Per-group setting name holding the minimum SL distance as a fraction of price.
_MIN_SL_PCT_SETTING = {
    "crypto": "crypto_min_sl_pct",
    "forex": "forex_min_sl_pct",
    "gold": "gold_min_sl_pct",
    "stock": "stock_min_sl_pct",
}


def floor_sl_distance(symbol: str, price: float, dist: float) -> float:
    """Raise an SL distance to the per-group floor (% of price), if configured.

    ATR-based stops collapse when a market consolidates (ATR shrinks), leaving
    an SL so tight that spread dominates it and trades get rejected. Each asset
    class has its own floor because their SL/spread scales differ by ~10× (forex
    SL ≈ 0.1–0.2% of price vs crypto ≈ 5–7%). Flooring the distance keeps R:R
    intact because TP scales with it. 0 disables the floor for that group.
    """
    setting = _MIN_SL_PCT_SETTING.get(market_group(symbol))
    min_pct = getattr(settings, setting, 0.0) if setting else 0.0
    if min_pct and min_pct > 0 and price > 0:
        return max(dist, price * min_pct)
    return dist


class Strategy:
    """Base class. Subclass and implement evaluate()."""

    name: str = "base"
    description: str = ""
    # Asset groups this strategy is suited for. Defaults to all of them;
    # override in subclasses that rely on group-specific data (e.g. volume).
    groups: tuple[str, ...] = ALL_GROUPS
    # Optional strategy-specific time stop used by the backtester. Live trading
    # uses the matching group setting in the position monitor.
    max_hold_bars: int | None = None

    def evaluate(self, df: pd.DataFrame, snap: IndicatorSnapshot) -> StrategySignal:
        raise NotImplementedError

    # -- helpers shared by strategies -------------------------------------
    def atr_levels(
        self, snap: IndicatorSnapshot, action: Action
    ) -> tuple[Optional[float], Optional[float]]:
        """Default SL/TP from ATR, using asset-class-specific multipliers."""
        if action == Action.HOLD:
            return None, None
        group = market_group(snap.symbol)
        if group == "stock":
            sl_mult, rr = settings.stock_atr_sl_mult, settings.stock_rr
        elif group == "crypto":
            sl_mult, rr = settings.crypto_atr_sl_mult, settings.crypto_rr
        elif group == "forex":
            sl_mult, rr = settings.forex_atr_sl_mult, settings.forex_rr
        else:
            sl_mult, rr = settings.atr_sl_mult, settings.default_rr
        atr  = snap.atr or (snap.price * 0.005)
        dist = floor_sl_distance(snap.symbol, snap.price, sl_mult * atr)
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
        {"name": s.name, "description": s.description, "groups": list(s.groups)}
        for s in _REGISTRY.values()
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
        # Evaluate on the last CLOSED candle (-2), consistent with snap.* and the
        # other strategies. Using -1 (the still-forming candle) leaks look-ahead
        # data and makes the EMA reference disagree with snap.price.
        slope = ema50.iloc[-2] - ema50.iloc[-6] if len(ema50) >= 6 else 0.0
        atr = snap.atr or (snap.price * 0.005)
        bull_score = bear_score = max_score = 0.0
        bull: List[str] = []
        bear: List[str] = []

        price_gap = snap.price - ema50.iloc[-2]
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
            dist = floor_sl_distance(snap.symbol, snap.price, dist)
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
        # The evaluated candle is -2; compare it only with candles before it.
        # Including -2 makes close > max(high) practically impossible.
        window = df.iloc[-(self.lookback + 2) : -2]
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


@register
class SuperTrendEmaStrategy(Strategy):
    """SuperTrend + EMA 200 Trend Following Strategy."""

    name = "supertrend_ema"
    groups = ("crypto", "gold", "stock")
    description = (
        "กลยุทธ์ตามเทรนด์ระดับมืออาชีพ (SuperTrend + EMA 200) "
        "คัดกรองเทรนด์ใหญ่ด้วย EMA 200 และหาจุดเข้าซื้อขายที่คมกริบด้วย SuperTrend "
        "เหมาะสำหรับรันเทรนด์ในตลาด Crypto, ทองคำ และหุ้นเทรนด์แรง"
    )

    def compute_supertrend(self, df: pd.DataFrame, period: int = 10, multiplier: float = 3.0) -> tuple[pd.Series, pd.Series]:
        high, low, close = df["high"], df["low"], df["close"]
        prev_close = close.shift(1)
        tr = pd.concat([
            high - low,
            (high - prev_close).abs(),
            (low - prev_close).abs()
        ], axis=1).max(axis=1)
        atr = tr.ewm(alpha=1 / period, adjust=False).mean()
        
        hl2 = (high + low) / 2
        basic_ub = hl2 + multiplier * atr
        basic_lb = hl2 - multiplier * atr
        
        final_ub_list = basic_ub.tolist()
        final_lb_list = basic_lb.tolist()
        close_list = close.tolist()
        basic_ub_list = basic_ub.tolist()
        basic_lb_list = basic_lb.tolist()
        
        for i in range(1, len(df)):
            if basic_ub_list[i] < final_ub_list[i-1] or close_list[i-1] > final_ub_list[i-1]:
                final_ub_list[i] = basic_ub_list[i]
            else:
                final_ub_list[i] = final_ub_list[i-1]
                
            if basic_lb_list[i] > final_lb_list[i-1] or close_list[i-1] < final_lb_list[i-1]:
                final_lb_list[i] = basic_lb_list[i]
            else:
                final_lb_list[i] = final_lb_list[i-1]
                
        trend = [1] * len(df)
        for i in range(1, len(df)):
            if close_list[i] > final_ub_list[i-1]:
                trend[i] = 1
            elif close_list[i] < final_lb_list[i-1]:
                trend[i] = -1
            else:
                trend[i] = trend[i-1]
                
        supertrend = [0.0] * len(df)
        for i in range(len(df)):
            supertrend[i] = final_lb_list[i] if trend[i] == 1 else final_ub_list[i]
            
        return pd.Series(trend, index=df.index), pd.Series(supertrend, index=df.index)

    def evaluate(self, df: pd.DataFrame, snap: IndicatorSnapshot) -> StrategySignal:
        if len(df) < 200:
            return StrategySignal(action=Action.HOLD, confidence=0.0)
            
        close = df["close"]
        ema200 = close.ewm(span=200, adjust=False).mean()
        trend, supertrend_val = self.compute_supertrend(df, period=10, multiplier=3.0)
        
        last_idx = -2
        last_close = close.iloc[last_idx]
        last_ema200 = ema200.iloc[last_idx]
        last_trend = trend.iloc[last_idx]
        prev_trend = trend.iloc[last_idx - 1]
        
        bull_reasons = []
        bear_reasons = []
        action = Action.HOLD
        confidence = 0.0
        
        is_above_ema = last_close > last_ema200
        is_below_ema = last_close < last_ema200
        flipped_bull = (prev_trend == -1 and last_trend == 1)
        flipped_bear = (prev_trend == 1 and last_trend == -1)
        
        if is_above_ema and flipped_bull:
            action = Action.BUY
            confidence = 0.85
            bull_reasons.append("ราคาอยู่เหนือ EMA 200 (เทรนด์ใหญ่ขาขึ้น)")
            bull_reasons.append("SuperTrend พลิกกลับตัวเป็นขาขึ้น (สีเขียว)")
        elif is_below_ema and flipped_bear:
            action = Action.SELL
            confidence = 0.85
            bear_reasons.append("ราคาอยู่ใต้ EMA 200 (เทรนด์ใหญ่ขาลง)")
            bear_reasons.append("SuperTrend พลิกกลับตัวเป็นขาลง (สีแดง)")
        else:
            if last_trend == 1:
                bull_reasons.append("SuperTrend เป็นขาขึ้น (สีเขียว)")
            else:
                bear_reasons.append("SuperTrend เป็นขาลง (สีแดง)")
            if is_above_ema:
                bull_reasons.append("ราคาอยู่เหนือ EMA 200")
            else:
                bear_reasons.append("ราคาอยู่ใต้ EMA 200")
                
        sig = StrategySignal(
            action=action,
            confidence=confidence if action != Action.HOLD else round(0.5, 2),
            reasons=bull_reasons if action == Action.BUY else (bear_reasons if action == Action.SELL else (bull_reasons + bear_reasons))
        )
        sig.stop_loss, sig.take_profit = self.atr_levels(snap, sig.action)
        return sig


@register
class StockPullbackStrategy(Strategy):
    """Stock Pullback Buyer Strategy (5-star for Stocks)."""

    name = "stock_pullback"
    groups = ("stock",)
    description = (
        "กลยุทธ์ระดับ 5 ดาวสำหรับหุ้น (Stock Pullback) "
        "เน้นช้อนซื้อหุ้นที่เป็นแนวโน้มขาขึ้นใหญ่ในจังหวะย่อตัวเข้าหาแนวรับเส้น EMA 50 "
        "และมีระดับ RSI ต่ำลง แสดงถึงราคาลดราคาชั่วคราวเพื่อเข้าซื้อต้นน้ำที่ปลอดภัยและคุ้มค่าที่สุด"
    )

    def evaluate(self, df: pd.DataFrame, snap: IndicatorSnapshot) -> StrategySignal:
        if len(df) < 200:
            return StrategySignal(action=Action.HOLD, confidence=0.0)

        close = df["close"]
        low = df["low"]

        # Calculate EMAs
        ema200 = close.ewm(span=200, adjust=False).mean()
        ema50 = close.ewm(span=50, adjust=False).mean()

        last_idx = -2
        last_close = close.iloc[last_idx]
        last_low = low.iloc[last_idx]
        last_ema200 = ema200.iloc[last_idx]
        last_ema50 = ema50.iloc[last_idx]
        last_rsi = snap.rsi

        bull_reasons = []
        bear_reasons = []
        action = Action.HOLD
        confidence = 0.0

        # Condition 1: Long-term trend is bullish (Close is above EMA 200)
        is_uptrend = last_close > last_ema200

        # Condition 2: Pullback to EMA 50 (Low of candle tests support line, within 1.2% buffer)
        is_pullback = last_low <= last_ema50 * 1.012

        # Condition 3: RSI is neutral/oversold indicating a discounted entry point
        is_discount = last_rsi is not None and last_rsi <= 45

        # Condition 4: Bullish reversal confirmation (Green candle Close > Open)
        is_bullish_confirm = last_close > df["open"].iloc[last_idx]

        if is_uptrend and is_pullback and is_discount and is_bullish_confirm:
            action = Action.BUY
            confidence = 0.90
            bull_reasons.append("ราคาเหนือ EMA 200 (แนวโน้มขาขึ้นใหญ่ระยะยาว)")
            bull_reasons.append("ราคาปรับฐานย่อตัวลงมาทดสอบแนวรับเส้น EMA 50")
            bull_reasons.append(f"RSI คลายความร้อนแรงอยู่ที่ {last_rsi:.0f} (โซนราคาลดราคา)")
            bull_reasons.append("เกิดแท่งเทียนสีเขียวดีดกลับยืนเหนือราคาเปิด")
        else:
            if is_uptrend:
                bull_reasons.append("ราคาอยู่เหนือ EMA 200 (ภาพใหญ่ขาขึ้น)")
            else:
                bear_reasons.append("ราคาอยู่ต่ำกว่า EMA 200 (ภาพใหญ่ขาลง)")
            if last_rsi is not None:
                if last_rsi > 70:
                    bear_reasons.append(f"RSI Overbought ({last_rsi:.0f}) เสี่ยงดอย")
                elif last_rsi < 30:
                    bull_reasons.append(f"RSI Oversold ({last_rsi:.0f})")
                else:
                    bull_reasons.append(f"RSI Neutral ({last_rsi:.0f})")

        sig = StrategySignal(
            action=action,
            confidence=confidence if action != Action.HOLD else round(0.5, 2),
            reasons=bull_reasons if action == Action.BUY else (bear_reasons if action == Action.SELL else (bull_reasons + bear_reasons))
        )
        sig.stop_loss, sig.take_profit = self.atr_levels(snap, sig.action)
        return sig


@register
class SqueezeBreakoutStrategy(Strategy):
    """Squeeze breakout (Bollinger squeeze + volume spike).

    Despite the old "crypto_early_stage" name, backtests show this fits gold,
    forex and stocks too — so it's open to all groups.
    """

    name = "squeeze_breakout"
    groups = ("crypto", "gold", "forex", "stock")
    description = (
        "กลยุทธ์จับการระเบิดราคาหลังการบีบอัดความผันผวน (Bollinger Band Squeeze) "
        "ควบคู่กับปริมาณการซื้อขายที่ทะลักเข้าผิดปกติ (Volume Spike) "
        "ใช้ได้ทั้ง crypto / gold / forex / หุ้น"
    )

    def evaluate(self, df: pd.DataFrame, snap: IndicatorSnapshot) -> StrategySignal:
        if len(df) < 50:
            return StrategySignal(action=Action.HOLD, confidence=0.0)

        close = df["close"]
        open_p = df["open"]

        # 1. Bollinger Band Squeeze Calculation
        ma = close.rolling(20).mean()
        sd = close.rolling(20).std()
        bb_up = ma + 2 * sd
        bb_low = ma - 2 * sd
        bandwidth = (bb_up - bb_low) / ma.replace(0, 1e-9)
        # Shift the reference averages by 1 so the evaluated candle is compared
        # against the PRIOR 20 bars, not a window that includes itself (which
        # dampens its own spike/squeeze signal).
        avg_bandwidth = bandwidth.shift(1).rolling(20).mean()

        # 2. Volume Spike Calculation (using real_volume or fallback to tick_volume)
        volume = df["real_volume"] if ("real_volume" in df and df["real_volume"].sum() > 0) else df["tick_volume"]
        avg_volume = volume.shift(1).rolling(20).mean()

        last_idx = -2
        last_close = close.iloc[last_idx]
        last_open = open_p.iloc[last_idx]
        last_bandwidth = bandwidth.iloc[last_idx]
        last_avg_bandwidth = avg_bandwidth.iloc[last_idx]
        last_volume = volume.iloc[last_idx]
        last_avg_volume = avg_volume.iloc[last_idx]
        last_rsi = snap.rsi

        bull_reasons = []
        bear_reasons = []
        action = Action.HOLD
        confidence = 0.0

        # Condition 1: Volatility contraction (Squeeze)
        is_squeezed = last_bandwidth <= last_avg_bandwidth * 1.05

        # Condition 2: Volume spike (Volume is at least 1.5x of the 20-period average volume)
        is_volume_spike = last_volume >= 1.5 * last_avg_volume

        # Condition 3: Breakout confirmation (close on the correct side of SMA 20
        # with a matching-color candle)
        is_above_sma = last_close > ma.iloc[last_idx]
        is_below_sma = last_close < ma.iloc[last_idx]
        is_green_candle = last_close > last_open
        is_red_candle = last_close < last_open

        # Condition 4: RSI is in a sweet spot — gaining momentum but not yet
        # overbought (bull) / losing momentum but not yet oversold (bear).
        # The bear band [35, 52] mirrors the bull band [48, 65] around RSI 50.
        is_momentum_sweet = last_rsi is not None and 48 <= last_rsi <= 65
        is_momentum_weak = last_rsi is not None and 35 <= last_rsi <= 52

        if is_squeezed and is_volume_spike and is_above_sma and is_green_candle and is_momentum_sweet:
            action = Action.BUY
            confidence = 0.90
            bull_reasons.append("Bollinger Bands บีบตัวสะสมพลังงาน (Squeeze)")
            bull_reasons.append(f"เกิดวอลลุ่มซื้อทะลักหนาแน่น {last_volume / last_avg_volume:.1f}x ของค่าเฉลี่ย (Volume Spike)")
            bull_reasons.append("ราคายืนเหนือเส้นเฉลี่ยกลาง SMA 20 (เปลี่ยนเป็นขาขึ้น)")
            bull_reasons.append(f"RSI แข็งแกร่งเข้าสู่โซนโมเมนตัม ({last_rsi:.0f}) แต่ยังไม่โอเวอร์บ็อท")
        elif is_squeezed and is_volume_spike and is_below_sma and is_red_candle and is_momentum_weak:
            action = Action.SELL
            confidence = 0.90
            bear_reasons.append("Bollinger Bands บีบตัวสะสมพลังงาน (Squeeze)")
            bear_reasons.append(f"เกิดวอลลุ่มขายทะลักหนาแน่น {last_volume / last_avg_volume:.1f}x ของค่าเฉลี่ย (Volume Spike)")
            bear_reasons.append("ราคาหลุดเส้นเฉลี่ยกลาง SMA 20 (เปลี่ยนเป็นขาลง)")
            bear_reasons.append(f"RSI อ่อนแรงเข้าสู่โซนโมเมนตัมขาลง ({last_rsi:.0f}) แต่ยังไม่โอเวอร์โซลด์")
        else:
            if is_squeezed:
                bull_reasons.append("ตลาดบีบตัวพักฐานแคบ (Bollinger Squeeze)")
            if is_volume_spike:
                bull_reasons.append("เริ่มมีวอลลุ่มหนาแน่นเข้ามาในตลาด")
            if last_rsi is not None:
                if last_rsi > 65:
                    bear_reasons.append(f"RSI ค่อนข้างแพงแล้ว ({last_rsi:.0f})")
                elif last_rsi < 45:
                    bear_reasons.append(f"RSI ค่อนข้างอ่อนแอ ({last_rsi:.0f})")

        sig = StrategySignal(
            action=action,
            confidence=confidence if action != Action.HOLD else round(0.5, 2),
            reasons=bull_reasons if action == Action.BUY else (bear_reasons if action == Action.SELL else (bull_reasons + bear_reasons))
        )
        sig.stop_loss, sig.take_profit = self.atr_levels(snap, sig.action)
        return sig


@register
class AdaptiveTrendStrategy(Strategy):
    """Regime-aware adaptive trend strategy for liquid H1/H4 markets.

    It trades three explicit setups instead of voting on unrelated indicators:
    trend pullbacks, confirmed breakouts, and rare range reversals.  Every
    calculation uses the last closed candle (-2) and excludes it from breakout
    lookbacks to avoid look-ahead bias. Formerly "crypto_regime"; backtests show
    it fits gold/forex/stocks, so it's open to all groups.
    """

    name = "adaptive_trend"
    groups = ("crypto", "gold", "forex", "stock")
    description = (
        "กลยุทธ์ปรับตามสภาวะตลาด (regime-aware): ตามเทรนด์เมื่อ ADX แข็งแรง, "
        "เข้า breakout ที่มี volume ยืนยัน และเล่นกลับตัวเฉพาะกรอบที่ชัดเจน "
        "พร้อม SL ตาม ATR/โครงสร้างราคา ใช้ได้ทั้ง crypto / gold / forex / หุ้น"
    )

    @staticmethod
    def _adx(df: pd.DataFrame, period: int = 14) -> pd.Series:
        high, low, close = df["high"], df["low"], df["close"]
        up_move = high.diff()
        down_move = -low.diff()
        plus_dm = up_move.where((up_move > down_move) & (up_move > 0), 0.0)
        minus_dm = down_move.where((down_move > up_move) & (down_move > 0), 0.0)
        prev_close = close.shift(1)
        tr = pd.concat(
            [high - low, (high - prev_close).abs(), (low - prev_close).abs()],
            axis=1,
        ).max(axis=1)
        atr = tr.ewm(alpha=1 / period, adjust=False).mean().replace(0, float("nan"))
        plus_di = 100 * plus_dm.ewm(alpha=1 / period, adjust=False).mean() / atr
        minus_di = 100 * minus_dm.ewm(alpha=1 / period, adjust=False).mean() / atr
        dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, float("nan"))
        return dx.ewm(alpha=1 / period, adjust=False).mean()

    def evaluate(self, df: pd.DataFrame, snap: IndicatorSnapshot) -> StrategySignal:
        if len(df) < 200:
            return StrategySignal(action=Action.HOLD, confidence=0.0)

        close, high, low, open_p = (
            df["close"], df["high"], df["low"], df["open"]
        )
        ema20 = close.ewm(span=20, adjust=False).mean()
        ema50 = close.ewm(span=50, adjust=False).mean()
        ema200 = close.ewm(span=200, adjust=False).mean()
        adx_s = self._adx(df)
        ma20 = close.rolling(20).mean()
        sd20 = close.rolling(20).std()
        bb_up, bb_low = ma20 + 2 * sd20, ma20 - 2 * sd20

        volume = (
            df["real_volume"]
            if "real_volume" in df and df["real_volume"].sum() > 0
            else df["tick_volume"]
        )
        prior_volume = volume.shift(1).rolling(20).mean()

        i, prev = -2, -3
        price = float(close.iloc[i])
        atr = float(snap.atr or price * 0.01)
        adx = float(adx_s.iloc[i]) if not pd.isna(adx_s.iloc[i]) else 0.0
        rsi = float(snap.rsi) if snap.rsi is not None else 50.0
        avg_vol = float(prior_volume.iloc[i]) if not pd.isna(prior_volume.iloc[i]) else 0.0
        vol_ratio = float(volume.iloc[i]) / avg_vol if avg_vol > 0 else 1.0
        green = close.iloc[i] > open_p.iloc[i]
        red = close.iloc[i] < open_p.iloc[i]

        # Exclude both the forming candle (-1) and evaluated candle (-2).
        prior_high = float(high.iloc[-22:-2].max())
        prior_low = float(low.iloc[-22:-2].min())
        ema50_slope = float(ema50.iloc[i] - ema50.iloc[-7])

        bull_trend = (
            price > ema200.iloc[i]
            and ema50.iloc[i] > ema200.iloc[i]
            and ema50_slope > 0
            and adx >= 20
        )
        bear_trend = (
            price < ema200.iloc[i]
            and ema50.iloc[i] < ema200.iloc[i]
            and ema50_slope < 0
            and adx >= 20
        )

        # Crypto breakouts are especially vulnerable to spread and false
        # breaks. Require a mature trend plus genuinely exceptional volume.
        bull_breakout = (
            settings.crypto_breakout_enabled
            and bull_trend and adx >= 25 and price > prior_high and green and vol_ratio >= 1.30
        )
        bear_breakout = (
            settings.crypto_breakout_enabled
            and bear_trend and adx >= 25 and price < prior_low and red and vol_ratio >= 1.30
        )

        bull_pullback = (
            bull_trend
            and low.iloc[i] <= ema20.iloc[i] * 1.003
            and price > ema20.iloc[i]
            and close.iloc[prev] <= ema20.iloc[prev] * 1.006
            and green
            and vol_ratio >= 0.30
            and 42 <= rsi <= 68
        )
        bear_pullback = (
            bear_trend
            and high.iloc[i] >= ema20.iloc[i] * 0.997
            and price < ema20.iloc[i]
            and close.iloc[prev] >= ema20.iloc[prev] * 0.994
            and red
            and vol_ratio >= 0.30
            and 32 <= rsi <= 58
        )

        ranging = adx < 18 and abs(float(ema50.iloc[i] - ema200.iloc[i])) <= 1.5 * atr
        bull_range = (
            ranging
            and close.iloc[prev] < bb_low.iloc[prev]
            and price > bb_low.iloc[i]
            and green
            and rsi <= 42
        )
        bear_range = (
            ranging
            and close.iloc[prev] > bb_up.iloc[prev]
            and price < bb_up.iloc[i]
            and red
            and rsi >= 58
        )

        action = Action.HOLD
        setup = ""
        if bull_breakout:
            action, setup = Action.BUY, "breakout"
        elif bear_breakout:
            action, setup = Action.SELL, "breakout"
        elif bull_pullback:
            action, setup = Action.BUY, "trend pullback"
        elif bear_pullback:
            action, setup = Action.SELL, "trend pullback"
        elif bull_range:
            action, setup = Action.BUY, "range reversal"
        elif bear_range:
            action, setup = Action.SELL, "range reversal"

        if action == Action.HOLD:
            regime = "trend" if bull_trend or bear_trend else ("range" if ranging else "transition")
            return StrategySignal(
                action=Action.HOLD,
                confidence=round(min(0.65, 0.25 + adx / 100), 2),
                reasons=[f"regime={regime}", f"ADX {adx:.1f}", f"volume {vol_ratio:.2f}x"],
            )

        base_confidence = 0.72 if setup == "range reversal" else 0.76
        confidence = self._clamp(base_confidence + min(adx, 40) / 250 + min(vol_ratio, 2) / 20, 0.0, 0.94)

        # Structure-aware stop, bounded to avoid both noise-tight and runaway SL.
        if setup == "range reversal":
            sl_distance = 1.4 * atr
        elif action == Action.BUY:
            structure_distance = max(0.0, price - float(low.iloc[-7:-1].min()))
            sl_distance = min(max(settings.crypto_atr_sl_mult * atr, structure_distance), 2.8 * atr)
        else:
            structure_distance = max(0.0, float(high.iloc[-7:-1].max()) - price)
            sl_distance = min(max(settings.crypto_atr_sl_mult * atr, structure_distance), 2.8 * atr)

        # Floor the SL so a shrunk ATR can't leave a stop too tight for spread.
        sl_distance = floor_sl_distance(snap.symbol, price, sl_distance)

        if action == Action.BUY:
            stop_loss = price - sl_distance
            take_profit = price + sl_distance * settings.crypto_rr
        else:
            stop_loss = price + sl_distance
            take_profit = price - sl_distance * settings.crypto_rr

        return StrategySignal(
            action=action,
            confidence=round(confidence, 2),
            reasons=[setup, f"ADX {adx:.1f}", f"volume {vol_ratio:.2f}x", f"RSI {rsi:.0f}"],
            stop_loss=round(stop_loss, 6),
            take_profit=round(take_profit, 6),
        )


@register
class ForexTrendPullbackStrategy(Strategy):
    """Selective H1 Forex trend-pullback with DMI confirmation.

    The old Forex strategy fired on small disagreements between EMA/MACD/RSI
    and spent roughly two thirds of the test period exposed.  This setup only
    enters after an established EMA trend pulls back and a closed candle
    reclaims EMA20 with directional strength.  It intentionally trades less.
    """

    name = "forex_trend_pullback"
    groups = ("forex",)
    description = (
        "Forex H1 แบบคัดจังหวะ: EMA 20/50/200 ยืนยันเทรนด์, ADX/DMI ยืนยันแรงส่ง "
        "และเข้าหลังราคาย่อแล้วเกิดแท่งกลับมายืนเหนือ/ใต้ EMA20 พร้อม SL ตาม ATR และโครงสร้าง"
    )

    @staticmethod
    def _dmi(df: pd.DataFrame, period: int = 14) -> tuple[pd.Series, pd.Series, pd.Series]:
        high, low, close = df["high"], df["low"], df["close"]
        up_move = high.diff()
        down_move = -low.diff()
        plus_dm = up_move.where((up_move > down_move) & (up_move > 0), 0.0)
        minus_dm = down_move.where((down_move > up_move) & (down_move > 0), 0.0)
        prev_close = close.shift(1)
        tr = pd.concat(
            [high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1
        ).max(axis=1)
        atr = tr.ewm(alpha=1 / period, adjust=False).mean().replace(0, float("nan"))
        plus_di = 100 * plus_dm.ewm(alpha=1 / period, adjust=False).mean() / atr
        minus_di = 100 * minus_dm.ewm(alpha=1 / period, adjust=False).mean() / atr
        dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, float("nan"))
        adx = dx.ewm(alpha=1 / period, adjust=False).mean()
        return adx, plus_di, minus_di

    def evaluate(self, df: pd.DataFrame, snap: IndicatorSnapshot) -> StrategySignal:
        if len(df) < 220:
            return StrategySignal(action=Action.HOLD, confidence=0.0)

        close, open_p, high, low = df["close"], df["open"], df["high"], df["low"]
        ema20 = close.ewm(span=20, adjust=False).mean()
        ema50 = close.ewm(span=50, adjust=False).mean()
        ema200 = close.ewm(span=200, adjust=False).mean()
        adx_s, plus_di_s, minus_di_s = self._dmi(df)

        i, prev = -2, -3
        price = float(close.iloc[i])
        atr = float(snap.atr or price * 0.001)
        if atr <= 0 or any(pd.isna(x.iloc[i]) for x in (ema20, ema50, ema200, adx_s)):
            return StrategySignal(action=Action.HOLD, confidence=0.0)

        adx = float(adx_s.iloc[i])
        plus_di = float(plus_di_s.iloc[i])
        minus_di = float(minus_di_s.iloc[i])
        rsi = float(snap.rsi) if snap.rsi is not None else 50.0
        body = abs(float(close.iloc[i] - open_p.iloc[i]))
        candle_range = float(high.iloc[i] - low.iloc[i])
        ema50_slope = float(ema50.iloc[i] - ema50.iloc[-12])

        uptrend = (
            ema20.iloc[i] > ema50.iloc[i] > ema200.iloc[i]
            and ema50_slope > 0
            and adx >= 18
            and plus_di > minus_di
        )
        downtrend = (
            ema20.iloc[i] < ema50.iloc[i] < ema200.iloc[i]
            and ema50_slope < 0
            and adx >= 18
            and minus_di > plus_di
        )

        # Previous candle reaches the fast EMA; the evaluated closed candle
        # then reclaims it with a meaningful body.  The forming candle (-1) is
        # never used.
        bull_reclaim = (
            low.iloc[prev] <= ema20.iloc[prev] + 0.15 * atr
            and price > ema20.iloc[i]
            and price > open_p.iloc[i]
            and price >= high.iloc[prev]
        )
        bear_reclaim = (
            high.iloc[prev] >= ema20.iloc[prev] - 0.15 * atr
            and price < ema20.iloc[i]
            and price < open_p.iloc[i]
            and price <= low.iloc[prev]
        )
        quality_candle = body >= 0.20 * atr and candle_range <= 2.20 * atr
        near_value = abs(price - float(ema20.iloc[i])) <= 0.90 * atr

        action = Action.HOLD
        if uptrend and bull_reclaim and quality_candle and near_value and 45 <= rsi <= 65:
            action = Action.BUY
        elif downtrend and bear_reclaim and quality_candle and near_value and 35 <= rsi <= 55:
            action = Action.SELL

        if action == Action.HOLD:
            regime = "uptrend" if uptrend else ("downtrend" if downtrend else "no trend")
            return StrategySignal(
                action=Action.HOLD,
                confidence=round(min(0.65, 0.25 + adx / 100), 2),
                reasons=[regime, f"ADX {adx:.1f}", f"DMI +{plus_di:.1f}/-{minus_di:.1f}", f"RSI {rsi:.0f}"],
            )

        if action == Action.BUY:
            structure = price - float(low.iloc[-7:-1].min()) + 0.10 * atr
        else:
            structure = float(high.iloc[-7:-1].max()) - price + 0.10 * atr
        sl_distance = min(max(1.25 * atr, structure), 2.20 * atr)
        sl_distance = floor_sl_distance(snap.symbol, price, sl_distance)
        rr = max(1.5, float(settings.forex_rr))
        if action == Action.BUY:
            stop_loss, take_profit = price - sl_distance, price + sl_distance * rr
        else:
            stop_loss, take_profit = price + sl_distance, price - sl_distance * rr

        confidence = self._clamp(0.68 + min(adx, 40) / 250 + abs(plus_di - minus_di) / 250)
        return StrategySignal(
            action=action,
            confidence=round(confidence, 2),
            reasons=["EMA trend pullback reclaim", f"ADX {adx:.1f}", f"DMI +{plus_di:.1f}/-{minus_di:.1f}", f"RSI {rsi:.0f}"],
            stop_loss=round(stop_loss, 6),
            take_profit=round(take_profit, 6),
        )


@register
class ForexIntradayStrategy(Strategy):
    """M15 Forex pullback/reclaim designed for short, repeatable trades."""

    name = "forex_intraday"
    groups = ("forex",)
    max_hold_bars = 16  # 4 hours on M15
    description = (
        "Forex M15 ถือสั้น: EMA 9/21/50 กรองทิศทาง, ADX/DMI ยืนยันแรงส่ง, "
        "เข้าเมื่อราคาย่อแล้วกลับมายืน EMA9 ในช่วง London/NY พร้อม time-stop 4 ชั่วโมง"
    )
    SL_ATR = 1.0
    RR = 1.4

    def evaluate(self, df: pd.DataFrame, snap: IndicatorSnapshot) -> StrategySignal:
        if len(df) < 100:
            return StrategySignal(action=Action.HOLD, confidence=0.0)

        close, open_p, high, low = df["close"], df["open"], df["high"], df["low"]
        ema9 = close.ewm(span=9, adjust=False).mean()
        ema21 = close.ewm(span=21, adjust=False).mean()
        ema50 = close.ewm(span=50, adjust=False).mean()
        adx_s, plus_di_s, minus_di_s = ForexTrendPullbackStrategy._dmi(df)
        i, prev = -2, -3
        price = float(close.iloc[i])
        atr = float(snap.atr or price * 0.0008)
        if atr <= 0 or pd.isna(adx_s.iloc[i]):
            return StrategySignal(action=Action.HOLD, confidence=0.0)

        # MT5 rates are normalized to Bangkok wall time by get_rates(). Avoid
        # the thin rollover/early-Asia window; London through New York supplies
        # tighter spreads and enough movement for a short target.
        if "time" in df:
            hour = pd.Timestamp(df["time"].iloc[i]).hour
            if not 13 <= hour <= 23:
                return StrategySignal(action=Action.HOLD, confidence=0.25, reasons=["outside liquid session"])

        adx = float(adx_s.iloc[i])
        plus_di, minus_di = float(plus_di_s.iloc[i]), float(minus_di_s.iloc[i])
        rsi = float(snap.rsi) if snap.rsi is not None else 50.0
        green, red = close.iloc[i] > open_p.iloc[i], close.iloc[i] < open_p.iloc[i]
        body = abs(float(close.iloc[i] - open_p.iloc[i]))
        candle_range = float(high.iloc[i] - low.iloc[i])

        bull_trend = (
            ema9.iloc[i] > ema21.iloc[i] > ema50.iloc[i]
            and ema21.iloc[i] > ema21.iloc[-7]
            and adx >= 15 and plus_di > minus_di
        )
        bear_trend = (
            ema9.iloc[i] < ema21.iloc[i] < ema50.iloc[i]
            and ema21.iloc[i] < ema21.iloc[-7]
            and adx >= 15 and minus_di > plus_di
        )
        bull_reclaim = (
            low.iloc[prev] <= ema9.iloc[prev] + 0.10 * atr
            and close.iloc[prev] <= ema9.iloc[prev] + 0.35 * atr
            and price > ema9.iloc[i] and green
            and price > close.iloc[prev]
        )
        bear_reclaim = (
            high.iloc[prev] >= ema9.iloc[prev] - 0.10 * atr
            and close.iloc[prev] >= ema9.iloc[prev] - 0.35 * atr
            and price < ema9.iloc[i] and red
            and price < close.iloc[prev]
        )
        quality = body >= 0.12 * atr and candle_range <= 2.0 * atr
        near_entry = abs(price - float(ema9.iloc[i])) <= 0.65 * atr

        action = Action.HOLD
        if bull_trend and bull_reclaim and quality and near_entry and 48 <= rsi <= 68:
            action = Action.BUY
        elif bear_trend and bear_reclaim and quality and near_entry and 32 <= rsi <= 52:
            action = Action.SELL
        if action == Action.HOLD:
            regime = "up" if bull_trend else ("down" if bear_trend else "flat")
            return StrategySignal(
                action=Action.HOLD, confidence=round(min(0.62, 0.25 + adx / 120), 2),
                reasons=[f"intraday regime={regime}", f"ADX {adx:.1f}", f"RSI {rsi:.0f}"],
            )

        if action == Action.BUY:
            structure = price - float(low.iloc[-5:-1].min()) + 0.05 * atr
        else:
            structure = float(high.iloc[-5:-1].max()) - price + 0.05 * atr
        sl_distance = min(max(self.SL_ATR * atr, structure), 1.6 * atr)
        sl_distance = floor_sl_distance(snap.symbol, price, sl_distance)
        if action == Action.BUY:
            stop_loss, take_profit = price - sl_distance, price + sl_distance * self.RR
        else:
            stop_loss, take_profit = price + sl_distance, price - sl_distance * self.RR
        confidence = self._clamp(0.66 + min(adx, 35) / 260 + abs(plus_di - minus_di) / 300)
        return StrategySignal(
            action=action, confidence=round(confidence, 2),
            reasons=["M15 EMA reclaim", f"ADX {adx:.1f}", f"DMI +{plus_di:.1f}/-{minus_di:.1f}", f"RSI {rsi:.0f}", "time-stop 4h"],
            stop_loss=round(stop_loss, 6), take_profit=round(take_profit, 6),
        )


@register
class CryptoScalpStrategy(Strategy):
    """Short-hold mean-reversion scalp for crypto on XM.

    Crypto CFDs on XM carry a punishing overnight swap (~4%/night), so any
    strategy that holds for days loses to swap no matter how good the entry.
    This one is built to get IN and OUT fast: fade a stretched move (RSI extreme
    at the outer Bollinger band) with a tight ATR-based stop and a ~1:1 target,
    so trades resolve in a handful of bars and rarely cross a night.

    Deliberately bypasses the crypto SL floor (CRYPTO_MIN_SL_PCT) — that floor
    exists to keep swing stops above spread, but it would force a wide stop here
    and defeat the whole point. Use it on a low timeframe (M5/M15) and pair it
    with a time-stop in the worker to guarantee no overnight hold.
    """

    name = "crypto_scalp"
    description = (
        "สแกลป์ crypto ถือสั้น: รอราคายืดสุดโต่ง (RSI + Bollinger) แล้วเข้าสวนด้วย "
        "SL/TP แคบ ปิดไว เลี่ยง swap ข้ามคืน เหมาะกับ TF ต่ำ (M5/M15)"
    )
    groups = ("crypto",)

    # Tight, swap-aware levels (not user ATR mults, which are tuned for swing).
    SL_ATR_MULT = 0.9
    RR = 1.1
    RSI_LOW = 28.0
    RSI_HIGH = 72.0

    def evaluate(self, df, snap) -> StrategySignal:
        price = snap.price
        atr = snap.atr or (price * 0.005)
        rsi = snap.rsi
        if rsi is None or snap.bb_lower is None or snap.bb_upper is None or atr <= 0:
            return StrategySignal(action=Action.HOLD, confidence=0.0)

        action = Action.HOLD
        reasons: List[str] = []
        # Buy a washed-out dip: oversold RSI at/under the lower band.
        if rsi <= self.RSI_LOW and price <= snap.bb_lower:
            action = Action.BUY
            strength = self._clamp((self.RSI_LOW - rsi) / 18)
            reasons = [f"RSI {rsi:.0f} oversold", "at lower band"]
        # Sell a blow-off: overbought RSI at/over the upper band.
        elif rsi >= self.RSI_HIGH and price >= snap.bb_upper:
            action = Action.SELL
            strength = self._clamp((rsi - self.RSI_HIGH) / 18)
            reasons = ["RSI overbought", "at upper band"]
        else:
            return StrategySignal(action=Action.HOLD, confidence=round(self._clamp(0.0), 2))

        # Tight levels, computed directly (NOT through floor_sl_distance).
        sl_distance = self.SL_ATR_MULT * atr
        if action == Action.BUY:
            stop_loss = price - sl_distance
            take_profit = price + sl_distance * self.RR
        else:
            stop_loss = price + sl_distance
            take_profit = price - sl_distance * self.RR

        return StrategySignal(
            action=action,
            confidence=round(self._clamp(0.4 + 0.5 * strength), 2),
            reasons=reasons + [f"scalp SL {self.SL_ATR_MULT}xATR RR {self.RR}"],
            stop_loss=round(stop_loss, 6),
            take_profit=round(take_profit, 6),
        )

