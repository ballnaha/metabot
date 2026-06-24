"""Technical indicators computed directly from OHLC data with pandas/numpy.

Implemented in-house (no pandas-ta runtime dependency) so the numbers are
transparent and the package versions never break the build.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .models import IndicatorSnapshot


def ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    macd_line = ema(close, fast) - ema(close, slow)
    signal_line = ema(macd_line, signal)
    hist = macd_line - signal_line
    return macd_line, signal_line, hist


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high, low, close = df["high"], df["low"], df["close"]
    prev_close = close.shift(1)
    tr = pd.concat(
        [high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1
    ).max(axis=1)
    return tr.ewm(alpha=1 / period, adjust=False).mean()


def bollinger(close: pd.Series, period: int = 20, mult: float = 2.0):
    ma = close.rolling(period).mean()
    sd = close.rolling(period).std()
    return ma + mult * sd, ma - mult * sd


def compute(df: pd.DataFrame, symbol: str, timeframe: str) -> IndicatorSnapshot:
    """Compute the full indicator snapshot for the latest closed candle."""
    close = df["close"]
    rsi_s = rsi(close)
    macd_line, signal_line, hist = macd(close)
    ema_fast = ema(close, 12)
    ema_slow = ema(close, 26)
    atr_s = atr(df)
    bb_up, bb_low = bollinger(close)

    last = -1

    def val(s: pd.Series):
        v = s.iloc[last]
        return None if pd.isna(v) else float(v)

    return IndicatorSnapshot(
        symbol=symbol,
        timeframe=timeframe,
        price=float(close.iloc[last]),
        rsi=val(rsi_s),
        macd=val(macd_line),
        macd_signal=val(signal_line),
        macd_hist=val(hist),
        ema_fast=val(ema_fast),
        ema_slow=val(ema_slow),
        atr=val(atr_s),
        bb_upper=val(bb_up),
        bb_lower=val(bb_low),
    )
