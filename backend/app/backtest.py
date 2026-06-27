"""Small, conservative OHLC backtester used to validate built-in strategies.

Signals are generated from candle i only after it is closed, execution happens
at candle i+1 open, and a bar touching both SL and TP is counted as SL.  MT5
crypto candles are bid-based, so spread is added to BUY entries and SELL exits.
Results are expressed in R to compare symbols with different contract sizes.
"""
from __future__ import annotations

from typing import Any

import pandas as pd

from . import indicators, strategy
from .models import Action


def backtest_strategy(
    df: pd.DataFrame,
    symbol: str,
    timeframe: str,
    strategy_name: str,
    *,
    spread_price: float = 0.0,
    warmup_bars: int = 220,
    max_hold_bars: int = 96,
    max_spread_to_sl: float = 0.25,
    max_entry_drift_to_sl: float = 0.50,
) -> dict[str, Any]:
    trades: list[dict[str, Any]] = []
    rejected_spread = 0
    rejected_drift = 0
    i = max(50, warmup_bars)

    while i < len(df) - 1:
        # Include i+1 only as the forming candle expected by indicators.compute;
        # all strategy calculations explicitly evaluate -2 (candle i).
        view = df.iloc[: i + 2]
        snap = indicators.compute(view, symbol, timeframe)
        sig = strategy.apply(view, snap, strategy_name)
        if sig.action == Action.HOLD or not sig.stop_loss or not sig.take_profit:
            i += 1
            continue

        signal_price = float(snap.price)
        sl_distance = abs(signal_price - float(sig.stop_loss))
        tp_distance = abs(float(sig.take_profit) - signal_price)
        if sl_distance <= 0 or tp_distance <= 0:
            i += 1
            continue

        entry_i = i + 1
        entry_bid = float(df["open"].iloc[entry_i])
        if max_spread_to_sl and spread_price / sl_distance > max_spread_to_sl:
            rejected_spread += 1
            i += 1
            continue
        if max_entry_drift_to_sl and abs(entry_bid - signal_price) / sl_distance > max_entry_drift_to_sl:
            rejected_drift += 1
            i += 1
            continue
        if sig.action == Action.BUY:
            entry = entry_bid + spread_price
            stop_loss = entry - sl_distance
            take_profit = entry + tp_distance
        else:
            entry = entry_bid
            stop_loss = entry + sl_distance
            take_profit = entry - tp_distance

        last_i = min(len(df) - 1, entry_i + max_hold_bars - 1)
        exit_i = last_i
        exit_price = None
        reason = "timeout"

        for j in range(entry_i, last_i + 1):
            bar_low = float(df["low"].iloc[j])
            bar_high = float(df["high"].iloc[j])
            if sig.action == Action.BUY:
                hit_sl = bar_low <= stop_loss
                hit_tp = bar_high >= take_profit
            else:
                # A short closes by buying at ask, approximated as bid + spread.
                hit_sl = bar_high + spread_price >= stop_loss
                hit_tp = bar_low + spread_price <= take_profit

            if hit_sl:  # conservative when both levels occur in one candle
                exit_i, exit_price, reason = j, stop_loss, "sl"
                break
            if hit_tp:
                exit_i, exit_price, reason = j, take_profit, "tp"
                break

        if exit_price is None:
            exit_bid = float(df["close"].iloc[exit_i])
            exit_price = exit_bid if sig.action == Action.BUY else exit_bid + spread_price

        pnl_distance = (
            exit_price - entry
            if sig.action == Action.BUY
            else entry - exit_price
        )
        r_multiple = pnl_distance / sl_distance
        trades.append(
            {
                "signal_index": i,
                "entry_index": entry_i,
                "exit_index": exit_i,
                "action": sig.action.value,
                "setup": sig.reasons[0] if sig.reasons else "",
                "reason": reason,
                "r": round(r_multiple, 4),
            }
        )
        i = exit_i + 1

    rs = [t["r"] for t in trades]
    wins = [r for r in rs if r > 0]
    losses = [r for r in rs if r <= 0]
    gross_profit = sum(wins)
    gross_loss = abs(sum(losses))
    equity = peak = max_drawdown = 0.0
    for r in rs:
        equity += r
        peak = max(peak, equity)
        max_drawdown = max(max_drawdown, peak - equity)

    return {
        "strategy": strategy_name,
        "symbol": symbol,
        "trades": len(trades),
        "wins": len(wins),
        "win_rate": round(len(wins) / len(trades), 4) if trades else 0.0,
        "net_r": round(sum(rs), 4),
        "profit_factor": round(gross_profit / gross_loss, 4) if gross_loss else 0.0,
        "max_drawdown_r": round(max_drawdown, 4),
        "rejected_spread": rejected_spread,
        "rejected_drift": rejected_drift,
        "details": trades,
    }
