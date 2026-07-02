"""FastAPI server exposing the bot to the Next.js dashboard and any client.

Auth: every request must send header  X-API-Key: <settings.api_key>.
"""
from __future__ import annotations

import asyncio
import logging
import time

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import backtest, mt5_client, strategy, worker
from .config import settings
from .market_groups import is_crypto_symbol, market_group, check_market_open
from .models import AnalyzeRequest, IndicatorSnapshot, Recommendation
from .trader import manager, magic_for_symbol

def _configure_logging() -> None:
    """Force UTF-8 on the console handler.

    On Windows the default stream uses the locale codec (e.g. cp874), which
    cannot encode the Thai-localized error strings returned by MetaTrader5.
    That raised a *second* error inside the log handler and masked the real
    scan failure. Reconfiguring stdout to UTF-8 (Python 3.7+) avoids it.
    """
    import sys

    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            try:
                reconfigure(encoding="utf-8", errors="backslashreplace")
            except Exception:
                pass
    logging.basicConfig(level=logging.INFO)


_configure_logging()
log = logging.getLogger("metabot.api")

TICK_CACHE_TTL_SECONDS = 8.0
_tick_cache: dict[str, tuple[float, dict]] = {}

app = FastAPI(title="MetaBot API", version="0.1.0")

_cors_origins = settings.cors_origin_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    # Only allow credentials when the origin list is explicit (not "*"); the
    # CORS spec forbids credentials with a wildcard origin.
    allow_credentials="*" not in _cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_key(x_api_key: str | None = Header(default=None)) -> None:
    if x_api_key != settings.api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")


@app.on_event("startup")
def _startup() -> None:
    try:
        info = mt5_client.connect()
        log.info("Connected to MT5 account %s on %s", info["login"], info["server"])
    except Exception as e:  # noqa: BLE001
        log.warning("MT5 not connected at startup: %s", e)
    worker.start_worker()


@app.on_event("shutdown")
def _shutdown() -> None:
    worker.stop_worker()
    mt5_client.shutdown()


@app.get("/api/health")
def health():
    try:
        acct = mt5_client.account_info()
        return {"status": "ok", "mt5": "connected", "account": acct["login"]}
    except Exception as e:  # noqa: BLE001
        return {"status": "ok", "mt5": "disconnected", "detail": str(e)}


@app.get("/api/account", dependencies=[Depends(require_key)])
def account():
    try:
        return mt5_client.account_info()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/api/reconnect", dependencies=[Depends(require_key)])
def reconnect():
    try:
        mt5_client.shutdown()
        info = mt5_client.connect()
        log.info("Reconnected to MT5 account %s on %s", info["login"], info["server"])
        return {"status": "ok", "account": info}
    except Exception as e:  # noqa: BLE001
        log.warning("MT5 reconnect failed: %s", e)
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/api/symbols", dependencies=[Depends(require_key)])
def symbols():
    return {"symbols": settings.symbol_list, "default_timeframe": settings.default_timeframe}


@app.get("/api/strategies", dependencies=[Depends(require_key)])
def strategies():
    return {
        "strategies": strategy.list_strategies(),
        "default": settings.strategy,
        "use_ai_default": settings.use_ai,
    }


@app.get("/api/positions", dependencies=[Depends(require_key)])
def positions():
    try:
        return {"positions": mt5_client.positions()}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/api/analyze", dependencies=[Depends(require_key)])
async def analyze(req: AnalyzeRequest):
    try:
        if req.preview:
            rec = await manager.analyze(
                req.symbol, req.timeframe, req.bars, req.strategy, req.use_ai
            )
            return {"recommendation": rec.model_dump(), "pending": None}

        rec, pending = await manager.analyze_and_stage(
            req.symbol, req.timeframe, req.bars, req.strategy, req.use_ai
        )
        return {
            "recommendation": rec.model_dump(),
            "pending": pending.model_dump() if pending else None,
        }
    except KeyError as e:  # unknown strategy name
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(e))


class ScanRequest(BaseModel):
    symbols: list[str]
    timeframe: str | None = None
    strategy: str | None = None
    bars: int = 200


@app.post("/api/scan", dependencies=[Depends(require_key)])
async def scan(req: ScanRequest):
    """Read-only screener: analyze each symbol (no AI, no staging) and rank the
    actionable signals first, then by confidence. Symbols that fail to analyze
    (e.g. no data) are skipped."""
    items: list[dict] = []
    for sym in req.symbols:
        await asyncio.sleep(0)  # yield so the poll/other requests stay responsive
        try:
            rec = await manager.analyze(
                sym, req.timeframe, req.bars, req.strategy, use_ai=False
            )
        except Exception as e:  # noqa: BLE001 — skip unavailable symbols
            log.warning("scan: failed to analyze %s: %s", sym, e)
            continue
        items.append(
            {
                "symbol": sym,
                "action": rec.action.value,
                "confidence": rec.confidence,
                "technical_action": rec.indicators.rule_bias.value,
                "technical_confidence": rec.indicators.strategy_confidence,
                "risk_blocked": rec.risk_blocked,
                "risk_reason": rec.risk_reason,
                "price": rec.price,
                "summary": rec.summary,
            }
        )

    rank = {"BUY": 0, "SELL": 0, "HOLD": 1}
    items.sort(key=lambda r: (rank.get(r["action"], 2), -r["confidence"]))
    return {"results": items}


class BacktestRequest(BaseModel):
    symbol: str
    timeframe: str | None = None
    strategy: str | None = None
    bars: int = 1000
    commission_per_lot: float | None = None  # round-turn $/lot; None = use setting
    spread_points: float | None = None       # override spread (points); None = snapshot
    include_details: bool = False


@app.post("/api/backtest", dependencies=[Depends(require_key)])
def run_backtest(req: BacktestRequest):
    """Backtest one strategy on a symbol's recent OHLC history. Timeframe and
    strategy default to the live settings for that symbol's market group.
    Costs (commission + swap) are deducted; results are in R (risk units) so
    symbols can be compared directly."""
    try:
        return backtest.run_symbol_backtest(
            req.symbol.upper(),
            req.timeframe,
            req.strategy,
            req.bars,
            commission_per_lot=req.commission_per_lot,
            spread_points=req.spread_points,
            include_details=req.include_details,
        )
    except KeyError as e:  # unknown strategy name
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(e))


# Pending, Confirm and Cancel endpoints removed as require_confirm has been deleted


@app.post("/api/positions/{ticket}/close", dependencies=[Depends(require_key)])
def close(ticket: int):
    try:
        # Check market open/closed status first
        pos_list = mt5_client.positions()
        target_pos = next((p for p in pos_list if p["ticket"] == ticket), None)
        if target_pos:
            symbol = target_pos["symbol"]
            is_open, msg = check_market_open(symbol)
            if not is_open:
                raise HTTPException(status_code=400, detail=f"ตลาดปิด ขายไม่ได้: {msg}")

        res = mt5_client.close_position(ticket)
        if not res.get("ok"):
            raise HTTPException(status_code=400, detail=res.get("comment", "Close failed"))
        return res
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(e))


class SettingsUpdateRequest(BaseModel):
    mt5_login: int | None = None
    mt5_password: str | None = None
    mt5_server: str | None = None
    mt5_path: str | None = None
    deepseek_api_key: str | None = None
    deepseek_model: str | None = None
    gemini_api_key: str | None = None
    gemini_model: str | None = None
    ai_providers: str | None = None
    use_ai: bool | None = None
    telegram_bot_token: str | None = None
    telegram_chat_id: str | None = None
    telegram_enabled: bool | None = None
    symbols: str | None = None
    default_timeframe: str | None = None
    crypto_timeframe: str | None = None
    crypto_strategy: str | None = None
    crypto_atr_sl_mult: float | None = None
    crypto_rr: float | None = None
    crypto_min_sl_pct: float | None = None
    crypto_breakout_enabled: bool | None = None
    gold_timeframe: str | None = None
    gold_strategy: str | None = None
    strategy: str | None = None
    risk_per_trade: float | None = None
    max_lot: float | None = None
    magic: int | None = None
    gold_magic: int | None = None
    atr_sl_mult: float | None = None
    default_rr: float | None = None
    bot_enabled: bool | None = None
    gold_bot_enabled: bool | None = None
    auto_trade_interval: int | None = None
    position_sizing_mode: str | None = None
    max_open_trades: int | None = None
    max_crypto_open_trades: int | None = None
    max_gold_open_trades: int | None = None
    stake_amount: float | None = None
    api_key: str | None = None
    stock_bot_enabled: bool | None = None
    stock_magic: int | None = None
    max_stock_open_trades: int | None = None
    stock_timeframe: str | None = None
    stock_strategy: str | None = None
    stock_risk_per_trade: float | None = None
    stock_max_lot: float | None = None
    stock_atr_sl_mult: float | None = None
    stock_rr: float | None = None
    stock_use_ai: bool | None = None
    stock_auto_trade_interval: int | None = None
    forex_bot_enabled: bool | None = None
    forex_magic: int | None = None
    max_forex_open_trades: int | None = None
    forex_timeframe: str | None = None
    forex_strategy: str | None = None
    forex_risk_per_trade: float | None = None
    forex_max_lot: float | None = None
    forex_atr_sl_mult: float | None = None
    forex_rr: float | None = None
    forex_use_ai: bool | None = None
    forex_auto_trade_interval: int | None = None
    forex_max_hold_hours: float | None = None
    max_spread_points: int | None = None
    max_spread_to_sl: float | None = None
    crypto_max_spread_to_sl: float | None = None
    max_entry_drift_to_sl: float | None = None
    max_daily_loss_pct: float | None = None
    max_consecutive_losses: int | None = None
    trend_cooldown_bars: int | None = None
    breakeven_r: float | None = None
    trailing_stop_r: float | None = None
    partial_close_r: float | None = None
    partial_close_pct: float | None = None
    manage_manual_positions: bool | None = None
    forex_partial_close_r: float | None = None
    forex_partial_close_pct: float | None = None
    forex_breakeven_r: float | None = None
    forex_trailing_stop_r: float | None = None
    gold_partial_close_r: float | None = None
    gold_partial_close_pct: float | None = None
    gold_breakeven_r: float | None = None
    gold_trailing_stop_r: float | None = None
    crypto_partial_close_r: float | None = None
    crypto_partial_close_pct: float | None = None
    crypto_breakeven_r: float | None = None
    crypto_trailing_stop_r: float | None = None
    crypto_manage_manual_positions: bool | None = None
    stock_partial_close_r: float | None = None
    stock_partial_close_pct: float | None = None
    stock_breakeven_r: float | None = None
    stock_trailing_stop_r: float | None = None
    stock_manage_manual_positions: bool | None = None
    forex_manage_manual_positions: bool | None = None
    gold_manage_manual_positions: bool | None = None
    min_lot_stake_multiple: float | None = None
    max_notional_to_equity: float | None = None


@app.get("/api/settings", dependencies=[Depends(require_key)])
def get_settings_endpoint():
    return {
        "mt5_login": settings.mt5_login,
        "mt5_password": settings.mt5_password,
        "mt5_server": settings.mt5_server,
        "mt5_path": settings.mt5_path,
        "deepseek_api_key": settings.deepseek_api_key,
        "deepseek_model": settings.deepseek_model,
        "gemini_api_key": settings.gemini_api_key,
        "gemini_model": settings.gemini_model,
        "ai_providers": settings.ai_providers,
        "use_ai": settings.use_ai,
        "telegram_bot_token": settings.telegram_bot_token,
        "telegram_chat_id": settings.telegram_chat_id,
        "telegram_enabled": settings.telegram_enabled,
        "symbols": settings.symbols,
        "default_timeframe": settings.default_timeframe,
        "crypto_timeframe": settings.crypto_timeframe,
        "crypto_strategy": settings.crypto_strategy,
        "crypto_atr_sl_mult": settings.crypto_atr_sl_mult,
        "crypto_rr": settings.crypto_rr,
        "crypto_min_sl_pct": settings.crypto_min_sl_pct,
        "crypto_breakout_enabled": settings.crypto_breakout_enabled,
        "gold_timeframe": settings.gold_timeframe,
        "gold_strategy": settings.gold_strategy,
        "strategy": settings.strategy,
        "risk_per_trade": settings.risk_per_trade,
        "max_lot": settings.max_lot,
        "magic": settings.magic,
        "gold_magic": settings.gold_magic,
        "atr_sl_mult": settings.atr_sl_mult,
        "default_rr": settings.default_rr,
        "bot_enabled": settings.bot_enabled,
        "gold_bot_enabled": settings.gold_bot_enabled,
        "auto_trade_interval": settings.auto_trade_interval,
        "position_sizing_mode": settings.position_sizing_mode,
        "max_open_trades": settings.max_open_trades,
        "max_crypto_open_trades": settings.max_crypto_open_trades,
        "max_gold_open_trades": settings.max_gold_open_trades,
        "stake_amount": settings.stake_amount,
        "api_key": settings.api_key,
        "stock_bot_enabled": settings.stock_bot_enabled,
        "stock_magic": settings.stock_magic,
        "max_stock_open_trades": settings.max_stock_open_trades,
        "stock_timeframe": settings.stock_timeframe,
        "stock_strategy": settings.stock_strategy,
        "stock_risk_per_trade": settings.stock_risk_per_trade,
        "stock_max_lot": settings.stock_max_lot,
        "stock_atr_sl_mult": settings.stock_atr_sl_mult,
        "stock_rr": settings.stock_rr,
        "stock_use_ai": settings.stock_use_ai,
        "stock_auto_trade_interval": settings.stock_auto_trade_interval,
        "forex_bot_enabled": settings.forex_bot_enabled,
        "forex_magic": settings.forex_magic,
        "max_forex_open_trades": settings.max_forex_open_trades,
        "forex_timeframe": settings.forex_timeframe,
        "forex_strategy": settings.forex_strategy,
        "forex_risk_per_trade": settings.forex_risk_per_trade,
        "forex_max_lot": settings.forex_max_lot,
        "forex_atr_sl_mult": settings.forex_atr_sl_mult,
        "forex_rr": settings.forex_rr,
        "forex_use_ai": settings.forex_use_ai,
        "forex_auto_trade_interval": settings.forex_auto_trade_interval,
        "forex_max_hold_hours": settings.forex_max_hold_hours,
        "max_spread_points": settings.max_spread_points,
        "max_spread_to_sl": settings.max_spread_to_sl,
        "crypto_max_spread_to_sl": settings.crypto_max_spread_to_sl,
        "max_entry_drift_to_sl": settings.max_entry_drift_to_sl,
        "max_daily_loss_pct": settings.max_daily_loss_pct,
        "max_consecutive_losses": settings.max_consecutive_losses,
        "trend_cooldown_bars": settings.trend_cooldown_bars,
        "breakeven_r": settings.breakeven_r,
        "trailing_stop_r": settings.trailing_stop_r,
        "partial_close_r": settings.partial_close_r,
        "partial_close_pct": settings.partial_close_pct,
        "manage_manual_positions": settings.manage_manual_positions,
        "forex_partial_close_r": settings.forex_partial_close_r,
        "forex_partial_close_pct": settings.forex_partial_close_pct,
        "forex_breakeven_r": settings.forex_breakeven_r,
        "forex_trailing_stop_r": settings.forex_trailing_stop_r,
        "gold_partial_close_r": settings.gold_partial_close_r,
        "gold_partial_close_pct": settings.gold_partial_close_pct,
        "gold_breakeven_r": settings.gold_breakeven_r,
        "gold_trailing_stop_r": settings.gold_trailing_stop_r,
        "crypto_partial_close_r": settings.crypto_partial_close_r,
        "crypto_partial_close_pct": settings.crypto_partial_close_pct,
        "crypto_breakeven_r": settings.crypto_breakeven_r,
        "crypto_trailing_stop_r": settings.crypto_trailing_stop_r,
        "crypto_manage_manual_positions": settings.crypto_manage_manual_positions,
        "stock_partial_close_r": settings.stock_partial_close_r,
        "stock_partial_close_pct": settings.stock_partial_close_pct,
        "stock_breakeven_r": settings.stock_breakeven_r,
        "stock_trailing_stop_r": settings.stock_trailing_stop_r,
        "stock_manage_manual_positions": settings.stock_manage_manual_positions,
        "forex_manage_manual_positions": settings.forex_manage_manual_positions,
        "gold_manage_manual_positions": settings.gold_manage_manual_positions,
        "min_lot_stake_multiple": settings.min_lot_stake_multiple,
        "max_notional_to_equity": settings.max_notional_to_equity,
    }


@app.post("/api/settings", dependencies=[Depends(require_key)])
def update_settings_endpoint(req: SettingsUpdateRequest):
    # Exclude None; also exclude empty-string passwords so switching profiles
    # without entering a password doesn't overwrite the stored credential.
    password_fields = {"mt5_password", "deepseek_api_key", "gemini_api_key",
                       "telegram_bot_token"}
    updates = {
        k: v for k, v in req.model_dump().items()
        if v is not None and not (k in password_fields and v == "")
    }

    # Check if MT5 credentials changed to decide whether to reconnect
    mt5_keys = {"mt5_login", "mt5_password", "mt5_server", "mt5_path"}
    mt5_changed = any(k in updates for k in mt5_keys)

    settings.update_settings(updates)

    warning_msg = None
    if mt5_changed:
        # Only reconnect when we have a complete set of credentials
        if settings.mt5_login and settings.mt5_password and settings.mt5_server:
            try:
                mt5_client.shutdown()
                mt5_client.connect()
            except Exception as e:
                warning_msg = f"Settings saved, but MT5 reconnection failed: {e}"
                log.warning(warning_msg)
        else:
            log.info("MT5 settings updated but credentials incomplete — skipping reconnect")

    return {"status": "saved", "warning": warning_msg, "restarting": False}



class DirectTradeRequest(BaseModel):
    symbol: str
    action: str  # BUY | SELL
    lot: float
    sl: float | None = None
    tp: float | None = None
    signal_price: float | None = None
    timeframe: str | None = None
    strategy: str | None = None


@app.get("/api/symbols/{symbol}/tick", dependencies=[Depends(require_key)])
def get_symbol_tick(symbol: str):
    try:
        return mt5_client.get_tick(symbol.upper())
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/api/ticks", dependencies=[Depends(require_key)])
def get_bulk_ticks(symbols: str):
    try:
        sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
        cache_key = ",".join(sym_list)
        now = time.monotonic()
        cached = _tick_cache.get(cache_key)
        if cached and now - cached[0] < TICK_CACHE_TTL_SECONDS:
            return cached[1]

        results = {}
        for sym in sym_list:
            try:
                results[sym] = mt5_client.get_tick(sym)
            except Exception as e:
                results[sym] = {"error": str(e)}

        _tick_cache[cache_key] = (now, results)
        return results
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/api/symbols/detect-crypto", dependencies=[Depends(require_key)])
def detect_crypto_symbols():
    try:
        import re
        import MetaTrader5 as mt5
        
        mt5_client.connect()
        raw_symbols = mt5.symbols_get()
        if not raw_symbols:
            return {"symbols": []}
            
        def is_crypto(s) -> bool:
            name_upper = s.name.upper()
            path_lower = getattr(s, 'path', '').lower()
            if is_crypto_symbol(name_upper):
                return True
            return 'cryptocurrencies' in path_lower or 'crypto' in path_lower or 'coin' in path_lower
            
        detected = []
        for s in raw_symbols:
            if is_crypto(s) and getattr(s, 'trade_mode', 0) == mt5.SYMBOL_TRADE_MODE_FULL:
                name_upper = s.name.upper()
                # Exclude fiat cross rates (like BTCEUR, ETHGBP, BTCJPY) unless quoted in USD/USDT
                if "EUR" in name_upper or "GBP" in name_upper or "JPY" in name_upper:
                    if not (name_upper.endswith("USD") or name_upper.endswith("USDT") or name_upper.endswith("USDm") or name_upper.endswith("USDTm")):
                        continue
                if not name_upper.startswith("CRYPTO_") and "VAULT" not in name_upper:
                    detected.append(s.name)
        
        popular = ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "LTCUSD", "DOGEUSD"]
        def sort_key(x):
            clean = x.upper().replace("M", "").replace(".ECN", "")
            if clean in popular:
                return (0, popular.index(clean))
            return (1, x)
            
        sorted_detected = sorted(detected, key=sort_key)
        return {"symbols": sorted_detected}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/api/symbols/detect-metals", dependencies=[Depends(require_key)])
def detect_metal_symbols():
    try:
        import MetaTrader5 as mt5
        
        mt5_client.connect()
        raw_symbols = mt5.symbols_get()
        if not raw_symbols:
            return {"symbols": []}
            
        def is_metal(s) -> bool:
            path_lower = getattr(s, 'path', '').lower()
            name_upper = s.name.upper()
            is_stock_path = any(x in path_lower for x in ['stock', 'shares', 'equities', 'indices', 'cfd'])
            if is_stock_path:
                return False
            if 'metal' in path_lower or 'spot_metals' in path_lower:
                return True
            if name_upper in ["GOLD", "SILVER", "PLATINUM", "PALLADIUM"] or any(name_upper.startswith(x) for x in ["XAU", "XAG", "XPD", "XPT"]):
                return True
            return False
            
        detected = []
        for s in raw_symbols:
            if is_metal(s) and getattr(s, 'trade_mode', 0) > 0:
                detected.append(s.name)
                
        popular = ["GOLD", "XAUUSD", "SILVER", "XAGUSD"]
        sorted_detected = sorted(
            detected, 
            key=lambda x: (0, popular.index(x.upper())) if x.upper() in popular else (1, x)
        )
        return {"symbols": sorted_detected}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/api/symbols/detect-forex", dependencies=[Depends(require_key)])
def detect_forex_symbols(filter_type: str = "major"):
    """Detect Forex symbols available in the connected MT5 broker.
    filter_type: 'major' (7 majors), 'major_minor' (majors + minors), 'all' (all forex pairs)
    Uses MT5 path metadata to identify forex pairs and handles broker suffixes (EURUSDm etc.).
    """
    import re as _re
    MAJOR_PAIRS = {"EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD"}
    MINOR_PAIRS = {
        "EURGBP", "EURJPY", "EURCHF", "EURAUD", "EURCAD", "EURNZD",
        "GBPJPY", "GBPCHF", "GBPAUD", "GBPCAD", "GBPNZD",
        "AUDJPY", "AUDCHF", "AUDCAD", "AUDNZD",
        "CADJPY", "CADCHF", "NZDJPY", "NZDCHF", "NZDCAD",
        "CHFJPY",
    }
    FOREX_PFXS = ("EUR", "GBP", "AUD", "NZD", "CAD", "CHF", "HKD", "SGD",
                  "ZAR", "MXN", "NOK", "SEK", "DKK", "TRY", "CNH", "RUB", "USD", "JPY")

    def _clean(name: str) -> str:
        return _re.sub(r"[^A-Z]", "", name.upper())[:6]

    def _is_forex_name(name: str) -> bool:
        s = _clean(name)
        return len(s) == 6 and any(s.startswith(p) for p in FOREX_PFXS)

    try:
        import MetaTrader5 as mt5
        mt5_client.connect()
        raw_symbols = mt5.symbols_get()
        if not raw_symbols:
            return {"symbols": []}

        detected: list[str] = []
        for s in raw_symbols:
            path_lower = getattr(s, "path", "").lower()
            # Exclude clearly non-forex paths
            if any(x in path_lower for x in ["crypto", "stock", "shares", "equity", "equities",
                                              "index", "indices", "commodity", "energy", "metal"]):
                continue
            # Accept if path contains forex markers OR name matches forex pattern
            is_forex_path = any(x in path_lower for x in ["forex", "fx", "currency", "currencies", "majors", "minors", "exotics"])
            if not is_forex_path and not _is_forex_name(s.name):
                continue
            if not _is_forex_name(s.name):
                continue
            detected.append(s.name)

        def _canonical(name: str) -> str:
            return _re.sub(r"[^A-Z]", "", name.upper())[:6]

        if filter_type == "major":
            result = [n for n in detected if _canonical(n) in MAJOR_PAIRS]
        elif filter_type == "major_minor":
            result = [n for n in detected if _canonical(n) in (MAJOR_PAIRS | MINOR_PAIRS)]
        else:
            result = detected

        return {"symbols": sorted(result)}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/api/symbols/detect-stocks", dependencies=[Depends(require_key)])
def detect_stock_symbols(filter_type: str = "liquid_100"):
    try:
        import re
        import MetaTrader5 as mt5
        
        mt5_client.connect()
        raw_symbols = mt5.symbols_get()
        if not raw_symbols:
            return {"symbols": []}
            
        def is_crypto(s) -> bool:
            path_lower = getattr(s, 'path', '').lower()
            if 'cryptocurrencies' in path_lower or 'crypto' in path_lower:
                return True
            return is_crypto_symbol(s.name)
            
        def is_metal(s) -> bool:
            path_lower = getattr(s, 'path', '').lower()
            name_upper = s.name.upper()
            is_stock_path = any(x in path_lower for x in ['stock', 'shares', 'equities', 'indices', 'cfd'])
            if is_stock_path:
                return False
            if 'metal' in path_lower or 'spot_metals' in path_lower:
                return True
            if name_upper in ["GOLD", "SILVER", "PLATINUM", "PALLADIUM"] or any(name_upper.startswith(x) for x in ["XAU", "XAG", "XPD", "XPT"]):
                return True
            return False
            
        def is_forex(s) -> bool:
            path_lower = getattr(s, 'path', '').lower()
            if any(x in path_lower for x in ['stock', 'shares', 'equity', 'equities', 'index', 'indices', 'crypto', 'metal', 'commodity', 'energy']):
                return False
            if len(s.name) == 6 and s.name.isalpha():
                if not is_crypto(s) and not is_metal(s):
                    return True
            return False
            
        # Brokers structure equities differently:
        #   XM:     Stocks\US\Apple, Stocks\EU\Spain\ACS
        #   Exness: Standard\Stocks\AAPLm  (ticker + "m", no region folder)
        def is_us_stock(s) -> bool:
            if is_crypto(s) or is_metal(s) or is_forex(s):
                return False
            path_lower = getattr(s, 'path', '').lower()
            name = s.name
            # Skip leveraged / turbo derivative products
            if 'turbo' in path_lower or 'turbo' in name.lower():
                return False
            # XM explicitly marks US stocks by region in the path.
            if 'stocks\\us\\' in path_lower or 'stocks/us/' in path_lower:
                return True
            # Exness (and similar): anything under a Stocks folder is an equity.
            # Region isn't in the path, so accept all stocks here; the preset
            # filters (liquid_30/100) narrow it to US large-caps below.
            if 'stocks\\' in path_lower or 'stocks/' in path_lower or path_lower.endswith('stocks'):
                return True
            # Fallback: exchange-suffix patterns for US exchanges (.OQ/.N/.NY).
            if re.match(r'^[A-Z]{1,6}\.(OQ|N|NY)$', name, re.IGNORECASE):
                return True
            return False

        LIQUID_30 = {
            # Tickers
            "AAPL", "MSFT", "NVDA", "TSLA", "GOOGL", "GOOG", "AMZN", "META", "NFLX", "AMD",
            "JPM", "V", "MA", "PG", "JNJ", "WMT", "HD", "KO", "PEP", "MCD",
            "DIS", "XOM", "CVX", "CAT", "HON", "GE", "BA", "CSCO", "ORCL", "CRM",
            # Full Names
            "APPLE", "MICROSOFT", "NVIDIA", "TESLA", "ALPHABET", "GOOGLE", "AMAZON", "META", "FACEBOOK", "NETFLIX", "AMD",
            "JPMORGAN", "VISA", "MASTERCARD", "PROCTER", "JOHNSON & JOHNSON", "JOHNSON&JOHNSON", "JOHNSON_AND_JOHNSON", "JOHNSON_JOHNSON", "WALMART", "WAL-MART", "HOME_DEPOT", "HOME DEPOT", "COCA", "PEPSI", "MCDONALD",
            "DISNEY", "EXXON", "CHEVRON", "CATERPILLAR", "HONEYWELL", "GENERAL ELECTRIC", "GENERAL_ELECTRIC", "GENERALELEC", "GENERAL_ELEC", "BOEING", "CISCO", "ORACLE", "SALESFORCE"
        }

        LIQUID_100 = {
            # Tickers
            "AAPL", "MSFT", "NVDA", "TSLA", "GOOGL", "GOOG", "AMZN", "META", "NFLX", "AMD",
            "INTC", "QCOM", "AVGO", "TXN", "MU", "AMAT", "LRCX", "ASML", "ADI", "PANW",
            "FTNT", "CRWD", "DDOG", "ZS", "COIN", "PLTR", "CSCO", "ORCL", "CRM", "NOW",
            "WDAY", "ADBE", "INTU", "SNPS", "CDNS", "ANET", "MCHP", "ON", "MRVL",
            "JPM", "BAC", "WFC", "C", "MS", "GS", "V", "MA", "AXP", "PYPL", "SQ",
            "JNJ", "LLY", "UNH", "ABBV", "MRK", "PFE", "TMO", "ABT", "MDT", "GILD",
            "REGN", "VRTX", "ISRG",
            "WMT", "HD", "LOW", "COST", "TGT", "KO", "PEP", "MCD", "SBUX", "DIS",
            "CMG", "NKE", "NIO",
            "XOM", "CVX", "COP", "CAT", "DE", "HON", "GE", "UPS", "FDX", "BA",
            "LMT", "RTX", "NOC", "GD",
            "T", "VZ", "TMUS", "NEE", "D", "SO", "AEP",
            # Full Names
            "APPLE", "MICROSOFT", "NVIDIA", "TESLA", "ALPHABET", "GOOGLE", "AMAZON", "META", "FACEBOOK", "NETFLIX", "AMD",
            "INTEL", "QUALCOMM", "BROADCOM", "TEXAS", "MICRON", "APPLIED", "LAM", "ASML", "ANALOG", "PALO",
            "FORTINET", "CROWDSTRIKE", "DATADOG", "ZSCALER", "COINBASE", "PALANTIR", "CISCO", "ORACLE", "SALESFORCE", "SERVICENOW",
            "WORKDAY", "ADOBE", "INTUIT", "SYNOPSYS", "CADENCE", "ARISTA", "MICROCHIP", "ON_SEMI", "ON SEMI", "MARVELL",
            "JPMORGAN", "BANK_OF_AMERICA", "BANK OF AMERICA", "WELLS", "CITI", "GOLDMAN", "VISA", "MASTERCARD", "AMERICAN_EXPRESS", "AMERICAN EXPRESS", "PAYPAL", "BLOCK", "SQUARE",
            "JOHNSON & JOHNSON", "JOHNSON&JOHNSON", "JOHNSON_AND_JOHNSON", "JOHNSON_JOHNSON", "LILLY", "UNITEDHEALTH", "UNITED HEALTH", "ABBVIE", "MERCK", "PFE", "THERMO", "ABBOTT", "MEDTRONIC", "GILEAD",
            "REGENERON", "VERTEX", "INTUITIVE",
            "WALMART", "WAL-MART", "HOME_DEPOT", "HOME DEPOT", "LOWES", "COSTCO", "TARGET", "COCA", "PEPSI", "MCDONALD", "STARBUCKS", "DISNEY",
            "CHIPOTLE", "NIKE", "NIO",
            "EXXON", "CHEVRON", "CONOCO", "CATERPILLAR", "DEERE", "HONEYWELL", "GENERAL ELECTRIC", "GENERAL_ELECTRIC", "GENERALELEC", "GENERAL_ELEC", "UPS", "UNITED_PARCEL", "UNITED PARCEL", "FEDEX", "BOEING",
            "LOCKHEED", "RAYTHEON", "RTX", "NORTHROP", "GENERAL_DYNAMICS", "GENERAL DYNAMICS",
            "AT&T", "AT_T", "AT T", "VERIZON", "T-MOBILE", "T MOBILE", "T_MOBILE", "NEXTERA", "DUKE", "SOUTHERN", "AMERICAN_ELECTRIC", "AMERICAN ELECTRIC"
        }

        EXCLUDE = {"INDEX", "CASH", "FUTURE", "SPOT", "SWAP"}

        def matches_preset(base_name: str, preset_set: set[str]) -> bool:
            norm_base = re.sub(r"[^A-Z0-9]", "", base_name.upper())
            if not norm_base:
                return False
            for x in preset_set:
                norm_x = re.sub(r"[^A-Z0-9]", "", x.upper())
                if not norm_x:
                    continue
                if len(x) <= 3:
                    if norm_base == norm_x:
                        return True
                else:
                    if norm_base == norm_x or norm_base.startswith(norm_x):
                        return True
            return False

        def _stock_base(name: str) -> str:
            # Strip exchange suffix (.OQ) and a trailing broker "m" (Exness:
            # AAPLm -> AAPL) so names match the presets.
            base = name.split(".")[0].upper()
            if len(base) > 1 and base.endswith("M") and not base.endswith("MM"):
                base = base[:-1]
            return base

        detected = []
        for s in raw_symbols:
            if is_us_stock(s) and getattr(s, 'trade_mode', 0) > 0:
                if not any(x in s.name.upper() for x in EXCLUDE):
                    base = _stock_base(s.name)
                    # filter_type "all" returns every tradeable stock; the
                    # liquid_* presets narrow to US large-caps.
                    if filter_type == "liquid_30" and not matches_preset(base, LIQUID_30):
                        continue
                    elif filter_type == "liquid_100" and not matches_preset(base, LIQUID_100):
                        continue
                    detected.append(s.name)

        popular_us = ["APPLE", "MICROSOFT", "NVIDIA", "TESLA", "GOOGLE", "ALPHABET",
                      "AMAZON", "META", "NETFLIX", "AMD",
                      "AAPL", "MSFT", "NVDA", "TSLA", "GOOGL", "AMZN", "NFLX"]
        def sort_key(name):
            base = name.split(".")[0].upper()
            try:
                return (0, popular_us.index(base))
            except ValueError:
                return (1, name)

        return {"symbols": sorted(detected, key=sort_key),
                "note": f"Found {len(detected)} stocks with filter '{filter_type}'. If 0, your account type may not include stock CFDs."}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/api/symbols/search", dependencies=[Depends(require_key)])
def search_symbols(q: str = ""):
    """Debug: search all MT5 symbols by name substring. Shows name + path."""
    try:
        import MetaTrader5 as mt5
        mt5_client.connect()
        raw = mt5.symbols_get()
        if not raw:
            return {"results": []}
        q_up = q.strip().upper()
        results = [
            {"name": s.name, "path": getattr(s, "path", ""), "trade_mode": getattr(s, "trade_mode", -1)}
            for s in raw
            if not q_up or q_up in s.name.upper()
        ]
        return {"count": len(results), "results": results[:200]}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


class ValidateSymbolsRequest(BaseModel):
    symbols: list[str]
    # When set (e.g. 0.02 = 2%), also drop symbols whose live spread exceeds
    # this fraction of price. A wide spread means the symbol is too illiquid to
    # trade profitably. None skips the spread check (existence-only validation).
    max_spread_pct: float | None = None


@app.post("/api/symbols/validate", dependencies=[Depends(require_key)])
def validate_symbols(req: ValidateSymbolsRequest):
    """Check which symbols exist on MT5, returning the broker's actual name
    (resolution handles casing and ticker suffixes, e.g. APPLE -> Apple).

    When ``max_spread_pct`` is provided, symbols that resolve but quote a
    spread wider than that fraction of price are reported separately in
    ``wide_spread`` (with their measured spread) so the caller can drop them.
    """
    # Attach to the terminal first — without this, _ensure_symbol() fails for
    # every symbol (reporting them all "invalid"), which is what made
    # "กรองเหรียญ" wipe the whole list.
    mt5_client.connect()

    valid, invalid, wide_spread = [], [], []
    limit = req.max_spread_pct
    for sym in req.symbols:
        try:
            resolved = mt5_client._ensure_symbol(sym)
        except Exception:
            invalid.append(sym)
            continue

        if limit and limit > 0:
            try:
                tick = mt5_client.get_tick(resolved)
                bid, ask = float(tick.get("bid") or 0.0), float(tick.get("ask") or 0.0)
                if bid > 0 and ask >= bid:
                    spread_pct = (ask - bid) / bid
                    if spread_pct > limit:
                        wide_spread.append({"symbol": resolved, "spread_pct": round(spread_pct, 5)})
                        continue
            except Exception as e:
                # If we can't price it, treat existence as enough — don't drop it
                # just because a one-off tick fetch failed.
                log.debug("Spread check skipped for %s: %s", resolved, e)

        valid.append(resolved)
    return {"valid": valid, "invalid": invalid, "wide_spread": wide_spread}


@app.post("/api/trade", dependencies=[Depends(require_key)])
def direct_trade(req: DirectTradeRequest):
    try:
        from .models import Action
        action = req.action.upper()
        if action not in {"BUY", "SELL"}:
            raise HTTPException(status_code=400, detail="action must be BUY or SELL")
        symbol = req.symbol.upper()

        # Check market open/closed status
        is_open, msg = check_market_open(symbol)
        if not is_open:
            log.warning("Trade rejected — %s %s: market closed (%s)", action, symbol, msg)
            raise HTTPException(status_code=400, detail=f"ตลาดปิด ซื้อขายไม่ได้: {msg}")

        action_enum = Action.BUY if action == "BUY" else Action.SELL
        sl, tp = req.sl, req.tp
        execution = None
        if req.signal_price is not None and req.sl is not None:
            rec = Recommendation(
                symbol=symbol,
                timeframe=req.timeframe or "",
                price=req.signal_price,
                action=action_enum,
                confidence=1.0,
                stop_loss=req.sl,
                take_profit=req.tp,
                indicators=IndicatorSnapshot(
                    symbol=symbol,
                    timeframe=req.timeframe or "",
                    price=req.signal_price,
                    strategy_name=req.strategy or "manual-preview",
                ),
            )
            execution = manager._prepare_market_execution(rec)
            sl, tp = rec.stop_loss, rec.take_profit

        result = mt5_client.order_send(
            symbol=symbol,
            action=action_enum,
            lot=req.lot,
            sl=sl,
            tp=tp,
            comment="metabot-direct",
            magic=magic_for_symbol(symbol),
        )
        if execution is not None:
            result["execution"] = execution
        if not result.get("ok"):
            mt5_msg = result.get("comment", "Order failed")
            log.warning("MT5 order rejected — %s %s lot=%.2f: %s", action, symbol, req.lot, mt5_msg)
            raise HTTPException(status_code=400, detail=mt5_msg)
        return result
    except HTTPException:
        raise
    except ValueError as e:
        log.warning("Trade rejected — %s %s lot=%.2f: %s", action, symbol, req.lot, e)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error("Trade error — %s %s: %s", action, symbol, e)
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/api/logs", dependencies=[Depends(require_key)])
def get_logs(limit: int = 100, level: str | None = None):
    from . import log_store
    return {"logs": log_store.get(limit=limit, level=level or None)}


@app.get("/api/history", dependencies=[Depends(require_key)])
def get_history(days: int = 30):
    try:
        mt5_client.connect()
        return {"history": mt5_client.history_deals(days)}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


