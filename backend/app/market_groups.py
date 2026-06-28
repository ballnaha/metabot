"""Symbol grouping helpers for independent bot limits."""
from __future__ import annotations

import re
from datetime import datetime

CRYPTO_BASES = {
    "1INCH", "AAVE", "ADA", "AGIX", "ALGO", "APE", "APT", "ARB", "ATOM", "AVAX", "AXS",
    "BAT", "BCH", "BNB", "BONK", "BTC", "BTG", "CHZ", "COMP", "CRV", "DASH", "DOGE",
    "DOT", "DYDX", "EGLD", "ENJ", "ETC", "ETH", "FET", "FIL", "FLOKI", "FLOW", "GALA",
    "GRT", "HBAR", "ICP", "IMX", "INJ", "JUP", "LDO", "LINK", "LRC", "LTC", "LUNA",
    "MANA", "MATIC", "MKR", "NEAR", "OCEAN", "OP", "PEPE", "RNDR", "SAND", "SEI",
    "SHIB", "SNX", "SOL", "STORJ", "STX", "SUI", "SUSHI", "THETA", "TIA", "UMA",
    "UNI", "WIF", "XLM", "XRP", "XTZ", "ZEC", "ZRX",
}

CRYPTO_QUOTES = ("USD", "USDT", "BTC", "ETH", "EUR")
FOREX_PREFIXES = ("EUR", "GBP", "AUD", "NZD", "CAD", "CHF", "HKD", "SGD", "ZAR", "MXN", "NOK", "SEK", "DKK", "TRY", "CNH", "RUB")


def is_gold_symbol(symbol: str) -> bool:
    s = symbol.upper()
    return "GOLD" in s or s.startswith("XAU")


def is_crypto_symbol(symbol: str) -> bool:
    s = re.sub(r"[^A-Z0-9]", "", symbol.upper())
    if is_gold_symbol(s):
        return False
    if any(s.startswith(prefix) for prefix in FOREX_PREFIXES) and len(s) == 6:
        return False
    for base in sorted(CRYPTO_BASES, key=len, reverse=True):
        if s == base:
            return True
        if any(s.startswith(f"{base}{quote}") for quote in CRYPTO_QUOTES):
            return True
    return False


def is_stock_symbol(symbol: str) -> bool:
    """True for broker-suffixed equity tickers like AAPL.OQ, NVDA.OQ, TSLA.N."""
    return bool(re.match(r'^[A-Z]{1,6}\.(OQ|N|NY|L|T|AX|HK)$', symbol.upper()))


def is_forex_symbol(symbol: str) -> bool:
    # Strip all non-alpha then take first 6 chars to handle broker suffixes (EURUSDm, EURUSD.r, etc.)
    s = re.sub(r"[^A-Z]", "", symbol.upper())[:6]
    return len(s) == 6 and any(s.startswith(p) for p in FOREX_PREFIXES)


def market_group(symbol: str) -> str:
    if is_gold_symbol(symbol):
        return "gold"
    if is_crypto_symbol(symbol):
        return "crypto"
    if is_stock_symbol(symbol):
        return "stock"
    if is_forex_symbol(symbol):
        return "forex"
    return "stock"


def check_market_open(symbol: str) -> tuple[bool, str]:
    """Check if the market for a given symbol is currently open.
    Returns (is_open, error_message).
    """
    group = market_group(symbol)
    if group == "crypto":
        return True, ""

    try:
        from zoneinfo import ZoneInfo
        ny_tz = ZoneInfo("America/New_York")
        bk_tz = ZoneInfo("Asia/Bangkok")
    except Exception:
        # Fallback if America/New_York timezone is not available
        return True, ""

    now_ny = datetime.now(ny_tz)
    weekday = now_ny.weekday()  # 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
    hour = now_ny.hour

    if group == "stock":
        if weekday >= 5:
            return False, "ตลาดหุ้นปิดทำการในช่วงวันเสาร์-อาทิตย์"
        market_start = now_ny.replace(hour=9, minute=30, second=0, microsecond=0)
        market_end = now_ny.replace(hour=16, minute=0, second=0, microsecond=0)
        if not (market_start <= now_ny <= market_end):
            bk_start = market_start.astimezone(bk_tz).strftime("%H:%M")
            bk_end = market_end.astimezone(bk_tz).strftime("%H:%M")
            return False, f"ตลาดหุ้นปิดทำการนอกเวลาซื้อขายหลัก ({bk_start} - {bk_end} น. เวลาไทย)"

    elif group == "gold":
        if weekday == 5:
            return False, "ตลาดทองคำปิดทำการในช่วงวันเสาร์"
        elif weekday == 4:
            if hour >= 17:
                bk_close = now_ny.replace(hour=17, minute=0, second=0, microsecond=0).astimezone(bk_tz)
                day_name = "วันเสาร์" if bk_close.weekday() == 5 else "วันศุกร์"
                bk_close_str = f"{day_name} เวลา {bk_close.strftime('%H:%M')} น."
                return False, f"ตลาดทองคำปิดทำการแล้วในช่วงสุดสัปดาห์ (ปิด{bk_close_str} เวลาไทย)"
        elif weekday == 6:
            if hour < 18:
                bk_open = now_ny.replace(hour=18, minute=0, second=0, microsecond=0).astimezone(bk_tz)
                day_name = "วันจันทร์" if bk_open.weekday() == 0 else "วันอาทิตย์"
                bk_open_str = f"{day_name} เวลา {bk_open.strftime('%H:%M')} น."
                return False, f"ตลาดทองคำยังไม่เปิดทำการ (เปิด{bk_open_str} เวลาไทย)"
        else:
            if hour == 17:
                bk_break_start = now_ny.replace(hour=17, minute=0, second=0, microsecond=0).astimezone(bk_tz).strftime("%H:%M")
                bk_break_end = now_ny.replace(hour=18, minute=0, second=0, microsecond=0).astimezone(bk_tz).strftime("%H:%M")
                return False, f"ตลาดทองคำปิดทำการชั่วคราวในช่วงพักการซื้อขายรายวัน ({bk_break_start} - {bk_break_end} น. เวลาไทย)"

    elif group == "forex":
        if weekday == 5:
            return False, "ตลาด Forex ปิดทำการในช่วงวันเสาร์"
        elif weekday == 4:
            if hour >= 17:
                bk_close = now_ny.replace(hour=17, minute=0, second=0, microsecond=0).astimezone(bk_tz)
                day_name = "วันเสาร์" if bk_close.weekday() == 5 else "วันศุกร์"
                bk_close_str = f"{day_name} เวลา {bk_close.strftime('%H:%M')} น."
                return False, f"ตลาด Forex ปิดทำการแล้วในช่วงสุดสัปดาห์ (ปิด{bk_close_str} เวลาไทย)"
        elif weekday == 6:
            if hour < 17:
                bk_open = now_ny.replace(hour=17, minute=0, second=0, microsecond=0).astimezone(bk_tz)
                day_name = "วันจันทร์" if bk_open.weekday() == 0 else "วันอาทิตย์"
                bk_open_str = f"{day_name} เวลา {bk_open.strftime('%H:%M')} น."
                return False, f"ตลาด Forex ยังไม่เปิดทำการ (เปิด{bk_open_str} เวลาไทย)"

    return True, ""

