"use client";

import React, { useMemo } from "react";
import { Box, Stack, Typography } from "@mui/material";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  DotProps,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Deal = {
  ticket: number;
  time: string;
  symbol: string;
  type: string;
  entry: string;
  profit: number;
  commission: number;
  swap: number;
};

type ChartPoint = {
  label: string;
  cumPnL: number;
  tradePnL: number;
  symbol: string;
  type: string;
  time: string;
};

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box sx={{ textAlign: "center" }}>
      <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", fontWeight: 600, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ color: color ?? "#e2e8f0", fontWeight: 700, fontFamily: "ui-monospace, monospace", fontSize: "0.95rem" }}>
        {value}
      </Typography>
    </Box>
  );
}

const CustomDot = (props: DotProps & { payload?: ChartPoint }) => {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !payload) return null;
  const isWin = payload.tradePnL >= 0;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3}
      fill={isWin ? "#10b981" : "#ef4444"}
      stroke={isWin ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}
      strokeWidth={3}
    />
  );
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d: ChartPoint = payload[0].payload;
  const isWin = d.tradePnL >= 0;
  return (
    <Box
      sx={{
        bgcolor: "#0a0f1e",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 1.5,
        px: 1.75,
        py: 1.25,
        minWidth: 170,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      }}
    >
      <Typography variant="caption" sx={{ color: "#64748b", display: "block", mb: 0.5, fontSize: "0.7rem", fontFamily: "monospace" }}>
        {d.time}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 700, color: "#fff", mb: 0.75 }}>
        {d.symbol}{" "}
        <span style={{ color: d.type === "BUY" ? "#3b82f6" : "#f97316", fontSize: "0.75rem", fontWeight: 600 }}>
          {d.type}
        </span>
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
        <Box>
          <Typography variant="caption" sx={{ color: "#94a3b8", fontSize: "0.68rem", display: "block" }}>Trade P&L</Typography>
          <Typography sx={{ fontWeight: 700, color: isWin ? "#10b981" : "#ef4444", fontFamily: "monospace", fontSize: "0.88rem" }}>
            {isWin ? "+" : ""}{d.tradePnL.toFixed(2)}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" sx={{ color: "#94a3b8", fontSize: "0.68rem", display: "block" }}>Cumulative</Typography>
          <Typography sx={{ fontWeight: 700, color: d.cumPnL >= 0 ? "#10b981" : "#ef4444", fontFamily: "monospace", fontSize: "0.88rem" }}>
            {d.cumPnL >= 0 ? "+" : ""}{d.cumPnL.toFixed(2)}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default function PnLChart({ deals }: { deals: Deal[] }) {
  const { points, stats } = useMemo(() => {
    const exits = deals
      .filter((d) => d.entry === "OUT")
      .slice()
      .sort((a, b) => a.time.localeCompare(b.time));

    let cum = 0;
    const pts: ChartPoint[] = exits.map((d) => {
      const net = d.profit + (d.commission ?? 0) + (d.swap ?? 0);
      cum = Math.round((cum + net) * 100) / 100;
      const t = d.time.replace("T", " ").substring(0, 16);
      return {
        label: t.substring(5),
        cumPnL: cum,
        tradePnL: Math.round(net * 100) / 100,
        symbol: d.symbol,
        type: d.type,
        time: t,
      };
    });

    const winCount = exits.filter((d) => d.profit > 0).length;
    const lossCount = exits.filter((d) => d.profit <= 0).length;
    const totalPnL = cum;
    const best = exits.length ? Math.max(...exits.map((d) => d.profit)) : 0;
    const worst = exits.length ? Math.min(...exits.map((d) => d.profit)) : 0;
    const winRate = exits.length ? (winCount / exits.length) * 100 : 0;

    return {
      points: pts,
      stats: { totalPnL, winCount, lossCount, winRate, best, worst },
    };
  }, [deals]);

  if (points.length === 0) return null;

  const isUp = stats.totalPnL >= 0;
  const lineColor = isUp ? "#10b981" : "#ef4444";

  return (
    <Box sx={{ mb: 3 }}>
      {/* Stats row */}
      <Stack
        direction="row"
        spacing={0}
        sx={{
          mb: 2,
          bgcolor: "rgba(255,255,255,0.015)",
          border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: 2,
          overflow: "hidden",
          "& > *": {
            flex: 1,
            py: 1.25,
            borderRight: "1px solid rgba(255,255,255,0.05)",
            "&:last-child": { borderRight: "none" },
          },
        }}
      >
        <Stat
          label="กำไร/ขาดทุนรวม"
          value={`${stats.totalPnL >= 0 ? "+" : ""}${stats.totalPnL.toFixed(2)}`}
          color={stats.totalPnL >= 0 ? "#10b981" : "#ef4444"}
        />
        <Stat label="Win Rate" value={`${stats.winRate.toFixed(0)}%`} color={stats.winRate >= 50 ? "#10b981" : "#f97316"} />
        <Stat label="Win / Loss" value={`${stats.winCount} / ${stats.lossCount}`} />
        <Stat label="Best Trade" value={`+${stats.best.toFixed(2)}`} color="#10b981" />
        <Stat label="Worst Trade" value={`${stats.worst.toFixed(2)}`} color="#ef4444" />
      </Stack>

      {/* Combo chart: bars (per-trade P&L) + area (cumulative equity curve) */}
      <Box sx={{ height: 200, userSelect: "none" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap="30%">
            <defs>
              <linearGradient id="cum-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={lineColor} stopOpacity={0.15} />
                <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />

            <XAxis
              dataKey="label"
              tick={{ fill: "#64748b", fontSize: 10, fontFamily: "ui-monospace, monospace" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />

            {/* Left axis: per-trade bars */}
            <YAxis
              yAxisId="bar"
              orientation="left"
              tick={{ fill: "#64748b", fontSize: 9, fontFamily: "ui-monospace, monospace" }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v) => (v >= 0 ? `+${v}` : `${v}`)}
            />

            {/* Right axis: cumulative line */}
            <YAxis
              yAxisId="cum"
              orientation="right"
              tick={{ fill: "#64748b", fontSize: 9, fontFamily: "ui-monospace, monospace" }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v) => (v >= 0 ? `+${v}` : `${v}`)}
            />

            <ReferenceLine yAxisId="bar" y={0} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 3" />

            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.02)" }} />

            {/* Per-trade P&L bars */}
            <Bar yAxisId="bar" dataKey="tradePnL" radius={[2, 2, 0, 0]} maxBarSize={18} isAnimationActive={false}>
              {points.map((p, i) => (
                <Cell
                  key={i}
                  fill={p.tradePnL >= 0 ? "rgba(16,185,129,0.55)" : "rgba(239,68,68,0.55)"}
                  stroke={p.tradePnL >= 0 ? "rgba(16,185,129,0.9)" : "rgba(239,68,68,0.9)"}
                  strokeWidth={1}
                />
              ))}
            </Bar>

            {/* Cumulative equity curve */}
            <Area
              yAxisId="cum"
              type="monotone"
              dataKey="cumPnL"
              stroke={lineColor}
              strokeWidth={2}
              fill="url(#cum-fill)"
              dot={<CustomDot />}
              activeDot={{ r: 5, fill: lineColor, stroke: "rgba(255,255,255,0.15)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Box>

      {/* Legend */}
      <Stack direction="row" spacing={2.5} sx={{ mt: 1, justifyContent: "flex-end" }}>
        <Stack direction="row" spacing={0.6} sx={{ alignItems: "center" }}>
          <Box sx={{ width: 10, height: 10, bgcolor: "rgba(16,185,129,0.55)", border: "1px solid #10b981", borderRadius: "2px" }} />
          <Typography variant="caption" sx={{ color: "#94a3b8", fontSize: "0.7rem" }}>Win trade</Typography>
        </Stack>
        <Stack direction="row" spacing={0.6} sx={{ alignItems: "center" }}>
          <Box sx={{ width: 10, height: 10, bgcolor: "rgba(239,68,68,0.55)", border: "1px solid #ef4444", borderRadius: "2px" }} />
          <Typography variant="caption" sx={{ color: "#94a3b8", fontSize: "0.7rem" }}>Loss trade</Typography>
        </Stack>
        <Stack direction="row" spacing={0.6} sx={{ alignItems: "center" }}>
          <Box sx={{ width: 22, height: 2, bgcolor: lineColor, borderRadius: 1 }} />
          <Typography variant="caption" sx={{ color: "#94a3b8", fontSize: "0.7rem" }}>Equity curve</Typography>
        </Stack>
      </Stack>
    </Box>
  );
}
