"use client";

import { useEffect, useState } from "react";
import { Box, Stack, Typography, Dialog, DialogTitle, DialogContent, DialogActions, Button, Chip, Divider, Menu, IconButton } from "@mui/material";
import { Bot, Clock, Settings, TrendingDown, TrendingUp, Wallet, HelpCircle, Info, Star, Brain, ChevronDown } from "lucide-react";

export type TopBarProps = {
  pageTitle: string;
  pageIcon: React.ReactNode;
  connected: boolean | null;
  accountLogin?: number;
  balance?: number;
  equity?: number;
  currency: string;
  openPl?: number;
  botEnabled: boolean;
  strategy: string;
  aiEnabled?: boolean;
  assetType?: "crypto" | "gold" | "stock" | "forex";
  onChangeStrategy?: (newStrategy: string) => void;
  onOpenSettings?: () => void;
};

const MONO = { fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums" } as const;

const strategyShort: Record<string, string> = {
  squeeze_breakout: "Squeeze",
  adaptive_trend: "AdaptiveTrend",
  stock_pullback: "StockPullback",
  stock_intraday: "Stock M30",
  supertrend_ema: "SuperTrend+EMA",
  ema_macd_rsi: "EMA+MACD",
  trend: "Trend",
  mean_reversion: "MeanRev",
  breakout: "Breakout",
  forex_trend_pullback: "TrendPullback",
  forex_intraday: "Forex M15",
  gold_h4: "Gold H4",
  gold_quality: "Gold Quality",
  gold_intraday: "Gold H1",
  crypto_scalp: "Crypto Scalp",
  crypto_swing: "Crypto Swing",
};

const STRATEGIES: { name: string; label: string; tf: string; rr: string; desc: string }[] = [
  // ── Crypto ────────────────────────────────────────────────────────────────
  { name: "crypto_swing",         label: "Crypto Swing",        tf: "H4",  rr: "2.5:1", desc: "EMA21/50 trend · ADX≥22 · EMA20 pullback reclaim" },
  { name: "crypto_scalp",         label: "Crypto Scalp",        tf: "M15", rr: "1.1:1", desc: "RSI+Bollinger extreme fade · ปิดเร็ว ไม่ค้างคืน" },
  // ── Gold ──────────────────────────────────────────────────────────────────
  { name: "gold_quality",         label: "Gold Quality",        tf: "H4",  rr: "3:1",   desc: "Breakout-Retest · ADX≥25 · SL structure แคบ" },
  { name: "gold_intraday",        label: "Gold H1 Intraday",    tf: "H1",  rr: "2:1",   desc: "London/NY · EMA9 pullback หรือ BB fade · ≤8h" },
  // ── Stock ─────────────────────────────────────────────────────────────────
  { name: "stock_pullback",       label: "Stock Pullback",      tf: "H4",  rr: "3:1",   desc: "EMA200 uptrend · pullback EMA50 · RSI≤45" },
  { name: "stock_intraday",       label: "Stock M30 Intraday",  tf: "M30", rr: "1.8:1", desc: "NYSE session · EMA9 reclaim · Volume≥1x · ≤4h" },
  // ── Forex ─────────────────────────────────────────────────────────────────
  { name: "forex_trend_pullback", label: "Forex H1 Trend",      tf: "H1",  rr: "2:1",   desc: "EMA20/50/200 · ADX/DMI · EMA20 reclaim" },
  { name: "forex_intraday",       label: "Forex M15 Intraday",  tf: "M15", rr: "1.4:1", desc: "London/NY · EMA9 reclaim · ADX≥15 · ≤4h" },
  // ── Generic / Multi-asset ─────────────────────────────────────────────────
  { name: "gold_h4",              label: "Gold H4 Pullback",    tf: "H4",  rr: "2:1",   desc: "EMA21/50/200 · ADX≥18 · EMA21 pullback reclaim" },
  { name: "adaptive_trend",       label: "Adaptive Trend",      tf: "H4",  rr: "adj",   desc: "Regime-aware: Trend pullback + Breakout + Range" },
  { name: "squeeze_breakout",     label: "Squeeze Breakout",    tf: "H4",  rr: "adj",   desc: "Bollinger Squeeze · Volume Spike ≥1.5x" },
  { name: "supertrend_ema",       label: "SuperTrend + EMA",    tf: "H4",  rr: "adj",   desc: "EMA200 major filter · SuperTrend flip entry" },
  { name: "ema_macd_rsi",         label: "EMA + MACD + RSI",    tf: "H1",  rr: "adj",   desc: "3-indicator confluence · conservative entry" },
  { name: "trend",                label: "Trend Follow",         tf: "H1",  rr: "adj",   desc: "EMA50 slope direction · MACD momentum" },
  { name: "mean_reversion",       label: "Mean Reversion",       tf: "H1",  rr: "adj",   desc: "Bollinger Band midpoint fade · RSI extreme" },
  { name: "breakout",             label: "Breakout",             tf: "H4",  rr: "adj",   desc: "Donchian 20-bar high/low break · MACD confirm" },
];

// 5-star strategies per asset type (from the strategy suitability guide)
const FIVE_STAR: Record<string, string[]> = {
  crypto: ["crypto_swing", "crypto_scalp", "adaptive_trend", "squeeze_breakout"],
  gold:   ["gold_quality", "gold_intraday", "gold_h4"],
  stock:  ["stock_intraday", "stock_pullback"],
  forex:  ["forex_intraday", "forex_trend_pullback", "ema_macd_rsi"],
};

// Short-term vs long-term classification per asset type
const SHORT_TERM: Record<string, string[]> = {
  crypto: ["crypto_scalp"],
  gold:   ["gold_intraday"],
  forex:  ["forex_intraday"],
  stock:  ["stock_intraday"],
};
const LONG_TERM: Record<string, string[]> = {
  crypto: ["crypto_swing"],
  gold:   ["gold_quality", "gold_h4"],
  forex:  ["forex_trend_pullback"],
  stock:  ["stock_pullback"],
};

// Which strategies each asset type may use — mirrors the `groups` declared on
// each Strategy in backend/app/strategy.py. Strategies absent from a list are
// hidden for that asset type (e.g. crypto-only strategies on the forex page).
const STRATEGY_GROUPS: Record<string, string[]> = {
  // Dedicated per-asset (short + long pairs)
  crypto_swing:         ["crypto"],
  crypto_scalp:         ["crypto"],
  gold_quality:         ["gold"],
  gold_intraday:        ["gold"],
  gold_h4:              ["gold"],
  stock_pullback:       ["stock"],
  stock_intraday:       ["stock"],
  forex_trend_pullback: ["forex"],
  forex_intraday:       ["forex"],
  // Multi-asset
  adaptive_trend:     ["crypto", "gold", "stock", "forex"],
  squeeze_breakout:   ["crypto", "gold", "stock", "forex"],
  supertrend_ema:     ["crypto", "gold", "stock"],
  ema_macd_rsi:       ["crypto", "gold", "stock", "forex"],
  trend:              ["crypto", "gold", "stock", "forex"],
  mean_reversion:     ["crypto", "gold", "stock", "forex"],
  breakout:           ["crypto", "gold", "stock", "forex"],
};

export default function TopBar({
  pageTitle,
  pageIcon,
  connected,
  accountLogin,
  balance,
  equity,
  currency,
  openPl = 0,
  botEnabled,
  strategy,
  aiEnabled,
  assetType,
  onChangeStrategy,
  onOpenSettings,
}: TopBarProps) {
  const [time, setTime] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const isMenuOpen = Boolean(menuAnchor);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  useEffect(() => {
    const tick = () => setTime(new Date(Date.now() + 7 * 3_600_000).toISOString().substring(11, 19));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const connColor   = connected === null ? "#64748b" : connected ? "#10b981" : "#ef4444";
  const connLabel   = connected === null ? "Connecting…" : connected ? `MT5 #${accountLogin}` : "Offline";
  const openPlColor = openPl > 0 ? "#10b981" : openPl < 0 ? "#ef4444" : "#64748b";
  const equityColor =
    equity !== undefined && balance !== undefined
      ? equity >= balance ? "#10b981" : "#f97316"
      : "#f1f5f9";
  const fmtN = (v?: number) => (v !== undefined ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");

  const vSep = (
    <Box sx={{ width: "1px", alignSelf: "stretch", my: "10px", bgcolor: "rgba(255,255,255,0.07)", flexShrink: 0 }} />
  );

  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        bgcolor: "#080d18",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        borderTop: "2px solid #3b82f6",
        display: "flex",
        flexDirection: "column",
        height: { xs: 90, md: 54 },
      }}
    >
      {/* DESKTOP LAYOUT - display on md and up */}
      <Box
        sx={{
          display: { xs: "none", md: "flex" },
          alignItems: "stretch",
          height: 54,
          width: "100%",
        }}
      >
        {/* Page title */}
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", px: 2.5, flexShrink: 0 }}>
          <Box sx={{ color: "#3b82f6", display: "flex" }}>{pageIcon}</Box>
          <Typography sx={{ fontSize: "0.88rem", fontWeight: 750, color: "#f1f5f9", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>
            {pageTitle}
          </Typography>
        </Stack>

        {vSep}

        {/* Connection status */}
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", px: 2, flexShrink: 0 }}>
          <Box
            sx={{
              width: 7, height: 7, borderRadius: "50%", bgcolor: connColor, flexShrink: 0,
              boxShadow: connected ? `0 0 6px ${connColor}` : "none",
            }}
          />
          <Typography sx={{ fontSize: "0.72rem", fontWeight: 600, color: connected ? "#94a3b8" : "#ef4444", whiteSpace: "nowrap" }}>
            {connLabel}
          </Typography>
        </Stack>

        {vSep}

        {/* ── Key financial metrics ── */}
        <Box sx={{ display: "flex", alignItems: "stretch", bgcolor: "rgba(255,255,255,0.018)", borderRight: "1px solid rgba(255,255,255,0.07)" }}>

          {/* Balance */}
          <Stack sx={{ justifyContent: "center", px: 2.5, flexShrink: 0 }}>
            <Typography sx={{ fontSize: "0.57rem", color: "#475569", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1 }}>
              Balance
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "baseline", mt: 0.3 }}>
              <Typography sx={{ ...MONO, fontSize: "1rem", fontWeight: 800, color: "#f1f5f9", lineHeight: 1.1, whiteSpace: "nowrap" }}>
                {fmtN(balance)}
              </Typography>
              <Typography sx={{ fontSize: "0.62rem", fontWeight: 700, color: "#475569", lineHeight: 1 }}>
                {currency}
              </Typography>
            </Stack>
          </Stack>

          <Box sx={{ width: "1px", alignSelf: "stretch", my: "10px", bgcolor: "rgba(255,255,255,0.06)" }} />

          {/* Equity */}
          <Stack sx={{ justifyContent: "center", px: 2.5, flexShrink: 0 }}>
            <Typography sx={{ fontSize: "0.57rem", color: "#475569", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1 }}>
              Equity
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "baseline", mt: 0.3 }}>
              <Typography sx={{ ...MONO, fontSize: "1rem", fontWeight: 800, color: equityColor, lineHeight: 1.1, whiteSpace: "nowrap" }}>
                {fmtN(equity)}
              </Typography>
              <Typography sx={{ fontSize: "0.62rem", fontWeight: 700, color: "#475569", lineHeight: 1 }}>
                {currency}
              </Typography>
            </Stack>
          </Stack>

          <Box sx={{ width: "1px", alignSelf: "stretch", my: "10px", bgcolor: "rgba(255,255,255,0.06)" }} />

          {/* Open P/L */}
          <Stack sx={{ justifyContent: "center", px: 2.5, flexShrink: 0 }}>
            <Typography sx={{ fontSize: "0.57rem", color: "#475569", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1 }}>
              Open P/L
            </Typography>
            <Stack direction="row" spacing={0.4} sx={{ alignItems: "center", mt: 0.3 }}>
              <Box sx={{ color: openPlColor, display: "flex", flexShrink: 0 }}>
                {openPl >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              </Box>
              <Typography sx={{ ...MONO, fontSize: "1rem", fontWeight: 800, color: openPlColor, lineHeight: 1.1, whiteSpace: "nowrap" }}>
                {openPl >= 0 ? "+" : ""}{fmtN(openPl)}
              </Typography>
            </Stack>
          </Stack>
        </Box>

        {/* Spacer */}
        <Box sx={{ flex: 1, minWidth: 16 }} />

        {/* Bot status badge */}
        <Stack sx={{ justifyContent: "center", px: 2, flexShrink: 0 }}>
          <Box
            sx={{
              display: "flex", alignItems: "center", gap: 0.6,
              px: 1.25, py: 0.45, borderRadius: 1,
              bgcolor: botEnabled ? "rgba(16,185,129,0.1)" : "rgba(71,85,105,0.12)",
              border: `1px solid ${botEnabled ? "rgba(16,185,129,0.28)" : "rgba(71,85,105,0.22)"}`,
            }}
          >
            <Bot size={12} color={botEnabled ? "#10b981" : "#475569"} />
            <Typography sx={{ fontSize: "0.68rem", fontWeight: 800, color: botEnabled ? "#10b981" : "#64748b", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
              {botEnabled ? "BOT ON" : "BOT OFF"}
            </Typography>
          </Box>
        </Stack>

        {/* AI status badge */}
        {aiEnabled !== undefined && (
          <Stack sx={{ justifyContent: "center", pr: 2, flexShrink: 0 }}>
            <Box
              sx={{
                display: "flex", alignItems: "center", gap: 0.6,
                px: 1.25, py: 0.45, borderRadius: 1,
                bgcolor: aiEnabled ? "rgba(59,130,246,0.1)" : "rgba(71,85,105,0.12)",
                border: `1px solid ${aiEnabled ? "rgba(59,130,246,0.28)" : "rgba(71,85,105,0.22)"}`,
              }}
            >
              <Brain size={12} color={aiEnabled ? "#3b82f6" : "#475569"} />
              <Typography sx={{ fontSize: "0.68rem", fontWeight: 800, color: aiEnabled ? "#3b82f6" : "#64748b", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                {aiEnabled ? "AI ON" : "AI OFF"}
              </Typography>
            </Box>
          </Stack>
        )}

        {vSep}

        {/* Strategy badge — hidden until loaded */}
        {strategy && (
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", px: 2, flexShrink: 0 }}>
            <Typography sx={{ fontSize: "0.58rem", color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>
              Strategy
            </Typography>
            <Box
              onClick={(e) => {
                if (onChangeStrategy) {
                  handleMenuOpen(e);
                } else {
                  setGuideOpen(true);
                }
              }}
              sx={{
                px: 0.8, py: 0.25,
                bgcolor: "rgba(59,130,246,0.1)",
                borderRadius: 0.75,
                border: "1px solid rgba(59,130,246,0.22)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                transition: "all 0.2s",
                "&:hover": {
                  bgcolor: "rgba(59,130,246,0.2)",
                  borderColor: "#60a5fa",
                }
              }}
            >
              <Typography sx={{ fontSize: "0.7rem", fontWeight: 800, color: "#60a5fa", whiteSpace: "nowrap", letterSpacing: "0.02em" }}>
                {strategyShort[strategy] ?? strategy}
              </Typography>
              {onChangeStrategy ? <ChevronDown size={10} color="#60a5fa" /> : <HelpCircle size={10} color="#60a5fa" />}
            </Box>
          </Stack>
        )}

        {vSep}

        {/* Clock */}
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", px: 2, flexShrink: 0 }}>
          <Clock size={12} color="#475569" />
          <Typography sx={{ ...MONO, fontSize: "0.82rem", color: "#94a3b8", fontWeight: 700 }}>{time}</Typography>
          <Typography sx={{ fontSize: "0.6rem", color: "#475569", fontWeight: 700 }}>TH</Typography>
        </Stack>

        {/* Settings button — per-page */}
        {onOpenSettings && (
          <>
            {vSep}
            <Box
              onClick={onOpenSettings}
              sx={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 52, height: "100%", flexShrink: 0,
                color: "#475569", cursor: "pointer",
                transition: "all 0.15s",
                "&:hover": { color: "#60a5fa", bgcolor: "rgba(59,130,246,0.06)" },
              }}
            >
              <Settings size={16} />
            </Box>
          </>
        )}
      </Box>

      {/* MOBILE LAYOUT - display on mobile only */}
      <Box
        sx={{
          display: { xs: "flex", md: "none" },
          flexDirection: "column",
          height: 90,
          width: "100%",
        }}
      >
        {/* Row 1: Title, Connection, Bot Status, Settings */}
        <Stack
          direction="row"
          sx={{
            alignItems: "center",
            justifyContent: "space-between",
            height: 45,
            px: 2,
            borderBottom: "1px solid rgba(255,255,255,0.04)"
          }}
        >
          {/* Title & Connection Dot */}
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Box sx={{ color: "#3b82f6", display: "flex" }}>{pageIcon}</Box>
            <Typography sx={{ fontSize: "0.82rem", fontWeight: 750, color: "#f1f5f9", letterSpacing: "-0.01em" }}>
              {pageTitle}
            </Typography>
            <Box
              sx={{
                width: 6, height: 6, borderRadius: "50%", bgcolor: connColor,
                boxShadow: connected ? `0 0 5px ${connColor}` : "none",
              }}
            />
          </Stack>

          {/* Badges and Settings */}
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            {/* Bot Status */}
            <Box
              sx={{
                display: "flex", alignItems: "center",
                px: 0.8, py: 0.25, borderRadius: 0.75,
                bgcolor: botEnabled ? "rgba(16,185,129,0.1)" : "rgba(71,85,105,0.12)",
                border: `1px solid ${botEnabled ? "rgba(16,185,129,0.2)" : "rgba(71,85,105,0.15)"}`,
              }}
            >
              <Typography sx={{ fontSize: "0.58rem", fontWeight: 800, color: botEnabled ? "#10b981" : "#64748b" }}>
                {botEnabled ? "ON" : "OFF"}
              </Typography>
            </Box>

            {/* AI Status */}
            {aiEnabled !== undefined && (
              <Box
                sx={{
                  display: "flex", alignItems: "center",
                  px: 0.8, py: 0.25, borderRadius: 0.75,
                  bgcolor: aiEnabled ? "rgba(59,130,246,0.1)" : "rgba(71,85,105,0.12)",
                  border: `1px solid ${aiEnabled ? "rgba(59,130,246,0.2)" : "rgba(71,85,105,0.15)"}`,
                }}
              >
                <Typography sx={{ fontSize: "0.58rem", fontWeight: 800, color: aiEnabled ? "#3b82f6" : "#64748b" }}>
                  AI
                </Typography>
              </Box>
            )}

            {/* Settings gear */}
            {onOpenSettings && (
              <IconButton onClick={onOpenSettings} sx={{ p: 0.5, color: "#94a3b8" }}>
                <Settings size={16} />
              </IconButton>
            )}
          </Stack>
        </Stack>

        {/* Row 2: Financial Stats and Strategy Dropdown */}
        <Stack
          direction="row"
          sx={{
            alignItems: "center",
            justifyContent: "space-between",
            height: 45,
            px: 2
          }}
        >
          {/* Balance, Equity, PL Inline */}
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            {/* Bal */}
            <Stack>
              <Typography sx={{ fontSize: "0.52rem", color: "#475569", fontWeight: 700, textTransform: "uppercase" }}>
                Bal
              </Typography>
              <Typography sx={{ ...MONO, fontSize: "0.78rem", fontWeight: 750, color: "#e2e8f0" }}>
                {fmtN(balance)}
              </Typography>
            </Stack>

            {/* Eq */}
            <Stack>
              <Typography sx={{ fontSize: "0.52rem", color: "#475569", fontWeight: 700, textTransform: "uppercase" }}>
                Eq
              </Typography>
              <Typography sx={{ ...MONO, fontSize: "0.78rem", fontWeight: 750, color: equityColor }}>
                {fmtN(equity)}
              </Typography>
            </Stack>

            {/* P/L */}
            <Stack>
              <Typography sx={{ fontSize: "0.52rem", color: "#475569", fontWeight: 700, textTransform: "uppercase" }}>
                P/L
              </Typography>
              <Typography sx={{ ...MONO, fontSize: "0.78rem", fontWeight: 800, color: openPlColor }}>
                {openPl >= 0 ? "+" : ""}{fmtN(openPl)}
              </Typography>
            </Stack>
          </Stack>

          {/* Strategy badge */}
          {strategy && (
            <Box
              onClick={(e) => {
                if (onChangeStrategy) {
                  handleMenuOpen(e);
                } else {
                  setGuideOpen(true);
                }
              }}
              sx={{
                px: 0.8, py: 0.25,
                bgcolor: "rgba(59,130,246,0.1)",
                borderRadius: 0.75,
                border: "1px solid rgba(59,130,246,0.22)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 0.4,
                "&:active": {
                  bgcolor: "rgba(59,130,246,0.18)"
                }
              }}
            >
              <Typography sx={{ fontSize: "0.62rem", fontWeight: 850, color: "#60a5fa" }}>
                {strategyShort[strategy] ?? strategy}
              </Typography>
              {onChangeStrategy ? <ChevronDown size={10} color="#60a5fa" /> : <HelpCircle size={10} color="#60a5fa" />}
            </Box>
          )}
        </Stack>
      </Box>

      {/* Suitability Guide Modal */}
      <Dialog
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        maxWidth="md"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              bgcolor: "#0d1321",
              border: "1px solid rgba(59,130,246,0.2)",
              backgroundImage: "none",
              color: "#e2e8f0"
            }
          }
        }}
      >
        <DialogTitle sx={{ borderBottom: "1px solid rgba(255,255,255,0.07)", pb: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Info size={20} color="#60a5fa" />
            <Box>
              <Typography sx={{ fontWeight: 800, color: "#f1f5f9", fontSize: "1.1rem" }}>
                คู่มือความเหมาะสมของกลยุทธ์ตามประเภทสินทรัพย์
              </Typography>
              <Typography variant="caption" sx={{ color: "#64748b" }}>
                เปรียบเทียบการทำงานของแต่ละกลยุทธ์และการจับคู่สินทรัพย์ที่เหมาะสมที่สุด
              </Typography>
            </Box>
          </Stack>
        </DialogTitle>

        <DialogContent sx={{ py: 3 }}>
          <Stack spacing={3.5}>
            <Typography variant="body2" sx={{ color: "#94a3b8", lineHeight: 1.6 }}>
              ระบบเทรดอัตโนมัติ MetaBot มีกลยุทธ์ทางเทคนิคให้เลือกใช้ทั้งหมด 7 รูปแบบ 
              ซึ่งแต่ละรูปแบบมีความโดดเด่นในสภาวะตลาดและประเภทสินทรัพย์ที่แตกต่างกันอย่างสิ้นเชิง 
              การเลือกกลยุทธ์ให้เหมาะสมกับพฤติกรรมราคาของสินทรัพย์จะช่วยเพิ่มอัตราการชนะ (Win Rate) และลดความเสี่ยงจากการเทรดสวนเทรนด์
            </Typography>

            <Divider sx={{ borderColor: "rgba(255,255,255,0.07)" }} />

            {[
              // ── CRYPTO pair ──────────────────────────────────────────────
              {
                name: "crypto_swing",
                label: "Crypto H4 Swing ★★ (เทรดยาว — แนะนำ Crypto)",
                desc: "Crypto H4: ยืนยัน uptrend/downtrend ด้วย EMA21 > EMA50 + slope + ADX ≥ 22 รอ pullback ย่อมาแตะโซน EMA20 (ใน ±0.5×ATR) แล้วเกิดแท่งเขียว/แดงยืนเหนือ/ใต้ EMA20 — SL ตาม swing structure 6 แท่ง, TP 2.5:1",
                assets: [
                  { name: "Crypto", score: "ดีที่สุด", color: "success" },
                  { name: "Gold", score: "ควรระวัง", color: "error" },
                  { name: "Stocks", score: "ควรระวัง", color: "error" },
                  { name: "Forex", score: "ควรระวัง", color: "error" },
                ],
                tip: "จับคู่กับ CRYPTO_TIMEFRAME=H4 — สร้างมาเพื่อรัน swing trade บน BTC/ETH ที่มีเทรนด์ชัด ไม่เล่นในตลาด sideways (ADX < 22 กรองออกอัตโนมัติ)"
              },
              {
                name: "crypto_scalp",
                label: "Crypto Scalp ★★ (เทรดสั้น — แนะนำ Crypto)",
                desc: "Crypto M5/M15: รอ RSI สุดโต่ง (≤28 / ≥72) ที่ขอบล่าง/บน Bollinger Band เข้า fade ด้วย SL แคบ 0.9×ATR, TP 1.1×SL — ปิดเร็ว หลีกเลี่ยง overnight swap XM ที่สูงมาก ใช้คู่กับ time-stop",
                assets: [
                  { name: "Crypto", score: "ดีที่สุด", color: "success" },
                  { name: "Gold", score: "ปานกลาง", color: "warning" },
                  { name: "Stocks", score: "ควรระวัง", color: "error" },
                  { name: "Forex", score: "ควรระวัง", color: "error" },
                ],
                tip: "จับคู่กับ CRYPTO_TIMEFRAME=M15 — ออกแบบให้หลีกเลี่ยง swap XM ที่ ~4%/คืน โดยเข้า-ออกภายในไม่กี่ชั่วโมง ไม่ใช่กลยุทธ์ swing"
              },
              // ── GOLD pair ─────────────────────────────────────────────────
              {
                name: "gold_quality",
                label: "Gold H4 Quality ★★ (เทรดยาว — แนะนำ Gold)",
                desc: "ทองคำ H4: รอ Breakout ทะลุกรอบ 15 แท่งก่อน แล้วรอ Retest กลับมา พร้อม ADX ≥ 25 + EMA full stack — SL แคบตาม Retest low/high, TP 3:1 แม้ Win Rate 45% ก็มี expectancy บวก",
                assets: [
                  { name: "Gold", score: "ดีที่สุด", color: "success" },
                  { name: "Crypto", score: "ควรระวัง", color: "error" },
                  { name: "Stocks", score: "ควรระวัง", color: "error" },
                  { name: "Forex", score: "ควรระวัง", color: "error" },
                ],
                tip: "จับคู่กับ GOLD_TIMEFRAME=H4 — Expectancy_R และ Profit Factor สูงสุด เทรดน้อยแต่คุณภาพสูง SL แคบ TP 3:1 ดีกว่า gold_h4 ในแง่ R:R"
              },
              {
                name: "gold_intraday",
                label: "Gold H1 Intraday ★★ (เทรดสั้น — แนะนำ Gold)",
                desc: "ทองคำ H1 เฉพาะช่วง London/NY (14-22 Bangkok): ปรับ regime อัตโนมัติ — ADX ≥ 20 ใช้ EMA9/21 pullback reclaim (TP 2:1), ADX < 18 ใช้ Bollinger extreme fade (TP เส้นกลาง) ถือสูงสุด 8 ชม.",
                assets: [
                  { name: "Gold", score: "ดีที่สุด", color: "success" },
                  { name: "Crypto", score: "ควรระวัง", color: "error" },
                  { name: "Stocks", score: "ควรระวัง", color: "error" },
                  { name: "Forex", score: "ปานกลาง", color: "warning" },
                ],
                tip: "จับคู่กับ GOLD_TIMEFRAME=H1 — ปรับตาม regime อัตโนมัติ ไม่ต้องสลับกลยุทธ์เอง เหมาะกับการเทรดในช่วงเวลางาน London/NY ที่ spread แคบ"
              },
              // ── STOCK pair ────────────────────────────────────────────────
              {
                name: "stock_intraday",
                label: "Stock M30 Intraday ★★ (เทรดสั้น — แนะนำ Stock)",
                desc: "หุ้น M30 เฉพาะช่วง NYSE (20:00-03:00 Bangkok): EMA9/21/50 full stack + pullback แตะ EMA9 + volume ≥ 1x average — SL ตาม structure + 0.08×ATR buffer, TP 1.8:1 ถือสูงสุด 4 ชม.",
                assets: [
                  { name: "Stocks", score: "ดีที่สุด", color: "success" },
                  { name: "Crypto", score: "ควรระวัง", color: "error" },
                  { name: "Gold", score: "ควรระวัง", color: "error" },
                  { name: "Forex", score: "ควรระวัง", color: "error" },
                ],
                tip: "จับคู่กับ STOCK_TIMEFRAME=M30 — ออกแบบให้เทรดเฉพาะช่วง NYSE เพื่อลด overnight gap risk ของหุ้น US ที่อาจเปิดช่อง ±3% ข้ามคืน"
              },
              {
                name: "stock_pullback",
                label: "Stock Pullback ★ (เทรดยาว — แนะนำ Stock)",
                desc: "หุ้น H4/D1: กรองแนวโน้มขาขึ้นใหญ่ด้วย EMA200 รอราคาย่อตัวแตะ EMA50 (±1.2%) พร้อม RSI ≤ 45 + แท่งเขียวยืนยัน — SL/TP ตาม stock settings เหมาะกับ NVDA/TSLA/AAPL ที่มีเทรนด์ชัด",
                assets: [
                  { name: "Stocks", score: "ดีที่สุด", color: "success" },
                  { name: "Crypto", score: "ดีมาก", color: "success" },
                  { name: "Gold", score: "ดี", color: "info" },
                  { name: "Forex", score: "ปานกลาง", color: "warning" },
                ],
                tip: "จับคู่กับ STOCK_TIMEFRAME=H4 — กลยุทธ์คลาสสิกที่ backtest ดีในหุ้น US ขาขึ้น ถือ swing หลายวัน แต่ SL ตาม EMA50 ทำให้ lose สูงถ้าหุ้นพลิกเทรนด์"
              },
              // ── FOREX pair ────────────────────────────────────────────────
              {
                name: "forex_intraday",
                label: "Forex M15 Intraday ★★ (เทรดสั้น — แนะนำ Forex)",
                desc: "Forex M15 London/NY (13-23 Bangkok): EMA9/21/50 trend + ADX ≥ 15 + EMA9 reclaim candle พร้อม RSI gate — SL ตาม structure cap 1.6×ATR, TP 1.4:1 ถือสูงสุด 4 ชม.",
                assets: [
                  { name: "Forex", score: "ดีที่สุด", color: "success" },
                  { name: "Gold", score: "ดี", color: "info" },
                  { name: "Crypto", score: "ควรระวัง", color: "error" },
                  { name: "Stocks", score: "ควรระวัง", color: "error" },
                ],
                tip: "จับคู่กับ FOREX_TIMEFRAME=M15 — เทรดเร็ว TP เล็ก แต่ trade บ่อยในช่วง liquid session ลด exposure time เหมาะกับ major pairs (EURUSD/GBPUSD/USDJPY)"
              },
              {
                name: "forex_trend_pullback",
                label: "Forex H1 Trend Pullback ★ (เทรดยาว — แนะนำ Forex)",
                desc: "Forex H1: EMA20/50/200 full alignment + ADX ≥ 18 + DMI directional + previous candle touches EMA20 then reclaims with quality body ≥ 0.20×ATR — SL structure cap 2.2×ATR, TP 2:1",
                assets: [
                  { name: "Forex", score: "ดีที่สุด", color: "success" },
                  { name: "Gold", score: "ดีมาก", color: "success" },
                  { name: "Crypto", score: "ดี", color: "info" },
                  { name: "Stocks", score: "ปานกลาง", color: "warning" },
                ],
                tip: "จับคู่กับ FOREX_TIMEFRAME=H1 — เทรดน้อยแต่มีคุณภาพ กรองสัญญาณด้วย DMI (plus_di vs minus_di) เหมาะกับ trend-following บน major pairs"
              },
              // ── General ───────────────────────────────────────────────────
              {
                name: "gold_h4",
                label: "Gold H4 Pullback (ทองคำ H4 alternative)",
                desc: "ทองคำ H4: EMA 21/50/200 + ADX ≥ 18 รอ pullback แตะ EMA21 แล้วเกิดแท่งกลับตัวรีเคลม SL ตาม swing structure 8 แท่ง + buffer ATR เหมาะกับ XAUUSDm บน H4",
                assets: [
                  { name: "Gold", score: "ดีที่สุด", color: "success" },
                  { name: "Crypto", score: "ควรระวัง", color: "error" },
                  { name: "Stocks", score: "ควรระวัง", color: "error" },
                  { name: "Forex", score: "ควรระวัง", color: "error" },
                ],
                tip: "Alternative สำหรับ gold_quality — เข้า trade บ่อยกว่าเพราะ ADX threshold ต่ำกว่า (18 vs 25) แต่ win rate อาจต่ำกว่า ลอง backtest เทียบทั้งสองก่อนเลือก"
              },
              {
                name: "squeeze_breakout",
                label: "Squeeze Breakout (ระเบิดหลังบีบอัด - ใช้ได้ทุก asset)",
                desc: "ตรวจจับความผันผวนบีบแคบ (Bollinger Band Squeeze) เพื่อหาช่วงพักฐาน และสแกนแรงซื้อผิดปกติ (Volume Spike >= 1.5x) เพื่อจับสัญญาณการระเบิดของราคา",
                assets: [
                  { name: "Crypto", score: "ดีที่สุด", color: "success" },
                  { name: "Gold", score: "ดีมาก", color: "success" },
                  { name: "Stocks", score: "ดี", color: "info" },
                  { name: "Forex", score: "ปานกลาง", color: "warning" }
                ],
                tip: "นี่คือกลยุทธ์ระดับ 5 ดาวสำหรับผู้ที่ชอบเข้าซื้อช่วงเริ่มปั๊มต้นน้ำ ป้องกันปัญหาการตกรถและได้เปรียบราคาอย่างสูง"
              },
              {
                name: "stock_pullback",
                label: "Stock Pullback (ซื้อย่อตัวหุ้นขาขึ้น - กลยุทธ์แนะนำ 5 ดาว หุ้น)",
                desc: "กรองแนวโน้มขาขึ้นภาพใหญ่ของหุ้นด้วยเส้น EMA 200 และดักรอจังหวะช้อนซื้อเมื่อราคาปรับย่อลงทดสอบแนวรับเส้น EMA 50 ขณะที่ RSI ย่อตัวล้างความร้อนแรงเพื่อให้ได้ราคาที่ได้เปรียบสูง",
                assets: [
                  { name: "Stocks", score: "ดีที่สุด", color: "success" },
                  { name: "Crypto", score: "ดีมาก", color: "success" },
                  { name: "Gold", score: "ดี", color: "info" },
                  { name: "Forex", score: "ปานกลาง", color: "warning" }
                ],
                tip: "นี่คือกลยุทธ์ระดับ 5 ดาวที่เป็นที่นิยมสูงสุดในตลาดหุ้นระยะยาว ช่วยเลี่ยงการซื้อไล่ราคายอดดอยและจำกัดความเสี่ยงด้วยจุด SL ที่แคบแถวแนวรับ"
              },
              {
                name: "supertrend_ema",
                label: "SuperTrend + EMA 200 (กลยุทธ์แนะนำ)",
                desc: "กรองแนวโน้มหลักของตลาดด้วยเส้น EMA 200 และหาจังหวะเปิดออเดอร์เมื่อเส้นแนวโน้มของ SuperTrend กลับตัว เหมาะสำหรับการเล่นตามเทรนด์ระยะยาวและสลัดสัญญาณหลอก",
                assets: [
                  { name: "Crypto", score: "ดีที่สุด", color: "success" },
                  { name: "Gold", score: "ดีมาก", color: "success" },
                  { name: "Stocks", score: "ดีมาก", color: "success" },
                  { name: "Forex", score: "ดี", color: "info" }
                ],
                tip: "เหมาะกับการเปิดบอทรันเทรนด์ระยะกลางถึงยาวในตลาด Crypto ที่เวลาวิ่งเป็นเทรนด์ใหญ่จะไหลไปได้ไกล"
              },
              {
                name: "trend",
                label: "Trend Follow (ตามแนวโน้ม)",
                desc: "เปิดออเดอร์ตามทิศทางความชันของเส้นค่าเฉลี่ย EMA50 และแรงส่งจาก MACD ถ้าราคาไหลไปทิศทางไหนจะเทรดตามทิศทางนั้นทันที",
                assets: [
                  { name: "Crypto", score: "ดีมาก", color: "success" },
                  { name: "Gold", score: "ดีมาก", color: "success" },
                  { name: "Stocks", score: "ดีมาก", color: "success" },
                  { name: "Forex", score: "ปานกลาง", color: "warning" }
                ],
                tip: "ทำงานได้ดีมากในสภาวะตลาดที่เป็นเทรนด์ชัดเจน แต่ให้หลีกเลี่ยงในสภาวะตลาดสะสมพลังออกข้าง (Sideways)"
              },
              {
                name: "breakout",
                label: "Breakout (ทะลุกรอบความผันผวน)",
                desc: "ดักซื้อขายเมื่อราคาทะลุกรอบราคาสูงสุด/ต่ำสุดในรอบ 20 แท่ง (Donchian Channel) ควบคู่กับแรงเหวี่ยงจาก MACD เพื่อจับจังหวะการระเบิดตัวของราคา",
                assets: [
                  { name: "Crypto", score: "ดีที่สุด", color: "success" },
                  { name: "Gold", score: "ดีมาก", color: "success" },
                  { name: "Stocks", score: "ปานกลาง", color: "warning" },
                  { name: "Forex", score: "ดี", color: "info" }
                ],
                tip: "เนื่องจาก Crypto เป็นตลาดเปิด 24 ชั่วโมง ไม่มีช่องว่างราคาปิดข้ามคืน (Overnight Gap) ทำให้การจับจังหวะเบรกเอาท์ทำงานได้แม่นยำที่สุด"
              },
              {
                name: "ema_macd_rsi",
                label: "EMA + MACD + RSI (แบบประสานข้อมูล)",
                desc: "กลยุทธ์ดั้งเดิมที่ใช้จุดตัดของ EMA เส้นสั้น/ยาว ยืนยันแรงส่งด้วย MACD และควบคุมราคาแพง/ถูกด้วย RSI เป็นกลยุทธ์ที่เน้นความปลอดภัยสูงสุดเนื่องจากต้องรอสัญญาณคอนเฟิร์มพร้อมกัน",
                assets: [
                  { name: "Crypto", score: "ดี", color: "info" },
                  { name: "Gold", score: "ดีมาก", color: "success" },
                  { name: "Stocks", score: "ดี", color: "info" },
                  { name: "Forex", score: "ดีที่สุด", color: "success" }
                ],
                tip: "เหมาะมากสำหรับตลาด Forex หรือสินค้าโภคภัณฑ์ที่มีแนวรับแนวต้านที่ชัดเจน ช่วยป้องกันสัญญาณหลอกได้ดี"
              },
              {
                name: "mean_reversion",
                label: "Mean Reversion (สวนคลื่นกลับเข้าหาค่าเฉลี่ย)",
                desc: "ใช้หลักการทางสถิติของเส้นขอบบน-ล่าง Bollinger Bands ร่วมกับสัญญาณขายมาก/ซื้อมากเกินไปของ RSI เพื่อดักเปิดออเดอร์สวนกลับมาหาค่าเฉลี่ยกลาง",
                assets: [
                  { name: "Crypto", score: "ควรระวัง", color: "error" },
                  { name: "Gold", score: "ดีที่สุด", color: "success" },
                  { name: "Stocks", score: "ปานกลาง", color: "warning" },
                  { name: "Forex", score: "ดีมาก", color: "success" }
                ],
                tip: "ทองคำและ Forex มีพฤติกรรมชอบสะบัดทดสอบขอบราคาแล้วเด้งกลับสูงมาก ทำให้เหมาะกับกลยุทธ์นี้ แต่ให้หลีกเลี่ยงการเปิดสวนราคากับ Crypto ในสภาวะตลาดที่รันเทรนด์รุนแรง"
              }
            ].map((strat) => (
              <Box
                key={strat.name}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: "rgba(255, 255, 255, 0.015)",
                  border: "1px solid rgba(255, 255, 255, 0.04)",
                  "&:hover": {
                    borderColor: "rgba(59, 130, 246, 0.15)",
                    bgcolor: "rgba(255, 255, 255, 0.02)"
                  }
                }}
              >
                <Stack spacing={1.5}>
                  <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", sm: "center" }, gap: 1 }}>
                    <Typography sx={{ fontWeight: 800, color: "#fbbf24", fontSize: "0.95rem" }}>
                      {strat.label}
                    </Typography>
                    
                    <Stack direction="row" useFlexGap spacing={2} sx={{ mt: { xs: 1, sm: 0 }, flexWrap: "wrap", alignItems: "center" }}>
                      {strat.assets.map((asset) => {
                        const starsCount = {
                          "ดีที่สุด": 5,
                          "ดีมาก": 4,
                          "ดี": 3,
                          "ปานกลาง": 2,
                          "ควรระวัง": 1
                        }[asset.score] || 3;
                        const isWarning = starsCount === 1;
                        const isBest = starsCount === 5;
                        return (
                          <Stack
                            key={asset.name}
                            direction="row"
                            spacing={0.75}
                            sx={{
                              alignItems: "center",
                              px: isBest ? 1 : 0.5,
                              py: isBest ? 0.35 : 0.2,
                              borderRadius: 1,
                              border: isBest ? "1px solid rgba(251, 191, 36, 0.25)" : "1px solid transparent",
                              bgcolor: isBest ? "rgba(251, 191, 36, 0.04)" : "transparent",
                              boxShadow: isBest ? "0 0 8px rgba(251, 191, 36, 0.03)" : "none",
                              transition: "all 0.2s"
                            }}
                          >
                            <Typography
                              sx={{
                                fontSize: "0.72rem",
                                fontWeight: isBest ? 800 : 700,
                                color: isBest ? "#fbbf24" : "#cbd5e1",
                                minWidth: 44
                              }}
                            >
                              {asset.name}
                            </Typography>
                            <Stack direction="row" spacing={0.2}>
                              {[1, 2, 3, 4, 5].map((starIdx) => (
                                <Star
                                  key={starIdx}
                                  size={10}
                                  fill={starIdx <= starsCount ? (isWarning ? "#ef4444" : "#fbbf24") : "none"}
                                  color={starIdx <= starsCount ? (isWarning ? "#ef4444" : "#fbbf24") : "rgba(255,255,255,0.08)"}
                                />
                              ))}
                            </Stack>
                          </Stack>
                        );
                      })}
                    </Stack>
                  </Stack>

                  <Typography variant="body2" sx={{ color: "#94a3b8", lineHeight: 1.5 }}>
                    {strat.desc}
                  </Typography>

                  <Box sx={{ px: 1.25, py: 0.8, bgcolor: "rgba(59, 130, 246, 0.04)", borderLeft: "2px solid #3b82f6", borderRadius: "0 4px 4px 0" }}>
                    <Typography variant="caption" sx={{ color: "#60a5fa", display: "block", lineHeight: 1.4 }}>
                      💡 <b>คำแนะนำเทรดเดอร์:</b> {strat.tip}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            ))}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ borderTop: "1px solid rgba(255,255,255,0.07)", px: 3, py: 1.5 }}>
          <Button variant="contained" size="small" onClick={() => setGuideOpen(false)} sx={{ bgcolor: "#3b82f6", "&:hover": { bgcolor: "#2563eb" } }}>
            เข้าใจแล้ว
          </Button>
        </DialogActions>
      </Dialog>

      {/* Strategy change dropdown — shown when onChangeStrategy is provided */}
      {onChangeStrategy && (
        <Menu
          anchorEl={menuAnchor}
          open={isMenuOpen}
          onClose={handleMenuClose}
          slotProps={{
            paper: {
              sx: {
                bgcolor: "#0d1321",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 2.5,
                color: "#e2e8f0",
                width: 460,
                maxWidth: "95vw",
                boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
                backgroundImage: "none",
                overflow: "hidden",
              },
            },
          }}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
        >
          {/* ── Header ───────────────────────────────────────────── */}
          <Box sx={{ px: 2.5, pt: 1.75, pb: 1.25, borderBottom: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(90deg,rgba(30,41,59,0.9) 0%,rgba(15,23,42,0.9) 100%)" }}>
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em" }}>
                เลือกกลยุทธ์การเทรด
              </Typography>
              {assetType && (
                <Chip label={assetType.toUpperCase()} size="small" sx={{ height: 18, fontSize: "0.60rem", fontWeight: 800, bgcolor: "rgba(99,102,241,0.12)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.28)" }} />
              )}
            </Stack>
          </Box>

          {/* ── Strategy cards ───────────────────────────────────── */}
          {(() => {
            const ACCENT: Record<string, string> = { crypto: "#818cf8", gold: "#fbbf24", stock: "#3b82f6", forex: "#22d3ee" };
            const accent = assetType ? (ACCENT[assetType] ?? "#64748b") : "#64748b";

            const filtered    = STRATEGIES.filter((s) => !assetType || (STRATEGY_GROUPS[s.name] ?? ["crypto","gold","stock","forex"]).includes(assetType));
            const shortNames  = assetType ? (SHORT_TERM[assetType] ?? []) : [];
            const longNames   = assetType ? (LONG_TERM[assetType]  ?? []) : [];
            const shortList   = filtered.filter((s) =>  shortNames.includes(s.name));
            const longList    = filtered.filter((s) =>  longNames.includes(s.name));
            const generalList = filtered.filter((s) => !shortNames.includes(s.name) && !longNames.includes(s.name));

            const SectionHeader = ({ icon, label }: { icon: string; label: string }) => (
              <Stack direction="row" sx={{ alignItems: "center", gap: 0.75, px: 2, pt: 1.25, pb: 0.5 }}>
                <Typography sx={{ fontSize: "0.65rem", lineHeight: 1 }}>{icon}</Typography>
                <Typography sx={{ fontSize: "0.60rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.10em", color: accent }}>
                  {label}
                </Typography>
                <Box sx={{ flex: 1, height: "1px", bgcolor: `${accent}28` }} />
              </Stack>
            );

            const renderCard = (s: typeof STRATEGIES[0]) => {
              const isActive   = strategy === s.name;
              const isStar     = assetType ? (FIVE_STAR[assetType] ?? []).includes(s.name) : false;
              return (
                <Box
                  key={s.name}
                  onClick={() => { handleMenuClose(); onChangeStrategy(s.name); }}
                  sx={{
                    display: "flex", alignItems: "stretch",
                    mx: 1.25, my: 0.35, borderRadius: 1.5, cursor: "pointer", overflow: "hidden",
                    bgcolor: isActive ? "rgba(59,130,246,0.09)" : "transparent",
                    border: isActive ? "1px solid rgba(59,130,246,0.28)" : "1px solid rgba(255,255,255,0.05)",
                    transition: "all 0.13s",
                    "&:hover": {
                      bgcolor: isActive ? "rgba(59,130,246,0.14)" : "rgba(255,255,255,0.04)",
                      border: isActive ? "1px solid rgba(59,130,246,0.40)" : "1px solid rgba(255,255,255,0.12)",
                    },
                  }}
                >
                  {/* accent bar */}
                  <Box sx={{ width: 3, flexShrink: 0, bgcolor: isActive ? "#3b82f6" : accent, opacity: isActive ? 1 : 0.55 }} />
                  {/* text */}
                  <Box sx={{ flex: 1, minWidth: 0, py: 0.9, px: 1.25 }}>
                    <Stack direction="row" sx={{ alignItems: "center", gap: 0.6, mb: 0.25 }}>
                      <Typography sx={{ fontSize: "0.82rem", fontWeight: isActive ? 800 : 600, color: isActive ? "#60a5fa" : "#e2e8f0", lineHeight: 1.2, flex: 1, minWidth: 0 }}>
                        {s.label}
                      </Typography>
                      {isStar && (
                        <Chip label="แนะนำ" size="small" sx={{ height: 16, fontSize: "0.56rem", fontWeight: 800, bgcolor: "rgba(251,191,36,0.13)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.30)", flexShrink: 0 }} />
                      )}
                      {isActive && <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#3b82f6", flexShrink: 0 }} />}
                    </Stack>
                    <Typography sx={{ fontSize: "0.69rem", color: isActive ? "#93c5fd" : "#64748b", lineHeight: 1.3 }}>
                      {s.desc}
                    </Typography>
                  </Box>
                  {/* TF + RR chips */}
                  <Stack direction="column" sx={{ alignItems: "flex-end", justifyContent: "center", gap: 0.4, pr: 1.25, py: 0.75, flexShrink: 0 }}>
                    <Chip label={s.tf} size="small" sx={{ height: 18, fontSize: "0.60rem", fontWeight: 700, bgcolor: "rgba(148,163,184,0.09)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.18)" }} />
                    <Chip label={s.rr} size="small" sx={{ height: 18, fontSize: "0.60rem", fontWeight: 700, bgcolor: isActive ? "rgba(59,130,246,0.14)" : "rgba(34,197,94,0.09)", color: isActive ? "#60a5fa" : "#4ade80", border: isActive ? "1px solid rgba(59,130,246,0.30)" : "1px solid rgba(34,197,94,0.20)" }} />
                  </Stack>
                </Box>
              );
            };

            return (
              <Box sx={{ py: 0.75 }}>
                {shortList.length > 0 && (
                  <>
                    <SectionHeader icon="⚡" label="Short-term · เทรดสั้น" />
                    {shortList.map(renderCard)}
                  </>
                )}
                {longList.length > 0 && (
                  <>
                    <SectionHeader icon="📈" label="Long-term · เทรดยาว" />
                    {longList.map(renderCard)}
                  </>
                )}
                {generalList.length > 0 && (
                  <>
                    {(shortList.length > 0 || longList.length > 0) && (
                      <Box sx={{ mx: 2, mt: 1, mb: 0.5, borderTop: "1px solid rgba(255,255,255,0.05)" }} />
                    )}
                    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.6, px: 2, pb: 0.5, pt: (shortList.length || longList.length) ? 0.25 : 0.75 }}>
                      {generalList.map((s) => {
                        const isActive = strategy === s.name;
                        return (
                          <Chip
                            key={s.name}
                            label={s.label}
                            size="small"
                            onClick={() => { handleMenuClose(); onChangeStrategy(s.name); }}
                            sx={{
                              height: 24, fontSize: "0.67rem", fontWeight: isActive ? 800 : 500, cursor: "pointer",
                              bgcolor: isActive ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.06)",
                              color: isActive ? "#60a5fa" : "#94a3b8",
                              border: isActive ? "1px solid rgba(59,130,246,0.40)" : "1px solid rgba(255,255,255,0.09)",
                              "&:hover": { bgcolor: isActive ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.11)" },
                            }}
                          />
                        );
                      })}
                    </Stack>
                  </>
                )}
              </Box>
            );
          })()}

          {/* ── Footer ───────────────────────────────────────────── */}
          <Box
            sx={{
              px: 2, py: 1.1,
              borderTop: "1px solid rgba(255,255,255,0.06)",
              display: "flex", alignItems: "center", gap: 0.75,
              cursor: "pointer", color: "#475569", transition: "color 0.15s",
              "&:hover": { color: "#94a3b8" },
            }}
            onClick={() => { handleMenuClose(); setGuideOpen(true); }}
          >
            <Info size={13} />
            <Typography sx={{ fontSize: "0.70rem", fontWeight: 600 }}>ดูคู่มือความเหมาะสมของกลยุทธ์</Typography>
          </Box>
        </Menu>
      )}
    </Box>
  );
}
