"""Telegram interface.

Commands:
  /start              show help
  /account            account balance / equity
  /positions          open positions
  /analyze SYMBOL [TF]  run analysis; if actionable, shows Confirm/Cancel buttons
  /pending            list trades awaiting confirmation

Only the chat id in TELEGRAM_CHAT_ID may use the bot.
"""
from __future__ import annotations

import logging
import urllib.request
import urllib.error
import json

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
)

from .config import settings
from .models import Action, Recommendation, PendingTrade

log = logging.getLogger("metabot.telegram")


def _api_request(method: str, path: str, json_data: dict = None) -> dict:
    """Make HTTP requests to the FastAPI backend API using auth headers."""
    url = f"http://127.0.0.1:{settings.api_port}/api/{path}"
    headers = {
        "X-API-Key": settings.api_key or "change-me-please",
        "Content-Type": "application/json"
    }
    data = None
    if json_data is not None:
        data = json.dumps(json_data).encode("utf-8")
        
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


def _authorized(update: Update) -> bool:
    if not settings.telegram_chat_id:
        return True  # not locked down
    chat = update.effective_chat
    return chat is not None and str(chat.id) == str(settings.telegram_chat_id)


async def _guard(update: Update) -> bool:
    if not _authorized(update):
        await update.effective_message.reply_text("⛔ Unauthorized chat.")
        return False
    return True


def _format_rec(rec: Recommendation) -> str:
    emoji = {"BUY": "🟢", "SELL": "🔴", "HOLD": "⚪"}[rec.action.value]
    ind = rec.indicators
    lines = [
        f"{emoji} *{rec.action.value}*  `{rec.symbol}` ({rec.timeframe})",
        f"Price: `{rec.price}`  |  Confidence: *{rec.confidence:.0%}*",
        f"Strategy _{ind.strategy_name}_: {ind.rule_bias.value} "
        f"({ind.strategy_confidence:.0%})",
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
    lines.append(
        f"RSI `{_r(ind.rsi)}`  MACDh `{_r(ind.macd_hist)}`  ATR `{_r(ind.atr)}`"
    )
    for o in rec.opinions:
        if o.error:
            lines.append(f"• {o.provider}: ⚠️ {o.error[:60]}")
        else:
            lines.append(
                f"• {o.provider}: {o.action.value} ({o.confidence:.0%}) — {o.reasoning}"
            )
    return "\n".join(lines)


def _r(v):
    return f"{v:.4f}" if isinstance(v, float) else "—"


async def cmd_start(update: Update, _ctx: ContextTypes.DEFAULT_TYPE):
    if not await _guard(update):
        return
    await update.message.reply_text(
        "🤖 *MetaBot*\n"
        "/analyze SYMBOL [TF] [STRATEGY] — analyse & advise\n"
        "/strategies — list available strategies\n"
        "/account — balance\n"
        "/positions — open trades\n"
        "/pending — trades awaiting confirm",
        parse_mode="Markdown",
    )


async def cmd_account(update: Update, _ctx: ContextTypes.DEFAULT_TYPE):
    if not await _guard(update):
        return
    try:
        a = _api_request("GET", "account")
        await update.message.reply_text(
            f"💼 *{a['login']}* @ {a['server']}\n"
            f"Balance: `{a['balance']} {a['currency']}`\n"
            f"Equity: `{a['equity']}`  Free margin: `{a['margin_free']}`\n"
            f"Open P/L: `{a['profit']}`",
            parse_mode="Markdown",
        )
    except Exception as e:  # noqa: BLE001
        await update.message.reply_text(f"⚠️ {e}")


async def cmd_positions(update: Update, _ctx: ContextTypes.DEFAULT_TYPE):
    if not await _guard(update):
        return
    try:
        res = _api_request("GET", "positions")
        pos = res.get("positions", [])
    except Exception as e:  # noqa: BLE001
        await update.message.reply_text(f"⚠️ {e}")
        return
    if not pos:
        await update.message.reply_text("No open positions.")
        return
    lines = [
        f"`{p['ticket']}` {p['type']} {p['symbol']} {p['volume']} → P/L `{p['profit']}`"
        for p in pos
    ]
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def cmd_analyze(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not await _guard(update):
        return
    if not ctx.args:
        await update.message.reply_text(
            "Usage: /analyze SYMBOL [TIMEFRAME] [STRATEGY] [ai|noai]"
        )
        return
    # Pull optional ai/noai flag out of the args, keep the rest positional.
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
        payload = {
            "symbol": symbol,
            "timeframe": timeframe,
            "strategy": strat,
            "use_ai": use_ai
        }
        res = _api_request("POST", "analyze", payload)
        rec = Recommendation.model_validate(res["recommendation"])
        pending = PendingTrade.model_validate(res["pending"]) if res.get("pending") else None
    except Exception as e:  # noqa: BLE001
        await msg.edit_text(f"⚠️ {e}")
        return

    text = _format_rec(rec)
    if pending and pending.status == "pending":
        kb = InlineKeyboardMarkup(
            [
                [
                    InlineKeyboardButton(
                        "✅ Confirm", callback_data=f"confirm:{pending.id}"
                    ),
                    InlineKeyboardButton(
                        "❌ Cancel", callback_data=f"cancel:{pending.id}"
                    ),
                ]
            ]
        )
        await msg.edit_text(text, parse_mode="Markdown", reply_markup=kb)
    else:
        if pending and pending.status == "executed":
            text += "\n\n⚡ Auto-executed (require_confirm=false)."
        await msg.edit_text(text, parse_mode="Markdown")


async def cmd_strategies(update: Update, _ctx: ContextTypes.DEFAULT_TYPE):
    if not await _guard(update):
        return
    try:
        res = _api_request("GET", "strategies")
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


async def cmd_pending(update: Update, _ctx: ContextTypes.DEFAULT_TYPE):
    if not await _guard(update):
        return
    try:
        res = _api_request("GET", "pending")
        items = [PendingTrade.model_validate(x) for x in res.get("pending", [])]
    except Exception as e:
        await update.message.reply_text(f"⚠️ Failed to list pending: {e}")
        return
        
    if not items:
        await update.message.reply_text("No pending trades.")
        return
    for p in items:
        kb = InlineKeyboardMarkup(
            [
                [
                    InlineKeyboardButton("✅ Confirm", callback_data=f"confirm:{p.id}"),
                    InlineKeyboardButton("❌ Cancel", callback_data=f"cancel:{p.id}"),
                ]
            ]
        )
        await update.message.reply_text(
            _format_rec(p.recommendation), parse_mode="Markdown", reply_markup=kb
        )


async def on_button(update: Update, _ctx: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if not _authorized(update):
        await query.edit_message_text("⛔ Unauthorized.")
        return

    action, pending_id = query.data.split(":", 1)
    if action == "cancel":
        try:
            _api_request("POST", "cancel", {"pending_id": pending_id})
            await query.edit_message_text(query.message.text + "\n\n❌ Cancelled.")
        except Exception as e:
            await query.edit_message_text(query.message.text + f"\n\n⚠️ Cancel failed: {e}")
        return

    try:
        res = _api_request("POST", "confirm", {"pending_id": pending_id})
        p = PendingTrade.model_validate(res)
    except Exception as e:
        await query.edit_message_text(query.message.text + f"\n\n⚠️ {e}")
        return

    if p.status == "executed":
        r = p.result or {}
        await query.edit_message_text(
            query.message.text
            + f"\n\n✅ *Executed* — order `{r.get('order')}` @ `{r.get('price')}`",
            parse_mode="Markdown",
        )
    else:
        await query.edit_message_text(
            query.message.text + f"\n\n⚠️ Failed: {p.result}"
        )


def build_application() -> Application:
    if not settings.telegram_bot_token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN not set")
    app = Application.builder().token(settings.telegram_bot_token).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_start))
    app.add_handler(CommandHandler("account", cmd_account))
    app.add_handler(CommandHandler("positions", cmd_positions))
    app.add_handler(CommandHandler("analyze", cmd_analyze))
    app.add_handler(CommandHandler("strategies", cmd_strategies))
    app.add_handler(CommandHandler("pending", cmd_pending))
    app.add_handler(CallbackQueryHandler(on_button))
    return app


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    app = build_application()
    log.info("Telegram bot started. Press Ctrl+C to stop.")
    app.run_polling()


if __name__ == "__main__":
    main()
