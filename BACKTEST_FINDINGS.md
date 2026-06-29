# Backtest Findings

Research notes from backtesting the built-in strategies against this account's
MT5 history (XM Standard — $0 commission, costs via spread + swap). All figures
are in **R** (risk units); expectancy = R per trade. Re-run `run_backtest.py`
to refresh — markets change.

> These are **research findings to guide configuration**, not a promise of live
> returns. Always confirm on a demo account before trading real money.

## Summary by asset group

| Group | Verdict | Best setup found |
|---|---|---|
| **Gold** | ✅ Tradeable | `crypto_regime` / `crypto_early_stage` on H4 |
| **Forex** | ✅ Tradeable (selective) | `crypto_early_stage` on **H4** — specific pairs only |
| **Crypto** | ❌ Avoid | No strategy clears costs (see below) |
| **Stocks** | ❌ Avoid | No strategy profitable across the basket |

## Gold (H4)

Every XAU pair is profitable; `GOLD` itself is strongest. On more history
(10,000 bars) expectancy compresses (e.g. `crypto_regime` +0.69R at 3k bars →
+0.14R at 10k) — the larger sample is the more honest number, still positive.
`crypto_early_stage` edged ahead on 5,000 bars. Re-optimise with `--optimize`.

## Forex (H4) — strategy + pair both matter

The shipped default (`ema_macd_rsi` on **H1**) loses on every pair. The edge
appears with `crypto_early_stage` on **H4**, and only on a subset of pairs —
JPY crosses and USD/commodity pairs work; EUR/GBP crosses don't.

Per pair, `crypto_early_stage` H4 (5,000 bars):

| Pair | Expectancy | Net R | Trades | Verdict |
|---|---|---|---|---|
| USDJPY | +0.59R | +22R | 37 | ✅ |
| USDCAD | +0.39R | +19R | 48 | ✅ |
| GBPJPY | +0.20R | +9R | 44 | ✅ |
| EURJPY | +0.17R | +9R | 50 | ✅ |
| EURUSD | +0.07R | +5R | 76 | ✅ (thin) |
| AUDUSD / USDCHF / GBPUSD / NZDUSD / EURGBP | negative | — | — | ❌ |

## Crypto — costs are the wall

Crypto CFDs on XM charge ~**4.2%/night** swap. Held over several H4 bars a
trend trade pays 100R+ in swap and loses heavily even when the entry (gross R)
is positive.

The `crypto_scalp` strategy + `CRYPTO_MAX_HOLD_HOURS` time-stop **solve the
swap problem** — they cut holding to minutes and swap to near-zero:

| BTCUSD M15 | Hold | Swap cost | Net R | Gross R |
|---|---|---|---|---|
| `trend` | 18.9h | 96.7R | −89R | +7.4R |
| `crypto_scalp` | 0.3h | 13.7R | −36R | −22R |

But the scalp's **entry has no edge** (gross still negative), so crypto remains
unprofitable. Conclusion: don't trade crypto here until an entry with positive
gross expectancy exists. The scalp + time-stop code is kept (off by default) for
future work.

## Stocks (H4 & D1)

Tested every strategy across the basket on H4 and D1 — none is profitable
(0–2 of 12 sample stocks win on any strategy). The handful that show a positive
number have too few trades (5–16) to trust. Wide CFD spreads (75–388 points)
and short-term strategies fighting a long-term uptrend are the likely causes.

## How to act on this

1. Trade **Gold**; for **Forex** trade only the ✅ pairs above with
   `crypto_early_stage` on H4.
2. Keep **Crypto** and **Stocks** disabled.
3. Let `run_backtest.py --optimize --bars 10000` pick per-symbol strategies and
   point the bot at `backtest_best.json` (`SYMBOL_STRATEGIES_FILE`).
4. Trust results with **30+ trades**; re-check periodically.
