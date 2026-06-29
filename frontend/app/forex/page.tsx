"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToastr } from "../components/Toastr";
import Sidebar, { SIDEBAR_W } from "../components/Sidebar";
import TopBar from "../components/TopBar";
import BotLog from "../crypto/components/BotLog";
import PnLChart from "../crypto/components/PnLChart";
import { isCryptoSymbol, isMetalSymbol, isForexSymbol } from "../lib/symbols";
import HistoryTable from "../components/HistoryTable";
import ForexBotSettings from "./components/ForexBotSettings";
import {
  Alert,
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
  IconButton,
  LinearProgress,
  MenuItem,
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
  BarChart2,
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
  Info,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const STRATEGY_CONDITIONS: Record<string, { label: string; buy: string[]; sell: string[]; note?: string }> = {
  ema_macd_rsi: { label: "EMA + MACD + RSI",
    buy:  ["EMA12 สูงกว่า EMA26 — แนวโน้มขาขึ้น (40%)", "MACD Histogram > 0 — momentum เป็นบวก (35%)", "RSI < 45 — ยังไม่ overbought (25%)"],
    sell: ["EMA12 ต่ำกว่า EMA26 — แนวโน้มขาลง (40%)", "MACD Histogram < 0 — momentum เป็นลบ (35%)", "RSI > 55 — ยังไม่ oversold (25%)"],
    note: "สัญญาณออกเมื่อ weighted score รวมเกิน 22% — ต้องการหลายอย่างพร้อมกัน" },
  trend: { label: "Trend Follow",
    buy:  ["ราคาอยู่เหนือ EMA50 (45%)", "EMA50 มีความชันขึ้น — เทรนด์แข็งแกร่ง (30%)", "MACD Histogram > 0 — ยืนยัน momentum (25%)"],
    sell: ["ราคาอยู่ใต้ EMA50 (45%)", "EMA50 มีความชันลง (30%)", "MACD Histogram < 0 (25%)"],
    note: "เหมาะกับตลาดที่มีทิศทางชัด threshold 28%" },
  mean_reversion: { label: "Mean Reversion",
    buy:  ["ราคาต่ำกว่า Bollinger Band midpoint (55%)", "RSI < 40 — oversold คาดเด้งกลับ (45%)"],
    sell: ["ราคาสูงกว่า Bollinger Band midpoint (55%)", "RSI > 60 — overbought คาดย้อนกลับ (45%)"],
    note: "TP คือ Bollinger midpoint — เหมาะตลาดไซด์เวย์ threshold 32%" },
  breakout: { label: "Breakout",
    buy:  ["ราคาทะลุสูงสุดของ 20 แท่งก่อนหน้า (65%)", "MACD Histogram > 0 — ยืนยัน momentum (35%)"],
    sell: ["ราคาทะลุต่ำสุดของ 20 แท่งก่อนหน้า (65%)", "MACD Histogram < 0 (35%)"],
    note: "threshold สูงที่สุด 35% — ต้องทะลุชัดเจน ระวัง false breakout" },
};

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
  sl: number;
  tp: number;
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
  entry_price?: number | null;
  pct?: number | null;
  magic: number;
  comment: string;
};

type StrategyInfo = {
  name: string;
  description: string;
  groups?: string[];
};

// Keep strategies whose `groups` include this page's asset group. Missing
// `groups` (older backend) means "all groups", so don't filter it out.
function strategiesForGroup(list: StrategyInfo[], group: string): StrategyInfo[] {
  return list.filter((s) => !s.groups || s.groups.includes(group));
}

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
const fmtP = (n: number | null | undefined): string => {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  if (v >= 10000) return Math.round(v).toLocaleString("en-US");
  if (v >= 1000)  return v.toFixed(1);
  if (v >= 100)   return v.toFixed(2);
  if (v >= 1)     return v.toFixed(3);
  if (v >= 0.01)  return v.toFixed(5);
  return v.toFixed(7);
};
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


const getForexDecimals = (sym: string) => sym.toUpperCase().includes("JPY") ? 3 : 5;

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
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 }, display: { xs: "none", md: "block" } }}>
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
      <CardContent sx={{ p: 1.25, "&:last-child": { pb: 1.25 }, display: { xs: "block", md: "none" } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Box sx={{ color: tone, display: "flex", flexShrink: 0, opacity: 0.7 }}>{icon}</Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontSize: "0.6rem", fontWeight: 700, color: "#64748b", lineHeight: 1.2, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {label}
            </Typography>
            <Typography noWrap sx={{ ...MONO, color: tone, fontSize: "1.05rem", fontWeight: 800, lineHeight: 1.2, mt: 0.15 }}>
              {value}
            </Typography>
          </Box>
        </Stack>
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
            borderColor: "#06b6d4",
            boxShadow: "0 0 0 1px rgba(6,182,212,0.18)",
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

export default function ForexPage() {
  const toastr = useToastr();

  const [account, setAccount] = useState<Account | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<HistoryDeal[]>([]);
  const [ticks, setTicks] = useState<Record<string, Tick>>({});
  const [settings, setSettings] = useState<any>({ symbols: "" });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [forexInput, setForexInput] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [priceSearch, setPriceSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const FOREX_TF_DEFAULTS: Record<string, number> = { M15: 3, M30: 5, H1: 15, H4: 30, D1: 60 };
  const [forexScanMins, setForexScanMinsRaw] = useState<number>(30);
  const setForexScanMins = useCallback((v: number) => {
    setForexScanMinsRaw(v);
    localStorage.setItem("forex_scan_mins", String(v));
  }, []);
  useEffect(() => {
    const saved = localStorage.getItem("forex_scan_mins");
    if (saved) { setForexScanMinsRaw(parseInt(saved, 10) || 30); return; }
    if (settings.forex_timeframe) setForexScanMins(FOREX_TF_DEFAULTS[settings.forex_timeframe] ?? 30);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.forex_timeframe]);
  const [forexFilterType, setForexFilterType] = useState<string>("major");
  const handleSetForexFilterType = useCallback((v: string) => {
    setForexFilterType(v);
    localStorage.setItem("forex_filter_type", v);
  }, []);
  useEffect(() => {
    const saved = localStorage.getItem("forex_filter_type");
    if (saved) setForexFilterType(saved);
  }, []);
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
  const [symbolPage, setSymbolPage] = useState(0);
  const [symbolRowsPerPage, setSymbolRowsPerPage] = useState(10);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyRowsPerPage, setHistoryRowsPerPage] = useState(10);

  // Mobile collapse state — collapsed by default on mobile
  const [priceTableOpen, setPriceTableOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const forexSymbols = useMemo(() => {
    const fromConfig: string[] = (settings.symbols || "")
      .split(",")
      .map((s: string) => s.trim().toUpperCase())
      .filter(Boolean)
      .filter(isForexSymbol);
    return Array.from(new Set<string>(fromConfig)).sort((a, b) => a.localeCompare(b));
  }, [settings.symbols]);

  const filteredForexSymbols = useMemo(() => {
    const q = priceSearch.trim().toUpperCase();
    return q ? forexSymbols.filter((s) => s.toUpperCase().includes(q)) : forexSymbols;
  }, [forexSymbols, priceSearch]);

  const forexPositions = useMemo(
    () => positions.filter((p) => isForexSymbol(p.symbol)),
    [positions]
  );
  const forexHistory = useMemo(
    () => history.filter((h) => isForexSymbol(h.symbol)),
    [history]
  );
  const forexOpenPl = forexPositions.reduce((sum, p) => sum + (Number(p.profit) || 0), 0);
  const _fBotMagics = new Set([settings.forex_magic, settings.magic, settings.gold_magic, settings.stock_magic].filter(Boolean));
  const forexClosedHistory = forexHistory.filter((h) => h.entry === "OUT");
  const botForexOpenPl = forexPositions.filter((p) => _fBotMagics.has(p.magic)).reduce((sum, p) => sum + (Number(p.profit) || 0), 0);
  const manualForexOpenPl = forexPositions.filter((p) => !_fBotMagics.has(p.magic)).reduce((sum, p) => sum + (Number(p.profit) || 0), 0);
  const realizedForexPl = forexClosedHistory.reduce((sum, h) => sum + (Number(h.profit) || 0), 0);
  const botRealizedForexPl = forexClosedHistory.filter((h) => _fBotMagics.has(h.magic)).reduce((sum, h) => sum + (Number(h.profit) || 0), 0);
  const manualRealizedForexPl = forexClosedHistory.filter((h) => !_fBotMagics.has(h.magic)).reduce((sum, h) => sum + (Number(h.profit) || 0), 0);
  const forexSlotLimit = settings.max_forex_open_trades ?? settings.max_open_trades ?? 5;
  const forexBotActive = Boolean(settings.forex_bot_enabled);
  const botForexUsage = forexSlotLimit ? Math.min(100, (forexPositions.length / Math.max(1, forexSlotLimit)) * 100) : 0;
  const historyPageStart = historyPage * historyRowsPerPage;
  const paginatedForexHistory = forexHistory.slice(historyPageStart, historyPageStart + historyRowsPerPage);

  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(forexHistory.length / historyRowsPerPage) - 1);
    if (historyPage > maxPage) setHistoryPage(maxPage);
  }, [forexHistory.length, historyRowsPerPage, historyPage]);

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
        setSettingsLoaded(true);
        const cfgForex = (cfg.symbols || "")
          .split(",")
          .map((s: string) => s.trim().toUpperCase())
          .filter(Boolean)
          .filter(isForexSymbol);
        setForexInput(cfgForex.join(", "));
      }
      setStrategies(strat.strategies || []);
      setHistory(hist.history || []);
    } catch (e: any) {
      setConnected(false);
      toastr.error(`โหลดข้อมูลหน้าเทรด Forex ไม่สำเร็จ: ${e.message}`);
    } finally {
      setRefreshing(false);
    }
  }, [toastr]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!forexSymbols.length) return;
    setSelectedSymbol((prev) => (prev && forexSymbols.includes(prev) ? prev : forexSymbols[0]));
  }, [forexSymbols]);

  useEffect(() => {
    if (!forexSymbols.length) return;
    let active = true;
    const loadTicks = async () => {
      try {
        const data = await api(`ticks?symbols=${encodeURIComponent(forexSymbols.join(","))}`);
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
  }, [forexSymbols]);

  const runScan = useCallback(async (notify = true) => {
    if (!forexSymbols.length) return;
    setScanLoading(true);
    try {
      const data = await api("scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: forexSymbols,
          timeframe: settings.forex_timeframe || settings.default_timeframe,
          strategy: settings.forex_strategy || settings.strategy,
          bars: 220,
        }),
      });
      setScanResults(data.results || []);
      if (notify) toastr.success("สแกนสัญญาณ Forex เรียบร้อย");
    } catch (e: any) {
      if (notify) toastr.error(`สแกน Forex ไม่สำเร็จ: ${e.message}`);
    } finally {
      setScanLoading(false);
    }
  }, [forexSymbols, settings.default_timeframe, settings.strategy, toastr]);

  useEffect(() => {
    if (!forexSymbols.length) {
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
    const intervalId = setInterval(refreshSignals, forexScanMins * 60_000);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [forexSymbols.join(","), settings.forex_timeframe, settings.strategy, runScan, forexScanMins]);

  async function stageTrade(symbol: string) {
    setTradeStagingSymbol(symbol);
    try {
      const data = await api("analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          timeframe: settings.forex_timeframe || settings.default_timeframe,
          bars: 220,
          strategy: settings.forex_strategy || settings.strategy,
          use_ai: settings.forex_use_ai ?? settings.use_ai,
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
      toastr.error(`วิเคราะห์ Forex ไม่สำเร็จ: ${e.message}`);
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
      toastr.success(`เปิดออเดอร์ Forex ${tradeConfirm.symbol} ${actionLabel(tradeConfirm.action)} แล้ว`);
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
      toastr.success("ปิด position Forex แล้ว");
      refresh();
    } catch (e: any) {
      toastr.error(`ปิด position ไม่สำเร็จ: ${e.message}`);
    } finally {
      setClosingTicket(null);
    }
  }

  async function detectForexSymbols(filterType: any = "major") {
    const type = typeof filterType === "string" ? filterType : "major";
    setDetecting(true);
    try {
      // Try detect-forex endpoint first; fall back to /api/symbols filtered manually
      let detected: string[] = [];
      try {
        const data = await api(`symbols/detect-forex?filter_type=${type}`);
        detected = (data.symbols || []).map((s: string) => s.trim().toUpperCase()).filter(isForexSymbol);
      } catch {
        const data = await api("symbols");
        const all: string[] = (data.symbols || []).map((s: string) => s.trim().toUpperCase());
        detected = all.filter(isForexSymbol);
      }
      if (detected.length) {
        setForexInput(detected.join(", "));
        toastr.success(`ตรวจพบคู่เงิน Forex ${detected.length} รายการ`);
      } else {
        toastr.warning("ไม่พบคู่เงิน Forex ใน MT5 ของโบรกเกอร์นี้");
      }
    } catch (e: any) {
      toastr.error(`สแกนคู่เงิน Forex ไม่สำเร็จ: ${e.message}`);
    } finally {
      setDetecting(false);
    }
  }

  async function validateForexSymbols() {
    const list = forexInput.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!list.length) return;
    setValidating(true);
    try {
      const data = await api("symbols/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: list }),
      });
      const valid = (data.valid || []).filter(isForexSymbol);
      setForexInput(valid.join(", "));
      if (data.invalid?.length) toastr.warning(`กรองออก ${data.invalid.length} symbols ที่ MT5 ใช้ไม่ได้`);
      else toastr.success("คู่เงิน Forex ทั้งหมดใช้งานได้");
    } catch (e: any) {
      toastr.error(`ตรวจสอบ symbol ไม่สำเร็จ: ${e.message}`);
    } finally {
      setValidating(false);
    }
  }

  async function saveForexSettings() {
    const nextForex = forexInput.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    const current = (settings.symbols || "").split(",").map((s: string) => s.trim()).filter(Boolean);
    const keep = current.filter((s: string) => !isForexSymbol(s));
    const nextSymbols = Array.from(new Set([...keep, ...nextForex])).join(",");
    setSaving(true);
    try {
      const next = {
        symbols: nextSymbols,
        forex_bot_enabled: settings.forex_bot_enabled,
        forex_magic: settings.forex_magic,
        max_forex_open_trades: settings.max_forex_open_trades,
        forex_timeframe: settings.forex_timeframe,
        forex_strategy: settings.forex_strategy,
        forex_risk_per_trade: settings.forex_risk_per_trade,
        forex_max_lot: settings.forex_max_lot,
        forex_atr_sl_mult: settings.forex_atr_sl_mult,
        forex_rr: settings.forex_rr,
        forex_use_ai: settings.forex_use_ai,
        forex_auto_trade_interval: settings.forex_auto_trade_interval,
        telegram_enabled: settings.telegram_enabled,
      };
      await api("settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const fresh = await api("settings");
      setSettings(fresh);
      const cfgForex = (fresh.symbols || "")
        .split(",")
        .map((s: string) => s.trim().toUpperCase())
        .filter(Boolean)
        .filter(isForexSymbol);
      setForexInput(cfgForex.length ? cfgForex.join(", ") : "EURUSD,GBPUSD,USDJPY,AUDUSD");
      setSettingsOpen(false);
      toastr.success("บันทึกการตั้งค่าบอท Forex แล้ว");
      refresh();
    } catch (e: any) {
      toastr.error(`บันทึกการตั้งค่าไม่สำเร็จ: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  const handleDirectChangeStrategy = async (newStrat: string) => {
    try {
      const next = {
        ...settings,
        forex_strategy: newStrat,
      };
      await api("settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      setSettings(next);
      toastr.success("เปลี่ยนกลยุทธ์สำเร็จ");
    } catch (e: any) {
      toastr.error(`เปลี่ยนกลยุทธ์ไม่สำเร็จ: ${e.message}`);
    }
  };

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
      <Box sx={{ ml: { xs: 0, md: `${SIDEBAR_W}px` }, pb: { xs: "72px", md: 0 } }}>
        <TopBar
          pageTitle="Forex Terminal"
          pageIcon={<BarChart2 size={18} />}
          connected={connected}
          accountLogin={account?.login}
          balance={account?.balance}
          equity={account?.equity}
          currency={account?.currency || "USD"}
          openPl={forexOpenPl}
          botEnabled={forexBotActive}
          strategy={settings.forex_strategy || settings.strategy || ""}
          aiEnabled={settings.forex_use_ai}
          assetType="forex"
          onChangeStrategy={handleDirectChangeStrategy}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <Container maxWidth={false} sx={{ py: 2.5, px: { xs: 1.5, md: 2.5 } }}>
          <Stack spacing={2.5}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, minmax(0, 1fr))" },
                gap: { xs: 0.75, md: 1.5 },
              }}
            >
              <StatCard
                icon={<BarChart2 size={18} />}
                label="Forex Pairs"
                value={forexSymbols.length}
                tone="#06b6d4"
                sub={forexSymbols.length ? `${forexSymbols.length} symbols` : "ยังไม่ได้ตั้งค่า"}
              />
              <StatCard
                icon={<Activity size={18} />}
                label="Open Forex P/L"
                value={`${forexOpenPl >= 0 ? "+" : ""}${fmt(forexOpenPl)} ${account?.currency || ""}`}
                tone={forexOpenPl >= 0 ? "#10b981" : "#ef4444"}
                sub={
                  <Box sx={{ mt: 0.5 }}>
                    <Typography variant="caption" sx={{ color: "#22d3ee", display: "block", lineHeight: 1.5 }}>
                      Bot: {botForexOpenPl >= 0 ? "+" : ""}{fmt(botForexOpenPl)}
                    </Typography>
                    {manualForexOpenPl !== 0 && (
                      <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", lineHeight: 1.5 }}>
                        Manual: {manualForexOpenPl >= 0 ? "+" : ""}{fmt(manualForexOpenPl)}
                      </Typography>
                    )}
                    <Typography variant="caption" sx={{ color: "#64748b", display: "block", lineHeight: 1.5 }}>
                      {forexPositions.length} positions
                    </Typography>
                  </Box>
                }
              />
              <StatCard
                icon={<History size={18} />}
                label="Realized 7D"
                value={`${realizedForexPl >= 0 ? "+" : ""}${fmt(realizedForexPl)} ${account?.currency || ""}`}
                tone={realizedForexPl >= 0 ? "#10b981" : "#ef4444"}
                sub={
                  <Box sx={{ mt: 0.5 }}>
                    <Typography variant="caption" sx={{ color: "#22d3ee", display: "block", lineHeight: 1.5 }}>
                      Bot: {botRealizedForexPl >= 0 ? "+" : ""}{fmt(botRealizedForexPl)}
                    </Typography>
                    {manualRealizedForexPl !== 0 && (
                      <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", lineHeight: 1.5 }}>
                        Manual: {manualRealizedForexPl >= 0 ? "+" : ""}{fmt(manualRealizedForexPl)}
                      </Typography>
                    )}
                    <Typography variant="caption" sx={{ color: "#64748b", display: "block", lineHeight: 1.5 }}>
                      {forexClosedHistory.length} closed deals
                    </Typography>
                  </Box>
                }
              />
              <StatCard
                icon={<Gauge size={18} />}
                label="Forex Capacity"
                value={`${forexPositions.length}/${forexSlotLimit || 0}`}
                tone="#22d3ee"
                sub={
                  <Box>
                    <LinearProgress variant="determinate" value={botForexUsage} sx={{ mt: 0.75, height: 5, borderRadius: 99, "& .MuiLinearProgress-bar": { bgcolor: "#06b6d4" } }} />
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                      Max Forex slots: {forexSlotLimit || 0}
                    </Typography>
                  </Box>
                }
              />
            </Box>

            {/* Scan info bar */}
            {(() => {
              const TF_MINS: Record<string, number> = { M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440 };
              const tf = settings.forex_timeframe || "H4";
              const tradeMins = TF_MINS[tf] ?? 240;
              const stratKey = settings.forex_strategy || settings.strategy;
              const cond = STRATEGY_CONDITIONS[stratKey];
              return (
                <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2, px: 0.5, flexWrap: "wrap" }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.6, px: 1.25, py: 0.5, borderRadius: 99, bgcolor: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)" }}>
                      <Zap size={12} color="#22d3ee" />
                      <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, color: "#22d3ee", whiteSpace: "nowrap" }}>สแกน Signal ทุก {forexScanMins} นาที</Typography>
                    </Box>
                    <Typography sx={{ fontSize: "0.65rem", color: "#334155" }}>·</Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.6, px: 1.25, py: 0.5, borderRadius: 99, bgcolor: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.18)" }}>
                      <TrendingUp size={12} color="#10b981" />
                      <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, color: "#10b981", whiteSpace: "nowrap" }}>ซื้อขายได้ทุก {tradeMins >= 60 ? `${tradeMins / 60} ชม.` : `${tradeMins} นาที`} ({tf})</Typography>
                    </Box>
                  </Stack>
                  {cond && (
                    <Button size="small" variant="text" startIcon={<Info size={13} />} onClick={() => setConditionsOpen(true)}
                      sx={{ fontSize: "0.72rem", color: "#475569", px: 1, py: 0.4, minWidth: 0, "&:hover": { color: "#94a3b8", bgcolor: "rgba(255,255,255,0.04)" } }}>
                      เงื่อนไขเข้าเทรด
                    </Button>
                  )}
                </Box>
              );
            })()}

            {/* Conditions Modal */}
            {(() => {
              const stratKey = settings.forex_strategy || settings.strategy;
              const cond = STRATEGY_CONDITIONS[stratKey];
              if (!cond) return null;
              return (
                <Dialog open={conditionsOpen} onClose={() => setConditionsOpen(false)} maxWidth="sm" fullWidth
                  slotProps={{ paper: { sx: { bgcolor: "#0d1321", border: "1px solid rgba(6,182,212,0.2)", backgroundImage: "none" } } }}>
                  <DialogTitle sx={{ pb: 1 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Info size={16} color="#22d3ee" />
                      <Box>
                        <Typography sx={{ fontWeight: 800, color: "#f1f5f9", fontSize: "0.95rem" }}>เงื่อนไขการเข้าเทรด — {cond.label}</Typography>
                        <Typography variant="caption" sx={{ color: "#475569" }}>{settings.forex_timeframe} · ATR SL ×{settings.forex_atr_sl_mult} · R:R {settings.forex_rr}</Typography>
                      </Box>
                    </Stack>
                  </DialogTitle>
                  <DialogContent dividers sx={{ borderColor: "rgba(255,255,255,0.07)", pt: 2 }}>
                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
                      <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.18)" }}>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 1 }}>
                          <ArrowUp size={14} color="#10b981" />
                          <Typography sx={{ fontSize: "0.75rem", fontWeight: 800, color: "#10b981" }}>BUY เมื่อ</Typography>
                        </Stack>
                        <Stack spacing={0.6}>{cond.buy.map((c, i) => (
                          <Stack key={i} direction="row" spacing={0.75} sx={{ alignItems: "flex-start" }}>
                            <Box sx={{ width: 4, height: 4, borderRadius: "50%", bgcolor: "#10b981", mt: 0.75, flexShrink: 0 }} />
                            <Typography variant="caption" sx={{ color: "#94a3b8", lineHeight: 1.55 }}>{c}</Typography>
                          </Stack>
                        ))}</Stack>
                      </Box>
                      <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.18)" }}>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 1 }}>
                          <ArrowDown size={14} color="#ef4444" />
                          <Typography sx={{ fontSize: "0.75rem", fontWeight: 800, color: "#ef4444" }}>SELL เมื่อ</Typography>
                        </Stack>
                        <Stack spacing={0.6}>{cond.sell.map((c, i) => (
                          <Stack key={i} direction="row" spacing={0.75} sx={{ alignItems: "flex-start" }}>
                            <Box sx={{ width: 4, height: 4, borderRadius: "50%", bgcolor: "#ef4444", mt: 0.75, flexShrink: 0 }} />
                            <Typography variant="caption" sx={{ color: "#94a3b8", lineHeight: 1.55 }}>{c}</Typography>
                          </Stack>
                        ))}</Stack>
                      </Box>
                    </Box>
                    {cond.note && (
                      <Box sx={{ mt: 1.5, px: 1.25, py: 0.75, bgcolor: "rgba(6,182,212,0.06)", borderRadius: 1, border: "1px solid rgba(6,182,212,0.15)" }}>
                        <Typography variant="caption" sx={{ color: "#22d3ee" }}>💡 {cond.note}</Typography>
                      </Box>
                    )}
                  </DialogContent>
                  <DialogActions sx={{ borderTop: "1px solid rgba(255,255,255,0.07)", px: 2 }}>
                    <Button size="small" onClick={() => setConditionsOpen(false)} sx={{ color: "#64748b" }}>ปิด</Button>
                  </DialogActions>
                </Dialog>
              );
            })()}

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.35fr 0.85fr" }, gap: 2 }}>
              <Card>
                <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    sx={{ alignItems: { xs: "stretch", md: "center" }, justifyContent: "space-between", gap: 1.5, p: 2, cursor: { xs: "pointer", md: "default" } }}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (window.innerWidth < 900 && !target.closest("input, button")) {
                        setPriceTableOpen((v) => !v);
                      }
                    }}
                  >
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <BarChart2 size={18} color="#06b6d4" />
                      <Box>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                          <Typography sx={{ fontWeight: 800 }}>คู่เงิน Forex</Typography>
                          <Box sx={{ display: { xs: "flex", md: "none" }, color: "#475569" }}>
                            {priceTableOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </Box>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          เลือก symbol แล้วให้บอทวิเคราะห์ก่อนส่งออเดอร์
                        </Typography>
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ display: { xs: priceTableOpen ? "flex" : "none", md: "flex" } }}>
                      <TextField
                        size="small"
                        value={priceSearch}
                        onChange={(e) => { setPriceSearch(e.target.value); setSymbolPage(0); }}
                        placeholder="ค้นหา EURUSD/GBPJPY"
                        sx={{ minWidth: 180 }}
                      />
                      <Button
                        variant="contained"
                        startIcon={scanLoading ? <CircularProgress size={16} color="inherit" /> : <Zap size={16} />}
                        disabled={scanLoading || forexSymbols.length === 0}
                        onClick={() => runScan(true)}
                        sx={{ bgcolor: "#06b6d4", "&:hover": { bgcolor: "#0891b2" } }}
                      >
                        สแกน
                      </Button>
                    </Stack>
                  </Stack>
                  <Box sx={{ display: priceTableOpen ? undefined : { xs: "none", md: "block" } }}>
                  {/* DESKTOP TABLE VIEW - sm and up */}
                  <Box sx={{ display: { xs: "none", sm: "block" }, overflowX: "auto" }}>
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
                        {!settingsLoaded ? (
                          <TableRow>
                            <TableCell colSpan={6} sx={{ textAlign: "center", py: 3 }}>
                              <CircularProgress size={20} sx={{ color: "#06b6d4" }} />
                            </TableCell>
                          </TableRow>
                        ) : filteredForexSymbols.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6}>
                              <Alert severity="warning">ยังไม่มีคู่เงิน Forex กดตั้งค่าแล้วสแกนจาก MT5 ได้เลย</Alert>
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredForexSymbols
                            .slice(symbolPage * symbolRowsPerPage, (symbolPage + 1) * symbolRowsPerPage)
                            .map((sym) => {
                              const tick = ticks[sym] ?? Object.entries(ticks).find(([k]) => k.toUpperCase() === sym.toUpperCase())?.[1];
                              const scan = scanResults.find((r) => r.symbol.toUpperCase() === sym.toUpperCase());
                              const hasPrice = tick && !tick.error && (tick.bid > 0 || tick.ask > 0);
                              const dec = getForexDecimals(sym);
                              const rowSpread = hasPrice ? Math.abs((tick.ask || 0) - (tick.bid || 0)) : null;
                              const selected = selectedSymbol === sym;
                              return (
                                <TableRow
                                  key={sym}
                                  hover
                                  onClick={() => setSelectedSymbol(sym)}
                                  sx={{
                                    cursor: "pointer",
                                    bgcolor: selected ? "rgba(6,182,212,0.08)" : "transparent",
                                    "& td": { borderBottomColor: "rgba(255,255,255,0.04)" },
                                  }}
                                >
                                  <TableCell>
                                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                      <BarChart2 size={15} color="#06b6d4" />
                                      <Typography sx={{ ...MONO, fontWeight: 800 }}>{sym}</Typography>
                                    </Stack>
                                  </TableCell>
                                  <TableCell align="right" sx={MONO}>{hasPrice ? fmt(tick!.bid, dec) : ""}</TableCell>
                                  <TableCell align="right" sx={MONO}>{hasPrice ? fmt(tick!.ask, dec) : ""}</TableCell>
                                  <TableCell align="right" sx={MONO}>{rowSpread !== null ? fmt(rowSpread, dec) : ""}</TableCell>
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
                                      sx={{ borderColor: "rgba(6,182,212,0.3)", color: "#22d3ee", "&:hover": { borderColor: "#06b6d4", bgcolor: "rgba(6,182,212,0.08)" } }}
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
                  </Box>

                  {/* MOBILE COMPACT LIST - xs only */}
                  <Box sx={{ display: { xs: "block", sm: "none" } }}>
                    {!settingsLoaded ? (
                      <Box sx={{ py: 4, textAlign: "center" }}>
                        <CircularProgress size={20} sx={{ color: "#06b6d4" }} />
                      </Box>
                    ) : filteredForexSymbols.length === 0 ? (
                      <Box sx={{ p: 2 }}>
                        <Alert severity="warning">ยังไม่มีคู่เงิน Forex กดตั้งค่าแล้วสแกนจาก MT5 ได้เลย</Alert>
                      </Box>
                    ) : (
                      filteredForexSymbols
                        .slice(symbolPage * symbolRowsPerPage, (symbolPage + 1) * symbolRowsPerPage)
                        .map((sym) => {
                          const tick = ticks[sym] ?? Object.entries(ticks).find(([k]) => k.toUpperCase() === sym.toUpperCase())?.[1];
                          const scan = scanResults.find((r) => r.symbol.toUpperCase() === sym.toUpperCase());
                          const hasPrice = tick && !tick.error && (tick.bid > 0 || tick.ask > 0);
                          const dec = getForexDecimals(sym);
                          const rowSpread = hasPrice ? Math.abs((tick.ask || 0) - (tick.bid || 0)) : null;
                          const selected = selectedSymbol === sym;
                          const scanScore = scan ? Math.round(scan.confidence * 100) : null;
                          return (
                            <Box
                              key={sym}
                              onClick={() => setSelectedSymbol(sym)}
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1.25,
                                px: 1.5,
                                py: 1.25,
                                borderBottom: "1px solid rgba(255,255,255,0.04)",
                                bgcolor: selected ? "rgba(6,182,212,0.08)" : "transparent",
                                cursor: "pointer",
                                transition: "background-color 0.12s",
                                "&:active": { bgcolor: "rgba(6,182,212,0.14)" },
                              }}
                            >
                              {/* Symbol + spread */}
                              <Box sx={{ minWidth: 0, flex: "0 0 auto", width: 88 }}>
                                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                                  <BarChart2 size={14} color={selected ? "#22d3ee" : "#475569"} />
                                  <Typography noWrap sx={{ ...MONO, fontWeight: 800, fontSize: "0.82rem", color: selected ? "#22d3ee" : "#e2e8f0" }}>
                                    {sym}
                                  </Typography>
                                </Stack>
                                <Typography sx={{ ...MONO, fontSize: "0.6rem", color: "#475569", mt: 0.15, pl: 2.25 }}>
                                  {rowSpread !== null ? `spd ${fmt(rowSpread, dec)}` : ""}
                                </Typography>
                              </Box>

                              {/* Bid + Ask */}
                              <Box sx={{ flex: 1, textAlign: "right", minWidth: 0 }}>
                                <Typography sx={{ ...MONO, fontSize: "0.88rem", fontWeight: 700, color: "#cbd5e1", lineHeight: 1.2 }}>
                                  {hasPrice ? fmt(tick!.bid, dec) : ""}
                                </Typography>
                                <Typography sx={{ ...MONO, fontSize: "0.58rem", color: "#475569", mt: 0.1 }}>
                                  {hasPrice ? `ask ${fmt(tick!.ask, dec)}` : ""}
                                </Typography>
                              </Box>

                              {/* Signal chip + เทรด button */}
                              <Stack spacing={0.5} sx={{ alignItems: "flex-end", flex: "0 0 auto" }}>
                                <Chip
                                  size="small"
                                  color={actionColor(scan?.action)}
                                  label={scanScore !== null ? `${actionLabel(scan?.action)} ${scanScore}%` : scanLoading ? "..." : "—"}
                                  variant={scanScore !== null ? "filled" : "outlined"}
                                  sx={{ height: 20, borderRadius: 0.75, fontWeight: 800, fontSize: "0.65rem", "& .MuiChip-label": { px: 0.6 } }}
                                />
                                <Box
                                  component="button"
                                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); stageTrade(sym); }}
                                  disabled={tradeStagingSymbol === sym}
                                  sx={{
                                    all: "unset",
                                    cursor: tradeStagingSymbol === sym ? "wait" : "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 0.3,
                                    color: "#06b6d4",
                                    fontSize: "0.62rem",
                                    fontWeight: 700,
                                    opacity: tradeStagingSymbol === sym ? 0.4 : 1,
                                    "&:active": { opacity: 0.6 },
                                  }}
                                >
                                  {tradeStagingSymbol === sym ? <CircularProgress size={10} color="inherit" /> : <Bot size={10} />}
                                  เทรด
                                </Box>
                              </Stack>
                            </Box>
                          );
                        })
                    )}
                  </Box>

                  {filteredForexSymbols.length > 0 && (
                    <TablePagination
                      component="div"
                      count={filteredForexSymbols.length}
                      page={symbolPage}
                      rowsPerPage={symbolRowsPerPage}
                      onPageChange={(_, p) => setSymbolPage(p)}
                      onRowsPerPageChange={(e) => { setSymbolRowsPerPage(parseInt(e.target.value)); setSymbolPage(0); }}
                      rowsPerPageOptions={[10, 25, 50]}
                      labelRowsPerPage="แสดง:"
                      labelDisplayedRows={({ from, to, count }) => `${from}–${to} จาก ${count}`}
                      sx={{
                        color: "#94a3b8",
                        "& .MuiTablePagination-toolbar": { minHeight: 44, px: 1 },
                        "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": { fontSize: "0.78rem" },
                      }}
                    />
                  )}
                  </Box>{/* end collapsible price table body */}
                </CardContent>
              </Card>

              <Stack spacing={2}>
                <Card sx={{ bgcolor: "#0d1321", border: { xs: "none", md: "1px solid rgba(255,255,255,0.03)" }, borderRadius: { xs: 0, md: 1 }, position: { lg: "sticky" }, top: { lg: 16 }, mx: { xs: -1.5, md: 0 } }}>
                  <CardContent sx={{ p: { xs: 0, md: 2 }, "&:last-child": { pb: { xs: 0, md: 2 } } }}>
                    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.25, px: { xs: 1.5, md: 0 }, pt: { xs: 1.25, md: 0 } }}>
                      <Typography sx={{ fontWeight: 800 }}>Open Forex Positions</Typography>
                      {forexPositions.length > 0 && (
                        <Chip
                          size="small"
                          label={`${forexOpenPl >= 0 ? "+" : ""}${fmt(forexOpenPl)} ${account?.currency || ""}`}
                          color={forexOpenPl >= 0 ? "success" : "error"}
                          sx={{ fontWeight: 800, px: 1 }}
                        />
                      )}
                    </Stack>
                    {forexPositions.length === 0 ? (
                      <Box sx={{ py: 4, textAlign: "center", px: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                          ยังไม่มีออเดอร์ที่เปิดอยู่
                        </Typography>
                      </Box>
                    ) : (
                      <Box>
                        {forexPositions.map((p) => {
                          const pct = p.price_open > 0
                            ? (p.type === "BUY"
                                ? ((p.price_current - p.price_open) / p.price_open) * 100
                                : ((p.price_open - p.price_current) / p.price_open) * 100)
                            : 0;
                          const isProfit = p.profit >= 0;
                          const invested = p.volume * p.price_open * (p.contract_size ?? 100000);
                          const isBot = _fBotMagics.has(p.magic);
                          const dec = getForexDecimals(p.symbol);
                          const slPct = p.sl > 0 ? ((p.sl - p.price_open) / p.price_open) * 100 : null;
                          const tpPct = p.tp > 0 ? ((p.tp - p.price_open) / p.price_open) * 100 : null;
                          const distToSl = p.sl > 0 ? ((p.sl - p.price_current) / p.price_current) * 100 : null;
                          const distToTp = p.tp > 0 ? ((p.tp - p.price_current) / p.price_current) * 100 : null;
                          const sideColor = p.type === "BUY" ? "#10b981" : "#ef4444";
                          return (
                            <Box key={p.ticket}>
                              {/* ── MOBILE: flat list row ── */}
                              <Box
                                sx={{
                                  display: { xs: "block", md: "none" },
                                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                                  borderLeft: `3px solid ${sideColor}`,
                                  pl: 1.25, pr: 1, py: 0.85,
                                  bgcolor: isProfit ? "rgba(16,185,129,0.015)" : "rgba(239,68,68,0.015)",
                                }}
                              >
                                {/* Row 1: [Symbol · L/S · BOT]  [P&L / % · ×] */}
                                <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                                  {/* left */}
                                  <Stack direction="row" spacing={0.6} sx={{ alignItems: "center", minWidth: 0, overflow: "hidden" }}>
                                    <Typography noWrap sx={{ fontWeight: 800, fontSize: "0.88rem", color: "#f8fafc", lineHeight: 1.1, flexShrink: 0 }}>
                                      {p.symbol}
                                    </Typography>
                                    <Box sx={{ px: 0.6, py: 0.2, borderRadius: 0.5, bgcolor: p.type === "BUY" ? "rgba(16,185,129,0.18)" : "rgba(239,68,68,0.18)", border: `1px solid ${p.type === "BUY" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, flexShrink: 0 }}>
                                      <Typography sx={{ fontSize: "0.62rem", fontWeight: 900, color: sideColor, lineHeight: 1.3, letterSpacing: "0.05em" }}>
                                        {p.type === "BUY" ? "LONG" : "SHORT"}
                                      </Typography>
                                    </Box>
                                    {isBot && (
                                      <Box sx={{ px: 0.5, py: 0.2, borderRadius: 0.4, bgcolor: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.25)", flexShrink: 0 }}>
                                        <Typography sx={{ fontSize: "0.58rem", fontWeight: 800, color: "#93c5fd", lineHeight: 1.3 }}>BOT</Typography>
                                      </Box>
                                    )}
                                  </Stack>
                                  {/* right */}
                                  <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexShrink: 0 }}>
                                    <Stack sx={{ alignItems: "flex-end" }}>
                                      <Typography sx={{ ...MONO, fontWeight: 800, fontSize: "0.95rem", color: isProfit ? "#4ade80" : "#fb7185", lineHeight: 1 }}>
                                        {isProfit ? "+" : ""}{fmt(p.profit)}
                                      </Typography>
                                      <Typography sx={{ ...MONO, fontSize: "0.68rem", fontWeight: 700, color: isProfit ? "#86efac" : "#fda4af", lineHeight: 1.2 }}>
                                        {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                                      </Typography>
                                    </Stack>
                                    <IconButton
                                      size="small"
                                      disabled={closingTicket === p.ticket}
                                      onClick={() => setCloseCandidate(p)}
                                      sx={{ width: 22, height: 22, p: 0, color: "#94a3b8", flexShrink: 0, "&:hover": { color: "#fb7185" }, "&:active": { color: "#ef4444" } }}
                                    >
                                      {closingTicket === p.ticket ? <CircularProgress size={13} color="inherit" /> : <X size={15} />}
                                    </IconButton>
                                  </Stack>
                                </Stack>

                                {/* Row 2: [entry › current · lot]  [SL xxx · TP xxx] */}
                                <Stack direction="row" sx={{ mt: 0.5, alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                                  {/* price movement */}
                                  <Typography sx={{ ...MONO, fontSize: "0.72rem", lineHeight: 1, flexShrink: 0 }}>
                                    <Box component="span" sx={{ color: "#94a3b8" }}>{fmtP(p.price_open)}</Box>
                                    <Box component="span" sx={{ color: "#64748b", mx: "4px" }}>›</Box>
                                    <Box component="span" sx={{ color: "#e2e8f0", fontWeight: 700 }}>{fmtP(p.price_current)}</Box>
                                    <Box component="span" sx={{ color: "#475569", mx: "4px" }}>·</Box>
                                    <Box component="span" sx={{ color: "#94a3b8" }}>{fmt(p.volume, 2)}L</Box>
                                  </Typography>
                                  {/* SL / TP compact */}
                                  {(p.sl > 0 || p.tp > 0) && (
                                    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexShrink: 0 }}>
                                      {p.sl > 0 && (
                                        <Typography sx={{ ...MONO, fontSize: "0.68rem", lineHeight: 1 }}>
                                          <Box component="span" sx={{ color: "#cbd5e1" }}>SL </Box>
                                          <Box component="span" sx={{ color: "#fb7185", fontWeight: 700 }}>{fmtP(p.sl)}</Box>
                                        </Typography>
                                      )}
                                      {p.sl > 0 && p.tp > 0 && <Box sx={{ width: "1px", height: 11, bgcolor: "#475569" }} />}
                                      {p.tp > 0 && (
                                        <Typography sx={{ ...MONO, fontSize: "0.68rem", lineHeight: 1 }}>
                                          <Box component="span" sx={{ color: "#cbd5e1" }}>TP </Box>
                                          <Box component="span" sx={{ color: "#4ade80", fontWeight: 700 }}>{fmtP(p.tp)}</Box>
                                        </Typography>
                                      )}
                                    </Stack>
                                  )}
                                </Stack>
                              </Box>

                              {/* ── DESKTOP full view ── */}
                              <Box sx={{ display: { xs: "none", md: "block" }, p: 1.25 }}>
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
                                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.2 }}>
                                        <Typography variant="caption" color="text.secondary" sx={{ ...MONO, lineHeight: 1.2 }}>
                                          Ticket #{p.ticket}
                                        </Typography>
                                        <Chip
                                          size="small"
                                          label={isBot ? "Bot" : "Manual"}
                                          sx={{
                                            height: 14, fontSize: 9, fontWeight: 800, borderRadius: 0.5,
                                            bgcolor: isBot ? "rgba(6,182,212,0.12)" : "rgba(148,163,184,0.1)",
                                            color: isBot ? "#22d3ee" : "#94a3b8",
                                            border: `1px solid ${isBot ? "rgba(6,182,212,0.25)" : "rgba(148,163,184,0.15)"}`,
                                            "& .MuiChip-label": { px: 0.6 },
                                          }}
                                        />
                                      </Box>
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
                                      color="error"
                                      disabled={closingTicket === p.ticket}
                                      onClick={() => setCloseCandidate(p)}
                                      sx={{ width: 28, height: 28, borderRadius: 1, border: "1px solid rgba(239,68,68,0.28)", bgcolor: "rgba(239,68,68,0.06)", color: "#f87171", flexShrink: 0, "&:hover": { borderColor: "#ef4444", bgcolor: "rgba(239,68,68,0.13)" } }}
                                    >
                                      {closingTicket === p.ticket ? <CircularProgress size={14} color="inherit" /> : <X size={15} />}
                                    </IconButton>
                                  </Stack>
                                </Stack>

                                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 0.75, p: 1, mb: 0.75, borderRadius: 1, bgcolor: "rgba(255,255,255,0.025)" }}>
                                  {[
                                    { label: "Lot",      value: fmt(p.volume, 2) },
                                    { label: "ราคาเข้า", value: fmt(p.price_open, dec) },
                                    { label: "ปัจจุบัน", value: fmt(p.price_current, dec) },
                                    { label: "Notional", value: fmt(invested, 0) },
                                  ].map((cell) => (
                                    <Box key={cell.label} sx={{ minWidth: 0 }}>
                                      <Typography variant="caption" sx={{ display: "block", color: "#64748b", lineHeight: 1.2 }}>{cell.label}</Typography>
                                      <Typography noWrap variant="caption" sx={{ ...MONO, display: "block", color: "#cbd5e1", fontWeight: 650, lineHeight: 1.25 }}>{cell.value}</Typography>
                                    </Box>
                                  ))}
                                </Box>
                                {(p.sl > 0 || p.tp > 0) && (
                                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.75, px: 1, pb: 1 }}>
                                    {p.sl > 0 && (
                                      <Box sx={{ p: 0.75, borderRadius: 1, bgcolor: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
                                        <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Stop Loss</Typography>
                                        <Typography sx={{ ...MONO, fontSize: "0.82rem", fontWeight: 800, color: "#f87171" }}>{fmt(p.sl, dec)}</Typography>
                                        <Typography variant="caption" sx={{ ...MONO, color: "#64748b", fontSize: "0.68rem" }}>
                                          {slPct !== null ? `${slPct >= 0 ? "+" : ""}${slPct.toFixed(2)}% จากเข้า` : ""}
                                          {distToSl !== null ? `  ·  ${distToSl >= 0 ? "+" : ""}${distToSl.toFixed(2)}% จากปัจจุบัน` : ""}
                                        </Typography>
                                      </Box>
                                    )}
                                    {p.tp > 0 && (
                                      <Box sx={{ p: 0.75, borderRadius: 1, bgcolor: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)" }}>
                                        <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Take Profit</Typography>
                                        <Typography sx={{ ...MONO, fontSize: "0.82rem", fontWeight: 800, color: "#34d399" }}>{fmt(p.tp, dec)}</Typography>
                                        <Typography variant="caption" sx={{ ...MONO, color: "#64748b", fontSize: "0.68rem" }}>
                                          {tpPct !== null ? `${tpPct >= 0 ? "+" : ""}${tpPct.toFixed(2)}% จากเข้า` : ""}
                                          {distToTp !== null ? `  ·  ${distToTp >= 0 ? "+" : ""}${distToTp.toFixed(2)}% จากปัจจุบัน` : ""}
                                        </Typography>
                                      </Box>
                                    )}
                                  </Box>
                                )}
                              </Box>
                            </Box>
                          );
                        })}
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Stack>
            </Box>

            <Card>
              <CardContent sx={{ p: 3 }}>
                <Stack
                  direction="row"
                  sx={{ justifyContent: "space-between", alignItems: "center", mb: { xs: historyOpen ? 2 : 0, md: 2 }, cursor: { xs: "pointer", md: "default" } }}
                  onClick={() => { if (window.innerWidth < 900) setHistoryOpen((v) => !v); }}
                >
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <History size={18} color="#22d3ee" />
                    <Typography sx={{ fontWeight: 800 }}>ประวัติรายการ Forex 7 วัน</Typography>
                    <Box sx={{ display: { xs: "flex", md: "none" }, color: "#475569" }}>
                      {historyOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </Box>
                  </Stack>
                </Stack>
                <Box sx={{ display: historyOpen ? undefined : { xs: "none", md: "block" } }}>
                <PnLChart deals={forexHistory} />
                <HistoryTable
                  deals={paginatedForexHistory}
                  totalCount={forexHistory.length}
                  page={historyPage}
                  rowsPerPage={historyRowsPerPage}
                  onPageChange={setHistoryPage}
                  onRowsPerPageChange={setHistoryRowsPerPage}
                  isBot={(h) => _fBotMagics.has(h.magic)}
                  priceDecimals={(h) => getForexDecimals(h.symbol)}
                  priceSubtitle={(h) => `vol ${fmt(h.volume, 2)} lot`}
                  botBadgeColor={{ fg: "#22d3ee", bg: "rgba(6,182,212,0.1)", border: "rgba(6,182,212,0.2)" }}
                  emptyMessage="ยังไม่มีประวัติเทรด Forex ใน 7 วันล่าสุด"
                />
                </Box>{/* end collapsible history body */}
              </CardContent>
            </Card>
          </Stack>
        </Container>
      </Box>

      <ForexBotSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        patchSettings={patchSettings}
        strategies={strategiesForGroup(strategies, "forex")}
        strategyLabel={strategyLabel}
        savingSettings={saving}
        onSave={saveForexSettings}
        forexInput={forexInput}
        setForexInput={setForexInput}
        onDetectForexSymbols={detectForexSymbols}
        detectingForexSymbols={detecting}
        forexFilterType={forexFilterType}
        setForexFilterType={handleSetForexFilterType}
        scanMins={forexScanMins}
        setScanMins={setForexScanMins}
        allForexSymbols={forexSymbols}
        onValidateSymbols={validateForexSymbols}
        validatingSymbols={validating}
      />

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
        <DialogTitle>Confirm Close Forex Position</DialogTitle>
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
                  ["Open", fmt(closeCandidate.price_open, getForexDecimals(closeCandidate.symbol))],
                  ["Current", fmt(closeCandidate.price_current, getForexDecimals(closeCandidate.symbol))],
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
        <DialogTitle>Confirm {tradeConfirm ? actionLabel(tradeConfirm.action) : ""} Forex Trade</DialogTitle>
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
                  ["Price", fmt(tradeConfirm.price, getForexDecimals(tradeConfirm.symbol))],
                  ["Lot", fmt(tradeConfirm.suggested_lot, 2)],
                  ["Stop Loss", fmt(tradeConfirm.stop_loss, getForexDecimals(tradeConfirm.symbol))],
                  ["Take Profit", fmt(tradeConfirm.take_profit, getForexDecimals(tradeConfirm.symbol))],
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
