"use client";

import { useEffect, useState } from "react";
import { Box, Stack, Typography, Dialog, DialogTitle, DialogContent, DialogActions, Button, Chip, Divider, Menu, MenuItem, ListItemIcon, ListItemText, IconButton } from "@mui/material";
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
  crypto_early_stage: "CryptoEarly",
  crypto_regime: "CryptoRegime",
  stock_pullback: "StockPullback",
  supertrend_ema: "SuperTrend+EMA",
  ema_macd_rsi: "EMA+MACD",
  trend: "Trend",
  mean_reversion: "MeanRev",
  breakout: "Breakout",
};

const STRATEGIES: { name: string; label: string; desc: string }[] = [
  { name: "crypto_regime",      label: "Crypto Regime",      desc: "กรองสภาวะตลาด + Trend Pullback + Range Reversal" },
  { name: "crypto_early_stage", label: "Crypto Early Stage", desc: "หาเหรียญต้นน้ำ — BB Squeeze + Volume Spike" },
  { name: "stock_pullback",     label: "Stock Pullback",     desc: "ซื้อย่อตัวหุ้นขาขึ้น — EMA200 + RSI Pullback" },
  { name: "supertrend_ema",     label: "SuperTrend + EMA",   desc: "เทรนด์หลัก EMA200 + SuperTrend กลับตัว" },
  { name: "ema_macd_rsi",       label: "EMA + MACD + RSI",   desc: "แนวโน้ม + Momentum + RSI รวม 3 สัญญาณ" },
  { name: "trend",              label: "Trend Follow",        desc: "ตามทิศทาง EMA50 + MACD" },
  { name: "mean_reversion",     label: "Mean Reversion",      desc: "สวนกลับเข้าหาค่าเฉลี่ย BB + RSI" },
  { name: "breakout",           label: "Breakout",            desc: "ทะลุ Donchian 20 แท่ง + MACD" },
];

// 5-star strategies per asset type (from the strategy suitability guide)
const FIVE_STAR: Record<string, string[]> = {
  crypto: ["crypto_regime", "crypto_early_stage", "supertrend_ema", "breakout"],
  gold:   ["mean_reversion"],
  stock:  ["stock_pullback"],
  forex:  ["ema_macd_rsi"],
};

// Which strategies each asset type may use — mirrors the `groups` declared on
// each Strategy in backend/app/strategy.py. Strategies absent from a list are
// hidden for that asset type (e.g. crypto-only strategies on the forex page).
const STRATEGY_GROUPS: Record<string, string[]> = {
  crypto_regime:      ["crypto"],
  crypto_early_stage: ["crypto"],
  stock_pullback:     ["stock"],
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
              {
                name: "crypto_early_stage",
                label: "Crypto Early Stage (หาเหรียญต้นน้ำ - กลยุทธ์แนะนำ 5 ดาว คริปโต)",
                desc: "ตรวจจับความผันผวนบีบแคบ (Bollinger Band Squeeze) เพื่อหาช่วงพักฐาน และสแกนแรงซื้อผิดปกติ (Volume Spike >= 1.5x) เพื่อจับสัญญาณเหรียญที่พร้อมขึ้นเป็นแท่งแรกสุดก่อนใคร",
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
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 2,
                color: "#e2e8f0",
                minWidth: 320,
                maxWidth: 360,
                boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
                backgroundImage: "none",
              },
            },
          }}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
        >
          <Box sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <Typography sx={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              เลือกกลยุทธ์การเทรด
            </Typography>
          </Box>
          {STRATEGIES.filter(
            (s) => !assetType || (STRATEGY_GROUPS[s.name] ?? ["crypto", "gold", "stock", "forex"]).includes(assetType),
          ).map((s) => {
            const isActive = strategy === s.name;
            const isFiveStar = assetType ? (FIVE_STAR[assetType] ?? []).includes(s.name) : false;
            return (
              <MenuItem
                key={s.name}
                selected={isActive}
                onClick={() => { handleMenuClose(); onChangeStrategy(s.name); }}
                sx={{
                  py: 1.25,
                  px: 2,
                  mx: 0.5,
                  my: 0.25,
                  borderRadius: 1.5,
                  alignItems: "flex-start",
                  bgcolor: isActive ? "rgba(59,130,246,0.12)" : "transparent",
                  border: isActive ? "1px solid rgba(59,130,246,0.22)" : "1px solid transparent",
                  "&:hover": {
                    bgcolor: isActive ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.04)",
                  },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 0.3 }}>
                    {isActive && (
                      <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#3b82f6", flexShrink: 0 }} />
                    )}
                    <Typography sx={{
                      fontSize: "0.82rem",
                      fontWeight: isActive ? 800 : 650,
                      color: isActive ? "#60a5fa" : "#e2e8f0",
                      lineHeight: 1.2,
                    }}>
                      {s.label}
                    </Typography>
                    {isFiveStar && (
                      <Typography sx={{
                        fontSize: "0.68rem",
                        color: "#fbbf24",
                        lineHeight: 1,
                        letterSpacing: "0.05em",
                        flexShrink: 0,
                      }}>
                        ★★★★★
                      </Typography>
                    )}
                  </Stack>
                  <Typography sx={{
                    fontSize: "0.7rem",
                    color: isActive ? "#93c5fd" : "#64748b",
                    lineHeight: 1.4,
                    pl: isActive ? 1.75 : 0,
                  }}>
                    {s.desc}
                  </Typography>
                </Box>
              </MenuItem>
            );
          })}
          <Box
            sx={{
              px: 2, py: 1.25,
              borderTop: "1px solid rgba(255,255,255,0.06)",
              mt: 0.5,
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              cursor: "pointer",
              color: "#475569",
              transition: "color 0.15s",
              "&:hover": { color: "#94a3b8" },
            }}
            onClick={() => { handleMenuClose(); setGuideOpen(true); }}
          >
            <Info size={13} />
            <Typography sx={{ fontSize: "0.72rem", fontWeight: 600 }}>
              ดูคู่มือความเหมาะสมของกลยุทธ์
            </Typography>
          </Box>
        </Menu>
      )}
    </Box>
  );
}
