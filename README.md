# 🤖 MetaBot — MT5 Advisory & Auto-Trading Bot

A bot that **analyses the market, gives AI-backed advice, and (after you confirm)
places trades on MetaTrader 5**. Control it from **Telegram** or a **Next.js web
dashboard**.

- **Backend:** Python — `MetaTrader5` + technical indicators + AI advisors (Deepseek & Gemini) + FastAPI + Telegram
- **Frontend:** Next.js 16 (Turbopack) + React 19 + MUI 9 + lucide icons dashboard
- **Default mode:** advise first, you confirm, then it trades (`REQUIRE_CONFIRM=true`)

> ⚠️ **Trading risk.** This software can place real orders with real money.
> Start on a **demo account**. Auto-trade mode (`REQUIRE_CONFIRM=false`) executes
> without asking — use it only after you trust the strategy. Nothing here is
> financial advice.

---

## Architecture

```
                 ┌──────────────┐         ┌──────────────┐
  Telegram  ───► │              │         │ Deepseek/Gemini│  (AI advice)
                 │   TradeManager│ ───────►│   advisor.py  │
  Web dashboard ►│   (trader.py) │         └──────────────┘
   (Next.js)     │              │
                 │   confirm?    │ ───────► indicators.py  (RSI/MACD/EMA/ATR/BB)
                 │              │
                 │   mt5_client  │ ───────► MetaTrader 5 terminal (orders/data)
                 └──────────────┘
```

The flow: **analyze → Recommendation → (your confirm) → order sent to MT5.**

---

## Prerequisites

- **Windows** with the **MetaTrader 5 terminal installed and logged in** (the
  `MetaTrader5` Python package talks to the running terminal — Windows only).
- In MT5: **Tools → Options → Expert Advisors → Allow Algo Trading** enabled.
- **Python 3.10+** and **Node.js 20+** (required by Next.js 16).
- API keys (optional but recommended): **Deepseek** and/or **Gemini** (Google AI Studio).
- A **Telegram bot token** from [@BotFather](https://t.me/BotFather) and your numeric chat id.

---

## Quick start (one click)

Double-click **`start.bat`** in the project root. On the **first run** it will:

1. create the Python virtual environment and install backend deps,
2. create `backend\.env` and `frontend\.env.local` from the templates,
3. run `npm install` for the dashboard,

then run **all three services in one window**: API (foreground) plus the
Telegram bot and dashboard (background of the same console). Their logs share
that window.

> 🛑 After the first run, **stop and edit `backend\.env`** (MT5 / API keys /
> Telegram token) and set `BACKEND_API_KEY` in `frontend\.env.local` to match
> `API_KEY`, then run `start.bat` again.

Stop everything with **`stop.bat`** (or just close the window).

The sections below describe the same steps manually.

---

## 1. Backend setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt

copy .env.example .env          # then edit .env
```

Fill in `.env`:

- Leave `MT5_LOGIN/PASSWORD/SERVER` **empty** to attach to the terminal you are
  already logged into, or set them to log in programmatically.
- Add `DEEPSEEK_API_KEY` and/or `GEMINI_API_KEY`. Set `AI_PROVIDERS=deepseek,gemini`
  (drop one if you only have a single key).
- Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (your own id so only you can
  control the bot).
- Set `API_KEY` to a random secret (the dashboard must use the same value).
- Tune `RISK_PER_TRADE`, `MAX_LOT`, `SYMBOLS`, `REQUIRE_CONFIRM`.

### Run the API server

```bash
python run_api.py
# → http://127.0.0.1:8383  (docs at /docs)
```

### Run the Telegram bot (separate terminal)

```bash
python run_telegram.py
```

### Run the tests

```bash
pip install -r requirements-dev.txt   # one-time: installs pytest
pytest                                # runs the suite in backend/tests/
```

Telegram commands:

| Command | What it does |
|---|---|
| `/analyze EURUSD M15` | analyse a symbol; shows ✅ Confirm / ❌ Cancel buttons |
| `/account` | balance, equity, open P/L |
| `/positions` | open positions |
| `/pending` | trades awaiting confirmation |

---

## 2. Frontend setup

```bash
cd frontend
npm install
copy .env.local.example .env.local   # set BACKEND_API_KEY = backend API_KEY
npm run dev
# → http://localhost:4016
```

The dashboard shows account/equity, lets you analyse a symbol, review the AI
recommendation, **Confirm** the trade, and close open positions. The API key
stays server-side — the browser only talks to the Next.js `/api` proxy.

---

## How the advice is formed

**The strategy decides; the AI is an optional second filter.**

1. `indicators.py` computes RSI, MACD, EMA(12/26), ATR and Bollinger Bands on the
   latest candles. The selected **strategy** (`strategy.py`) turns those numbers
   into a technical signal (BUY/SELL/HOLD + confidence + reasons). This alone is
   enough to trade — no AI required.
2. **If `USE_AI` is on** (toggle in the dashboard, `ai`/`noai` in Telegram, or
   `use_ai` in the API), `advisor.py` asks each configured LLM (**Deepseek**,
   **Gemini**) for a strict-JSON opinion and `advisor.decide()` uses them as a
   filter: the strategy's BUY/SELL is kept only if the AIs agree (`confirmed`),
   otherwise it is downgraded to **HOLD** (`filtered`). If every provider errors,
   it falls back to the strategy (`unavailable`).
3. **If `USE_AI` is off**, `decide()` simply follows the strategy signal — no AI
   calls are made. SL/TP come from agreeing AI levels, then the strategy's own,
   then ATR-based levels.
4. `trader.py` sizes the lot so that hitting the stop loss costs ≈ `RISK_PER_TRADE`
   of equity, then stages a **PendingTrade** that waits for your confirmation.

---

## Strategies (write your own)

The technical signal comes from a **pluggable strategy**. Pick the default with
`STRATEGY=` in `.env`, or override per call (`/analyze EURUSD M15 trend`, the
dashboard dropdown, or `"strategy"` in the `/api/analyze` body).

Built-in strategies:

| name | idea |
|---|---|
| `ema_macd_rsi` | confluence of EMA trend + MACD momentum + RSI extremes (default) |
| `trend` | trend-following: EMA50 slope + price vs EMA50 + MACD |
| `mean_reversion` | fade Bollinger-band touches with RSI confirmation |
| `breakout` | break of the recent 20-bar high / low (Donchian) |

**Add your own** in `backend/app/strategy.py`:

```python
from .strategy import Strategy, register
from .models import Action, StrategySignal

@register
class MyStrategy(Strategy):
    name = "my_strategy"
    description = "buy when RSI < 25"

    def evaluate(self, df, snap) -> StrategySignal:
        if snap.rsi is not None and snap.rsi < 25:
            sl, tp = self.atr_levels(snap, Action.BUY)
            return StrategySignal(action=Action.BUY, confidence=0.8,
                                  reasons=[f"RSI {snap.rsi:.0f} < 25"],
                                  stop_loss=sl, take_profit=tp)
        return StrategySignal(action=Action.HOLD)
```

`df` is the OHLC DataFrame (oldest→newest) and `snap` holds the computed
indicators. The strategy's signal is shown to you, fed into the AI prompt, and
counted as a confidence-weighted vote in `advisor.merge()`. Set
`STRATEGY=my_strategy` to use it. List all with the `/strategies` Telegram
command or `GET /api/strategies`.

---

## Backtesting (validate before you trade)

Before changing a strategy or risk parameter, test it on history. The
backtester pulls recent candles from MT5 and replays a strategy with no
look-ahead bias (signal on a closed candle, fill at the next open, spread
included, same-bar SL+TP counted as SL). It also deducts **costs**: swap (read
from the symbol, scaled by nights held) and round-turn commission. Results are
in **R** (risk units) so symbols compare directly.

```bash
cd backend
.venv\Scripts\activate

# One symbol (timeframe + strategy default to the live settings for its group)
python run_backtest.py BTCUSD

# Override timeframe / strategy / history length
python run_backtest.py EURUSD --timeframe H1 --strategy trend --bars 2000

# Set commission ($/lot round-turn) — e.g. a raw-spread account
python run_backtest.py BTCUSD --commission 7

# Stress-test against a fixed/wider spread (spread-based accounts, e.g. XM Standard)
python run_backtest.py EURUSD --spread-points 25

# Compare every configured symbol (SYMBOLS in .env)
python run_backtest.py --all

# Find the best strategy for one symbol
python run_backtest.py GOLD --compare-strategies
```

**Spread-based accounts (e.g. XM Standard).** Such accounts charge $0
commission but a wider spread — so the spread *is* the cost, and the default
(a single live snapshot) may not be representative. Leave
`BACKTEST_COMMISSION_PER_LOT=0` and use `--spread-points` to model a realistic
or worst-case spread instead of the snapshot.

Set a default commission with `BACKTEST_COMMISSION_PER_LOT` in `.env` (check
your account's contract specs). Via the API: `POST /api/backtest` with
`{"symbol": "BTCUSD"}` (optional `timeframe`, `strategy`, `bars`,
`commission_per_lot`, `spread_points`, `include_details`).

A single-symbol run prints a full metrics panel; `--all` /
`--compare-strategies` print a table ranked by expectancy. Metrics (all in R):

| metric | meaning |
|---|---|
| `expectancy_r` | average R per trade — the strategy's edge (the headline number) |
| `net_r` / `gross_net_r` | total R after / before costs |
| `total_cost_r` | commission + swap paid, in R |
| `profit_factor` | gross profit ÷ gross loss (>1 = profitable) |
| `sharpe` | per-trade risk-adjusted return (mean R ÷ std R) |
| `avg_win_r` / `avg_loss_r` | average winning / losing trade |
| `max_consecutive_losses` | worst losing streak (risk of ruin / psychology) |
| `max_drawdown_r` | largest peak-to-trough drop in R |
| `avg_bars_held` / `exposure` | how long, and what fraction of time, you're in a position |

> ⚠️ The backtest excludes AI filtering and assumes fills at the modelled
> price (no slippage on gaps) — treat results as a **relative** comparison
> between strategies/parameters, not a promise of live returns. Beware
> overfitting.

> ⚠️ The backtest excludes AI filtering and assumes fills at the modelled
> price (no slippage on gaps) — treat results as a **relative** comparison
> between strategies/parameters, not a promise of live returns. Beware
> overfitting.

---

## Switching to full auto-trade

Set `REQUIRE_CONFIRM=false` in `backend/.env`. Now `/analyze` (and the API) will
execute actionable signals immediately instead of asking. **Test on a demo
account first.** To run analysis on a schedule, wrap `manager.analyze_and_stage()`
in a loop or cron — see `app/trader.py`.

---

## Project layout

```
metabot/
├─ backend/
│  ├─ app/
│  │  ├─ config.py        # env / settings
│  │  ├─ models.py        # pydantic models (Recommendation, PendingTrade…)
│  │  ├─ mt5_client.py    # all MetaTrader5 access (data, account, orders)
│  │  ├─ indicators.py    # RSI/MACD/EMA/ATR/Bollinger
│  │  ├─ strategy.py      # pluggable strategies (registry + built-ins)
│  │  ├─ advisor.py       # Deepseek + Gemini advisors and merge logic
│  │  ├─ trader.py        # analysis → confirm-gated trade execution + risk sizing
│  │  ├─ api.py           # FastAPI endpoints
│  │  └─ telegram_bot.py  # Telegram interface
│  ├─ run_api.py
│  ├─ run_telegram.py
│  └─ requirements.txt
└─ frontend/              # Next.js dashboard (App Router)
   └─ app/
      ├─ page.tsx         # dashboard UI
      └─ api/[...path]/route.ts  # server-side proxy to backend
```
