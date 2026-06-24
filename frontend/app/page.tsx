"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useToastr } from "./components/Toastr";
import { useRouter } from "next/navigation";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Activity,
  Award,
  Bot,
  Check,
  Globe,
  Hexagon,
  Key,
  Layers,
  Minus,
  Coins,
  Radio,
  RefreshCw,
  Save,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Sliders,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from "lucide-react";

type Account = {
  login: number;
  server: string;
  currency: string;
  balance: number;
  equity: number;
  margin_free: number;
  profit: number;
};
type Position = {
  ticket: number;
  symbol: string;
  type: string;
  volume: number;
  price_open: number;
  price_current: number;
  profit: number;
};
type Opinion = {
  provider: string;
  action: string;
  confidence: number;
  reasoning: string;
  error?: string | null;
};
type Recommendation = {
  symbol: string;
  timeframe: string;
  price: number;
  action: string;
  confidence: number;
  stop_loss: number | null;
  take_profit: number | null;
  suggested_lot: number | null;
  opinions: Opinion[];
  ai_used: boolean;
  ai_verdict: string;
  indicators?: {
    strategy_name: string;
    rule_bias: string;
    strategy_confidence: number;
    rsi: number | null;
    macd_hist: number | null;
    atr: number | null;
  };
};
type Pending = { id: string; lot: number; status: string };
type StrategyInfo = { name: string; description: string };

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`/api/${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || res.statusText);
  return data;
}

const fmt = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined ? "—" : Number(n).toFixed(d);

const MONO = { fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums" };

const actionColor = (a?: string): "success" | "error" | "default" =>
  a === "BUY" ? "success" : a === "SELL" ? "error" : "default";

const barColor = (a?: string): "success" | "error" | "primary" =>
  a === "BUY" ? "success" : a === "SELL" ? "error" : "primary";

const actionMain = (a?: string) =>
  a === "BUY" ? "success.main" : a === "SELL" ? "error.main" : "text.secondary";

const ActionIcon = ({ a, size = 16 }: { a?: string; size?: number }) =>
  a === "BUY" ? (
    <TrendingUp size={size} />
  ) : a === "SELL" ? (
    <TrendingDown size={size} />
  ) : (
    <Minus size={size} />
  );

function KpiCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", color: "text.secondary", mb: 1 }}>
          {icon}
          <Typography variant="overline" color="text.secondary">
            {label}
          </Typography>
        </Stack>
        <Typography variant="h5" sx={{ ...MONO, fontWeight: 700, color }}>
          {value}
        </Typography>
        {sub && (
          <Typography variant="caption" color="text.secondary">
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
      {icon}
      <Typography variant="overline" color="text.secondary">
        {children}
      </Typography>
    </Stack>
  );
}

const TRADINGVIEW_USD_CRYPTO: Record<string, string> = {
  BTC: "COINBASE:BTCUSD",
  ETH: "COINBASE:ETHUSD",
  SOL: "COINBASE:SOLUSD",
  XRP: "COINBASE:XRPUSD",
  LTC: "COINBASE:LTCUSD",
  DOGE: "COINBASE:DOGEUSD",
};

const CRYPTO_BASES = [
  "BTC", "ETH", "SOL", "XRP", "LTC", "DOGE", "ADA", "DOT", "LINK", "AVAX",
  "SHIB", "UNI", "ALGO", "BCH", "XLM", "ATOM", "ICP", "FIL", "HBAR", "XTZ",
  "GRT", "AAVE", "MKR", "THETA", "FTM", "BNB", "DYDX", "OP", "ARB", "NEAR",
  "TIA", "SUI", "SEI", "APT", "RNDR", "INJ", "FET", "AGIX", "OCEAN", "JUP",
  "WIF", "BONK", "FLOKI", "PEPE",
];

function tradingViewCryptoSymbol(symbol: string) {
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const base = CRYPTO_BASES.find((asset) => clean.startsWith(asset) || clean.includes(asset));
  if (!base) return `BINANCE:${clean}`;
  return TRADINGVIEW_USD_CRYPTO[base] ?? `BINANCE:${base}USDT`;
}

function TradingViewWidget({ symbol }: { symbol: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;

    container.current.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;

    const sUpper = symbol.toUpperCase();
    let tvSymbol = tradingViewCryptoSymbol(symbol);
    if (sUpper === "GOLD" || sUpper === "XAUUSD") {
      tvSymbol = "OANDA:XAUUSD";
    } else if (sUpper === "EURUSD") {
      tvSymbol = "FX:EURUSD";
    }

    script.innerHTML = JSON.stringify({
      width: "100%",
      height: 400,
      symbol: tvSymbol,
      interval: "15",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      enable_publishing: false,
      allow_symbol_change: false,
      calendar: false,
      support_host: "https://www.tradingview.com"
    });

    container.current.appendChild(script);
  }, [symbol]);

  return (
    <Box
      ref={container}
      className="tradingview-widget-container"
      sx={{ height: 400, width: "100%", overflow: "hidden", border: "1px solid rgba(255, 255, 255, 0.05)" }}
    />
  );
}

export default function Dashboard() {
  const toastr = useToastr();
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const connectedRef = useRef<boolean | null>(null);
  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [symbol, setSymbol] = useState("");
  const [timeframe, setTimeframe] = useState("M15");
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [strategy, setStrategy] = useState("");
  const [useAi, setUseAi] = useState(true);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Navigation tab: dashboard or settings or crypto or metals or stocks
  const [currentTab, setCurrentTab] = useState<"dashboard" | "crypto" | "metals" | "stocks" | "settings">("dashboard");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab") as any;
      if (tab && ["dashboard", "metals", "stocks", "settings"].includes(tab)) {
        setCurrentTab(tab);
      }
    }
  }, []);

  // Crypto Trading States
  const [cryptoSymbol, setCryptoSymbol] = useState("");
  const [cryptoLot, setCryptoLot] = useState(0.01);
  const [cryptoSl, setCryptoSl] = useState("");
  const [cryptoTp, setCryptoTp] = useState("");
  const [cryptoTick, setCryptoTick] = useState<{ bid: number; ask: number; last: number; time: number } | null>(null);
  const [cryptoTickLoading, setCryptoTickLoading] = useState(false);
  const [tradingCrypto, setTradingCrypto] = useState(false);

  // Metals Trading States
  const [metalSymbol, setMetalSymbol] = useState("");
  const [metalLot, setMetalLot] = useState(0.01);
  const [metalSl, setMetalSl] = useState("");
  const [metalTp, setMetalTp] = useState("");
  const [metalTick, setMetalTick] = useState<{ bid: number; ask: number; last: number; time: number } | null>(null);
  const [metalTickLoading, setMetalTickLoading] = useState(false);
  const [tradingMetal, setTradingMetal] = useState(false);

  // Stocks Trading States
  const [stockSymbol, setStockSymbol] = useState("");
  const [stockLot, setStockLot] = useState(1.0);
  const [stockSl, setStockSl] = useState("");
  const [stockTp, setStockTp] = useState("");
  const [stockTick, setStockTick] = useState<{ bid: number; ask: number; last: number; time: number } | null>(null);
  const [stockTickLoading, setStockTickLoading] = useState(false);
  const [tradingStock, setTradingStock] = useState(false);

  // Tick Error States
  const [cryptoTickError, setCryptoTickError] = useState<string | null>(null);
  const [metalTickError, setMetalTickError] = useState<string | null>(null);
  const [stockTickError, setStockTickError] = useState<string | null>(null);

  // Settings Section Separated Inputs
  const [forexInput, setForexInput] = useState("");
  const [metalsInput, setMetalsInput] = useState("");
  const [cryptoInput, setCryptoInput] = useState("");
  const [stocksInput, setStocksInput] = useState("");
  const settingsLoaded = useRef(false);

  // Settings State Form
  const [settingsForm, setSettingsForm] = useState<any>({
    mt5_login: "",
    mt5_password: "",
    mt5_server: "",
    mt5_path: "",
    deepseek_api_key: "",
    deepseek_model: "deepseek-chat",
    gemini_api_key: "",
    gemini_model: "gemini-1.5-flash",
    ai_providers: "deepseek,gemini",
    use_ai: false,
    telegram_bot_token: "",
    telegram_chat_id: "",
    symbols: "EURUSD,GOLD,BTCUSD",
    default_timeframe: "M15",
    strategy: "ema_macd_rsi",
    risk_per_trade: 0.01,
    max_lot: 1.0,
    magic: 556677,
    atr_sl_mult: 1.5,
    default_rr: 2.0,
    require_confirm: true,
    api_key: "",
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [settingsWarning, setSettingsWarning] = useState<string | null>(null);
  const [detectingSymbols, setDetectingSymbols] = useState(false);
  const [detectingMetals, setDetectingMetals] = useState(false);
  const [detectingStocks, setDetectingStocks] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [a, p] = await Promise.all([api("account"), api("positions")]);
      setAccount(a);
      if (connectedRef.current === false) {
        toastr.success("MT5 terminal connected successfully.");
      }
      setConnected(true);
      setPositions(p.positions ?? []);
    } catch (e: any) {
      if (connectedRef.current !== false) {
        toastr.error(`MT5 connection lost: ${e.message}`);
      }
      setConnected(false);
      setError(e.message);
    }
  }, [toastr]);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await api("settings");
      settingsLoaded.current = false;
      setSettingsForm(data);
    } catch (e: any) {
      console.error("Failed to fetch settings:", e);
    }
  }, []);

  const isMetalSymbol = (sym: string) => {
    return /GOLD|SILVER|XAU|XAG|PLATINUM|PALLADIUM/i.test(sym);
  };

  const isCryptoSymbol = (sym: string) => {
    const s = sym.toUpperCase();
    return /BTC|ETH|SOL|XRP|LTC|DOGE|ADA|DOT|LINK|AVAX|SHIB|UNI|LUNA|ALGO|BCH|XLM|ATOM|ICP|FIL|HBAR|XTZ|GRT|AAVE|MKR|THETA|FTM|BNB|DYDX|OP|ARB|NEAR|TIA|SUI|SEI|APT|RNDR|INJ|FET|AGIX|OCEAN|JUP|WIF|BONK|FLOKI|PEPE/i.test(s)
      || ((s.endsWith("USD") || s.endsWith("USDT")) && s.length >= 6 && !/^(EUR|GBP|AUD|NZD|CAD|CHF|HKD|SGD|ZAR|MXN|NOK|SEK|DKK|TRY|CNH|RUB|XAU|XAG|XPD|XPT)/.test(s));
  };

  const isForexSymbol = (sym: string) => {
    return /^[A-Z]{6}$/i.test(sym) && !isCryptoSymbol(sym) && !isMetalSymbol(sym);
  };

  const isStockSymbol = (sym: string) => {
    return !isCryptoSymbol(sym) && !isMetalSymbol(sym) && !isForexSymbol(sym);
  };

  const cryptoSymbols = symbols.filter(isCryptoSymbol);
  const metalSymbols = symbols.filter(isMetalSymbol);
  const stockSymbols = symbols.filter(isStockSymbol);
  const forexSymbols = symbols.filter(isForexSymbol);

  // Sync separate setting inputs when symbols config is loaded/saved
  useEffect(() => {
    if (!settingsForm.symbols || settingsLoaded.current) return;
    const syms = settingsForm.symbols.split(",").map((s: string) => s.trim().toUpperCase()).filter(Boolean);
    setForexInput(syms.filter(isForexSymbol).join(","));
    setMetalsInput(syms.filter(isMetalSymbol).join(","));
    setCryptoInput(syms.filter(isCryptoSymbol).join(","));
    setStocksInput(syms.filter(isStockSymbol).join(","));
    settingsLoaded.current = true;
  }, [settingsForm.symbols]);

  const handleSymbolsChange = (type: "forex" | "metals" | "crypto" | "stocks", value: string) => {
    let f = forexInput;
    let m = metalsInput;
    let c = cryptoInput;
    let s = stocksInput;

    if (type === "forex") { f = value; setForexInput(value); }
    if (type === "metals") { m = value; setMetalsInput(value); }
    if (type === "crypto") { c = value; setCryptoInput(value); }
    if (type === "stocks") { s = value; setStocksInput(value); }

    const all = [
      ...f.split(",").map(x => x.trim().toUpperCase()),
      ...m.split(",").map(x => x.trim().toUpperCase()),
      ...c.split(",").map(x => x.trim().toUpperCase()),
      ...s.split(",").map(x => x.trim().toUpperCase())
    ].filter(Boolean);

    setSettingsForm({ ...settingsForm, symbols: all.join(",") });
  };

  useEffect(() => {
    api("symbols")
      .then((s) => {
        setSymbols(s.symbols ?? []);
        const forex = (s.symbols ?? []).filter(isForexSymbol);
        setSymbol((prev) => prev || (forex[0] || s.symbols?.[0] || ""));
        const cryptos = (s.symbols ?? []).filter(isCryptoSymbol);
        setCryptoSymbol((prev) => prev || (cryptos[0] || "BTCUSD"));
        const metals = (s.symbols ?? []).filter(isMetalSymbol);
        setMetalSymbol((prev) => prev || (metals[0] || "GOLD"));
        const stocks = (s.symbols ?? []).filter(isStockSymbol);
        setStockSymbol((prev) => prev || (stocks[0] || ""));
        setTimeframe((prev) => prev || (s.default_timeframe ?? "M15"));
      })
      .catch((e) => {
        setError(e.message);
        toastr.error(`Failed to load symbols: ${e.message}`);
      });
    api("strategies")
      .then((s) => {
        setStrategies(s.strategies ?? []);
        setStrategy((prev) => prev || (s.default ?? ""));
        setUseAi((prev) => prev !== undefined ? prev : (s.use_ai_default ?? true));
      })
      .catch((e) => {
        toastr.error(`Failed to load strategies: ${e.message}`);
      });
    fetchSettings();
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh, fetchSettings, toastr]);

  async function analyze() {
    setLoading(true);
    setError("");
    setRec(null);
    setPending(null);
    try {
      const data = await api("analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, timeframe, strategy: strategy || undefined, use_ai: useAi }),
      });
      setRec(data.recommendation);
      setPending(data.pending);
      if (data.recommendation) {
        toastr.success(`Analysis completed for ${symbol}!`);
      }
    } catch (e: any) {
      setError(e.message);
      toastr.error(`Analysis failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!pending) return;
    try {
      const p = await api("confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pending_id: pending.id }),
      });
      setPending({ ...pending, status: p.status });
      refresh();
      toastr.success("Trade executed successfully!");
    } catch (e: any) {
      setError(e.message);
      toastr.error(`Execution failed: ${e.message}`);
    }
  }

  async function cancel() {
    if (!pending) return;
    try {
      await api("cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pending_id: pending.id }),
      });
      setPending({ ...pending, status: "cancelled" });
      toastr.info("Staged trade cancelled");
    } catch (e: any) {
      toastr.error(`Cancel failed: ${e.message}`);
    }
  }

  async function closePos(ticket: number) {
    try {
      await api(`positions/${ticket}/close`, { method: "POST" });
      refresh();
      toastr.success(`Position #${ticket} closed successfully.`);
    } catch (e: any) {
      setError(e.message);
      toastr.error(`Failed to close position: ${e.message}`);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSuccess(null);
    setSettingsWarning(null);
    setError("");
    try {
      const res = await api("settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsForm),
      });
      setSettingsSuccess("Settings saved successfully!");
      toastr.success("Settings saved successfully!");
      if (res.warning) {
        setSettingsWarning(res.warning);
        toastr.warning(res.warning, 6000);
      }

      // Update local controls with newly configured list of symbols and strategies
      api("symbols")
        .then((s) => {
          setSymbols(s.symbols ?? []);
          setSymbol((prev) => s.symbols?.includes(prev) ? prev : (s.symbols?.[0] ?? ""));
        })
        .catch(() => { });
      api("strategies")
        .then((s) => {
          setStrategies(s.strategies ?? []);
          setStrategy((prev) => s.strategies?.some((st: any) => st.name === prev) ? prev : (s.default ?? ""));
        })
        .catch(() => { });
      refresh();
    } catch (e: any) {
      setError(e.message || "Failed to save settings");
      toastr.error(e.message || "Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  }

  async function autoDetectSymbols() {
    setDetectingSymbols(true);
    try {
      const data = await api("symbols/detect-crypto");
      if (data.symbols && data.symbols.length > 0) {
        const currentList = settingsForm.symbols.split(",").map((s: string) => s.trim().toUpperCase()).filter(Boolean);
        const nonCrypto = currentList.filter((s: string) => !isCryptoSymbol(s));
        const merged = [...nonCrypto, ...data.symbols];
        setCryptoInput(data.symbols.join(","));
        setSettingsForm({ ...settingsForm, symbols: merged.join(",") });
        toastr.success(`Auto-detected ${data.symbols.length} tradeable crypto symbols from MT5!`);
      } else {
        toastr.warning("No crypto symbols found in your MT5 terminal.");
      }
    } catch (e: any) {
      toastr.error(`Failed to scan symbols: ${e.message}`);
    } finally {
      setDetectingSymbols(false);
    }
  }

  async function autoDetectMetals() {
    setDetectingMetals(true);
    try {
      const data = await api("symbols/detect-metals");
      if (data.symbols && data.symbols.length > 0) {
        const currentList = settingsForm.symbols.split(",").map((s: string) => s.trim().toUpperCase()).filter(Boolean);
        const nonMetals = currentList.filter((s: string) => !isMetalSymbol(s));
        const merged = [...nonMetals, ...data.symbols];
        setMetalsInput(data.symbols.join(","));
        setSettingsForm({ ...settingsForm, symbols: merged.join(",") });
        toastr.success(`Auto-detected ${data.symbols.length} tradeable metal symbols from MT5!`);
      } else {
        toastr.warning("No metal symbols found in your MT5 terminal.");
      }
    } catch (e: any) {
      toastr.error(`Failed to scan metals: ${e.message}`);
    } finally {
      setDetectingMetals(false);
    }
  }

  async function autoDetectStocks() {
    setDetectingStocks(true);
    try {
      const data = await api("symbols/detect-stocks");
      if (data.symbols && data.symbols.length > 0) {
        const currentList = settingsForm.symbols.split(",").map((s: string) => s.trim().toUpperCase()).filter(Boolean);
        const nonStocks = currentList.filter((s: string) => !isStockSymbol(s));
        const merged = [...nonStocks, ...data.symbols];
        setStocksInput(data.symbols.join(","));
        setSettingsForm({ ...settingsForm, symbols: merged.join(",") });
        toastr.success(`Auto-detected ${data.symbols.length} tradeable stock symbols from MT5!`);
      } else {
        toastr.warning("No stock symbols found in your MT5 terminal.");
      }
    } catch (e: any) {
      toastr.error(`Failed to scan stocks: ${e.message}`);
    } finally {
      setDetectingStocks(false);
    }
  }

  // Poll crypto tick price when on crypto tab
  useEffect(() => {
    if (currentTab !== "crypto" || !cryptoSymbol) {
      setCryptoTickError(null);
      return;
    }

    let active = true;
    setCryptoTickError(null);

    const fetchTick = async () => {
      try {
        setCryptoTickLoading(true);
        const data = await api(`symbols/${cryptoSymbol}/tick`);
        if (active) {
          setCryptoTick(data);
          setCryptoTickError(null);
        }
      } catch (e: any) {
        if (active) {
          console.warn("Failed to fetch crypto tick:", e.message);
          setCryptoTick(null);
          setCryptoTickError(e.message);
        }
      } finally {
        if (active) setCryptoTickLoading(false);
      }
    };

    fetchTick();
    const intervalId = setInterval(fetchTick, 3000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [currentTab, cryptoSymbol]);

  // Poll metals tick price when on metals tab
  useEffect(() => {
    if (currentTab !== "metals" || !metalSymbol) {
      setMetalTickError(null);
      return;
    }

    let active = true;
    setMetalTickError(null);

    const fetchTick = async () => {
      try {
        setMetalTickLoading(true);
        const data = await api(`symbols/${metalSymbol}/tick`);
        if (active) {
          setMetalTick(data);
          setMetalTickError(null);
        }
      } catch (e: any) {
        if (active) {
          console.warn("Failed to fetch metal tick:", e.message);
          setMetalTick(null);
          setMetalTickError(e.message);
        }
      } finally {
        if (active) setMetalTickLoading(false);
      }
    };

    fetchTick();
    const intervalId = setInterval(fetchTick, 3000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [currentTab, metalSymbol]);

  // Poll stocks tick price when on stocks tab
  useEffect(() => {
    if (currentTab !== "stocks" || !stockSymbol) {
      setStockTickError(null);
      return;
    }

    let active = true;
    setStockTickError(null);

    const fetchTick = async () => {
      try {
        setStockTickLoading(true);
        const data = await api(`symbols/${stockSymbol}/tick`);
        if (active) {
          setStockTick(data);
          setStockTickError(null);
        }
      } catch (e: any) {
        if (active) {
          console.warn("Failed to fetch stock tick:", e.message);
          setStockTick(null);
          setStockTickError(e.message);
        }
      } finally {
        if (active) setStockTickLoading(false);
      }
    };

    fetchTick();
    const intervalId = setInterval(fetchTick, 3000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [currentTab, stockSymbol]);

  async function placeCryptoOrder(action: "BUY" | "SELL") {
    if (!cryptoSymbol) return;
    setTradingCrypto(true);
    try {
      const lotVal = parseFloat(String(cryptoLot));
      if (isNaN(lotVal) || lotVal <= 0) {
        toastr.error("Please enter a valid lot size");
        return;
      }
      const slVal = cryptoSl ? parseFloat(String(cryptoSl)) : undefined;
      const tpVal = cryptoTp ? parseFloat(String(cryptoTp)) : undefined;

      const result = await api("trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: cryptoSymbol,
          action,
          lot: lotVal,
          sl: slVal,
          tp: tpVal,
        }),
      });

      if (result.ok) {
        toastr.success(`Successfully placed MT5 ${action} order for ${lotVal} ${cryptoSymbol}!`);
        setCryptoSl("");
        setCryptoTp("");
        refresh();
      } else {
        toastr.error(`Trade failed: ${result.comment || "Unknown error"}`);
      }
    } catch (e: any) {
      toastr.error(`Trade error: ${e.message}`);
    } finally {
      setTradingCrypto(false);
    }
  }

  async function placeMetalOrder(action: "BUY" | "SELL") {
    if (!metalSymbol) return;
    setTradingMetal(true);
    try {
      const lotVal = parseFloat(String(metalLot));
      if (isNaN(lotVal) || lotVal <= 0) {
        toastr.error("Please enter a valid lot size");
        return;
      }
      const slVal = metalSl ? parseFloat(String(metalSl)) : undefined;
      const tpVal = metalTp ? parseFloat(String(metalTp)) : undefined;

      const result = await api("trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: metalSymbol,
          action,
          lot: lotVal,
          sl: slVal,
          tp: tpVal,
        }),
      });

      if (result.ok) {
        toastr.success(`Successfully placed MT5 ${action} order for ${lotVal} ${metalSymbol}!`);
        setMetalSl("");
        setMetalTp("");
        refresh();
      } else {
        toastr.error(`Trade failed: ${result.comment || "Unknown error"}`);
      }
    } catch (e: any) {
      toastr.error(`Trade error: ${e.message}`);
    } finally {
      setTradingMetal(false);
    }
  }

  async function placeStockOrder(action: "BUY" | "SELL") {
    if (!stockSymbol) return;
    setTradingStock(true);
    try {
      const lotVal = parseFloat(String(stockLot));
      if (isNaN(lotVal) || lotVal <= 0) {
        toastr.error("Please enter a valid lot size");
        return;
      }
      const slVal = stockSl ? parseFloat(String(stockSl)) : undefined;
      const tpVal = stockTp ? parseFloat(String(stockTp)) : undefined;

      const result = await api("trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: stockSymbol,
          action,
          lot: lotVal,
          sl: slVal,
          tp: tpVal,
        }),
      });

      if (result.ok) {
        toastr.success(`Successfully placed MT5 ${action} order for ${lotVal} ${stockSymbol}!`);
        setStockSl("");
        setStockTp("");
        refresh();
      } else {
        toastr.error(`Trade failed: ${result.comment || "Unknown error"}`);
      }
    } catch (e: any) {
      toastr.error(`Trade error: ${e.message}`);
    } finally {
      setTradingStock(false);
    }
  }

  const ccy = account?.currency ?? "";
  const pl = account?.profit ?? 0;
  const activeStrategy = strategies.find((s) => s.name === strategy);
  const strategyDesc = activeStrategy?.description ?? "";
  const selectedStrategyValue = activeStrategy ? strategy : "";
  const settingsStrategyExists = strategies.some((s) => s.name === settingsForm.strategy);
  const selectedSettingsStrategyValue = settingsStrategyExists ? settingsForm.strategy : "";

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      {/* Sidebar - Desktop */}
      <Box
        sx={{
          width: 280,
          borderRight: "1px solid",
          borderColor: "divider",
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          p: 3,
          gap: 4,
          bgcolor: "background.paper",
          backgroundImage: "linear-gradient(180deg, #0a0e17, #07090e)",
        }}
      >
        {/* Logo/Identity */}
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2.5,
              display: "grid",
              placeItems: "center",
              background: "linear-gradient(135deg,#3b82f6,#6366f1)",
              boxShadow: "0 4px 14px rgba(59, 130, 246, 0.3)",
            }}
          >
            <Hexagon size={22} fill="#fff" color="#fff" />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ lineHeight: 1.1, fontWeight: 800 }}>
              MetaBot
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, fontWeight: 600 }}>
              MT5 Advisory &amp; Auto-Trading
            </Typography>
          </Box>
        </Stack>

        {/* Sidebar Nav Buttons */}
        <Stack spacing={1} sx={{ flexGrow: 1 }}>
          <Button
            variant={currentTab === "dashboard" ? "contained" : "text"}
            fullWidth
            onClick={() => setCurrentTab("dashboard")}
            startIcon={<TrendingUp size={18} />}
            sx={{
              justifyContent: "flex-start",
              py: 1.25,
              px: 2,
              borderRadius: 2.5,
              bgcolor: currentTab === "dashboard" ? "primary.main" : "transparent",
              color: currentTab === "dashboard" ? "primary.contrastText" : "text.secondary",
              "&:hover": {
                bgcolor: currentTab === "dashboard" ? "primary.dark" : "rgba(255,255,255,0.03)",
                color: "text.primary"
              },
              transition: "all 0.2s ease"
            }}
          >
            Dashboard
          </Button>
          <Button
            variant={currentTab === "crypto" ? "contained" : "text"}
            fullWidth
            onClick={() => router.push("/crypto")}
            startIcon={<Coins size={18} />}
            sx={{
              justifyContent: "flex-start",
              py: 1.25,
              px: 2,
              borderRadius: 2.5,
              bgcolor: currentTab === "crypto" ? "primary.main" : "transparent",
              color: currentTab === "crypto" ? "primary.contrastText" : "text.secondary",
              "&:hover": {
                bgcolor: currentTab === "crypto" ? "primary.dark" : "rgba(255,255,255,0.03)",
                color: "text.primary"
              },
              transition: "all 0.2s ease"
            }}
          >
            Crypto Trading
          </Button>
          <Button
            variant={currentTab === "metals" ? "contained" : "text"}
            fullWidth
            onClick={() => setCurrentTab("metals")}
            startIcon={<Award size={18} />}
            sx={{
              justifyContent: "flex-start",
              py: 1.25,
              px: 2,
              borderRadius: 2.5,
              bgcolor: currentTab === "metals" ? "primary.main" : "transparent",
              color: currentTab === "metals" ? "primary.contrastText" : "text.secondary",
              "&:hover": {
                bgcolor: currentTab === "metals" ? "primary.dark" : "rgba(255,255,255,0.03)",
                color: "text.primary"
              },
              transition: "all 0.2s ease"
            }}
          >
            Gold &amp; Metals
          </Button>
          <Button
            variant={currentTab === "stocks" ? "contained" : "text"}
            fullWidth
            onClick={() => setCurrentTab("stocks")}
            startIcon={<Globe size={18} />}
            sx={{
              justifyContent: "flex-start",
              py: 1.25,
              px: 2,
              borderRadius: 2.5,
              bgcolor: currentTab === "stocks" ? "primary.main" : "transparent",
              color: currentTab === "stocks" ? "primary.contrastText" : "text.secondary",
              "&:hover": {
                bgcolor: currentTab === "stocks" ? "primary.dark" : "rgba(255,255,255,0.03)",
                color: "text.primary"
              },
              transition: "all 0.2s ease"
            }}
          >
            Stock Trading
          </Button>
          <Button
            variant={currentTab === "settings" ? "contained" : "text"}
            fullWidth
            onClick={() => setCurrentTab("settings")}
            startIcon={<Settings size={18} />}
            sx={{
              justifyContent: "flex-start",
              py: 1.25,
              px: 2,
              borderRadius: 2.5,
              bgcolor: currentTab === "settings" ? "primary.main" : "transparent",
              color: currentTab === "settings" ? "primary.contrastText" : "text.secondary",
              "&:hover": {
                bgcolor: currentTab === "settings" ? "primary.dark" : "rgba(255,255,255,0.03)",
                color: "text.primary"
              },
              transition: "all 0.2s ease"
            }}
          >
            Settings
          </Button>
        </Stack>

        {/* Connection Widget in Sidebar Footer */}
        <Box
          sx={{
            p: 2,
            borderRadius: 3,
            bgcolor: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
              <Box
                sx={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  bgcolor:
                    connected === null ? "text.disabled" : connected ? "success.main" : "error.main",
                  boxShadow: connected ? "0 0 10px rgba(22, 199, 132, 0.4)" : "none",
                }}
              />
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {connected === null
                  ? "Connecting…"
                  : connected
                    ? "Connected"
                    : "Disconnected"}
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 11 }}>
              {connected ? `MT5 Account: #${account?.login}` : "MT5 connection offline"}
            </Typography>
            {account && (
              <Typography variant="caption" color="success.main" sx={{ ...MONO, fontWeight: 700, fontSize: 11 }}>
                Equity: {fmt(account.equity)} {ccy}
              </Typography>
            )}
          </Stack>
        </Box>
      </Box>

      {/* Main Content Area */}
      <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Top Navbar */}
        <AppBar position="static" elevation={0}>
          <Toolbar sx={{ justifyContent: "space-between" }}>
            {/* Mobile Header Logo */}
            <Stack direction="row" spacing={1} sx={{ display: { xs: "flex", md: "none" }, alignItems: "center" }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 2,
                  display: "grid",
                  placeItems: "center",
                  background: "linear-gradient(135deg,#3b82f6,#6366f1)",
                }}
              >
                <Hexagon size={16} fill="#fff" color="#fff" />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 800, fontSize: "1.1rem" }}>
                MetaBot
              </Typography>
            </Stack>

            {/* Title for Desktop View */}
            <Typography variant="h6" sx={{ display: { xs: "none", md: "block" }, fontWeight: 800 }}>
              {currentTab === "dashboard"
                ? "Trading Advisor Dashboard"
                : currentTab === "crypto"
                  ? "Crypto Trading Center"
                  : currentTab === "metals"
                    ? "Gold & Metals Hub"
                    : currentTab === "stocks"
                      ? "Stock Trading Terminal"
                      : "System Settings Options"}
            </Typography>

            {/* Mobile Tabs */}
            <Stack direction="row" spacing={1} sx={{ display: { xs: "flex", md: "none" } }}>
              <Button
                size="small"
                variant={currentTab === "dashboard" ? "contained" : "text"}
                onClick={() => setCurrentTab("dashboard")}
                sx={{ borderRadius: 1.5 }}
              >
                Dashboard
              </Button>
              <Button
                size="small"
                variant={currentTab === "crypto" ? "contained" : "text"}
                onClick={() => setCurrentTab("crypto")}
                sx={{ borderRadius: 1.5 }}
              >
                Crypto
              </Button>
              <Button
                size="small"
                variant={currentTab === "metals" ? "contained" : "text"}
                onClick={() => setCurrentTab("metals")}
                sx={{ borderRadius: 1.5 }}
              >
                Metals
              </Button>
              <Button
                size="small"
                variant={currentTab === "stocks" ? "contained" : "text"}
                onClick={() => setCurrentTab("stocks")}
                sx={{ borderRadius: 1.5 }}
              >
                Stocks
              </Button>
              <Button
                size="small"
                variant={currentTab === "settings" ? "contained" : "text"}
                onClick={() => setCurrentTab("settings")}
                sx={{ borderRadius: 1.5 }}
              >
                Settings
              </Button>
            </Stack>

            {/* Right-side Stats Widget */}
            <Stack direction="row" spacing={3} sx={{ alignItems: "center" }}>
              <Box sx={{ display: { xs: "none", sm: "block" }, textAlign: "right" }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: 1 }}>
                  SERVER
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: connected ? "text.primary" : "error.main" }}>
                  {connected ? account?.server : "offline"}
                </Typography>
              </Box>
              <Box sx={{ textAlign: "right" }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: 1 }}>
                  EQUITY
                </Typography>
                <Typography sx={{ ...MONO, fontWeight: 800, color: "primary.main" }}>
                  {account ? `${fmt(account.equity)} ${ccy}` : "—"}
                </Typography>
              </Box>
            </Stack>
          </Toolbar>
        </AppBar>

        {/* Dynamic Page Content */}
        <Container maxWidth="lg" sx={{ py: 4, flexGrow: 1, overflowY: "auto" }}>

          {currentTab === "dashboard" ? (
            /* Dashboard Tab Content */
            <Stack spacing={3}>
              {/* Account Ticker Bar */}
              <Card>
                <CardContent sx={{ py: 2, px: 3, "&:last-child": { pb: 2 } }}>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={{ xs: 2.5, md: 4 }}
                    sx={{ justifyContent: "space-between", alignItems: "stretch" }}
                  >
                    {/* Balance */}
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flex: 1 }}>
                      <Box sx={{ p: 1, borderRadius: 2.5, bgcolor: "rgba(59, 130, 246, 0.08)", display: "flex" }}>
                        <Wallet size={18} color="#3b82f6" />
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                          Balance
                        </Typography>
                        <Typography variant="h6" sx={{ ...MONO, fontWeight: 800, lineHeight: 1.2 }}>
                          {account ? `${fmt(account.balance)}` : "—"}{" "}
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{ccy}</span>
                        </Typography>
                      </Box>
                    </Stack>

                    {/* Equity */}
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flex: 1 }}>
                      <Box sx={{ p: 1, borderRadius: 2.5, bgcolor: "rgba(99, 102, 241, 0.08)", display: "flex" }}>
                        <Activity size={18} color="#6366f1" />
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                          Equity
                        </Typography>
                        <Typography variant="h6" sx={{ ...MONO, fontWeight: 800, lineHeight: 1.2, color: "primary.main" }}>
                          {account ? `${fmt(account.equity)}` : "—"}{" "}
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{ccy}</span>
                        </Typography>
                      </Box>
                    </Stack>

                    {/* Free Margin */}
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flex: 1 }}>
                      <Box sx={{ p: 1, borderRadius: 2.5, bgcolor: "rgba(240, 160, 32, 0.08)", display: "flex" }}>
                        <Layers size={18} color="#f0a020" />
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                          Free Margin
                        </Typography>
                        <Typography variant="h6" sx={{ ...MONO, fontWeight: 800, lineHeight: 1.2 }}>
                          {account ? `${fmt(account.margin_free)}` : "—"}{" "}
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{ccy}</span>
                        </Typography>
                      </Box>
                    </Stack>

                    {/* Open P/L */}
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flex: 1 }}>
                      <Box sx={{ p: 1, borderRadius: 2.5, bgcolor: pl >= 0 ? "rgba(22, 199, 132, 0.08)" : "rgba(234, 57, 67, 0.08)", display: "flex" }}>
                        <TrendingUp size={18} color={pl >= 0 ? "#16c784" : "#ea3943"} />
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                          Open Profit/Loss
                        </Typography>
                        <Typography variant="h6" sx={{ ...MONO, fontWeight: 800, lineHeight: 1.2, color: pl >= 0 ? "success.main" : "error.main" }}>
                          {pl >= 0 ? "+" : ""}{fmt(pl)}{" "}
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{ccy}</span>
                        </Typography>
                      </Box>
                    </Stack>

                    {/* Active Contracts */}
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flex: 0.8 }}>
                      <Box sx={{ p: 1, width: 36, height: 36, borderRadius: 2.5, bgcolor: "rgba(255, 255, 255, 0.02)", display: "grid", placeItems: "center", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <Typography variant="body1" sx={{ ...MONO, fontWeight: 800 }}>
                          {positions.length}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                          Open Trades
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 10, fontWeight: 500 }}>
                          Active positions
                        </Typography>
                      </Box>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>

              {/* Two Column Grid */}
              <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", lg: "1.6fr 1fr" }, alignItems: "start" }}>
                {/* Main Left Column */}
                <Stack spacing={3}>
                  {/* Analyse console */}
                  <Card>
                    <CardContent>
                      <SectionTitle icon={<Zap size={16} color="#3b82f6" />}>Asset Scanner</SectionTitle>
                      <Stack
                        direction="row"
                        spacing={2}
                        useFlexGap
                        sx={{ flexWrap: "wrap", alignItems: "center" }}
                      >
                        <FormControl size="small" sx={{ minWidth: 140, flexGrow: 1 }}>
                          <InputLabel>Symbol</InputLabel>
                          <Select label="Symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                            {forexSymbols.map((s) => (
                              <MenuItem key={s} value={s}>
                                {s}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControl size="small" sx={{ minWidth: 110, flexGrow: 0.5 }}>
                          <InputLabel>Timeframe</InputLabel>
                          <Select label="Timeframe" value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                            {["M1", "M5", "M15", "M30", "H1", "H4", "D1"].map((t) => (
                              <MenuItem key={t} value={t}>
                                {t}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControl size="small" sx={{ minWidth: 170, flexGrow: 1.5 }}>
                          <InputLabel>Strategy</InputLabel>
                          <Select label="Strategy" value={selectedStrategyValue} onChange={(e) => setStrategy(e.target.value)}>
                            <MenuItem value="" disabled>
                              Loading strategies...
                            </MenuItem>
                            {strategies.map((s) => (
                              <MenuItem key={s.name} value={s.name}>
                                {s.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <Tooltip title="AI confirms the strategy signal as a second filter">
                          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", px: 1 }}>
                            <Bot size={16} color={useAi ? "#3b82f6" : "#6b7686"} />
                            <Switch checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
                            <Typography variant="body2" color="text.secondary">
                              AI {useAi ? "On" : "Off"}
                            </Typography>
                          </Stack>
                        </Tooltip>
                        <Button
                          variant="contained"
                          onClick={analyze}
                          disabled={loading || !symbol}
                          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Zap size={16} />}
                          sx={{ px: 3.5, py: 1 }}
                        >
                          Analyse
                        </Button>
                      </Stack>
                      {strategyDesc && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
                          {strategyDesc} ·{" "}
                          {useAi ? "AI filter active (Double-confirmation)." : "Strategy only mode."}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>

                  {/* Signal Ticket (Trade Ticket) */}
                  {rec && (
                    <Card sx={{ border: "1px solid", borderColor: rec.action === "HOLD" ? "rgba(255,255,255,0.05)" : actionMain(rec.action) }}>
                      <CardContent>
                        <SectionTitle icon={<Radio size={16} color="#3b82f6" />}>Order Ticket Details</SectionTitle>

                        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {/* Symbol details */}
                          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                            <Stack spacing={0.5}>
                              <Typography variant="h5" sx={{ fontWeight: 900, display: "flex", alignItems: "center", gap: 1.5 }}>
                                {rec.symbol}
                                <Chip
                                  size="small"
                                  label={rec.action}
                                  color={actionColor(rec.action)}
                                  sx={{ fontWeight: 900, fontSize: "0.8rem", height: 24, px: 0.5 }}
                                />
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                                Price @ <span style={MONO}>{rec.price}</span> · Timeframe: {rec.timeframe}
                              </Typography>
                            </Stack>

                            {/* R:R Ratio pill */}
                            {rec.stop_loss && rec.take_profit && (
                              <Chip
                                variant="outlined"
                                label={`R:R Ratio 1:${fmt(
                                  Math.abs((rec.take_profit - rec.price) / (rec.stop_loss - rec.price)),
                                  1
                                )}`}
                                sx={{ fontWeight: 700, borderColor: "rgba(59, 130, 246, 0.2)", color: "primary.main", px: 0.5 }}
                              />
                            )}
                          </Stack>

                          {/* Confidence level */}
                          <Box sx={{ p: 2, borderRadius: 2, bgcolor: "rgba(255, 255, 255, 0.015)", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: "uppercase" }}>
                                Strategy Confidence
                              </Typography>
                              <Typography variant="body2" sx={{ ...MONO, fontWeight: 800 }}>
                                {Math.round(rec.confidence * 100)}%
                              </Typography>
                            </Stack>
                            <LinearProgress
                              variant="determinate"
                              value={Math.round(rec.confidence * 100)}
                              color={barColor(rec.action)}
                              sx={{ height: 6, borderRadius: 3, bgcolor: "rgba(255, 255, 255, 0.05)" }}
                            />
                          </Box>

                          {/* Stop Loss, Take profit, Suggested Lot Grid */}
                          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" } }}>
                            {[
                              { k: "Strategy Bias", v: <Chip size="small" label={rec.indicators?.rule_bias} color={actionColor(rec.indicators?.rule_bias)} variant="outlined" sx={{ fontWeight: 700 }} /> },
                              { k: "Stop Loss", v: rec.stop_loss ? <span style={MONO}>{fmt(rec.stop_loss, 5)}</span> : "None" },
                              { k: "Take Profit", v: rec.take_profit ? <span style={MONO}>{fmt(rec.take_profit, 5)}</span> : "None" },
                              { k: "Suggested Lot", v: rec.suggested_lot ? <span style={MONO}>{fmt(rec.suggested_lot)}</span> : "None" },
                            ].map((c, idx) => (
                              <Box
                                key={idx}
                                sx={{
                                  p: 2,
                                  borderRadius: 2,
                                  bgcolor: "rgba(255, 255, 255, 0.015)",
                                  border: "1px solid rgba(255, 255, 255, 0.04)",
                                }}
                              >
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, textTransform: "uppercase", fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>
                                  {c.k}
                                </Typography>
                                <Typography variant="body2" component="div" sx={{ fontWeight: 700 }}>
                                  {c.v}
                                </Typography>
                              </Box>
                            ))}
                          </Box>

                          <Stack direction="row" spacing={2.5} sx={{ color: "text.secondary", pl: 1 }}>
                            <Typography variant="caption" sx={MONO}>
                              RSI: {fmt(rec.indicators?.rsi, 1)}
                            </Typography>
                            <Typography variant="caption" sx={MONO}>
                              MACDh: {fmt(rec.indicators?.macd_hist, 4)}
                            </Typography>
                            <Typography variant="caption" sx={MONO}>
                              ATR: {fmt(rec.indicators?.atr, 5)}
                            </Typography>
                          </Stack>

                          {/* Staged trade actions */}
                          {pending && pending.status === "pending" && (
                            <Stack
                              direction="row"
                              spacing={2}
                              sx={{ mt: 1, pt: 3, borderTop: "1px solid", borderColor: "rgba(255,255,255,0.06)" }}
                            >
                              <Button
                                variant="contained"
                                color="success"
                                startIcon={<Check size={16} />}
                                onClick={confirm}
                                sx={{
                                  px: 4,
                                  py: 1.25,
                                  bgcolor: "success.main",
                                  color: "#07090e",
                                  fontWeight: 800,
                                  "&:hover": { bgcolor: "success.dark" }
                                }}
                              >
                                Confirm &amp; Execute · {pending.lot} lot
                              </Button>
                              <Button variant="outlined" color="inherit" startIcon={<X size={16} />} onClick={cancel} sx={{ px: 3, py: 1.25 }}>
                                Cancel
                              </Button>
                            </Stack>
                          )}
                          {pending && pending.status !== "pending" && (
                            <Box sx={{ mt: 1, p: 2, borderRadius: 2, bgcolor: "rgba(255, 255, 255, 0.02)", display: "inline-flex", alignItems: "center", gap: 1.5, border: "1px solid rgba(255,255,255,0.05)" }}>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                Order Status:
                              </Typography>
                              <Chip
                                size="small"
                                label={pending.status}
                                color={pending.status === "executed" ? "success" : "default"}
                                sx={{ fontWeight: 800, textTransform: "uppercase" }}
                              />
                            </Box>
                          )}
                          {!pending && rec.action === "HOLD" && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: "italic" }}>
                              No trade staged — price is currently flat.
                            </Typography>
                          )}
                        </Box>
                      </CardContent>
                    </Card>
                  )}

                  {/* Open Positions Card */}
                  <Card>
                    <CardContent>
                      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                        <SectionTitle icon={<Layers size={16} color="#3b82f6" />}>Open Positions</SectionTitle>
                        {positions.length > 0 && (
                          <Chip
                            size="small"
                            label={`Total P/L: ${pl >= 0 ? "+" : ""}${fmt(pl)} ${ccy}`}
                            color={pl >= 0 ? "success" : "error"}
                            sx={{ fontWeight: 800, px: 1 }}
                          />
                        )}
                      </Stack>
                      {positions.length === 0 ? (
                        <Typography align="center" color="text.secondary" sx={{ py: 4 }}>
                          No active positions open in MT5.
                        </Typography>
                      ) : (
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              {["Ticket", "Symbol", "Side", "Volume", "Open", "Current", "P/L", ""].map((h) => (
                                <TableCell key={h} sx={{ fontWeight: 700, color: "text.secondary", borderBottomWidth: 2 }}>{h}</TableCell>
                              ))}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {positions.map((p) => (
                              <TableRow
                                key={p.ticket}
                                hover
                                sx={{
                                  bgcolor: p.type === "BUY" ? "rgba(22, 199, 132, 0.015)" : "rgba(234, 57, 67, 0.015)",
                                  "&:hover": {
                                    bgcolor: p.type === "BUY" ? "rgba(22, 199, 132, 0.035) !important" : "rgba(234, 57, 67, 0.035) !important",
                                  }
                                }}
                              >
                                <TableCell sx={MONO}>{p.ticket}</TableCell>
                                <TableCell>
                                  <strong>{p.symbol}</strong>
                                </TableCell>
                                <TableCell>
                                  <Chip size="small" label={p.type} color={actionColor(p.type)} variant="outlined" sx={{ fontWeight: 700 }} />
                                </TableCell>
                                <TableCell sx={MONO}>{p.volume}</TableCell>
                                <TableCell sx={MONO}>{p.price_open}</TableCell>
                                <TableCell sx={MONO}>{p.price_current}</TableCell>
                                <TableCell sx={{ ...MONO, fontWeight: 700, color: p.profit >= 0 ? "success.main" : "error.main" }}>
                                  {p.profit >= 0 ? "+" : ""}
                                  {fmt(p.profit)}
                                </TableCell>
                                <TableCell align="right">
                                  <Button size="small" color="error" variant="outlined" onClick={() => closePos(p.ticket)} sx={{ borderRadius: 1.5 }}>
                                    Close
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </Stack>

                {/* Sidebar Right Column */}
                <Stack spacing={3}>
                  {rec ? (
                    <Card sx={{ height: "100%" }}>
                      <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                        <SectionTitle icon={<Bot size={16} color="#3b82f6" />}>AI Advice Verdict</SectionTitle>
                        <VerdictBanner rec={rec} />

                        {rec.opinions.length > 0 && (
                          <Stack spacing={2} sx={{ mt: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
                              AI Analyst Opinions ({rec.opinions.length})
                            </Typography>
                            {rec.opinions.map((o, idx) => (
                              <Box
                                key={idx}
                                sx={{
                                  p: 2,
                                  borderRadius: 2,
                                  bgcolor: "rgba(255, 255, 255, 0.01)",
                                  border: "1px solid rgba(255, 255, 255, 0.04)",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 1,
                                }}
                              >
                                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                                  <Typography variant="body2" sx={{ fontWeight: 800, textTransform: "capitalize", color: "primary.main" }}>
                                    {o.provider}
                                  </Typography>
                                  <Chip
                                    size="small"
                                    label={`${o.action} ${Math.round(o.confidence * 100)}%`}
                                    color={actionColor(o.action)}
                                    variant="outlined"
                                    sx={{ fontWeight: 700, height: 20, fontSize: "0.7rem" }}
                                  />
                                </Stack>
                                {o.error ? (
                                  <Typography variant="caption" color="error.main">
                                    ⚠️ {o.error}
                                  </Typography>
                                ) : (
                                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.85rem", lineHeight: 1.45 }}>
                                    {o.reasoning}
                                  </Typography>
                                )}
                              </Box>
                            ))}
                          </Stack>
                        )}
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardContent sx={{ py: 4, textAlign: "center" }}>
                        <Box sx={{ display: "inline-flex", p: 1.5, borderRadius: "50%", bgcolor: "rgba(59, 130, 246, 0.05)", color: "primary.main", mb: 2 }}>
                          <Bot size={28} />
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
                          AI Advisor Offline
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 2, lineHeight: 1.4 }}>
                          Select an asset and click 'Analyse' to trigger the AI technical advisor and view consolidated analyst opinions here.
                        </Typography>
                      </CardContent>
                    </Card>
                  )}
                </Stack>
              </Box>
            </Stack>
          ) : currentTab === "metals" ? (
            /* Gold & Metals Trading Tab Content */
            <Stack spacing={3}>
              {/* Account Quick Status Widget */}
              <Card>
                <CardContent sx={{ py: 2, px: 3, "&:last-child": { pb: 2 } }}>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={{ xs: 2.5, md: 4 }}
                    sx={{ justifyContent: "space-between", alignItems: "stretch" }}
                  >
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flex: 1 }}>
                      <Box sx={{ p: 1, borderRadius: 2.5, bgcolor: "rgba(99, 102, 241, 0.08)", display: "flex" }}>
                        <Award size={18} color="#6366f1" />
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                          Metal Assets Enabled
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                          {metalSymbols.length}{" "}
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Symbols</span>
                        </Typography>
                      </Box>
                    </Stack>

                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flex: 1 }}>
                      <Box sx={{ p: 1, borderRadius: 2.5, bgcolor: "rgba(22, 199, 132, 0.08)", display: "flex" }}>
                        <Wallet size={18} color="#16c784" />
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                          Account Balance
                        </Typography>
                        <Typography variant="h6" sx={{ ...MONO, fontWeight: 800, lineHeight: 1.2 }}>
                          {account ? `${fmt(account.balance)}` : "—"}{" "}
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{ccy}</span>
                        </Typography>
                      </Box>
                    </Stack>

                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flex: 1 }}>
                      <Box sx={{ p: 1, borderRadius: 2.5, bgcolor: pl >= 0 ? "rgba(22, 199, 132, 0.08)" : "rgba(234, 57, 67, 0.08)", display: "flex" }}>
                        <TrendingUp size={18} color={pl >= 0 ? "#16c784" : "#ea3943"} />
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                          Open Profit/Loss
                        </Typography>
                        <Typography variant="h6" sx={{ ...MONO, fontWeight: 800, lineHeight: 1.2, color: pl >= 0 ? "success.main" : "error.main" }}>
                          {pl >= 0 ? "+" : ""}{fmt(pl)}{" "}
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{ccy}</span>
                        </Typography>
                      </Box>
                    </Stack>

                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flex: 0.8 }}>
                      <Box sx={{ p: 1, width: 36, height: 36, borderRadius: 2.5, bgcolor: "rgba(255, 255, 255, 0.02)", display: "grid", placeItems: "center", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <Typography variant="body1" sx={{ ...MONO, fontWeight: 800 }}>
                          {positions.filter((p) => isMetalSymbol(p.symbol)).length}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                          Metal Trades
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 10, fontWeight: 500 }}>
                          Active positions
                        </Typography>
                      </Box>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>

              {/* Two Column Grid */}
              <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", lg: "1.6fr 1fr" }, alignItems: "start" }}>

                {/* Left Column: Chart & Open Positions */}
                <Stack spacing={3}>
                  <Card>
                    <CardContent sx={{ p: 2 }}>
                      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2, px: 1 }}>
                        <SectionTitle icon={<Activity size={16} color="#6366f1" />}>
                          {metalSymbol} Live Technical Chart
                        </SectionTitle>
                        <Chip
                          size="small"
                          label="Real-time Feed"
                          color="success"
                          variant="outlined"
                          sx={{ fontSize: 10, height: 20, px: 0.5, borderStyle: "dashed" }}
                        />
                      </Stack>
                      {metalSymbol ? (
                        <TradingViewWidget symbol={metalSymbol} />
                      ) : (
                        <Box sx={{ height: 450, display: "grid", placeItems: "center", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 2 }}>
                          <Typography color="text.secondary">No Metal Symbol Selected</Typography>
                        </Box>
                      )}
                    </CardContent>
                  </Card>

                  {/* Filtered Metal Positions */}
                  <Card>
                    <CardContent>
                      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                        <SectionTitle icon={<Layers size={16} color="#6366f1" />}>Metal Positions</SectionTitle>
                        {positions.filter((p) => isMetalSymbol(p.symbol)).length > 0 && (
                          <Chip
                            size="small"
                            label={`Metals P/L: ${positions.filter((p) => isMetalSymbol(p.symbol)).reduce((acc, curr) => acc + curr.profit, 0) >= 0 ? "+" : ""}${fmt(positions.filter((p) => isMetalSymbol(p.symbol)).reduce((acc, curr) => acc + curr.profit, 0))} ${ccy}`}
                            color={positions.filter((p) => isMetalSymbol(p.symbol)).reduce((acc, curr) => acc + curr.profit, 0) >= 0 ? "success" : "error"}
                            sx={{ fontWeight: 800, px: 1 }}
                          />
                        )}
                      </Stack>
                      {positions.filter((p) => isMetalSymbol(p.symbol)).length === 0 ? (
                        <Typography align="center" color="text.secondary" sx={{ py: 4 }}>
                          No active metal positions open in MT5.
                        </Typography>
                      ) : (
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              {["Ticket", "Symbol", "Side", "Volume", "Open", "Current", "P/L", ""].map((h) => (
                                <TableCell key={h} sx={{ fontWeight: 700, color: "text.secondary", borderBottomWidth: 2 }}>{h}</TableCell>
                              ))}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {positions.filter((p) => isMetalSymbol(p.symbol)).map((p) => (
                              <TableRow
                                key={p.ticket}
                                hover
                                sx={{
                                  bgcolor: p.type === "BUY" ? "rgba(22, 199, 132, 0.015)" : "rgba(234, 57, 67, 0.015)",
                                  "&:hover": {
                                    bgcolor: p.type === "BUY" ? "rgba(22, 199, 132, 0.035) !important" : "rgba(234, 57, 67, 0.035) !important",
                                  }
                                }}
                              >
                                <TableCell sx={MONO}>{p.ticket}</TableCell>
                                <TableCell>
                                  <strong>{p.symbol}</strong>
                                </TableCell>
                                <TableCell>
                                  <Chip size="small" label={p.type} color={actionColor(p.type)} variant="outlined" sx={{ fontWeight: 700 }} />
                                </TableCell>
                                <TableCell sx={MONO}>{p.volume}</TableCell>
                                <TableCell sx={MONO}>{p.price_open}</TableCell>
                                <TableCell sx={MONO}>{p.price_current}</TableCell>
                                <TableCell sx={{ ...MONO, fontWeight: 700, color: p.profit >= 0 ? "success.main" : "error.main" }}>
                                  {p.profit >= 0 ? "+" : ""}
                                  {fmt(p.profit)}
                                </TableCell>
                                <TableCell align="right">
                                  <Button size="small" color="error" variant="outlined" onClick={() => closePos(p.ticket)} sx={{ borderRadius: 1.5 }}>
                                    Close
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </Stack>

                {/* Right Column: Trade Ticket & Live Ticks */}
                <Stack spacing={3}>
                  <Card>
                    <CardContent sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <SectionTitle icon={<Zap size={16} color="#6366f1" />}>Metal Trade Ticket</SectionTitle>

                      {/* Symbol Selector */}
                      {metalSymbols.length === 0 ? (
                        <Box sx={{ p: 2, borderRadius: 2, bgcolor: "rgba(240, 160, 32, 0.05)", border: "1px solid rgba(240, 160, 32, 0.15)" }}>
                          <Typography variant="body2" color="warning.main" sx={{ fontWeight: 700, mb: 1 }}>
                            ⚠️ No Metal Symbols Registered
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.4 }}>
                            Please add metal symbols (e.g. <code>GOLD</code>, <code>SILVER</code>) in the <strong>Settings</strong> page.
                          </Typography>
                        </Box>
                      ) : (
                        <FormControl size="small" fullWidth>
                          <InputLabel>Select Metal Asset</InputLabel>
                          <Select
                            label="Select Metal Asset"
                            value={metalSymbol}
                            onChange={(e) => setMetalSymbol(e.target.value)}
                          >
                            {metalSymbols.map((s) => (
                              <MenuItem key={s} value={s}>
                                {s}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}

                      {/* Live Tickers Display */}
                      {metalTickError ? (
                        <Alert severity="error" sx={{ borderRadius: 2.5 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Symbol Not Found / Error</Typography>
                          <Typography variant="body2" sx={{ mt: 0.5 }}>{metalTickError}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                            Please verify if {metalSymbol} is supported by your broker, or adjust the symbol mapping/scan under Settings.
                          </Typography>
                        </Alert>
                      ) : metalSymbol && (
                        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                          {/* Sell / Bid Box */}
                          <Box
                            sx={{
                              p: 2,
                              borderRadius: 2.5,
                              bgcolor: "rgba(234, 57, 67, 0.04)",
                              border: "1px solid rgba(234, 57, 67, 0.1)",
                              textAlign: "center",
                            }}
                          >
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                              BID (SELL)
                            </Typography>
                            <Typography variant="h5" sx={{ ...MONO, fontWeight: 900, color: "error.main", mt: 0.5 }}>
                              {metalTick ? fmt(metalTick.bid, 2) : "—"}
                            </Typography>
                          </Box>

                          {/* Buy / Ask Box */}
                          <Box
                            sx={{
                              p: 2,
                              borderRadius: 2.5,
                              bgcolor: "rgba(22, 199, 132, 0.04)",
                              border: "1px solid rgba(22, 199, 132, 0.1)",
                              textAlign: "center",
                            }}
                          >
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                              ASK (BUY)
                            </Typography>
                            <Typography variant="h5" sx={{ ...MONO, fontWeight: 900, color: "success.main", mt: 0.5 }}>
                              {metalTick ? fmt(metalTick.ask, 2) : "—"}
                            </Typography>
                          </Box>
                        </Box>
                      )}

                      {/* Trade Input Form */}
                      <Stack spacing={2.5}>
                        {/* Lot Size */}
                        <Box>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1, fontWeight: 700 }}>
                            ORDER VOLUME (LOTS)
                          </Typography>
                          <Stack direction="row" spacing={1}>
                            <TextField
                              type="number"
                              size="small"
                              slotProps={{ htmlInput: { min: 0.01, step: 0.01 } }}
                              value={metalLot}
                              onChange={(e) => setMetalLot(Math.max(0.01, parseFloat(e.target.value) || 0))}
                              sx={{ flexGrow: 1 }}
                            />
                            {[0.01, 0.05, 0.1, 0.5, 1.0].map((v) => (
                              <Button
                                key={v}
                                size="small"
                                variant={metalLot === v ? "contained" : "outlined"}
                                onClick={() => setMetalLot(v)}
                                sx={{ minWidth: 44, p: 0, ...MONO }}
                              >
                                {v}
                              </Button>
                            ))}
                          </Stack>
                        </Box>

                        {/* SL / TP Grid */}
                        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                          <TextField
                            label="Stop Loss (SL)"
                            placeholder="Optional"
                            type="number"
                            size="small"
                            value={metalSl}
                            onChange={(e) => setMetalSl(e.target.value)}
                            slotProps={{ htmlInput: { step: "0.1" } }}
                            fullWidth
                          />
                          <TextField
                            label="Take Profit (TP)"
                            placeholder="Optional"
                            type="number"
                            size="small"
                            value={metalTp}
                            onChange={(e) => setMetalTp(e.target.value)}
                            slotProps={{ htmlInput: { step: "0.1" } }}
                            fullWidth
                          />
                        </Box>

                        {/* Order Buttons */}
                        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, pt: 1 }}>
                          <Button
                            variant="contained"
                            color="error"
                            disabled={tradingMetal || !metalSymbol}
                            onClick={() => placeMetalOrder("SELL")}
                            startIcon={<TrendingDown size={18} />}
                            sx={{
                              py: 1.5,
                              fontWeight: 800,
                              borderRadius: 2.5,
                              boxShadow: "0 4px 12px rgba(234, 57, 67, 0.2)",
                            }}
                          >
                            SELL
                          </Button>
                          <Button
                            variant="contained"
                            color="success"
                            disabled={tradingMetal || !metalSymbol}
                            onClick={() => placeMetalOrder("BUY")}
                            startIcon={<TrendingUp size={18} />}
                            sx={{
                              py: 1.5,
                              fontWeight: 800,
                              color: "#07090e",
                              borderRadius: 2.5,
                              boxShadow: "0 4px 12px rgba(22, 199, 132, 0.2)",
                            }}
                          >
                            BUY
                          </Button>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>

                  {/* Specifications Card */}
                  {metalTick && (
                    <Card>
                      <CardContent>
                        <SectionTitle icon={<Shield size={16} color="#6366f1" />}>Market Specifications</SectionTitle>
                        <Stack spacing={1.5} sx={{ mt: 1 }}>
                          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                            <Typography variant="caption" color="text.secondary">Spread</Typography>
                            <Typography variant="body2" sx={{ ...MONO, fontWeight: 700 }}>
                              {fmt(Math.max(0, metalTick.ask - metalTick.bid), 2)}
                            </Typography>
                          </Stack>
                          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                            <Typography variant="caption" color="text.secondary">Last Tick Price</Typography>
                            <Typography variant="body2" sx={{ ...MONO, fontWeight: 700 }}>
                              {metalTick.last ? fmt(metalTick.last, 2) : fmt(metalTick.bid, 2)}
                            </Typography>
                          </Stack>
                          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                            <Typography variant="caption" color="text.secondary">Last Update</Typography>
                            <Typography variant="caption" sx={MONO}>
                              {new Date(metalTick.time * 1000).toLocaleTimeString()}
                            </Typography>
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  )}
                </Stack>

              </Box>
            </Stack>
          ) : currentTab === "stocks" ? (
            /* Stock Trading Tab Content */
            <Stack spacing={3}>
              {/* Account Quick Status Widget */}
              <Card>
                <CardContent sx={{ py: 2, px: 3, "&:last-child": { pb: 2 } }}>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={{ xs: 2.5, md: 4 }}
                    sx={{ justifyContent: "space-between", alignItems: "stretch" }}
                  >
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flex: 1 }}>
                      <Box sx={{ p: 1, borderRadius: 2.5, bgcolor: "rgba(99, 102, 241, 0.08)", display: "flex" }}>
                        <Globe size={18} color="#6366f1" />
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                          Stock Assets Enabled
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                          {stockSymbols.length}{" "}
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Symbols</span>
                        </Typography>
                      </Box>
                    </Stack>

                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flex: 1 }}>
                      <Box sx={{ p: 1, borderRadius: 2.5, bgcolor: "rgba(22, 199, 132, 0.08)", display: "flex" }}>
                        <Wallet size={18} color="#16c784" />
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                          Account Balance
                        </Typography>
                        <Typography variant="h6" sx={{ ...MONO, fontWeight: 800, lineHeight: 1.2 }}>
                          {account ? `${fmt(account.balance)}` : "—"}{" "}
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{ccy}</span>
                        </Typography>
                      </Box>
                    </Stack>

                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flex: 1 }}>
                      <Box sx={{ p: 1, borderRadius: 2.5, bgcolor: pl >= 0 ? "rgba(22, 199, 132, 0.08)" : "rgba(234, 57, 67, 0.08)", display: "flex" }}>
                        <TrendingUp size={18} color={pl >= 0 ? "#16c784" : "#ea3943"} />
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                          Open Profit/Loss
                        </Typography>
                        <Typography variant="h6" sx={{ ...MONO, fontWeight: 800, lineHeight: 1.2, color: pl >= 0 ? "success.main" : "error.main" }}>
                          {pl >= 0 ? "+" : ""}{fmt(pl)}{" "}
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{ccy}</span>
                        </Typography>
                      </Box>
                    </Stack>

                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flex: 0.8 }}>
                      <Box sx={{ p: 1, width: 36, height: 36, borderRadius: 2.5, bgcolor: "rgba(255, 255, 255, 0.02)", display: "grid", placeItems: "center", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <Typography variant="body1" sx={{ ...MONO, fontWeight: 800 }}>
                          {positions.filter((p) => isStockSymbol(p.symbol)).length}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                          Stock Trades
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 10, fontWeight: 500 }}>
                          Active positions
                        </Typography>
                      </Box>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>

              {/* Two Column Grid */}
              <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", lg: "1.6fr 1fr" }, alignItems: "start" }}>

                {/* Left Column: Chart & Open Positions */}
                <Stack spacing={3}>
                  <Card>
                    <CardContent sx={{ p: 2 }}>
                      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2, px: 1 }}>
                        <SectionTitle icon={<Activity size={16} color="#6366f1" />}>
                          {stockSymbol} Live Technical Chart
                        </SectionTitle>
                        <Chip
                          size="small"
                          label="Real-time Feed"
                          color="success"
                          variant="outlined"
                          sx={{ fontSize: 10, height: 20, px: 0.5, borderStyle: "dashed" }}
                        />
                      </Stack>
                      {stockSymbol ? (
                        <TradingViewWidget symbol={stockSymbol} />
                      ) : (
                        <Box sx={{ height: 450, display: "grid", placeItems: "center", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 2 }}>
                          <Typography color="text.secondary">No Stock Symbol Selected</Typography>
                        </Box>
                      )}
                    </CardContent>
                  </Card>

                  {/* Filtered Stock Positions */}
                  <Card>
                    <CardContent>
                      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                        <SectionTitle icon={<Layers size={16} color="#6366f1" />}>Stock Positions</SectionTitle>
                        {positions.filter((p) => isStockSymbol(p.symbol)).length > 0 && (
                          <Chip
                            size="small"
                            label={`Stocks P/L: ${positions.filter((p) => isStockSymbol(p.symbol)).reduce((acc, curr) => acc + curr.profit, 0) >= 0 ? "+" : ""}${fmt(positions.filter((p) => isStockSymbol(p.symbol)).reduce((acc, curr) => acc + curr.profit, 0))} ${ccy}`}
                            color={positions.filter((p) => isStockSymbol(p.symbol)).reduce((acc, curr) => acc + curr.profit, 0) >= 0 ? "success" : "error"}
                            sx={{ fontWeight: 800, px: 1 }}
                          />
                        )}
                      </Stack>
                      {positions.filter((p) => isStockSymbol(p.symbol)).length === 0 ? (
                        <Typography align="center" color="text.secondary" sx={{ py: 4 }}>
                          No active stock positions open in MT5.
                        </Typography>
                      ) : (
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              {["Ticket", "Symbol", "Side", "Volume", "Open", "Current", "P/L", ""].map((h) => (
                                <TableCell key={h} sx={{ fontWeight: 700, color: "text.secondary", borderBottomWidth: 2 }}>{h}</TableCell>
                              ))}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {positions.filter((p) => isStockSymbol(p.symbol)).map((p) => (
                              <TableRow
                                key={p.ticket}
                                hover
                                sx={{
                                  bgcolor: p.type === "BUY" ? "rgba(22, 199, 132, 0.015)" : "rgba(234, 57, 67, 0.015)",
                                  "&:hover": {
                                    bgcolor: p.type === "BUY" ? "rgba(22, 199, 132, 0.035) !important" : "rgba(234, 57, 67, 0.035) !important",
                                  }
                                }}
                              >
                                <TableCell sx={MONO}>{p.ticket}</TableCell>
                                <TableCell>
                                  <strong>{p.symbol}</strong>
                                </TableCell>
                                <TableCell>
                                  <Chip size="small" label={p.type} color={actionColor(p.type)} variant="outlined" sx={{ fontWeight: 700 }} />
                                </TableCell>
                                <TableCell sx={MONO}>{p.volume}</TableCell>
                                <TableCell sx={MONO}>{p.price_open}</TableCell>
                                <TableCell sx={MONO}>{p.price_current}</TableCell>
                                <TableCell sx={{ ...MONO, fontWeight: 700, color: p.profit >= 0 ? "success.main" : "error.main" }}>
                                  {p.profit >= 0 ? "+" : ""}
                                  {fmt(p.profit)}
                                </TableCell>
                                <TableCell align="right">
                                  <Button size="small" color="error" variant="outlined" onClick={() => closePos(p.ticket)} sx={{ borderRadius: 1.5 }}>
                                    Close
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </Stack>

                {/* Right Column: Trade Ticket & Live Ticks */}
                <Stack spacing={3}>
                  <Card>
                    <CardContent sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <SectionTitle icon={<Zap size={16} color="#6366f1" />}>Stock Trade Ticket</SectionTitle>

                      {/* Symbol Selector */}
                      {stockSymbols.length === 0 ? (
                        <Box sx={{ p: 2, borderRadius: 2, bgcolor: "rgba(240, 160, 32, 0.05)", border: "1px solid rgba(240, 160, 32, 0.15)" }}>
                          <Typography variant="body2" color="warning.main" sx={{ fontWeight: 700, mb: 1 }}>
                            ⚠️ No Stock Symbols Registered
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.4 }}>
                            Please add stock symbols (e.g. <code>AAPL</code>, <code>MSFT</code>) in the <strong>Settings</strong> page.
                          </Typography>
                        </Box>
                      ) : (
                        <FormControl size="small" fullWidth>
                          <InputLabel>Select Stock Asset</InputLabel>
                          <Select
                            label="Select Stock Asset"
                            value={stockSymbol}
                            onChange={(e) => setStockSymbol(e.target.value)}
                          >
                            {stockSymbols.map((s) => (
                              <MenuItem key={s} value={s}>
                                {s}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}

                      {/* Live Tickers Display */}
                      {stockTickError ? (
                        <Alert severity="error" sx={{ borderRadius: 2.5 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Symbol Not Found / Error</Typography>
                          <Typography variant="body2" sx={{ mt: 0.5 }}>{stockTickError}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                            Please verify if {stockSymbol} is supported by your broker, or adjust the symbol mapping/scan under Settings.
                          </Typography>
                        </Alert>
                      ) : stockSymbol && (
                        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                          {/* Sell / Bid Box */}
                          <Box
                            sx={{
                              p: 2,
                              borderRadius: 2.5,
                              bgcolor: "rgba(234, 57, 67, 0.04)",
                              border: "1px solid rgba(234, 57, 67, 0.1)",
                              textAlign: "center",
                            }}
                          >
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                              BID (SELL)
                            </Typography>
                            <Typography variant="h5" sx={{ ...MONO, fontWeight: 900, color: "error.main", mt: 0.5 }}>
                              {stockTick ? fmt(stockTick.bid, 2) : "—"}
                            </Typography>
                          </Box>

                          {/* Buy / Ask Box */}
                          <Box
                            sx={{
                              p: 2,
                              borderRadius: 2.5,
                              bgcolor: "rgba(22, 199, 132, 0.04)",
                              border: "1px solid rgba(22, 199, 132, 0.1)",
                              textAlign: "center",
                            }}
                          >
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                              ASK (BUY)
                            </Typography>
                            <Typography variant="h5" sx={{ ...MONO, fontWeight: 900, color: "success.main", mt: 0.5 }}>
                              {stockTick ? fmt(stockTick.ask, 2) : "—"}
                            </Typography>
                          </Box>
                        </Box>
                      )}

                      {/* Trade Input Form */}
                      <Stack spacing={2.5}>
                        {/* Lot Size */}
                        <Box>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1, fontWeight: 700 }}>
                            ORDER SHARES (VOLUME)
                          </Typography>
                          <Stack direction="row" spacing={1}>
                            <TextField
                              type="number"
                              size="small"
                              slotProps={{ htmlInput: { min: 1, step: 1 } }}
                              value={stockLot}
                              onChange={(e) => setStockLot(Math.max(1, parseFloat(e.target.value) || 0))}
                              sx={{ flexGrow: 1 }}
                            />
                            {[1, 5, 10, 50, 100].map((v) => (
                              <Button
                                key={v}
                                size="small"
                                variant={stockLot === v ? "contained" : "outlined"}
                                onClick={() => setStockLot(v)}
                                sx={{ minWidth: 44, p: 0, ...MONO }}
                              >
                                {v}
                              </Button>
                            ))}
                          </Stack>
                        </Box>

                        {/* SL / TP Grid */}
                        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                          <TextField
                            label="Stop Loss (SL)"
                            placeholder="Optional"
                            type="number"
                            size="small"
                            value={stockSl}
                            onChange={(e) => setStockSl(e.target.value)}
                            slotProps={{ htmlInput: { step: "0.1" } }}
                            fullWidth
                          />
                          <TextField
                            label="Take Profit (TP)"
                            placeholder="Optional"
                            type="number"
                            size="small"
                            value={stockTp}
                            onChange={(e) => setStockTp(e.target.value)}
                            slotProps={{ htmlInput: { step: "0.1" } }}
                            fullWidth
                          />
                        </Box>

                        {/* Order Buttons */}
                        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, pt: 1 }}>
                          <Button
                            variant="contained"
                            color="error"
                            disabled={tradingStock || !stockSymbol}
                            onClick={() => placeStockOrder("SELL")}
                            startIcon={<TrendingDown size={18} />}
                            sx={{
                              py: 1.5,
                              fontWeight: 800,
                              borderRadius: 2.5,
                              boxShadow: "0 4px 12px rgba(234, 57, 67, 0.2)",
                            }}
                          >
                            SELL
                          </Button>
                          <Button
                            variant="contained"
                            color="success"
                            disabled={tradingStock || !stockSymbol}
                            onClick={() => placeStockOrder("BUY")}
                            startIcon={<TrendingUp size={18} />}
                            sx={{
                              py: 1.5,
                              fontWeight: 800,
                              color: "#07090e",
                              borderRadius: 2.5,
                              boxShadow: "0 4px 12px rgba(22, 199, 132, 0.2)",
                            }}
                          >
                            BUY
                          </Button>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>

                  {/* Specifications Card */}
                  {stockTick && (
                    <Card>
                      <CardContent>
                        <SectionTitle icon={<Shield size={16} color="#6366f1" />}>Market Specifications</SectionTitle>
                        <Stack spacing={1.5} sx={{ mt: 1 }}>
                          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                            <Typography variant="caption" color="text.secondary">Spread</Typography>
                            <Typography variant="body2" sx={{ ...MONO, fontWeight: 700 }}>
                              {fmt(Math.max(0, stockTick.ask - stockTick.bid), 2)}
                            </Typography>
                          </Stack>
                          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                            <Typography variant="caption" color="text.secondary">Last Price</Typography>
                            <Typography variant="body2" sx={{ ...MONO, fontWeight: 700 }}>
                              {stockTick.last ? fmt(stockTick.last, 2) : fmt(stockTick.bid, 2)}
                            </Typography>
                          </Stack>
                          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                            <Typography variant="caption" color="text.secondary">Last Update</Typography>
                            <Typography variant="caption" sx={MONO}>
                              {new Date(stockTick.time * 1000).toLocaleTimeString()}
                            </Typography>
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  )}
                </Stack>

              </Box>
            </Stack>
          ) : (
            /* Settings Tab Content */
            <Box sx={{ display: "flex", flexDirection: "column", gap: 3.5 }}>

              <Box component="form" onSubmit={saveSettings} sx={{ display: "flex", flexDirection: "column", gap: 3.5 }}>
                {/* MT5 & API Keys */}
                <Box sx={{ display: "grid", gap: 3.5, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                  {/* MT5 settings */}
                  <Card>
                    <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
                        <Sliders size={18} color="#3b82f6" />
                        <Typography variant="overline" color="text.secondary">
                          MetaTrader 5 (MT5) Connection
                        </Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Leave login/password empty to attach to a manually logged in, running MT5 terminal.
                      </Typography>
                      <TextField
                        label="MT5 Login ID"
                        variant="outlined"
                        size="small"
                        type="number"
                        value={settingsForm.mt5_login || ""}
                        onChange={(e) => setSettingsForm({ ...settingsForm, mt5_login: e.target.value ? parseInt(e.target.value) : "" })}
                        fullWidth
                      />
                      <TextField
                        label="MT5 Password"
                        variant="outlined"
                        size="small"
                        type="password"
                        value={settingsForm.mt5_password || ""}
                        onChange={(e) => setSettingsForm({ ...settingsForm, mt5_password: e.target.value })}
                        fullWidth
                      />
                      <TextField
                        label="MT5 Server"
                        variant="outlined"
                        size="small"
                        value={settingsForm.mt5_server || ""}
                        onChange={(e) => setSettingsForm({ ...settingsForm, mt5_server: e.target.value })}
                        fullWidth
                      />
                      <TextField
                        label="MT5 Path (Optional)"
                        variant="outlined"
                        size="small"
                        value={settingsForm.mt5_path || ""}
                        onChange={(e) => setSettingsForm({ ...settingsForm, mt5_path: e.target.value })}
                        placeholder="e.g. C:\Program Files\XM Global MT5\terminal64.exe"
                        fullWidth
                      />
                    </CardContent>
                  </Card>

                  {/* AI Advice keys */}
                  <Card>
                    <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
                        <Key size={18} color="#3b82f6" />
                        <Typography variant="overline" color="text.secondary">
                          AI Advice Engine API Keys
                        </Typography>
                      </Stack>
                      <TextField
                        label="Gemini API Key"
                        variant="outlined"
                        size="small"
                        type="password"
                        value={settingsForm.gemini_api_key || ""}
                        onChange={(e) => setSettingsForm({ ...settingsForm, gemini_api_key: e.target.value })}
                        fullWidth
                      />
                      <TextField
                        label="Gemini Model"
                        variant="outlined"
                        size="small"
                        value={settingsForm.gemini_model || ""}
                        onChange={(e) => setSettingsForm({ ...settingsForm, gemini_model: e.target.value })}
                        fullWidth
                      />
                      <TextField
                        label="DeepSeek API Key"
                        variant="outlined"
                        size="small"
                        type="password"
                        value={settingsForm.deepseek_api_key || ""}
                        onChange={(e) => setSettingsForm({ ...settingsForm, deepseek_api_key: e.target.value })}
                        fullWidth
                      />
                      <TextField
                        label="DeepSeek Model"
                        variant="outlined"
                        size="small"
                        value={settingsForm.deepseek_model || ""}
                        onChange={(e) => setSettingsForm({ ...settingsForm, deepseek_model: e.target.value })}
                        fullWidth
                      />
                    </CardContent>
                  </Card>
                </Box>

                {/* Trading Rules & Telegram/System */}
                <Box sx={{ display: "grid", gap: 3.5, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                  {/* Trading Parameters */}
                  <Card>
                    <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
                        <Globe size={18} color="#3b82f6" />
                        <Typography variant="overline" color="text.secondary">
                          Trading Rules &amp; Parameters
                        </Typography>
                      </Stack>
                      {/* Separated Symbols Layout */}
                      <Stack spacing={2.5}>
                        {/* Forex Symbols */}
                        <Box>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, fontWeight: 700 }}>
                            Forex Symbols
                          </Typography>
                          <TextField
                            variant="outlined"
                            size="small"
                            value={forexInput}
                            onChange={(e) => handleSymbolsChange("forex", e.target.value)}
                            placeholder="e.g. EURUSD, GBPUSD"
                            fullWidth
                          />
                        </Box>

                        {/* Metals Symbols */}
                        <Box>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, fontWeight: 700 }}>
                            Gold &amp; Metals Symbols
                          </Typography>
                          <Stack direction="row" spacing={1}>
                            <TextField
                              variant="outlined"
                              size="small"
                              value={metalsInput}
                              onChange={(e) => handleSymbolsChange("metals", e.target.value)}
                              placeholder="e.g. GOLD, XAUUSD"
                              sx={{ flexGrow: 1 }}
                            />
                            <Button
                              variant="outlined"
                              onClick={autoDetectMetals}
                              disabled={detectingMetals}
                              sx={{ minWidth: 120, height: 40 }}
                            >
                              {detectingMetals ? <CircularProgress size={16} /> : "Scan Metals"}
                            </Button>
                          </Stack>
                        </Box>

                        {/* Crypto Symbols */}
                        <Box>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, fontWeight: 700 }}>
                            Crypto Symbols
                          </Typography>
                          <Stack direction="row" spacing={1}>
                            <TextField
                              variant="outlined"
                              size="small"
                              value={cryptoInput}
                              onChange={(e) => handleSymbolsChange("crypto", e.target.value)}
                              placeholder="e.g. BTCUSD, ETHUSD"
                              sx={{ flexGrow: 1 }}
                            />
                            <Button
                              variant="outlined"
                              onClick={autoDetectSymbols}
                              disabled={detectingSymbols}
                              sx={{ minWidth: 120, height: 40 }}
                            >
                              {detectingSymbols ? <CircularProgress size={16} /> : "Scan Crypto"}
                            </Button>
                          </Stack>
                        </Box>

                        {/* Stock Symbols */}
                        <Box>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, fontWeight: 700 }}>
                            Stock Symbols
                          </Typography>
                          <Stack direction="row" spacing={1}>
                            <TextField
                              variant="outlined"
                              size="small"
                              value={stocksInput}
                              onChange={(e) => handleSymbolsChange("stocks", e.target.value)}
                              placeholder="e.g. AAPL, MSFT"
                              sx={{ flexGrow: 1 }}
                            />
                            <Button
                              variant="outlined"
                              onClick={autoDetectStocks}
                              disabled={detectingStocks}
                              sx={{ minWidth: 120, height: 40 }}
                            >
                              {detectingStocks ? <CircularProgress size={16} /> : "Scan Stocks"}
                            </Button>
                          </Stack>
                        </Box>
                      </Stack>

                      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
                        <FormControl size="small" fullWidth>
                          <InputLabel>Default Timeframe</InputLabel>
                          <Select
                            label="Default Timeframe"
                            value={settingsForm.default_timeframe || "M15"}
                            onChange={(e) => setSettingsForm({ ...settingsForm, default_timeframe: e.target.value })}
                          >
                            {["M1", "M5", "M15", "M30", "H1", "H4", "D1"].map((t) => (
                              <MenuItem key={t} value={t}>
                                {t}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        <FormControl size="small" fullWidth>
                          <InputLabel>Default Strategy</InputLabel>
                          <Select
                            label="Default Strategy"
                            value={selectedSettingsStrategyValue}
                            onChange={(e) => setSettingsForm({ ...settingsForm, strategy: e.target.value })}
                          >
                            <MenuItem value="" disabled>
                              Loading strategies...
                            </MenuItem>
                            {strategies.map((s) => (
                              <MenuItem key={s.name} value={s.name}>
                                {s.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Box>

                      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
                        <TextField
                          label="Risk per Trade (e.g. 0.01)"
                          variant="outlined"
                          size="small"
                          type="number"
                          slotProps={{ htmlInput: { step: "0.001" } }}
                          value={settingsForm.risk_per_trade ?? ""}
                          onChange={(e) => setSettingsForm({ ...settingsForm, risk_per_trade: parseFloat(e.target.value) })}
                          fullWidth
                        />
                        <TextField
                          label="Max Lot Size"
                          variant="outlined"
                          size="small"
                          type="number"
                          slotProps={{ htmlInput: { step: "0.01" } }}
                          value={settingsForm.max_lot ?? ""}
                          onChange={(e) => setSettingsForm({ ...settingsForm, max_lot: parseFloat(e.target.value) })}
                          fullWidth
                        />
                      </Box>

                      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
                        <TextField
                          label="ATR SL Multiplier"
                          variant="outlined"
                          size="small"
                          type="number"
                          slotProps={{ htmlInput: { step: "0.1" } }}
                          value={settingsForm.atr_sl_mult ?? ""}
                          onChange={(e) => setSettingsForm({ ...settingsForm, atr_sl_mult: parseFloat(e.target.value) })}
                          fullWidth
                        />
                        <TextField
                          label="Default R:R Ratio"
                          variant="outlined"
                          size="small"
                          type="number"
                          slotProps={{ htmlInput: { step: "0.1" } }}
                          value={settingsForm.default_rr ?? ""}
                          onChange={(e) => setSettingsForm({ ...settingsForm, default_rr: parseFloat(e.target.value) })}
                          fullWidth
                        />
                      </Box>

                      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
                        <FormControl size="small" fullWidth>
                          <InputLabel>Position Sizing Mode</InputLabel>
                          <Select
                            label="Position Sizing Mode"
                            value={settingsForm.position_sizing_mode || "risk_pct"}
                            onChange={(e) => setSettingsForm({ ...settingsForm, position_sizing_mode: e.target.value })}
                          >
                            <MenuItem value="risk_pct">Risk % (Base on SL distance)</MenuItem>
                            <MenuItem value="equal_slots">Equal Slots (Freqtrade-style)</MenuItem>
                          </Select>
                        </FormControl>

                        <TextField
                          label="Max Open Trades (Slots / ไม้)"
                          variant="outlined"
                          size="small"
                          type="number"
                          value={settingsForm.max_open_trades ?? 5}
                          onChange={(e) => setSettingsForm({ ...settingsForm, max_open_trades: parseInt(e.target.value) || 5 })}
                          fullWidth
                        />
                      </Box>

                      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
                        <TextField
                          label="Magic Number"
                          variant="outlined"
                          size="small"
                          type="number"
                          value={settingsForm.magic ?? ""}
                          onChange={(e) => setSettingsForm({ ...settingsForm, magic: parseInt(e.target.value) })}
                          fullWidth
                        />
                        <Box sx={{ display: "flex", alignItems: "center", pl: 1 }}>
                          <Switch
                            checked={settingsForm.require_confirm ?? true}
                            onChange={(e) => setSettingsForm({ ...settingsForm, require_confirm: e.target.checked })}
                          />
                          <Typography variant="body2" color="text.secondary">
                            Require manual confirmation
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>

                  {/* Telegram Notifications & System Config */}
                  <Stack spacing={3.5}>
                    {/* Telegram Card */}
                    <Card>
                      <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
                          <Bot size={18} color="#3b82f6" />
                          <Typography variant="overline" color="text.secondary">
                            Telegram Notifications
                          </Typography>
                        </Stack>
                        <TextField
                          label="Telegram Bot Token"
                          variant="outlined"
                          size="small"
                          type="password"
                          value={settingsForm.telegram_bot_token || ""}
                          onChange={(e) => setSettingsForm({ ...settingsForm, telegram_bot_token: e.target.value })}
                          fullWidth
                        />
                        <TextField
                          label="Telegram Chat ID"
                          variant="outlined"
                          size="small"
                          value={settingsForm.telegram_chat_id || ""}
                          onChange={(e) => setSettingsForm({ ...settingsForm, telegram_chat_id: e.target.value })}
                          fullWidth
                        />
                      </CardContent>
                    </Card>

                    {/* AI / System card */}
                    <Card>
                      <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
                          <Settings size={18} color="#3b82f6" />
                          <Typography variant="overline" color="text.secondary">
                            AI &amp; Security Configuration
                          </Typography>
                        </Stack>
                        <TextField
                          label="AI Providers (comma-separated)"
                          variant="outlined"
                          size="small"
                          value={settingsForm.ai_providers || ""}
                          onChange={(e) => setSettingsForm({ ...settingsForm, ai_providers: e.target.value })}
                          fullWidth
                        />
                        <Box sx={{ display: "flex", alignItems: "center", pl: 1 }}>
                          <Switch
                            checked={settingsForm.use_ai ?? true}
                            onChange={(e) => setSettingsForm({ ...settingsForm, use_ai: e.target.checked })}
                          />
                          <Typography variant="body2" color="text.secondary">
                            Enable AI filter confirmation (USE_AI)
                          </Typography>
                        </Box>
                        <TextField
                          label="API Shared Key (X-API-Key)"
                          variant="outlined"
                          size="small"
                          type="password"
                          value={settingsForm.api_key || ""}
                          onChange={(e) => setSettingsForm({ ...settingsForm, api_key: e.target.value })}
                          fullWidth
                        />
                      </CardContent>
                    </Card>
                  </Stack>
                </Box>

                {/* Save button bar */}
                <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button
                    variant="contained"
                    type="submit"
                    disabled={savingSettings}
                    startIcon={savingSettings ? <CircularProgress size={16} color="inherit" /> : <Save size={18} />}
                    size="large"
                    sx={{ px: 4, py: 1.5, borderRadius: 2 }}
                  >
                    Save Settings
                  </Button>
                </Box>
              </Box>
            </Box>
          )}
        </Container>
      </Box>
    </Box>
  );
}

function VerdictBanner({ rec }: { rec: Recommendation }) {
  let icon = <ShieldOff size={16} />;
  let text = "AI filter off — strategy only";
  let color = "text.secondary";
  let bg = "rgba(255,255,255,0.02)";
  let bc = "divider";

  if (rec.ai_used) {
    if (rec.ai_verdict === "confirmed") {
      icon = <ShieldCheck size={16} />;
      text = "AI confirmed the strategy signal";
      color = "success.main";
      bg = "rgba(22,199,132,0.06)";
      bc = "success.main";
    } else if (rec.ai_verdict === "filtered") {
      icon = <Shield size={16} />;
      text = "AI disagreed — downgraded to HOLD";
      color = "error.main";
      bg = "rgba(234,57,67,0.06)";
      bc = "error.main";
    } else if (rec.ai_verdict === "unavailable") {
      icon = <ShieldAlert size={16} />;
      text = "AI unavailable — following strategy";
      color = "warning.main";
      bg = "rgba(240,160,32,0.06)";
      bc = "warning.main";
    }
  }

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        p: 2,
        borderRadius: 2,
        color,
        bgcolor: bg,
        border: "1px solid",
        borderColor: bc,
      }}
    >
      {icon}
      <Typography variant="body2" sx={{ color, fontWeight: 600 }}>
        {text}
      </Typography>
    </Box>
  );
}
