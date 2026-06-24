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
  Wallet,
  History,
  Sliders,
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
  a === "BUY" ? "Long" : a === "SELL" ? "Short" : a || "รอ";

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

export default function CryptoPage() {
  const toastr = useToastr();
  
  const [account, setAccount] = useState<Account | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [cryptoSymbol, setCryptoSymbol] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [ticks, setTicks] = useState<Record<string, { bid: number; ask: number; last: number; time: number; error?: string }>>({});
  const [tickDirections, setTickDirections] = useState<Record<string, { bid: "up" | "down" | "flat"; ask: "up" | "down" | "flat"; lastUpdated: number }>>({});
  const [closingTicket, setClosingTicket] = useState<number | null>(null);
  const [closeCandidate, setCloseCandidate] = useState<Position | null>(null);
  const [settingsData, setSettingsData] = useState<any>(null);
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Coin screener scores
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [scanLoading, setScanLoading] = useState(false);

  // Manual "analyze & trade" flow
  const [tradeStagingSymbol, setTradeStagingSymbol] = useState<string | null>(null);
  const [tradeConfirm, setTradeConfirm] = useState<Recommendation | null>(null);
  const [tradeExecuting, setTradeExecuting] = useState(false);

  const [settingsForm, setSettingsForm] = useState<any>({
    position_sizing_mode: "risk_pct",
    max_open_trades: 5,
    stake_amount: 0.0,
    atr_sl_mult: 1.5,
    default_rr: 2.0,
    bot_enabled: true,
    use_ai: false,
    auto_trade_interval: 60,
    strategy: "ema_macd_rsi",
    magic: 556677
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [cryptoInput, setCryptoInput] = useState("");
  const [nonCryptoInput, setNonCryptoInput] = useState("");
  const [detectingCryptoSymbols, setDetectingCryptoSymbols] = useState(false);

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
        const allSyms = data.symbols ? data.symbols.split(",").map((s: string) => s.trim().toUpperCase()).filter(Boolean) : [];
        setCryptoInput(allSyms.filter(isCryptoSymbol).join(", "));
        setNonCryptoInput(allSyms.filter((s: string) => !isCryptoSymbol(s)).join(", "));
        setSettingsForm({
          position_sizing_mode: data.position_sizing_mode || "risk_pct",
          max_open_trades: data.max_open_trades ?? 5,
          stake_amount: data.stake_amount ?? 0.0,
          atr_sl_mult: data.atr_sl_mult ?? 1.5,
          default_rr: data.default_rr ?? 2.0,
          bot_enabled: data.bot_enabled ?? true,
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

  const cryptoSymbols = symbols.filter(isCryptoSymbol);

  // Reset pagination page if symbols list updates
  useEffect(() => {
    setPage(0);
  }, [cryptoSymbols.length]);

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
    const intervalId = setInterval(fetchAllTicks, 2000);

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
  const cryptoPositions = positions.filter((p) => isCryptoSymbol(p.symbol) && p.magic === settingsForm.magic);
  const ccy = account?.currency ?? "";
  const openPl = cryptoPositions.reduce((acc, curr) => acc + curr.profit, 0);
  const totalOpenPlPct = account && account.balance > 0 ? (openPl / account.balance) * 100 : 0;
  const totalOpenPlPctString = account && account.balance > 0
    ? ` (${totalOpenPlPct >= 0 ? "+" : ""}${totalOpenPlPct.toFixed(2)}%)`
    : "";

  // Filter transaction history log for bot's crypto deals
  const cryptoHistory = tradeHistory.filter((d) => isCryptoSymbol(d.symbol) && d.magic === settingsForm.magic);
  const scanBySymbol = new Map(scanResults.map((r) => [r.symbol, r]));
  const historyPageStart = historyPage * historyRowsPerPage;
  const paginatedCryptoHistory = cryptoHistory.slice(historyPageStart, historyPageStart + historyRowsPerPage);
  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(cryptoHistory.length / historyRowsPerPage) - 1);
    setHistoryPage((current) => Math.min(current, maxPage));
  }, [cryptoHistory.length, historyRowsPerPage]);

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
    } catch (e: any) {
      toastr.error(`สแกนเหรียญไม่สำเร็จ: ${e.message}`);
    } finally {
      setScanLoading(false);
    }
  }

  // Auto-scan trade scores separately from fast price ticks.
  useEffect(() => {
    if (cryptoSymbols.length === 0) return;
    let active = true;
    let inFlight = false;

    const refreshScores = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        await runScan();
      } finally {
        inFlight = false;
      }
    };

    refreshScores();
    const intervalId = setInterval(refreshScores, 30000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [cryptoSymbols.join(","), settingsForm.strategy]);

  // Analyze a symbol, then ask for confirmation before placing the order.
  async function stageTrade(symbol: string) {
    setTradeStagingSymbol(symbol);
    try {
      const data = await api("analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          strategy: settingsForm.strategy,
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
    if (!tradeConfirm) return;
    const rec = tradeConfirm;
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
        }),
      });
      toastr.success(`Opened ${rec.symbol} ${actionLabel(rec.action)} trade`);
      setTradeConfirm(null);
      refresh();
      fetchHistory();
    } catch (e: any) {
      toastr.error(`Trade failed: ${e.message}`);
    } finally {
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

  // Save Settings directly on the page
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const combined = [
        ...cryptoInput.split(",").map(x => x.trim().toUpperCase()),
        ...nonCryptoInput.split(",").map(x => x.trim().toUpperCase())
      ].filter(Boolean).join(",");

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
      
      // Reload configurations (with safety check in case server is restarting)
      try {
        const data = await api("settings");
        setSettingsData(data);
  
        const nextSyms = data.symbols ? data.symbols.split(",").map((s: string) => s.trim().toUpperCase()).filter(Boolean) : [];
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

  const activeStrategy = strategies.find((s) => s.name === settingsForm.strategy);
  const strategyDescription = activeStrategy?.description ?? "";
  const selectedStrategyValue = activeStrategy ? settingsForm.strategy : "";
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
              gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.75fr) minmax(380px, 0.9fr)" },
              alignItems: "start",
            }}
          >
            {/* Left Column: Live Chart */}
            <Stack spacing={4}>
              {/* Crypto Price Table */}
              <Card sx={{ bgcolor: "#0d1321", border: "1px solid rgba(255, 255, 255, 0.03)" }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 3 }}>
                    <SectionTitle icon={<Activity size={18} color="#3b82f6" />}>
                      ราคารายเหรียญคริปโต Real-time
                    </SectionTitle>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={runScan}
                        disabled={scanLoading || cryptoSymbols.length === 0}
                        startIcon={scanLoading ? <CircularProgress size={13} color="inherit" /> : <RefreshCw size={14} />}
                        sx={{
                          height: 30,
                          borderRadius: 1,
                          px: 1.5,
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          borderColor: "rgba(59, 130, 246, 0.35)",
                          color: "#60a5fa",
                          bgcolor: "rgba(59, 130, 246, 0.06)",
                          "&:hover": { borderColor: "#3b82f6", bgcolor: "rgba(59, 130, 246, 0.12)" },
                        }}
                      >
                        Refresh score
                      </Button>
                      <Chip
                        size="small"
                        label="Price 2s"
                        color="success"
                        variant="outlined"
                        sx={{ fontSize: 10, height: 22, px: 0.5, borderColor: "rgba(16, 185, 129, 0.3)", color: "#10b981", bgcolor: "rgba(16, 185, 129, 0.04)" }}
                      />
                      <Chip
                        size="small"
                        label="Score 30s"
                        variant="outlined"
                        sx={{ fontSize: 10, height: 22, px: 0.5, borderColor: "rgba(59, 130, 246, 0.3)", color: "#60a5fa", bgcolor: "rgba(59, 130, 246, 0.04)" }}
                      />
                    </Stack>
                  </Stack>

                  {cryptoSymbols.length === 0 ? (
                    <Box sx={{ py: 6, textAlign: "center", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 2.5 }}>
                      <Typography color="text.secondary">กรุณาเพิ่มเหรียญคริปโตในหน้าตั้งค่าก่อน</Typography>
                    </Box>
                  ) : (
                    <Box sx={{ overflowX: "auto" }}>
                      <Table size="medium">
                        <TableHead>
                          <TableRow sx={{ "& th": { borderBottomColor: "rgba(255,255,255,0.08)", bgcolor: "#0d1321" } }}>
                            <TableCell sx={{ fontWeight: 700, color: "#94a3b8" }}>เหรียญ</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, color: "#94a3b8" }}>BID (ขาย)</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, color: "#94a3b8" }}>ASK (ซื้อ)</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, color: "#94a3b8" }}>Spread</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, color: "#94a3b8" }}>Signal Score</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, color: "#94a3b8", pr: 2 }}>คำสั่ง</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {cryptoSymbols.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((sym) => {
                            const tick = ticks[sym];
                            const dir = tickDirections[sym] || { bid: "flat", ask: "flat" };
                            const decimals = getDecimals(sym);
                            const bidVal = tick && !tick.error ? tick.bid : null;
                            const askVal = tick && !tick.error ? tick.ask : null;
                            const spreadVal = bidVal !== null && askVal !== null ? askVal - bidVal : null;
                            const isSelected = cryptoSymbol === sym;
                            const scan = scanBySymbol.get(sym);
                            const scanScore = scan ? Math.round(scan.confidence * 100) : null;
                            const scanColor = scan?.action === "BUY" ? "#10b981" : scan?.action === "SELL" ? "#ef4444" : "#64748b";
                            return (
                              <TableRow
                                key={sym}
                                hover
                                onClick={() => handleCryptoSymbolChange(sym)}
                                sx={{
                                  cursor: "pointer",
                                  borderLeft: isSelected ? "3px solid #3b82f6" : "3px solid transparent",
                                  bgcolor: isSelected ? "rgba(59, 130, 246, 0.04)" : "transparent",
                                  borderBottomColor: "rgba(255,255,255,0.03)",
                                  transition: "background-color 0.15s, border-color 0.15s",
                                  "&:hover": {
                                    bgcolor: isSelected ? "rgba(59, 130, 246, 0.06)" : "rgba(255, 255, 255, 0.02)",
                                  },
                                }}
                              >
                                <TableCell sx={{ py: 1.75 }}>
                                  <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                                    <Box>
                                      <Typography sx={{ fontWeight: 700, color: isSelected ? "#60a5fa" : "#fff" }}>
                                        {sym}
                                      </Typography>
                                      {isSelected && (
                                        <Typography variant="caption" sx={{ color: "#3b82f6", display: "block", fontSize: "0.7rem", fontWeight: 700 }}>
                                          SELECTED
                                        </Typography>
                                      )}
                                    </Box>
                                  </Stack>
                                </TableCell>
                                <TableCell align="right" sx={{ py: 1.5 }}>
                                  <PriceDirection value={bidVal !== null ? bidVal.toFixed(decimals) : "—"} direction={dir.bid} />
                                </TableCell>
                                <TableCell align="right" sx={{ py: 1.5 }}>
                                  <PriceDirection value={askVal !== null ? askVal.toFixed(decimals) : "—"} direction={dir.ask} />
                                </TableCell>
                                <TableCell align="right" sx={{ py: 1.5, ...MONO, fontWeight: 500, color: "#cbd5e1" }}>
                                  {spreadVal !== null ? spreadVal.toFixed(decimals) : "—"}
                                </TableCell>
                                <TableCell align="right" sx={{ py: 1.25 }}>
                                  <Stack spacing={0.5} sx={{ alignItems: "flex-end" }}>
                                    <Chip
                                      size="small"
                                      label={scanScore !== null ? `${actionLabel(scan?.action)} ${scanScore}%` : scanLoading ? "Scanning" : "—"}
                                      variant="outlined"
                                      sx={{
                                        height: 20,
                                        borderRadius: 1,
                                        fontSize: 10,
                                        fontWeight: 800,
                                        color: scanScore !== null ? scanColor : "#64748b",
                                        borderColor: scanScore !== null ? scanColor : "rgba(148,163,184,0.25)",
                                        bgcolor: scanScore !== null ? `${scanColor}14` : "transparent",
                                        "& .MuiChip-label": { px: 0.75 },
                                      }}
                                    />
                                    <LinearProgress
                                      variant={scanScore !== null ? "determinate" : "indeterminate"}
                                      value={scanScore ?? 0}
                                      sx={{
                                        width: 86,
                                        height: 4,
                                        borderRadius: 1,
                                        bgcolor: "rgba(255,255,255,0.05)",
                                        opacity: scanScore !== null || scanLoading ? 1 : 0.25,
                                        "& .MuiLinearProgress-bar": { bgcolor: scanColor },
                                      }}
                                    />
                                  </Stack>
                                </TableCell>
                                <TableCell align="right" sx={{ py: 1.5, pr: 2 }}>
                                  <Button
                                    size="small"
                                    variant="contained"
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
                                      borderRadius: 1.5,
                                      fontWeight: 700,
                                      fontSize: "0.82rem",
                                      textTransform: "none",
                                      bgcolor: "#2563eb",
                                      "&:hover": { bgcolor: "#1d4ed8" },
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
                      <TablePagination
                        rowsPerPageOptions={[5, 10, 20, 50]}
                        component="div"
                        count={cryptoSymbols.length}
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
                </CardContent>
              </Card>
            </Stack>

            {/* Right Column: Active Positions sidebar */}
            <Stack spacing={4}>
              <Card sx={{ bgcolor: "#0d1321", border: "1px solid rgba(255, 255, 255, 0.03)", position: { lg: "sticky" }, top: { lg: 16 } }}>
                <CardContent sx={{ p: 2 }}>
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.25 }}>
                    <SectionTitle icon={<Layers size={16} color="#3b82f6" />}>ออเดอร์ที่บอทเปิดอยู่</SectionTitle>
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
                    <Box sx={{ py: 5, textAlign: "center", bgcolor: "rgba(255,255,255,0.01)", borderRadius: 2.5, border: "1px dashed rgba(255,255,255,0.03)" }}>
                      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                        ตอนนี้ยังไม่มีออเดอร์ที่บอทเปิดอยู่ใน MT5
                      </Typography>
                    </Box>
                  ) : (
                    <Stack spacing={1}>
                      {cryptoPositions.map((p) => {
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
                              bgcolor: p.type === "BUY" ? "rgba(16, 185, 129, 0.04)" : "rgba(239, 68, 68, 0.04)",
                              border: `1px solid ${p.type === "BUY" ? "rgba(16, 185, 129, 0.18)" : "rgba(239, 68, 68, 0.18)"}`,
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
                                  <Typography noWrap sx={{ fontWeight: 750, lineHeight: 1.15 }}>
                                    {p.symbol}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary" sx={{ ...MONO, display: "block", lineHeight: 1.2 }}>
                                    Ticket #{p.ticket}
                                  </Typography>
                                </Box>
                              </Stack>
                              <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                                <Typography sx={{ ...MONO, fontWeight: 850, lineHeight: 1.15, color: isProfit ? "#10b981" : "#ef4444" }}>
                                  {isProfit ? "+" : ""}{fmt(p.profit)} {ccy}
                                </Typography>
                                <Typography variant="caption" sx={{ ...MONO, display: "block", lineHeight: 1.2, color: isProfit ? "#10b981" : "#ef4444", fontWeight: 700 }}>
                                  {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                                </Typography>
                              </Box>
                            </Stack>

                            <Box
                              sx={{
                                display: "grid",
                                gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))" },
                                gap: 0.75,
                                p: 1,
                                mb: 1,
                                borderRadius: 1,
                                bgcolor: "rgba(255,255,255,0.025)",
                              }}
                            >
                              {[
                                { label: "Lot", value: fmt(p.volume, 2) },
                                { label: "เข้า", value: fmt(p.price_open, 2) },
                                { label: "ปัจจุบัน", value: fmt(p.price_current, 2) },
                                { label: "เงินทุน", value: fmt(invested, 2) },
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

                            <Button
                              size="small"
                              color="error"
                              variant="outlined"
                              fullWidth
                              disabled={closingTicket === p.ticket}
                              onClick={() => setCloseCandidate(p)}
                              startIcon={closingTicket === p.ticket ? <CircularProgress size={13} color="inherit" /> : undefined}
                              sx={{
                                height: 28,
                                borderRadius: 1,
                                fontSize: "0.78rem",
                                fontWeight: 750,
                                borderColor: "rgba(239, 68, 68, 0.35)",
                                color: "#f87171",
                                bgcolor: "rgba(239, 68, 68, 0.05)",
                                "&:hover": {
                                  borderColor: "#ef4444",
                                  bgcolor: "rgba(239, 68, 68, 0.12)",
                                },
                              }}
                            >
                              ปิด slot
                            </Button>
                          </Box>
                        );
                      })}
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
                    <>
                    <Box sx={{ overflowX: "auto", maxHeight: "auto" }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow sx={{ "& th": { borderBottomColor: "rgba(255,255,255,0.05)", bgcolor: "#0d1321" } }}>
                            {["เวลา", "สัญลักษณ์", "ฝั่ง", "เข้า/ออก", "ขนาด", "ราคา", "กำไร/ขาดทุนจริง", "หมายเหตุ"].map((h) => (
                              <TableCell key={h} sx={{ fontWeight: 700, color: "#94a3b8" }}>{h}</TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {paginatedCryptoHistory.map((h) => (
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
                    <TablePagination
                      rowsPerPageOptions={[5, 10, 25, 50]}
                      component="div"
                      count={cryptoHistory.length}
                      rowsPerPage={historyRowsPerPage}
                      page={historyPage}
                      onPageChange={(_event, newPage) => setHistoryPage(newPage)}
                      onRowsPerPageChange={(event) => {
                        setHistoryRowsPerPage(parseInt(event.target.value, 10));
                        setHistoryPage(0);
                      }}
                      labelRowsPerPage="Rows per page:"
                      sx={{
                        color: "#cbd5e1",
                        borderTop: "1px solid rgba(255,255,255,0.08)",
                        "& .MuiTablePagination-selectIcon": { color: "#64748b" },
                        "& .MuiIconButton-root": { color: "#cbd5e1" },
                        "& .MuiIconButton-root.Mui-disabled": { color: "rgba(255,255,255,0.25)" }
                      }}
                    />
                    </>
                  )}
                </CardContent>
              </Card>
          </Box>
        </Container>
      </Box>
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
        cryptoInput={cryptoInput}
        setCryptoInput={setCryptoInput}
        onDetectCryptoSymbols={autoDetectCryptoSymbols}
        detectingCryptoSymbols={detectingCryptoSymbols}
        allCryptoSymbols={cryptoSymbols}
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
