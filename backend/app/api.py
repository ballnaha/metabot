"""FastAPI server exposing the bot to the Next.js dashboard and any client.

Auth: every request must send header  X-API-Key: <settings.api_key>.
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import mt5_client, strategy, worker
from .config import settings
from .models import AnalyzeRequest, ConfirmRequest
from .trader import manager

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("metabot.api")

app = FastAPI(title="MetaBot API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your dashboard origin in production
    allow_methods=["*"],
    allow_headers=["*"],
)


async def require_key(x_api_key: str | None = Header(default=None)) -> None:
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
async def health():
    try:
        acct = mt5_client.account_info()
        return {"status": "ok", "mt5": "connected", "account": acct["login"]}
    except Exception as e:  # noqa: BLE001
        return {"status": "ok", "mt5": "disconnected", "detail": str(e)}


@app.get("/api/account", dependencies=[Depends(require_key)])
async def account():
    try:
        return mt5_client.account_info()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/api/symbols", dependencies=[Depends(require_key)])
async def symbols():
    return {"symbols": settings.symbol_list, "default_timeframe": settings.default_timeframe}


@app.get("/api/strategies", dependencies=[Depends(require_key)])
async def strategies():
    return {
        "strategies": strategy.list_strategies(),
        "default": settings.strategy,
        "use_ai_default": settings.use_ai,
    }


@app.get("/api/positions", dependencies=[Depends(require_key)])
async def positions():
    try:
        return {"positions": mt5_client.positions()}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/api/analyze", dependencies=[Depends(require_key)])
async def analyze(req: AnalyzeRequest):
    try:
        rec, pending = await manager.analyze_and_stage(
            req.symbol, req.timeframe, req.bars, req.strategy, req.use_ai
        )
        return {
            "recommendation": rec.model_dump(),
            "pending": pending.model_dump() if pending else None,
            "require_confirm": settings.require_confirm,
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
                "price": rec.price,
                "summary": rec.summary,
            }
        )

    rank = {"BUY": 0, "SELL": 0, "HOLD": 1}
    items.sort(key=lambda r: (rank.get(r["action"], 2), -r["confidence"]))
    return {"results": items}


@app.get("/api/pending", dependencies=[Depends(require_key)])
async def pending():
    return {"pending": [p.model_dump() for p in manager.list_pending()]}


@app.post("/api/confirm", dependencies=[Depends(require_key)])
async def confirm(req: ConfirmRequest):
    try:
        p = manager.confirm(req.pending_id, req.lot)
        return p.model_dump()
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.post("/api/cancel", dependencies=[Depends(require_key)])
async def cancel(req: ConfirmRequest):
    p = manager.cancel(req.pending_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Unknown pending trade")
    return p.model_dump()


@app.post("/api/positions/{ticket}/close", dependencies=[Depends(require_key)])
async def close(ticket: int):
    try:
        return mt5_client.close_position(ticket)
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
    symbols: str | None = None
    default_timeframe: str | None = None
    strategy: str | None = None
    risk_per_trade: float | None = None
    max_lot: float | None = None
    magic: int | None = None
    atr_sl_mult: float | None = None
    default_rr: float | None = None
    require_confirm: bool | None = None
    auto_trade_interval: int | None = None
    position_sizing_mode: str | None = None
    max_open_trades: int | None = None
    stake_amount: float | None = None
    api_key: str | None = None


@app.get("/api/settings", dependencies=[Depends(require_key)])
async def get_settings_endpoint():
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
        "symbols": settings.symbols,
        "default_timeframe": settings.default_timeframe,
        "strategy": settings.strategy,
        "risk_per_trade": settings.risk_per_trade,
        "max_lot": settings.max_lot,
        "magic": settings.magic,
        "atr_sl_mult": settings.atr_sl_mult,
        "default_rr": settings.default_rr,
        "require_confirm": settings.require_confirm,
        "auto_trade_interval": settings.auto_trade_interval,
        "position_sizing_mode": settings.position_sizing_mode,
        "max_open_trades": settings.max_open_trades,
        "stake_amount": settings.stake_amount,
        "api_key": settings.api_key,
    }


@app.post("/api/settings", dependencies=[Depends(require_key)])
async def update_settings_endpoint(req: SettingsUpdateRequest):
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    
    # Check if mt5 settings are changed to trigger reconnect
    mt5_keys = {"mt5_login", "mt5_password", "mt5_server", "mt5_path"}
    mt5_changed = any(k in updates for k in mt5_keys)
    
    settings.update_settings(updates)
    
    warning_msg = None
    if mt5_changed:
        try:
            mt5_client.shutdown()
            mt5_client.connect()
        except Exception as e:
            warning_msg = f"Settings saved, but MT5 reconnection failed: {e}"
            log.warning(warning_msg)
            
    return {"status": "saved", "warning": warning_msg}


class DirectTradeRequest(BaseModel):
    symbol: str
    action: str  # BUY | SELL
    lot: float
    sl: float | None = None
    tp: float | None = None


@app.get("/api/symbols/{symbol}/tick", dependencies=[Depends(require_key)])
async def get_symbol_tick(symbol: str):
    try:
        return mt5_client.get_tick(symbol.upper())
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/api/symbols/detect-crypto", dependencies=[Depends(require_key)])
async def detect_crypto_symbols():
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
            crypto_pat = re.compile(
                r'^(BTC|ETH|SOL|XRP|LTC|DOGE|ADA|DOT|LINK|AVAX|SHIB|UNI)USD', 
                re.IGNORECASE
            )
            return bool(crypto_pat.match(s.name))
            
        detected = []
        for s in raw_symbols:
            if is_crypto(s) and getattr(s, 'trade_mode', 0) > 0:
                if not any(x in s.name.upper() for x in ["EUR", "GBP", "JPY", "BTC", "ETH"]) or s.name.upper() in ["BTCUSD", "ETHUSD"]:
                    if not s.name.upper().startswith("CRYPTO_") and "VAULT" not in s.name.upper():
                        detected.append(s.name)
        
        popular = ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "LTCUSD", "DOGEUSD"]
        sorted_detected = sorted(
            detected, 
            key=lambda x: (0, popular.index(x.upper())) if x.upper() in popular else (1, x)
        )
        return {"symbols": sorted_detected}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/api/symbols/detect-metals", dependencies=[Depends(require_key)])
async def detect_metal_symbols():
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


@app.get("/api/symbols/detect-stocks", dependencies=[Depends(require_key)])
async def detect_stock_symbols():
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
            crypto_pat = re.compile(
                r'^(BTC|ETH|SOL|XRP|LTC|DOGE|ADA|DOT|LINK|AVAX|SHIB|UNI)USD', 
                re.IGNORECASE
            )
            return bool(crypto_pat.match(s.name))
            
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
            if len(s.name) == 6 and s.name.isalpha():
                if not is_crypto(s) and not is_metal(s):
                    return True
            return False
            
        def is_stock(s) -> bool:
            if is_crypto(s) or is_metal(s) or is_forex(s):
                return False
            path_lower = getattr(s, 'path', '').lower()
            if any(x in path_lower for x in ['stock', 'shares', 'equities', 'cfd']):
                return True
            if len(s.name) <= 5 and s.name.isalpha():
                if s.name.upper() not in ["GOLD", "SILVER"]:
                    return True
            return False
            
        detected = []
        for s in raw_symbols:
            if is_stock(s) and getattr(s, 'trade_mode', 0) > 0:
                if not any(x in s.name.upper() for x in ["INDEX", "CASH", "FUTURE"]):
                    detected.append(s.name)
                    
        return {"symbols": sorted(detected)}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/api/trade", dependencies=[Depends(require_key)])
async def direct_trade(req: DirectTradeRequest):
    try:
        from .models import Action
        action_enum = Action.BUY if req.action.upper() == "BUY" else Action.SELL
        result = mt5_client.order_send(
            symbol=req.symbol.upper(),
            action=action_enum,
            lot=req.lot,
            sl=req.sl,
            tp=req.tp,
            comment="metabot-direct"
        )
        if not result.get("ok"):
            raise HTTPException(status_code=400, detail=result.get("comment", "Order failed"))
        return result
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/api/history", dependencies=[Depends(require_key)])
async def get_history(days: int = 30):
    try:
        mt5_client.connect()
        return {"history": mt5_client.history_deals(days)}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


