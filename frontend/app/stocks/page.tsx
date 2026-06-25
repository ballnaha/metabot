"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToastr } from "../components/Toastr";
import Sidebar, { SIDEBAR_W } from "../components/Sidebar";
import TopBar from "../components/TopBar";
import BotLog from "../crypto/components/BotLog";
import PnLChart from "../crypto/components/PnLChart";
import StockBotSettings from "./components/StockBotSettings";
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
  Drawer,
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
  Globe,
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

const isStockSymbol = (sym: string) => {
  const s = sym.toUpperCase();
  if (/GOLD|XAU|XAG|SILVER|PLATINUM|PALLADIUM/.test(s)) return false;
  if (/BTC|ETH|SOL|XRP|LTC|DOGE|ADA|DOT|LINK|AVAX|SHIB|UNI|BNB|NEAR|SUI|PEPE/.test(s)) return false;
  // XM exchange-suffix format: AAPL.OQ, NVDA.OQ, TSLA.N
  if (/^[A-Z]{1,6}\.(OQ|N|NY|L|T|AX|HK)$/.test(s)) return true;
  // Exclude 6-char pure forex pairs
  if (/^[A-Z]{6}$/.test(s)) return false;
  // Strip broker prefix/suffix and check base ticker
  const base = s.replace(/^[#@]|M$|\..*$/, "");
  return base.length >= 2 && base.length <= 5 && /^[A-Z]+$/.test(base);
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
          bgcolor: "rgba(255,255,255,0.01)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 2,
          overflow: "hidden",
          "&:focus-within": {
            borderColor: "#3b82f6",
            boxShadow: "0 0 0 1px rgba(59,130,246,0.18)",
          },
        }}
      >
        <Button
          onClick={() => onChange(clamp(value - step))}
          disabled={value <= min}
          sx={{
            minWidth: 40,
            width: 40,
            height: 40,
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
            height: 40,
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

export default function StocksPage() {
  const toastr = useToastr();

  const [account, setAccount] = useState<Account | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<HistoryDeal[]>([]);
  const [ticks, setTicks] = useState<Record<string, Tick>>({});
  const [settings, setSettings] = useState<any>({ symbols: "" });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [stockInput, setStockInput] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [priceSearch, setPriceSearch] = useState("");
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
  const [symbolPage, setSymbolPage] = useState(0);
  const [symbolRowsPerPage, setSymbolRowsPerPage] = useState(10);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyRowsPerPage, setHistoryRowsPerPage] = useState(10);

  const stockSymbols = useMemo(() => {
    // Preserve broker casing (symbols like "Apple" are case-sensitive in MT5).
    const fromConfig: string[] = (settings.symbols || "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean)
      .filter(isStockSymbol);
    return Array.from(new Set<string>(fromConfig)).sort((a, b) => a.localeCompare(b));
  }, [settings.symbols]);

  const filteredStockSymbols = useMemo(() => {
    const q = priceSearch.trim().toUpperCase();
    return q ? stockSymbols.filter((s) => s.toUpperCase().includes(q)) : stockSymbols;
  }, [stockSymbols, priceSearch]);

  const stockPositions = useMemo(
    () => positions.filter((p) => {
      if (!isStockSymbol(p.symbol)) return false;
      // Accept positions tagged with stock_magic OR legacy magic (direct_trade bug fix)
      if (!settings.stock_magic) return true;
      return p.magic === settings.stock_magic || p.magic === settings.magic;
    }),
    [positions, settings.stock_magic, settings.magic]
  );
  const stockHistory = useMemo(
    () => history.filter((h) => {
      if (!isStockSymbol(h.symbol)) return false;
      if (!settings.stock_magic) return true;
      return h.magic === settings.stock_magic || h.magic === settings.magic;
    }),
    [history, settings.stock_magic, settings.magic]
  );
  const stockOpenPl = stockPositions.reduce((sum, p) => sum + (Number(p.profit) || 0), 0);
  const realizedStockPl = stockHistory.filter((h) => h.entry === "OUT").reduce((sum, h) => sum + (Number(h.profit) || 0), 0);
  const selectedTick = selectedSymbol
    ? (ticks[selectedSymbol] ?? Object.entries(ticks).find(([k]) => k.toUpperCase() === selectedSymbol.toUpperCase())?.[1] ?? null)
    : null;
  const stockSlotLimit = settings.max_stock_open_trades ?? settings.max_open_trades ?? 5;
  const stockBotActive = Boolean(settings.stock_bot_enabled);
  const botStockUsage = stockSlotLimit ? Math.min(100, (stockPositions.length / Math.max(1, stockSlotLimit)) * 100) : 0;
  const historyPageStart = historyPage * historyRowsPerPage;
  const paginatedStockHistory = stockHistory.slice(historyPageStart, historyPageStart + historyRowsPerPage);

  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(stockHistory.length / historyRowsPerPage) - 1);
    if (historyPage > maxPage) setHistoryPage(maxPage);
  }, [stockHistory.length, historyRowsPerPage, historyPage]);

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
        const cfgStock = (cfg.symbols || "")
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
          .filter(isStockSymbol);
        setStockInput(cfgStock.join(", "));
      }
      setStrategies(strat.strategies || []);
      setHistory(hist.history || []);
    } catch (e: any) {
      setConnected(false);
      toastr.error(`โหลดข้อมูลหน้าเทรดหุ้น US ไม่สำเร็จ: ${e.message}`);
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
    if (!stockSymbols.length) return;
    setSelectedSymbol((prev) => (prev && stockSymbols.includes(prev) ? prev : stockSymbols[0]));
  }, [stockSymbols]);

  useEffect(() => {
    if (!stockSymbols.length) return;
    let active = true;
    const loadTicks = async () => {
      try {
        const data = await api(`ticks?symbols=${encodeURIComponent(stockSymbols.join(","))}`);
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
  }, [stockSymbols]);

  const runScan = useCallback(async (notify = true) => {
    if (!stockSymbols.length) return;
    setScanLoading(true);
    try {
      const data = await api("scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: stockSymbols,
          timeframe: settings.default_timeframe,
          strategy: settings.strategy,
          bars: 220,
        }),
      });
      setScanResults(data.results || []);
      if (notify) toastr.success("สแกนสัญญาณหุ้น US เรียบร้อย");
    } catch (e: any) {
      if (notify) toastr.error(`สแกนหุ้น US ไม่สำเร็จ: ${e.message}`);
    } finally {
      setScanLoading(false);
    }
  }, [stockSymbols, settings.default_timeframe, settings.strategy, toastr]);

  useEffect(() => {
    if (!stockSymbols.length) {
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
  }, [stockSymbols.join(","), settings.default_timeframe, settings.strategy, runScan]);

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
      toastr.error(`วิเคราะห์หุ้น US ไม่สำเร็จ: ${e.message}`);
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
      toastr.success(`เปิดออเดอร์หุ้น ${tradeConfirm.symbol} ${actionLabel(tradeConfirm.action)} แล้ว`);
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
      toastr.success("ปิด position หุ้น US แล้ว");
      refresh();
    } catch (e: any) {
      toastr.error(`ปิด position ไม่สำเร็จ: ${e.message}`);
    } finally {
      setClosingTicket(null);
    }
  }

  async function detectStockSymbols() {
    setDetecting(true);
    try {
      const data = await api("symbols/detect-stocks");
      const detected = (data.symbols || []).map((s: string) => s.trim()).filter(isStockSymbol);
      if (detected.length) {
        setStockInput(detected.join(", "));
        toastr.success(`ตรวจพบสัญลักษณ์หุ้น US ${detected.length} รายการ`);
      } else {
        toastr.warning("ไม่พบสัญลักษณ์หุ้น US ใน MT5 ของโบรกเกอร์นี้");
      }
    } catch (e: any) {
      toastr.error(`สแกนสัญลักษณ์หุ้น US ไม่สำเร็จ: ${e.message}`);
    } finally {
      setDetecting(false);
    }
  }

  async function validateStockSymbols() {
    const list = stockInput.split(",").map((s) => s.trim()).filter(Boolean);
    if (!list.length) return;
    setValidating(true);
    try {
      const data = await api("symbols/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: list }),
      });
      const valid = (data.valid || []).filter(isStockSymbol);
      setStockInput(valid.join(", "));
      if (data.invalid?.length) toastr.warning(`กรองออก ${data.invalid.length} symbols ที่ MT5 ใช้ไม่ได้`);
      else toastr.success("สัญลักษณ์หุ้น US ทั้งหมดใช้งานได้");
    } catch (e: any) {
      toastr.error(`ตรวจสอบ symbol ไม่สำเร็จ: ${e.message}`);
    } finally {
      setValidating(false);
    }
  }

  async function saveStockSettings() {
    // Stock symbols keep broker casing ("Apple"); other groups stay uppercase.
    const nextStock = stockInput.split(",").map((s) => s.trim()).filter(Boolean);
    const current = (settings.symbols || "").split(",").map((s: string) => s.trim()).filter(Boolean);
    const keep = current.filter((s: string) => isStockSymbol(s) === false); // keep gold, crypto, forex
    const nextSymbols = Array.from(new Set([...keep, ...nextStock])).join(",");
    setSaving(true);
    try {
      const next = {
        symbols: nextSymbols,
        stock_bot_enabled: settings.stock_bot_enabled,
        stock_magic: settings.stock_magic,
        max_stock_open_trades: settings.max_stock_open_trades,
        stock_timeframe: settings.stock_timeframe,
        stock_strategy: settings.stock_strategy,
        stock_risk_per_trade: settings.stock_risk_per_trade,
        stock_max_lot: settings.stock_max_lot,
        stock_atr_sl_mult: settings.stock_atr_sl_mult,
        stock_rr: settings.stock_rr,
        stock_use_ai: settings.stock_use_ai,
        stock_auto_trade_interval: settings.stock_auto_trade_interval,
        telegram_enabled: settings.telegram_enabled,
      };
      await api("settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const fresh = await api("settings");
      setSettings(fresh);
      const cfgStock = (fresh.symbols || "")
        .split(",")
        .map((s: string) => s.trim().toUpperCase())
        .filter(Boolean)
        .filter(isStockSymbol);
      setStockInput(cfgStock.length ? cfgStock.join(", ") : "AAPL,MSFT,TSLA,NVDA");
      setSettingsOpen(false);
      toastr.success("บันทึกการตั้งค่าบอทหุ้น US แล้ว");
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
          pageTitle="US Stocks Terminal"
          pageIcon={<Globe size={18} />}
          connected={connected}
          accountLogin={account?.login}
          balance={account?.balance}
          equity={account?.equity}
          currency={account?.currency || "USD"}
          openPl={stockOpenPl}
          botEnabled={stockBotActive}
          strategy={settings.stock_strategy || settings.strategy || ""}
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
                icon={<Globe size={18} />}
                label="Stock Symbols"
                value={stockSymbols.length}
                tone="#3b82f6"
                sub={stockSymbols.length ? `${stockSymbols.length} symbols` : "ยังไม่ได้ตั้งค่า"}
              />
              <StatCard
                icon={<Activity size={18} />}
                label="Open Stock P/L"
                value={`${stockOpenPl >= 0 ? "+" : ""}${fmt(stockOpenPl)} ${account?.currency || ""}`}
                tone={stockOpenPl >= 0 ? "#10b981" : "#ef4444"}
                sub={`${stockPositions.length} positions`}
              />
              <StatCard
                icon={<History size={18} />}
                label="Realized 7D"
                value={`${realizedStockPl >= 0 ? "+" : ""}${fmt(realizedStockPl)} ${account?.currency || ""}`}
                tone={realizedStockPl >= 0 ? "#10b981" : "#ef4444"}
                sub={`${stockHistory.filter((h) => h.entry === "OUT").length} closed deals`}
              />
              <StatCard
                icon={<Gauge size={18} />}
                label="Stock Capacity"
                value={`${stockPositions.length}/${stockSlotLimit || 0}`}
                tone="#60a5fa"
                sub={
                  <Box>
                    <LinearProgress variant="determinate" value={botStockUsage} sx={{ mt: 0.75, height: 5, borderRadius: 99 }} />
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                      Max stock slots: {stockSlotLimit || 0}
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
                      <Globe size={18} color="#3b82f6" />
                      <Box>
                        <Typography sx={{ fontWeight: 800 }}>ราคาหุ้น US และสัญญาณบอท</Typography>
                        <Typography variant="caption" color="text.secondary">
                          เลือก symbol แล้วให้บอทวิเคราะห์ก่อนส่งออเดอร์
                        </Typography>
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={1}>
                      <TextField
                        size="small"
                        value={priceSearch}
                        onChange={(e) => { setPriceSearch(e.target.value); setSymbolPage(0); }}
                        placeholder="ค้นหา Apple/Tesla"
                        sx={{ minWidth: 180 }}
                      />
                      <Button
                        variant="contained"
                        startIcon={scanLoading ? <CircularProgress size={16} color="inherit" /> : <Zap size={16} />}
                        disabled={scanLoading || stockSymbols.length === 0}
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
                      {!settingsLoaded ? (
                        <TableRow>
                          <TableCell colSpan={6} sx={{ textAlign: "center", py: 3 }}>
                            <CircularProgress size={20} sx={{ color: "#3b82f6" }} />
                          </TableCell>
                        </TableRow>
                      ) : filteredStockSymbols.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6}>
                            <Alert severity="warning">ยังไม่มี symbol หุ้น US กดตั้งค่าแล้วสแกนจาก MT5 ได้เลย</Alert>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredStockSymbols
                          .slice(symbolPage * symbolRowsPerPage, (symbolPage + 1) * symbolRowsPerPage)
                          .map((sym) => {
                          const tick = ticks[sym] ?? Object.entries(ticks).find(([k]) => k.toUpperCase() === sym.toUpperCase())?.[1];
                          const scan = scanResults.find((r) => r.symbol.toUpperCase() === sym.toUpperCase());
                          const hasPrice = tick && !tick.error && (tick.bid > 0 || tick.ask > 0);
                          const rowSpread = hasPrice ? Math.abs((tick.ask || 0) - (tick.bid || 0)) : null;
                          const selected = selectedSymbol === sym;
                          return (
                            <TableRow
                              key={sym}
                              hover
                              onClick={() => setSelectedSymbol(sym)}
                              sx={{
                                cursor: "pointer",
                                bgcolor: selected ? "rgba(59,130,246,0.08)" : "transparent",
                                "& td": { borderBottomColor: "rgba(255,255,255,0.04)" },
                              }}
                            >
                              <TableCell>
                                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                  <Globe size={15} color="#3b82f6" />
                                  <Typography sx={{ ...MONO, fontWeight: 800 }}>{sym}</Typography>
                                </Stack>
                              </TableCell>
                              <TableCell align="right" sx={MONO}>{hasPrice ? fmt(tick!.bid, 2) : "-"}</TableCell>
                              <TableCell align="right" sx={MONO}>{hasPrice ? fmt(tick!.ask, 2) : "-"}</TableCell>
                              <TableCell align="right" sx={MONO}>{rowSpread !== null ? fmt(rowSpread, 2) : "-"}</TableCell>
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
                  {filteredStockSymbols.length > 0 && (
                    <TablePagination
                      component="div"
                      count={filteredStockSymbols.length}
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
                </CardContent>
              </Card>

              <Stack spacing={2}>
                <Card>
                  <CardContent>
                    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
                      <Typography sx={{ fontWeight: 800 }}>Open Stock Positions</Typography>
                      <Chip size="small" label={`${stockPositions.length} open`} />
                    </Stack>
                    <Stack spacing={1}>
                      {stockPositions.length === 0 ? (
                        <Typography color="text.secondary" variant="body2">ยังไม่มี position หุ้น US ที่เปิดอยู่</Typography>
                      ) : (
                        stockPositions.map((p) => {
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
                                  gap: 0.75, p: 1, mb: 0.5, borderRadius: 1,
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
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
                  <History size={18} color="#60a5fa" />
                  <Typography sx={{ fontWeight: 800 }}>ประวัติรายการหุ้น US 7 วัน</Typography>
                </Stack>
                <PnLChart deals={stockHistory} />
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
                      {paginatedStockHistory.map((h) => (
                        <TableRow
                          key={`${h.ticket}-${h.time}`}
                          sx={{ "& td": { borderBottomColor: "rgba(255,255,255,0.04)" } }}
                        >
                          <TableCell sx={{ ...MONO, color: "#94a3b8", fontSize: "0.78rem" }}>
                            {formatBangkokTime(h.time)}
                          </TableCell>
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
                            sx={{ ...MONO, fontWeight: 800,
                              color: h.profit > 0 ? "#10b981" : h.profit < 0 ? "#ef4444" : "#64748b" }}
                          >
                            {h.profit > 0 ? "+" : ""}{fmt(h.profit)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {stockHistory.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6}>
                            <Typography color="text.secondary" variant="body2" sx={{ py: 1 }}>
                              ยังไม่มีประวัติเทรดหุ้น US ใน 7 วันล่าสุด
                            </Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  <TablePagination
                    rowsPerPageOptions={[5, 10, 20, 50]}
                    component="div"
                    count={stockHistory.length}
                    rowsPerPage={historyRowsPerPage}
                    page={historyPage}
                    onPageChange={(_e, p) => setHistoryPage(p)}
                    onRowsPerPageChange={(e) => { setHistoryRowsPerPage(parseInt(e.target.value, 10)); setHistoryPage(0); }}
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

      <StockBotSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        patchSettings={patchSettings}
        strategies={strategies}
        strategyLabel={strategyLabel}
        savingSettings={saving}
        onSave={saveStockSettings}
        stockInput={stockInput}
        setStockInput={setStockInput}
        onDetectStockSymbols={detectStockSymbols}
        detectingStockSymbols={detecting}
        allStockSymbols={stockSymbols}
        onValidateSymbols={validateStockSymbols}
        validatingSymbols={validating}
      />
      {false && <Drawer
        anchor="right"
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        slotProps={{
          paper: {
            sx: {
              width: { xs: "100vw", sm: 720, md: 800 },
              bgcolor: "#0d1321",
              color: "#e2e8f0",
              borderLeft: "1px solid rgba(59,130,246,0.2)",
              backgroundImage: "none",
            },
          },
        }}
      >
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
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
              <Box sx={{ p: 0.8, borderRadius: 2, bgcolor: "rgba(59,130,246,0.1)", display: "flex", color: "#3b82f6" }}>
                <SettingsIcon size={18} />
              </Box>
              <Box>
                <Typography variant="h6" sx={{ color: "#fff", fontWeight: 650, lineHeight: 1.15 }}>
                  Stock Bot Settings
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  สัญลักษณ์หุ้น US กลยุทธ์ ขนาดไม้ และ auto trade
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

          <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 3 }}>
            <Stack spacing={2.5}>
              <Box sx={{ p: 2, bgcolor: "rgba(59,130,246,0.035)", border: "1px solid rgba(59,130,246,0.14)", borderRadius: 1 }}>
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                    <Filter size={18} color="#3b82f6" />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 650, color: "#fff" }}>
                        คัดสัญลักษณ์หุ้น US
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        พิมพ์ symbol ที่โบรกเกอร์ใช้ หรือสแกนจาก MT5 แล้วตรวจสอบก่อนบันทึก
                      </Typography>
                    </Box>
                  </Stack>

                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: "stretch" }}>
                    <TextField
                      fullWidth
                      size="small"
                      value={stockInput}
                      onChange={(e) => setStockInput(e.target.value.toUpperCase())}
                      placeholder="AAPL,MSFT,TSLA,NVDA"
                      sx={{
                        "& .MuiInputBase-root": {
                          height: 40,
                          bgcolor: "rgba(255,255,255,0.01)",
                          color: "#fff",
                          borderRadius: 1,
                          "& fieldset": { borderColor: "rgba(255,255,255,0.08)" },
                          "&:hover fieldset": { borderColor: "rgba(255,255,255,0.2) !important" },
                          "&.Mui-focused fieldset": { borderColor: "#3b82f6 !important" },
                        },
                      }}
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={detecting}
                      onClick={detectStockSymbols}
                      sx={{
                        height: 40,
                        borderColor: "rgba(59,130,246,0.28)",
                        color: "#3b82f6",
                        fontWeight: 650,
                        px: 2,
                        minWidth: 116,
                        bgcolor: "rgba(59,130,246,0.05)",
                        "&:hover": { borderColor: "#3b82f6", bgcolor: "rgba(59,130,246,0.09)" },
                      }}
                    >
                      {detecting ? <CircularProgress size={16} color="inherit" /> : "ตรวจจาก MT5"}
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={validating}
                      onClick={validateStockSymbols}
                      sx={{
                        height: 40,
                        borderColor: "rgba(16,185,129,0.25)",
                        color: "#34d399",
                        fontWeight: 650,
                        px: 2,
                        minWidth: 116,
                        bgcolor: "rgba(16,185,129,0.04)",
                        "&:hover": { borderColor: "#10b981", bgcolor: "rgba(16,185,129,0.08)" },
                      }}
                    >
                      {validating ? <CircularProgress size={16} color="inherit" /> : "Validate"}
                    </Button>
                  </Stack>

                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, pt: 0.5 }}>
                    {stockInput.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean).length === 0 ? (
                      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic", px: 0.5 }}>
                        ยังไม่มี symbol หุ้น US ในรายการ
                      </Typography>
                    ) : (
                      stockInput.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean).map((sym) => (
                        <Chip
                          key={sym}
                          label={sym}
                          onDelete={() => {
                            const next = stockInput
                              .split(",")
                              .map((x) => x.trim().toUpperCase())
                              .filter((x) => x && x !== sym);
                            setStockInput(next.join(", "));
                          }}
                          size="small"
                          sx={{
                            bgcolor: "rgba(59,130,246,0.08)",
                            color: "#fff",
                            border: "1px solid rgba(59,130,246,0.22)",
                            fontWeight: 700,
                            borderRadius: 1,
                            "& .MuiChip-deleteIcon": { color: "rgba(255,255,255,0.45)", "&:hover": { color: "#ef4444" } },
                          }}
                        />
                      ))
                    )}
                  </Box>
                </Stack>
              </Box>

              <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                <TextField
                  select
                  size="small"
                  label="Timeframe"
                  value={settings.default_timeframe || "M15"}
                  onChange={(e) => patchSettings({ default_timeframe: e.target.value })}
                  sx={{ bgcolor: "rgba(255,255,255,0.01)", "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.08)" } }}
                >
                  {["M1", "M5", "M15", "M30", "H1", "H4", "D1"].map((tf) => (
                    <MenuItem key={tf} value={tf}>{tf}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  size="small"
                  label="Strategy"
                  value={settings.strategy || "ema_macd_rsi"}
                  onChange={(e) => patchSettings({ strategy: e.target.value })}
                  sx={{ bgcolor: "rgba(255,255,255,0.01)", "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.08)" } }}
                >
                  {(strategies.length ? strategies : [{ name: "ema_macd_rsi", description: "" }]).map((s) => (
                    <MenuItem key={s.name} value={s.name}>{strategyLabel(s.name)}</MenuItem>
                  ))}
                </TextField>
              </Box>

              <QuickNumberInput
                label="สแกนทุก (วินาที)"
                value={settings.auto_trade_interval || 60}
                onChange={(val) => patchSettings({ auto_trade_interval: val })}
                step={10}
                min={10}
                precision={0}
              />

              <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                <QuickNumberInput
                  label="Risk per trade (%)"
                  value={Math.round((settings.risk_per_trade || 0.01) * 10000) / 100}
                  onChange={(val) => patchSettings({ risk_per_trade: Math.max(0, val) / 100 })}
                  step={0.1}
                  min={0}
                  precision={2}
                />
                <QuickNumberInput
                  label="Max lot"
                  value={settings.max_lot || 1}
                  onChange={(val) => patchSettings({ max_lot: Math.max(0.01, val) })}
                  step={0.01}
                  min={0.01}
                  precision={2}
                />
              </Box>

              <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                <QuickNumberInput
                  label="จำนวนช่องหุ้นสูงสุด"
                  value={stockSlotLimit}
                  onChange={(val) => patchSettings({ max_open_trades: val })}
                  step={1}
                  min={1}
                  precision={0}
                />
                <QuickNumberInput
                  label="R:R เป้ากำไร"
                  value={settings.default_rr || 2}
                  onChange={(val) => patchSettings({ default_rr: val })}
                  step={0.1}
                  min={0.1}
                  precision={1}
                />
              </Box>

              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 600, px: 0.5 }}>
                  Stock Magic Number
                </Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <input
                    type="text"
                    value={settings.magic ?? 112233}
                    onChange={(e) => patchSettings({ magic: parseInt(e.target.value, 10) || 0 })}
                    style={{
                      flexGrow: 1,
                      height: 40,
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.01)",
                      color: "#fff",
                      padding: "0 12px",
                      fontFamily: "ui-monospace, monospace",
                      fontWeight: 700,
                      outline: "none",
                      fontSize: "1rem",
                    }}
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => patchSettings({ magic: Math.floor(100000 + Math.random() * 900000) })}
                    sx={{
                      height: 40,
                      borderColor: "rgba(59,130,246,0.28)",
                      color: "#3b82f6",
                      fontWeight: 650,
                      px: 1.5,
                      minWidth: "fit-content",
                      bgcolor: "rgba(59,130,246,0.04)",
                      "&:hover": { borderColor: "#3b82f6", bgcolor: "rgba(59,130,246,0.08)" },
                    }}
                  >
                    สุ่มเลข
                  </Button>
                </Stack>
              </Box>

              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1.25, py: 1, bgcolor: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: 2 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  {settings.bot_enabled ? <ShieldCheck size={16} color="#10b981" /> : <ShieldAlert size={16} color="#ef4444" />}
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>
                      {settings.bot_enabled ? "เปิดบอทหุ้น US อัตโนมัติ" : "ปิดบอทหุ้น US อัตโนมัติ"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {settings.bot_enabled ? "บอทจะสแกนและส่งออเดอร์เฉพาะหุ้น US ตามรอบ" : "หยุด auto trade เฉพาะหุ้น US แต่ยังวิเคราะห์มือได้"}
                    </Typography>
                  </Box>
                </Stack>
                <Switch checked={settings.bot_enabled ?? false} onChange={(e) => patchSettings({ bot_enabled: e.target.checked })} color="success" />
              </Box>

              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1.25, py: 1, bgcolor: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: 2 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  {settings.use_ai ? <ShieldCheck size={16} color="#10b981" /> : <ShieldAlert size={16} color="#94a3b8" />}
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>
                      {settings.use_ai ? "เปิดให้ AI ตรวจซ้ำ" : "ใช้กลยุทธ์อย่างเดียว"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {settings.use_ai ? "AI ต้องเห็นด้วยก่อนส่งสัญญาณซื้อ/ขาย" : "บอทจะทำตามกลยุทธ์ที่เลือกโดยตรง"}
                    </Typography>
                  </Box>
                </Stack>
                <Switch checked={settings.use_ai ?? false} onChange={(e) => patchSettings({ use_ai: e.target.checked })} color="primary" />
              </Box>
            </Stack>
          </Box>

          <Box sx={{ p: 3, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <Button
              variant="contained"
              fullWidth
              onClick={saveStockSettings}
              disabled={saving}
              startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <Save size={18} />}
              sx={{
                py: 1.5,
                fontWeight: 650,
                bgcolor: "#2563eb",
                color: "#fff",
                "&:hover": { bgcolor: "#1d4ed8" },
                boxShadow: "0 4px 12px rgba(37,99,235,0.2)",
                borderRadius: 2,
              }}
            >
              บันทึกการตั้งค่า
            </Button>
          </Box>
        </Box>
      </Drawer>}

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
        <DialogTitle>Confirm Close Stock Position</DialogTitle>
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
        <DialogTitle>Confirm {tradeConfirm ? actionLabel(tradeConfirm.action) : ""} Stock Trade</DialogTitle>
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
