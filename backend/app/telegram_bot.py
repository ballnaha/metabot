"""Telegram interface.

Commands:
  /start              help
  /account            balance / equity
  /positions          open positions
  /analyze SYMBOL [TF] [STRATEGY] [ai|noai]  run analysis
  /close TICKET       close a position
  /history [days]     recent closed trades (default 7 days)
  /status             bot status + account snapshot
  /toggle             enable / disable the bot
  /strategies         list available strategies

Only the chat id in TELEGRAM_CHAT_ID may use the bot.
"""
from __future__ import annotations

import asyncio
import logging
import urllib.request
import urllib.error
import json

from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
)

from .config import settings
from .models import Action, Recommendation, PendingTrade

log = logging.getLogger("metabot.telegram")


def _api_request_blocking(method: str, path: str, json_data: dict = None) -> dict:
    url = f"http://127.0.0.1:{settings.api_port}/api/{path}"
    headers = {
        "X-API-Key": settings.api_key or "change-me-please",
        "Content-Type": "application/json",
    }
    data = json.dumps(json_data).encode("utf-8") if json_data is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode("utf-8"))
            err_msg = body.get("detail", str(e))
        except Exception:
            err_msg = str(e)
        raise ValueError(err_msg)
    except Exception as e:
        raise ValueError(f"API Connection error: {e}")


async def _api_request(method: str, path: str, json_data: dict = None) -> dict:
    """Async wrapper: urllib is blocking and would freeze the bot's event loop
    (every command waits up to a 10s timeout). Run it in a thread instead."""
    return await asyncio.to_thread(_api_request_blocking, method, path, json_data)


def _authorized(update: Update) -> bool:
    if not settings.telegram_chat_id:
        return True
    chat = update.effective_chat
    return chat is not None and str(chat.id) == str(settings.telegram_chat_id)


async def _guard(update: Update) -> bool:
    if not _authorized(update):
        await update.effective_message.reply_text("⛔ Unauthorized chat.")
        return False
    return True


def _fmt(v, d: int = 2) -> str:
    try:
        return f"{v:,.{d}f}"
    except (TypeError, ValueError):
        return str(v)


def _r(v):
    return f"{v:.4f}" if isinstance(v, float) else "—"


def _format_rec(rec: Recommendation) -> str:
    emoji = {"BUY": "🟢", "SELL": "🔴", "HOLD": "⚪"}[rec.action.value]
    ind = rec.indicators
    lines = [
        f"{emoji} *{rec.action.value}*  `{rec.symbol}` ({rec.timeframe})",
        f"Price: `{rec.price}`  |  Confidence: *{rec.confidence:.0%}*",
        f"Strategy _{ind.strategy_name}_: {ind.rule_bias.value} ({ind.strategy_confidence:.0%})",
    ]
    if rec.ai_used:
        verdict = {
            "confirmed": "✅ AI confirmed",
            "filtered": "🚫 AI filtered → HOLD",
            "unavailable": "⚠️ AI unavailable",
        }.get(rec.ai_verdict, "AI on")
        lines.append(f"AI filter: {verdict}")
    else:
        lines.append("AI filter: off (strategy only)")
    if rec.action != Action.HOLD:
        lines.append(f"SL: `{rec.stop_loss}`  TP: `{rec.take_profit}`")
        lines.append(f"Suggested lot: `{rec.suggested_lot}`")
    lines.append(f"RSI `{_r(ind.rsi)}`  MACDh `{_r(ind.macd_hist)}`  ATR `{_r(ind.atr)}`")
    for o in rec.opinions:
        if o.error:
            lines.append(f"• {o.provider}: ⚠️ {o.error[:60]}")
        else:
            lines.append(f"• {o.provider}: {o.action.value} ({o.confidence:.0%}) — {o.reasoning}")
    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────────────────────
# Commands
# ──────────────────────────────────────────────────────────────────────────────

async def cmd_start(update: Update, _ctx: ContextTypes.DEFAULT_TYPE):
    if not await _guard(update):
        return
    await update.message.reply_text(
        "🤖 *MetaBot*\n\n"
        "*การเทรด*\n"
        "/analyze SYMBOL \\[TF\\] \\[STRATEGY\\] \\[ai|noai\\] — วิเคราะห์\n"
        "/close TICKET — ปิด position\n\n"
        "*ข้อมูล*\n"
        "/account — ยอด balance / equity\n"
        "/positions — positions ที่เปิดอยู่\n"
        "/history \\[days\\] — ประวัติการเทรด\n"
        "/status — สถานะบอทและบัญชี\n\n"
        "*ตั้งค่า*\n"
        "/toggle — เปิด/ปิดบอท\n"
        "/strategies — รายการ strategy ที่ใช้ได้",
        parse_mode="MarkdownV2",
    )


async def cmd_account(update: Update, _ctx: ContextTypes.DEFAULT_TYPE):
    if not await _guard(update):
        return
    try:
        a = await _api_request("GET", "account")
        await update.message.reply_text(
            f"💼 *{a['login']}* @ {a['server']}\n"
            f"Balance: `{_fmt(a['balance'])} {a['currency']}`\n"
            f"Equity: `{_fmt(a['equity'])}`  |  Free margin: `{_fmt(a['margin_free'])}`\n"
            f"Open P/L: `{_fmt(a['profit'])}`",
            parse_mode="Markdown",
        )
    except Exception as e:
        await update.message.reply_text(f"⚠️ {e}")


async def cmd_positions(update: Update, _ctx: ContextTypes.DEFAULT_TYPE):
    if not await _guard(update):
        return
    try:
        res = await _api_request("GET", "positions")
        pos = res.get("positions", [])
    except Exception as e:
        await update.message.reply_text(f"⚠️ {e}")
        return
    if not pos:
        await update.message.reply_text("ไม่มี open position")
        return
    total_pl = sum(p.get("profit", 0) for p in pos)
    lines = [f"📂 *Open Positions* ({len(pos)})\n"]
    for p in pos:
        pl = p["profit"]
        icon = "🟢" if pl >= 0 else "🔴"
        lines.append(
            f"{icon} `{p['ticket']}` {p['type']} `{p['symbol']}` {p['volume']} lot\n"
            f"   Entry `{_fmt(p['price_open'], 5)}`  SL `{_fmt(p['sl'], 5)}`  TP `{_fmt(p['tp'], 5)}`\n"
            f"   P/L `{pl:+.2f}`"
        )
    lines.append(f"\nรวม P/L: `{total_pl:+.2f}`")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def cmd_close(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not await _guard(update):
        return
    if not ctx.args:
        await update.message.reply_text("Usage: /close TICKET\nเช่น: /close 123456")
        return
    try:
        ticket = int(ctx.args[0])
    except ValueError:
        await update.message.reply_text("❌ Ticket ต้องเป็นตัวเลข")
        return
    try:
        result = await _api_request("POST", f"positions/{ticket}/close")
        if result.get("ok"):
            await update.message.reply_text(
                f"✅ ปิด position `{ticket}` สำเร็จ", parse_mode="Markdown"
            )
        else:
            await update.message.reply_text(
                f"❌ ปิดไม่ได้: {result.get('comment', 'unknown error')}"
            )
    except Exception as e:
        await update.message.reply_text(f"⚠️ {e}")


async def cmd_history(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not await _guard(update):
        return
    days = 7
    if ctx.args:
        try:
            days = max(1, min(int(ctx.args[0]), 90))
        except ValueError:
            pass
    try:
        res = await _api_request("GET", f"history?days={days}")
        deals = res.get("history", [])
    except Exception as e:
        await update.message.reply_text(f"⚠️ {e}")
        return

    closed = [d for d in deals if d.get("entry") == "OUT"][:15]
    if not closed:
        await update.message.reply_text(f"ไม่มีการเทรดใน {days} วันที่ผ่านมา")
        return

    total = sum(
        d.get("profit", 0) + d.get("commission", 0) + d.get("swap", 0)
        for d in closed
    )
    wins = sum(1 for d in closed if d.get("profit", 0) > 0)
    losses = len(closed) - wins
    sign = "+" if total >= 0 else ""

    lines = [f"📋 *ประวัติ {len(closed)} รายการ* ({days} วัน)\n"]
    for d in closed:
        p = d.get("profit", 0)
        icon = "✅" if p >= 0 else "❌"
        ps = f"+{p:.2f}" if p >= 0 else f"{p:.2f}"
        t = d.get("time", "")
        t = t.replace("T", " ")[5:16] if "T" in t else t
        lines.append(f"{icon} `{d['symbol']}` {d.get('type', '')}  `{ps}`  {t}")

    lines.append(f"\nรวม: `{sign}{total:.2f}`  ✅ {wins} Win  ❌ {losses} Loss")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def cmd_status(update: Update, _ctx: ContextTypes.DEFAULT_TYPE):
    if not await _guard(update):
        return
    try:
        acct = await _api_request("GET", "account")
        pos_res = await _api_request("GET", "positions")
        cfg = await _api_request("GET", "settings")
    except Exception as e:
        await update.message.reply_text(f"⚠️ {e}")
        return

    open_pos = pos_res.get("positions", [])
    open_pl = sum(p.get("profit", 0) for p in open_pos)
    bot_on = cfg.get("bot_enabled", False)
    icon = "🟢" if bot_on else "🔴"

    lines = [
        f"{icon} *Bot: {'กำลังทำงาน' if bot_on else 'หยุดทำงาน'}*",
        f"Strategy: `{cfg.get('strategy', '—')}`  |  TF: `{cfg.get('default_timeframe', '—')}`",
        f"สแกนทุก: `{cfg.get('auto_trade_interval', '—')}s`  |  Max trades: `{cfg.get('max_open_trades', '—')}`",
        f"เปิดอยู่: *{len(open_pos)}* positions  |  Open P/L: `{open_pl:+.2f}`",
        f"",
        f"💼 *{acct['login']}* @ {acct['server']}",
        f"Balance: `{_fmt(acct['balance'])} {acct['currency']}`",
        f"Equity:  `{_fmt(acct['equity'])}`",
        f"Free margin: `{_fmt(acct['margin_free'])}`",
    ]
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def cmd_toggle(update: Update, _ctx: ContextTypes.DEFAULT_TYPE):
    if not await _guard(update):
        return
    try:
        cfg = await _api_request("GET", "settings")
        new_state = not cfg.get("bot_enabled", False)
        await _api_request("POST", "settings", {"bot_enabled": new_state})
        icon = "🟢" if new_state else "🔴"
        label = "เปิดแล้ว (กำลังทำงาน)" if new_state else "ปิดแล้ว (หยุดทำงาน)"
        await update.message.reply_text(f"{icon} Bot *{label}*", parse_mode="Markdown")
    except Exception as e:
        await update.message.reply_text(f"⚠️ {e}")


async def cmd_analyze(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not await _guard(update):
        return
    if not ctx.args:
        await update.message.reply_text(
            "Usage: /analyze SYMBOL [TIMEFRAME] [STRATEGY] [ai|noai]"
        )
        return
    use_ai = None
    args = []
    for a in ctx.args:
        low = a.lower()
        if low == "noai":
            use_ai = False
        elif low == "ai":
            use_ai = True
        else:
            args.append(a)

    symbol = args[0].upper()
    timeframe = args[1].upper() if len(args) > 1 else settings.default_timeframe
    strat = args[2].lower() if len(args) > 2 else None

    msg = await update.message.reply_text(f"🔎 Analysing {symbol} {timeframe}…")
    try:
        payload = {"symbol": symbol, "timeframe": timeframe, "strategy": strat, "use_ai": use_ai}
        res = await _api_request("POST", "analyze", payload)
        rec = Recommendation.model_validate(res["recommendation"])
        pending = PendingTrade.model_validate(res["pending"]) if res.get("pending") else None
    except Exception as e:
        await msg.edit_text(f"⚠️ {e}")
        return

    text = _format_rec(rec)
    if pending:
        if pending.status == "executed":
            text += "\n\n⚡ Auto-executed."
        elif pending.status == "failed":
            text += "\n\n❌ Execution failed."
    await msg.edit_text(text, parse_mode="Markdown")


async def cmd_strategies(update: Update, _ctx: ContextTypes.DEFAULT_TYPE):
    if not await _guard(update):
        return
    try:
        res = await _api_request("GET", "strategies")
        strategies_list = res.get("strategies", [])
        default_strat = res.get("default", "")
    except Exception as e:
        await update.message.reply_text(f"⚠️ Failed to list strategies: {e}")
        return

    lines = ["📊 *Strategies* (default: " + default_strat + ")"]
    for s in strategies_list:
        mark = "⭐" if s["name"] == default_strat else "•"
        lines.append(f"{mark} `{s['name']}` — {s['description']}")
    lines.append("\nUse: /analyze SYMBOL TF STRATEGY")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


def build_application() -> Application:
    if not settings.telegram_bot_token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN not set")
    app = Application.builder().token(settings.telegram_bot_token).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_start))
    app.add_handler(CommandHandler("account", cmd_account))
    app.add_handler(CommandHandler("positions", cmd_positions))
    app.add_handler(CommandHandler("close", cmd_close))
    app.add_handler(CommandHandler("history", cmd_history))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("toggle", cmd_toggle))
    app.add_handler(CommandHandler("analyze", cmd_analyze))
    app.add_handler(CommandHandler("strategies", cmd_strategies))
    return app


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    app = build_application()
    log.info("Telegram bot started. Press Ctrl+C to stop.")
    app.run_polling()


if __name__ == "__main__":
    main()
