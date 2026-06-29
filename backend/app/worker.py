"""Background worker: auto-trade loop + position monitor + Telegram notifications."""
from __future__ import annotations

import asyncio
import logging
import urllib.request
import json
import traceback
from datetime import datetime, timezone, timedelta

from .config import settings
from .market_groups import market_group, check_market_open
from .trader import manager, get_group_slot_status, can_open_new_trade, _is_bot_position
from .models import Action, Recommendation
from . import log_store

log = logging.getLogger("metabot.worker")

TZ_TH = timezone(timedelta(hours=7))


async def _to_thread(fn, *args, **kwargs):
    """Run a blocking call (MT5 access, blocking notifications) off the event
    loop. The MetaTrader5 library is synchronous and can block for seconds on
    order/quote calls; running it inline in these async loops would freeze the
    whole event loop (and every API request served by it)."""
    return await asyncio.to_thread(fn, *args, **kwargs)

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
    if group == "forex": return settings.forex_bot_enabled
    return settings.bot_enabled


def _symbol_timeframe(symbol: str) -> str:
    group = market_group(symbol)
    if group == "stock":  return settings.stock_timeframe
    if group == "gold":   return settings.gold_timeframe
    if group == "crypto": return settings.crypto_timeframe
    if group == "forex":  return settings.forex_timeframe or settings.default_timeframe
    return settings.default_timeframe


def _symbol_strategy(symbol: str) -> str:
    group = market_group(symbol)
    if group == "crypto": return settings.crypto_strategy or settings.strategy
    if group == "stock": return settings.stock_strategy
    if group == "gold":  return settings.gold_strategy
    if group == "forex": return settings.forex_strategy or settings.strategy
    return settings.strategy


def _symbol_use_ai(symbol: str) -> bool:
    group = market_group(symbol)
    if group == "stock": return settings.stock_use_ai
    if group == "forex": return settings.forex_use_ai
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


def _pending_failure_reason(pending) -> str:
    result = getattr(pending, "result", None) or {}
    if result.get("error"):
        return str(result["error"])
    parts = []
    if result.get("retcode") is not None:
        parts.append(f"retcode={result.get('retcode')}")
    if result.get("comment"):
        parts.append(str(result.get("comment")))
    return " — ".join(parts)


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
    breakeven_set: set[int] = set()
    peak_prices: dict[int, float] = {}      # ticket → best price seen (max for BUY, min for SELL)
    original_sl_map: dict[int, float] = {}  # ticket → SL price at time of first detection
    session_equity_high: float | None = None
    equity_alert_cooldown = 0
    last_summary_date = None

    while True:
        try:
            from . import mt5_client

            now_th = datetime.now(TZ_TH)
            if now_th.hour == 8 and last_summary_date != now_th.date():
                await _to_thread(_send_daily_summary)
                last_summary_date = now_th.date()

            try:
                current_list = await _to_thread(mt5_client.positions)
                current = {p["ticket"]: p for p in current_list}
            except Exception as e:
                log.debug("Monitor: can't fetch positions: %s", e)
                await asyncio.sleep(15)
                continue

            for ticket, old in known_positions.items():
                if ticket not in current:
                    breakeven_set.discard(ticket)
                    peak_prices.pop(ticket, None)
                    original_sl_map.pop(ticket, None)
                    try:
                        await _to_thread(_notify_position_closed, old)
                    except Exception as e:
                        log.error("Close notify error ticket %s: %s", ticket, e)

            known_positions = current

            # ---- Breakeven SL management ----------------------------------------
            if settings.breakeven_r > 0 and current:
                for ticket, pos in current.items():
                    if not _is_bot_position(pos) or ticket in breakeven_set:
                        continue
                    entry = pos["price_open"]
                    sl = pos.get("sl") or 0.0
                    tp = pos.get("tp") or 0.0
                    cur = pos["price_current"]
                    if sl == 0 or abs(sl - entry) < 1e-9:
                        continue  # no SL or already at breakeven
                    sl_dist = abs(entry - sl)
                    triggered = (
                        pos["type"] == "BUY"  and cur - entry >= sl_dist * settings.breakeven_r and sl < entry
                        or
                        pos["type"] == "SELL" and entry - cur >= sl_dist * settings.breakeven_r and sl > entry
                    )
                    if triggered:
                        try:
                            res = await _to_thread(mt5_client.modify_position_sl, ticket, entry, tp or None)
                            if res.get("ok"):
                                breakeven_set.add(ticket)
                                msg = f"Breakeven SL → {pos['symbol']} {pos['type']} #{ticket} entry {entry:.5f}"
                                log.info(msg)
                                log_store.push("info", "breakeven", msg, {"symbol": pos["symbol"], "ticket": ticket, "entry": entry})
                                await _to_thread(
                                    send_telegram_notification,
                                    f"🔒 *Breakeven SL*\n`{pos['symbol']}` {pos['type']} #{ticket}\nSL → Entry `{entry:.5f}`",
                                )
                            else:
                                log.warning("Breakeven SL failed for %s #%d: %s", pos["symbol"], ticket, res.get("comment"))
                        except Exception as e:
                            log.error("Breakeven SL failed %s #%s: %s", pos["symbol"], ticket, e)
            # ---- End breakeven SL -----------------------------------------------

            # ---- Trailing Stop --------------------------------------------------
            if settings.trailing_stop_r > 0 and current:
                for ticket, pos in current.items():
                    if not _is_bot_position(pos):
                        continue

                    entry = pos["price_open"]
                    sl    = pos.get("sl") or 0.0
                    tp    = pos.get("tp") or 0.0
                    cur   = pos["price_current"]

                    # Record original SL on first sight
                    if ticket not in original_sl_map and sl > 0:
                        original_sl_map[ticket] = sl

                    orig_sl = original_sl_map.get(ticket, 0.0)
                    if sl == 0 or orig_sl == 0:
                        continue

                    sl_dist = abs(entry - orig_sl)
                    if sl_dist <= 0:
                        continue

                    # Update peak price
                    if pos["type"] == "BUY":
                        peak = max(peak_prices.get(ticket, cur), cur)
                    else:
                        peak = min(peak_prices.get(ticket, cur), cur)
                    peak_prices[ticket] = peak

                    # Compute trail SL and apply if it improves current SL
                    try:
                        if pos["type"] == "BUY":
                            profit_dist = peak - entry
                            if profit_dist < settings.trailing_stop_r * sl_dist:
                                continue  # not yet at trigger point
                            trail_sl = round(peak - sl_dist, 6)
                            if trail_sl > sl:
                                res = await _to_thread(mt5_client.modify_position_sl, ticket, trail_sl, tp or None)
                                if res.get("ok"):
                                    msg = f"Trail SL → {pos['symbol']} BUY #{ticket}  {sl:.5f} → {trail_sl:.5f}  (peak {peak:.5f})"
                                    log.info(msg)
                                    log_store.push("info", "trailing_sl", msg, {"symbol": pos["symbol"], "ticket": ticket, "trail_sl": trail_sl, "peak": peak})
                                else:
                                    log.debug("Trail SL failed for %s #%d: %s", pos["symbol"], ticket, res.get("comment"))
                        elif pos["type"] == "SELL":
                            profit_dist = entry - peak
                            if profit_dist < settings.trailing_stop_r * sl_dist:
                                continue
                            trail_sl = round(peak + sl_dist, 6)
                            if trail_sl < sl:
                                res = await _to_thread(mt5_client.modify_position_sl, ticket, trail_sl, tp or None)
                                if res.get("ok"):
                                    msg = f"Trail SL → {pos['symbol']} SELL #{ticket}  {sl:.5f} → {trail_sl:.5f}  (peak {peak:.5f})"
                                    log.info(msg)
                                    log_store.push("info", "trailing_sl", msg, {"symbol": pos["symbol"], "ticket": ticket, "trail_sl": trail_sl, "peak": peak})
                                else:
                                    log.debug("Trail SL failed for %s #%d: %s", pos["symbol"], ticket, res.get("comment"))
                    except Exception as e:
                        log.error("Trailing SL failed %s #%s: %s", pos["symbol"], ticket, e)
            # ---- End trailing stop ----------------------------------------------

            if current:
                try:
                    acct = await _to_thread(mt5_client.account_info)
                    equity = acct["equity"]
                    if session_equity_high is None or equity > session_equity_high:
                        session_equity_high = equity
                    equity_alert_cooldown = max(0, equity_alert_cooldown - 15)
                    if session_equity_high and equity_alert_cooldown == 0:
                        drop = (session_equity_high - equity) / session_equity_high
                        if drop >= 0.05:
                            await _to_thread(_notify_equity_alert, equity, session_equity_high, drop)
                            equity_alert_cooldown = 1800
                except Exception as e:
                    log.debug("Equity monitor error: %s", e)
            else:
                session_equity_high = None

        except Exception as e:
            log.error("Monitor loop error: %s", e)

        await asyncio.sleep(15)


async def auto_trade_loop() -> None:
    """Scan all symbols once per candle, rank them by signal strength, and place trades."""
    log.info("Auto-trade worker started (ranking-based).")
    log_store.push("info", "system", "Worker เริ่มทำงาน (ระบบจัดอันดับ)")
    await asyncio.sleep(5)

    last_processed_candles: dict[tuple, str] = {}
    unavailable_symbols: set[str] = set()
    _last_summary_time = 0.0
    _last_cb_notify_time = 0.0  # circuit breaker notification cooldown
    _scan_count = 0

    while True:
        try:
            from . import mt5_client
            import time as _time

            _scan_count += 1
            now_mono = _time.monotonic()

            # ---- Circuit breakers ------------------------------------------------
            _skip_cycle = False
            _cb_msg = ""
            if settings.max_daily_loss_pct > 0 or settings.max_consecutive_losses > 0:
                try:
                    _acct = await _to_thread(mt5_client.account_info)
                    _deals = await _to_thread(mt5_client.history_deals, 1)
                    _bot_magics = {
                        settings.magic,
                        settings.gold_magic,
                        settings.stock_magic,
                        settings.forex_magic,
                    }

                    if not _skip_cycle and settings.max_daily_loss_pct > 0:
                        _today = datetime.now(TZ_TH).strftime("%Y-%m-%d")
                        _today_closed = [
                            d for d in _deals
                            if d.get("entry") == "OUT"
                            and d["time"].startswith(_today)
                            and d.get("magic", 0) in _bot_magics
                        ]
                        _today_pnl = sum(
                            d.get("profit", 0) + d.get("commission", 0) + d.get("swap", 0)
                            for d in _today_closed
                        )
                        _bal = max(_acct["balance"], 1)
                        if _today_pnl < 0 and abs(_today_pnl) / _bal >= settings.max_daily_loss_pct:
                            _cb_msg = (
                                f"Daily loss limit {settings.max_daily_loss_pct:.0%} reached "
                                f"(P/L: {_today_pnl:.2f}, {abs(_today_pnl)/_bal:.1%} of balance) "
                                f"— trading paused until tomorrow"
                            )
                            _skip_cycle = True

                    if not _skip_cycle and settings.max_consecutive_losses > 0:
                        _n = settings.max_consecutive_losses
                        _closed_all = [d for d in _deals if d.get("entry") == "OUT" and d.get("magic", 0) in _bot_magics]
                        _recent = _closed_all[:_n]
                        if len(_recent) == _n and all(
                            d.get("profit", 0) + d.get("commission", 0) + d.get("swap", 0) < 0
                            for d in _recent
                        ):
                            _cb_msg = f"Last {_n} consecutive trades all losses — trading paused"
                            _skip_cycle = True

                except Exception as _e:
                    log.error("Circuit breaker check: %s", _e)

            if _skip_cycle:
                log.warning(_cb_msg)
                log_store.push("warning", "circuit_breaker", _cb_msg)
                if now_mono - _last_cb_notify_time > 1800:
                    await _to_thread(send_telegram_notification, f"⛔ *Circuit Breaker*\n{_cb_msg}")
                    _last_cb_notify_time = now_mono
                await asyncio.sleep(max(10, settings.auto_trade_interval))
                continue
            # ---- End circuit breakers -------------------------------------------

            # Group active symbols by market group
            active_symbols = [
                s
                for s in settings.symbol_list
                if s not in unavailable_symbols
                and _symbol_bot_enabled(s)
            ]

            grouped_symbols: dict[str, list[str]] = {}
            for sym in active_symbols:
                grp = market_group(sym)
                grouped_symbols.setdefault(grp, []).append(sym)

            # Per-cycle summary counters
            cycle_scanned = 0
            cycle_new_candle = 0
            cycle_same_candle = 0
            cycle_slot_full_groups: list[str] = []
            cycle_signals: list[str] = []  # "BTCUSD:SELL(94%)"
            cycle_holds = 0
            cycle_trades = 0
            cycle_skipped_dup = 0

            log.info("Scan cycle #%d: %d active symbols in %d groups [%s]",
                     _scan_count, len(active_symbols),
                     len(grouped_symbols),
                     ", ".join(f"{g}={len(s)}" for g, s in grouped_symbols.items()))

            for group, symbols_in_group in grouped_symbols.items():
                # 1. Check open slots for this group
                used_slots, max_slots = get_group_slot_status(group)
                available_slots = max_slots - used_slots
                if available_slots <= 0:
                    cycle_slot_full_groups.append(f"{group}({used_slots}/{max_slots})")
                    log.debug("Group %s: slots full (%d/%d), skipping.", group, used_slots, max_slots)
                    continue

                log.debug("Group %s: %d/%d slots used, %d available, scanning %d symbols.",
                          group, used_slots, max_slots, available_slots, len(symbols_in_group))

                # 2. Gather candidates that have new candles and pass preliminary checks
                group_candidates = []
                for symbol in symbols_in_group:
                    try:
                        timeframe = _symbol_timeframe(symbol)
                        cycle_scanned += 1

                        # Skip scanning if market is closed
                        is_open, _ = check_market_open(symbol)
                        if not is_open:
                            continue

                        # Double entry prevention
                        ok, reason = can_open_new_trade(symbol)
                        if not ok:
                            cycle_skipped_dup += 1
                            continue

                        # Active pending trade prevention
                        pending_trades = manager.list_pending()
                        if any(p.recommendation.symbol.upper() == symbol.upper() for p in pending_trades):
                            cycle_skipped_dup += 1
                            continue

                        df = await _to_thread(mt5_client.get_rates, symbol, timeframe, 3)
                        if df is not None and len(df) > 0:
                            latest_candle_time = str(df["time"].iloc[-1])
                            cache_key = (symbol.upper(), timeframe.upper())

                            if cache_key not in last_processed_candles:
                                last_processed_candles[cache_key] = latest_candle_time
                                log.info("Initialized %s (%s) at %s — waiting for confirmed candle.", symbol, timeframe, latest_candle_time[-19:])
                                cycle_same_candle += 1
                                continue

                            elif last_processed_candles.get(cache_key) == latest_candle_time:
                                cycle_same_candle += 1
                                continue
                            else:
                                # New candle detected!
                                log.info("New candle for %s (%s): %s -> %s",
                                         symbol, timeframe,
                                         last_processed_candles.get(cache_key, "?")[-19:],
                                         latest_candle_time[-19:])

                            last_processed_candles[cache_key] = latest_candle_time
                            cycle_new_candle += 1

                            # Spread filter — skip high-spread conditions
                            if settings.max_spread_points > 0:
                                try:
                                    _sym_info = await _to_thread(mt5_client.symbol_info, symbol)
                                    _spread = _sym_info.get("spread", 0)
                                    if _spread > settings.max_spread_points:
                                        log.info("%s spread %d > limit %d — skipped", symbol, _spread, settings.max_spread_points)
                                        log_store.push("warning", "spread_filter", f"{symbol} spread {_spread} > {settings.max_spread_points} pts — skipped")
                                        cycle_holds += 1
                                        continue
                                except Exception as _e:
                                    log.debug("Spread check %s: %s", symbol, _e)

                            snap, sig = manager.evaluate_technical_signal(symbol, timeframe, _symbol_strategy(symbol))

                            if sig.action != Action.HOLD:
                                group_candidates.append((symbol, snap, sig))
                                cycle_signals.append(f"{symbol}:{sig.action.value}({sig.confidence:.0%})")
                            else:
                                cycle_holds += 1

                    except Exception as e:
                        err = str(e)
                        if "not found" in err or "could not be selected" in err:
                            unavailable_symbols.add(symbol)
                            log_store.push("warning", "unavailable", f"{symbol} ไม่มีใน broker — ข้ามการสแกน")
                            log.warning("Symbol %s not available on broker — skipping.", symbol)
                        else:
                            log_store.push("error", "scan_error", f"Scan error {symbol}: {str(e)[:100]}")
                            log.error("Scan error for %s: %s", symbol, e)
                            log.debug(traceback.format_exc())

                    await asyncio.sleep(0.1)

                # 3. Sort candidates by confidence descending and select the top ones to execute
                if group_candidates:
                    group_candidates.sort(key=lambda x: x[2].confidence, reverse=True)
                    selected_candidates = group_candidates[:available_slots]

                    log.info("Group %s: %d candidates found, executing top %d",
                             group, len(group_candidates), len(selected_candidates))

                    for symbol, snap, sig in selected_candidates:
                        try:
                            use_ai = _symbol_use_ai(symbol)
                            rec, pending = await manager.stage_and_execute(symbol, snap, use_ai)

                            if rec.action != Action.HOLD and pending:
                                cycle_trades += 1
                                level = "success" if pending.status == "executed" else "error"
                                failure_reason = _pending_failure_reason(pending) if pending.status == "failed" else ""
                                log_store.push(
                                    level, "trade",
                                    f"{rec.action.value} {symbol} {pending.lot} lot @ {_fmt(rec.price, 5)} — {pending.status}"
                                    + (f" ({failure_reason})" if failure_reason else ""),
                                    {"symbol": symbol, "action": rec.action.value, "lot": pending.lot,
                                     "price": rec.price, "sl": rec.stop_loss, "tp": rec.take_profit,
                                     "status": pending.status, "confidence": round(rec.confidence, 2),
                                     "error": failure_reason, "result": pending.result,
                                     "strategy": rec.indicators.strategy_name},
                                )
                                await _to_thread(send_telegram_notification, format_trade_executed(rec, pending.lot, pending.status))
                                if failure_reason:
                                    log.info("Signal %s %s (status: %s, reason: %s)", symbol, rec.action.value, pending.status, failure_reason)
                                else:
                                    log.info("Signal %s %s (status: %s)", symbol, rec.action.value, pending.status)
                            else:
                                cycle_holds += 1
                                if rec.summary:
                                    log_store.push(
                                        "info", "signal",
                                        f"HOLD {symbol} — {rec.summary[:80]}",
                                        {"symbol": symbol, "confidence": round(rec.confidence, 2)},
                                    )
                        except Exception as e:
                            log_store.push("error", "trade_execute_error", f"Execute error {symbol}: {str(e)[:100]}")
                            log.error("Trade execute error for %s: %s", symbol, e)

            # End of cycle summary
            summary_parts = [f"Cycle #{_scan_count} done"]
            summary_parts.append(f"scanned={cycle_scanned}")
            if cycle_new_candle:
                summary_parts.append(f"new_candles={cycle_new_candle}")
            if cycle_same_candle:
                summary_parts.append(f"unchanged={cycle_same_candle}")
            if cycle_skipped_dup:
                summary_parts.append(f"dup_skip={cycle_skipped_dup}")
            if cycle_slot_full_groups:
                summary_parts.append(f"slots_full=[{','.join(cycle_slot_full_groups)}]")
            if cycle_signals:
                summary_parts.append(f"signals=[{', '.join(cycle_signals[:5])}]")
            if cycle_holds:
                summary_parts.append(f"holds={cycle_holds}")
            if cycle_trades:
                summary_parts.append(f"trades={cycle_trades}")

            cycle_summary = " | ".join(summary_parts)
            log.info(cycle_summary)

            # Push to log_store only when something interesting happened
            if cycle_new_candle > 0 or cycle_trades > 0:
                log_store.push(
                    "info", "scan_cycle",
                    cycle_summary,
                    {"scan_count": _scan_count, "scanned": cycle_scanned,
                     "new_candles": cycle_new_candle, "signals": cycle_signals[:10],
                     "holds": cycle_holds, "trades": cycle_trades},
                )

            # Periodic summary every 5 minutes (to log_store so UI can see it)
            if now_mono - _last_summary_time >= 300:
                _last_summary_time = now_mono
                try:
                    slot_parts = []
                    for grp in ("crypto", "gold", "stock"):
                        used, mx = get_group_slot_status(grp)
                        bot_on = {"crypto": settings.bot_enabled, "gold": settings.gold_bot_enabled, "stock": settings.stock_bot_enabled}.get(grp, False)
                        status = f"{used}/{mx}" if bot_on else "OFF"
                        slot_parts.append(f"{grp}={status}")
                    log_store.push(
                        "info", "worker_alive",
                        f"Worker alive | cycles={_scan_count} | slots: {' '.join(slot_parts)} | unavailable={len(unavailable_symbols)}",
                    )
                except Exception:
                    pass

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
