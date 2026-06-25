"use client";

import { useEffect, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { Bot, Clock, Settings, TrendingDown, TrendingUp, Wallet } from "lucide-react";

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
  onOpenSettings?: () => void;
};

const MONO = { fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums" } as const;

const strategyShort: Record<string, string> = {
  ema_macd_rsi: "EMA+MACD",
  trend: "Trend",
  mean_reversion: "MeanRev",
  breakout: "Breakout",
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
  onOpenSettings,
}: TopBarProps) {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => setTime(new Date(Date.now() + 7 * 3_600_000).toISOString().substring(11, 19));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const connColor = connected === null ? "#64748b" : connected ? "#10b981" : "#ef4444";
  const connLabel = connected === null ? "Connecting…" : connected ? `MT5 #${accountLogin}` : "Offline";
  const openPlColor = openPl > 0 ? "#10b981" : openPl < 0 ? "#ef4444" : "#64748b";
  const equityColor =
    equity !== undefined && balance !== undefined ? (equity >= balance ? "#10b981" : "#f97316") : "#cbd5e1";
  const fmtN = (v?: number) => (v !== undefined ? v.toFixed(2) : "—");

  const sep = (
    <Box sx={{ width: "1px", alignSelf: "stretch", my: 1, bgcolor: "rgba(255,255,255,0.08)", flexShrink: 0 }} />
  );

  const metricLabel = {
    fontSize: "0.58rem",
    color: "#64748b",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    lineHeight: 1.1,
  };

  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        bgcolor: "#0d1321",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
        display: "flex",
        alignItems: "center",
        height: 48,
        overflowX: "auto",
        overflowY: "hidden",
        "&::-webkit-scrollbar": { height: 0 },
      }}
    >
      {/* Page title */}
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", px: 2.5, flexShrink: 0 }}>
        <Box sx={{ color: "#3b82f6", display: "flex" }}>{pageIcon}</Box>
        <Typography sx={{ fontSize: "0.85rem", fontWeight: 700, color: "#f1f5f9", whiteSpace: "nowrap" }}>
          {pageTitle}
        </Typography>
      </Stack>

      {sep}

      {/* Connection */}
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", px: 2, flexShrink: 0 }}>
        <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: connColor, boxShadow: connected ? `0 0 5px ${connColor}` : "none", flexShrink: 0 }} />
        <Typography sx={{ fontSize: "0.72rem", fontWeight: 600, color: connected ? "#94a3b8" : "#ef4444", whiteSpace: "nowrap" }}>
          {connLabel}
        </Typography>
      </Stack>

      {sep}

      {/* Balance */}
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", px: 2, flexShrink: 0 }}>
        <Box sx={{ color: "#475569", display: "flex" }}><Wallet size={12} /></Box>
        <Box>
          <Typography sx={metricLabel}>Balance</Typography>
          <Typography sx={{ ...MONO, fontSize: "0.8rem", fontWeight: 700, color: "#cbd5e1", lineHeight: 1.2 }}>
            {balance !== undefined ? `${fmtN(balance)} ${currency}` : "—"}
          </Typography>
        </Box>
      </Stack>

      {sep}

      {/* Equity */}
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", px: 2, flexShrink: 0 }}>
        <Box>
          <Typography sx={metricLabel}>Equity</Typography>
          <Typography sx={{ ...MONO, fontSize: "0.8rem", fontWeight: 700, color: equityColor, lineHeight: 1.2 }}>
            {equity !== undefined ? `${fmtN(equity)} ${currency}` : "—"}
          </Typography>
        </Box>
      </Stack>

      {sep}

      {/* Open P/L */}
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", px: 2, flexShrink: 0 }}>
        <Box sx={{ color: openPlColor, display: "flex" }}>
          {openPl >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        </Box>
        <Box>
          <Typography sx={metricLabel}>Open P/L</Typography>
          <Typography sx={{ ...MONO, fontSize: "0.8rem", fontWeight: 700, color: openPlColor, lineHeight: 1.2 }}>
            {openPl >= 0 ? "+" : ""}{fmtN(openPl)}
          </Typography>
        </Box>
      </Stack>

      {/* Spacer */}
      <Box sx={{ flex: 1, minWidth: 16 }} />

      {/* Bot status */}
      {sep}
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", px: 2, flexShrink: 0 }}>
        <Bot size={13} color={botEnabled ? "#10b981" : "#475569"} />
        <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, color: botEnabled ? "#10b981" : "#64748b", whiteSpace: "nowrap" }}>
          {botEnabled ? "BOT ON" : "BOT OFF"}
        </Typography>
      </Stack>

      {sep}

      {/* Strategy */}
      <Stack direction="row" spacing={0.6} sx={{ alignItems: "center", px: 2, flexShrink: 0 }}>
        <Typography sx={{ fontSize: "0.6rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Strategy
        </Typography>
        <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: "#60a5fa", whiteSpace: "nowrap" }}>
          {strategyShort[strategy] ?? strategy}
        </Typography>
      </Stack>

      {sep}

      {/* Clock */}
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", px: 2, flexShrink: 0 }}>
        <Clock size={12} color="#475569" />
        <Typography sx={{ ...MONO, fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600 }}>{time}</Typography>
        <Typography sx={{ fontSize: "0.6rem", color: "#475569", fontWeight: 600 }}>TH</Typography>
      </Stack>

      {/* Settings button — per-page */}
      {onOpenSettings && (
        <>
          {sep}
          <Box
            onClick={onOpenSettings}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 48,
              height: "100%",
              flexShrink: 0,
              color: "#475569",
              cursor: "pointer",
              transition: "all 0.15s",
              "&:hover": { color: "#60a5fa", bgcolor: "rgba(59,130,246,0.06)" },
            }}
          >
            <Settings size={16} />
          </Box>
        </>
      )}
    </Box>
  );
}
