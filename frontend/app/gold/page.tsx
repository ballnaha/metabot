"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToastr } from "../components/Toastr";
import Sidebar, { SIDEBAR_W } from "../components/Sidebar";
import TopBar from "../components/TopBar";
import { isCryptoSymbol } from "../lib/symbols";
import HistoryTable, { type HistoryDeal } from "../components/HistoryTable";
import BotLog from "../crypto/components/BotLog";
import PnLChart from "../crypto/components/PnLChart";
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
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
  ListSubheader,
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
  Typography,
} from "@mui/material";
import {
  Activity,
  Award,
  Bot,
  Filter,
  FlaskConical,
  Gauge,
  History,
  RefreshCw,
  RotateCcw,
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
  BellRing,
  BellOff,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";

const GOLD_DEFAULTS = {
  gold_timeframe: "H4",
  gold_strategy: "gold_quality",
  atr_sl_mult: 1.5,
  default_rr: 2.0,
  max_gold_open_trades: 3,
  max_lot: 1.0,
  gold_bot_enabled: true,
  use_ai: false,
  telegram_enabled: true,
};

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
  margin?: number;
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
  technical_action?: string;
  technical_confidence?: number;
  risk_blocked?: boolean;
  risk_reason?: string;
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

const actionColor = (action?: string): "success" | "error" | "default" =>
  action === "BUY" ? "success" : action === "SELL" ? "error" : "default";

const actionLabel = (action?: string) =>
  action === "BUY" ? "Long" : action === "SELL" ? "Short" : action || "รอ";

const scanLabel = (scan: ScanResult) => scan.risk_blocked
  ? `SKIP Risk (${actionLabel(scan.technical_action)} ${Math.round((scan.technical_confidence ?? scan.confidence) * 100)}%)`
  : `${actionLabel(scan.action)} ${Math.round(scan.confidence * 100)}%`;
const scanColor = (scan?: ScanResult): "success" | "error" | "warning" | "default" =>
  scan?.risk_blocked ? "warning" : actionColor(scan?.action);

const isGoldSymbol = (sym: string) => {
  const s = sym.toUpperCase();
  return s.includes("GOLD") || s.startsWith("XAU");
};

const isSilverOrOtherMetal = (sym: string) => {
  const s = sym.toUpperCase();
  return /SILVER|XAG|XPD|XPT|PLATINUM|PALLADIUM/.test(s);
};

const strategyLabel = (name: string) =>
  ({
    gold_quality:   "Gold Quality — Breakout Retest H4",
    gold_h4:        "Gold H4 Pullback",
    gold_intraday:  "Gold H1 Intraday",
    adaptive_trend: "Adaptive Trend",
    squeeze_breakout: "Squeeze Breakout",
    supertrend_ema: "SuperTrend + EMA",
    mean_reversion: "Mean Reversion",
    ema_macd_rsi:   "EMA + MACD + RSI",
    trend:          "Trend Follow",
    breakout:       "Breakout",
  }[name] ?? name);

const GOLD_SHORT = ["gold_intraday"];
const GOLD_LONG  = ["gold_quality", "gold_h4"];

function PriceDirection({ value, direction }: { value: string; direction: "up" | "down" | "flat" }) {
  const color = direction === "up" ? "#10b981" : direction === "down" ? "#ef4444" : "#cbd5e1";
  const icon = direction === "up"
    ? <ArrowUp size={13} strokeWidth={2.4} />
    : direction === "down"
    ? <ArrowDown size={13} strokeWidth={2.4} />
    : null;
  return (
    <Stack component="span" direction="row" spacing={0.5} sx={{ ...MONO, alignItems: "center", justifyContent: "flex-end", color, fontWeight: 700, lineHeight: 1.2, minWidth: 96, transition: "color 0.2s ease-out" }}>
      <Box component="span">{value}</Box>
      <Box component="span" sx={{ width: 14, height: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", color, opacity: icon ? 1 : 0.35 }}>
        {icon}
      </Box>
    </Stack>
  );
}

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
  const [tickDirections, setTickDirections] = useState<Record<string, { bid: "up" | "down" | "flat"; ask: "up" | "down" | "flat"; lastUpdated: number }>>({});
  const [settings, setSettings] = useState<any>({
    symbols: "",
    gold_timeframe: "H4",
    gold_strategy: "",
    strategy: "",
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
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const GOLD_TF_DEFAULTS: Record<string, number> = { M15: 3, M30: 5, H1: 15, H4: 30, D1: 60 };
  const [goldScanMins, setGoldScanMinsRaw] = useState<number>(30);
  const setGoldScanMins = useCallback((v: number) => {
    setGoldScanMinsRaw(v);
    localStorage.setItem("gold_scan_mins", String(v));
  }, []);
  useEffect(() => {
    const saved = localStorage.getItem("gold_scan_mins");
    if (saved) { setGoldScanMinsRaw(parseInt(saved, 10) || 30); return; }
    if (settings.gold_timeframe) setGoldScanMins(GOLD_TF_DEFAULTS[settings.gold_timeframe] ?? 30);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.gold_timeframe]);
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

  // Mobile collapse state — collapsed by default on mobile
  const [priceTableOpen, setPriceTableOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Backtest
  const [btOpen, setBtOpen] = useState(false);
  const [btSymbol, setBtSymbol] = useState("");
  const [btTimeframe, setBtTimeframe] = useState("H4");
  const [btStrategy, setBtStrategy] = useState("");
  const [btBars, setBtBars] = useState(1000);
  const [btSpread, setBtSpread] = useState<string>("");
  const [btLoading, setBtLoading] = useState(false);
  const [btResult, setBtResult] = useState<any>(null);

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
    () => positions.filter((p) => isGoldSymbol(p.symbol)),
    [positions]
  );
  const goldHistory = useMemo(
    () => history.filter((h) => isGoldSymbol(h.symbol)),
    [history]
  );
  const goldOpenPl = goldPositions.reduce((sum, p) => sum + (Number(p.profit) || 0), 0);
  const _gBotMagics = new Set([settings.gold_magic, settings.magic, settings.stock_magic].filter(Boolean));
  const goldClosedHistory = goldHistory.filter((h) => h.entry === "OUT");
  const botGoldOpenPl = goldPositions.filter((p) => _gBotMagics.has(p.magic)).reduce((sum, p) => sum + (Number(p.profit) || 0), 0);
  const manualGoldOpenPl = goldPositions.filter((p) => !_gBotMagics.has(p.magic)).reduce((sum, p) => sum + (Number(p.profit) || 0), 0);
  const realizedGoldPl = goldClosedHistory.reduce((sum, h) => sum + (Number(h.profit) || 0), 0);
  const botRealizedGoldPl = goldClosedHistory.filter((h) => _gBotMagics.has(h.magic)).reduce((sum, h) => sum + (Number(h.profit) || 0), 0);
  const manualRealizedGoldPl = goldClosedHistory.filter((h) => !_gBotMagics.has(h.magic)).reduce((sum, h) => sum + (Number(h.profit) || 0), 0);
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
        if (!active) return;
        const now = Date.now();
        setTicks((prevTicks) => {
          const nextDirs: Record<string, { bid: "up" | "down" | "flat"; ask: "up" | "down" | "flat"; lastUpdated: number }> = {};
          for (const sym of goldSymbols) {
            const nt = data[sym];
            const pt = prevTicks[sym];
            if (nt && !nt.error && pt && !pt.error) {
              nextDirs[sym] = {
                bid: nt.bid > pt.bid ? "up" : nt.bid < pt.bid ? "down" : "flat",
                ask: nt.ask > pt.ask ? "up" : nt.ask < pt.ask ? "down" : "flat",
                lastUpdated: now,
              };
            }
          }
          if (Object.keys(nextDirs).length > 0) {
            setTickDirections((pd) => ({ ...pd, ...nextDirs }));
          }
          return data || {};
        });
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

  useEffect(() => {
    const active = Object.entries(tickDirections).filter(([, d]) => d.bid !== "flat" || d.ask !== "flat");
    if (active.length === 0) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      setTickDirections((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const [sym, d] of Object.entries(next)) {
          if (now - d.lastUpdated >= 1000 && (d.bid !== "flat" || d.ask !== "flat")) {
            next[sym] = { bid: "flat", ask: "flat", lastUpdated: d.lastUpdated };
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [tickDirections]);

  const runScan = useCallback(async (notify = true) => {
    if (!goldSymbols.length) return;
    setScanLoading(true);
    try {
      const data = await api("scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: goldSymbols,
          timeframe: settings.gold_timeframe,
          strategy: settings.gold_strategy,
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
  }, [goldSymbols, settings.gold_timeframe, settings.gold_strategy, toastr]);

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
    const intervalId = setInterval(refreshSignals, goldScanMins * 60_000);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [goldSymbols.join(","), settings.gold_timeframe, settings.gold_strategy, runScan, goldScanMins]);

  async function stageTrade(symbol: string) {
    setTradeStagingSymbol(symbol);
    try {
      const data = await api("analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          timeframe: settings.gold_timeframe,
          bars: 220,
          strategy: settings.gold_strategy,
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

  async function runBacktest() {
    if (!btSymbol) return;
    setBtLoading(true);
    setBtResult(null);
    try {
      const body: any = {
        symbol: btSymbol,
        timeframe: btTimeframe,
        strategy: btStrategy || undefined,
        bars: btBars,
        include_details: true,
      };
      if (btSpread !== "") body.spread_points = parseFloat(btSpread);
      const data = await api("backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setBtResult(data);
    } catch (e: any) {
      toastr.error(`Backtest ล้มเหลว: ${e.message}`);
    } finally {
      setBtLoading(false);
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
        gold_timeframe: settings.gold_timeframe,
        gold_strategy: settings.gold_strategy,
        auto_trade_interval: settings.auto_trade_interval,
        max_lot: settings.max_lot,
        gold_magic: settings.gold_magic,
        max_gold_open_trades: settings.max_gold_open_trades,
        default_rr: settings.default_rr,
        gold_bot_enabled: settings.gold_bot_enabled,
        use_ai: settings.use_ai,
        telegram_enabled: settings.telegram_enabled,
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

  const handleDirectChangeStrategy = async (newStrat: string) => {
    try {
      const next = {
        ...settings,
        gold_strategy: newStrat
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
          pageTitle="Gold Bot Terminal"
          pageIcon={<Award size={18} />}
          connected={connected}
          accountLogin={account?.login}
          balance={account?.balance}
          equity={account?.equity}
          currency={account?.currency || "USD"}
          openPl={goldOpenPl}
          botEnabled={goldBotActive}
          strategy={settings.gold_strategy || ""}
          aiEnabled={settings.use_ai}
          assetType="gold"
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
                sub={
                  <Box sx={{ mt: 0.5 }}>
                    <Typography variant="caption" sx={{ color: "#60a5fa", display: "block", lineHeight: 1.5 }}>
                      Bot: {botGoldOpenPl >= 0 ? "+" : ""}{fmt(botGoldOpenPl)}
                    </Typography>
                    {manualGoldOpenPl !== 0 && (
                      <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", lineHeight: 1.5 }}>
                        Manual: {manualGoldOpenPl >= 0 ? "+" : ""}{fmt(manualGoldOpenPl)}
                      </Typography>
                    )}
                    <Typography variant="caption" sx={{ color: "#64748b", display: "block", lineHeight: 1.5 }}>
                      {goldPositions.length} positions
                    </Typography>
                  </Box>
                }
              />
              <StatCard
                icon={<History size={18} />}
                label="Realized 7D"
                value={`${realizedGoldPl >= 0 ? "+" : ""}${fmt(realizedGoldPl)} ${account?.currency || ""}`}
                tone={realizedGoldPl >= 0 ? "#10b981" : "#ef4444"}
                sub={
                  <Box sx={{ mt: 0.5 }}>
                    <Typography variant="caption" sx={{ color: "#60a5fa", display: "block", lineHeight: 1.5 }}>
                      Bot: {botRealizedGoldPl >= 0 ? "+" : ""}{fmt(botRealizedGoldPl)}
                    </Typography>
                    {manualRealizedGoldPl !== 0 && (
                      <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", lineHeight: 1.5 }}>
                        Manual: {manualRealizedGoldPl >= 0 ? "+" : ""}{fmt(manualRealizedGoldPl)}
                      </Typography>
                    )}
                    <Typography variant="caption" sx={{ color: "#64748b", display: "block", lineHeight: 1.5 }}>
                      {goldClosedHistory.length} closed deals
                    </Typography>
                  </Box>
                }
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

            {/* Scan info bar */}
            {(() => {
              const TF_MINS: Record<string, number> = { M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440 };
              const tf = settings.gold_timeframe || "H4";
              const tradeMins = TF_MINS[tf] ?? 240;
              const cond = STRATEGY_CONDITIONS[settings.gold_strategy];
              return (
                <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2, px: 0.5, flexWrap: "wrap" }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.6, px: 1.25, py: 0.5, borderRadius: 99, bgcolor: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)" }}>
                      <Zap size={12} color="#60a5fa" />
                      <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, color: "#60a5fa", whiteSpace: "nowrap" }}>สแกน Signal ทุก {goldScanMins} นาที</Typography>
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
              const cond = STRATEGY_CONDITIONS[settings.gold_strategy];
              if (!cond) return null;
              return (
                <Dialog open={conditionsOpen} onClose={() => setConditionsOpen(false)} maxWidth="sm" fullWidth
                  slotProps={{ paper: { sx: { bgcolor: "#0d1321", border: "1px solid rgba(245,158,11,0.2)", backgroundImage: "none" } } }}>
                  <DialogTitle sx={{ pb: 1 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Info size={16} color="#fbbf24" />
                      <Box>
                        <Typography sx={{ fontWeight: 800, color: "#f1f5f9", fontSize: "0.95rem" }}>เงื่อนไขการเข้าเทรด — {cond.label}</Typography>
                        <Typography variant="caption" sx={{ color: "#475569" }}>{settings.gold_timeframe} · ATR SL ×{settings.atr_sl_mult} · R:R {settings.default_rr}</Typography>
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
                      <Box sx={{ mt: 1.5, px: 1.25, py: 0.75, bgcolor: "rgba(245,158,11,0.06)", borderRadius: 1, border: "1px solid rgba(245,158,11,0.15)" }}>
                        <Typography variant="caption" sx={{ color: "#fbbf24" }}>💡 {cond.note}</Typography>
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
              <Card sx={{ bgcolor: "#0d1321", border: "1px solid rgba(255,255,255,0.03)" }}>
                <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
                  <Stack
                    direction="row"
                    sx={{ justifyContent: "space-between", alignItems: "center", p: { xs: 1.25, md: 2 }, gap: 1, flexWrap: "wrap", cursor: { xs: "pointer", md: "default" } }}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (window.innerWidth < 900 && !target.closest("input, button")) {
                        setPriceTableOpen((v) => !v);
                      }
                    }}
                  >
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
                        <Award size={18} color="#fbbf24" />
                        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0 }}>
                          <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>ราคาทองและสัญญาณบอท Real-time</Box>
                          <Box component="span" sx={{ display: { xs: "inline", md: "none" } }}>ราคา Gold</Box>
                        </Typography>
                      </Stack>
                      <Box sx={{ display: { xs: "flex", md: "none" }, color: "#475569", mb: 2 }}>
                        {priceTableOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flex: { xs: "1 1 100%", md: "0 0 auto" }, display: { xs: priceTableOpen ? "flex" : "none", md: "flex" } }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, height: { xs: 34, md: 38 }, px: 1, flex: 1, minWidth: { xs: 0, md: 190 }, bgcolor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 1, transition: "border-color 0.2s", "&:focus-within": { borderColor: "rgba(251,191,36,0.5)" } }}>
                        <Search size={13} color="#475569" />
                        <input value={priceSearch} onChange={(e) => setPriceSearch(e.target.value)} placeholder="ค้นหา GOLD/XAU..." style={{ background: "transparent", border: "none", outline: "none", color: "#e2e8f0", fontSize: "0.82rem", width: "100%", fontFamily: "inherit" }} />
                        {priceSearch && <Box onClick={() => setPriceSearch("")} sx={{ cursor: "pointer", color: "#475569", display: "flex", "&:hover": { color: "#94a3b8" } }}><X size={12} /></Box>}
                      </Box>
                      <IconButton size="small" onClick={() => runScan(true)} disabled={scanLoading || goldSymbols.length === 0} sx={{ width: { xs: 34, md: "auto" }, height: { xs: 34, md: 38 }, borderRadius: 1, px: { xs: 0, md: 1.5 }, bgcolor: "#fbbf24", color: "#000", "&:hover": { bgcolor: "#f59e0b" }, "&.Mui-disabled": { bgcolor: "rgba(251,191,36,0.3)", color: "rgba(0,0,0,0.4)" } }}>
                        {scanLoading ? <CircularProgress size={14} color="inherit" /> : <RefreshCw size={16} />}
                      </IconButton>
                      <Chip size="small" label="5s" color="success" variant="outlined" sx={{ fontSize: 10, height: 20, px: 0, borderColor: "rgba(16,185,129,0.3)", color: "#10b981", bgcolor: "rgba(16,185,129,0.04)", display: { xs: "none", sm: "inline-flex" } }} />
                      <Chip size="small" label={`${goldScanMins}m`} variant="outlined" sx={{ fontSize: 10, height: 20, px: 0, borderColor: "rgba(251,191,36,0.3)", color: "#fbbf24", bgcolor: "rgba(251,191,36,0.04)", display: { xs: "none", sm: "inline-flex" } }} />
                      <Button variant="outlined" size="small" startIcon={<FlaskConical size={14} />} disabled={goldSymbols.length === 0} onClick={() => { setBtSymbol(selectedSymbol || goldSymbols[0] || ""); setBtStrategy(settings.gold_strategy || ""); setBtTimeframe(settings.gold_timeframe || "H4"); setBtResult(null); setBtOpen(true); }} sx={{ borderColor: "rgba(251,191,36,0.4)", color: "#fbbf24", fontSize: "0.72rem", "&:hover": { borderColor: "#fbbf24", bgcolor: "rgba(251,191,36,0.06)" }, display: { xs: "none", sm: "inline-flex" } }}>
                        Backtest
                      </Button>
                    </Stack>
                  </Stack>
                  <Box sx={{ display: priceTableOpen ? undefined : { xs: "none", md: "block" } }}>
                    {/* DESKTOP TABLE — sm and up */}
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
                                  <TableCell align="right" sx={{ py: 1.25 }}>
                                    <PriceDirection value={tick?.error ? "—" : fmt(tick?.bid, 2)} direction={tickDirections[sym]?.bid ?? "flat"} />
                                  </TableCell>
                                  <TableCell align="right" sx={{ py: 1.25 }}>
                                    <PriceDirection value={tick?.error ? "—" : fmt(tick?.ask, 2)} direction={tickDirections[sym]?.ask ?? "flat"} />
                                  </TableCell>
                                  <TableCell align="right" sx={{ py: 1.25, ...MONO, fontWeight: 650, color: "#cbd5e1" }}>{rowSpread === null ? "—" : fmt(rowSpread, 2)}</TableCell>
                                  <TableCell align="center" sx={{ py: 1.25 }}>
                                    <Chip
                                      size="small"
                                      color={scanColor(scan)}
                                      label={scan ? scanLabel(scan) : scanLoading ? "Scanning" : "รอสแกน"}
                                      variant={scan ? "filled" : "outlined"}
                                      sx={{ height: 24, borderRadius: 1, fontWeight: 800, "& .MuiChip-label": { px: 0.9 } }}
                                    />
                                  </TableCell>
                                  <TableCell align="right" sx={{ py: 1.25, pr: 2 }}>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      disabled={tradeStagingSymbol === sym}
                                      onClick={(e) => { e.stopPropagation(); stageTrade(sym); }}
                                      startIcon={tradeStagingSymbol === sym ? <CircularProgress size={14} color="inherit" /> : <Zap size={14} />}
                                      sx={{ height: 32, borderRadius: 1, fontWeight: 700, fontSize: "0.82rem", textTransform: "none" }}
                                    >
                                      {tradeStagingSymbol === sym ? "กำลังวิเคราะห์..." : "วิเคราะห์ & เทรด"}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </Box>

                    {/* MOBILE COMPACT LIST — xs only */}
                    <Box sx={{ display: { xs: "block", sm: "none" } }}>
                      {initialLoading ? (
                        <Box sx={{ py: 4, textAlign: "center" }}>
                          <CircularProgress size={20} sx={{ color: "#fbbf24" }} />
                        </Box>
                      ) : filteredGoldSymbols.length === 0 ? (
                        <Box sx={{ p: 2 }}>
                          <Alert severity="warning">ยังไม่มี symbol ทอง กดตั้งค่าแล้วสแกนจาก MT5 ได้เลย</Alert>
                        </Box>
                      ) : (
                        filteredGoldSymbols.map((sym) => {
                          const tick = ticks[sym];
                          const scan = scanResults.find((r) => r.symbol.toUpperCase() === sym.toUpperCase());
                          const hasPrice = tick && !tick.error && (tick.bid > 0 || tick.ask > 0);
                          const rowSpread = hasPrice ? Math.abs((tick!.ask || 0) - (tick!.bid || 0)) : null;
                          const selected = selectedSymbol === sym;
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
                                bgcolor: selected ? "rgba(251,191,36,0.08)" : "transparent",
                                cursor: "pointer",
                                transition: "background-color 0.12s",
                                "&:active": { bgcolor: "rgba(251,191,36,0.14)" },
                              }}
                            >
                              {/* Symbol + spread */}
                              <Box sx={{ minWidth: 0, flex: "0 0 auto", width: 88 }}>
                                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                                  <Award size={14} color={selected ? "#fbbf24" : "#78716c"} />
                                  <Typography noWrap sx={{ ...MONO, fontWeight: 800, fontSize: "0.82rem", color: selected ? "#fbbf24" : "#e2e8f0" }}>
                                    {sym}
                                  </Typography>
                                </Stack>
                                <Typography sx={{ ...MONO, fontSize: "0.6rem", color: "#475569", mt: 0.15, pl: 2.25 }}>
                                  {rowSpread !== null ? `spd ${fmtP(rowSpread)}` : ""}
                                </Typography>
                              </Box>

                              {/* Bid + Ask */}
                              <Box sx={{ flex: 1, textAlign: "right", minWidth: 0 }}>
                                <PriceDirection value={hasPrice ? fmtP(tick!.bid) : "—"} direction={tickDirections[sym]?.bid ?? "flat"} />
                                <Typography sx={{ ...MONO, fontSize: "0.58rem", color: "#475569", mt: 0.1 }}>
                                  {hasPrice ? `ask ${fmtP(tick!.ask)}` : ""}
                                </Typography>
                              </Box>

                              {/* Signal + เทรด */}
                              <Stack spacing={0.5} sx={{ alignItems: "flex-end", flex: "0 0 auto" }}>
                                <Chip
                                  size="small"
                                  color={scanColor(scan)}
                                  label={scan ? scanLabel(scan) : scanLoading ? "..." : "—"}
                                  variant={scan ? "filled" : "outlined"}
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
                                    color: "#fbbf24",
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
                  </Box>{/* end collapsible price table body */}
                </CardContent>
              </Card>

              <Stack spacing={2}>
                <Card sx={{ bgcolor: "#0d1321", border: { xs: "none", md: "1px solid rgba(255,255,255,0.03)" }, borderRadius: { xs: 0, md: 1 }, position: { lg: "sticky" }, top: { lg: 16 }, mx: { xs: -1.5, md: 0 } }}>
                  <CardContent sx={{ p: { xs: 0, md: 2 }, "&:last-child": { pb: { xs: 0, md: 2 } } }}>
                    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.25, px: { xs: 1.5, md: 0 }, pt: { xs: 1.25, md: 0 } }}>
                      <Typography sx={{ fontWeight: 800 }}>Open Gold Positions</Typography>
                      {goldPositions.length > 0 && (
                        <Chip
                          size="small"
                          label={`${goldOpenPl >= 0 ? "+" : ""}${fmt(goldOpenPl)} ${account?.currency || ""}`}
                          color={goldOpenPl >= 0 ? "success" : "error"}
                          sx={{ fontWeight: 800, px: 1 }}
                        />
                      )}
                    </Stack>
                    {goldPositions.length === 0 ? (
                      <Box sx={{ py: 4, textAlign: "center", px: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                          ยังไม่มีออเดอร์ที่เปิดอยู่
                        </Typography>
                      </Box>
                    ) : (
                      <Box>
                        {goldPositions.map((p) => {
                          const pct = p.price_open > 0
                            ? (p.type === "BUY"
                                ? ((p.price_current - p.price_open) / p.price_open) * 100
                                : ((p.price_open - p.price_current) / p.price_open) * 100)
                            : 0;
                          const isProfit = p.profit >= 0;
                          const marginVal = (p.margin != null && p.margin > 0) ? p.margin : null;
                          const notionalVal = p.volume * p.price_open * (p.contract_size ?? 1.0);
                          const isBot = _gBotMagics.has(p.magic);
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
                                            bgcolor: isBot ? "rgba(59,130,246,0.12)" : "rgba(148,163,184,0.1)",
                                            color: isBot ? "#60a5fa" : "#94a3b8",
                                            border: `1px solid ${isBot ? "rgba(59,130,246,0.25)" : "rgba(148,163,184,0.15)"}`,
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

                                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 0.75, p: 1, borderRadius: 1, bgcolor: "rgba(255,255,255,0.025)", mb: 0.75 }}>
                                  {[
                                    { label: "Lot",      value: fmt(p.volume, 2) },
                                    { label: "ราคาเข้า", value: fmt(p.price_open, 2) },
                                    { label: "ปัจจุบัน", value: fmt(p.price_current, 2) },
                                    { label: marginVal != null ? "Margin" : "Notional", value: fmt(marginVal ?? notionalVal, 2) },
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
                                        <Typography sx={{ ...MONO, fontSize: "0.82rem", fontWeight: 800, color: "#f87171" }}>{fmt(p.sl, 2)}</Typography>
                                        <Typography variant="caption" sx={{ ...MONO, color: "#64748b", fontSize: "0.68rem" }}>
                                          {slPct !== null ? `${slPct >= 0 ? "+" : ""}${slPct.toFixed(2)}% จากเข้า` : ""}
                                          {distToSl !== null ? `  ·  ${distToSl >= 0 ? "+" : ""}${distToSl.toFixed(2)}% จากปัจจุบัน` : ""}
                                        </Typography>
                                      </Box>
                                    )}
                                    {p.tp > 0 && (
                                      <Box sx={{ p: 0.75, borderRadius: 1, bgcolor: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)" }}>
                                        <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Take Profit</Typography>
                                        <Typography sx={{ ...MONO, fontSize: "0.82rem", fontWeight: 800, color: "#34d399" }}>{fmt(p.tp, 2)}</Typography>
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
              <CardContent>
                <Stack
                  direction="row"
                  sx={{ justifyContent: "space-between", alignItems: "center", mb: { xs: historyOpen ? 2 : 0, md: 2 }, cursor: { xs: "pointer", md: "default" } }}
                  onClick={() => { if (window.innerWidth < 900) setHistoryOpen((v) => !v); }}
                >
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <History size={18} color="#60a5fa" />
                    <Typography sx={{ fontWeight: 800 }}>Gold Trade History 7D</Typography>
                    <Box sx={{ display: { xs: "flex", md: "none" }, color: "#475569" }}>
                      {historyOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </Box>
                  </Stack>
                </Stack>
                <Box sx={{ display: historyOpen ? undefined : { xs: "none", md: "block" } }}>
                <PnLChart deals={goldHistory} />
                <HistoryTable
                  deals={paginatedGoldHistory}
                  totalCount={goldHistory.length}
                  page={historyPage}
                  rowsPerPage={historyRowsPerPage}
                  onPageChange={setHistoryPage}
                  onRowsPerPageChange={setHistoryRowsPerPage}
                  isBot={(h) => _gBotMagics.has(h.magic)}
                  priceSubtitle={(h) => `≈ ${fmt(h.price * h.volume, 2)} ${account?.currency || ""}`}
                  emptyMessage="ยังไม่มีประวัติเทรดทองใน 7 วันล่าสุด"
                />
                </Box>{/* end collapsible history body */}
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
            <Stack direction="row" spacing={0.75}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => patchSettings(GOLD_DEFAULTS)}
                startIcon={<RotateCcw size={14} />}
                sx={{
                  height: 34, fontSize: "0.72rem", fontWeight: 700, px: 1.5,
                  borderColor: "rgba(251,191,36,0.3)", color: "#fbbf24",
                  "&:hover": { borderColor: "#fbbf24", bgcolor: "rgba(251,191,36,0.08)" },
                }}
              >
                ค่า Default
              </Button>
              <Button
                variant="text"
                color="inherit"
                onClick={() => setSettingsOpen(false)}
                sx={{ minWidth: 38, width: 38, height: 38, p: 0, borderRadius: 2 }}
              >
                <X size={18} />
              </Button>
            </Stack>
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
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, width: "100%" }}>
                    <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 600, px: 0.5 }}>
                      Timeframe
                    </Typography>
                    <Select
                      size="small"
                      value={settings.gold_timeframe || "H4"}
                      onChange={(e) => {
                        patchSettings({ gold_timeframe: e.target.value });
                        setGoldScanMins(GOLD_TF_DEFAULTS[e.target.value] ?? 30);
                      }}
                      sx={{
                        height: 40,
                        bgcolor: "rgba(255,255,255,0.01)",
                        color: "#fff",
                        borderRadius: 2,
                        "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.08)" },
                        "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.2) !important" },
                        "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#fbbf24 !important" },
                        "& .MuiSelect-select": { color: "#fff" },
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
                      ].map(({ v, l }) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
                    </Select>
                  </Box>

                  <QuickNumberInput
                    label="สแกน Signal ทุก (นาที)"
                    value={goldScanMins}
                    onChange={setGoldScanMins}
                    step={1}
                    min={1}
                    max={120}
                    precision={0}
                    helperText={`default: ${GOLD_TF_DEFAULTS[settings.gold_timeframe] ?? 30} นาที สำหรับ ${settings.gold_timeframe || "H4"}`}
                  />
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

              {/* Strategy + Lot */}
              <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, width: "100%" }}>
                  <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 600, px: 0.5 }}>
                    กลยุทธ์ที่ใช้
                  </Typography>
                  <Select
                    size="small"
                    fullWidth
                    value={settings.gold_strategy || "ema_macd_rsi"}
                    onChange={(e) => patchSettings({ gold_strategy: e.target.value })}
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
                    {(() => {
                      const goldStrats = strategiesForGroup(strategies, "gold");
                      const list = goldStrats.length ? goldStrats : [{ name: "gold_quality", description: "", groups: ["gold"] }];
                      const subSx = { bgcolor: "transparent", color: "#fbbf24", fontSize: "0.60rem", fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.10em", pt: 1, pb: 0.25 };
                      const short   = list.filter((s) => GOLD_SHORT.includes(s.name));
                      const long_   = list.filter((s) => GOLD_LONG.includes(s.name));
                      const general = list.filter((s) => !GOLD_SHORT.includes(s.name) && !GOLD_LONG.includes(s.name));
                      return [
                        ...(short.length > 0 ? [<ListSubheader key="hdr-short" sx={subSx}>⚡ เทรดสั้น (H1)</ListSubheader>] : []),
                        ...short.map((s) => <MenuItem key={s.name} value={s.name}>{strategyLabel(s.name)}</MenuItem>),
                        ...(long_.length > 0 ? [<ListSubheader key="hdr-long" sx={subSx}>📈 เทรดยาว (H4)</ListSubheader>] : []),
                        ...long_.map((s) => <MenuItem key={s.name} value={s.name}>{strategyLabel(s.name)}</MenuItem>),
                        ...(general.length > 0 && (short.length > 0 || long_.length > 0) ? [<ListSubheader key="hdr-general" sx={subSx}>── ทั่วไป ──</ListSubheader>] : []),
                        ...general.map((s) => <MenuItem key={s.name} value={s.name}>{strategyLabel(s.name)}</MenuItem>),
                      ];
                    })()}
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

              {/* Strategy description */}
              {(() => {
                const goldStrats = strategiesForGroup(strategies, "gold");
                const active = goldStrats.find((s) => s.name === (settings.gold_strategy || "ema_macd_rsi"));
                if (!active?.description) return null;
                return (
                  <Box sx={{ p: 1.5, bgcolor: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.16)", borderRadius: 1 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.75 }}>
                      <TrendingUp size={14} color="#fbbf24" />
                      <Typography variant="caption" sx={{ color: "#fde68a", fontWeight: 650 }}>
                        {strategyLabel(active.name)}
                      </Typography>
                    </Stack>
                    <Typography variant="caption" sx={{ display: "block", color: "#94a3b8", lineHeight: 1.55 }}>
                      {active.description}
                    </Typography>
                  </Box>
                );
              })()}

              {/* ATR SL + R:R */}
              <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                <QuickNumberInput
                  label="ระยะตัดขาดทุน (ATR ×)"
                  value={settings.atr_sl_mult || 1.5}
                  onChange={(val) => patchSettings({ atr_sl_mult: val })}
                  step={0.1}
                  min={0.5}
                  precision={1}
                  helperText="ทองแนะนำ 1.5–3×"
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
                      color: settings.telegram_enabled ? "#3b82f6" : "#64748b",
                      display: "flex",
                      p: 0.5,
                      borderRadius: 1.5,
                      bgcolor: settings.telegram_enabled ? "rgba(59,130,246,0.08)" : "rgba(255,255,255,0.03)",
                    }}
                  >
                    {settings.telegram_enabled ? <BellRing size={16} /> : <BellOff size={16} />}
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 650, color: "#fff" }}>
                      {settings.telegram_enabled ? "เปิดการแจ้งเตือน Telegram" : "ปิดการแจ้งเตือน Telegram"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {settings.telegram_enabled ? "บอทจะส่งแจ้งเตือนสัญญาณ ปิด position และสรุปรายวัน" : "หยุดส่งข้อความทุกประเภทไปยัง Telegram"}
                    </Typography>
                  </Box>
                </Stack>
                <Switch
                  checked={settings.telegram_enabled ?? true}
                  onChange={(e) => patchSettings({ telegram_enabled: e.target.checked })}
                  color="primary"
                />
              </Box>

              {/* Global Settings link */}
              <Box
                component="a"
                href="/settings"
                sx={{
                  display: "flex", alignItems: "center", gap: 1,
                  px: 1.5, py: 1.25, borderRadius: 1.5,
                  bgcolor: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.18)",
                  color: "#60a5fa", textDecoration: "none",
                  "&:hover": { bgcolor: "rgba(59,130,246,0.1)", borderColor: "rgba(59,130,246,0.35)" },
                  transition: "all 0.15s",
                }}
              >
                <Box sx={{ fontSize: "1rem", lineHeight: 1, flexShrink: 0 }}>⚙️</Box>
                <Box>
                  <Typography sx={{ fontSize: "0.78rem", fontWeight: 700, color: "#60a5fa", lineHeight: 1.3 }}>
                    Position Sizing / Min Lot Guard / Notional Cap
                  </Typography>
                  <Typography sx={{ fontSize: "0.65rem", color: "#475569", lineHeight: 1.4 }}>
                    ตั้งค่าใน Global Settings — ใช้กับทุก asset group
                  </Typography>
                </Box>
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

      {/* Backtest Dialog */}
      <Dialog
        open={btOpen}
        onClose={() => { if (!btLoading) setBtOpen(false); }}
        maxWidth="md"
        fullWidth
        slotProps={{ paper: { sx: { bgcolor: "#0d1321", border: "1px solid rgba(251,191,36,0.18)", backgroundImage: "none" } } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <FlaskConical size={18} color="#fbbf24" />
            <Typography sx={{ fontWeight: 800, color: "#f1f5f9" }}>Gold Backtest</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent dividers sx={{ borderColor: "rgba(255,255,255,0.07)" }}>
          {/* Controls */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "2fr 1fr 2fr 1fr" }, gap: 1.5, mb: 2 }}>
            <Box>
              <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 600, display: "block", mb: 0.5 }}>Symbol</Typography>
              <Select size="small" fullWidth value={btSymbol} onChange={(e) => setBtSymbol(e.target.value)}
                sx={{ bgcolor: "rgba(255,255,255,0.02)", "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.1)" }, "& .MuiSelect-select": { color: "#fff" } }}>
                {goldSymbols.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </Select>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 600, display: "block", mb: 0.5 }}>Timeframe</Typography>
              <Select size="small" fullWidth value={btTimeframe} onChange={(e) => setBtTimeframe(e.target.value)}
                sx={{ bgcolor: "rgba(255,255,255,0.02)", "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.1)" }, "& .MuiSelect-select": { color: "#fff" } }}>
                {["M15","M30","H1","H4","D1"].map((tf) => <MenuItem key={tf} value={tf}>{tf}</MenuItem>)}
              </Select>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 600, display: "block", mb: 0.5 }}>Strategy</Typography>
              <Select size="small" fullWidth value={btStrategy} onChange={(e) => setBtStrategy(e.target.value)}
                sx={{ bgcolor: "rgba(255,255,255,0.02)", "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.1)" }, "& .MuiSelect-select": { color: "#fff" } }}>
                {strategiesForGroup(strategies, "gold").map((s) => <MenuItem key={s.name} value={s.name}>{strategyLabel(s.name)}</MenuItem>)}
              </Select>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 600, display: "block", mb: 0.5 }}>Bars</Typography>
              <Select size="small" fullWidth value={btBars} onChange={(e) => setBtBars(Number(e.target.value))}
                sx={{ bgcolor: "rgba(255,255,255,0.02)", "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.1)" }, "& .MuiSelect-select": { color: "#fff" } }}>
                {[500,1000,2000,3000].map((b) => <MenuItem key={b} value={b}>{b} แท่ง</MenuItem>)}
              </Select>
            </Box>
          </Box>

          {/* Results */}
          {btLoading && <Box sx={{ py: 6, textAlign: "center" }}><CircularProgress sx={{ color: "#fbbf24" }} /></Box>}

          {btResult && !btLoading && (() => {
            const r = btResult;
            const edge = r.expectancy_r > 0;
            const equityCurve = (r.details || []).reduce((acc: {i: number; r: number}[], t: any, idx: number) => {
              const prev = acc[idx - 1]?.r ?? 0;
              acc.push({ i: idx + 1, r: Math.round((prev + t.r) * 100) / 100 });
              return acc;
            }, []);

            const statCards = [
              { label: "Trades", value: r.trades, sub: `${r.wins}W / ${r.trades - r.wins}L` },
              { label: "Win Rate", value: `${(r.win_rate * 100).toFixed(1)}%`, tone: r.win_rate >= 0.5 ? "#10b981" : "#f59e0b" },
              { label: "Expectancy", value: `${r.expectancy_r > 0 ? "+" : ""}${r.expectancy_r}R`, tone: edge ? "#10b981" : "#ef4444", sub: "edge ต่อไม้" },
              { label: "Net R", value: `${r.net_r > 0 ? "+" : ""}${r.net_r}R`, tone: r.net_r > 0 ? "#10b981" : "#ef4444" },
              { label: "Profit Factor", value: r.profit_factor.toFixed(2), tone: r.profit_factor >= 1.5 ? "#10b981" : r.profit_factor >= 1 ? "#f59e0b" : "#ef4444" },
              { label: "Max DD", value: `-${r.max_drawdown_r}R`, tone: r.max_drawdown_r > 5 ? "#ef4444" : "#94a3b8" },
              { label: "Sharpe", value: r.sharpe.toFixed(2), sub: "per-trade" },
              { label: "Max Loss Streak", value: r.max_consecutive_losses, tone: r.max_consecutive_losses >= 5 ? "#f59e0b" : "#94a3b8", sub: "ต่อเนื่อง" },
            ];

            return (
              <Box>
                {/* summary header */}
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.5 }}>
                  <Box sx={{ px: 1.25, py: 0.5, borderRadius: 1, bgcolor: edge ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${edge ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}` }}>
                    <Typography sx={{ fontSize: "0.75rem", fontWeight: 800, color: edge ? "#10b981" : "#ef4444" }}>
                      {edge ? "✓ มี Edge" : "✗ ไม่มี Edge"}
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: "#475569" }}>
                    {r.symbol} · {r.strategy} · {btTimeframe} · {btBars} แท่ง
                  </Typography>
                </Stack>

                {/* metric cards */}
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, mb: 2 }}>
                  {statCards.map((c) => (
                    <Box key={c.label} sx={{ p: 1.25, borderRadius: 1, bgcolor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <Typography variant="caption" sx={{ color: "#475569", display: "block", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase" }}>{c.label}</Typography>
                      <Typography sx={{ fontFamily: "ui-monospace,monospace", fontWeight: 800, fontSize: "1.1rem", color: c.tone || "#e2e8f0", lineHeight: 1.3 }}>{c.value}</Typography>
                      {c.sub && <Typography variant="caption" sx={{ color: "#334155", fontSize: "0.6rem" }}>{c.sub}</Typography>}
                    </Box>
                  ))}
                </Box>

                {/* equity curve */}
                {equityCurve.length > 1 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 700, display: "block", mb: 1 }}>Equity Curve (R)</Typography>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={equityCurve} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <XAxis dataKey="i" tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{ background: "#0d1321", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                          formatter={(v: any) => [`${v}R`, "Equity"]}
                          labelFormatter={(l) => `Trade #${l}`}
                        />
                        <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                        <Line type="monotone" dataKey="r" stroke={r.net_r >= 0 ? "#10b981" : "#ef4444"} dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </Box>
                )}

                {/* trade details */}
                {r.details?.length > 0 && (
                  <Box>
                    <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 700, display: "block", mb: 1 }}>รายการเทรดล่าสุด 20 ไม้</Typography>
                    <Box sx={{ overflowX: "auto" }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ "& th": { bgcolor: "#0a0f1e", color: "#475569", fontSize: "0.68rem", fontWeight: 700, borderBottomColor: "rgba(255,255,255,0.06)" } }}>
                            <TableCell>#</TableCell>
                            <TableCell>Side</TableCell>
                            <TableCell align="right">Result</TableCell>
                            <TableCell>Exit</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {r.details.slice(-20).reverse().map((t: any, idx: number) => (
                            <TableRow key={idx} sx={{ "& td": { borderBottomColor: "rgba(255,255,255,0.04)", py: 0.5 } }}>
                              <TableCell sx={{ color: "#475569", fontSize: "0.7rem" }}>{r.details.length - idx}</TableCell>
                              <TableCell>
                                <Chip size="small" label={t.action} color={t.action === "BUY" ? "success" : "error"}
                                  sx={{ height: 18, fontSize: "0.62rem", fontWeight: 800, "& .MuiChip-label": { px: 0.75 } }} />
                              </TableCell>
                              <TableCell align="right" sx={{ fontFamily: "ui-monospace,monospace", fontWeight: 700, fontSize: "0.82rem", color: t.r > 0 ? "#10b981" : "#ef4444" }}>
                                {t.r > 0 ? "+" : ""}{t.r}R
                              </TableCell>
                              <TableCell sx={{ color: "#64748b", fontSize: "0.7rem" }}>{t.reason === "tp" ? "TP ✓" : t.reason === "sl" ? "SL ✗" : "Timeout"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Box>
                  </Box>
                )}
              </Box>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <Button disabled={btLoading} onClick={() => setBtOpen(false)} sx={{ color: "#64748b" }}>ปิด</Button>
          <Button
            variant="contained"
            disabled={btLoading || !btSymbol}
            onClick={runBacktest}
            startIcon={btLoading ? <CircularProgress size={16} color="inherit" /> : <FlaskConical size={16} />}
            sx={{ bgcolor: "#fbbf24", color: "#111827", "&:hover": { bgcolor: "#f59e0b" }, fontWeight: 700 }}
          >
            {btLoading ? "กำลัง Backtest…" : "รัน Backtest"}
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
