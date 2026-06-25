"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToastr } from "../components/Toastr";
import Sidebar, { SIDEBAR_W } from "../components/Sidebar";
import TopBar from "../components/TopBar";
import BotLog from "../crypto/components/BotLog";
import PnLChart from "../crypto/components/PnLChart";
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
  Drawer,
  FormControl,
  IconButton,
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
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  Activity,
  Award,
  Bot,
  Filter,
  Gauge,
  History,
  RefreshCw,
  ScrollText,
  Save,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
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
  magic: number;
  contract_size?: number;
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

type Tick = {
  bid: number;
  ask: number;
  last: number;
  time: number;
  error?: string;
};

type ScanResult = {
  symbol: string;
  action: string;
  confidence: number;
  price: number;
  summary: string;
};

type Recommendation = {
  symbol: string;
  timeframe: string;
  price: number;
  action: string;
  confidence: number;
  stop_loss?: number | null;
  take_profit?: number | null;
  suggested_lot?: number | null;
  summary?: string;
};

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`/api/${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || res.statusText);
  return data;
}

const MONO = { fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums" };
const fmt = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined || Number.isNaN(Number(n)) ? "-" : Number(n).toFixed(d);
const formatBangkokTime = (value: string) => {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  const date = new Date(hasTimezone ? value : `${value}+07:00`);
  return date.toLocaleString("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  });
};

const actionColor = (action?: string): "success" | "error" | "default" =>
  action === "BUY" ? "success" : action === "SELL" ? "error" : "default";

const actionLabel = (action?: string) =>
  action === "BUY" ? "Long" : action === "SELL" ? "Short" : action || "รอ";

const isGoldSymbol = (sym: string) => {
  const s = sym.toUpperCase();
  return s.includes("GOLD") || s.startsWith("XAU");
};

const CRYPTO_BASES = [
  "1INCH", "AAVE", "ADA", "AGIX", "ALGO", "APE", "APT", "ARB", "ATOM", "AVAX", "AXS",
  "BAT", "BCH", "BNB", "BONK", "BTC", "BTG", "CHZ", "COMP", "CRV", "DASH", "DOGE",
  "DOT", "DYDX", "EGLD", "ENJ", "ETC", "ETH", "FET", "FIL", "FLOKI", "FLOW", "GALA",
  "GRT", "HBAR", "ICP", "IMX", "INJ", "JUP", "LDO", "LINK", "LRC", "LTC", "LUNA",
  "MANA", "MATIC", "MKR", "NEAR", "OCEAN", "OP", "PEPE", "RNDR", "SAND", "SEI",
  "SHIB", "SNX", "SOL", "STORJ", "STX", "SUI", "SUSHI", "THETA", "TIA", "UMA",
  "UNI", "WIF", "XLM", "XRP", "XTZ", "ZEC", "ZRX",
].sort((a, b) => b.length - a.length);

const CRYPTO_QUOTES = ["USD", "USDT", "BTC", "ETH", "EUR"];

const isCryptoSymbol = (sym: string) => {
  const s = sym.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/GOLD|SILVER|XAU|XAG|PLATINUM|PALLADIUM/.test(s)) return false;
  if (/^(EUR|GBP|AUD|NZD|CAD|CHF|HKD|SGD|ZAR|MXN|NOK|SEK|DKK|TRY|CNH|RUB)[A-Z]{3}$/.test(s)) return false;
  return CRYPTO_BASES.some((base) => s === base || CRYPTO_QUOTES.some((quote) => s.startsWith(`${base}${quote}`)));
};

const isSilverOrOtherMetal = (sym: string) => {
  const s = sym.toUpperCase();
  return /SILVER|XAG|XPD|XPT|PLATINUM|PALLADIUM/.test(s);
};

const strategyLabel = (name: string) =>
  ({
    ema_macd_rsi: "EMA + MACD + RSI",
    trend: "Trend Follow",
    mean_reversion: "Mean Reversion",
    breakout: "Breakout",
  }[name] ?? name);

function StatCard({
  icon,
  label,
  value,
  tone = "#e2e8f0",
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: string;
  sub?: React.ReactNode;
}) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
            {label}
          </Typography>
          <Box sx={{ color: tone, display: "flex" }}>{icon}</Box>
        </Stack>
        <Typography sx={{ ...MONO, color: tone, fontSize: "1.45rem", fontWeight: 800, mt: 1, lineHeight: 1.15 }}>
          {value}
        </Typography>
        {sub && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function QuickNumberInput({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999999,
  precision = 0,
  helperText,
}: {
  label: string;
  value: number;
  onChange: (val: number) => void;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  helperText?: string;
}) {
  const clamp = (next: number) => Math.max(min, Math.min(max, Number(next.toFixed(precision))));

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, width: "100%" }}>
      <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 600, px: 0.5 }}>
        {label}
      </Typography>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          height: 40,
          bgcolor: "rgba(255,255,255,0.01)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 2,
          overflow: "hidden",
          "&:focus-within": {
            borderColor: "#fbbf24",
            boxShadow: "0 0 0 1px rgba(251,191,36,0.18)",
          },
        }}
      >
        <Button
          onClick={() => onChange(clamp(value - step))}
          disabled={value <= min}
          sx={{
            minWidth: 40,
            width: 40,
            height: "100%",
            borderRadius: 0,
            color: "#94a3b8",
            borderRight: "1px solid rgba(255,255,255,0.05)",
            "&:hover": { bgcolor: "rgba(255,255,255,0.04)", color: "#fff" },
          }}
        >
          -
        </Button>
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            onChange(Number.isFinite(parsed) ? clamp(parsed) : min);
          }}
          style={{
            flexGrow: 1,
            width: "100%",
            height: "100%",
            border: "none",
            background: "transparent",
            color: "#fff",
            textAlign: "center",
            fontFamily: "ui-monospace, monospace",
            fontWeight: 700,
            fontSize: "1rem",
            outline: "none",
          }}
        />
        <Button
          onClick={() => onChange(clamp(value + step))}
          disabled={value >= max}
          sx={{
            minWidth: 40,
            width: 40,
            height: "100%",
            borderRadius: 0,
            color: "#94a3b8",
            borderLeft: "1px solid rgba(255,255,255,0.05)",
            "&:hover": { bgcolor: "rgba(255,255,255,0.04)", color: "#fff" },
          }}
        >
          +
        </Button>
      </Box>
      {helperText && (
        <Typography variant="caption" sx={{ color: "#64748b", px: 0.5, fontSize: "0.78rem" }}>
          {helperText}
        </Typography>
      )}
    </Box>
  );
}

export default function GoldPage() {
  const toastr = useToastr();

  const [account, setAccount] = useState<Account | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<HistoryDeal[]>([]);
  const [ticks, setTicks] = useState<Record<string, Tick>>({});
  const [settings, setSettings] = useState<any>({
    symbols: "",
    default_timeframe: "M15",
    strategy: "ema_macd_rsi",
    risk_per_trade: 0.01,
    max_lot: 1,
    gold_magic: 556688,
    max_open_trades: 3,
    max_gold_open_trades: 3,
    auto_trade_interval: 60,
    bot_enabled: false,
    gold_bot_enabled: true,
    use_ai: false,
  });
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [goldInput, setGoldInput] = useState("");
  const [newSymbolInput, setNewSymbolInput] = useState("");

  const currentList = useMemo(() => {
    return goldInput
      ? goldInput.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean)
      : [];
  }, [goldInput]);

  const addSymbol = useCallback((raw: string) => {
    const clean = raw.trim().toUpperCase();
    if (!clean) return;
    if (!currentList.includes(clean)) {
      setGoldInput([...currentList, clean].join(", "));
    }
    setNewSymbolInput("");
  }, [currentList]);

  const removeSymbol = useCallback((sym: string) => {
    setGoldInput(currentList.filter((x) => x !== sym).join(", "));
  }, [currentList]);

  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [priceSearch, setPriceSearch] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsOpenRef = useRef(false);
  const [logOpen, setLogOpen] = useState(false);
  const [tradeStagingSymbol, setTradeStagingSymbol] = useState<string | null>(null);
  const [tradeConfirm, setTradeConfirm] = useState<Recommendation | null>(null);
  const [tradeExecuting, setTradeExecuting] = useState(false);
  const [closingTicket, setClosingTicket] = useState<number | null>(null);
  const [closeCandidate, setCloseCandidate] = useState<Position | null>(null);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyRowsPerPage, setHistoryRowsPerPage] = useState(10);

  const goldSymbols = useMemo(() => {
    const fromConfig: string[] = (settings.symbols || "")
      .split(",")
      .map((s: string) => s.trim().toUpperCase())
      .filter(Boolean)
      .filter(isGoldSymbol);
    return Array.from(new Set<string>(fromConfig)).sort((a, b) => {
      const rank = ["GOLD", "XAUUSD"];
      return (rank.indexOf(a) === -1 ? 99 : rank.indexOf(a)) - (rank.indexOf(b) === -1 ? 99 : rank.indexOf(b)) || a.localeCompare(b);
    });
  }, [settings.symbols]);

  const filteredGoldSymbols = useMemo(() => {
    const q = priceSearch.trim().toUpperCase();
    return q ? goldSymbols.filter((s) => s.includes(q)) : goldSymbols;
  }, [goldSymbols, priceSearch]);

  const goldPositions = useMemo(
    () => positions.filter((p) => isGoldSymbol(p.symbol) && (!settings.gold_magic || p.magic === settings.gold_magic)),
    [positions, settings.gold_magic]
  );
  const goldHistory = useMemo(
    () => history.filter((h) => isGoldSymbol(h.symbol) && (!settings.gold_magic || h.magic === settings.gold_magic)),
    [history, settings.gold_magic]
  );
  const goldOpenPl = goldPositions.reduce((sum, p) => sum + (Number(p.profit) || 0), 0);
  const realizedGoldPl = goldHistory.filter((h) => h.entry === "OUT").reduce((sum, h) => sum + (Number(h.profit) || 0), 0);
  const selectedTick = selectedSymbol ? ticks[selectedSymbol] : null;
  const spread = selectedTick ? Math.abs((selectedTick.ask || 0) - (selectedTick.bid || 0)) : null;
  const goldSlotLimit = settings.max_gold_open_trades ?? settings.max_open_trades ?? 3;
  const goldBotActive = Boolean(settings.gold_bot_enabled);
  const botGoldUsage = goldSlotLimit ? Math.min(100, (goldPositions.length / Math.max(1, goldSlotLimit)) * 100) : 0;
  const historyPageStart = historyPage * historyRowsPerPage;
  const paginatedGoldHistory = goldHistory.slice(historyPageStart, historyPageStart + historyRowsPerPage);

  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(goldHistory.length / historyRowsPerPage) - 1);
    if (historyPage > maxPage) setHistoryPage(maxPage);
  }, [goldHistory.length, historyRowsPerPage, historyPage]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [acct, pos, cfg, strat, hist] = await Promise.all([
        api("account").catch(() => null),
        api("positions").catch(() => ({ positions: [] })),
        api("settings").catch(() => null),
        api("strategies").catch(() => ({ strategies: [] })),
        api("history?days=7").catch(() => ({ history: [] })),
      ]);

      setConnected(Boolean(acct));
      if (acct) setAccount(acct);
      setPositions(pos.positions || []);
      if (cfg && !settingsOpenRef.current) {
        setSettings(cfg);
        const cfgGold = (cfg.symbols || "")
          .split(",")
          .map((s: string) => s.trim().toUpperCase())
          .filter(Boolean)
          .filter(isGoldSymbol);
        setGoldInput(cfgGold.length ? cfgGold.join(", ") : "GOLD");
      }
      setStrategies(strat.strategies || []);
      setHistory(hist.history || []);
    } catch (e: any) {
      setConnected(false);
      toastr.error(`โหลดข้อมูลหน้าเทรดทองไม่สำเร็จ: ${e.message}`);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [toastr]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!goldSymbols.length) {
      setSelectedSymbol("");
      return;
    }
    setSelectedSymbol((prev) => (prev && goldSymbols.includes(prev) ? prev : goldSymbols[0]));
  }, [goldSymbols]);

  useEffect(() => {
    if (!goldSymbols.length) return;
    let active = true;
    const loadTicks = async () => {
      try {
        const data = await api(`ticks?symbols=${encodeURIComponent(goldSymbols.join(","))}`);
        if (active) setTicks(data || {});
      } catch {
        if (active) setTicks({});
      }
    };
    loadTicks();
    const id = setInterval(loadTicks, 5_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [goldSymbols]);

  const runScan = useCallback(async (notify = true) => {
    if (!goldSymbols.length) return;
    setScanLoading(true);
    try {
      const data = await api("scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: goldSymbols,
          timeframe: settings.default_timeframe,
          strategy: settings.strategy,
          bars: 220,
        }),
      });
      setScanResults(data.results || []);
      if (notify) toastr.success("สแกนสัญญาณทองเรียบร้อย");
    } catch (e: any) {
      if (notify) toastr.error(`สแกนทองไม่สำเร็จ: ${e.message}`);
    } finally {
      setScanLoading(false);
    }
  }, [goldSymbols, settings.default_timeframe, settings.strategy, toastr]);

  useEffect(() => {
    if (!goldSymbols.length) {
      setScanResults([]);
      return;
    }

    let active = true;
    let inFlight = false;
    const refreshSignals = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        await runScan(false);
      } finally {
        inFlight = false;
      }
    };

    refreshSignals();
    const intervalId = setInterval(refreshSignals, 30_000);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [goldSymbols.join(","), settings.default_timeframe, settings.strategy, runScan]);

  async function stageTrade(symbol: string) {
    setTradeStagingSymbol(symbol);
    try {
      const data = await api("analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          timeframe: settings.default_timeframe,
          bars: 220,
          strategy: settings.strategy,
          use_ai: settings.use_ai,
          preview: true,
        }),
      });
      const rec = data.recommendation as Recommendation;
      if (!rec || rec.action === "HOLD") {
        toastr.warning(rec?.summary || `ยังไม่มีสัญญาณเข้าเทรดสำหรับ ${symbol}`);
        return;
      }
      setTradeConfirm(rec);
    } catch (e: any) {
      toastr.error(`วิเคราะห์ทองไม่สำเร็จ: ${e.message}`);
    } finally {
      setTradeStagingSymbol(null);
    }
  }

  async function confirmTrade() {
    if (!tradeConfirm) return;
    setTradeExecuting(true);
    try {
      await api("trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: tradeConfirm.symbol,
          action: tradeConfirm.action,
          lot: tradeConfirm.suggested_lot || 0.01,
          sl: tradeConfirm.stop_loss || undefined,
          tp: tradeConfirm.take_profit || undefined,
        }),
      });
      toastr.success(`เปิดออเดอร์ทอง ${tradeConfirm.symbol} ${actionLabel(tradeConfirm.action)} แล้ว`);
      setTradeConfirm(null);
      refresh();
    } catch (e: any) {
      toastr.error(`ส่งออเดอร์ไม่สำเร็จ: ${e.message}`);
    } finally {
      setTradeExecuting(false);
    }
  }

  async function closePosition(ticket: number) {
    setClosingTicket(ticket);
    try {
      await api(`positions/${ticket}/close`, { method: "POST" });
      toastr.success("ปิด position ทองแล้ว");
      refresh();
    } catch (e: any) {
      toastr.error(`ปิด position ไม่สำเร็จ: ${e.message}`);
    } finally {
      setClosingTicket(null);
    }
  }

  async function detectGoldSymbols() {
    setDetecting(true);
    try {
      const data = await api("symbols/detect-metals");
      const detected = (data.symbols || []).map((s: string) => s.toUpperCase()).filter(isGoldSymbol);
      if (detected.length) {
        setGoldInput(detected.join(", "));
        toastr.success(`ตรวจพบสัญลักษณ์ทอง ${detected.length} รายการ`);
      } else {
        toastr.warning("ไม่พบสัญลักษณ์ทองใน MT5 ของโบรกเกอร์นี้");
      }
    } catch (e: any) {
      toastr.error(`สแกนสัญลักษณ์ทองไม่สำเร็จ: ${e.message}`);
    } finally {
      setDetecting(false);
    }
  }

  async function validateGoldSymbols() {
    const list = goldInput.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!list.length) return;
    setValidating(true);
    try {
      const data = await api("symbols/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: list }),
      });
      const valid = (data.valid || []).filter(isGoldSymbol);
      setGoldInput(valid.join(", "));
      if (data.invalid?.length) toastr.warning(`กรองออก ${data.invalid.length} symbols ที่ MT5 ใช้ไม่ได้`);
      else toastr.success("สัญลักษณ์ทองทั้งหมดใช้งานได้");
    } catch (e: any) {
      toastr.error(`ตรวจสอบ symbol ไม่สำเร็จ: ${e.message}`);
    } finally {
      setValidating(false);
    }
  }

  async function saveGoldSettings() {
    const nextGold = goldInput.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    const current = (settings.symbols || "").split(",").map((s: string) => s.trim().toUpperCase()).filter(Boolean);
    const keep = current.filter((s: string) => !isGoldSymbol(s) && !isSilverOrOtherMetal(s));
    const nextSymbols = Array.from(new Set([...keep, ...nextGold])).join(",");
    setSaving(true);
    try {
      const next = {
        symbols: nextSymbols,
        default_timeframe: settings.default_timeframe,
        strategy: settings.strategy,
        auto_trade_interval: settings.auto_trade_interval,
        risk_per_trade: settings.risk_per_trade,
        max_lot: settings.max_lot,
        gold_magic: settings.gold_magic,
        max_gold_open_trades: settings.max_gold_open_trades,
        default_rr: settings.default_rr,
        gold_bot_enabled: settings.gold_bot_enabled,
        use_ai: settings.use_ai,
      };
      await api("settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const fresh = await api("settings");
      setSettings(fresh);
      const cfgGold = (fresh.symbols || "")
        .split(",")
        .map((s: string) => s.trim().toUpperCase())
        .filter(Boolean)
        .filter(isGoldSymbol);
      setGoldInput(cfgGold.length ? cfgGold.join(", ") : "GOLD");
      setSettingsOpen(false);
      toastr.success("บันทึกการตั้งค่าบอททองแล้ว");
      refresh();
    } catch (e: any) {
      toastr.error(`บันทึกการตั้งค่าไม่สำเร็จ: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  const patchSettings = (patch: Record<string, any>) => setSettings((prev: any) => ({ ...prev, ...patch }));

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#080d18" }}>
      <Sidebar
        connected={connected}
        equity={account?.equity}
        currency={account?.currency || "USD"}
        onOpenLog={() => setLogOpen(true)}
        onSync={refresh}
      />
      <Box sx={{ ml: `${SIDEBAR_W}px` }}>
        <TopBar
          pageTitle="Gold Bot Terminal"
          pageIcon={<Award size={18} />}
          connected={connected}
          accountLogin={account?.login}
          balance={account?.balance}
          equity={account?.equity}
          currency={account?.currency || "USD"}
          openPl={goldOpenPl}
          botEnabled={goldBotActive}
          strategy={settings.strategy}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <Container maxWidth={false} sx={{ py: 2.5, px: { xs: 1.5, md: 2.5 } }}>
          <Stack spacing={2.5}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "repeat(4, minmax(0, 1fr))" },
                gap: 1.5,
              }}
            >
              <StatCard
                icon={<Award size={18} />}
                label="Gold Symbols"
                value={goldSymbols.length}
                tone="#fbbf24"
                sub={goldSymbols.join(" / ") || "ยังไม่ได้ตั้งค่า"}
              />
              <StatCard
                icon={<Activity size={18} />}
                label="Open Gold P/L"
                value={`${goldOpenPl >= 0 ? "+" : ""}${fmt(goldOpenPl)} ${account?.currency || ""}`}
                tone={goldOpenPl >= 0 ? "#10b981" : "#ef4444"}
                sub={`${goldPositions.length} positions`}
              />
              <StatCard
                icon={<History size={18} />}
                label="Realized 7D"
                value={`${realizedGoldPl >= 0 ? "+" : ""}${fmt(realizedGoldPl)} ${account?.currency || ""}`}
                tone={realizedGoldPl >= 0 ? "#10b981" : "#ef4444"}
                sub={`${goldHistory.filter((h) => h.entry === "OUT").length} closed deals`}
              />
              <StatCard
                icon={<Gauge size={18} />}
                label="Gold Capacity"
                value={`${goldPositions.length}/${goldSlotLimit || 0}`}
                tone="#60a5fa"
                sub={
                  <Box>
                    <LinearProgress variant="determinate" value={botGoldUsage} sx={{ mt: 0.75, height: 5, borderRadius: 99 }} />
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                      Max gold slots: {goldSlotLimit || 0}
                    </Typography>
                  </Box>
                }
              />
            </Box>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.35fr 0.85fr" }, gap: 2 }}>
              <Card>
                <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    sx={{ alignItems: { xs: "stretch", md: "center" }, justifyContent: "space-between", gap: 1.5, p: 2 }}
                  >
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Award size={18} color="#fbbf24" />
                      <Box>
                        <Typography sx={{ fontWeight: 800 }}>ราคาทองและสัญญาณบอท</Typography>
                        <Typography variant="caption" color="text.secondary">
                          เลือก symbol แล้วให้บอทวิเคราะห์ก่อนส่งออเดอร์
                        </Typography>
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={1}>
                      <TextField
                        size="small"
                        value={priceSearch}
                        onChange={(e) => setPriceSearch(e.target.value)}
                        placeholder="ค้นหา GOLD/XAU"
                        sx={{ minWidth: 180 }}
                      />
                      <Button
                        variant="contained"
                        startIcon={scanLoading ? <CircularProgress size={16} color="inherit" /> : <Zap size={16} />}
                        disabled={scanLoading || goldSymbols.length === 0}
                        onClick={() => runScan(true)}
                      >
                        สแกน
                      </Button>
                    </Stack>
                  </Stack>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ "& th": { bgcolor: "#0d1321", borderBottomColor: "rgba(255,255,255,0.08)" } }}>
                        <TableCell>Symbol</TableCell>
                        <TableCell align="right">Bid</TableCell>
                        <TableCell align="right">Ask</TableCell>
                        <TableCell align="right">Spread</TableCell>
                        <TableCell align="center">Signal</TableCell>
                        <TableCell align="right">Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {initialLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                            <CircularProgress size={22} sx={{ color: "#fbbf24" }} />
                          </TableCell>
                        </TableRow>
                      ) : filteredGoldSymbols.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6}>
                            <Alert severity="warning">ยังไม่มี symbol ทอง กดตั้งค่าแล้วสแกนจาก MT5 ได้เลย</Alert>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredGoldSymbols.map((sym) => {
                          const tick = ticks[sym];
                          const scan = scanResults.find((r) => r.symbol.toUpperCase() === sym.toUpperCase());
                          const rowSpread = tick ? Math.abs((tick.ask || 0) - (tick.bid || 0)) : null;
                          const selected = selectedSymbol === sym;
                          return (
                            <TableRow
                              key={sym}
                              hover
                              onClick={() => setSelectedSymbol(sym)}
                              sx={{
                                cursor: "pointer",
                                bgcolor: selected ? "rgba(251,191,36,0.08)" : "transparent",
                                "& td": { borderBottomColor: "rgba(255,255,255,0.04)" },
                              }}
                            >
                              <TableCell>
                                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                  <Award size={15} color="#fbbf24" />
                                  <Typography sx={{ ...MONO, fontWeight: 800 }}>{sym}</Typography>
                                </Stack>
                              </TableCell>
                              <TableCell align="right" sx={MONO}>{tick?.error ? "-" : fmt(tick?.bid, 2)}</TableCell>
                              <TableCell align="right" sx={MONO}>{tick?.error ? "-" : fmt(tick?.ask, 2)}</TableCell>
                              <TableCell align="right" sx={MONO}>{rowSpread === null ? "-" : fmt(rowSpread, 2)}</TableCell>
                              <TableCell align="center">
                                <Chip
                                  size="small"
                                  color={actionColor(scan?.action)}
                                  label={scan ? `${actionLabel(scan.action)} ${Math.round(scan.confidence * 100)}%` : "รอสแกน"}
                                  variant={scan ? "filled" : "outlined"}
                                />
                              </TableCell>
                              <TableCell align="right">
                                <Button
                                  size="small"
                                  variant="outlined"
                                  disabled={tradeStagingSymbol === sym}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    stageTrade(sym);
                                  }}
                                  startIcon={tradeStagingSymbol === sym ? <CircularProgress size={14} color="inherit" /> : <Bot size={14} />}
                                >
                                  วิเคราะห์ & เทรด
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Stack spacing={2}>
                <Card>
                  <CardContent>
                    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
                      <Typography sx={{ fontWeight: 800 }}>Open Gold Positions</Typography>
                      <Chip size="small" label={`${goldPositions.length} open`} />
                    </Stack>
                    <Stack spacing={1}>
                      {goldPositions.length === 0 ? (
                        <Typography color="text.secondary" variant="body2">ยังไม่มี position ทองที่เปิดอยู่</Typography>
                      ) : (
                        goldPositions.map((p) => {
                          const pct = p.price_open > 0
                            ? (p.type === "BUY"
                                ? ((p.price_current - p.price_open) / p.price_open) * 100
                                : ((p.price_open - p.price_current) / p.price_open) * 100)
                            : 0;
                          const isProfit = p.profit >= 0;
                          const invested = p.volume * p.price_open * (p.contract_size ?? 1.0);
                          return (
                            <Box
                              key={p.ticket}
                              sx={{
                                p: 1.25,
                                borderRadius: 1,
                                bgcolor: p.type === "BUY" ? "rgba(16,185,129,0.04)" : "rgba(239,68,68,0.04)",
                                border: `1px solid ${p.type === "BUY" ? "rgba(16,185,129,0.18)" : "rgba(239,68,68,0.18)"}`,
                              }}
                            >
                              <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", justifyContent: "space-between", mb: 1 }}>
                                <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
                                  <Chip
                                    size="small"
                                    label={actionLabel(p.type)}
                                    color={actionColor(p.type)}
                                    variant="outlined"
                                    sx={{ flexShrink: 0, height: 22, borderRadius: 1, fontWeight: 800, fontSize: 10 }}
                                  />
                                  <Box sx={{ minWidth: 0 }}>
                                    <Typography noWrap sx={{ fontWeight: 750, lineHeight: 1.15 }}>{p.symbol}</Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ ...MONO, display: "block", lineHeight: 1.2 }}>
                                      Ticket #{p.ticket}
                                    </Typography>
                                  </Box>
                                </Stack>
                                <Stack direction="row" spacing={0.75} sx={{ alignItems: "flex-start", flexShrink: 0 }}>
                                  <Box sx={{ textAlign: "right" }}>
                                    <Typography sx={{ ...MONO, fontWeight: 850, lineHeight: 1.15, color: isProfit ? "#10b981" : "#ef4444" }}>
                                      {isProfit ? "+" : ""}{fmt(p.profit)} {account?.currency || ""}
                                    </Typography>
                                    <Typography variant="caption" sx={{ ...MONO, display: "block", lineHeight: 1.2, color: isProfit ? "#10b981" : "#ef4444", fontWeight: 700 }}>
                                      {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                                    </Typography>
                                  </Box>
                                  <IconButton
                                    size="small"
                                    disabled={closingTicket === p.ticket}
                                    onClick={() => setCloseCandidate(p)}
                                    sx={{
                                      width: 28, height: 28, borderRadius: 1,
                                      border: "1px solid rgba(239,68,68,0.28)",
                                      bgcolor: "rgba(239,68,68,0.06)", color: "#f87171", flexShrink: 0,
                                      "&:hover": { borderColor: "#ef4444", bgcolor: "rgba(239,68,68,0.13)" },
                                    }}
                                  >
                                    {closingTicket === p.ticket ? <CircularProgress size={14} color="inherit" /> : <X size={15} />}
                                  </IconButton>
                                </Stack>
                              </Stack>

                              <Box
                                sx={{
                                  display: "grid",
                                  gridTemplateColumns: { xs: "repeat(2,1fr)", sm: "repeat(4,1fr)" },
                                  gap: 0.75, p: 1, borderRadius: 1,
                                  bgcolor: "rgba(255,255,255,0.025)",
                                }}
                              >
                                {[
                                  { label: "Lot",      value: fmt(p.volume, 2) },
                                  { label: "ราคาเข้า", value: fmt(p.price_open, 2) },
                                  { label: "ปัจจุบัน", value: fmt(p.price_current, 2) },
                                  { label: "เงินทุน",  value: fmt(invested, 2) },
                                ].map((cell) => (
                                  <Box key={cell.label} sx={{ minWidth: 0 }}>
                                    <Typography variant="caption" sx={{ display: "block", color: "#64748b", lineHeight: 1.2 }}>
                                      {cell.label}
                                    </Typography>
                                    <Typography noWrap variant="caption" sx={{ ...MONO, display: "block", color: "#cbd5e1", fontWeight: 650, lineHeight: 1.25 }}>
                                      {cell.value}
                                    </Typography>
                                  </Box>
                                ))}
                              </Box>
                            </Box>
                          );
                        })
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Stack>
            </Box>

            <Card>
              <CardContent>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
                  <History size={18} color="#60a5fa" />
                  <Typography sx={{ fontWeight: 800 }}>Gold Trade History 7D</Typography>
                </Stack>
                <PnLChart deals={goldHistory} />
                <Box sx={{ overflowX: "auto", mt: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ "& th": { bgcolor: "#0d1321", borderBottomColor: "rgba(255,255,255,0.08)" } }}>
                        <TableCell>เวลา</TableCell>
                        <TableCell>Symbol</TableCell>
                        <TableCell>ประเภท</TableCell>
                        <TableCell align="right">Volume</TableCell>
                        <TableCell align="right">ราคา</TableCell>
                        <TableCell align="right">กำไร/ขาดทุน</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {paginatedGoldHistory.map((h) => (
                        <TableRow key={`${h.ticket}-${h.time}`} sx={{ "& td": { borderBottomColor: "rgba(255,255,255,0.04)" } }}>
                          <TableCell sx={{ ...MONO, color: "#94a3b8", fontSize: "0.78rem" }}>{formatBangkokTime(h.time)}</TableCell>
                          <TableCell sx={{ ...MONO, fontWeight: 800 }}>{h.symbol}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={`${h.entry === "OUT" ? "ปิด" : "เปิด"} ${h.type}`}
                              color={h.type === "BUY" ? "success" : "error"}
                              variant="outlined"
                              sx={{ height: 20, fontSize: "0.7rem", fontWeight: 700, borderRadius: 1 }}
                            />
                          </TableCell>
                          <TableCell align="right" sx={MONO}>{fmt(h.volume, 2)}</TableCell>
                          <TableCell align="right" sx={MONO}>{fmt(h.price, 2)}</TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              ...MONO,
                              color: h.profit > 0 ? "#10b981" : h.profit < 0 ? "#ef4444" : "#64748b",
                              fontWeight: 800,
                            }}
                          >
                            {h.profit > 0 ? "+" : ""}{fmt(h.profit)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {goldHistory.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6}>
                            <Typography color="text.secondary" variant="body2">ยังไม่มีประวัติเทรดทองใน 7 วันล่าสุด</Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  <TablePagination
                    rowsPerPageOptions={[5, 10, 20, 50]}
                    component="div"
                    count={goldHistory.length}
                    rowsPerPage={historyRowsPerPage}
                    page={historyPage}
                    onPageChange={(_event, newPage) => setHistoryPage(newPage)}
                    onRowsPerPageChange={(event) => {
                      setHistoryRowsPerPage(parseInt(event.target.value, 10));
                      setHistoryPage(0);
                    }}
                    labelRowsPerPage="แถวต่อหน้า:"
                    labelDisplayedRows={({ from, to, count }) => `${from}–${to} จาก ${count}`}
                    sx={{
                      color: "#94a3b8",
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                      "& .MuiTablePagination-toolbar": { minHeight: 44, px: 1 },
                      "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": { fontSize: "0.78rem" },
                      "& .MuiTablePagination-selectIcon": { color: "#64748b" },
                      "& .MuiIconButton-root": { color: "#64748b" },
                      "& .MuiIconButton-root.Mui-disabled": { color: "rgba(255,255,255,0.1)" },
                    }}
                  />
                </Box>
              </CardContent>
            </Card>
          </Stack>
        </Container>
      </Box>

      <Drawer
        anchor="right"
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        slotProps={{
          paper: {
            sx: {
              width: { xs: "100vw", sm: 720, md: 800 },
              bgcolor: "#0d1321",
              color: "#e2e8f0",
              borderLeft: "1px solid rgba(251,191,36,0.18)",
              backgroundImage: "none",
            },
          },
        }}
      >
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
          
          {/* Header */}
          <Stack
            direction="row"
            spacing={1.5}
            sx={{
              alignItems: "center",
              justifyContent: "space-between",
              px: 3,
              py: 2.25,
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
              <Box sx={{ p: 0.8, borderRadius: 2, bgcolor: "rgba(251,191,36,0.1)", display: "flex", color: "#fbbf24" }}>
                <SettingsIcon size={18} />
              </Box>
              <Box>
                <Typography variant="h6" sx={{ color: "#fff", fontWeight: 650, lineHeight: 1.15 }}>
                  ตั้งค่าบอททองคำ
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  กลยุทธ์ ขนาดไม้ และการยืนยันออเดอร์
                </Typography>
              </Box>
            </Stack>
            <Button
              variant="text"
              color="inherit"
              onClick={() => setSettingsOpen(false)}
              sx={{ minWidth: 38, width: 38, height: 38, p: 0, borderRadius: 2 }}
            >
              <X size={18} />
            </Button>
          </Stack>

          {/* Body */}
          <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 3 }}>
            <Stack spacing={2.5}>
              
              {/* Gold Symbols */}
              <Box sx={{ p: 2, bgcolor: "rgba(251,191,36,0.03)", border: "1px solid rgba(251,191,36,0.1)", borderRadius: 1 }}>
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                    <Filter size={18} color="#fbbf24" />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 650, color: "#fff" }}>
                        สัญลักษณ์ทองคำที่ต้องการเทรด
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        แนะนำให้กด สแกน MT5 เพื่อดึงชื่อที่ถูกต้องจากโบรกเกอร์ (เช่น GOLD, XAUUSD)
                      </Typography>
                    </Box>
                  </Stack>

                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <TextField
                      fullWidth
                      size="small"
                      value={newSymbolInput}
                      onChange={(e) => setNewSymbolInput(e.target.value.toUpperCase())}
                      placeholder="พิมพ์ค้นหาทองคำ เช่น GOLD, XAUUSD"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSymbol(newSymbolInput);
                        }
                      }}
                      sx={{
                        "& .MuiInputBase-root": {
                          height: 40,
                          bgcolor: "rgba(255,255,255,0.01)",
                          color: "#fff",
                          borderRadius: 1,
                          "& fieldset": { borderColor: "rgba(255,255,255,0.08)" },
                          "&:hover fieldset": { borderColor: "rgba(255,255,255,0.2) !important" },
                          "&.Mui-focused fieldset": { borderColor: "#fbbf24 !important" },
                        },
                        "& .MuiInputBase-input": { color: "#fff", fontSize: "0.9rem" },
                      }}
                    />
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => addSymbol(newSymbolInput)}
                      sx={{
                        height: 40,
                        fontWeight: 600,
                        px: 2.5,
                        minWidth: "fit-content",
                        bgcolor: "#fbbf24",
                        color: "#111827",
                        "&:hover": { bgcolor: "#f59e0b" },
                        borderRadius: 1,
                      }}
                    >
                      เพิ่ม
                    </Button>
                  </Stack>

                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 1 }}>
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={detecting}
                      onClick={detectGoldSymbols}
                      sx={{
                        height: 40,
                        borderColor: "rgba(251,191,36,0.25)",
                        color: "#fbbf24",
                        fontWeight: 600,
                        px: 2,
                        minWidth: "fit-content",
                        bgcolor: "rgba(251,191,36,0.04)",
                        "&:hover": { borderColor: "#fbbf24", bgcolor: "rgba(251,191,36,0.08)" },
                        "&.Mui-disabled": { color: "rgba(255,255,255,0.2)" },
                        borderRadius: 1,
                      }}
                    >
                      {detecting ? <CircularProgress size={16} color="inherit" /> : "สแกน MT5"}
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={validating}
                      onClick={validateGoldSymbols}
                      sx={{
                        height: 40,
                        borderColor: "rgba(52,211,153,0.25)",
                        color: "#34d399",
                        fontWeight: 600,
                        px: 2,
                        minWidth: "fit-content",
                        bgcolor: "rgba(52,211,153,0.04)",
                        "&:hover": { borderColor: "#10b981", bgcolor: "rgba(52,211,153,0.08)" },
                        "&.Mui-disabled": { color: "rgba(255,255,255,0.2)" },
                        borderRadius: 1,
                      }}
                    >
                      {validating ? <CircularProgress size={16} color="inherit" /> : "ตรวจสอบ"}
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => setGoldInput("")}
                      disabled={!goldInput}
                      sx={{
                        height: 40,
                        borderColor: "rgba(239,68,68,0.25)",
                        color: "#f87171",
                        fontWeight: 600,
                        px: 2,
                        minWidth: "fit-content",
                        bgcolor: "rgba(239,68,68,0.04)",
                        "&:hover": { borderColor: "#ef4444", bgcolor: "rgba(239,68,68,0.08)" },
                        "&.Mui-disabled": { color: "rgba(255,255,255,0.1)", borderColor: "rgba(255,255,255,0.05)" },
                        borderRadius: 1,
                      }}
                    >
                      ล้างทั้งหมด
                  </Button>
                  </Stack>

                  {/* Chips */}
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, pt: 0.5 }}>
                    {currentList.length === 0 ? (
                      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic", px: 0.5 }}>
                        ยังไม่มีสัญลักษณ์ทองในรายการสแกน
                      </Typography>
                    ) : (
                      currentList.map((sym) => (
                        <Chip
                          key={sym}
                          label={sym}
                          onDelete={() => removeSymbol(sym)}
                          size="small"
                          sx={{
                            bgcolor: "rgba(251,191,36,0.08)",
                            color: "#fff",
                            border: "1px solid rgba(251,191,36,0.2)",
                            fontWeight: 700,
                            borderRadius: 1,
                            "& .MuiChip-deleteIcon": {
                              color: "rgba(255,255,255,0.4)",
                              transition: "color 0.2s",
                              "&:hover": { color: "#ef4444" },
                            },
                          }}
                        />
                      ))
                    )}
                  </Box>
                </Stack>
              </Box>

              {/* Timeframe + Interval */}
              <Box
                sx={{
                  p: 2,
                  bgcolor: "rgba(255,255,255,0.01)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 1,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    color: "#64748b",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    display: "block",
                    mb: 1.5,
                  }}
                >
                  การตั้งค่าการสแกน
                </Typography>
                <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel sx={{ color: "#94a3b8" }}>Timeframe</InputLabel>
                    <Select
                      label="Timeframe"
                      value={settings.default_timeframe || "M15"}
                      onChange={(e) => patchSettings({ default_timeframe: e.target.value })}
                      sx={{
                        bgcolor: "rgba(255,255,255,0.01)",
                        "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.08)" },
                        "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.2) !important" },
                        "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#fbbf24 !important" },
                        "& .MuiSelect-select": { color: "#fff" }
                      }}
                    >
                      {[
                        { v: "M1", l: "M1 — 1 นาที" },
                        { v: "M5", l: "M5 — 5 นาที" },
                        { v: "M15", l: "M15 — 15 นาที" },
                        { v: "M30", l: "M30 — 30 นาที" },
                        { v: "H1", l: "H1 — 1 ชั่วโมง" },
                        { v: "H4", l: "H4 — 4 ชั่วโมง" },
                        { v: "D1", l: "D1 — รายวัน" },
                      ].map(({ v, l }) => (
                        <MenuItem key={v} value={v}>
                          {l}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" fullWidth>
                    <InputLabel sx={{ color: "#94a3b8" }}>สแกนซ้ำทุก</InputLabel>
                    <Select
                      label="สแกนซ้ำทุก"
                      value={settings.auto_trade_interval || 60}
                      onChange={(e) => patchSettings({ auto_trade_interval: Number(e.target.value) })}
                      sx={{
                        bgcolor: "rgba(255,255,255,0.01)",
                        "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.08)" },
                        "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.2) !important" },
                        "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#fbbf24 !important" },
                        "& .MuiSelect-select": { color: "#fff" }
                      }}
                    >
                      {[
                        { v: 10, l: "10 วินาที" },
                        { v: 30, l: "30 วินาที" },
                        { v: 60, l: "1 นาที" },
                        { v: 300, l: "5 นาที" },
                        { v: 600, l: "10 นาที" },
                        { v: 900, l: "15 นาที" },
                      ].map(({ v, l }) => (
                        <MenuItem key={v} value={v}>
                          {l}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              </Box>

              {/* Max slots + Magic */}
              <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                <QuickNumberInput
                  label="ช่องเทรดทองสูงสุด"
                  value={settings.max_gold_open_trades || 3}
                  onChange={(val) => patchSettings({ max_gold_open_trades: val })}
                  step={1}
                  min={1}
                  precision={0}
                />
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 600, px: 0.5 }}>
                    Gold Magic Number
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <input
                      type="text"
                      value={settings.gold_magic ?? 556688}
                      onChange={(e) => patchSettings({ gold_magic: parseInt(e.target.value, 10) || 0 })}
                      style={{
                        flexGrow: 1,
                        height: 40,
                        borderRadius: 8,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.01)",
                        color: "#fff",
                        padding: "0 12px",
                        fontFamily: "ui-monospace, monospace",
                        fontWeight: 600,
                        outline: "none",
                        fontSize: "1rem",
                      }}
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => patchSettings({ gold_magic: Math.floor(100000 + Math.random() * 900000) })}
                      sx={{
                        height: 40,
                        borderColor: "rgba(255,255,255,0.08)",
                        color: "#94a3b8",
                        fontWeight: 600,
                        px: 1.5,
                        minWidth: "fit-content",
                        "&:hover": { borderColor: "rgba(255,255,255,0.2)", color: "#fff" },
                        borderRadius: 1,
                      }}
                    >
                      สุ่มเลข
                    </Button>
                  </Stack>
                </Box>
              </Box>

              {/* Risk + RR */}
              <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                <QuickNumberInput
                  label="ความเสี่ยงต่อไม้ (% Risk)"
                  value={Math.round((settings.risk_per_trade || 0.01) * 10000) / 100}
                  onChange={(val) => patchSettings({ risk_per_trade: Math.max(0, val) / 100 })}
                  step={0.1}
                  min={0}
                  precision={2}
                />
                <QuickNumberInput
                  label="R:R เป้ากำไร (เท่า)"
                  value={settings.default_rr || 2}
                  onChange={(val) => patchSettings({ default_rr: val })}
                  step={0.1}
                  min={0.1}
                  precision={1}
                />
              </Box>

              {/* Strategy + Lot */}
              <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, width: "100%" }}>
                  <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 600, px: 0.5 }}>
                    กลยุทธ์ที่ใช้
                  </Typography>
                  <Select
                    size="small"
                    fullWidth
                    value={settings.strategy || "ema_macd_rsi"}
                    onChange={(e) => patchSettings({ strategy: e.target.value })}
                    sx={{
                      height: 40,
                      borderRadius: 2,
                      bgcolor: "rgba(255,255,255,0.01)",
                      "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.08)" },
                      "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.2) !important" },
                      "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#fbbf24 !important" },
                      "& .MuiSelect-select": { color: "#fff" }
                    }}
                  >
                    {(strategies.length ? strategies : [{ name: "ema_macd_rsi", description: "" }]).map((s) => (
                      <MenuItem key={s.name} value={s.name}>
                        {strategyLabel(s.name)}
                      </MenuItem>
                    ))}
                  </Select>
                </Box>
                <QuickNumberInput
                  label="ขนาด Lot สูงสุด"
                  value={settings.max_lot || 1}
                  onChange={(val) => patchSettings({ max_lot: Math.max(0.01, val) })}
                  step={0.01}
                  min={0.01}
                  precision={2}
                />
              </Box>

              {/* switches */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  px: 2,
                  py: 1.5,
                  bgcolor: "rgba(255,255,255,0.01)",
                  border: "1px solid rgba(255,255,255,0.03)",
                  borderRadius: 1,
                }}
              >
                <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                  <Box
                    sx={{
                      color: settings.gold_bot_enabled ? "#10b981" : "#ef4444",
                      display: "flex",
                      p: 0.5,
                      borderRadius: 1.5,
                      bgcolor: settings.gold_bot_enabled ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                    }}
                  >
                    {settings.gold_bot_enabled ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 650, color: "#fff" }}>
                      {settings.gold_bot_enabled ? "เปิดบอททองอัตโนมัติ" : "ปิดบอททองอัตโนมัติ"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {settings.gold_bot_enabled ? "บอทจะสแกนและส่งออเดอร์เฉพาะทองตามรอบ" : "หยุด auto trade เฉพาะทอง แต่ยังวิเคราะห์มือได้"}
                    </Typography>
                  </Box>
                </Stack>
                <Switch
                  checked={settings.gold_bot_enabled ?? true}
                  onChange={(e) => patchSettings({ gold_bot_enabled: e.target.checked })}
                  color="success"
                />
              </Box>

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  px: 2,
                  py: 1.5,
                  bgcolor: "rgba(255,255,255,0.01)",
                  border: "1px solid rgba(255,255,255,0.03)",
                  borderRadius: 1,
                }}
              >
                <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                  <Box
                    sx={{
                      color: settings.use_ai ? "#3b82f6" : "#64748b",
                      display: "flex",
                      p: 0.5,
                      borderRadius: 1.5,
                      bgcolor: settings.use_ai ? "rgba(59,130,246,0.08)" : "rgba(255,255,255,0.03)",
                    }}
                  >
                    {settings.use_ai ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 650, color: "#fff" }}>
                      {settings.use_ai ? "เปิดให้ AI ตรวจซ้ำ" : "ใช้กลยุทธ์อย่างเดียว"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {settings.use_ai ? "AI ต้องเห็นด้วยก่อนส่งสัญญาณซื้อ/ขาย" : "บอทจะทำตามกลยุทธ์ที่เลือกโดยตรง"}
                    </Typography>
                  </Box>
                </Stack>
                <Switch
                  checked={settings.use_ai ?? false}
                  onChange={(e) => patchSettings({ use_ai: e.target.checked })}
                  color="primary"
                />
              </Box>
            </Stack>
          </Box>

          <Box sx={{ p: 3, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <Button
              variant="contained"
              fullWidth
              onClick={saveGoldSettings}
              disabled={saving}
              startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <Save size={18} />}
              sx={{
                py: 1.5,
                fontWeight: 650,
                bgcolor: "#fbbf24",
                color: "#111827",
                "&:hover": { bgcolor: "#f59e0b" },
                boxShadow: "0 4px 12px rgba(251,191,36,0.2)",
                borderRadius: 2,
              }}
            >
              บันทึกการตั้งค่า
            </Button>
          </Box>
        </Box>
      </Drawer>

      <Dialog open={logOpen} onClose={() => setLogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <ScrollText size={18} />
            <Typography sx={{ fontWeight: 800 }}>Bot Activity Log</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <BotLog fetchLogs={async () => (await api("logs?limit=200")).logs || []} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(closeCandidate)}
        onClose={() => {
          if (!closingTicket) setCloseCandidate(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Confirm Close Gold Position</DialogTitle>
        <DialogContent dividers>
          {closeCandidate && (
            <Stack spacing={1.25}>
              <Alert severity={closeCandidate.profit >= 0 ? "success" : "warning"}>
                ต้องการปิด {closeCandidate.symbol} position นี้ใช่ไหม?
              </Alert>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1 }}>
                {[
                  ["Type", closeCandidate.type],
                  ["Volume", `${fmt(closeCandidate.volume, 2)} lot`],
                  ["Open", fmt(closeCandidate.price_open, 2)],
                  ["Current", fmt(closeCandidate.price_current, 2)],
                  ["P/L", `${closeCandidate.profit >= 0 ? "+" : ""}${fmt(closeCandidate.profit)}`],
                  ["Ticket", String(closeCandidate.ticket)],
                ].map(([label, value]) => (
                  <Box key={label} sx={{ p: 1.25, borderRadius: 1, bgcolor: "rgba(15,23,42,0.75)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography sx={{ ...MONO, fontWeight: 800 }}>{value}</Typography>
                  </Box>
                ))}
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={Boolean(closingTicket)} onClick={() => setCloseCandidate(null)}>
            ยกเลิก
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={Boolean(closingTicket) || !closeCandidate}
            onClick={async () => {
              if (!closeCandidate) return;
              const ticket = closeCandidate.ticket;
              setCloseCandidate(null);
              await closePosition(ticket);
            }}
            startIcon={closingTicket ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            ปิด Position
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(tradeConfirm)}
        onClose={() => {
          if (!tradeExecuting) {
            setTradeConfirm(null);
          }
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Confirm {tradeConfirm ? actionLabel(tradeConfirm.action) : ""} Gold Trade</DialogTitle>
        <DialogContent dividers>
          {tradeConfirm && (
            <Stack spacing={1.25}>
              <Alert severity={tradeConfirm.action === "BUY" ? "success" : "error"}>
                เปิด {tradeConfirm.symbol} เป็น {actionLabel(tradeConfirm.action)} ตามสัญญาณล่าสุด?
              </Alert>
              {positions.some((p) => p.symbol.toUpperCase() === tradeConfirm.symbol.toUpperCase()) && (
                <Alert severity="warning">
                  มี position {tradeConfirm.symbol} เปิดอยู่แล้ว — ถ้ายืนยันจะเปิดเพิ่มอีก order
                </Alert>
              )}
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1 }}>
                {[
                  ["Price", fmt(tradeConfirm.price, 2)],
                  ["Lot", fmt(tradeConfirm.suggested_lot, 2)],
                  ["Stop Loss", fmt(tradeConfirm.stop_loss, 2)],
                  ["Take Profit", fmt(tradeConfirm.take_profit, 2)],
                  ["Confidence", `${Math.round(tradeConfirm.confidence * 100)}%`],
                  ["Timeframe", tradeConfirm.timeframe],
                ].map(([label, value]) => (
                  <Box key={label} sx={{ p: 1.25, borderRadius: 1, bgcolor: "rgba(15,23,42,0.75)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography sx={{ ...MONO, fontWeight: 800 }}>{value}</Typography>
                  </Box>
                ))}
              </Box>
              {tradeConfirm.summary && <Typography variant="body2" color="text.secondary">{tradeConfirm.summary}</Typography>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            disabled={tradeExecuting}
            onClick={() => {
              setTradeConfirm(null);
            }}
          >
            ยกเลิก
          </Button>
          <Button
            color={tradeConfirm?.action === "BUY" ? "success" : "error"}
            variant="contained"
            disabled={tradeExecuting}
            onClick={confirmTrade}
            startIcon={tradeExecuting ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {refreshing && (
        <Box sx={{ position: "fixed", right: 16, bottom: 16, display: "flex", alignItems: "center", gap: 1, color: "#94a3b8" }}>
          <RefreshCw size={14} />
          <Typography variant="caption">syncing</Typography>
        </Box>
      )}
    </Box>
  );
}
