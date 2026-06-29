"""Entry point: backtest strategies from the command line.

Examples
--------
    # One symbol, defaults (timeframe + strategy from settings for its group)
    python run_backtest.py BTCUSD

    # Pick the timeframe / strategy / history length
    python run_backtest.py EURUSD --timeframe H1 --strategy trend --bars 2000

    # Compare every configured symbol (SYMBOLS in .env)
    python run_backtest.py --all

    # Try every built-in strategy on one symbol to see which fits
    python run_backtest.py GOLD --compare-strategies

Results are in R (risk units): net_r is total profit measured in multiples of
the per-trade risk, so symbols with different prices/lots compare directly.
"""
import argparse
import sys

# Force UTF-8 on the console before anything logs — MetaTrader5 returns
# Thai-localized error strings the default Windows codec can't encode.
for _stream in (sys.stdout, sys.stderr):
    _reconfigure = getattr(_stream, "reconfigure", None)
    if _reconfigure is not None:
        try:
            _reconfigure(encoding="utf-8", errors="backslashreplace")
        except Exception:
            pass

from app import backtest, mt5_client, strategy as strategy_mod
from app.config import settings


def _print_row(r: dict) -> None:
    print(
        f"  {r['symbol']:<12} {r.get('strategy', ''):<16} {r.get('timeframe', ''):<5}"
        f" trades={r['trades']:<4} win={r['win_rate']*100:5.1f}%"
        f" net={r['net_r']:+8.2f}R  exp={r.get('expectancy_r', 0.0):+6.3f}R"
        f" PF={r['profit_factor']:5.2f}  maxDD={r['max_drawdown_r']:6.2f}R"
        f" cost={r.get('total_cost_r', 0.0):6.2f}R"
    )


def _print_detail(r: dict) -> None:
    """Full metrics panel, shown when a single symbol/strategy was tested."""
    print(f"  {r['symbol']}  {r.get('strategy', '')}  {r.get('timeframe', '')}"
          f"  ({r.get('bars', 0)} bars, spread {r.get('spread_points', 0)}pt)")
    pairs = [
        ("Trades", f"{r['trades']}  (win {r['win_rate']*100:.1f}%)"),
        ("Net / Gross R", f"{r['net_r']:+.2f}R  /  {r.get('gross_net_r', 0.0):+.2f}R"),
        ("Total cost", f"{r.get('total_cost_r', 0.0):.2f}R"),
        ("Expectancy", f"{r.get('expectancy_r', 0.0):+.3f}R per trade"),
        ("Profit factor", f"{r['profit_factor']:.2f}"),
        ("Sharpe (per-trade)", f"{r.get('sharpe', 0.0):+.2f}"),
        ("Avg win / loss", f"{r.get('avg_win_r', 0.0):+.2f}R / {r.get('avg_loss_r', 0.0):+.2f}R"),
        ("Largest win / loss", f"{r.get('largest_win_r', 0.0):+.2f}R / {r.get('largest_loss_r', 0.0):+.2f}R"),
        ("Max consec W / L", f"{r.get('max_consecutive_wins', 0)} / {r.get('max_consecutive_losses', 0)}"),
        ("Max drawdown", f"{r['max_drawdown_r']:.2f}R"),
        ("Avg hold / exposure", f"{r.get('avg_bars_held', 0.0):.1f} bars / {r.get('exposure', 0.0)*100:.0f}%"),
    ]
    for label, value in pairs:
        print(f"    {label:<22} {value}")


def _run_optimize(args) -> None:
    """Find the best strategy per symbol and write backtest_best.json — a
    mapping the bot can load to trade each symbol with its strongest strategy."""
    import json
    from datetime import datetime, timezone

    mt5_client.connect()
    symbols = settings.symbol_list if (args.all or not args.symbol) else [args.symbol.upper()]
    bars = args.bars if args.bars != 1000 else 5000  # default to more data for optimisation

    mapping: dict[str, str] = {}
    report: list[dict] = []
    try:
        print(f"Optimizing {len(symbols)} symbols ({bars} bars, min {args.min_trades} trades)...\n")
        for sym in symbols:
            try:
                res = backtest.optimize_symbol(
                    sym, args.timeframe, bars,
                    min_trades=args.min_trades,
                    commission_per_lot=args.commission,
                    spread_points=args.spread_points,
                )
            except Exception as e:  # noqa: BLE001
                print(f"  {sym:<13} skipped ({e})")
                continue
            best = res["best"]
            report.append(res)
            if best:
                mapping[sym.upper()] = best["strategy"]
                print(f"  {sym:<13} -> {best['strategy']:<16} "
                      f"exp={best['expectancy_r']:+.3f}R trades={best['trades']} PF={best['profit_factor']:.2f}")
            else:
                print(f"  {sym:<13} -> (none cleared {args.min_trades} trades + positive expectancy)")
    finally:
        mt5_client.shutdown()

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "bars": bars,
        "min_trades": args.min_trades,
        "strategies": mapping,
    }
    with open("backtest_best.json", "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(f"\nWrote {len(mapping)} symbol->strategy entries to backtest_best.json")
    print("Set SYMBOL_STRATEGIES_FILE=backtest_best.json in .env to have the bot use it.")
    sys.exit(0)


def main() -> None:
    parser = argparse.ArgumentParser(description="Backtest MetaBot strategies on MT5 history.")
    parser.add_argument("symbol", nargs="?", help="Symbol to test (e.g. BTCUSD). Omit with --all.")
    parser.add_argument("--timeframe", "-t", help="Override timeframe (M15, H1, H4, …).")
    parser.add_argument("--strategy", "-s", help="Override strategy name.")
    parser.add_argument("--bars", "-b", type=int, default=1000, help="Bars of history (default 1000).")
    parser.add_argument(
        "--commission", "-c", type=float, default=None,
        help="Round-turn commission $/lot (overrides BACKTEST_COMMISSION_PER_LOT).",
    )
    parser.add_argument(
        "--spread-points", type=float, default=None,
        help="Model a fixed spread in points instead of the live snapshot "
             "(useful for spread-based accounts like XM Standard).",
    )
    parser.add_argument("--all", action="store_true", help="Backtest every symbol in SYMBOLS.")
    parser.add_argument(
        "--compare-strategies",
        action="store_true",
        help="Run every built-in strategy on the symbol and rank them.",
    )
    parser.add_argument(
        "--optimize",
        action="store_true",
        help="For each symbol (or --all), find the best strategy and write a "
             "per-symbol mapping to backtest_best.json.",
    )
    parser.add_argument(
        "--min-trades", type=int, default=30,
        help="Minimum trades for a strategy to be eligible in --optimize (default 30).",
    )
    args = parser.parse_args()

    if args.optimize:
        _run_optimize(args)
        return

    if not args.symbol and not args.all:
        parser.error("provide a symbol, or --all")

    mt5_client.connect()

    rows: list[dict] = []
    try:
        if args.compare_strategies:
            if not args.symbol:
                parser.error("--compare-strategies needs a symbol")
            for info in strategy_mod.list_strategies():
                name = info["name"]
                try:
                    rows.append(
                        backtest.run_symbol_backtest(
                            args.symbol.upper(), args.timeframe, name, args.bars,
                            commission_per_lot=args.commission,
                            spread_points=args.spread_points,
                        )
                    )
                except Exception as e:  # noqa: BLE001
                    print(f"  {args.symbol} / {name}: skipped ({e})")
        else:
            symbols = settings.symbol_list if args.all else [args.symbol.upper()]
            for sym in symbols:
                try:
                    rows.append(
                        backtest.run_symbol_backtest(
                            sym, args.timeframe, args.strategy, args.bars,
                            commission_per_lot=args.commission,
                            spread_points=args.spread_points,
                        )
                    )
                except Exception as e:  # noqa: BLE001
                    print(f"  {sym}: skipped ({e})")
    finally:
        mt5_client.shutdown()

    print()
    if len(rows) == 1:
        # Single result → show the full metrics panel.
        _print_detail(rows[0])
    else:
        # Multiple → ranked summary table, best expectancy first.
        rows.sort(key=lambda r: r.get("expectancy_r", 0.0), reverse=True)
        print("Backtest results (sorted by expectancy R/trade):")
        for r in rows:
            _print_row(r)
    print()


if __name__ == "__main__":
    main()
    # Exit explicitly; some MT5 builds write to stderr on shutdown, which can
    # otherwise be picked up as a non-zero exit by the calling shell.
    sys.exit(0)
