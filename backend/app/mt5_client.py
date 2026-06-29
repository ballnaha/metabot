"""Thin wrapper around the MetaTrader5 terminal.

All MT5 access goes through this module so the rest of the app never touches
the raw library. The MetaTrader5 package only works on Windows with a running
terminal.
"""
from __future__ import annotations

import threading
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

TZ_TH = timezone(timedelta(hours=7))

import pandas as pd

try:
    import MetaTrader5 as mt5
except ImportError:  # pragma: no cover - allows import on non-Windows for dev
    mt5 = None

from .config import settings
from .models import Action

# Map our string timeframes to MT5 constants (resolved lazily so the module
# imports even when MetaTrader5 is not installed).
_TIMEFRAME_NAMES = {
    "M1": "TIMEFRAME_M1",
    "M5": "TIMEFRAME_M5",
    "M15": "TIMEFRAME_M15",
    "M30": "TIMEFRAME_M30",
    "H1": "TIMEFRAME_H1",
    "H4": "TIMEFRAME_H4",
    "D1": "TIMEFRAME_D1",
    "W1": "TIMEFRAME_W1",
}

# Reentrant: the MetaTrader5 library is NOT thread-safe (single global session),
# so every call that touches mt5.* must serialise on this lock. Many public
# functions here call each other (e.g. order_send -> _ensure_symbol -> ...), so
# the lock must be reentrant or those nested calls would deadlock.
_lock = threading.RLock()


def _mt5_server_timestamp_to_utc(timestamp: int | float) -> float:
    """MT5 deal/position times are broker server wall-clock seconds.

    Many brokers run MT5 on UTC+3. Treat the raw timestamp as server-local
    wall time first, then convert it back to a real UTC timestamp.
    """
    server_tz = timezone(timedelta(hours=settings.mt5_server_utc_offset))
    server_time = datetime.fromtimestamp(timestamp, tz=timezone.utc).replace(tzinfo=server_tz)
    return server_time.timestamp()


def _mt5_server_time_to_bangkok(timestamp: int | float) -> str:
    utc_timestamp = _mt5_server_timestamp_to_utc(timestamp)
    return datetime.fromtimestamp(utc_timestamp, tz=TZ_TH).strftime("%Y-%m-%dT%H:%M:%S")


class MT5Error(RuntimeError):
    pass


def _require_mt5():
    if mt5 is None:
        raise MT5Error(
            "MetaTrader5 package is not available. Install it on Windows "
            "with a running MT5 terminal: pip install MetaTrader5"
        )


def timeframe_const(tf: str) -> int:
    _require_mt5()
    name = _TIMEFRAME_NAMES.get(tf.upper())
    if name is None:
        raise MT5Error(f"Unknown timeframe: {tf}")
    return getattr(mt5, name)


def connect() -> Dict[str, Any]:
    """Initialise / log into the terminal. Idempotent."""
    _require_mt5()
    with _lock:
        kwargs: Dict[str, Any] = {}
        if settings.mt5_path:
            kwargs["path"] = settings.mt5_path
        if settings.mt5_login:
            kwargs.update(
                login=int(settings.mt5_login),
                password=settings.mt5_password,
                server=settings.mt5_server,
            )
        if not mt5.initialize(**kwargs):
            code, msg = mt5.last_error()
            raise MT5Error(f"MT5 initialize failed ({code}): {msg}")
        info = mt5.account_info()
        if info is None:
            raise MT5Error("Connected to terminal but no account is logged in.")
        return account_info()


def shutdown() -> None:
    if mt5 is not None:
        with _lock:
            mt5.shutdown()


def account_info() -> Dict[str, Any]:
    _require_mt5()
    with _lock:
        info = mt5.account_info()
    if info is None:
        raise MT5Error("No account info — is the terminal logged in?")
    return {
        "login": info.login,
        "server": info.server,
        "currency": info.currency,
        "balance": info.balance,
        "equity": info.equity,
        "margin": info.margin,
        "margin_free": info.margin_free,
        "profit": info.profit,
        "leverage": info.leverage,
    }


def get_rates(symbol: str, timeframe: str, bars: int = 200) -> pd.DataFrame:
    """Return recent OHLCV candles as a DataFrame (oldest first)."""
    _require_mt5()
    with _lock:
        symbol = _ensure_symbol(symbol)
        rates = mt5.copy_rates_from_pos(symbol, timeframe_const(timeframe), 0, bars)
    if rates is None or len(rates) == 0:
        code, msg = mt5.last_error()
        raise MT5Error(f"No rates for {symbol} {timeframe} ({code}): {msg}")
    df = pd.DataFrame(rates)
    df["time"] = pd.to_datetime(df["time"], unit="s") + pd.Timedelta(hours=7)
    return df


def get_tick(symbol: str) -> Dict[str, float]:
    _require_mt5()
    with _lock:
        symbol = _ensure_symbol(symbol)
        tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        raise MT5Error(f"No tick for {symbol}")
    return {"bid": tick.bid, "ask": tick.ask, "last": tick.last, "time": _mt5_server_timestamp_to_utc(tick.time)}


def symbol_info(symbol: str) -> Dict[str, Any]:
    _require_mt5()
    with _lock:
        symbol = _ensure_symbol(symbol)
        s = mt5.symbol_info(symbol)
    return {
        "name": s.name,
        "digits": s.digits,
        "point": s.point,
        "spread": getattr(s, "spread", 0),
        "volume_min": s.volume_min,
        "volume_max": s.volume_max,
        "volume_step": s.volume_step,
        "trade_contract_size": s.trade_contract_size,
        "trade_tick_value": s.trade_tick_value,
        "trade_tick_size": s.trade_tick_size,
        # Swap charged per lot per night held (account currency), long vs short.
        "swap_long": getattr(s, "swap_long", 0.0),
        "swap_short": getattr(s, "swap_short", 0.0),
    }


# Cache resolved symbol names so we don't scan all symbols every call.
_symbol_resolution: Dict[str, str] = {}

# Aliases for instruments whose name differs by more than a suffix between
# brokers (e.g. XM calls spot gold "GOLD", Exness calls it "XAUUSD"). Each
# requested name maps to candidate base names tried in order.
_SYMBOL_ALIASES: Dict[str, tuple[str, ...]] = {
    "GOLD": ("XAUUSD", "GOLD"),
    "SILVER": ("XAGUSD", "SILVER"),
}


def resolve_symbol(symbol: str) -> str:
    """Map a requested ticker to the actual broker symbol name.

    Brokers add suffixes/prefixes (Exness uses a trailing "m": EURUSD->EURUSDm,
    XAUUSD->XAUUSDm; others use .OQ / #AAPL) and sometimes a different base name
    entirely (GOLD vs XAUUSD). Resolve in order: exact, alias bases, common
    variants, then a full scan by base ticker.
    """
    if symbol in _symbol_resolution:
        return _symbol_resolution[symbol]

    import re

    # 1. Exact name works as-is.
    if mt5.symbol_select(symbol, True):
        _symbol_resolution[symbol] = symbol
        return symbol

    all_syms = mt5.symbols_get() or []

    # 2. Case-insensitive exact name match (e.g. "APPLE" -> "Apple").
    want = symbol.upper()
    for s in all_syms:
        if s.name.upper() == want and mt5.symbol_select(s.name, True):
            _symbol_resolution[symbol] = s.name
            return s.name

    # 3. Try alias bases + common broker variants. Aliases (GOLD->XAUUSD) are
    #    tried first so spot gold resolves regardless of broker; each base is
    #    also tried with the Exness "m" suffix.
    base = symbol.upper().lstrip("#@").split(".")[0]
    bases = _SYMBOL_ALIASES.get(base, (base,))
    candidates: list[str] = []
    for b in bases:
        candidates += [f"{b}.OQ", f"{b}.N", f"{b}.NY", f"{b}.US",
                       b, f"{b}m", f"#{b}"]
    for cand in candidates:
        if mt5.symbol_select(cand, True):
            _symbol_resolution[symbol] = cand
            return cand

    # 4. Scan every symbol for one whose base ticker matches.
    for s in all_syms:
        s_base = re.sub(r'^[#@]|\..*$', '', s.name, flags=re.IGNORECASE).upper()
        if s_base == base and mt5.symbol_select(s.name, True):
            _symbol_resolution[symbol] = s.name
            return s.name

    return symbol  # give up — caller will raise a clear error


def _ensure_symbol(symbol: str) -> str:
    """Select the symbol in Market Watch, resolving broker naming. Returns the
    actual broker symbol name to use for subsequent calls."""
    resolved = resolve_symbol(symbol)
    if not mt5.symbol_select(resolved, True):
        raise MT5Error(
            f"Symbol {symbol} not found on this account. "
            f"Your broker may not offer it, or it uses a different name."
        )
    return resolved


def positions(symbol: Optional[str] = None) -> List[Dict[str, Any]]:
    _require_mt5()
    with _lock:
        raw = mt5.positions_get(symbol=symbol) if symbol else mt5.positions_get()
    raw = raw or []
    out = []
    for p in raw:
        try:
            s_info = symbol_info(p.symbol)
            contract_size = s_info.get("trade_contract_size", 1.0)
        except Exception:
            contract_size = 1.0

        out.append(
            {
                "ticket": p.ticket,
                "symbol": p.symbol,
                "type": "BUY" if p.type == mt5.POSITION_TYPE_BUY else "SELL",
                "volume": p.volume,
                "price_open": p.price_open,
                "sl": p.sl,
                "tp": p.tp,
                "price_current": p.price_current,
                "profit": p.profit,
                "magic": p.magic,
                "comment": p.comment,
                "contract_size": contract_size,
                "time": _mt5_server_time_to_bangkok(p.time),
                # Real UTC epoch of the open, for computing how long it's held.
                "time_utc": _mt5_server_timestamp_to_utc(p.time),
            }
        )
    return out


def history_deals(days: int = 30) -> List[Dict[str, Any]]:
    _require_mt5()
    from datetime import datetime, timedelta
    from_date = datetime.now() - timedelta(days=days)
    to_date = datetime.now() + timedelta(days=1)
    
    with _lock:
        deals = mt5.history_deals_get(from_date, to_date)
    deals = deals or []

    # Map each position_id to its entry (IN) deal so we can compute the price
    # move % on the closing (OUT) deal. The trade direction is taken from the
    # entry deal: an IN of type BUY means the position was long (its OUT is a
    # SELL), and vice versa.
    entry_by_position: Dict[int, Any] = {}
    for d in deals:
        if d.type not in (mt5.DEAL_TYPE_BUY, mt5.DEAL_TYPE_SELL):
            continue
        if d.entry == mt5.DEAL_ENTRY_IN and d.position_id:
            entry_by_position.setdefault(d.position_id, d)

    out = []
    for d in deals:
        if d.type not in (mt5.DEAL_TYPE_BUY, mt5.DEAL_TYPE_SELL):
            continue

        entry_label = "IN" if d.entry == mt5.DEAL_ENTRY_IN else ("OUT" if d.entry == mt5.DEAL_ENTRY_OUT else "INOUT")

        # Price move % on close, relative to the position's entry price.
        entry_price = None
        pct = None
        if entry_label == "OUT":
            ind = entry_by_position.get(d.position_id)
            if ind is not None and ind.price:
                entry_price = ind.price
                # Long if the entry deal was a BUY.
                if ind.type == mt5.DEAL_TYPE_BUY:
                    pct = (d.price - ind.price) / ind.price * 100.0
                else:
                    pct = (ind.price - d.price) / ind.price * 100.0

        out.append(
            {
                "ticket": d.ticket,
                "order": d.order,
                "position_id": d.position_id,
                "time": _mt5_server_time_to_bangkok(d.time),
                "symbol": d.symbol,
                "type": "BUY" if d.type == mt5.DEAL_TYPE_BUY else "SELL",
                "entry": entry_label,
                "volume": d.volume,
                "price": d.price,
                "entry_price": entry_price,
                "pct": pct,
                "commission": d.commission,
                "swap": d.swap,
                "profit": d.profit,
                "magic": d.magic,
                "comment": d.comment,
            }
        )
    # Sort by time descending
    out.sort(key=lambda x: x["time"], reverse=True)
    return out


def normalize_lot(symbol: str, lot: float) -> float:
    s = symbol_info(symbol)
    step = s["volume_step"] or 0.01
    lot = max(s["volume_min"], min(lot, s["volume_max"]))
    # round down to the nearest step
    steps = round(lot / step)
    return round(steps * step, 2)


def modify_position_sl(ticket: int, sl: float, tp: Optional[float] = None) -> Dict[str, Any]:
    """Move stop-loss (and optionally take-profit) on an open position."""
    _require_mt5()
    with _lock:
        pos = mt5.positions_get(ticket=ticket)
        if not pos:
            raise MT5Error(f"Position {ticket} not found")
        p = pos[0]
        request = {
            "action": mt5.TRADE_ACTION_SLTP,
            "symbol": p.symbol,
            "position": ticket,
            "sl": float(sl),
            "tp": float(tp) if tp is not None else p.tp,
        }
        result = mt5.order_send(request)
    if result is None:
        code, msg = mt5.last_error()
        raise MT5Error(f"modify SL returned None ({code}): {msg}")
    return {
        "ok": result.retcode == mt5.TRADE_RETCODE_DONE,
        "retcode": result.retcode,
        "comment": result.comment,
    }


def order_send(
    symbol: str,
    action: Action,
    lot: float,
    sl: Optional[float] = None,
    tp: Optional[float] = None,
    deviation: int = 20,
    comment: str = "metabot",
    magic: Optional[int] = None,
) -> Dict[str, Any]:
    """Send a market order. Returns a normalised result dict."""
    _require_mt5()
    with _lock:
        symbol = _ensure_symbol(symbol)
        tick = mt5.symbol_info_tick(symbol)
        if action == Action.BUY:
            order_type = mt5.ORDER_TYPE_BUY
            price = tick.ask
        elif action == Action.SELL:
            order_type = mt5.ORDER_TYPE_SELL
            price = tick.bid
        else:
            raise MT5Error("order_send requires BUY or SELL")

        lot = normalize_lot(symbol, lot)
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": float(lot),
            "type": order_type,
            "price": price,
            "deviation": deviation,
            "magic": settings.magic if magic is None else int(magic),
            "comment": comment,
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": _filling_mode(symbol),
        }
        if sl:
            request["sl"] = float(sl)
        if tp:
            request["tp"] = float(tp)

        result = mt5.order_send(request)
    if result is None:
        code, msg = mt5.last_error()
        raise MT5Error(f"order_send returned None ({code}): {msg}")
    ok = result.retcode == mt5.TRADE_RETCODE_DONE
    return {
        "ok": ok,
        "retcode": result.retcode,
        "comment": result.comment,
        "order": result.order,
        "deal": result.deal,
        "price": result.price,
        "volume": result.volume,
    }


def close_position(ticket: int, deviation: int = 20) -> Dict[str, Any]:
    _require_mt5()
    with _lock:
        pos = mt5.positions_get(ticket=ticket)
        if not pos:
            raise MT5Error(f"Position {ticket} not found")
        p = pos[0]
        tick = mt5.symbol_info_tick(p.symbol)
        if p.type == mt5.POSITION_TYPE_BUY:
            order_type = mt5.ORDER_TYPE_SELL
            price = tick.bid
        else:
            order_type = mt5.ORDER_TYPE_BUY
            price = tick.ask
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": p.symbol,
            "volume": p.volume,
            "type": order_type,
            "position": p.ticket,
            "price": price,
            "deviation": deviation,
            "magic": settings.magic,
            "comment": "metabot-close",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": _filling_mode(p.symbol),
        }
        result = mt5.order_send(request)
    if result is None:
        code, msg = mt5.last_error()
        raise MT5Error(f"close order_send returned None ({code}): {msg}")
    return {
        "ok": result.retcode == mt5.TRADE_RETCODE_DONE,
        "retcode": result.retcode,
        "comment": result.comment,
    }


def _filling_mode(symbol: str) -> int:
    """Pick a filling mode the symbol supports."""
    s = mt5.symbol_info(symbol)
    mode = getattr(s, "filling_mode", 0)
    # filling_mode is a bitmask of allowed modes
    if mode & 1:  # SYMBOL_FILLING_FOK
        return mt5.ORDER_FILLING_FOK
    if mode & 2:  # SYMBOL_FILLING_IOC
        return mt5.ORDER_FILLING_IOC
    return mt5.ORDER_FILLING_RETURN
