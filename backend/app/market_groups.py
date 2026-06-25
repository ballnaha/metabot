"""Symbol grouping helpers for independent bot limits."""
from __future__ import annotations

import re

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
        if any(s == f"{base}{quote}" for quote in CRYPTO_QUOTES):
            return True
    return False


def is_stock_symbol(symbol: str) -> bool:
    """True for broker-suffixed equity tickers like AAPL.OQ, NVDA.OQ, TSLA.N."""
    return bool(re.match(r'^[A-Z]{1,6}\.(OQ|N|NY|L|T|AX|HK)$', symbol.upper()))


def is_forex_symbol(symbol: str) -> bool:
    s = re.sub(r"[^A-Z]", "", symbol.upper())
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
