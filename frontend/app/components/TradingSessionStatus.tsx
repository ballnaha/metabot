"use client";

import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import { Clock3 } from "lucide-react";

type Market = "crypto" | "gold" | "stock" | "forex";

const SESSION_BY_STRATEGY: Record<string, { start: number; end: number; label: string }> = {
  forex_intraday: { start: 13, end: 24, label: "13:00–24:00" },
  gold_intraday: { start: 14, end: 23, label: "14:00–23:00" },
  stock_intraday: { start: 20, end: 4, label: "20:00–04:00" },
};

const STOCK_MARKET_SESSION = { start: 20, end: 4, label: "20:00–04:00" };

function bangkokHour(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Number(parts.find((part) => part.type === "hour")?.value ?? 0);
}

export default function TradingSessionStatus({ market, strategy }: { market: Market; strategy?: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const strategySession = strategy ? SESSION_BY_STRATEGY[strategy] : undefined;
  const session = strategySession ?? (market === "stock" ? STOCK_MARKET_SESSION : undefined);
  const hour = bangkokHour(now);
  const isOpen = session
    ? session.start < session.end
      ? hour >= session.start && hour < session.end
      : hour >= session.start || hour < session.end
    : true;
  const color = isOpen ? "#10b981" : "#f59e0b";
  const background = isOpen ? "rgba(16,185,129,0.08)" : "rgba(245,158,11,0.08)";
  const border = isOpen ? "rgba(16,185,129,0.18)" : "rgba(245,158,11,0.22)";

  let text: string;
  if (market === "stock" && !strategySession) {
    text = isOpen
      ? `ตลาดหุ้นอยู่ในช่วงซื้อขาย ${session!.label} เวลาไทย`
      : `ตลาดหุ้นอยู่นอกช่วง ${session!.label} เวลาไทย`;
  } else if (session) {
    text = isOpen
      ? `อยู่ในช่วงเทรด ${session.label} เวลาไทย`
      : `นอกช่วงเทรด ${session.label} เวลาไทย — HOLD ตามเวลา`;
  } else if (market === "crypto") {
    text = "เทรดได้ 24 ชั่วโมง — HOLD คือเงื่อนไขยังไม่ครบ";
  } else {
    text = "Strategy ไม่กรองเวลา — HOLD คือเงื่อนไขยังไม่ครบ";
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.6, px: 1.25, py: 0.5, borderRadius: 99, bgcolor: background, border: `1px solid ${border}` }}>
      <Clock3 size={12} color={color} />
      <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, color, whiteSpace: { xs: "normal", sm: "nowrap" } }}>
        {text}
      </Typography>
    </Box>
  );
}
