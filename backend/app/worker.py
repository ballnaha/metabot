"""Background worker: auto-trade loop + position monitor + Telegram notifications."""
from __future__ import annotations

import asyncio
import logging
import urllib.request
import json
import traceback
from datetime import datetime, timezone, timedelta

from .config import settings
from .market_groups import market_group
from .trader import manager
from .models import Action, Recommendation
from . import log_store

log = logging.getLogger("metabot.worker")

TZ_TH = timezone(timedelta(hours=7))

_worker_task = None
_monitor_task = None


def send_telegram_notification(text: str) -> None:
    if not settings.telegram_enabled:
        return
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        log.warning("Telegram notification skipped: token or chat_id not set.")
        return
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    payload = {"chat_id": settings.telegram_chat_id, "text": text, "parse_mode": "Markdown"}
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            resp.read()
    except Exception as e:
        log.error("Failed to send Telegram notification: %s", e)


def _fmt(v, d: int = 2) -> str:
    try:
        return f"{v:,.{d}f}"
    except (TypeError, ValueError):
        return str(v)


def _symbol_bot_enabled(symbol: str) -> bool:
    group = market_group(symbol)
    if group == "gold":  return settings.gold_bot_enabled
    if group == "stock": return settings.stock_bot_enabled
    return settings.bot_enabled


def _symbol_timeframe(symbol: str) -> str:
    if market_group(symbol) == "stock":
        return settings.stock_timeframe
    return settings.default_timeframe


def _symbol_strategy(symbol: str) -> str:
    if market_group(symbol) == "stock":
        return settings.stock_strategy
    return settings.strategy


def _symbol_use_ai(symbol: str) -> bool:
    if market_group(symbol) == "stock":
        return settings.stock_use_ai
    return settings.use_ai


def format_trade_executed(rec: Recommendation, lot: float, status: str) -> str:
    emoji = {"BUY": "🟢", "SELL": "🔴"}.get(rec.action.value, "⚪")
    header = "⚡ *Trade Executed*" if status == "executed" else "❌ *Execution Failed*"
    lines = [
        f"🤖 *MetaBot*  {header}",
        f"{emoji} *{rec.action.value}*  `{rec.symbol}`  ({rec.timeframe})",
        f"Entry: `{_fmt(rec.price, 5)}`  |  Lot: `{lot}`",
    ]
    if rec.stop_loss:
        dist = abs(rec.price - rec.stop_loss)
        lines.append(f"SL: `{_fmt(rec.stop_loss, 5)}`  (dist `{_fmt(dist, 5)}`)")
    if rec.take_profit:
        dist = abs(rec.take_profit - rec.price)
        lines.append(f"TP: `{_fmt(rec.take_profit, 5)}`  (dist `{_fmt(dist, 5)}`)")
    if rec.stop_loss and rec.take_profit:
        sl_d = abs(rec.price - rec.stop_loss)
        tp_d = abs(rec.take_profit - rec.price)
        rr = tp_d / sl_d if sl_d > 0 else 0
        lines.append(f"R:R  `1:{rr:.1f}`")
    lines.append(f"Conf: *{rec.confidence:.0%}*  |  Strategy: _{rec.indicators.strategy_name}_")
    return "\n".join(lines)


def _notify_position_closed(old_pos: dict) -> None:
    from . import mt5_client
    symbol = old_pos["symbol"]
    try:
        deals = mt5_client.history_deals(days=1)
        close_deal = next(
            (d for d in deals if d["symbol"] == symbol and d["entry"] == "OUT"), None
        )
        if close_deal:
            profit = close_deal["profit"] + close_deal.get("commission", 0) + close_deal.get("swap", 0)
            exit_price = close_deal["price"]
        else:
            profit = old_pos.get("profit", 0)
            exit_price = old_pos.get("price_current", 0)
    except Exception:
        profit = old_pos.get("profit", 0)
        exit_price = old_pos.get("price_current", 0)

    try:
        open_dt = datetime.fromisoformat(old_pos["time"]).replace(tzinfo=None)
        now_naive = datetime.now(TZ_TH).replace(tzinfo=None)
        total_min = int((now_naive - open_dt).total_seconds() // 60)
        hold_str = f"{total_min // 60}h {total_min % 60}m" if total_min >= 60 else f"{total_min}m"
    except Exception:
        hold_str = "—"

    sign = "+" if profit >= 0 else ""
    level = "success" if profit >= 0 else "error"
    log_store.push(
        level, "closed",
        f"ปิด {old_pos.get('type','?')} {symbol} P/L {sign}{_fmt(profit)} (ถือ {hold_str})",
        {"symbol": symbol, "profit": profit, "hold": hold_str,
         "entry": _fmt(old_pos["price_open"], 5), "exit": _fmt(exit_price, 5),
         "ticket": old_pos["ticket"]},
    )
    send_telegram_notification(
        f"{'💰' if profit >= 0 else '💸'} *Position Closed*\n"
        f"`{symbol}`  {old_pos.get('type','?')}  {old_pos.get('volume','?')} lot\n"
        f"Entry: `{_fmt(old_pos['price_open'], 5)}`  →  Exit: `{_fmt(exit_price, 5)}`\n"
        f"P/L: `{sign}{_fmt(profit)}`  |  Hold: `{hold_str}`\n"
        f"Ticket: `{old_pos['ticket']}`"
    )


def _notify_equity_alert(equity: float, high: float, drop_pct: float) -> None:
    log_store.push(
        "warning", "equity_alert",
        f"Equity ลดลง {drop_pct:.1%} จาก {_fmt(high)} → {_fmt(equity)}",
        {"equity": equity, "high": high, "drop_pct": round(drop_pct * 100, 2)},
    )
    send_telegram_notification(
        f"⚠️ *Equity Alert*\n"
        f"Equity ลดลง *{drop_pct:.1%}* จาก session สูงสุด\n"
        f"สูงสุด: `{_fmt(high)}`  →  ปัจจุบัน: `{_fmt(equity)}`"
    )


def _send_daily_summary() -> None:
    try:
        from . import mt5_client
        acct = mt5_client.account_info()
        deals = mt5_client.history_deals(days=1)
        closed = [d for d in deals if d.get("entry") == "OUT"]
        total = sum(d.get("profit", 0) + d.get("commission", 0) + d.get("swap", 0) for d in closed)
        wins = sum(1 for d in closed if d.get("profit", 0) > 0)
        losses = len(closed) - wins
        sign = "+" if total >= 0 else ""
        date_str = datetime.now(TZ_TH).strftime("%d/%m/%Y")
        log_store.push(
            "info", "daily_summary",
            f"Daily Summary {date_str} — P/L {sign}{_fmt(total)} | {wins}W {losses}L",
            {"date": date_str, "total": total, "wins": wins, "losses": losses,
             "balance": acct["balance"], "equity": acct["equity"]},
        )
        send_telegram_notification(
            f"{'📈' if total >= 0 else '📉'} *Daily Summary — {date_str}*\n"
            f"Balance: `{_fmt(acct['balance'])} {acct['currency']}`\n"
            f"Equity:  `{_fmt(acct['equity'])}`\n"
            f"P/L วันนี้: `{sign}{_fmt(total)}`\n"
            f"Trades: {len(closed)}  ✅ {wins} Win  ❌ {losses} Loss"
        )
    except Exception as e:
        log.error("Daily summary error: %s", e)


async def position_monitor_loop() -> None:
    """Runs every 15 s: detect closed positions, equity alert, daily summary."""
    await asyncio.sleep(10)

    known_positions: dict[int, dict] = {}
    session_equity_high: float | None = None
    equity_alert_cooldown = 0
    last_summary_date = None

    while True:
        try:
            from . import mt5_client

            now_th = datetime.now(TZ_TH)
            if now_th.hour == 8 and last_summary_date != now_th.date():
                _send_daily_summary()
                last_summary_date = now_th.date()

            try:
                current_list = mt5_client.positions()
                current = {p["ticket"]: p for p in current_list}
            except Exception as e:
                log.debug("Monitor: can't fetch positions: %s", e)
                await asyncio.sleep(15)
                continue

            for ticket, old in known_positions.items():
                if ticket not in current:
                    try:
                        _notify_position_closed(old)
                    except Exception as e:
                        log.error("Close notify error ticket %s: %s", ticket, e)

            known_positions = current

            if current:
                try:
                    acct = mt5_client.account_info()
                    equity = acct["equity"]
                    if session_equity_high is None or equity > session_equity_high:
                        session_equity_high = equity
                    equity_alert_cooldown = max(0, equity_alert_cooldown - 15)
                    if session_equity_high and equity_alert_cooldown == 0:
                        drop = (session_equity_high - equity) / session_equity_high
                        if drop >= 0.05:
                            _notify_equity_alert(equity, session_equity_high, drop)
                            equity_alert_cooldown = 1800
                except Exception as e:
                    log.debug("Equity monitor error: %s", e)
            else:
                session_equity_high = None

        except Exception as e:
            log.error("Monitor loop error: %s", e)

        await asyncio.sleep(15)


async def auto_trade_loop() -> None:
    """Scan all symbols once per candle and place trades."""
    log.info("Auto-trade worker started.")
    log_store.push("info", "system", "Worker เริ่มทำงาน")
    await asyncio.sleep(5)

    last_processed_candles: dict[tuple, str] = {}
    unavailable_symbols: set[str] = set()

    while True:
        try:
            from . import mt5_client
            active_symbols = [
                s
                for s in settings.symbol_list
                if s not in unavailable_symbols
                and _symbol_bot_enabled(s)
            ]
            for symbol in active_symbols:
                try:
                    timeframe = _symbol_timeframe(symbol)
                    df = mt5_client.get_rates(symbol, timeframe, 3)
                    if df is not None and len(df) > 0:
                        latest_candle_time = str(df["time"].iloc[-1])
                        cache_key = (symbol.upper(), timeframe.upper())
                        if last_processed_candles.get(cache_key) == latest_candle_time:
                            continue
                        last_processed_candles[cache_key] = latest_candle_time

                    rec, pending = await manager.analyze_and_stage(
                        symbol=symbol,
                        timeframe=timeframe,
                        strategy_name=_symbol_strategy(symbol),
                        use_ai=_symbol_use_ai(symbol),
                    )

                    if rec.action != Action.HOLD and pending:
                        level = "success" if pending.status == "executed" else "error"
                        log_store.push(
                            level, "trade",
                            f"{rec.action.value} {symbol} {pending.lot} lot @ {_fmt(rec.price, 5)} — {pending.status}",
                            {"symbol": symbol, "action": rec.action.value, "lot": pending.lot,
                             "price": rec.price, "sl": rec.stop_loss, "tp": rec.take_profit,
                             "status": pending.status, "confidence": round(rec.confidence, 2),
                             "strategy": rec.indicators.strategy_name},
                        )
                        send_telegram_notification(format_trade_executed(rec, pending.lot, pending.status))
                        log.info("Signal %s %s (status: %s)", symbol, rec.action.value, pending.status)
                    else:
                        # Log HOLD only when there was a candle to scan (not cache hit)
                        if rec.summary:
                            log_store.push(
                                "info", "signal",
                                f"HOLD {symbol} — {rec.summary[:80]}",
                                {"symbol": symbol, "confidence": round(rec.confidence, 2)},
                            )

                except Exception as e:
                    err = str(e)
                    if "not found" in err or "could not be selected" in err:
                        unavailable_symbols.add(symbol)
                        log_store.push("warning", "unavailable",
                                       f"{symbol} ไม่มีใน broker — ข้ามการสแกน")
                        log.warning("Symbol %s not available on broker — skipping.", symbol)
                    else:
                        log_store.push("error", "scan_error",
                                       f"Scan error {symbol}: {str(e)[:100]}")
                        log.error("Scan error for %s: %s", symbol, e)
                        log.debug(traceback.format_exc())

                await asyncio.sleep(0.2)

        except Exception as e:
            log_store.push("error", "system", f"Worker error: {str(e)[:120]}")
            log.error("Auto-trade loop error: %s", e)
            log.debug(traceback.format_exc())

        await asyncio.sleep(max(10, settings.auto_trade_interval))


def start_worker() -> None:
    global _worker_task, _monitor_task
    if _worker_task is None:
        _worker_task = asyncio.create_task(auto_trade_loop())
    if _monitor_task is None:
        _monitor_task = asyncio.create_task(position_monitor_loop())


def stop_worker() -> None:
    global _worker_task, _monitor_task
    if _worker_task is not None:
        log.info("Stopping auto-trade task.")
        _worker_task.cancel()
        _worker_task = None
    if _monitor_task is not None:
        log.info("Stopping monitor task.")
        _monitor_task.cancel()
        _monitor_task = None
