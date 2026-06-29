// Symbol classification shared by every dashboard page.
//
// These helpers were previously copy-pasted into each market page
// (crypto/gold/stocks/forex/home). They are defined once here so the rules
// can't drift between pages.

export const CRYPTO_BASES = [
  "1INCH", "AAVE", "ADA", "AGIX", "ALGO", "APE", "APT", "ARB", "ATOM", "AVAX", "AXS",
  "BAT", "BCH", "BNB", "BONK", "BTC", "BTG", "CHZ", "COMP", "CRV", "DASH", "DOGE",
  "DOT", "DYDX", "EGLD", "ENJ", "ETC", "ETH", "FET", "FIL", "FLOKI", "FLOW", "GALA",
  "GRT", "HBAR", "ICP", "IMX", "INJ", "JUP", "LDO", "LINK", "LRC", "LTC", "LUNA",
  "MANA", "MATIC", "MKR", "NEAR", "OCEAN", "OP", "PEPE", "RNDR", "SAND", "SEI",
  "SHIB", "SNX", "SOL", "STORJ", "STX", "SUI", "SUSHI", "THETA", "TIA", "UMA",
  "UNI", "WIF", "XLM", "XRP", "XTZ", "ZEC", "ZRX",
].sort((a, b) => b.length - a.length);

export const CRYPTO_QUOTES = ["USD", "USDT", "BTC", "ETH", "EUR"];

export const FOREX_PREFIXES = [
  "EUR", "GBP", "AUD", "NZD", "CAD", "CHF", "HKD", "SGD", "ZAR",
  "MXN", "NOK", "SEK", "DKK", "TRY", "CNH", "RUB", "USD", "JPY",
];

export const isMetalSymbol = (sym: string): boolean =>
  /GOLD|SILVER|XAU|XAG|PLATINUM|PALLADIUM/i.test(sym);

export const isCryptoSymbol = (sym: string): boolean => {
  const s = sym.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/GOLD|SILVER|XAU|XAG|PLATINUM|PALLADIUM/.test(s)) return false;
  if (/^(EUR|GBP|AUD|NZD|CAD|CHF|HKD|SGD|ZAR|MXN|NOK|SEK|DKK|TRY|CNH|RUB)[A-Z]{3}$/.test(s)) return false;
  return CRYPTO_BASES.some((base) => s === base || CRYPTO_QUOTES.some((quote) => s.startsWith(`${base}${quote}`)));
};

export const isForexSymbol = (sym: string): boolean => {
  // Slice first 6 alpha chars to handle broker suffixes (EURUSDm, EURUSD.r, EURUSD+, etc.)
  const s = sym.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
  return s.length === 6 && FOREX_PREFIXES.some((p) => s.startsWith(p)) && !isCryptoSymbol(sym) && !isMetalSymbol(sym);
};

// Anything that isn't crypto, a metal, or a forex pair is treated as an equity.
export const isStockSymbol = (sym: string): boolean =>
  !isCryptoSymbol(sym) && !isMetalSymbol(sym) && !isForexSymbol(sym);
