"""Small, conservative OHLC backtester used to validate built-in strategies.

Signals are generated from candle i only after it is closed, execution happens
at candle i+1 open, and a bar touching both SL and TP is counted as SL.  MT5
crypto candles are bid-based, so spread is added to BUY entries and SELL exits.
Results are expressed in R to compare symbols with different contract sizes.
"""
from __future__ import annotations

from typing import Any

import pandas as pd

from . import indicators, mt5_client, strategy
from .config import settings
from .market_groups import market_group
from .models import Action


# Hours per candle, used to convert a holding period (in bars) into the number
# of nights a swap is charged for.
_TIMEFRAME_HOURS = {
    "M1": 1 / 60, "M5": 5 / 60, "M15": 0.25, "M30": 0.5,
    "H1": 1.0, "H4": 4.0, "D1": 24.0, "W1": 168.0,
}


def _compute_metrics(trades: list[dict[str, Any]], total_bars: int) -> dict[str, Any]:
    """Professional performance metrics derived from the per-trade R results.

    Everything is in R (risk units) so it stays lot/equity-independent. These
    are the numbers a discretionary or systematic trader actually evaluates:
    expectancy (edge per trade), risk-adjusted return (per-trade Sharpe), the
    win/loss profile, the worst losing streak (risk of ruin), and how long /
    how much of the time capital is exposed.
    """
    n = len(trades)
    if n == 0:
        return {
            "expectancy_r": 0.0, "avg_win_r": 0.0, "avg_loss_r": 0.0,
            "largest_win_r": 0.0, "largest_loss_r": 0.0,
            "max_consecutive_wins": 0, "max_consecutive_losses": 0,
            "sharpe": 0.0, "avg_bars_held": 0.0, "exposure": 0.0,
        }

    rs = [t["r"] for t in trades]
    wins = [r for r in rs if r > 0]
    losses = [r for r in rs if r <= 0]

    # Risk-adjusted return: mean / std of per-trade R (a per-trade Sharpe).
    mean_r = sum(rs) / n
    if n > 1:
        variance = sum((r - mean_r) ** 2 for r in rs) / (n - 1)
        std_r = variance ** 0.5
    else:
        std_r = 0.0
    sharpe = mean_r / std_r if std_r > 0 else 0.0

    # Worst streaks — drives psychological tolerance and risk of ruin.
    max_win_streak = max_loss_streak = cur_win = cur_loss = 0
    for r in rs:
        if r > 0:
            cur_win += 1
            cur_loss = 0
        else:
            cur_loss += 1
            cur_win = 0
        max_win_streak = max(max_win_streak, cur_win)
        max_loss_streak = max(max_loss_streak, cur_loss)

    bars_held = [t["exit_index"] - t["entry_index"] for t in trades]
    total_held = sum(bars_held)

    return {
        "expectancy_r": round(mean_r, 4),
        "avg_win_r": round(sum(wins) / len(wins), 4) if wins else 0.0,
        "avg_loss_r": round(sum(losses) / len(losses), 4) if losses else 0.0,
        "largest_win_r": round(max(rs), 4),
        "largest_loss_r": round(min(rs), 4),
        "max_consecutive_wins": max_win_streak,
        "max_consecutive_losses": max_loss_streak,
        "sharpe": round(sharpe, 4),
        "avg_bars_held": round(total_held / n, 2),
        # Fraction of the tested bars spent in a position.
        "exposure": round(total_held / total_bars, 4) if total_bars else 0.0,
    }


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
    # ---- Cost model (all per 1.0 lot; converted to R using the trade's SL) ----
    # money risked per 1R per lot = (sl_distance / tick_size) * tick_value.
    tick_size: float = 0.0,
    tick_value: float = 0.0,
    commission_per_lot: float = 0.0,   # round-turn $/lot (entry + exit)
    swap_long_per_lot: float = 0.0,    # $/lot/night when long
    swap_short_per_lot: float = 0.0,   # $/lot/night when short
) -> dict[str, Any]:
    trades: list[dict[str, Any]] = []
    rejected_spread = 0
    rejected_drift = 0
    i = max(50, warmup_bars)

    bar_hours = _TIMEFRAME_HOURS.get(timeframe.upper(), 1.0)
    # Costs only apply when we can value a tick; otherwise they stay at 0 R.
    costs_enabled = tick_size > 0 and tick_value > 0

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
        gross_r = pnl_distance / sl_distance

        # Convert commission + swap (money per 1.0 lot) into R. Money risked per
        # 1R per lot is (sl_distance / tick_size) * tick_value; cost in R is the
        # money cost divided by that — lot cancels, so this is lot-independent.
        # commission is always a positive cost; swap is signed P&L from the
        # broker (negative = charged, positive = credited), so it subtracts from
        # the cost. cost_r > 0 means the trade was made worse by costs.
        cost_r = 0.0
        if costs_enabled:
            money_per_r = (sl_distance / tick_size) * tick_value
            if money_per_r > 0:
                bars_held = exit_i - entry_i
                nights = (bars_held * bar_hours) / 24.0
                swap_rate = swap_long_per_lot if sig.action == Action.BUY else swap_short_per_lot
                cost_money = commission_per_lot - (swap_rate * nights)
                cost_r = cost_money / money_per_r

        r_multiple = gross_r - cost_r
        trades.append(
            {
                "signal_index": i,
                "entry_index": entry_i,
                "exit_index": exit_i,
                "action": sig.action.value,
                "setup": sig.reasons[0] if sig.reasons else "",
                "reason": reason,
                "r": round(r_multiple, 4),
                "gross_r": round(gross_r, 4),
                "cost_r": round(cost_r, 4),
            }
        )
        i = exit_i + 1

    rs = [t["r"] for t in trades]              # net R (after costs)
    wins = [r for r in rs if r > 0]
    losses = [r for r in rs if r <= 0]
    gross_profit = sum(wins)
    gross_loss = abs(sum(losses))
    equity = peak = max_drawdown = 0.0
    for r in rs:
        equity += r
        peak = max(peak, equity)
        max_drawdown = max(max_drawdown, peak - equity)

    total_cost_r = sum(t["cost_r"] for t in trades)

    return {
        "strategy": strategy_name,
        "symbol": symbol,
        "trades": len(trades),
        "wins": len(wins),
        "win_rate": round(len(wins) / len(trades), 4) if trades else 0.0,
        "net_r": round(sum(rs), 4),
        "gross_net_r": round(sum(rs) + total_cost_r, 4),  # before commission/swap
        "total_cost_r": round(total_cost_r, 4),
        "profit_factor": round(gross_profit / gross_loss, 4) if gross_loss else 0.0,
        "max_drawdown_r": round(max_drawdown, 4),
        **_compute_metrics(trades, len(df)),
        "rejected_spread": rejected_spread,
        "rejected_drift": rejected_drift,
        "details": trades,
    }


def run_symbol_backtest(
    symbol: str,
    timeframe: str | None = None,
    strategy_name: str | None = None,
    bars: int = 1000,
    *,
    commission_per_lot: float | None = None,
    spread_points: float | None = None,
    include_details: bool = False,
) -> dict[str, Any]:
    """Fetch live OHLC history from MT5 and backtest one strategy on it.

    Shared by the /api/backtest endpoint and the CLI. Defaults the timeframe,
    strategy and spread/drift caps to the same settings the live bot uses for
    that symbol's market group, so a backtest reflects how the bot would behave.
    Commission (round-turn $/lot) defaults to BACKTEST_COMMISSION_PER_LOT; swap
    rates come from the symbol itself.

    By default the spread is a snapshot of the symbol's current spread. On
    spread-based accounts (e.g. XM Standard) that snapshot may not represent
    typical conditions, so pass ``spread_points`` to model a fixed spread (in
    points) and stress-test the strategy against wider spreads.
    """
    group = market_group(symbol)
    timeframe = timeframe or {
        "crypto": settings.crypto_timeframe,
        "gold": settings.gold_timeframe,
        "forex": settings.forex_timeframe,
        "stock": settings.stock_timeframe,
    }.get(group, settings.default_timeframe)
    strategy_name = strategy_name or {
        "crypto": settings.crypto_strategy,
        "gold": settings.gold_strategy,
        "forex": settings.forex_strategy,
        "stock": settings.stock_strategy,
    }.get(group, settings.strategy)
    if commission_per_lot is None:
        commission_per_lot = settings.backtest_commission_per_lot

    df = mt5_client.get_rates(symbol, timeframe, bars)

    # Pull spread (points) + tick/swap data once; used for both the spread model
    # and the commission/swap cost model.
    try:
        info = mt5_client.symbol_info(symbol)
    except Exception:
        info = {}
    point = float(info.get("point", 0) or 0)
    # spread_points override lets you model a fixed/worse spread; otherwise use
    # the symbol's current spread snapshot.
    spread_pts = spread_points if spread_points is not None else float(info.get("spread", 0) or 0)
    spread_price = spread_pts * point

    max_spread = (
        settings.crypto_max_spread_to_sl if group == "crypto" else settings.max_spread_to_sl
    )

    result = backtest_strategy(
        df,
        symbol,
        timeframe,
        strategy_name,
        spread_price=spread_price,
        max_spread_to_sl=max_spread,
        max_entry_drift_to_sl=settings.max_entry_drift_to_sl,
        tick_size=float(info.get("trade_tick_size", 0) or 0),
        tick_value=float(info.get("trade_tick_value", 0) or 0),
        commission_per_lot=float(commission_per_lot or 0),
        swap_long_per_lot=float(info.get("swap_long", 0) or 0),
        swap_short_per_lot=float(info.get("swap_short", 0) or 0),
    )
    result["timeframe"] = timeframe
    result["bars"] = int(len(df))
    result["spread_points"] = round(spread_pts, 2)
    result["spread_price"] = round(spread_price, 8)
    result["commission_per_lot"] = float(commission_per_lot or 0)
    if not include_details:
        result.pop("details", None)
    return result
