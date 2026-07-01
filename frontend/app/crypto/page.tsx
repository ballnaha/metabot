"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useToastr } from "../components/Toastr";
import CryptoBotSettings from "./components/CryptoBotSettings";
import Sidebar, { SIDEBAR_W } from "../components/Sidebar";
import TopBar from "../components/TopBar";
import PnLChart from "./components/PnLChart";
import BotLog from "./components/BotLog";
import { isCryptoSymbol, isMetalSymbol } from "../lib/symbols";
import HistoryTable, { type HistoryDeal } from "../components/HistoryTable";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TablePagination,
  Typography,
  TextField,
  LinearProgress,
} from "@mui/material";
import {
  Activity,
  Layers,
  Coins,
  TrendingUp,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  History,
  Sliders,
  RefreshCw,
  ScrollText,
  Search,
  X,
  Zap,
  Info,
} from "lucide-react";

const STRATEGY_CONDITIONS: Record<string, {
  label: string;
  buy: string[];
  sell: string[];
  note?: string;
}> = {
  ema_macd_rsi: {
    label: "EMA + MACD + RSI",
    buy: [
      "EMA12 สูงกว่า EMA26 — แนวโน้มขาขึ้น (40% น้ำหนัก)",
      "MACD Histogram > 0 — momentum เป็นบวก (35%)",
      "RSI < 45 — ยังไม่ overbought (25%)",
    ],
    sell: [
      "EMA12 ต่ำกว่า EMA26 — แนวโน้มขาลง (40%)",
      "MACD Histogram < 0 — momentum เป็นลบ (35%)",
      "RSI > 55 — ยังไม่ oversold (25%)",
    ],
    note: "สัญญาณออกเมื่อ weighted score รวมเกิน 22% — ต้องการหลายอย่างพร้อมกัน",
  },
  trend: {
    label: "Trend Follow",
    buy: [
      "ราคาอยู่เหนือ EMA50 (45%)",
      "EMA50 มีความชันขึ้น — เทรนด์แข็งแกร่ง (30%)",
      "MACD Histogram > 0 — ยืนยัน momentum (25%)",
    ],
    sell: [
      "ราคาอยู่ใต้ EMA50 (45%)",
      "EMA50 มีความชันลง (30%)",
      "MACD Histogram < 0 (25%)",
    ],
    note: "เหมาะกับตลาดที่มีทิศทางชัด threshold 28%",
  },
  mean_reversion: {
    label: "Mean Reversion",
    buy: [
      "ราคาต่ำกว่า Bollinger Band midpoint (55%)",
      "RSI < 40 — oversold คาดเด้งกลับ (45%)",
    ],
    sell: [
      "ราคาสูงกว่า Bollinger Band midpoint (55%)",
      "RSI > 60 — overbought คาดย้อนกลับ (45%)",
    ],
    note: "TP คือ Bollinger midpoint (ไม่ใช่ R:R) — เหมาะตลาดไซด์เวย์ threshold 32%",
  },
  breakout: {
    label: "Breakout",
    buy: [
      "ราคาทะลุสูงสุดของ 20 แท่งก่อนหน้า (65%)",
      "MACD Histogram > 0 — ยืนยัน momentum (35%)",
    ],
    sell: [
      "ราคาทะลุต่ำสุดของ 20 แท่งก่อนหน้า (65%)",
      "MACD Histogram < 0 (35%)",
    ],
    note: "threshold สูงที่สุด 35% — ต้องทะลุชัดเจน ระวัง false breakout",
  },
  adaptive_trend: {
    label: "Adaptive Trend",
    buy: [
      "Trend pullback: EMA50 > EMA200, ADX >= 20, price reclaims EMA20",
      "Range reversal: price returns inside the lower Bollinger Band with RSI <= 42",
      "Breakout requires ADX >= 25 and volume >= 1.3x when enabled",
    ],
    sell: [
      "Trend pullback: EMA50 < EMA200, ADX >= 20, price rejects EMA20",
      "Range reversal: price returns inside the upper Bollinger Band with RSI >= 58",
      "Breakdown requires ADX >= 25 and volume >= 1.3x when enabled",
    ],
    note: "Uses closed H4 candles, structure-aware ATR stops, and both BUY/SELL setups.",
  },
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
  contract_size?: number | null;
  summary?: string;
};

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`/api/${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || res.statusText);
  return data;
}

const fmt = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined ? "—" : Number(n).toFixed(d);

// Compact price formatter for mobile — adapts decimal places to price magnitude
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

const MONO = { fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums" };
const formatBangkokTime = (value: string) => {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  const date = new Date(hasTimezone ? value : `${value}+07:00`);
  return date.toLocaleString("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  });
};

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
      {/* Desktop: spacious vertical layout */}
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
      {/* Mobile: compact horizontal layout */}
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

const actionColor = (a?: string): "success" | "error" | "default" =>
  a === "BUY" ? "success" : a === "SELL" ? "error" : "default";

const actionLabel = (a?: string) =>
  a === "BUY" ? "Long" : a === "SELL" ? "Short" : a || "รอ";

const scanLabel = (scan: ScanResult) => scan.risk_blocked
  ? `SKIP Risk (${actionLabel(scan.technical_action)} ${Math.round((scan.technical_confidence ?? scan.confidence) * 100)}%)`
  : `${actionLabel(scan.action)} ${Math.round(scan.confidence * 100)}%`;
const scanColor = (scan?: ScanResult): "success" | "error" | "warning" | "default" =>
  scan?.risk_blocked ? "warning" : actionColor(scan?.action);

const entryLabel = (entry?: string) =>
  entry === "IN" ? "เข้า" : entry === "OUT" ? "ออก" : entry || "—";

const strategyLabel = (name: string) =>
  ({
    adaptive_trend: "Adaptive Trend",
    squeeze_breakout: "Squeeze Breakout",
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

export default function CryptoPage() {
  const toastr = useToastr();

  // Mobile collapse state — collapsed by default on mobile
  const [priceTableOpen, setPriceTableOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [account, setAccount] = useState<Account | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [cryptoSymbol, setCryptoSymbol] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [priceSearch, setPriceSearch] = useState("");
  const [ticks, setTicks] = useState<Record<string, { bid: number; ask: number; last: number; time: number; error?: string }>>({});
  const [tickDirections, setTickDirections] = useState<Record<string, { bid: "up" | "down" | "flat"; ask: "up" | "down" | "flat"; lastUpdated: number }>>({});
  const [closingTicket, setClosingTicket] = useState<number | null>(null);
  const [closeCandidate, setCloseCandidate] = useState<Position | null>(null);
  const [settingsData, setSettingsData] = useState<any>(null);
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [conditionsOpen, setConditionsOpen] = useState(false);

  // Coin screener scores
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [scanLoading, setScanLoading] = useState(false);

  // Manual "analyze & trade" flow
  const [tradeStagingSymbol, setTradeStagingSymbol] = useState<string | null>(null);
  const [tradeConfirm, setTradeConfirm] = useState<Recommendation | null>(null);
  const [tradeExecuting, setTradeExecuting] = useState(false);
  const tradeExecutingRef = useRef(false);

  const [settingsForm, setSettingsForm] = useState<any>({
    position_sizing_mode: "risk_pct",
    max_open_trades: 5,
    max_crypto_open_trades: 5,
    stake_amount: 0.0,
    crypto_atr_sl_mult: 1.8,
    crypto_rr: 2.5,
    crypto_min_sl_pct: 0.0,
    bot_enabled: true,
    use_ai: false,
    auto_trade_interval: 60,
    crypto_strategy: "adaptive_trend",
    crypto_timeframe: "H4",
    magic: 556677,
    telegram_enabled: true,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const TF_SCAN_DEFAULTS: Record<string, number> = { M15: 3, M30: 5, H1: 15, H4: 30, D1: 60 };
  const [cryptoScanMins, setCryptoScanMinsRaw] = useState<number>(30);
  const setCryptoScanMins = useCallback((v: number) => {
    setCryptoScanMinsRaw(v);
    localStorage.setItem("crypto_scan_mins", String(v));
  }, []);
  // Read localStorage after mount (avoids SSR hydration mismatch)
  useEffect(() => {
    const saved = localStorage.getItem("crypto_scan_mins");
    if (saved) { setCryptoScanMinsRaw(parseInt(saved, 10) || 30); return; }
    if (settingsForm.crypto_timeframe) setCryptoScanMins(TF_SCAN_DEFAULTS[settingsForm.crypto_timeframe] ?? 30);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsForm.crypto_timeframe]);
  const [cryptoInput, setCryptoInput] = useState("");
  const [preservedNonCryptoSymbols, setPreservedNonCryptoSymbols] = useState<string[]>([]);
  const [detectingCryptoSymbols, setDetectingCryptoSymbols] = useState(false);
  const [validatingSymbols, setValidatingSymbols] = useState(false);

  // Realized Transaction History
  const [tradeHistory, setTradeHistory] = useState<HistoryDeal[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyRowsPerPage, setHistoryRowsPerPage] = useState(10);

  const connectedRef = useRef<boolean | null>(null);
  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  const fetchHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const data = await api("history?days=7");
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
        const allSyms = data.symbols ? data.symbols.split(",").map((s: string) => s.trim().toUpperCase()).filter(Boolean) : [];
        setCryptoInput(allSyms.filter(isCryptoSymbol).join(", "));
        setPreservedNonCryptoSymbols(allSyms.filter((s: string) => !isCryptoSymbol(s)));
        setSettingsForm({
          position_sizing_mode: data.position_sizing_mode || "risk_pct",
          max_open_trades: data.max_open_trades ?? 5,
          max_crypto_open_trades: data.max_crypto_open_trades ?? data.max_open_trades ?? 5,
          stake_amount: data.stake_amount ?? 0.0,
          crypto_atr_sl_mult: data.crypto_atr_sl_mult ?? 1.8,
          crypto_rr: data.crypto_rr ?? 2.5,
          crypto_min_sl_pct: data.crypto_min_sl_pct ?? 0.0,
          bot_enabled: data.bot_enabled ?? true,
          use_ai: data.use_ai ?? false,
          auto_trade_interval: data.auto_trade_interval ?? 60,
          crypto_strategy: data.crypto_strategy || "adaptive_trend",
          crypto_timeframe: data.crypto_timeframe || "H4",
          magic: data.magic ?? 556677,
          telegram_enabled: data.telegram_enabled ?? true,
        });
      })
      .catch(() => {});

    api("strategies")
      .then((data) => {
        const nextStrategies = data.strategies ?? [];
        setStrategies(nextStrategies);
        setSettingsForm((prev: any) => ({
          ...prev,
          crypto_strategy: nextStrategies.some((s: StrategyInfo) => s.name === prev.crypto_strategy)
            ? prev.crypto_strategy
            : "adaptive_trend",
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

  // Crypto page is intentionally scoped to crypto symbols only.
  const allBotSymbols = new Set(
    cryptoInput.split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .filter(isCryptoSymbol)
  );
  const isTrackedSymbol = (sym: string) => allBotSymbols.has(sym.toUpperCase());

  // Use configured symbol list when available, fall back to pattern detection initially.
  const cryptoSymbols = allBotSymbols.size > 0
    ? symbols.filter((s) => allBotSymbols.has(s.toUpperCase()))
    : symbols.filter(isCryptoSymbol);

  const filteredCryptoSymbols = priceSearch.trim()
    ? cryptoSymbols.filter((s) => s.toLowerCase().includes(priceSearch.trim().toLowerCase()))
    : cryptoSymbols;

  // Reset pagination page if symbols list or search changes
  useEffect(() => {
    setPage(0);
  }, [cryptoSymbols.length, priceSearch]);

  // Poll ticks for all crypto symbols in bulk every 3 seconds
  useEffect(() => {
    if (cryptoSymbols.length === 0) {
      return;
    }

    let active = true;

    const fetchAllTicks = async () => {
      try {
        const querySymbols = cryptoSymbols.join(",");
        const data = await api(`ticks?symbols=${querySymbols}`);
        if (!active) return;

        const now = Date.now();
        setTicks((prevTicks) => {
          const nextDirections: Record<string, { bid: "up" | "down" | "flat"; ask: "up" | "down" | "flat"; lastUpdated: number }> = {};
          
          for (const sym of cryptoSymbols) {
            const newTick = data[sym];
            const prevTick = prevTicks[sym];
            
            if (newTick && !newTick.error) {
              let bidDir: "up" | "down" | "flat" = "flat";
              let askDir: "up" | "down" | "flat" = "flat";
              
              if (prevTick && !prevTick.error) {
                if (newTick.bid > prevTick.bid) bidDir = "up";
                else if (newTick.bid < prevTick.bid) bidDir = "down";
                
                if (newTick.ask > prevTick.ask) askDir = "up";
                else if (newTick.ask < prevTick.ask) askDir = "down";
              }
              
              const prevDir = tickDirections[sym];
              if (bidDir === "flat" && prevDir && prevDir.bid !== "flat" && now - prevDir.lastUpdated < 1000) {
                bidDir = prevDir.bid;
              }
              if (askDir === "flat" && prevDir && prevDir.ask !== "flat" && now - prevDir.lastUpdated < 1000) {
                askDir = prevDir.ask;
              }
              
              const updatedLastUpdated = (bidDir !== "flat" || askDir !== "flat") 
                ? ((bidDir !== (prevDir?.bid ?? "flat") || askDir !== (prevDir?.ask ?? "flat")) ? now : (prevDir?.lastUpdated ?? now))
                : now;

              nextDirections[sym] = {
                bid: bidDir,
                ask: askDir,
                lastUpdated: updatedLastUpdated,
              };
            }
          }

          setTickDirections((prevDirs) => {
            const merged = { ...prevDirs };
            for (const sym of Object.keys(nextDirections)) {
              merged[sym] = nextDirections[sym];
            }
            return merged;
          });

          return data;
        });
      } catch (e: any) {
        console.warn("โหลดราคาล่าสุดของเหรียญไม่สำเร็จ:", e.message);
      }
    };

    fetchAllTicks();
    const intervalId = setInterval(fetchAllTicks, 10000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [JSON.stringify(cryptoSymbols)]);

  // Reset flashing directions back to flat after 1 second
  useEffect(() => {
    const activeDirs = Object.entries(tickDirections).filter(
      ([, dir]) => dir.bid !== "flat" || dir.ask !== "flat"
    );
    if (activeDirs.length === 0) return;

    const timer = setTimeout(() => {
      const now = Date.now();
      setTickDirections((prevDirs) => {
        const nextDirs = { ...prevDirs };
        let changed = false;
        for (const [sym, dir] of Object.entries(nextDirs)) {
          if (now - dir.lastUpdated >= 1000) {
            if (dir.bid !== "flat" || dir.ask !== "flat") {
              nextDirs[sym] = {
                bid: "flat",
                ask: "flat",
                lastUpdated: dir.lastUpdated,
              };
              changed = true;
            }
          }
        }
        return changed ? nextDirs : prevDirs;
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [tickDirections]);
  // Filter active positions managed by this bot
  const cryptoPositions = positions.filter((p) => isTrackedSymbol(p.symbol) && isCryptoSymbol(p.symbol));
  const ccy = account?.currency ?? "";
  const openPl = cryptoPositions.reduce((acc, curr) => acc + curr.profit, 0);
  const totalOpenPlPct = account && account.balance > 0 ? (openPl / account.balance) * 100 : 0;
  const totalOpenPlPctString = account && account.balance > 0
    ? ` (${totalOpenPlPct >= 0 ? "+" : ""}${totalOpenPlPct.toFixed(2)}%)`
    : "";

  const cryptoHistory = tradeHistory.filter((d) => isCryptoSymbol(d.symbol));
  const scanBySymbol = new Map(scanResults.map((r) => [r.symbol, r]));
  const historyPageStart = historyPage * historyRowsPerPage;
  const paginatedCryptoHistory = cryptoHistory.slice(historyPageStart, historyPageStart + historyRowsPerPage);
  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(cryptoHistory.length / historyRowsPerPage) - 1);
    setHistoryPage((current) => Math.min(current, maxPage));
  }, [cryptoHistory.length, historyRowsPerPage]);

  const cryptoClosedHistory = cryptoHistory.filter((d) => d.entry === "OUT");
  const realizedPl = cryptoClosedHistory.reduce((acc, curr) => acc + curr.profit, 0);
  const _cBotMagics = new Set([settingsForm.magic, settingsForm.gold_magic, settingsForm.stock_magic].filter(Boolean));
  const botOpenPl = cryptoPositions.filter((p) => _cBotMagics.has(p.magic)).reduce((acc, p) => acc + p.profit, 0);
  const manualOpenPl = cryptoPositions.filter((p) => !_cBotMagics.has(p.magic)).reduce((acc, p) => acc + p.profit, 0);
  const botRealizedPl = cryptoClosedHistory.filter((d) => _cBotMagics.has(d.magic)).reduce((acc, d) => acc + d.profit, 0);
  const manualRealizedPl = cryptoClosedHistory.filter((d) => !_cBotMagics.has(d.magic)).reduce((acc, d) => acc + d.profit, 0);

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
        body: JSON.stringify({ symbols: cryptoSymbols, strategy: settingsForm.crypto_strategy, timeframe: settingsForm.crypto_timeframe }),
      });
      setScanResults(data.results ?? []);
    } catch (e: any) {
      toastr.error(`สแกนเหรียญไม่สำเร็จ: ${e.message}`);
    } finally {
      setScanLoading(false);
    }
  }

  // Auto-scan trade scores: interval tied to timeframe (signal changes once per candle)
  useEffect(() => {
    if (cryptoSymbols.length === 0) return;
    const scanMs = cryptoScanMins * 60_000;

    let active = true;
    let inFlight = false;
    const refreshScores = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try { await runScan(); } finally { inFlight = false; }
    };

    refreshScores();
    const intervalId = setInterval(refreshScores, scanMs);
    return () => { active = false; clearInterval(intervalId); };
  }, [cryptoSymbols.join(","), settingsForm.crypto_strategy, settingsForm.crypto_timeframe, cryptoScanMins]);

  // Analyze a symbol, then ask for confirmation before placing the order.
  async function stageTrade(symbol: string) {
    setTradeStagingSymbol(symbol);
    try {
      const data = await api("analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          timeframe: settingsForm.crypto_timeframe,
          strategy: settingsForm.crypto_strategy,
          use_ai: settingsForm.use_ai,
          preview: true,
        }),
      });
      const rec = data.recommendation as Recommendation | undefined;
      if (!rec || rec.action === "HOLD") {
        toastr.warning(rec?.summary || `No trade signal for ${symbol} right now`);
        return;
      }
      setTradeConfirm(rec);
    } catch (e: any) {
      toastr.error(`Analyze failed: ${e.message}`);
    } finally {
      setTradeStagingSymbol(null);
    }
  }

  async function confirmTrade() {
    if (!tradeConfirm || tradeExecutingRef.current) return;
    const rec = tradeConfirm;
    const maxCryptoSlots = settingsForm.max_crypto_open_trades ?? settingsForm.max_open_trades ?? 1;
    if (cryptoPositions.some((p) => p.symbol.toUpperCase() === rec.symbol.toUpperCase())) {
      toastr.warning(`มี position ${rec.symbol} เปิดอยู่แล้ว`);
      setTradeConfirm(null);
      return;
    }
    if (cryptoPositions.length >= maxCryptoSlots) {
      toastr.warning(`ช่องคริปโตเต็มแล้ว (${cryptoPositions.length}/${maxCryptoSlots})`);
      setTradeConfirm(null);
      return;
    }
    tradeExecutingRef.current = true;
    setTradeExecuting(true);
    try {
      const lot = rec.suggested_lot ?? 0.01;
      await api("trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: rec.symbol,
          action: rec.action,
          lot,
          sl: rec.stop_loss ?? null,
          tp: rec.take_profit ?? null,
          signal_price: rec.price,
          timeframe: rec.timeframe,
          strategy: settingsForm.crypto_strategy,
        }),
      });
      toastr.success(`Opened ${rec.symbol} ${actionLabel(rec.action)} trade`);
      setTradeConfirm(null);
      refresh();
      fetchHistory();
    } catch (e: any) {
      toastr.error(`Trade failed: ${e.message}`);
    } finally {
      tradeExecutingRef.current = false;
      setTradeExecuting(false);
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

  // Auto-detect crypto symbols from MT5 broker
  const autoDetectCryptoSymbols = async () => {
    setDetectingCryptoSymbols(true);
    try {
      const data = await api("symbols/detect-crypto");
      if (data.symbols && data.symbols.length > 0) {
        setCryptoInput(data.symbols.join(", "));
        toastr.success(`ตรวจพบสัญลักษณ์คริปโต ${data.symbols.length} รายการ`);
      } else {
        toastr.warning("ไม่พบสัญลักษณ์คริปโตบนโบรกเกอร์ MT5 ของคุณ");
      }
    } catch (e: any) {
      toastr.error(`ตรวจหาเหรียญไม่สำเร็จ: ${e.message}`);
    } finally {
      setDetectingCryptoSymbols(false);
    }
  };

  const validateSymbols = async () => {
    setValidatingSymbols(true);
    try {
      const allSyms = [
        ...cryptoInput.split(","),
      ].map((s) => s.trim().toUpperCase()).filter(Boolean).filter(isCryptoSymbol);

      if (allSyms.length === 0) {
        toastr.warning("ไม่มี symbol ในรายการ");
        return;
      }

      const MAX_SPREAD_PCT = 0.02; // drop crypto whose spread exceeds 2% of price
      const data = await api("symbols/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: allSyms, max_spread_pct: MAX_SPREAD_PCT }),
      });

      // `valid` is the broker's resolved names (e.g. SOLUSD -> SOLUSDm) and
      // already excludes missing (`invalid`) and wide-spread symbols. Replace
      // the list with those resolved names directly — matching the old input
      // names against resolved ones would drop everything (SOLUSD != SOLUSDm).
      const valid: string[] = data.valid ?? [];
      const missing: string[] = data.invalid ?? [];
      const wide: { symbol: string; spread_pct: number }[] = data.wide_spread ?? [];

      setCryptoInput(valid.join(", "));

      const parts: string[] = [`เหลือ ${valid.length} เหรียญที่เทรดได้`];
      if (missing.length > 0) {
        parts.push(`ไม่มีใน MT5 ${missing.length} ตัว: ${missing.join(", ")}`);
      }
      if (wide.length > 0) {
        const detail = wide
          .map((w) => `${w.symbol} (${(w.spread_pct * 100).toFixed(1)}%)`)
          .join(", ");
        parts.push(`spread กว้างเกิน ${(MAX_SPREAD_PCT * 100).toFixed(0)}% ${wide.length} ตัว: ${detail}`);
      }
      if (missing.length === 0 && wide.length === 0) {
        toastr.success(`ทุก symbol (${valid.length} รายการ) เทรดได้ — spread ผ่านเกณฑ์`);
      } else {
        toastr.success(parts.join(" | "));
      }
    } catch (e: any) {
      toastr.error(`ตรวจสอบ symbol ไม่สำเร็จ: ${e.message}`);
    } finally {
      setValidatingSymbols(false);
    }
  };

  // Save Settings directly on the page
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const nextCryptoSymbols = cryptoInput
        .split(",")
        .map(x => x.trim().toUpperCase())
        .filter(Boolean)
        .filter(isCryptoSymbol);
      const combined = Array.from(new Set([...preservedNonCryptoSymbols, ...nextCryptoSymbols])).join(",");

      const updatedForm = {
        ...settingsForm,
        symbols: combined
      };

      const res = await api("settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedForm),
      });
      if (res && res.restarting) {
        toastr.success("บันทึกการตั้งค่าสำเร็จ กำลังรีสตาร์ทเซิร์ฟเวอร์หลังบ้าน...");
      } else {
        toastr.success("บันทึกการตั้งค่าสำเร็จ");
      }

      setSettingsOpen(false);

      // Reload configurations (with safety check in case server is restarting)
      try {
        const data = await api("settings");
        setSettingsData(data);
  
        const nextSyms = data.symbols ? data.symbols.split(",").map((s: string) => s.trim().toUpperCase()).filter(Boolean) : [];
        setPreservedNonCryptoSymbols(nextSyms.filter(isMetalSymbol));
        setSymbols(nextSyms);
        const nextCryptos = nextSyms.filter(isCryptoSymbol);
        if (!nextCryptos.includes(cryptoSymbol)) {
          setCryptoSymbol(nextCryptos[0] || "BTCUSD");
        }
      } catch (e) {
        console.warn("เซิร์ฟเวอร์กำลังรีสตาร์ท จะโหลดการตั้งค่าใหม่โดยอัตโนมัติเมื่อระบบออนไลน์", e);
      }
    } catch (e: any) {
      toastr.error(`บันทึกการตั้งค่าไม่สำเร็จ: ${e.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDirectChangeStrategy = async (newStrat: string) => {
    setSettingsForm((prev: any) => ({ ...prev, crypto_strategy: newStrat }));
    try {
      const updatedForm = {
        ...settingsForm,
        crypto_strategy: newStrat
      };
      await api("settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedForm),
      });
      toastr.success("เปลี่ยนกลยุทธ์สำเร็จ");
    } catch (e: any) {
      toastr.error(`เปลี่ยนกลยุทธ์ไม่สำเร็จ: ${e.message}`);
    }
  };

  const activeStrategy = strategies.find((s) => s.name === settingsForm.crypto_strategy);
  const strategyDescription = activeStrategy?.description ?? "";
  const selectedStrategyValue = activeStrategy ? settingsForm.crypto_strategy : "";
  const getDecimals = (sym: string) => {
    const s = sym.toUpperCase();
    if (s.includes("BTC") || s.includes("ETH")) return 2;
    if (s.includes("SOL") || s.includes("AVAX") || s.includes("LTC") || s.includes("BCH")) return 2;
    if (s.includes("XRP") || s.includes("ADA") || s.includes("DOT") || s.includes("DOGE") || s.includes("XLM") || s.includes("ALGO")) return 4;
    if (s.includes("SHIB") || s.includes("PEPE") || s.includes("BONK") || s.includes("FLOKI")) return 8;
    return 5; // default fallback
  };

  const PriceDirection = ({
    value,
    direction,
  }: {
    value: string;
    direction: "up" | "down" | "flat";
  }) => {
    const color = direction === "up" ? "#10b981" : direction === "down" ? "#ef4444" : "#cbd5e1";
    const icon = direction === "up"
      ? <ArrowUp size={13} strokeWidth={2.4} />
      : direction === "down"
      ? <ArrowDown size={13} strokeWidth={2.4} />
      : null;

    return (
      <Stack
        component="span"
        direction="row"
        spacing={0.5}
        sx={{
          ...MONO,
          alignItems: "center",
          justifyContent: "flex-end",
          color,
          fontWeight: 700,
          lineHeight: 1.2,
          minWidth: 96,
          transition: "color 0.2s ease-out",
        }}
      >
        <Box component="span">{value}</Box>
        <Box
          component="span"
          sx={{
            width: 14,
            height: 14,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color,
            opacity: icon ? 1 : 0.35,
          }}
        >
          {icon}
        </Box>
      </Stack>
    );
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "#090d16", color: "#e2e8f0" }}>
      <Sidebar
        connected={connected}
        equity={account?.equity}
        currency={ccy}
        onOpenLog={() => setLogOpen(true)}
        onSync={() => { refresh(); fetchHistory(); }}
      />

      {/* Main Content — offset by sidebar width */}
      <Box sx={{ flexGrow: 1, ml: { xs: 0, md: `${SIDEBAR_W}px` }, pb: { xs: "72px", md: 0 }, display: "flex", flexDirection: "column" }}>
        <TopBar
          pageTitle="Crypto Terminal"
          pageIcon={<Coins size={15} />}
          connected={connected}
          accountLogin={account?.login}
          balance={account?.balance}
          equity={account?.equity}
          currency={ccy}
          openPl={openPl}
          botEnabled={settingsForm.bot_enabled ?? false}
          strategy={settingsForm.crypto_strategy ?? ""}
          aiEnabled={settingsForm.use_ai}
          assetType="crypto"
          onChangeStrategy={handleDirectChangeStrategy}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <Container maxWidth={false} sx={{ width: "100%", maxWidth: "none", px: { xs: 2, md: 3 }, py: 3 }}>

          {/* Account Status Card Row */}
          <Box sx={{ display: "grid", gap: { xs: 0.75, md: 1.5 }, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, minmax(0, 1fr))" }, mb: { xs: 1.5, md: 2.5 } }}>
            <StatCard
              icon={<Coins size={18} />}
              label="Crypto Symbols"
              value={cryptoSymbols.length}
              tone="#60a5fa"
              sub="รายการที่สแกนและเทรด"
            />
            <StatCard
              icon={<Activity size={18} />}
              label="Open Crypto P/L"
              value={`${openPl >= 0 ? "+" : ""}${fmt(openPl)} ${ccy}`}
              tone={openPl >= 0 ? "#10b981" : "#ef4444"}
              sub={
                <Box sx={{ mt: 0.5 }}>
                  <Typography variant="caption" sx={{ color: "#60a5fa", display: "block", lineHeight: 1.5 }}>
                    Bot: {botOpenPl >= 0 ? "+" : ""}{fmt(botOpenPl)}
                  </Typography>
                  {manualOpenPl !== 0 && (
                    <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", lineHeight: 1.5 }}>
                      Manual: {manualOpenPl >= 0 ? "+" : ""}{fmt(manualOpenPl)}
                    </Typography>
                  )}
                  <Typography variant="caption" sx={{ color: "#64748b", display: "block", lineHeight: 1.5 }}>
                    {cryptoPositions.length} positions
                  </Typography>
                </Box>
              }
            />
            <StatCard
              icon={<TrendingUp size={18} />}
              label="Realized 7D"
              value={`${realizedPl >= 0 ? "+" : ""}${fmt(realizedPl)} ${ccy}`}
              tone={realizedPl >= 0 ? "#10b981" : "#ef4444"}
              sub={
                <Box sx={{ mt: 0.5 }}>
                  <Typography variant="caption" sx={{ color: "#60a5fa", display: "block", lineHeight: 1.5 }}>
                    Bot: {botRealizedPl >= 0 ? "+" : ""}{fmt(botRealizedPl)}
                  </Typography>
                  {manualRealizedPl !== 0 && (
                    <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", lineHeight: 1.5 }}>
                      Manual: {manualRealizedPl >= 0 ? "+" : ""}{fmt(manualRealizedPl)}
                    </Typography>
                  )}
                  <Typography variant="caption" sx={{ color: "#64748b", display: "block", lineHeight: 1.5 }}>
                    {cryptoClosedHistory.length} closed deals
                  </Typography>
                </Box>
              }
            />
            <StatCard
              icon={<Sliders size={18} />}
              label="Crypto Capacity"
              value={`${cryptoPositions.length}/${settingsForm.max_crypto_open_trades ?? settingsForm.max_open_trades}`}
              tone="#8b5cf6"
              sub={
                <Box>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(100, (cryptoPositions.length / Math.max(1, settingsForm.max_crypto_open_trades ?? settingsForm.max_open_trades)) * 100)}
                    sx={{
                      mt: 0.75,
                      height: 5,
                      borderRadius: 99,
                      bgcolor: "rgba(255,255,255,0.05)",
                      "& .MuiLinearProgress-bar": { bgcolor: "#8b5cf6" },
                    }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                    Max crypto slots: {settingsForm.max_crypto_open_trades ?? settingsForm.max_open_trades}
                  </Typography>
                </Box>
              }
            />
          </Box>

          {/* Compact scan-info bar */}
          {(() => {
            const TF_MINS: Record<string, number> = { M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440 };
            const tf = settingsForm.crypto_timeframe || "H4";
            const tradeMins = TF_MINS[tf] ?? 240;
            const strat = settingsForm.crypto_strategy || "adaptive_trend";
            const cond = STRATEGY_CONDITIONS[strat];
            return (
              <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.75, md: 2 }, mb: { xs: 1, md: 2 }, px: 0.5, flexWrap: "wrap" }}>
                {/* scan rhythm pills */}
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.4, px: { xs: 0.75, md: 1.25 }, py: { xs: 0.3, md: 0.5 }, borderRadius: 99, bgcolor: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)" }}>
                    <Zap size={11} color="#60a5fa" />
                    <Typography sx={{ fontSize: { xs: "0.62rem", md: "0.72rem" }, fontWeight: 700, color: "#60a5fa", whiteSpace: "nowrap" }}>
                      <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>สแกน Signal ทุก </Box>{cryptoScanMins}<Box component="span" sx={{ display: { xs: "none", md: "inline" } }}> นาที</Box><Box component="span" sx={{ display: { xs: "inline", md: "none" } }}>m</Box>
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.4, px: { xs: 0.75, md: 1.25 }, py: { xs: 0.3, md: 0.5 }, borderRadius: 99, bgcolor: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.18)" }}>
                    <TrendingUp size={11} color="#10b981" />
                    <Typography sx={{ fontSize: { xs: "0.62rem", md: "0.72rem" }, fontWeight: 700, color: "#10b981", whiteSpace: "nowrap" }}>
                      <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>ซื้อขายได้ทุก {tradeMins >= 60 ? `${tradeMins / 60} ชม.` : `${tradeMins} นาที`} </Box>({tf})
                    </Typography>
                  </Box>
                </Stack>

                {/* conditions button */}
                {cond && (
                  <Button
                    size="small"
                    variant="text"
                    startIcon={<Info size={13} />}
                    onClick={() => setConditionsOpen(true)}
                    sx={{ fontSize: "0.72rem", color: "#475569", px: 1, py: 0.4, minWidth: 0, "&:hover": { color: "#94a3b8", bgcolor: "rgba(255,255,255,0.04)" }, display: { xs: "none", sm: "inline-flex" } }}
                  >
                    เงื่อนไขการเข้าเทรด
                  </Button>
                )}
              </Box>
            );
          })()}

          {/* Conditions Modal */}
          {(() => {
            const strat = settingsForm.crypto_strategy || "adaptive_trend";
            const cond = STRATEGY_CONDITIONS[strat];
            if (!cond) return null;
            return (
              <Dialog open={conditionsOpen} onClose={() => setConditionsOpen(false)} maxWidth="sm" fullWidth
                slotProps={{ paper: { sx: { bgcolor: "#0d1321", border: "1px solid rgba(59,130,246,0.2)", backgroundImage: "none" } } }}
              >
                <DialogTitle sx={{ pb: 1 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Info size={16} color="#60a5fa" />
                    <Box>
                      <Typography sx={{ fontWeight: 800, color: "#f1f5f9", fontSize: "0.95rem" }}>
                        เงื่อนไขการเข้าเทรด — {cond.label}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "#475569" }}>
                        {settingsForm.crypto_timeframe} · ATR SL ×{settingsForm.crypto_atr_sl_mult} · R:R {settingsForm.crypto_rr}{settingsForm.use_ai ? " · AI ON" : ""}
                      </Typography>
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
                      <Stack spacing={0.6}>
                        {cond.buy.map((c, i) => (
                          <Stack key={i} direction="row" spacing={0.75} sx={{ alignItems: "flex-start" }}>
                            <Box sx={{ width: 4, height: 4, borderRadius: "50%", bgcolor: "#10b981", mt: 0.75, flexShrink: 0 }} />
                            <Typography variant="caption" sx={{ color: "#94a3b8", lineHeight: 1.55 }}>{c}</Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </Box>
                    <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.18)" }}>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 1 }}>
                        <ArrowDown size={14} color="#ef4444" />
                        <Typography sx={{ fontSize: "0.75rem", fontWeight: 800, color: "#ef4444" }}>SELL เมื่อ</Typography>
                      </Stack>
                      <Stack spacing={0.6}>
                        {cond.sell.map((c, i) => (
                          <Stack key={i} direction="row" spacing={0.75} sx={{ alignItems: "flex-start" }}>
                            <Box sx={{ width: 4, height: 4, borderRadius: "50%", bgcolor: "#ef4444", mt: 0.75, flexShrink: 0 }} />
                            <Typography variant="caption" sx={{ color: "#94a3b8", lineHeight: 1.55 }}>{c}</Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </Box>
                  </Box>
                  {cond.note && (
                    <Box sx={{ mt: 1.5, px: 1.25, py: 0.75, bgcolor: "rgba(59,130,246,0.06)", borderRadius: 1, border: "1px solid rgba(59,130,246,0.15)" }}>
                      <Typography variant="caption" sx={{ color: "#60a5fa" }}>💡 {cond.note}</Typography>
                    </Box>
                  )}
                </DialogContent>
                <DialogActions sx={{ borderTop: "1px solid rgba(255,255,255,0.07)", px: 2 }}>
                  <Button size="small" onClick={() => setConditionsOpen(false)} sx={{ color: "#64748b" }}>ปิด</Button>
                </DialogActions>
              </Dialog>
            );
          })()}

          {/* Main workspace: chart + live positions side-by-side on wide screens */}
          <Box
            sx={{
              display: "grid",
              gap: 4,
              gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.75fr) minmax(380px, 0.9fr)" },
              alignItems: "start",
            }}
          >
            {/* Left Column: Live Chart */}
            <Stack spacing={4}>
              {/* Crypto Price Table */}
              <Card sx={{ bgcolor: "#0d1321", border: "1px solid rgba(255, 255, 255, 0.03)" }}>
                <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
                  <Stack
                    direction="row"
                    sx={{
                      justifyContent: "space-between",
                      alignItems: "center",
                      p: { xs: 1.25, md: 2 },
                      gap: 1,
                      flexWrap: "wrap",
                      cursor: { xs: "pointer", md: "default" },
                    }}
                    onClick={(e) => {
                      // toggle only when clicking the header row on mobile
                      const target = e.target as HTMLElement;
                      if (window.innerWidth < 900 && !target.closest("input, button")) {
                        setPriceTableOpen((v) => !v);
                      }
                    }}
                  >
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <SectionTitle icon={<Activity size={18} color="#3b82f6" />}>
                        <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>ราคารายเหรียญคริปโต Real-time</Box>
                        <Box component="span" sx={{ display: { xs: "inline", md: "none" } }}>ราคา Crypto</Box>
                      </SectionTitle>
                      <Box sx={{ display: { xs: "flex", md: "none" }, color: "#475569", mb: 2 }}>
                        {priceTableOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flex: { xs: "1 1 100%", md: "0 0 auto" }, display: { xs: priceTableOpen ? "flex" : "none", md: "flex" } }}>
                      {/* Search box */}
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 0.75,
                          height: { xs: 34, md: 38 },
                          px: 1,
                          flex: 1,
                          minWidth: { xs: 0, md: 190 },
                          bgcolor: "rgba(255,255,255,0.02)",
                          border: "1px solid rgba(255,255,255,0.07)",
                          borderRadius: 1,
                          transition: "border-color 0.2s",
                          "&:focus-within": { borderColor: "rgba(59,130,246,0.5)" },
                        }}
                      >
                        <Search size={13} color="#475569" />
                        <input
                          value={priceSearch}
                          onChange={(e) => setPriceSearch(e.target.value)}
                          placeholder="ค้นหา..."
                          style={{
                            background: "transparent",
                            border: "none",
                            outline: "none",
                            color: "#e2e8f0",
                            fontSize: "0.82rem",
                            width: "100%",
                            fontFamily: "inherit",
                          }}
                        />
                        {priceSearch && (
                          <Box
                            onClick={() => setPriceSearch("")}
                            sx={{ cursor: "pointer", color: "#475569", display: "flex", "&:hover": { color: "#94a3b8" } }}
                          >
                            <X size={12} />
                          </Box>
                        )}
                      </Box>
                      <IconButton
                        size="small"
                        onClick={runScan}
                        disabled={scanLoading || cryptoSymbols.length === 0}
                        sx={{
                          width: { xs: 34, md: "auto" },
                          height: { xs: 34, md: 38 },
                          borderRadius: 1,
                          px: { xs: 0, md: 1.5 },
                          bgcolor: "#2563eb",
                          color: "#fff",
                          "&:hover": { bgcolor: "#1d4ed8" },
                          "&.Mui-disabled": { bgcolor: "rgba(37,99,235,0.3)", color: "rgba(255,255,255,0.4)" },
                        }}
                      >
                        {scanLoading ? <CircularProgress size={14} color="inherit" /> : <RefreshCw size={16} />}
                      </IconButton>
                      <Chip
                        size="small"
                        label="10s"
                        color="success"
                        variant="outlined"
                        sx={{ fontSize: 10, height: 20, px: 0, borderColor: "rgba(16, 185, 129, 0.3)", color: "#10b981", bgcolor: "rgba(16, 185, 129, 0.04)", display: { xs: "none", sm: "inline-flex" } }}
                      />
                      <Chip
                        size="small"
                        label={`${cryptoScanMins}m`}
                        variant="outlined"
                        sx={{ fontSize: 10, height: 20, px: 0, borderColor: "rgba(59, 130, 246, 0.3)", color: "#60a5fa", bgcolor: "rgba(59, 130, 246, 0.04)", display: { xs: "none", sm: "inline-flex" } }}
                      />
                    </Stack>
                  </Stack>

                  <Box sx={{ display: priceTableOpen ? undefined : { xs: "none", md: "block" } }}>
                  {cryptoSymbols.length === 0 ? (
                    <Box sx={{ py: 6, textAlign: "center", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 2.5 }}>
                      <Typography color="text.secondary">กรุณาเพิ่มเหรียญคริปโตในหน้าตั้งค่าก่อน</Typography>
                    </Box>
                  ) : (
                    <Box sx={{ overflowX: "auto" }}>
                      {/* DESKTOP TABLE VIEW - Renders on sm (tablet) and up */}
                      <Box sx={{ display: { xs: "none", sm: "block" } }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ "& th": { borderBottomColor: "rgba(255,255,255,0.08)", bgcolor: "#0d1321" } }}>
                              <TableCell>Symbol</TableCell>
                              <TableCell align="right">Bid</TableCell>
                              <TableCell align="right">Ask</TableCell>
                              <TableCell align="right">Spread</TableCell>
                              <TableCell align="center">Signal</TableCell>
                              <TableCell align="right">Action</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {filteredCryptoSymbols.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((sym) => {
                              const tick = ticks[sym];
                              const dir = tickDirections[sym] || { bid: "flat", ask: "flat" };
                              const decimals = getDecimals(sym);
                              const bidVal = tick && !tick.error ? tick.bid : null;
                              const askVal = tick && !tick.error ? tick.ask : null;
                              const spreadVal = bidVal !== null && askVal !== null ? askVal - bidVal : null;
                              const isSelected = cryptoSymbol === sym;
                              const scan = scanBySymbol.get(sym);
                              return (
                                <TableRow
                                  key={sym}
                                  hover
                                  onClick={() => handleCryptoSymbolChange(sym)}
                                  sx={{
                                    cursor: "pointer",
                                    bgcolor: isSelected ? "rgba(59, 130, 246, 0.08)" : "transparent",
                                    transition: "background-color 0.15s, border-color 0.15s",
                                    "& td": { borderBottomColor: "rgba(255,255,255,0.04)" },
                                    "&:hover": {
                                      bgcolor: isSelected ? "rgba(59, 130, 246, 0.1)" : "rgba(255, 255, 255, 0.025)",
                                    },
                                  }}
                                >
                                  <TableCell>
                                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                      <Coins size={15} color="#60a5fa" />
                                      <Typography sx={{ ...MONO, fontWeight: 800, color: isSelected ? "#60a5fa" : "#fff" }}>{sym}</Typography>
                                    </Stack>
                                  </TableCell>
                                  <TableCell align="right" sx={{ py: 1.25 }}>
                                    <PriceDirection value={bidVal !== null ? bidVal.toFixed(decimals) : "—"} direction={dir.bid} />
                                  </TableCell>
                                  <TableCell align="right" sx={{ py: 1.25 }}>
                                    <PriceDirection value={askVal !== null ? askVal.toFixed(decimals) : "—"} direction={dir.ask} />
                                  </TableCell>
                                  <TableCell align="right" sx={{ py: 1.25, ...MONO, fontWeight: 650, color: "#cbd5e1" }}>
                                    {spreadVal !== null ? spreadVal.toFixed(decimals) : "—"}
                                  </TableCell>
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
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        stageTrade(sym);
                                      }}
                                      startIcon={
                                        tradeStagingSymbol === sym ? (
                                          <CircularProgress size={14} color="inherit" />
                                        ) : (
                                          <Zap size={14} />
                                        )
                                      }
                                      sx={{
                                        height: 32,
                                        borderRadius: 1,
                                        fontWeight: 700,
                                        fontSize: "0.82rem",
                                        textTransform: "none",
                                      }}
                                    >
                                      {tradeStagingSymbol === sym ? "กำลังวิเคราะห์..." : "วิเคราะห์ & เทรด"}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </Box>

                      {/* MOBILE COMPACT LIST - Renders on phone only */}
                      <Box sx={{ display: { xs: "block", sm: "none" } }}>
                        {filteredCryptoSymbols.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((sym) => {
                          const tick = ticks[sym];
                          const dir = tickDirections[sym] || { bid: "flat", ask: "flat" };
                          const decimals = getDecimals(sym);
                          const bidVal = tick && !tick.error ? tick.bid : null;
                          const askVal = tick && !tick.error ? tick.ask : null;
                          const spreadVal = bidVal !== null && askVal !== null ? askVal - bidVal : null;
                          const isSelected = cryptoSymbol === sym;
                          const scan = scanBySymbol.get(sym);
                          return (
                            <Box
                              key={sym}
                              onClick={() => handleCryptoSymbolChange(sym)}
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1.25,
                                px: 1.5,
                                py: 1.25,
                                borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                                bgcolor: isSelected ? "rgba(59, 130, 246, 0.08)" : "transparent",
                                cursor: "pointer",
                                transition: "background-color 0.12s",
                                "&:active": { bgcolor: "rgba(59, 130, 246, 0.14)" },
                              }}
                            >
                              {/* Symbol + spread */}
                              <Box sx={{ minWidth: 0, flex: "0 0 auto", width: 90 }}>
                                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                                  <Coins size={14} color={isSelected ? "#60a5fa" : "#475569"} />
                                  <Typography noWrap sx={{ ...MONO, fontWeight: 800, fontSize: "0.82rem", color: isSelected ? "#60a5fa" : "#e2e8f0" }}>
                                    {sym.replace(/m$/, "")}
                                  </Typography>
                                </Stack>
                                <Typography sx={{ ...MONO, fontSize: "0.6rem", color: "#475569", mt: 0.15, pl: 2.25 }}>
                                  spd {spreadVal !== null ? spreadVal.toFixed(decimals) : "—"}
                                </Typography>
                              </Box>

                              {/* Bid price — center */}
                              <Box sx={{ flex: 1, textAlign: "right", minWidth: 0 }}>
                                <PriceDirection value={bidVal !== null ? bidVal.toFixed(decimals) : "—"} direction={dir.bid} />
                                <Typography sx={{ ...MONO, fontSize: "0.58rem", color: "#475569", mt: 0.1 }}>
                                  ask {askVal !== null ? askVal.toFixed(decimals) : "—"}
                                </Typography>
                              </Box>

                              {/* Signal + quick trade */}
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
                                    color: "#3b82f6",
                                    fontSize: "0.62rem",
                                    fontWeight: 700,
                                    opacity: tradeStagingSymbol === sym ? 0.4 : 1,
                                    "&:active": { opacity: 0.6 },
                                  }}
                                >
                                  {tradeStagingSymbol === sym ? <CircularProgress size={10} color="inherit" /> : <Zap size={10} />}
                                  เทรด
                                </Box>
                              </Stack>
                            </Box>
                          );
                        })}
                      </Box>
                      <TablePagination
                        rowsPerPageOptions={[5, 10, 20, 50]}
                        component="div"
                        count={filteredCryptoSymbols.length}
                        rowsPerPage={rowsPerPage}
                        page={page}
                        onPageChange={(_event, newPage) => setPage(newPage)}
                        onRowsPerPageChange={(event) => {
                          setRowsPerPage(parseInt(event.target.value, 10));
                          setPage(0);
                        }}
                        labelRowsPerPage="เหรียญต่อหน้า:"
                        sx={{
                          color: "#cbd5e1",
                          borderTop: "1px solid rgba(255,255,255,0.08)",
                          "& .MuiTablePagination-selectIcon": { color: "#64748b" },
                          "& .MuiIconButton-root": { color: "#cbd5e1" },
                          "& .MuiIconButton-root.Mui-disabled": { color: "rgba(255,255,255,0.25)" }
                        }}
                      />
                    </Box>
                  )}
                  </Box>{/* end collapsible price table body */}
                </CardContent>
              </Card>
            </Stack>

            {/* Right Column: Active Positions sidebar */}
            <Stack spacing={4}>
              <Card sx={{ bgcolor: "#0d1321", border: { xs: "none", md: "1px solid rgba(255,255,255,0.03)" }, borderRadius: { xs: 0, md: 1 }, position: { lg: "sticky" }, top: { lg: 16 }, mx: { xs: -2, md: 0 } }}>
                <CardContent sx={{ p: { xs: 0, md: 2 }, "&:last-child": { pb: { xs: 0, md: 2 } } }}>
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.25, px: { xs: 1.5, md: 0 }, pt: { xs: 1.25, md: 0 } }}>
                    <SectionTitle icon={<Layers size={16} color="#3b82f6" />}>ออเดอร์คริปโตที่เปิดอยู่</SectionTitle>
                    {cryptoPositions.length > 0 && (
                      <Chip
                        size="small"
                        label={`${openPl >= 0 ? "+" : ""}${fmt(openPl)} ${ccy}${totalOpenPlPctString}`}
                        color={openPl >= 0 ? "success" : "error"}
                        sx={{ fontWeight: 800, px: 1 }}
                      />
                    )}
                  </Stack>
                  {cryptoPositions.length === 0 ? (
                    <Box sx={{ py: 4, textAlign: "center", px: 2 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                        ยังไม่มีออเดอร์คริปโตที่เปิดอยู่
                      </Typography>
                    </Box>
                  ) : (
                    <Box>
                      {cryptoPositions.map((p) => {
                        const pct = p.price_open > 0
                          ? (p.type === "BUY"
                              ? ((p.price_current - p.price_open) / p.price_open) * 100
                              : ((p.price_open - p.price_current) / p.price_open) * 100)
                          : 0;
                        const isProfit = p.profit >= 0;
                        const marginVal = (p.margin != null && p.margin > 0) ? p.margin : null;
                        const notionalVal = p.volume * p.price_open * (p.contract_size ?? 1.0);
                        const botMagics = new Set([settingsForm.magic, settingsForm.gold_magic, settingsForm.stock_magic].filter(Boolean));
                        const isBot = botMagics.has(p.magic);
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
                                  <Chip size="small" label={actionLabel(p.type)} color={actionColor(p.type)} variant="outlined" sx={{ flexShrink: 0, height: 22, borderRadius: 1, fontWeight: 800, fontSize: 10 }} />
                                  <Box sx={{ minWidth: 0 }}>
                                    <Typography noWrap sx={{ fontWeight: 750, lineHeight: 1.15 }}>{p.symbol}</Typography>
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.2 }}>
                                      <Typography variant="caption" color="text.secondary" sx={{ ...MONO, lineHeight: 1.2 }}>Ticket #{p.ticket}</Typography>
                                      <Chip size="small" label={isBot ? "Bot" : "Manual"} sx={{ height: 14, fontSize: 9, fontWeight: 800, borderRadius: 0.5, bgcolor: isBot ? "rgba(59,130,246,0.12)" : "rgba(148,163,184,0.1)", color: isBot ? "#60a5fa" : "#94a3b8", border: `1px solid ${isBot ? "rgba(59,130,246,0.25)" : "rgba(148,163,184,0.15)"}`, "& .MuiChip-label": { px: 0.6 } }} />
                                    </Box>
                                  </Box>
                                </Stack>
                                <Stack direction="row" spacing={0.75} sx={{ alignItems: "flex-start", flexShrink: 0 }}>
                                  <Box sx={{ textAlign: "right" }}>
                                    <Typography sx={{ ...MONO, fontWeight: 850, lineHeight: 1.15, color: isProfit ? "#10b981" : "#ef4444" }}>{isProfit ? "+" : ""}{fmt(p.profit)} {ccy}</Typography>
                                    <Typography variant="caption" sx={{ ...MONO, display: "block", lineHeight: 1.2, color: isProfit ? "#10b981" : "#ef4444", fontWeight: 700 }}>{pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</Typography>
                                  </Box>
                                  <IconButton size="small" color="error" disabled={closingTicket === p.ticket} onClick={() => setCloseCandidate(p)} sx={{ width: 28, height: 28, borderRadius: 1, border: "1px solid rgba(239,68,68,0.28)", bgcolor: "rgba(239,68,68,0.06)", color: "#f87171", flexShrink: 0, "&:hover": { borderColor: "#ef4444", bgcolor: "rgba(239,68,68,0.13)" } }}>
                                    {closingTicket === p.ticket ? <CircularProgress size={14} color="inherit" /> : <X size={15} />}
                                  </IconButton>
                                </Stack>
                              </Stack>
                              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 0.75, p: 1, borderRadius: 1, bgcolor: "rgba(255,255,255,0.025)", mb: 0.75 }}>
                                {[{ label: "Lot", value: fmt(p.volume, 2) }, { label: "เข้า", value: fmt(p.price_open, 2) }, { label: "ปัจจุบัน", value: fmt(p.price_current, 2) }, { label: marginVal != null ? "Margin" : "Notional", value: fmt(marginVal ?? notionalVal, 2) }].map((cell) => (
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
                                      <Typography sx={{ ...MONO, fontSize: "0.82rem", fontWeight: 800, color: "#f87171" }}>{fmt(p.sl, 4)}</Typography>
                                      <Typography variant="caption" sx={{ ...MONO, color: "#64748b", fontSize: "0.68rem" }}>{slPct !== null ? `${slPct >= 0 ? "+" : ""}${slPct.toFixed(2)}% จากเข้า` : ""}{distToSl !== null ? `  ·  ${distToSl >= 0 ? "+" : ""}${distToSl.toFixed(2)}% จากปัจจุบัน` : ""}</Typography>
                                    </Box>
                                  )}
                                  {p.tp > 0 && (
                                    <Box sx={{ p: 0.75, borderRadius: 1, bgcolor: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)" }}>
                                      <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Take Profit</Typography>
                                      <Typography sx={{ ...MONO, fontSize: "0.82rem", fontWeight: 800, color: "#34d399" }}>{fmt(p.tp, 4)}</Typography>
                                      <Typography variant="caption" sx={{ ...MONO, color: "#64748b", fontSize: "0.68rem" }}>{tpPct !== null ? `${tpPct >= 0 ? "+" : ""}${tpPct.toFixed(2)}% จากเข้า` : ""}{distToTp !== null ? `  ·  ${distToTp >= 0 ? "+" : ""}${distToTp.toFixed(2)}% จากปัจจุบัน` : ""}</Typography>
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

          {/* Trade History Log — full width below */}
          <Box sx={{ mt: 4 }}>
              <Card sx={{ bgcolor: "#0d1321", border: "1px solid rgba(255, 255, 255, 0.03)" }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack
                    direction="row"
                    sx={{ justifyContent: "space-between", alignItems: "center", mb: { xs: historyOpen ? 2.5 : 0, md: 2.5 }, cursor: { xs: "pointer", md: "default" } }}
                    onClick={() => { if (window.innerWidth < 900) setHistoryOpen((v) => !v); }}
                  >
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <SectionTitle icon={<History size={16} color="#3b82f6" />}>ประวัติรายการที่ปิดแล้ว 7 วัน</SectionTitle>
                      <Box sx={{ display: { xs: "flex", md: "none" }, color: "#475569", mb: 2 }}>
                        {historyOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </Box>
                    </Stack>
                    {historyLoading && <CircularProgress size={16} color="primary" />}
                  </Stack>
                  <Box sx={{ display: historyOpen ? undefined : { xs: "none", md: "block" } }}>
                  <PnLChart deals={cryptoHistory} />
                  {cryptoHistory.length === 0 ? (
                    <Box sx={{ py: 6, textAlign: "center" }}>
                      <Typography variant="body2" sx={{ color: "#64748b" }}>
                        ไม่มีรายการใน 7 วันที่ผ่านมา
                      </Typography>
                    </Box>
                  ) : (
                    <>
                    <Box sx={{ overflowX: "auto", mt: 2 }}>
                      {/* DESKTOP TABLE VIEW - Renders on sm (tablet) and up */}
                      <Box sx={{ display: { xs: "none", sm: "block" } }}>
                        <HistoryTable
                          deals={paginatedCryptoHistory}
                          totalCount={cryptoHistory.length}
                          page={historyPage}
                          rowsPerPage={historyRowsPerPage}
                          onPageChange={setHistoryPage}
                          onRowsPerPageChange={setHistoryRowsPerPage}
                          isBot={(h) => _cBotMagics.has(h.magic)}
                          priceDecimals={() => 4}
                          priceSubtitle={(h) => `≈ ${fmt(h.price * h.volume, 2)} ${ccy}`}
                          emptyMessage="ไม่มีรายการใน 7 วันที่ผ่านมา"
                        />
                      </Box>

                      {/* MOBILE COMPACT LIST - Renders on phone only */}
                      <Box sx={{ display: { xs: "block", sm: "none" } }}>
                        {paginatedCryptoHistory.map((h) => {
                          const isLong  = h.entry === "IN" ? h.type === "BUY" : h.type === "SELL";
                          const isOpen  = h.entry === "IN";
                          const isBot   = _cBotMagics.has(h.magic);
                          // IN = blue · OUT = profit-based
                          const ac      = isOpen ? "#60a5fa" : h.profit > 0 ? "#10b981" : h.profit < 0 ? "#ef4444" : "#64748b";
                          const rowBg   = isOpen ? "rgba(59,130,246,0.025)" : h.profit > 0 ? "rgba(16,185,129,0.02)" : h.profit < 0 ? "rgba(239,68,68,0.02)" : "transparent";
                          return (
                            <Box
                              key={`${h.ticket}-${h.time}`}
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                pl: 1.25,
                                pr: 1.5,
                                py: 1,
                                borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                                bgcolor: rowBg,
                                borderLeft: `3px solid ${ac}`,
                              }}
                            >
                              {/* Left: colored shape indicator — circle=open, square=close */}
                              <Box sx={{
                                width: 6, height: 6,
                                borderRadius: isOpen ? "50%" : "1px",
                                bgcolor: ac,
                                flexShrink: 0,
                              }} />

                              {/* Center: symbol + meta */}
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                                  <Typography noWrap sx={{ ...MONO, fontWeight: 800, fontSize: "0.8rem", color: "#e2e8f0" }}>
                                    {h.symbol}
                                  </Typography>
                                  <Box sx={{ display: "inline-flex", alignItems: "center", px: 0.5, py: 0.05, borderRadius: 0.5, bgcolor: isOpen ? "rgba(59,130,246,0.12)" : h.profit > 0 ? "rgba(16,185,129,0.1)" : h.profit < 0 ? "rgba(239,68,68,0.1)" : "rgba(100,116,139,0.1)" }}>
                                    <Typography sx={{ fontSize: "0.58rem", fontWeight: 800, color: ac, whiteSpace: "nowrap" }}>
                                      {isOpen ? "Open" : "Close"} {isLong ? "L" : "S"}
                                    </Typography>
                                  </Box>
                                  {isBot && (
                                    <Typography sx={{ fontSize: "0.52rem", fontWeight: 800, color: "#60a5fa", bgcolor: "rgba(59,130,246,0.1)", px: 0.4, py: 0.05, borderRadius: 0.4 }}>
                                      Bot
                                    </Typography>
                                  )}
                                </Stack>
                                <Stack direction="row" spacing={1} sx={{ mt: 0.15 }}>
                                  <Typography sx={{ ...MONO, fontSize: "0.6rem", color: "#475569" }}>
                                    {formatBangkokTime(h.time)}
                                  </Typography>
                                  <Typography sx={{ ...MONO, fontSize: "0.6rem", color: "#334155" }}>
                                    {fmt(h.volume, 2)} lot · {fmt(h.price, 4)}
                                  </Typography>
                                </Stack>
                              </Box>

                              {/* Right: P/L (show — for open entries) */}
                              <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                                {isOpen ? (
                                  <Typography sx={{ ...MONO, fontWeight: 700, fontSize: "0.75rem", color: "#475569", fontStyle: "italic" }}>—</Typography>
                                ) : (
                                  <>
                                    <Typography sx={{ ...MONO, fontWeight: 800, fontSize: "0.82rem", color: h.profit > 0 ? "#10b981" : h.profit < 0 ? "#ef4444" : "#64748b" }}>
                                      {h.profit > 0 ? "+" : ""}{fmt(h.profit)}
                                    </Typography>
                                    {h.pct != null && (
                                      <Typography sx={{ ...MONO, fontWeight: 700, fontSize: "0.62rem", color: h.pct > 0 ? "#10b981" : h.pct < 0 ? "#ef4444" : "#64748b" }}>
                                        {h.pct > 0 ? "+" : ""}{fmt(h.pct, 2)}%
                                      </Typography>
                                    )}
                                  </>
                                )}
                                {h.commission !== 0 && (
                                  <Typography sx={{ ...MONO, fontSize: "0.55rem", color: "#475569" }}>
                                    comm {fmt(h.commission)}
                                  </Typography>
                                )}
                              </Box>
                            </Box>
                          );
                        })}
                      </Box>
                    </Box>
                    {/* Mobile-only pagination; the desktop table (HistoryTable) has its own. */}
                    <TablePagination
                      rowsPerPageOptions={[5, 10, 20, 50]}
                      component="div"
                      count={cryptoHistory.length}
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
                        display: { xs: "block", sm: "none" },
                        color: "#94a3b8",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                        "& .MuiTablePagination-toolbar": { minHeight: 44, px: 1 },
                        "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": { fontSize: "0.78rem" },
                        "& .MuiTablePagination-selectIcon": { color: "#64748b" },
                        "& .MuiIconButton-root": { color: "#64748b" },
                        "& .MuiIconButton-root.Mui-disabled": { color: "rgba(255,255,255,0.1)" },
                      }}
                    />
                    </>
                  )}
                  </Box>{/* end collapsible history body */}
                </CardContent>
              </Card>
          </Box>

        </Container>
      </Box>{/* end main content */}
{/* Bot Log Modal */}
      <Dialog
        open={logOpen}
        onClose={() => setLogOpen(false)}
        maxWidth="md"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              bgcolor: "#0d1321",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 1.5,
              height: "80vh",
              backgroundImage: "none",
            },
          },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 3, py: 2, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
            <Box sx={{ p: 0.75, borderRadius: 1.5, bgcolor: "rgba(245,158,11,0.1)", display: "flex", color: "#f59e0b" }}>
              <ScrollText size={16} />
            </Box>
            <Box>
              <Typography variant="subtitle1" sx={{ color: "#fff", fontWeight: 700, lineHeight: 1.2 }}>
                Bot Activity Log
              </Typography>
              <Typography variant="caption" sx={{ color: "#334155" }}>
                อัปเดตทุก 5 วินาที · เก็บ 200 รายการล่าสุด
              </Typography>
            </Box>
          </Stack>
          <IconButton onClick={() => setLogOpen(false)} size="small" sx={{ color: "#475569", "&:hover": { color: "#fff" } }}>
            <X size={18} />
          </IconButton>
        </Box>
        <Box sx={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <BotLog
            fetchLogs={async () => {
              const data = await api("logs?limit=200");
              return data.logs ?? [];
            }}
          />
        </Box>
      </Dialog>

<CryptoBotSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settingsForm={settingsForm}
        setSettingsForm={setSettingsForm}
        strategies={strategiesForGroup(strategies, "crypto")}
        selectedStrategyValue={selectedStrategyValue}
        activeStrategy={activeStrategy}
        strategyDescription={strategyDescription}
        strategyLabel={strategyLabel}
        savingSettings={savingSettings}
        onSave={handleSaveSettings}
        cryptoInput={cryptoInput}
        setCryptoInput={setCryptoInput}
        onDetectCryptoSymbols={autoDetectCryptoSymbols}
        detectingCryptoSymbols={detectingCryptoSymbols}
        onValidateSymbols={validateSymbols}
        validatingSymbols={validatingSymbols}
        allCryptoSymbols={cryptoSymbols}
        scanMins={cryptoScanMins}
        setScanMins={setCryptoScanMins}
      />

      <Dialog
        open={Boolean(tradeConfirm)}
        onClose={() => {
          if (!tradeExecuting) setTradeConfirm(null);
        }}
        slotProps={{
          paper: {
            sx: {
              bgcolor: "#0d1321",
              border: `1px solid ${tradeConfirm?.action === "BUY" ? "rgba(16, 185, 129, 0.28)" : "rgba(239, 68, 68, 0.28)"}`,
              borderRadius: 3,
              minWidth: { xs: "calc(100vw - 32px)", sm: 460 },
            },
          },
        }}
      >
        <DialogTitle sx={{ color: "#fff", fontWeight: 650 }}>
          Confirm {tradeConfirm ? actionLabel(tradeConfirm.action) : ""} Trade
        </DialogTitle>
        <DialogContent>
          {tradeConfirm && (
            <Stack spacing={1.25}>
              <Typography variant="body2" color="text.secondary">
                Open {tradeConfirm.symbol} as {actionLabel(tradeConfirm.action)} using the latest signal?
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
                <Typography variant="caption" color="text.secondary">Symbol</Typography>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>{tradeConfirm.symbol}</Typography>
                <Typography variant="caption" color="text.secondary">Side</Typography>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 800, color: tradeConfirm.action === "BUY" ? "#10b981" : "#ef4444" }}
                >
                  {actionLabel(tradeConfirm.action)}
                </Typography>
                <Typography variant="caption" color="text.secondary">Price</Typography>
                <Typography variant="caption" sx={MONO}>{fmt(tradeConfirm.price, 2)}</Typography>
                <Typography variant="caption" color="text.secondary">Lot</Typography>
                <Typography variant="caption" sx={MONO}>{fmt(tradeConfirm.suggested_lot, 2)}</Typography>
                <Typography variant="caption" color="text.secondary">เงินทุน (มูลค่าสัญญา)</Typography>
                <Typography variant="caption" sx={MONO}>
                  {fmt(
                    (tradeConfirm.suggested_lot ?? 0) *
                      (tradeConfirm.price ?? 0) *
                      (tradeConfirm.contract_size ?? 1),
                    2,
                  )}
                </Typography>
                <Typography variant="caption" color="text.secondary">Stop Loss</Typography>
                <Typography variant="caption" sx={MONO}>{fmt(tradeConfirm.stop_loss, 2)}</Typography>
                <Typography variant="caption" color="text.secondary">Take Profit</Typography>
                <Typography variant="caption" sx={MONO}>{fmt(tradeConfirm.take_profit, 2)}</Typography>
                <Typography variant="caption" color="text.secondary">Confidence</Typography>
                <Typography variant="caption" sx={MONO}>{Math.round(tradeConfirm.confidence * 100)}%</Typography>
              </Box>
              {tradeConfirm.summary && (
                <Typography variant="caption" color="text.secondary">
                  {tradeConfirm.summary}
                </Typography>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            variant="text"
            color="inherit"
            disabled={tradeExecuting}
            onClick={() => setTradeConfirm(null)}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color={tradeConfirm?.action === "BUY" ? "success" : "error"}
            disabled={tradeExecuting}
            onClick={confirmTrade}
            startIcon={tradeExecuting ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            Confirm {tradeConfirm ? actionLabel(tradeConfirm.action) : ""}
          </Button>
        </DialogActions>
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
          Confirm Close Crypto Position
        </DialogTitle>
        <DialogContent>
          {closeCandidate && (
            <Stack spacing={1.25}>
              <Alert severity={closeCandidate.profit >= 0 ? "success" : "warning"}>
                ต้องการปิด {closeCandidate.symbol} position นี้ด้วยราคาตลาดตอนนี้ใช่ไหม?
              </Alert>
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
            ปิด Position
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
