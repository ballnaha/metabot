"use client";

import React, { useEffect, useRef, useState } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Info,
  TrendingDown,
  XCircle,
  Zap,
} from "lucide-react";

type LogEntry = {
  id: number;
  time: string;
  level: "info" | "success" | "warning" | "error";
  event: string;
  message: string;
  detail: Record<string, any>;
};

type Filter = "all" | "trade" | "warning" | "error";

const LEVEL_COLOR: Record<string, string> = {
  success: "#10b981",
  info:    "#3b82f6",
  warning: "#f59e0b",
  error:   "#ef4444",
};

const LEVEL_BG: Record<string, string> = {
  success: "rgba(16,185,129,0.06)",
  info:    "rgba(59,130,246,0.04)",
  warning: "rgba(245,158,11,0.06)",
  error:   "rgba(239,68,68,0.06)",
};

function EventIcon({ event, level }: { event: string; level: string }) {
  const color = LEVEL_COLOR[level] ?? "#64748b";
  const size = 13;
  if (event === "trade")        return <Zap size={size} color={color} />;
  if (event === "closed")       return level === "success" ? <ArrowUpRight size={size} color={color} /> : <ArrowDownRight size={size} color={color} />;
  if (event === "signal")       return <Info size={size} color={color} />;
  if (event === "equity_alert") return <TrendingDown size={size} color={color} />;
  if (event === "unavailable")  return <XCircle size={size} color={color} />;
  if (event === "scan_error")   return <XCircle size={size} color={color} />;
  if (event === "daily_summary") return <CheckCircle2 size={size} color={color} />;
  if (level === "error")        return <XCircle size={size} color={color} />;
  if (level === "warning")      return <AlertTriangle size={size} color={color} />;
  return <Info size={size} color={color} />;
}

function LogRow({ entry }: { entry: LogEntry }) {
  const color = LEVEL_COLOR[entry.level] ?? "#64748b";
  const isTrade = entry.event === "trade";
  const isClosed = entry.event === "closed";
  const timeStr = entry.time.replace("T", " ").substring(5, 16);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 1.25,
        px: 1.5,
        py: 0.9,
        borderBottom: "1px solid rgba(255,255,255,0.025)",
        bgcolor: isTrade || isClosed ? LEVEL_BG[entry.level] : "transparent",
        transition: "background 0.15s",
        "&:hover": { bgcolor: "rgba(255,255,255,0.025)" },
        "&:last-child": { borderBottom: "none" },
      }}
    >
      {/* Icon */}
      <Box sx={{ mt: 0.15, flexShrink: 0 }}>
        <EventIcon event={entry.event} level={entry.level} />
      </Box>

      {/* Time */}
      <Typography
        sx={{
          fontFamily: "monospace",
          fontSize: "0.7rem",
          color: "#475569",
          flexShrink: 0,
          mt: 0.1,
          minWidth: 72,
        }}
      >
        {timeStr}
      </Typography>

      {/* Message */}
      <Typography
        sx={{
          fontSize: "0.78rem",
          color: isTrade || isClosed ? color : "#94a3b8",

          fontWeight: isTrade || isClosed ? 600 : 400,
          lineHeight: 1.45,
          flex: 1,
          wordBreak: "break-word",
        }}
      >
        {entry.message}
      </Typography>

      {/* Detail badges (trade only) */}
      {isTrade && entry.detail?.status && (
        <Box sx={{ flexShrink: 0 }}>
          <Chip
            size="small"
            label={entry.detail.status === "executed" ? "✓ executed" : "✗ failed"}
            sx={{
              height: 16,
              fontSize: "0.62rem",
              fontWeight: 700,
              bgcolor: entry.detail.status === "executed"
                ? "rgba(16,185,129,0.12)"
                : "rgba(239,68,68,0.12)",
              color: entry.detail.status === "executed" ? "#10b981" : "#ef4444",
              border: "none",
            }}
          />
        </Box>
      )}
    </Box>
  );
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all",     label: "ทั้งหมด" },
  { key: "trade",   label: "Trade" },
  { key: "warning", label: "Warning" },
  { key: "error",   label: "Error" },
];

export default function BotLog({ fetchLogs }: { fetchLogs: () => Promise<LogEntry[]> }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const data = await fetchLogs();
        if (active) setLogs(data);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => { active = false; clearInterval(id); };
  }, [fetchLogs]);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, autoScroll]);

  const filtered = filter === "all"
    ? logs
    : filter === "trade"
    ? logs.filter((l) => l.event === "trade" || l.event === "closed")
    : logs.filter((l) => l.level === filter);

  const counts = {
    trade:   logs.filter((l) => l.event === "trade" || l.event === "closed").length,
    warning: logs.filter((l) => l.level === "warning").length,
    error:   logs.filter((l) => l.level === "error").length,
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Filter bar */}
      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          px: 1.5,
          py: 1,
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          flexShrink: 0,
          flexWrap: "wrap",
          gap: 0.5,
        }}
      >
        {FILTERS.map(({ key, label }) => {
          const count = key === "all" ? logs.length : counts[key as keyof typeof counts] ?? 0;
          const active = filter === key;
          return (
            <Box
              key={key}
              onClick={() => setFilter(key)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                px: 1,
                py: 0.3,
                borderRadius: 1,
                cursor: "pointer",
                bgcolor: active ? "rgba(59,130,246,0.12)" : "transparent",
                border: active ? "1px solid rgba(59,130,246,0.3)" : "1px solid transparent",
                transition: "all 0.15s",
                "&:hover": { bgcolor: "rgba(255,255,255,0.04)" },
              }}
            >
              <Typography sx={{ fontSize: "0.72rem", fontWeight: 600, color: active ? "#60a5fa" : "#64748b" }}>
                {label}
              </Typography>
              {count > 0 && (
                <Box
                  sx={{
                    minWidth: 16,
                    height: 14,
                    px: 0.4,
                    bgcolor: active ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)",
                    borderRadius: 0.5,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Typography sx={{ fontSize: "0.62rem", fontWeight: 700, color: active ? "#93c5fd" : "#64748b" }}>
                    {count}
                  </Typography>
                </Box>
              )}
            </Box>
          );
        })}

        <Box sx={{ flex: 1 }} />

        {/* Auto-scroll toggle */}
        <Box
          onClick={() => setAutoScroll((v) => !v)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: 1,
            py: 0.3,
            borderRadius: 1,
            cursor: "pointer",
            border: "1px solid transparent",
            "&:hover": { bgcolor: "rgba(255,255,255,0.04)" },
          }}
        >
          <Box
            sx={{
              width: 6, height: 6, borderRadius: "50%",
              bgcolor: autoScroll ? "#10b981" : "#475569",
              boxShadow: autoScroll ? "0 0 4px #10b981" : "none",
              transition: "all 0.2s",
            }}
          />
          <Typography sx={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 600 }}>
            auto-scroll
          </Typography>
        </Box>
      </Stack>

      {/* Log entries */}
      <Box
        ref={containerRef}
        onScroll={() => {
          const el = containerRef.current;
          if (!el) return;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          setAutoScroll(atBottom);
        }}
        sx={{
          flex: 1,
          overflowY: "auto",
          fontFamily: "monospace",
          "&::-webkit-scrollbar": { width: 4 },
          "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
          "&::-webkit-scrollbar-thumb": { bgcolor: "rgba(255,255,255,0.08)", borderRadius: 2 },
        }}
      >
        {filtered.length === 0 ? (
          <Box sx={{ py: 6, textAlign: "center" }}>
            <Typography sx={{ color: "#475569", fontSize: "0.8rem" }}>
              ยังไม่มี log — รอ bot scan รอบถัดไป
            </Typography>
          </Box>
        ) : (
          // newest first already from API — reverse to show oldest at top
          [...filtered].reverse().map((entry) => (
            <LogRow key={entry.id} entry={entry} />
          ))
        )}
        <div ref={bottomRef} />
      </Box>
    </Box>
  );
}
