"use client";

import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import { Award, Coins, Globe, Hexagon, RefreshCw, Settings as SettingsIcon, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";

type CryptoHeaderProps = {
  accountLogin?: number;
  connected: boolean | null;
  currency: string;
  equity?: number;
  onOpenBotSettings: () => void;
  onSync: () => void;
};

const fmt = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined ? "—" : Number(n).toFixed(d);

const MONO = { fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums" };

export default function CryptoHeader({
  accountLogin,
  connected,
  currency,
  equity,
  onOpenBotSettings,
  onSync,
}: CryptoHeaderProps) {
  const router = useRouter();

  const navItems = [
    { label: "แดชบอร์ด", icon: <TrendingUp size={16} />, path: "/?tab=dashboard", active: false },
    { label: "คริปโต", icon: <Coins size={16} />, path: "/crypto", active: true },
    { label: "ทอง", icon: <Award size={16} />, path: "/?tab=metals", active: false },
    { label: "หุ้น", icon: <Globe size={16} />, path: "/?tab=stocks", active: false },
    { label: "ตั้งค่า", icon: <SettingsIcon size={16} />, path: "/?tab=settings", active: false },
  ];

  return (
    <Box
      sx={{
        mb: 4,
        p: 2,
        borderRadius: 3,
        bgcolor: "rgba(13, 19, 33, 0.88)",
        border: "1px solid rgba(148, 163, 184, 0.08)",
      }}
    >
      <Stack
        direction={{ xs: "column", lg: "row" }}
        spacing={2}
        sx={{
          alignItems: { xs: "stretch", lg: "center" },
          justifyContent: "space-between",
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 260 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              display: "grid",
              placeItems: "center",
              background: "linear-gradient(135deg,#3b82f6,#6366f1)",
              boxShadow: "0 4px 14px rgba(59, 130, 246, 0.25)",
              flex: "0 0 auto",
            }}
          >
            <Hexagon size={22} fill="#fff" color="#fff" />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ color: "#fff", lineHeight: 1.1, fontWeight: 650 }}>
              Terminal Crypto
            </Typography>
            <Typography variant="body2" color="text.secondary">
              MetaBot · วิเคราะห์และเทรดอัตโนมัติบน MT5
            </Typography>
          </Box>
        </Stack>

        <Stack
          direction="row"
          spacing={0.75}
          sx={{
            alignItems: "center",
            overflowX: "auto",
            py: 0.25,
            "&::-webkit-scrollbar": { height: 4 },
            "&::-webkit-scrollbar-thumb": { bgcolor: "rgba(148,163,184,0.24)", borderRadius: 8 },
          }}
        >
          {navItems.map((item) => (
            <Button
              key={item.path}
              variant={item.active ? "contained" : "text"}
              size="small"
              onClick={() => router.push(item.path)}
              startIcon={item.icon}
              sx={{
                height: 36,
                px: 1.5,
                borderRadius: 2,
                flex: "0 0 auto",
                color: item.active ? "#fff" : "#94a3b8",
                bgcolor: item.active ? "rgba(59, 130, 246, 0.9)" : "transparent",
                "&:hover": {
                  bgcolor: item.active ? "#2563eb" : "rgba(255,255,255,0.05)",
                  color: "#fff",
                },
              }}
            >
              {item.label}
            </Button>
          ))}
        </Stack>

        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", justifyContent: { xs: "space-between", lg: "flex-end" }, flexWrap: "wrap" }}
        >
          <Chip
            variant="outlined"
            label={connected === null ? "กำลังเชื่อมต่อ" : connected ? `MT5 #${accountLogin}` : "MT5 ออฟไลน์"}
            sx={{
              height: 34,
              color: connected ? "#86efac" : connected === null ? "#cbd5e1" : "#fca5a5",
              borderColor: connected ? "rgba(16,185,129,0.28)" : connected === null ? "rgba(148,163,184,0.2)" : "rgba(239,68,68,0.28)",
              bgcolor: connected ? "rgba(16,185,129,0.06)" : "rgba(255,255,255,0.02)",
            }}
          />
          {equity !== undefined && (
            <Chip
              variant="outlined"
              label={`ทุนสุทธิ ${fmt(equity)} ${currency}`}
              sx={{
                height: 34,
                color: "#bfdbfe",
                borderColor: "rgba(59,130,246,0.24)",
                bgcolor: "rgba(59,130,246,0.05)",
                "& .MuiChip-label": { ...MONO },
              }}
            />
          )}
          <Button
            variant="outlined"
            color="inherit"
            startIcon={<SettingsIcon size={16} />}
            onClick={onOpenBotSettings}
            sx={{
              height: 36,
              px: 2,
              borderRadius: 2,
              borderColor: "rgba(59,130,246,0.22)",
              color: "#bfdbfe",
              bgcolor: "rgba(59,130,246,0.06)",
              "&:hover": { borderColor: "rgba(59,130,246,0.42)", bgcolor: "rgba(59,130,246,0.12)" },
            }}
          >
            ตั้งค่าบอท
          </Button>
          <Button
            variant="outlined"
            color="inherit"
            startIcon={<RefreshCw size={16} />}
            onClick={onSync}
            sx={{
              height: 36,
              px: 2,
              borderRadius: 2,
              borderColor: "rgba(255,255,255,0.08)",
              "&:hover": { borderColor: "rgba(255,255,255,0.2)" },
            }}
          >
            ซิงก์ข้อมูล
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
