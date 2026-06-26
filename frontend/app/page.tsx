"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useToastr } from "./components/Toastr";
import Sidebar, { SIDEBAR_W } from "./components/Sidebar";
import TopBar from "./components/TopBar";
import BotLog from "./crypto/components/BotLog";
import { PixelBotAvatar, SlotCapacity } from "./components/PixelBotStatus";
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
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  Tabs,
  Tab,
  LinearProgress,
} from "@mui/material";
import {
  Activity,
  Layers,
  ScrollText,
  TrendingUp,
  TrendingDown,
  Wallet,
  X,
  Coins,
  Sparkles,
  Brain,
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

const actionLabel = (a?: string) =>
  a === "BUY" ? "Long" : a === "SELL" ? "Short" : a || "Hold";

const positionPnlPct = (p: Position) => {
  const open = Number(p.price_open);
  const current = Number(p.price_current);
  if (!Number.isFinite(open) || !Number.isFinite(current) || open === 0) return null;
  const direction = p.type === "SELL" ? -1 : 1;
  return ((current - open) / open) * 100 * direction;
};

const fmtPrice = (n: number | null | undefined) => {
  const value = Number(n);
  if (n === null || n === undefined || !Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 100) return value.toFixed(2);
  if (Math.abs(value) >= 1) return value.toFixed(4);
  return value.toFixed(6);
};

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
      {icon}
      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
        {children}
      </Typography>
    </Stack>
  );
}

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

export default function Dashboard() {
  const toastr = useToastr();
  const [account, setAccount] = useState<Account | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const connectedRef = useRef<boolean | null>(null);
  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<HistoryDeal[]>([]);
  const [botLogs, setBotLogs] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [closingTicket, setClosingTicket] = useState<number | null>(null);
  const [closeCandidate, setCloseCandidate] = useState<Position | null>(null);
  const [activeTab, setActiveTab] = useState(0); // 0 = All, 1 = Crypto, 2 = Gold, 3 = Stocks

  // Settings State Form (read-only for status display)
  const [settingsForm, setSettingsForm] = useState<any>({
    bot_enabled: false,
    gold_bot_enabled: false,
    stock_bot_enabled: false,
    strategy: "",
    stock_strategy: "",
    max_crypto_open_trades: 5,
    max_open_trades: 5,
    max_gold_open_trades: 3,
    max_stock_open_trades: 4,
  });

  const refresh = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const [a, p, h, lg] = await Promise.all([
        api("account"),
        api("positions"),
        api("history?days=7").catch(() => ({ history: [] })),
        api("logs?limit=8").catch(() => ({ logs: [] })),
      ]);
      setAccount(a);
      if (connectedRef.current === false) {
        toastr.success("MT5 terminal connected successfully.");
      }
      setConnected(true);
      setPositions(p.positions ?? []);
      setHistory(h.history ?? []);
      setBotLogs(lg.logs ?? []);
    } catch (e: any) {
      if (connectedRef.current !== false) {
        toastr.error(`MT5 connection lost: ${e.message}`);
      }
      setConnected(false);
    } finally {
      setHistoryLoading(false);
    }
  }, [toastr]);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await api("settings");
      setSettingsForm(data);
    } catch (e: any) {
      console.error("Failed to fetch settings:", e);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh, fetchSettings]);

  async function closePos(ticket: number) {
    setClosingTicket(ticket);
    try {
      await api(`positions/${ticket}/close`, { method: "POST" });
      refresh();
      toastr.success(`Position #${ticket} closed successfully.`);
    } catch (e: any) {
      toastr.error(`Failed to close position: ${e.message}`);
    } finally {
      setClosingTicket(null);
    }
  }

  const handleDisableLossLimit = async () => {
    try {
      const updatedForm = {
        ...settingsForm,
        max_consecutive_losses: 0
      };
      await api("settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedForm),
      });
      toastr.success("ปลดล็อกบอทและปิดตัวจำกัดขาดทุนติดต่อกันสำเร็จ!");
      refresh();
      fetchSettings();
    } catch (e: any) {
      toastr.error(`ปลดล็อกไม่สำเร็จ: ${e.message}`);
    }
  };

  const handleDisableDailyLossLimit = async () => {
    try {
      const updatedForm = {
        ...settingsForm,
        max_daily_loss_pct: 0
      };
      await api("settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedForm),
      });
      toastr.success("ปลดล็อกบอทและปิดขีดจำกัดขาดทุนรายวันสำเร็จ!");
      refresh();
      fetchSettings();
    } catch (e: any) {
      toastr.error(`ปลดล็อกไม่สำเร็จ: ${e.message}`);
    }
  };

  const isCryptoSymbol = (sym: string) => {
    const s = sym.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (/GOLD|SILVER|XAU|XAG|PLATINUM|PALLADIUM/.test(s)) return false;
    if (/^(EUR|GBP|AUD|NZD|CAD|CHF|HKD|SGD|ZAR|MXN|NOK|SEK|DKK|TRY|CNH|RUB)[A-Z]{3}$/.test(s)) return false;
    return CRYPTO_BASES.some((base) => s === base || CRYPTO_QUOTES.some((quote) => s.startsWith(`${base}${quote}`)));
  };

  const isMetalSymbol = (sym: string) => {
    return /GOLD|SILVER|XAU|XAG|PLATINUM|PALLADIUM/i.test(sym);
  };

  const FOREX_PREFIXES = ["EUR", "GBP", "AUD", "NZD", "CAD", "CHF", "HKD", "SGD", "ZAR", "MXN", "NOK", "SEK", "DKK", "TRY", "CNH", "RUB", "USD", "JPY"];

  const isForexSymbol = (sym: string) => {
    const s = sym.toUpperCase().replace(/[^A-Z]/g, "");
    return s.length === 6 && FOREX_PREFIXES.some((p) => s.startsWith(p)) && !isCryptoSymbol(sym) && !isMetalSymbol(sym);
  };

  const isStockSymbol = (sym: string) => {
    return !isCryptoSymbol(sym) && !isMetalSymbol(sym) && !isForexSymbol(sym);
  };

  // Group positions
  const cryptoPositions = positions.filter((p) => isCryptoSymbol(p.symbol));
  const goldPositions = positions.filter((p) => isMetalSymbol(p.symbol));
  const stockPositions = positions.filter((p) => isStockSymbol(p.symbol));
  const forexPositions = positions.filter((p) => isForexSymbol(p.symbol));

  // Compute open P/L per group
  const cryptoOpenPl = cryptoPositions.reduce((sum, p) => sum + (p.profit ?? 0), 0);
  const goldOpenPl = goldPositions.reduce((sum, p) => sum + (p.profit ?? 0), 0);
  const stockOpenPl = stockPositions.reduce((sum, p) => sum + (p.profit ?? 0), 0);

  // Filter history (only entry OUT deals)
  const cryptoHistory = history.filter((h) => isCryptoSymbol(h.symbol) && h.entry === "OUT");
  const goldHistory = history.filter((h) => isMetalSymbol(h.symbol) && h.entry === "OUT");
  const stockHistory = history.filter((h) => isStockSymbol(h.symbol) && h.entry === "OUT");

  // Compute realized P/L (7D) per group
  const calcRealizedPl = (deals: HistoryDeal[]) =>
    deals.reduce((sum, d) => sum + (d.profit ?? 0) + (d.commission ?? 0) + (d.swap ?? 0), 0);

  const cryptoRealizedPl = calcRealizedPl(cryptoHistory);
  const goldRealizedPl = calcRealizedPl(goldHistory);
  const stockRealizedPl = calcRealizedPl(stockHistory);

  // Slot capacities
  const maxCryptoLimit = settingsForm.max_crypto_open_trades ?? settingsForm.max_open_trades ?? 5;
  const maxGoldLimit = settingsForm.max_gold_open_trades ?? 3;
  const maxStockLimit = settingsForm.max_stock_open_trades ?? 4;

  const ccy = account?.currency ?? "";
  const pl = account?.profit ?? 0;

  // Filter positions for the table based on active tab
  const getFilteredPositions = () => {
    switch (activeTab) {
      case 1: return cryptoPositions;
      case 2: return goldPositions;
      case 3: return stockPositions;
      default: return positions;
    }
  };

  const getFilteredPl = () => {
    switch (activeTab) {
      case 1: return cryptoOpenPl;
      case 2: return goldOpenPl;
      case 3: return stockOpenPl;
      default: return pl;
    }
  };

  const getAssetBadge = (sym: string) => {
    if (isCryptoSymbol(sym)) return <Chip size="small" label="Crypto" sx={{ bgcolor: "rgba(59, 130, 246, 0.15)", color: "#60a5fa", fontWeight: 700, border: "1px solid rgba(59, 130, 246, 0.3)" }} />;
    if (isMetalSymbol(sym)) return <Chip size="small" label="Gold / Metal" sx={{ bgcolor: "rgba(245, 158, 11, 0.15)", color: "#fbbf24", fontWeight: 700, border: "1px solid rgba(245, 158, 11, 0.3)" }} />;
    if (isStockSymbol(sym)) return <Chip size="small" label="US Stock" sx={{ bgcolor: "rgba(168, 85, 247, 0.15)", color: "#c084fc", fontWeight: 700, border: "1px solid rgba(168, 85, 247, 0.3)" }} />;
    return <Chip size="small" label="Forex" sx={{ bgcolor: "rgba(148, 163, 184, 0.15)", color: "#cbd5e1", fontWeight: 700, border: "1px solid rgba(148, 163, 184, 0.3)" }} />;
  };

  const renderPerformanceText = (val: number) => {
    const isPos = val >= 0;
    const color = isPos ? "#16c784" : "#ea3943";
    return (
      <Typography variant="body1" sx={{ ...MONO, fontWeight: 800, color, display: "flex", alignItems: "center", gap: 0.5 }}>
        {isPos ? <TrendingUp size={16} color="#16c784" /> : <TrendingDown size={16} color="#ea3943" />}
        {isPos ? "+" : ""}{fmt(val)}{" "}
        <span style={{ fontSize: 10, fontWeight: 500, color: "#64748b" }}>{ccy}</span>
      </Typography>
    );
  };

  // Circuit Breaker detection logic
  const maxConsecutive = settingsForm.max_consecutive_losses ?? 0;
  const botMagics = new Set([settingsForm.magic, settingsForm.gold_magic, settingsForm.stock_magic].filter(Boolean));
  
  const closedDeals = history
    .filter((d) => d.entry === "OUT" && botMagics.has(d.magic))
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  const recentDeals = closedDeals.slice(0, maxConsecutive);
  const isCircuitBreakerActive = 
    maxConsecutive > 0 &&
    recentDeals.length === maxConsecutive &&
    recentDeals.every((d) => (d.profit ?? 0) + (d.commission ?? 0) + (d.swap ?? 0) < 0);

  // Daily Loss detection logic
  const maxDailyLoss = settingsForm.max_daily_loss_pct ?? 0;
  const balance = account?.balance ?? 1;
  const curD = new Date();
  const yyyy = curD.getFullYear();
  const mm = String(curD.getMonth() + 1).padStart(2, '0');
  const dd = String(curD.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  const todayClosed = history.filter((d) => 
    d.entry === "OUT" && 
    d.time.startsWith(todayStr) && 
    botMagics.has(d.magic)
  );

  const todayPnl = todayClosed.reduce((sum, d) => sum + (d.profit ?? 0) + (d.commission ?? 0) + (d.swap ?? 0), 0);
  const isDailyLossLimitActive = 
    maxDailyLoss > 0 && 
    todayPnl < 0 && 
    Math.abs(todayPnl) / balance >= maxDailyLoss;

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "#090d16", color: "#e2e8f0" }}>
      <Sidebar
        connected={connected}
        equity={account?.equity}
        currency={ccy}
        onOpenLog={() => setLogOpen(true)}
        onSync={() => { refresh(); }}
      />

      {/* Main Content Area */}
      <Box sx={{ flexGrow: 1, ml: `${SIDEBAR_W}px`, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <TopBar
          pageTitle="Trading Advisor Dashboard"
          pageIcon={<Activity size={15} />}
          connected={connected}
          accountLogin={account?.login}
          balance={account?.balance}
          equity={account?.equity}
          currency={ccy}
          openPl={pl}
          botEnabled={settingsForm.bot_enabled ?? false}
          strategy={settingsForm.strategy ?? ""}
        />

        <Container maxWidth={false} sx={{ width: "100%", maxWidth: "none", px: { xs: 2, md: 3 }, py: 3, flexGrow: 1, overflowY: "auto" }}>
          <Stack spacing={3.5}>
            
            {/* Circuit Breaker Alerts */}
            {isCircuitBreakerActive && (
              <Alert 
                severity="error" 
                variant="outlined"
                action={
                  <Button 
                    color="error" 
                    variant="outlined"
                    size="small" 
                    onClick={handleDisableLossLimit}
                    sx={{ 
                      fontWeight: 800, 
                      fontSize: "0.72rem",
                      borderColor: "rgba(234, 57, 67, 0.5)", 
                      bgcolor: "rgba(234, 57, 67, 0.06)",
                      color: "#f87171",
                      px: 2,
                      borderRadius: 1,
                      "&:hover": { 
                        borderColor: "#ea3943", 
                        bgcolor: "rgba(234, 57, 67, 0.15)" 
                      } 
                    }}
                  >
                    Resume Trading (ปลดล็อกและเริ่มเทรดต่อ)
                  </Button>
                }
                sx={{ 
                  borderRadius: 1.5, 
                  bgcolor: "rgba(234, 57, 67, 0.03)", 
                  borderColor: "rgba(234, 57, 67, 0.25)",
                  boxShadow: "0 4px 15px rgba(234, 57, 67, 0.08)",
                  color: "#f87171", 
                  fontWeight: 700,
                  "& .MuiAlert-icon": { color: "#ef4444" }
                }}
              >
                ⛔ Circuit Breaker Active: ขาดทุนติดต่อกันครบ {maxConsecutive} ไม้ล่าสุด บอทสั่งหยุดเทรดอัตโนมัติชั่วคราว
              </Alert>
            )}

            {isDailyLossLimitActive && (
              <Alert 
                severity="error" 
                variant="outlined"
                action={
                  <Button 
                    color="error" 
                    variant="outlined"
                    size="small" 
                    onClick={handleDisableDailyLossLimit}
                    sx={{ 
                      fontWeight: 800, 
                      fontSize: "0.72rem",
                      borderColor: "rgba(234, 57, 67, 0.5)", 
                      bgcolor: "rgba(234, 57, 67, 0.06)",
                      color: "#f87171",
                      px: 2,
                      borderRadius: 1,
                      "&:hover": { 
                        borderColor: "#ea3943", 
                        bgcolor: "rgba(234, 57, 67, 0.15)" 
                      } 
                    }}
                  >
                    Resume Trading (ปลดล็อกและเริ่มเทรดต่อ)
                  </Button>
                }
                sx={{ 
                  borderRadius: 1.5, 
                  bgcolor: "rgba(234, 57, 67, 0.03)", 
                  borderColor: "rgba(234, 57, 67, 0.25)",
                  boxShadow: "0 4px 15px rgba(234, 57, 67, 0.08)",
                  color: "#f87171", 
                  fontWeight: 700,
                  "& .MuiAlert-icon": { color: "#ef4444" }
                }}
              >
                ⛔ Circuit Breaker Active: วันนี้ขาดทุนถึงขีดจำกัดสูงสุด {maxDailyLoss * 100}% ของบาลานซ์แล้ว (P/L: {todayPnl.toFixed(2)} {ccy}) บอทหยุดเทรดถึงวันพรุ่งนี้
              </Alert>
            )}

            {/* Asset Bot Health & Performance Overview */}
            <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" } }}>
              
              {/* Crypto Bot */}
              <Card sx={{ border: "1px solid rgba(255, 255, 255, 0.04)", bgcolor: "#0d1321" }}>
                <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
                  <Stack direction="row" spacing={2} sx={{ alignItems: "center", mb: 2 }}>
                    <PixelBotAvatar
                      botEnabled={settingsForm.bot_enabled ?? false}
                      assetType="crypto"
                      recentLogs={botLogs}
                    />
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 1 }}>
                          <Coins size={16} color="#3b82f6" /> Crypto Advisor
                        </Typography>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                          <Chip
                            size="small"
                            label={settingsForm.bot_enabled ? "ACTIVE" : "INACTIVE"}
                            color={settingsForm.bot_enabled ? "success" : "default"}
                            sx={{ fontWeight: 800, fontSize: 9, height: 18 }}
                          />
                          <Chip
                            size="small"
                            icon={<Brain size={10} style={{ color: settingsForm.use_ai ? "#60a5fa" : "#64748b" }} />}
                            label={settingsForm.use_ai ? "AI" : "NO AI"}
                            variant="outlined"
                            sx={{
                              fontWeight: 800,
                              fontSize: 9,
                              height: 18,
                              color: settingsForm.use_ai ? "#60a5fa" : "#64748b",
                              borderColor: settingsForm.use_ai ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.08)",
                              bgcolor: settingsForm.use_ai ? "rgba(59,130,246,0.05)" : "transparent",
                              "& .MuiChip-icon": { color: "inherit" }
                            }}
                          />
                        </Stack>
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 10, ...MONO, mb: 1 }}>
                        Strategy: {settingsForm.strategy || "—"}
                      </Typography>
                    </Box>
                  </Stack>

                  <Stack spacing={1.5} sx={{ mb: 2.5, bgcolor: "rgba(255, 255, 255, 0.015)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: 1.5, p: 1.5 }}>
                    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                        Capacity Channels
                      </Typography>
                      <Typography variant="caption" sx={{ ...MONO, fontWeight: 800, color: "#60a5fa" }}>
                        {cryptoPositions.length} / {maxCryptoLimit}
                      </Typography>
                    </Stack>
                    <SlotCapacity
                      used={cryptoPositions.length}
                      max={maxCryptoLimit}
                      on={settingsForm.bot_enabled ?? false}
                      color="#3b82f6"
                      glowColor="rgba(59, 130, 246, 0.4)"
                    />
                  </Stack>

                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, pt: 1.5, borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, display: "block", textTransform: "uppercase", fontWeight: 700 }}>
                        Open Profit
                      </Typography>
                      {renderPerformanceText(cryptoOpenPl)}
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, display: "block", textTransform: "uppercase", fontWeight: 700 }}>
                        7D Realized P/L
                      </Typography>
                      {renderPerformanceText(cryptoRealizedPl)}
                    </Box>
                  </Box>
                </CardContent>
              </Card>

              {/* Gold Bot */}
              <Card sx={{ border: "1px solid rgba(255, 255, 255, 0.04)", bgcolor: "#0d1321" }}>
                <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
                  <Stack direction="row" spacing={2} sx={{ alignItems: "center", mb: 2 }}>
                    <PixelBotAvatar
                      botEnabled={settingsForm.gold_bot_enabled ?? false}
                      assetType="gold"
                      recentLogs={botLogs}
                    />
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 1 }}>
                          <Sparkles size={16} color="#f59e0b" /> Gold Advisor
                        </Typography>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                          <Chip
                            size="small"
                            label={settingsForm.gold_bot_enabled ? "ACTIVE" : "INACTIVE"}
                            color={settingsForm.gold_bot_enabled ? "success" : "default"}
                            sx={{ fontWeight: 800, fontSize: 9, height: 18 }}
                          />
                          <Chip
                            size="small"
                            icon={<Brain size={10} style={{ color: settingsForm.use_ai ? "#60a5fa" : "#64748b" }} />}
                            label={settingsForm.use_ai ? "AI" : "NO AI"}
                            variant="outlined"
                            sx={{
                              fontWeight: 800,
                              fontSize: 9,
                              height: 18,
                              color: settingsForm.use_ai ? "#60a5fa" : "#64748b",
                              borderColor: settingsForm.use_ai ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.08)",
                              bgcolor: settingsForm.use_ai ? "rgba(59,130,246,0.05)" : "transparent",
                              "& .MuiChip-icon": { color: "inherit" }
                            }}
                          />
                        </Stack>
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 10, ...MONO, mb: 1 }}>
                        Strategy: {settingsForm.gold_strategy || "—"}
                      </Typography>
                    </Box>
                  </Stack>

                  <Stack spacing={1.5} sx={{ mb: 2.5, bgcolor: "rgba(255, 255, 255, 0.015)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: 1.5, p: 1.5 }}>
                    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                        Capacity Channels
                      </Typography>
                      <Typography variant="caption" sx={{ ...MONO, fontWeight: 800, color: "#fbbf24" }}>
                        {goldPositions.length} / {maxGoldLimit}
                      </Typography>
                    </Stack>
                    <SlotCapacity
                      used={goldPositions.length}
                      max={maxGoldLimit}
                      on={settingsForm.gold_bot_enabled ?? false}
                      color="#f59e0b"
                      glowColor="rgba(245, 158, 11, 0.4)"
                    />
                  </Stack>

                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, pt: 1.5, borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, display: "block", textTransform: "uppercase", fontWeight: 700 }}>
                        Open Profit
                      </Typography>
                      {renderPerformanceText(goldOpenPl)}
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, display: "block", textTransform: "uppercase", fontWeight: 700 }}>
                        7D Realized P/L
                      </Typography>
                      {renderPerformanceText(goldRealizedPl)}
                    </Box>
                  </Box>
                </CardContent>
              </Card>

              {/* Stock Bot */}
              <Card sx={{ border: "1px solid rgba(255, 255, 255, 0.04)", bgcolor: "#0d1321" }}>
                <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
                  <Stack direction="row" spacing={2} sx={{ alignItems: "center", mb: 2 }}>
                    <PixelBotAvatar
                      botEnabled={settingsForm.stock_bot_enabled ?? false}
                      assetType="stock"
                      recentLogs={botLogs}
                    />
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 1 }}>
                          <Activity size={16} color="#a855f7" /> US Stock Advisor
                        </Typography>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                          <Chip
                            size="small"
                            label={settingsForm.stock_bot_enabled ? "ACTIVE" : "INACTIVE"}
                            color={settingsForm.stock_bot_enabled ? "success" : "default"}
                            sx={{ fontWeight: 800, fontSize: 9, height: 18 }}
                          />
                          <Chip
                            size="small"
                            icon={<Brain size={10} style={{ color: settingsForm.stock_use_ai ? "#60a5fa" : "#64748b" }} />}
                            label={settingsForm.stock_use_ai ? "AI" : "NO AI"}
                            variant="outlined"
                            sx={{
                              fontWeight: 800,
                              fontSize: 9,
                              height: 18,
                              color: settingsForm.stock_use_ai ? "#60a5fa" : "#64748b",
                              borderColor: settingsForm.stock_use_ai ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.08)",
                              bgcolor: settingsForm.stock_use_ai ? "rgba(59,130,246,0.05)" : "transparent",
                              "& .MuiChip-icon": { color: "inherit" }
                            }}
                          />
                        </Stack>
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 10, ...MONO, mb: 1 }}>
                        Strategy: {settingsForm.stock_strategy || "—"}
                      </Typography>
                    </Box>
                  </Stack>

                  <Stack spacing={1.5} sx={{ mb: 2.5, bgcolor: "rgba(255, 255, 255, 0.015)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: 1.5, p: 1.5 }}>
                    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                        Capacity Channels
                      </Typography>
                      <Typography variant="caption" sx={{ ...MONO, fontWeight: 800, color: "#c084fc" }}>
                        {stockPositions.length} / {maxStockLimit}
                      </Typography>
                    </Stack>
                    <SlotCapacity
                      used={stockPositions.length}
                      max={maxStockLimit}
                      on={settingsForm.stock_bot_enabled ?? false}
                      color="#a855f7"
                      glowColor="rgba(168, 85, 247, 0.4)"
                    />
                  </Stack>

                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, pt: 1.5, borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, display: "block", textTransform: "uppercase", fontWeight: 700 }}>
                        Open Profit
                      </Typography>
                      {renderPerformanceText(stockOpenPl)}
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, display: "block", textTransform: "uppercase", fontWeight: 700 }}>
                        7D Realized P/L
                      </Typography>
                      {renderPerformanceText(stockRealizedPl)}
                    </Box>
                  </Box>
                </CardContent>
              </Card>

            </Box>

            {/* Trading Operations / Positions Console */}
            <Card sx={{ border: "1px solid rgba(255, 255, 255, 0.04)" }}>
              <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
                <Box sx={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)", px: 2.5, pt: 1, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
                  <Tabs
                    value={activeTab}
                    onChange={(_, val) => setActiveTab(val)}
                    textColor="primary"
                    indicatorColor="primary"
                    sx={{
                      "& .MuiTab-root": { color: "#64748b", fontWeight: 700, px: 2, py: 2, minWidth: "auto", fontSize: "0.85rem" },
                      "& .Mui-selected": { color: "primary.main" },
                    }}
                  >
                    <Tab label={`All Positions (${positions.length})`} />
                    <Tab label={`Crypto (${cryptoPositions.length})`} />
                    <Tab label={`Gold / Metals (${goldPositions.length})`} />
                    <Tab label={`US Stocks (${stockPositions.length})`} />
                  </Tabs>

                  {getFilteredPositions().length > 0 && (
                    <Chip
                      size="small"
                      label={`Open P/L: ${getFilteredPl() >= 0 ? "+" : ""}${fmt(getFilteredPl())} ${ccy}`}
                      color={getFilteredPl() >= 0 ? "success" : "error"}
                      sx={{ fontWeight: 800, px: 1, my: 1.5 }}
                    />
                  )}
                </Box>

                <Box sx={{ overflowX: "auto" }}>
                  {getFilteredPositions().length === 0 ? (
                    <Typography align="center" color="text.secondary" sx={{ py: 6, fontStyle: "italic" }}>
                      No active positions matching this category.
                    </Typography>
                  ) : (
                    <Table size="small" sx={{ minWidth: 1040 }}>
                      <TableHead sx={{ bgcolor: "rgba(255,255,255,0.018)" }}>
                        <TableRow>
                          <TableCell sx={{ py: 1.5, fontSize: 11, fontWeight: 800, color: "#64748b", borderColor: "rgba(255,255,255,0.05)", textTransform: "uppercase" }}>Position</TableCell>
                          <TableCell sx={{ py: 1.5, fontSize: 11, fontWeight: 800, color: "#64748b", borderColor: "rgba(255,255,255,0.05)", textTransform: "uppercase" }}>Market</TableCell>
                          <TableCell align="right" sx={{ py: 1.5, fontSize: 11, fontWeight: 800, color: "#64748b", borderColor: "rgba(255,255,255,0.05)", textTransform: "uppercase" }}>Volume</TableCell>
                          <TableCell align="right" sx={{ py: 1.5, fontSize: 11, fontWeight: 800, color: "#64748b", borderColor: "rgba(255,255,255,0.05)", textTransform: "uppercase" }}>Entry</TableCell>
                          <TableCell align="right" sx={{ py: 1.5, fontSize: 11, fontWeight: 800, color: "#64748b", borderColor: "rgba(255,255,255,0.05)", textTransform: "uppercase" }}>Current</TableCell>
                          <TableCell align="right" sx={{ py: 1.5, fontSize: 11, fontWeight: 800, color: "#64748b", borderColor: "rgba(255,255,255,0.05)", textTransform: "uppercase" }}>P/L</TableCell>
                          <TableCell align="right" sx={{ py: 1.5, fontSize: 11, fontWeight: 800, color: "#64748b", borderColor: "rgba(255,255,255,0.05)", textTransform: "uppercase" }}>Action</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {getFilteredPositions().map((p) => {
                          const pnlPct = positionPnlPct(p);
                          const pnlPositive = pnlPct !== null ? pnlPct >= 0 : p.profit >= 0;
                          const pnlColor = pnlPositive ? "#16c784" : "#ea3943";
                          return (
                            <TableRow
                              key={p.ticket}
                              hover
                              sx={{
                                borderBottom: "1px solid rgba(255,255,255,0.04)",
                                bgcolor: "rgba(255,255,255,0.004)",
                                "&:hover": { bgcolor: "rgba(255,255,255,0.025) !important" },
                              }}
                            >
                              <TableCell sx={{ py: 1.5 }}>
                                <Stack spacing={0.5}>
                                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                    <Typography sx={{ fontWeight: 850, color: "#f8fafc", lineHeight: 1 }}>
                                      {p.symbol}
                                    </Typography>
                                    <Chip
                                      size="small"
                                      label={actionLabel(p.type)}
                                      color={actionColor(p.type)}
                                      variant="outlined"
                                      sx={{ height: 20, fontSize: 10, fontWeight: 850 }}
                                    />
                                  </Stack>
                                  <Typography variant="caption" sx={{ ...MONO, color: "#64748b" }}>
                                    Ticket #{p.ticket}
                                  </Typography>
                                </Stack>
                              </TableCell>
                              <TableCell sx={{ py: 1.5 }}>
                                {getAssetBadge(p.symbol)}
                              </TableCell>
                              <TableCell align="right" sx={{ ...MONO, color: "#e2e8f0", fontWeight: 750 }}>
                                {fmt(p.volume, 2)}
                              </TableCell>
                              <TableCell align="right" sx={{ py: 1.5 }}>
                                <Typography sx={{ ...MONO, fontWeight: 850, color: "#f8fafc", lineHeight: 1.15 }}>
                                  {fmtPrice(p.price_open)}
                                </Typography>
                                <Typography variant="caption" sx={{ color: "#64748b" }}>
                                  entry
                                </Typography>
                              </TableCell>
                              <TableCell align="right" sx={{ ...MONO, color: "#cbd5e1", fontWeight: 700 }}>
                                {fmtPrice(p.price_current)}
                              </TableCell>
                              <TableCell align="right" sx={{ py: 1.5 }}>
                                <Typography sx={{ ...MONO, color: pnlColor, fontWeight: 900, lineHeight: 1.15 }}>
                                  {p.profit >= 0 ? "+" : ""}{fmt(p.profit)} {ccy}
                                </Typography>
                                <Typography variant="caption" sx={{ ...MONO, color: pnlColor, fontWeight: 800 }}>
                                  {pnlPct === null ? "-" : `${pnlPct >= 0 ? "+" : ""}${fmt(pnlPct)}%`}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                <Button
                                  size="small"
                                  color="error"
                                  variant="outlined"
                                  disabled={closingTicket === p.ticket}
                                  onClick={() => setCloseCandidate(p)}
                                  sx={{
                                    minWidth: 76,
                                    borderRadius: 1,
                                    py: 0.35,
                                    fontSize: "0.72rem",
                                    fontWeight: 850,
                                    borderColor: "rgba(234,57,67,0.35)",
                                    bgcolor: "rgba(234,57,67,0.04)",
                                  }}
                                >
                                  {closingTicket === p.ticket ? <CircularProgress size={14} color="inherit" /> : "Close"}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </Box>
              </CardContent>
            </Card>
            
          </Stack>
        </Container>
      </Box>

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
              <Typography variant="caption" sx={{ color: "#475569" }}>
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

      <Dialog
        open={Boolean(closeCandidate)}
        onClose={() => {
          if (!closingTicket) setCloseCandidate(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Confirm Close Position</DialogTitle>
        <DialogContent dividers>
          {closeCandidate && (
            <Stack spacing={2}>
              <Alert severity={closeCandidate.profit >= 0 ? "success" : "warning"}>
                Close {closeCandidate.symbol} at the current market price?
              </Alert>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25 }}>
                {[
                  ["Ticket", String(closeCandidate.ticket)],
                  ["Symbol", closeCandidate.symbol],
                  ["Side", actionLabel(closeCandidate.type)],
                  ["Volume", String(closeCandidate.volume)],
                  ["Open", fmtPrice(closeCandidate.price_open)],
                  ["Current", fmtPrice(closeCandidate.price_current)],
                  ["P/L", `${closeCandidate.profit >= 0 ? "+" : ""}${fmt(closeCandidate.profit)} ${ccy}`],
                ].map(([label, value]) => (
                  <Box key={label} sx={{ p: 1, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 1 }}>
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
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={Boolean(closingTicket) || !closeCandidate}
            onClick={async () => {
              if (!closeCandidate) return;
              const ticket = closeCandidate.ticket;
              setCloseCandidate(null);
              await closePos(ticket);
            }}
            startIcon={closingTicket ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            Confirm Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
