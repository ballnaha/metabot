# Backtest Findings — Exness Standard Demo

These notes were refreshed against the connected Exness Standard Demo account
on 2026-06-30. Exness uses the `m` suffix on this account; MetaBot resolves the
uppercase values stored in `.env` to the broker's case-sensitive names.

> Backtests are research, not a promise of live returns. Re-run them after a
> broker/account change and validate on demo before enabling additional assets.

## Current safe baseline

| Group | Enabled | Symbols | Strategy / timeframe | Evidence |
|---|---:|---|---|---|
| Gold | Yes | `XAUUSDm` | `squeeze_breakout` / M30 | +0.182R expectancy, 37 trades |
| Forex | Yes | `USDJPYm` | `squeeze_breakout` / H1 | +0.216R expectancy, 37 trades |
| Crypto | No | — | — | BTCUSD `trend` / H1: -0.494R, costs 62.85R |
| Stocks | No | — | — | AAPL was positive but only 24 trades; sample too small |

The two enabled results use 3,000 broker-history bars and the Exness live
spread/swap snapshot. Keep the symbol list narrow until each additional symbol
has at least 30 trades and positive net expectancy after costs.

## Reproduce and expand

```powershell
cd backend
.venv\Scripts\python.exe run_backtest.py USDJPYm -t H1 --compare-strategies -b 3000
.venv\Scripts\python.exe run_backtest.py XAUUSDm -t M30 --compare-strategies -b 3000
.venv\Scripts\python.exe run_backtest.py --all --optimize -b 10000 --min-trades 30
```

Only set `SYMBOL_STRATEGIES_FILE=backtest_best.json` after reviewing the
generated mapping. A positive result on one symbol must not be generalized to
every Forex, metal, stock, or crypto instrument.
