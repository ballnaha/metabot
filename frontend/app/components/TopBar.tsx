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
        alignItems: "stretch",
        height: 54,
        overflowX: "auto",
        overflowY: "hidden",
        "&::-webkit-scrollbar": { height: 0 },
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

      {vSep}

      {/* Strategy badge — hidden until loaded */}
      {strategy && (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", px: 2, flexShrink: 0 }}>
          <Typography sx={{ fontSize: "0.58rem", color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>
            Strategy
          </Typography>
          <Box sx={{ px: 0.8, py: 0.25, bgcolor: "rgba(59,130,246,0.1)", borderRadius: 0.75, border: "1px solid rgba(59,130,246,0.22)" }}>
            <Typography sx={{ fontSize: "0.7rem", fontWeight: 800, color: "#60a5fa", whiteSpace: "nowrap", letterSpacing: "0.02em" }}>
              {strategyShort[strategy] ?? strategy}
            </Typography>
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
  );
}
