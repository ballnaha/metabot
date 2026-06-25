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

const actionColor = (action?: string): "success" | "error" | "default" =>
  action === "BUY" ? "success" : action === "SELL" ? "error" : "default";

const actionLabel = (action?: string) =>
  action === "BUY" ? "Long" : action === "SELL" ? "Short" : action || "รอ";

const isGoldSymbol = (sym: string) => {
  const s = sym.toUpperCase();
  return s.includes("GOLD") || s.startsWith("XAU");
};

const isCryptoSymbol = (sym: string) => {
  const s = sym.toUpperCase();
  return /BTC|ETH|SOL|XRP|LTC|DOGE|ADA|DOT|LINK|AVAX|SHIB|UNI|BNB|NEAR|SUI|PEPE/i.test(s);
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

export default function GoldPage() {
  const toastr = useToastr();

  const [account, setAccount] = useState<Account | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<HistoryDeal[]>([]);
  const [ticks, setTicks] = useState<Record<string, Tick>>({});
  const [settings, setSettings] = useState<any>({
    symbols: "GOLD",
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
  const [goldInput, setGoldInput] = useState("GOLD");
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
      setRefreshing(false);
    }
  }, [toastr]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!goldSymbols.length) return;
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
                      {filteredGoldSymbols.length === 0 ? (
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
                      <Typography sx={{ fontWeight: 800 }}>Gold Bot Control</Typography>
                      <Chip
                        size="small"
                        icon={<ShieldCheck size={14} />}
                        label={goldBotActive ? "GOLD BOT ON" : "GOLD BOT OFF"}
                        color={goldBotActive ? "success" : "default"}
                      />
                    </Stack>
                    <Stack spacing={1.25}>
                      <Autocomplete
                        size="small"
                        options={goldSymbols}
                        value={selectedSymbol || null}
                        onChange={(_, value) => setSelectedSymbol(value || "")}
                        renderInput={(params) => <TextField {...params} label="Gold symbol" />}
                      />
                      <Stack direction="row" spacing={1.25}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="caption" color="text.secondary">Bid</Typography>
                          <Typography sx={{ ...MONO, fontSize: "1.25rem", fontWeight: 800 }}>{fmt(selectedTick?.bid, 2)}</Typography>
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="caption" color="text.secondary">Ask</Typography>
                          <Typography sx={{ ...MONO, fontSize: "1.25rem", fontWeight: 800 }}>{fmt(selectedTick?.ask, 2)}</Typography>
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="caption" color="text.secondary">Spread</Typography>
                          <Typography sx={{ ...MONO, fontSize: "1.25rem", fontWeight: 800 }}>{spread === null ? "-" : fmt(spread, 2)}</Typography>
                        </Box>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                      <Typography sx={{ fontWeight: 800 }}>Open Gold Positions</Typography>
                      <Chip size="small" label={`${goldPositions.length} open`} />
                    </Stack>
                    <Stack spacing={1}>
                      {goldPositions.length === 0 ? (
                        <Typography color="text.secondary" variant="body2">ยังไม่มี position ทองที่เปิดอยู่</Typography>
                      ) : (
                        goldPositions.map((p) => {
                          const isBuy = p.type?.toUpperCase().includes("BUY");
                          return (
                            <Box
                              key={p.ticket}
                              sx={{
                                p: 1.25,
                                borderRadius: 1,
                                border: "1px solid rgba(255,255,255,0.08)",
                                bgcolor: "rgba(15,23,42,0.6)",
                              }}
                            >
                              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                                <Box>
                                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                    <Typography sx={{ ...MONO, fontWeight: 800 }}>{p.symbol}</Typography>
                                    <Chip size="small" color={isBuy ? "success" : "error"} label={isBuy ? "BUY" : "SELL"} />
                                  </Stack>
                                  <Typography variant="caption" color="text.secondary" sx={MONO}>
                                    {fmt(p.volume, 2)} lot · {fmt(p.price_open, 2)} &rarr; {fmt(p.price_current, 2)}
                                  </Typography>
                                </Box>
                                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                  <Typography sx={{ ...MONO, fontWeight: 800, color: p.profit >= 0 ? "#10b981" : "#ef4444" }}>
                                    {p.profit >= 0 ? "+" : ""}{fmt(p.profit)}
                                  </Typography>
                                  <IconButton size="small" color="error" disabled={closingTicket === p.ticket} onClick={() => setCloseCandidate(p)}>
                                    {closingTicket === p.ticket ? <CircularProgress size={16} color="inherit" /> : <X size={16} />}
                                  </IconButton>
                                </Stack>
                              </Stack>
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
                        <TableCell>Time</TableCell>
                        <TableCell>Symbol</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell align="right">Volume</TableCell>
                        <TableCell align="right">Price</TableCell>
                        <TableCell align="right">Profit</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {paginatedGoldHistory.map((h) => (
                        <TableRow key={`${h.ticket}-${h.time}`} sx={{ "& td": { borderBottomColor: "rgba(255,255,255,0.04)" } }}>
                          <TableCell sx={MONO}>{new Date(h.time).toLocaleString()}</TableCell>
                          <TableCell sx={{ ...MONO, fontWeight: 800 }}>{h.symbol}</TableCell>
                          <TableCell>{h.entry === "OUT" ? "Close" : "Open"} {h.type}</TableCell>
                          <TableCell align="right" sx={MONO}>{fmt(h.volume, 2)}</TableCell>
                          <TableCell align="right" sx={MONO}>{fmt(h.price, 2)}</TableCell>
                          <TableCell align="right" sx={{ ...MONO, color: h.profit >= 0 ? "#10b981" : "#ef4444", fontWeight: 800 }}>
                            {h.profit >= 0 ? "+" : ""}{fmt(h.profit)}
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
                    sx={{
                      color: "#94a3b8",
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                      "& .MuiTablePagination-toolbar": { minHeight: 44, px: 1 },
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
              borderLeft: "1px solid rgba(251,191,36,0.2)",
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
              <Box sx={{ p: 0.8, borderRadius: 2, bgcolor: "rgba(251,191,36,0.1)", display: "flex", color: "#fbbf24" }}>
                <SettingsIcon size={18} />
              </Box>
              <Box>
                <Typography variant="h6" sx={{ color: "#fff", fontWeight: 650, lineHeight: 1.15 }}>
                  Gold Bot Settings
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  สัญลักษณ์ทอง กลยุทธ์ ขนาดไม้ และ auto trade
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
              <Box sx={{ p: 2, bgcolor: "rgba(251,191,36,0.035)", border: "1px solid rgba(251,191,36,0.14)", borderRadius: 1 }}>
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                    <Filter size={18} color="#fbbf24" />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 650, color: "#fff" }}>
                        คัดสัญลักษณ์ทอง
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
                      value={goldInput}
                      onChange={(e) => setGoldInput(e.target.value.toUpperCase())}
                      placeholder="GOLD"
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
                      }}
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={detecting}
                      onClick={detectGoldSymbols}
                      sx={{
                        height: 40,
                        borderColor: "rgba(251,191,36,0.28)",
                        color: "#fbbf24",
                        fontWeight: 650,
                        px: 2,
                        minWidth: 116,
                        bgcolor: "rgba(251,191,36,0.05)",
                        "&:hover": { borderColor: "#fbbf24", bgcolor: "rgba(251,191,36,0.09)" },
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
                        borderColor: "rgba(16,185,129,0.25)",
                        color: "#34d399",
                        fontWeight: 650,
                        px: 2,
                        minWidth: 116,
                        bgcolor: "rgba(16,185,129,0.04)",
                        "&:hover": { borderColor: "#10b981", bgcolor: "rgba(16,185,129,0.08)" },
                      }}
                    >
                      {validating ? <CircularProgress size={16} color="inherit" /> : "ตรวจสอบ"}
                    </Button>
                  </Stack>

                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, pt: 0.5 }}>
                    {goldInput.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean).length === 0 ? (
                      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic", px: 0.5 }}>
                        ยังไม่มี symbol ทองในรายการ
                      </Typography>
                    ) : (
                      goldInput.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean).map((sym) => (
                        <Chip
                          key={sym}
                          label={sym}
                          onDelete={() => {
                            const next = goldInput
                              .split(",")
                              .map((x) => x.trim().toUpperCase())
                              .filter((x) => x && x !== sym);
                            setGoldInput(next.join(", "));
                          }}
                          size="small"
                          sx={{
                            bgcolor: "rgba(251,191,36,0.08)",
                            color: "#fff",
                            border: "1px solid rgba(251,191,36,0.22)",
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
                  label="จำนวนช่องทองสูงสุด"
                  value={goldSlotLimit}
                  onChange={(val) => patchSettings({ max_gold_open_trades: val })}
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
                      fontWeight: 700,
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
                      borderColor: "rgba(251,191,36,0.28)",
                      color: "#fbbf24",
                      fontWeight: 650,
                      px: 1.5,
                      minWidth: "fit-content",
                      bgcolor: "rgba(251,191,36,0.04)",
                      "&:hover": { borderColor: "#fbbf24", bgcolor: "rgba(251,191,36,0.08)" },
                    }}
                  >
                    สุ่มเลข
                  </Button>
                </Stack>
              </Box>

              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1.25, py: 1, bgcolor: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: 2 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  {settings.gold_bot_enabled ? <ShieldCheck size={16} color="#10b981" /> : <ShieldAlert size={16} color="#ef4444" />}
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>
                      {settings.gold_bot_enabled ? "เปิดบอททองอัตโนมัติ" : "ปิดบอททองอัตโนมัติ"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {settings.gold_bot_enabled ? "บอทจะสแกนและส่งออเดอร์เฉพาะทองตามรอบ" : "หยุด auto trade เฉพาะทอง แต่ยังวิเคราะห์มือได้"}
                    </Typography>
                  </Box>
                </Stack>
                <Switch checked={settings.gold_bot_enabled ?? true} onChange={(e) => patchSettings({ gold_bot_enabled: e.target.checked })} color="success" />
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
              onClick={saveGoldSettings}
              disabled={saving}
              startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <Save size={18} />}
              sx={{
                py: 1.5,
                fontWeight: 650,
                bgcolor: "#f59e0b",
                color: "#111827",
                "&:hover": { bgcolor: "#d97706" },
                boxShadow: "0 4px 12px rgba(245,158,11,0.2)",
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
