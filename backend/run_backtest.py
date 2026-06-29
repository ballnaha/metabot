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
        f" net={r['net_r']:+8.2f}R  PF={r['profit_factor']:5.2f}"
        f" maxDD={r['max_drawdown_r']:6.2f}R"
        f" cost={r.get('total_cost_r', 0.0):6.2f}R"
    )


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
    parser.add_argument("--all", action="store_true", help="Backtest every symbol in SYMBOLS.")
    parser.add_argument(
        "--compare-strategies",
        action="store_true",
        help="Run every built-in strategy on the symbol and rank them.",
    )
    args = parser.parse_args()

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
                        )
                    )
                except Exception as e:  # noqa: BLE001
                    print(f"  {sym}: skipped ({e})")
    finally:
        mt5_client.shutdown()

    # Best net_r first.
    rows.sort(key=lambda r: r["net_r"], reverse=True)
    print()
    print("Backtest results (sorted by net R):")
    for r in rows:
        _print_row(r)
    print()


if __name__ == "__main__":
    main()
