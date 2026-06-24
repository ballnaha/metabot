import asyncio
import logging
import urllib.request
import urllib.parse
import json
import traceback

from .config import settings
from .trader import manager
from .models import Action, PendingTrade, Recommendation

log = logging.getLogger("metabot.worker")

# Active task reference to prevent garbage collection
_worker_task = None

def send_telegram_notification(text: str, reply_markup: dict = None):
    """Send helper that makes a direct HTTP POST request to Telegram Bot API."""
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        log.warning("Telegram notification skipped: Bot token or chat ID not set.")
        return
        
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    payload = {
        "chat_id": settings.telegram_chat_id,
        "text": text,
        "parse_mode": "Markdown"
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
        
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=8) as response:
            response.read()
    except Exception as e:
        log.error("Failed to send Telegram notification: %s", e)

def format_telegram_rec(rec: Recommendation, pending_status: str) -> str:
    """Format recommendation details cleanly for Telegram message."""
    emoji = {"BUY": "🟢", "SELL": "🔴", "HOLD": "⚪"}.get(rec.action.value, "⚪")
    ind = rec.indicators
    
    status_suffix = ""
    if pending_status == "executed":
        status_suffix = "\n\n⚡ *Auto-Executed*"
    elif pending_status == "failed":
        status_suffix = "\n\n❌ *Execution Failed*"
        
    lines = [
        f"🤖 *MetaBot Auto Scan*",
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
        
    lines.append(status_suffix)
    return "\n".join(lines)

async def auto_trade_loop():
    """Infinite loop executing scans on symbol list periodically."""
    log.info("Auto-trade background worker task started.")
    
    # Wait a few seconds for initial MT5 startup and connection
    await asyncio.sleep(5)
    
    # Track the last processed candle time per symbol and timeframe
    # Format: { (symbol, timeframe): candle_open_time }
    last_processed_candles = {}
    
    while True:
        try:
            from . import mt5_client
            if not settings.bot_enabled:
                log.info("Auto-trade loop: Bot is disabled. Skipping scan.")
                await asyncio.sleep(max(10, settings.auto_trade_interval))
                continue

            symbols = settings.symbol_list
            if not symbols:
                log.info("Auto-trade loop: No symbols configured. Sleeping.")
            else:
                log.info("Auto-trade loop: Scanning symbols: %s", symbols)
                for symbol in symbols:
                    try:
                        timeframe = settings.default_timeframe
                        
                        # Fetch the latest candle to check its open time
                        df = mt5_client.get_rates(symbol, timeframe, 3)
                        if df is not None and len(df) > 0:
                            latest_candle_time = str(df["time"].iloc[-1])
                            cache_key = (symbol.upper(), timeframe.upper())
                            
                            # If we've already scanned this candle, skip to prevent duplicate spam
                            if last_processed_candles.get(cache_key) == latest_candle_time:
                                continue
                            
                            # Mark this candle as processed
                            last_processed_candles[cache_key] = latest_candle_time
                        
                        # Scan and stage
                        rec, pending = await manager.analyze_and_stage(
                            symbol=symbol,
                            timeframe=timeframe,
                            strategy_name=settings.strategy,
                            use_ai=settings.use_ai
                        )
                        
                        if rec.action != Action.HOLD and pending:
                            text = format_telegram_rec(rec, pending.status)
                            send_telegram_notification(text)
                            log.info("Auto-trade loop: Signal generated for %s: %s (status: %s)", symbol, rec.action.value, pending.status)
                            
                    except Exception as e:
                        log.error("Auto-trade loop error scanning symbol %s: %s", symbol, e)
                        log.debug(traceback.format_exc())
                        
                    # Yield control to the event loop and throttle MT5 requests
                    await asyncio.sleep(0.2)
                        
        except Exception as e:
            log.error("Auto-trade loop main task error: %s", e)
            log.debug(traceback.format_exc())
            
        # Sleep until next scan round
        interval = max(10, settings.auto_trade_interval)
        log.info("Auto-trade loop: Scan round complete. Sleeping for %s seconds.", interval)
        await asyncio.sleep(interval)

def start_worker():
    """Spawn the asyncio task and keep a global reference to it."""
    global _worker_task
    if _worker_task is not None:
        log.warning("Auto-trade worker task is already running.")
        return
    _worker_task = asyncio.create_task(auto_trade_loop())

def stop_worker():
    """Cancel the worker task safely."""
    global _worker_task
    if _worker_task is None:
        return
    log.info("Stopping auto-trade background worker task.")
    _worker_task.cancel()
    _worker_task = None
