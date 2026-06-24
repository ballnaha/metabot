"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useToastr } from "../components/Toastr";
import CryptoBotSettings from "./components/CryptoBotSettings";
import CryptoHeader from "./components/CryptoHeader";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  TextField,
  LinearProgress,
  Drawer,
  IconButton,
  Divider,
  Tooltip,
  Switch,
  FormControlLabel,
} from "@mui/material";
import {
  Activity,
  Layers,
  Coins,
  TrendingUp,
  Wallet,
  History,
  Sliders,
  Radar,
  X,
  RefreshCw,
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
  magic: number;
};

type HistoryDeal = {
  ticket: number;
  order: number;
  time: string;
  symbol: string;
  type: string;
  entry: string;
  volume: number;
  price: number;
  commission: number;
  swap: number;
  profit: number;
  magic: number;
  comment: string;
};

type StrategyInfo = {
  name: string;
  description: string;
};

type ScanResult = {
  symbol: string;
  action: string;
  confidence: number;
  price: number;
  summary: string;
};

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`/api/${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || res.statusText);
  return data;
}

const fmt = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined ? "—" : Number(n).toFixed(d);

const MONO = { fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums" };

const KPI_LABEL_SX = {
  display: "block",
  fontSize: "1rem",
  fontWeight: 500,
  letterSpacing: 0,
  lineHeight: 1.45,
};

const KPI_VALUE_SX = {
  fontSize: "1.8rem",
  fontWeight: 650,
  lineHeight: 1.2,
};

const KPI_UNIT_STYLE = { fontSize: 15, fontWeight: 500, color: "#64748b" };

const actionColor = (a?: string): "success" | "error" | "default" =>
  a === "BUY" ? "success" : a === "SELL" ? "error" : "default";

const actionLabel = (a?: string) =>
  a === "BUY" ? "ซื้อ" : a === "SELL" ? "ขาย" : a || "รอ";

const entryLabel = (entry?: string) =>
  entry === "IN" ? "เข้า" : entry === "OUT" ? "ออก" : entry || "—";

const strategyLabel = (name: string) =>
  ({
    ema_macd_rsi: "พื้นฐาน: แนวโน้ม + แรงส่ง + RSI",
    trend: "ตามเทรนด์",
    mean_reversion: "รอเด้งกลับ",
    breakout: "ทะลุกรอบ",
  }[name] ?? name);

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
      {icon}
      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0 }}>
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

    const tvSymbol = tradingViewCryptoSymbol(symbol);

    script.innerHTML = JSON.stringify({
      width: "100%",
      height: 540,
      symbol: tvSymbol,
      interval: "15",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "th_TH",
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
      sx={{ height: 540, width: "100%", overflow: "hidden", border: "1px solid rgba(255, 255, 255, 0.05)" }}
    />
  );
}


export default function CryptoPage() {
  const toastr = useToastr();
  
  const [account, setAccount] = useState<Account | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [cryptoSymbol, setCryptoSymbol] = useState("");
  const [cryptoTick, setCryptoTick] = useState<{ bid: number; ask: number; last: number; time: number } | null>(null);
  const [cryptoTickLoading, setCryptoTickLoading] = useState(false);
  const [cryptoTickError, setCryptoTickError] = useState<string | null>(null);
  const [closingTicket, setClosingTicket] = useState<number | null>(null);
  const [closeCandidate, setCloseCandidate] = useState<Position | null>(null);
  const [settingsData, setSettingsData] = useState<any>(null);
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Coin screener drawer
  const [scanOpen, setScanOpen] = useState(false);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanShowAll, setScanShowAll] = useState(false);
  const [scanAt, setScanAt] = useState<Date | null>(null);

  // Manual "analyze & trade" flow (stage via /api/analyze, confirm via /api/confirm)
  const [tradeStagingSymbol, setTradeStagingSymbol] = useState<string | null>(null);
  const [tradeCandidate, setTradeCandidate] = useState<{ rec: any; pending: any } | null>(null);
  const [tradeConfirming, setTradeConfirming] = useState(false);

  // Advanced Crypto-specific settings form
  const [settingsForm, setSettingsForm] = useState<any>({
    position_sizing_mode: "risk_pct",
    max_open_trades: 5,
    stake_amount: 0.0,
    atr_sl_mult: 1.5,
    default_rr: 2.0,
    require_confirm: true,
    use_ai: false,
    auto_trade_interval: 60,
    strategy: "ema_macd_rsi",
    magic: 556677
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Realized Transaction History
  const [tradeHistory, setTradeHistory] = useState<HistoryDeal[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const connectedRef = useRef<boolean | null>(null);
  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  const fetchHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const data = await api("history?days=30");
      setTradeHistory(data.history ?? []);
    } catch (e: any) {
      console.warn("โหลดประวัติรายการเทรดไม่สำเร็จ:", e.message);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [a, p] = await Promise.all([api("account"), api("positions")]);
      setAccount(a);
      if (connectedRef.current === false) {
        toastr.success("เชื่อมต่อ MT5 สำเร็จ");
      }
      setConnected(true);
      setPositions(p.positions ?? []);
    } catch (e: any) {
      if (connectedRef.current !== false) {
        toastr.error(`การเชื่อมต่อ MT5 หลุด: ${e.message}`);
      }
      setConnected(false);
    }
  }, [toastr]);

  useEffect(() => {
    api("symbols")
      .then((s) => {
        setSymbols(s.symbols ?? []);
        const cryptos = (s.symbols ?? []).filter(isCryptoSymbol);
        setCryptoSymbol(cryptos[0] || "BTCUSD");
      })
      .catch((e) => {
        toastr.error(`โหลดรายการสินทรัพย์ไม่สำเร็จ: ${e.message}`);
      });

    api("settings")
      .then((data) => {
        setSettingsData(data);
        setSettingsForm({
          position_sizing_mode: data.position_sizing_mode || "risk_pct",
          max_open_trades: data.max_open_trades ?? 5,
          stake_amount: data.stake_amount ?? 0.0,
          atr_sl_mult: data.atr_sl_mult ?? 1.5,
          default_rr: data.default_rr ?? 2.0,
          require_confirm: data.require_confirm ?? true,
          use_ai: data.use_ai ?? false,
          auto_trade_interval: data.auto_trade_interval ?? 60,
          strategy: data.strategy || "ema_macd_rsi",
          magic: data.magic ?? 556677
        });
      })
      .catch(() => {});

    api("strategies")
      .then((data) => {
        const nextStrategies = data.strategies ?? [];
        setStrategies(nextStrategies);
        setSettingsForm((prev: any) => ({
          ...prev,
          strategy: nextStrategies.some((s: StrategyInfo) => s.name === prev.strategy)
            ? prev.strategy
            : data.default || prev.strategy || "ema_macd_rsi",
          use_ai: prev.use_ai ?? data.use_ai_default ?? false,
        }));
      })
      .catch((e) => {
        toastr.error(`โหลดกลยุทธ์ไม่สำเร็จ: ${e.message}`);
      });

    refresh();
    fetchHistory();
    const id = setInterval(() => {
      refresh();
      fetchHistory();
    }, 10000);
    return () => clearInterval(id);
  }, [refresh, fetchHistory, toastr]);

  // Poll crypto tick price when symbol changes
  useEffect(() => {
    if (!cryptoSymbol) {
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
          console.warn("โหลดราคาล่าสุดของเหรียญไม่สำเร็จ:", e.message);
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
  }, [cryptoSymbol]);

  const isCryptoSymbol = (sym: string) => {
    const s = sym.toUpperCase();
    return /BTC|ETH|SOL|XRP|LTC|DOGE|ADA|DOT|LINK|AVAX|SHIB|UNI|LUNA|ALGO|BCH|XLM|ATOM|ICP|FIL|HBAR|XTZ|GRT|AAVE|MKR|THETA|FTM|BNB|DYDX|OP|ARB|NEAR|TIA|SUI|SEI|APT|RNDR|INJ|FET|AGIX|OCEAN|JUP|WIF|BONK|FLOKI|PEPE/i.test(s)
      || ((s.endsWith("USD") || s.endsWith("USDT")) && s.length >= 6 && !/^(EUR|GBP|AUD|NZD|CAD|CHF|HKD|SGD|ZAR|MXN|NOK|SEK|DKK|TRY|CNH|RUB|XAU|XAG|XPD|XPT)/.test(s));
  };

  const isMetalSymbol = (sym: string) => {
    return /GOLD|SILVER|XAU|XAG|PLATINUM|PALLADIUM/i.test(sym);
  };

  const isForexSymbol = (sym: string) => {
    return /^[A-Z]{6}$/i.test(sym) && !isCryptoSymbol(sym) && !isMetalSymbol(sym);
  };

  const cryptoSymbols = symbols.filter(isCryptoSymbol);
  // Filter active positions managed by this bot
  const cryptoPositions = positions.filter((p) => isCryptoSymbol(p.symbol) && p.magic === settingsForm.magic);
  const ccy = account?.currency ?? "";
  const openPl = cryptoPositions.reduce((acc, curr) => acc + curr.profit, 0);

  // Filter transaction history log for bot's crypto deals
  const cryptoHistory = tradeHistory.filter((d) => isCryptoSymbol(d.symbol) && d.magic === settingsForm.magic);
  // Realized profit calculation based on exits (entry="OUT")
  const realizedPl = cryptoHistory
    .filter((d) => d.entry === "OUT")
    .reduce((acc, curr) => acc + curr.profit, 0);

  // Coin screener: analyze every tradeable crypto symbol (read-only) and rank
  async function runScan() {
    if (cryptoSymbols.length === 0) {
      toastr.error("ยังไม่มีเหรียญให้สแกน");
      return;
    }
    setScanLoading(true);
    try {
      const data = await api("scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: cryptoSymbols, strategy: settingsForm.strategy }),
      });
      setScanResults(data.results ?? []);
      setScanAt(new Date());
    } catch (e: any) {
      toastr.error(`สแกนเหรียญไม่สำเร็จ: ${e.message}`);
    } finally {
      setScanLoading(false);
    }
  }

  function openScanDrawer() {
    setScanOpen(true);
    if (scanResults.length === 0 && !scanLoading) runScan();
  }

  // Analyze a symbol and stage a trade. Opens the confirm dialog when the trade
  // needs confirmation; toasts when there is no signal or it auto-executed.
  async function stageTrade(symbol: string) {
    setTradeStagingSymbol(symbol);
    try {
      const data = await api("analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, strategy: settingsForm.strategy, use_ai: settingsForm.use_ai }),
      });
      const rec = data.recommendation;
      const pending = data.pending;
      if (!pending) {
        toastr.warning(rec?.summary || `ยังไม่มีสัญญาณให้เทรด ${symbol} ตอนนี้`);
        return;
      }
      if (pending.status === "executed") {
        toastr.success(`เปิดเทรด ${symbol} อัตโนมัติแล้ว (โหมดไม่ต้องยืนยัน)`);
        refresh();
        fetchHistory();
        return;
      }
      setTradeCandidate({ rec, pending });
    } catch (e: any) {
      toastr.error(`วิเคราะห์/เปิดเทรดไม่สำเร็จ: ${e.message}`);
    } finally {
      setTradeStagingSymbol(null);
    }
  }

  async function confirmTrade() {
    if (!tradeCandidate) return;
    setTradeConfirming(true);
    try {
      await api("confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pending_id: tradeCandidate.pending.id }),
      });
      toastr.success(`เปิดเทรด ${tradeCandidate.rec.symbol} สำเร็จ`);
      setTradeCandidate(null);
      refresh();
      fetchHistory();
    } catch (e: any) {
      toastr.error(`ยืนยันเทรดไม่สำเร็จ: ${e.message}`);
    } finally {
      setTradeConfirming(false);
    }
  }

  // Cancel the staged-but-unconfirmed pending trade (so it doesn't linger).
  async function cancelTrade() {
    const pid = tradeCandidate?.pending?.id;
    setTradeCandidate(null);
    if (!pid) return;
    try {
      await api("cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pending_id: pid }),
      });
    } catch {
      /* best-effort cleanup */
    }
  }

  // Close specific position
  async function closePos(ticket: number) {
    setClosingTicket(ticket);
    try {
      await api(`positions/${ticket}/close`, { method: "POST" });
      refresh();
      fetchHistory();
      toastr.success(`ปิดออเดอร์ #${ticket} สำเร็จ`);
    } catch (e: any) {
      toastr.error(`ปิดออเดอร์ฉุกเฉินไม่สำเร็จ: ${e.message}`);
    } finally {
      setClosingTicket(null);
    }
  }

  async function confirmCloseCandidate() {
    if (!closeCandidate) return;
    const ticket = closeCandidate.ticket;
    setCloseCandidate(null);
    await closePos(ticket);
  }

  const handleCryptoSymbolChange = (nextSymbol: string) => {
    if (!nextSymbol || nextSymbol === cryptoSymbol) return;
    setCryptoSymbol(nextSymbol);
  };

  // Save Settings directly on the page
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await api("settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsForm),
      });
      toastr.success("บันทึกการตั้งค่าสำเร็จ");
      // Reload configurations
      const data = await api("settings");
      setSettingsData(data);
    } catch (e: any) {
      toastr.error(`บันทึกการตั้งค่าไม่สำเร็จ: ${e.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const activeStrategy = strategies.find((s) => s.name === settingsForm.strategy);
  const strategyDescription = activeStrategy?.description ?? "";
  const selectedStrategyValue = activeStrategy ? settingsForm.strategy : "";
  const cryptoSpread =
    cryptoTick && Number.isFinite(cryptoTick.ask - cryptoTick.bid)
      ? cryptoTick.ask - cryptoTick.bid
      : null;

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "#090d16", color: "#e2e8f0" }}>
      {/* Main Content Area */}
      <Box sx={{ flexGrow: 1, width: "100%", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <Container maxWidth={false} sx={{ width: "100%", maxWidth: "none", px: { xs: 2, md: 3 }, py: 3 }}>
          <CryptoHeader
            accountLogin={account?.login}
            connected={connected}
            currency={ccy}
            equity={account?.equity}
            onOpenBotSettings={() => setSettingsOpen(true)}
            onSync={() => {
              refresh();
              fetchHistory();
            }}
          />

          {/* Account Status Card Row */}
          <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr 1fr" }, mb: 4 }}>
            {/* KPI: Available Assets */}
            <Card sx={{ bgcolor: "#0d1321", border: "1px solid rgba(255, 255, 255, 0.03)" }}>
              <CardContent sx={{ display: "flex", alignItems: "center", gap: 2.25, py: 2.5 }}>
                <Box sx={{ p: 1.65, borderRadius: 2.5, bgcolor: "rgba(59, 130, 246, 0.08)", display: "flex", color: "#3b82f6" }}>
                  <Coins size={24} />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={KPI_LABEL_SX}>
                    เหรียญที่เทรดได้
                  </Typography>
                  <Typography variant="h5" sx={KPI_VALUE_SX}>
                    {cryptoSymbols.length}{" "}
                    <span style={KPI_UNIT_STYLE}>รายการ</span>
                  </Typography>
                </Box>
              </CardContent>
            </Card>

            {/* KPI: Account Equity */}
            <Card sx={{ bgcolor: "#0d1321", border: "1px solid rgba(255, 255, 255, 0.03)" }}>
              <CardContent sx={{ display: "flex", alignItems: "center", gap: 2.25, py: 2.5 }}>
                <Box sx={{ p: 1.65, borderRadius: 2.5, bgcolor: "rgba(16, 185, 129, 0.08)", display: "flex", color: "#10b981" }}>
                  <Wallet size={24} />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={KPI_LABEL_SX}>
                    ยอดเงินบัญชี
                  </Typography>
                  <Typography variant="h5" sx={{ ...MONO, ...KPI_VALUE_SX }}>
                    {account ? `${fmt(account.balance)}` : "—"}{" "}
                    <span style={KPI_UNIT_STYLE}>{ccy}</span>
                  </Typography>
                </Box>
              </CardContent>
            </Card>

            {/* KPI: Bot Realized P/L */}
            <Card sx={{ bgcolor: "#0d1321", border: "1px solid rgba(255, 255, 255, 0.03)" }}>
              <CardContent sx={{ display: "flex", alignItems: "center", gap: 2.25, py: 2.5 }}>
                <Box sx={{ p: 1.65, borderRadius: 2.5, bgcolor: realizedPl >= 0 ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)", display: "flex", color: realizedPl >= 0 ? "#10b981" : "#ef4444" }}>
                  <TrendingUp size={24} />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={KPI_LABEL_SX}>
                    กำไร/ขาดทุนจริง 30 วัน
                  </Typography>
                  <Typography variant="h5" sx={{ ...MONO, ...KPI_VALUE_SX, color: realizedPl >= 0 ? "#10b981" : "#ef4444" }}>
                    {realizedPl >= 0 ? "+" : ""}{fmt(realizedPl)}{" "}
                    <span style={KPI_UNIT_STYLE}>{ccy}</span>
                  </Typography>
                </Box>
              </CardContent>
            </Card>

            {/* KPI: Slots Utilization */}
            <Card sx={{ bgcolor: "#0d1321", border: "1px solid rgba(255, 255, 255, 0.03)" }}>
              <CardContent sx={{ width: "100%", display: "flex", flexDirection: "column", gap: 1.25, py: 2.5 }}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                  <Box sx={{ p: 1.45, borderRadius: 2, bgcolor: "rgba(139, 92, 246, 0.08)", display: "flex", color: "#8b5cf6" }}>
                    <Sliders size={22} />
                  </Box>
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={KPI_LABEL_SX}>
                      ช่องเทรดที่ใช้อยู่
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontSize: "1.2rem", fontWeight: 650, color: "#fff", lineHeight: 1.25 }}>
                      {cryptoPositions.length} / {settingsForm.max_open_trades} ช่อง
                    </Typography>
                  </Box>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, (cryptoPositions.length / Math.max(1, settingsForm.max_open_trades)) * 100)}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: "rgba(255,255,255,0.05)",
                    "& .MuiLinearProgress-bar": {
                      bgcolor: "#8b5cf6",
                    }
                  }}
                />
              </CardContent>
            </Card>
          </Box>

          {/* Main workspace: chart + live positions side-by-side on wide screens */}
          <Box
            sx={{
              display: "grid",
              gap: 4,
              gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.45fr) minmax(420px, 1fr)" },
              alignItems: "start",
            }}
          >
            {/* Left Column: Live Chart */}
            <Stack spacing={4}>
              {/* Technical Chart */}
              <Card sx={{ bgcolor: "#0d1321", border: "1px solid rgba(255, 255, 255, 0.03)" }}>
                <CardContent sx={{ p: 2 }}>
                  <Box
                    sx={{
                      mb: 2,
                      display: "grid",
                      gap: 1.5,
                      gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) auto" },
                      alignItems: "center",
                    }}
                  >
                    <Autocomplete
                      size="small"
                      fullWidth
                      options={cryptoSymbols}
                      value={cryptoSymbols.includes(cryptoSymbol) ? cryptoSymbol : null}
                      onChange={(_event, value) => {
                        if (value) handleCryptoSymbolChange(value);
                      }}
                      noOptionsText="ไม่พบเหรียญคริปโต"
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="ค้นหาเหรียญ"
                          placeholder="พิมพ์ BTC, ETH, SOL..."
                        />
                      )}
                      slotProps={{
                        paper: {
                          sx: {
                            bgcolor: "#0d1321",
                            border: "1px solid rgba(59,130,246,0.18)",
                            color: "#e2e8f0",
                          },
                        },
                        listbox: {
                          sx: {
                            py: 0.5,
                            "& .MuiAutocomplete-option": {
                              minHeight: 36,
                              fontWeight: 800,
                            },
                          },
                        },
                      }}
                      sx={{
                        "& .MuiInputBase-root": {
                          height: 42,
                          bgcolor: "rgba(9,13,22,0.85)",
                          fontWeight: 800,
                        },
                        "& .MuiOutlinedInput-notchedOutline": {
                          borderColor: "rgba(59,130,246,0.22)",
                        },
                        "& .MuiInputBase-input": {
                          fontWeight: 800,
                        },
                      }}
                    />

                    {cryptoSymbols.length === 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: { xs: "block", md: "none" } }}>
                        เพิ่มสัญลักษณ์คริปโตในหน้าตั้งค่าเพื่อเลือกกราฟ
                      </Typography>
                    )}

                    <Stack
                      direction="row"
                      sx={{
                        minWidth: { xs: "100%", md: 340 },
                        display: "grid",
                        gridTemplateColumns: "1fr auto 1fr",
                        gap: 0,
                        alignItems: "stretch",
                        borderRadius: 2,
                        overflow: "hidden",
                        bgcolor: "rgba(15, 23, 42, 0.45)",
                        border: "1px solid rgba(148, 163, 184, 0.12)",
                      }}
                    >
                      <Box
                        sx={{
                          px: 1.5,
                          py: 0.75,
                          bgcolor: "rgba(239, 68, 68, 0.035)",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                        }}
                      >
                        <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 500, lineHeight: 1.1, fontSize: 10.5 }}>
                          BID · ขาย
                        </Typography>
                        <Typography
                          sx={{
                            ...MONO,
                            color: "#f87171",
                            fontWeight: 600,
                            lineHeight: 1.1,
                            whiteSpace: "nowrap",
                            fontSize: { xs: "1.2rem", md: "1.3rem" },
                          }}
                        >
                          {cryptoTick ? fmt(cryptoTick.bid, 2) : "—"}
                        </Typography>
                      </Box>

                      <Box
                        sx={{
                          minWidth: 62,
                          px: 1,
                          textAlign: "center",
                          bgcolor: "rgba(2, 6, 23, 0.22)",
                          borderLeft: "1px solid rgba(148, 163, 184, 0.1)",
                          borderRight: "1px solid rgba(148, 163, 184, 0.1)",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <Box>
                          <Typography variant="caption" sx={{ display: "block", color: "#64748b", lineHeight: 1.1, fontSize: 10 }}>
                            spread
                          </Typography>
                          <Typography variant="caption" sx={{ ...MONO, display: "block", color: "#cbd5e1", lineHeight: 1.1, fontWeight: 500 }}>
                            {cryptoSpread === null ? "—" : fmt(cryptoSpread, 2)}
                          </Typography>
                        </Box>
                      </Box>

                      <Box
                        sx={{
                          px: 1.5,
                          py: 0.75,
                          textAlign: "right",
                          bgcolor: "rgba(16, 185, 129, 0.035)",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                        }}
                      >
                        <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 500, lineHeight: 1.1, fontSize: 10.5 }}>
                          ASK · ซื้อ
                        </Typography>
                        <Typography
                          sx={{
                            ...MONO,
                            color: "#34d399",
                            fontWeight: 600,
                            lineHeight: 1.1,
                            whiteSpace: "nowrap",
                            fontSize: { xs: "1.2rem", md: "1.3rem" },
                          }}
                        >
                          {cryptoTick ? fmt(cryptoTick.ask, 2) : "—"}
                        </Typography>
                      </Box>
                    </Stack>
                  </Box>

                  {cryptoTickError && (
                    <Alert severity="warning" sx={{ mb: 2, borderRadius: 2, bgcolor: "rgba(234,179,8,0.05)", color: "#eab308" }}>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>{cryptoTickError}</Typography>
                    </Alert>
                  )}

                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2, px: 1 }}>
                    <SectionTitle icon={<Activity size={16} color="#3b82f6" />}>
                      กราฟเทคนิค {cryptoSymbol}
                    </SectionTitle>
                    <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={openScanDrawer}
                        startIcon={<Radar size={15} />}
                        sx={{
                          height: 28,
                          borderRadius: 999,
                          px: 1.5,
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          borderColor: "rgba(59, 130, 246, 0.35)",
                          color: "#60a5fa",
                          bgcolor: "rgba(59, 130, 246, 0.06)",
                          "&:hover": { borderColor: "#3b82f6", bgcolor: "rgba(59, 130, 246, 0.12)" },
                        }}
                      >
                        คัดเหรียญน่าเทรด
                      </Button>
                      <Chip
                        size="small"
                        label="ไทม์เฟรม: 15M"
                        color="primary"
                        variant="outlined"
                        sx={{ fontSize: 10, height: 20, px: 0.5, borderColor: "rgba(59, 130, 246, 0.3)", color: "#3b82f6" }}
                      />
                    </Stack>
                  </Stack>
                  {cryptoSymbol ? (
                    <TradingViewWidget symbol={cryptoSymbol} />
                  ) : (
                    <Box sx={{ height: 450, display: "grid", placeItems: "center", border: "1px dashed rgba(255,255,255,0.05)", borderRadius: 2 }}>
                      <Typography color="text.secondary">ยังไม่ได้เลือกเหรียญ</Typography>
                    </Box>
                  )}

                  {cryptoSymbol && (
                    <Button
                      fullWidth
                      variant="contained"
                      disabled={tradeStagingSymbol === cryptoSymbol}
                      onClick={() => stageTrade(cryptoSymbol)}
                      startIcon={
                        tradeStagingSymbol === cryptoSymbol
                          ? <CircularProgress size={16} color="inherit" />
                          : <Zap size={16} />
                      }
                      sx={{
                        mt: 2,
                        height: 44,
                        borderRadius: 2,
                        fontWeight: 700,
                        fontSize: "0.95rem",
                        textTransform: "none",
                        bgcolor: "#2563eb",
                        "&:hover": { bgcolor: "#1d4ed8" },
                      }}
                    >
                      {tradeStagingSymbol === cryptoSymbol
                        ? `กำลังวิเคราะห์ ${cryptoSymbol}...`
                        : `วิเคราะห์ & เทรด ${cryptoSymbol}`}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </Stack>

            {/* Right Column: Active Positions sidebar */}
            <Stack spacing={4}>
              <Card sx={{ bgcolor: "#0d1321", border: "1px solid rgba(255, 255, 255, 0.03)", position: { lg: "sticky" }, top: { lg: 16 } }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2.5 }}>
                    <SectionTitle icon={<Layers size={16} color="#3b82f6" />}>ออเดอร์ที่บอทเปิดอยู่</SectionTitle>
                    {cryptoPositions.length > 0 && (
                      <Chip
                        size="small"
                        label={`${openPl >= 0 ? "+" : ""}${fmt(openPl)} ${ccy}`}
                        color={openPl >= 0 ? "success" : "error"}
                        sx={{ fontWeight: 800, px: 1 }}
                      />
                    )}
                  </Stack>
                  {cryptoPositions.length === 0 ? (
                    <Box sx={{ py: 5, textAlign: "center", bgcolor: "rgba(255,255,255,0.01)", borderRadius: 2.5, border: "1px dashed rgba(255,255,255,0.03)" }}>
                      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                        ตอนนี้ยังไม่มีออเดอร์ที่บอทเปิดอยู่ใน MT5
                      </Typography>
                    </Box>
                  ) : (
                    <Stack spacing={1.5}>
                      {cryptoPositions.map((p) => (
                        <Box
                          key={p.ticket}
                          sx={{
                            p: 1.75,
                            borderRadius: 2.5,
                            bgcolor: p.type === "BUY" ? "rgba(16, 185, 129, 0.04)" : "rgba(239, 68, 68, 0.04)",
                            border: `1px solid ${p.type === "BUY" ? "rgba(16, 185, 129, 0.18)" : "rgba(239, 68, 68, 0.18)"}`,
                          }}
                        >
                          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", mb: 1.25 }}>
                            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                              <Chip size="small" label={actionLabel(p.type)} color={actionColor(p.type)} variant="outlined" sx={{ fontWeight: 800, fontSize: 10, height: 20 }} />
                              <Box>
                                <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>{p.symbol}</Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ ...MONO, display: "block", lineHeight: 1.2 }}>
                                  #{p.ticket}
                                </Typography>
                              </Box>
                            </Stack>
                            <Box sx={{ textAlign: "right" }}>
                              <Typography sx={{ ...MONO, fontWeight: 800, lineHeight: 1.2, color: p.profit >= 0 ? "#10b981" : "#ef4444" }}>
                                {p.profit >= 0 ? "+" : ""}{fmt(p.profit)}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>{ccy}</Typography>
                            </Box>
                          </Stack>

                          <Box
                            sx={{
                              display: "grid",
                              gridTemplateColumns: "repeat(3, 1fr)",
                              gap: 1,
                              p: 1.25,
                              mb: 1.25,
                              borderRadius: 2,
                              bgcolor: "rgba(255,255,255,0.02)",
                            }}
                          >
                            {[
                              { label: "ขนาด", value: fmt(p.volume, 2) },
                              { label: "ทุน", value: fmt(p.price_open, 2) },
                              { label: "ปัจจุบัน", value: fmt(p.price_current, 2) },
                            ].map((cell) => (
                              <Box key={cell.label}>
                                <Typography variant="caption" sx={{ display: "block", color: "#64748b", lineHeight: 1.3 }}>{cell.label}</Typography>
                                <Typography variant="caption" sx={{ ...MONO, display: "block", color: "#cbd5e1", fontWeight: 600, lineHeight: 1.3 }}>{cell.value}</Typography>
                              </Box>
                            ))}
                          </Box>

                          <Button
                            size="small"
                            color="error"
                            variant="outlined"
                            fullWidth
                            disabled={closingTicket === p.ticket}
                            onClick={() => setCloseCandidate(p)}
                            startIcon={closingTicket === p.ticket ? <CircularProgress size={13} color="inherit" /> : undefined}
                            sx={{
                              height: 30,
                              borderRadius: 999,
                              fontSize: "0.82rem",
                              fontWeight: 600,
                              borderColor: "rgba(239, 68, 68, 0.35)",
                              color: "#f87171",
                              bgcolor: "rgba(239, 68, 68, 0.06)",
                              "&:hover": {
                                borderColor: "#ef4444",
                                bgcolor: "rgba(239, 68, 68, 0.12)",
                              },
                            }}
                          >
                            ปิด slot
                          </Button>
                        </Box>
                      ))}
                    </Stack>
                  )}
                </CardContent>
              </Card>
            </Stack>
          </Box>

          {/* Trade History Log — full width below */}
          <Box sx={{ mt: 4 }}>
              <Card sx={{ bgcolor: "#0d1321", border: "1px solid rgba(255, 255, 255, 0.03)" }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2.5 }}>
                    <SectionTitle icon={<History size={16} color="#3b82f6" />}>ประวัติรายการที่ปิดแล้ว 30 วัน</SectionTitle>
                    {historyLoading && <CircularProgress size={16} color="primary" />}
                  </Stack>
                  {cryptoHistory.length === 0 ? (
                    <Box sx={{ py: 4, textAlign: "center", bgcolor: "rgba(255,255,255,0.01)", borderRadius: 2.5 }}>
                      <Typography variant="body2" color="text.secondary">
                        ยังไม่มีรายการเทรดของ Magic Number นี้ในช่วง 30 วันที่ผ่านมา
                      </Typography>
                    </Box>
                  ) : (
                    <Box sx={{ overflowX: "auto", maxHeight: 350 }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow sx={{ "& th": { borderBottomColor: "rgba(255,255,255,0.05)", bgcolor: "#0d1321" } }}>
                            {["เวลา", "สัญลักษณ์", "ฝั่ง", "เข้า/ออก", "ขนาด", "ราคา", "กำไร/ขาดทุนจริง", "หมายเหตุ"].map((h) => (
                              <TableCell key={h} sx={{ fontWeight: 700, color: "#94a3b8" }}>{h}</TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {cryptoHistory.map((h) => (
                            <TableRow key={h.ticket} hover sx={{ borderBottomColor: "rgba(255,255,255,0.02)" }}>
                              <TableCell sx={{ ...MONO, fontSize: 11 }}>
                                {h.time.replace("T", " ").substring(5, 16)}
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>{h.symbol}</TableCell>
                              <TableCell>
                                <Chip size="small" label={actionLabel(h.type)} color={actionColor(h.type)} variant="outlined" sx={{ fontWeight: 700, fontSize: 9, height: 18 }} />
                              </TableCell>
                              <TableCell>
                                <Chip
                                  size="small"
                                  label={entryLabel(h.entry)}
                                  variant="outlined"
                                  sx={{
                                    fontWeight: 700,
                                    fontSize: 9,
                                    height: 18,
                                    color: h.entry === "IN" ? "#3b82f6" : "#eab308",
                                    borderColor: h.entry === "IN" ? "rgba(59,130,246,0.3)" : "rgba(234,179,8,0.3)",
                                  }}
                                />
                              </TableCell>
                              <TableCell sx={MONO}>{h.volume}</TableCell>
                              <TableCell sx={MONO}>{fmt(h.price, 2)}</TableCell>
                              <TableCell sx={{ ...MONO, fontWeight: 700, color: h.profit > 0 ? "#10b981" : h.profit < 0 ? "#ef4444" : "#94a3b8" }}>
                                {h.entry === "OUT" ? (
                                  <>
                                    {h.profit > 0 ? "+" : ""}
                                    {fmt(h.profit)}
                                  </>
                                ) : "—"}
                              </TableCell>
                              <TableCell sx={{ fontSize: 11, color: "text.secondary" }}>{h.comment}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Box>
                  )}
                </CardContent>
              </Card>
          </Box>
        </Container>
      </Box>

      {/* Coin screener drawer */}
      <Drawer
        anchor="right"
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        slotProps={{
          paper: {
            sx: {
              width: { xs: "100%", sm: 380 },
              bgcolor: "#0d1321",
              color: "#e2e8f0",
              borderLeft: "1px solid rgba(255,255,255,0.05)",
              backgroundImage: "none",
            },
          },
        }}
      >
        <Box sx={{ p: 2.5, display: "flex", flexDirection: "column", height: "100%" }}>
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
              <Box sx={{ p: 1, borderRadius: 2, bgcolor: "rgba(59, 130, 246, 0.1)", display: "flex", color: "#3b82f6" }}>
                <Radar size={20} />
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>คัดเหรียญน่าเทรด</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                  {scanAt ? `อัปเดต ${scanAt.toLocaleTimeString("th-TH")}` : "ยังไม่ได้สแกน"}
                </Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <Tooltip title="สแกนใหม่">
                <span>
                  <IconButton size="small" onClick={runScan} disabled={scanLoading} sx={{ color: "#94a3b8" }}>
                    {scanLoading ? <CircularProgress size={16} color="inherit" /> : <RefreshCw size={16} />}
                  </IconButton>
                </span>
              </Tooltip>
              <IconButton size="small" onClick={() => setScanOpen(false)} sx={{ color: "#94a3b8" }}>
                <X size={18} />
              </IconButton>
            </Stack>
          </Stack>

          <FormControlLabel
            sx={{ mt: 1, mb: 0.5, ml: 0 }}
            control={
              <Switch
                size="small"
                checked={scanShowAll}
                onChange={(e) => setScanShowAll(e.target.checked)}
              />
            }
            label={<Typography variant="caption" color="text.secondary">แสดงเหรียญที่ไม่มีสัญญาณ (HOLD) ด้วย</Typography>}
          />

          {scanLoading && <LinearProgress sx={{ mb: 1, borderRadius: 2 }} />}
          <Divider sx={{ borderColor: "rgba(255,255,255,0.05)", mb: 1.5 }} />

          <Box sx={{ flexGrow: 1, overflowY: "auto", mx: -0.5, px: 0.5 }}>
            {(() => {
              const visible = scanShowAll
                ? scanResults
                : scanResults.filter((r) => r.action !== "HOLD");
              if (!scanLoading && visible.length === 0) {
                return (
                  <Box sx={{ py: 6, textAlign: "center" }}>
                    <Typography variant="body2" color="text.secondary">
                      {scanResults.length === 0
                        ? "ยังไม่มีผลการสแกน"
                        : "ยังไม่มีเหรียญที่มีสัญญาณตอนนี้"}
                    </Typography>
                  </Box>
                );
              }
              return (
                <Stack spacing={1}>
                  {visible.map((r) => {
                    const conf = Math.round(r.confidence * 100);
                    const barColor =
                      r.action === "BUY" ? "#10b981" : r.action === "SELL" ? "#ef4444" : "#64748b";
                    const isActive = r.symbol === cryptoSymbol;
                    return (
                      <Box
                        key={r.symbol}
                        onClick={() => {
                          handleCryptoSymbolChange(r.symbol);
                          setScanOpen(false);
                        }}
                        sx={{
                          p: 1.5,
                          borderRadius: 2.5,
                          cursor: "pointer",
                          bgcolor: isActive ? "rgba(59, 130, 246, 0.08)" : "rgba(255,255,255,0.015)",
                          border: `1px solid ${isActive ? "rgba(59, 130, 246, 0.4)" : "rgba(255,255,255,0.05)"}`,
                          transition: "background-color .15s, border-color .15s",
                          "&:hover": { bgcolor: "rgba(255,255,255,0.04)", borderColor: "rgba(148,163,184,0.25)" },
                        }}
                      >
                        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                            <Chip
                              size="small"
                              label={actionLabel(r.action)}
                              color={actionColor(r.action)}
                              variant="outlined"
                              sx={{ fontWeight: 800, fontSize: 10, height: 20 }}
                            />
                            <Box>
                              <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>{r.symbol}</Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ ...MONO, display: "block", lineHeight: 1.2 }}>
                                {fmt(r.price, 2)}
                              </Typography>
                            </Box>
                          </Stack>
                          <Box sx={{ textAlign: "right", minWidth: 64 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>
                              ความเชื่อมั่น
                            </Typography>
                            <Typography sx={{ ...MONO, fontWeight: 800, lineHeight: 1.2, color: barColor }}>
                              {conf}%
                            </Typography>
                          </Box>
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={conf}
                          sx={{
                            height: 5,
                            borderRadius: 3,
                            bgcolor: "rgba(255,255,255,0.05)",
                            "& .MuiLinearProgress-bar": { bgcolor: barColor },
                          }}
                        />
                        {r.action !== "HOLD" && (
                          <Button
                            size="small"
                            variant="contained"
                            fullWidth
                            disabled={tradeStagingSymbol === r.symbol}
                            onClick={(e) => {
                              e.stopPropagation();
                              stageTrade(r.symbol);
                            }}
                            startIcon={
                              tradeStagingSymbol === r.symbol
                                ? <CircularProgress size={13} color="inherit" />
                                : <Zap size={14} />
                            }
                            sx={{
                              mt: 1.25,
                              height: 30,
                              borderRadius: 999,
                              fontSize: "0.78rem",
                              fontWeight: 700,
                              textTransform: "none",
                              bgcolor: r.action === "BUY" ? "#059669" : "#dc2626",
                              "&:hover": { bgcolor: r.action === "BUY" ? "#047857" : "#b91c1c" },
                            }}
                          >
                            {tradeStagingSymbol === r.symbol ? "กำลังวิเคราะห์..." : `เทรด ${actionLabel(r.action)}`}
                          </Button>
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              );
            })()}
          </Box>
        </Box>
      </Drawer>

      <CryptoBotSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settingsForm={settingsForm}
        setSettingsForm={setSettingsForm}
        strategies={strategies}
        selectedStrategyValue={selectedStrategyValue}
        activeStrategy={activeStrategy}
        strategyDescription={strategyDescription}
        strategyLabel={strategyLabel}
        savingSettings={savingSettings}
        onSave={handleSaveSettings}
      />

      {/* Confirm staged trade */}
      <Dialog
        open={Boolean(tradeCandidate)}
        onClose={() => {
          if (!tradeConfirming) cancelTrade();
        }}
        slotProps={{
          paper: {
            sx: {
              bgcolor: "#0d1321",
              border: "1px solid rgba(59, 130, 246, 0.25)",
              borderRadius: 3,
              minWidth: { xs: "calc(100vw - 32px)", sm: 460 },
            },
          },
        }}
      >
        {tradeCandidate && (() => {
          const rec = tradeCandidate.rec;
          const lot = tradeCandidate.pending?.lot ?? rec.suggested_lot;
          const entry = rec.price;
          const sl = rec.stop_loss;
          const tp = rec.take_profit;
          const rr =
            sl != null && tp != null && Math.abs(entry - sl) > 0
              ? Math.abs(tp - entry) / Math.abs(entry - sl)
              : null;
          const isBuy = rec.action === "BUY";
          return (
            <>
              <DialogTitle sx={{ color: "#fff", fontWeight: 650, display: "flex", alignItems: "center", gap: 1.25 }}>
                <Chip
                  size="small"
                  label={actionLabel(rec.action)}
                  color={actionColor(rec.action)}
                  variant="outlined"
                  sx={{ fontWeight: 800 }}
                />
                ยืนยันเปิดเทรด {rec.symbol}
              </DialogTitle>
              <DialogContent>
                <Stack spacing={1.5}>
                  <Typography variant="body2" color="text.secondary">
                    {rec.summary || "ตรวจสอบรายละเอียดก่อนเปิดออเดอร์ด้วยราคาตลาด"}
                  </Typography>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 1,
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: "rgba(255,255,255,0.025)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">ราคาเข้า</Typography>
                    <Typography variant="caption" sx={MONO}>{fmt(entry, 2)}</Typography>
                    <Typography variant="caption" color="text.secondary">Stop Loss</Typography>
                    <Typography variant="caption" sx={{ ...MONO, color: "#f87171" }}>{sl != null ? fmt(sl, 2) : "—"}</Typography>
                    <Typography variant="caption" color="text.secondary">Take Profit</Typography>
                    <Typography variant="caption" sx={{ ...MONO, color: "#34d399" }}>{tp != null ? fmt(tp, 2) : "—"}</Typography>
                    <Typography variant="caption" color="text.secondary">ขนาด (lot)</Typography>
                    <Typography variant="caption" sx={MONO}>{lot != null ? fmt(lot, 2) : "—"}</Typography>
                    <Typography variant="caption" color="text.secondary">R:R</Typography>
                    <Typography variant="caption" sx={MONO}>{rr != null ? `1 : ${fmt(rr, 2)}` : "—"}</Typography>
                    <Typography variant="caption" color="text.secondary">ความเชื่อมั่น</Typography>
                    <Typography variant="caption" sx={{ ...MONO, fontWeight: 700, color: isBuy ? "#34d399" : "#f87171" }}>
                      {Math.round((rec.confidence ?? 0) * 100)}%
                    </Typography>
                  </Box>
                </Stack>
              </DialogContent>
              <DialogActions sx={{ px: 3, pb: 2.5 }}>
                <Button variant="text" color="inherit" disabled={tradeConfirming} onClick={cancelTrade}>
                  ยกเลิก
                </Button>
                <Button
                  variant="contained"
                  color={isBuy ? "success" : "error"}
                  disabled={tradeConfirming}
                  onClick={confirmTrade}
                  startIcon={tradeConfirming ? <CircularProgress size={16} color="inherit" /> : <Zap size={16} />}
                >
                  ยืนยันเปิดเทรด
                </Button>
              </DialogActions>
            </>
          );
        })()}
      </Dialog>

      <Dialog
        open={Boolean(closeCandidate)}
        onClose={() => {
          if (!closingTicket) setCloseCandidate(null);
        }}
        slotProps={{
          paper: {
            sx: {
              bgcolor: "#0d1321",
              border: "1px solid rgba(239, 68, 68, 0.22)",
              borderRadius: 3,
              minWidth: { xs: "calc(100vw - 32px)", sm: 460 },
            },
          },
        }}
      >
        <DialogTitle sx={{ color: "#fff", fontWeight: 650 }}>
          ยืนยันปิด slot
        </DialogTitle>
        <DialogContent>
          {closeCandidate && (
            <Stack spacing={1.25}>
              <Typography variant="body2" color="text.secondary">
                ต้องการปิดออเดอร์นี้ด้วยราคาตลาดตอนนี้หรือไม่?
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 1,
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <Typography variant="caption" color="text.secondary">เหรียญ</Typography>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>{closeCandidate.symbol}</Typography>
                <Typography variant="caption" color="text.secondary">Ticket</Typography>
                <Typography variant="caption" sx={MONO}>{closeCandidate.ticket}</Typography>
                <Typography variant="caption" color="text.secondary">ฝั่ง</Typography>
                <Typography variant="caption">{actionLabel(closeCandidate.type)}</Typography>
                <Typography variant="caption" color="text.secondary">ขนาด</Typography>
                <Typography variant="caption" sx={MONO}>{closeCandidate.volume}</Typography>
                <Typography variant="caption" color="text.secondary">ราคาทุน</Typography>
                <Typography variant="caption" sx={MONO}>{fmt(closeCandidate.price_open, 2)}</Typography>
                <Typography variant="caption" color="text.secondary">ราคาปัจจุบัน</Typography>
                <Typography variant="caption" sx={MONO}>{fmt(closeCandidate.price_current, 2)}</Typography>
                <Typography variant="caption" color="text.secondary">กำไร/ขาดทุน</Typography>
                <Typography
                  variant="caption"
                  sx={{ ...MONO, color: closeCandidate.profit >= 0 ? "#10b981" : "#ef4444", fontWeight: 650 }}
                >
                  {closeCandidate.profit >= 0 ? "+" : ""}
                  {fmt(closeCandidate.profit)}
                </Typography>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            variant="text"
            color="inherit"
            disabled={Boolean(closingTicket)}
            onClick={() => setCloseCandidate(null)}
          >
            ยกเลิก
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={Boolean(closingTicket)}
            onClick={confirmCloseCandidate}
            startIcon={closingTicket ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            ยืนยันปิด slot
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
