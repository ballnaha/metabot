"""Shared pydantic models used across the API, advisor and trader."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import List, Optional

_TZ_TH = timezone(timedelta(hours=7))


def _now_th() -> datetime:
    return datetime.now(_TZ_TH)

from pydantic import BaseModel, Field


class Action(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


class IndicatorSnapshot(BaseModel):
    """Latest values of the technical indicators for one symbol/timeframe."""

    symbol: str
    timeframe: str
    price: float
    rsi: Optional[float] = None
    macd: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_hist: Optional[float] = None
    ema_fast: Optional[float] = None
    ema_slow: Optional[float] = None
    atr: Optional[float] = None
    bb_upper: Optional[float] = None
    bb_lower: Optional[float] = None
    # Signal produced by the selected trading strategy (see strategy.py)
    rule_bias: Action = Action.HOLD
    rule_reasons: List[str] = Field(default_factory=list)
    strategy_name: str = "none"
    strategy_confidence: float = 0.5
    strategy_sl: Optional[float] = None
    strategy_tp: Optional[float] = None


class StrategySignal(BaseModel):
    """Output of a Strategy.evaluate() call."""

    action: Action = Action.HOLD
    confidence: float = 0.0  # 0..1
    reasons: List[str] = Field(default_factory=list)
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None


class AIOpinion(BaseModel):
    """One AI provider's view."""

    provider: str
    action: Action = Action.HOLD
    confidence: float = 0.0  # 0..1
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    reasoning: str = ""
    error: Optional[str] = None


class Recommendation(BaseModel):
    """Final, merged recommendation shown to the user."""

    symbol: str
    timeframe: str
    price: float
    action: Action
    confidence: float
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    # Live mid-price captured when the signal was decided. Used to measure true
    # decision->fill drift, instead of the much older closed-candle price.
    signal_ref_price: Optional[float] = None
    suggested_lot: Optional[float] = None
    # Broker contract size for the symbol, so clients can show the position's
    # notional value (lot × price × contract_size) before confirming.
    contract_size: Optional[float] = None
    summary: str = ""
    indicators: IndicatorSnapshot
    opinions: List[AIOpinion] = Field(default_factory=list)
    ai_used: bool = False
    # "" | "confirmed" | "filtered" | "unavailable" — how AI affected the call
    ai_verdict: str = ""
    created_at: datetime = Field(default_factory=_now_th)


class PendingTrade(BaseModel):
    """A trade awaiting user confirmation."""

    id: str
    recommendation: Recommendation
    lot: float
    status: str = "pending"  # pending | confirmed | cancelled | executed | failed
    created_at: datetime = Field(default_factory=_now_th)
    result: Optional[dict] = None


class AnalyzeRequest(BaseModel):
    symbol: str
    timeframe: Optional[str] = None
    bars: int = 200
    strategy: Optional[str] = None  # override the default strategy by name
    use_ai: Optional[bool] = None  # override AI filter on/off for this call
    preview: bool = False  # when true, analyze only and do not place a trade