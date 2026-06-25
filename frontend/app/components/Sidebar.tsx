"use client";

import { Box, Divider, Stack, Tooltip, TooltipProps, tooltipClasses, Typography, styled } from "@mui/material";
import {
  Award,
  Coins,
  Globe,
  Hexagon,
  RefreshCw,
  ScrollText,
  Settings,
  TrendingUp,
} from "lucide-react";
import { useRouter, usePathname } from "next/navigation";

const CustomTooltip = styled(({ className, ...props }: TooltipProps) => (
  <Tooltip {...props} classes={{ popper: className }} />
))(({ theme }) => ({
  [`& .${tooltipClasses.tooltip}`]: {
    backgroundColor: "#0f172a",
    color: "#f8fafc",
    fontSize: "0.78rem",
    fontWeight: 500,
    borderRadius: "6px",
    padding: "6px 10px",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.3)",
  },
  [`& .${tooltipClasses.arrow}`]: {
    color: "#0f172a",
  },
}));

export const SIDEBAR_W = 60;

type SidebarProps = {
  connected: boolean | null;
  equity?: number;
  currency: string;
  onOpenLog: () => void;
  onSync: () => void;
};

type NavItem = { label: string; icon: React.ReactNode; path: string };

const NAV_ITEMS: NavItem[] = [
  { label: "แดชบอร์ด", icon: <TrendingUp size={18} />, path: "/" },
  { label: "คริปโต",   icon: <Coins size={18} />,      path: "/crypto" },
  { label: "ทอง",      icon: <Award size={18} />,       path: "/gold" },
  { label: "หุ้น",     icon: <Globe size={18} />,       path: "/stocks" },
  { label: "ตั้งค่า",  icon: <Settings size={18} />,   path: "/settings" },
];

function SideBtn({
  icon,
  label,
  active,
  color,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  color?: string;
  onClick?: () => void;
}) {
  return (
    <CustomTooltip title={label} placement="right" arrow>
      <Box
        onClick={onClick}
        sx={{
          width: 40,
          height: 40,
          borderRadius: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          bgcolor: active ? "rgba(59,130,246,0.15)" : "transparent",
          color: active ? "#60a5fa" : color ?? "#475569",
          border: active ? "1px solid rgba(59,130,246,0.3)" : "1px solid transparent",
          transition: "all 0.15s",
          "&:hover": {
            bgcolor: active ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)",
            color: color ?? "#94a3b8",
            borderColor: "rgba(255,255,255,0.08)",
          },
        }}
      >
        {icon}
      </Box>
    </CustomTooltip>
  );
}

export default function Sidebar({
  connected,
  equity,
  currency,
  onOpenLog,
  onSync,
}: SidebarProps) {
  const router   = useRouter();
  const pathname = usePathname();

  const connDot   = connected === null ? "#64748b" : connected ? "#10b981" : "#ef4444";
  const connLabel = connected === null ? "กำลังเชื่อมต่อ" : connected ? "MT5 Online" : "MT5 ออฟไลน์";

  return (
    <Box
      sx={{
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        width: SIDEBAR_W,
        bgcolor: "#080d18",
        borderRight: "1px solid rgba(255,255,255,0.04)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        py: 1.5,
        zIndex: 1200,
      }}
    >
      {/* Logo */}
      <CustomTooltip title="MetaBot" placement="right" arrow>
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: 2,
            display: "grid",
            placeItems: "center",
            background: "linear-gradient(135deg,#3b82f6,#6366f1)",
            boxShadow: "0 4px 12px rgba(59,130,246,0.3)",
            mb: 1.5,
            cursor: "default",
          }}
        >
          <Hexagon size={20} fill="#fff" color="#fff" />
        </Box>
      </CustomTooltip>

      <Divider sx={{ width: 32, borderColor: "rgba(255,255,255,0.05)", mb: 1.5 }} />

      {/* Nav */}
      <Stack spacing={0.5} sx={{ alignItems: "center" }}>
        {NAV_ITEMS.map((item) => (
          <SideBtn
            key={item.path}
            icon={item.icon}
            label={item.label}
            active={pathname === item.path}
            onClick={() => router.push(item.path)}
          />
        ))}
      </Stack>

      <Box sx={{ flex: 1 }} />

      {/* Actions */}
      <Stack spacing={0.5} sx={{ alignItems: "center" }}>
        <SideBtn icon={<ScrollText size={18} />} label="Bot Activity Log" color="#f59e0b" onClick={onOpenLog} />
        <SideBtn icon={<RefreshCw size={18} />}  label="ซิงก์ข้อมูล"       onClick={onSync} />
      </Stack>

      <Divider sx={{ width: 32, borderColor: "rgba(255,255,255,0.05)", mt: 1, mb: 1 }} />

      {/* Connection + Equity */}
      <CustomTooltip title={`${connLabel}${equity ? ` · ${equity.toFixed(0)} ${currency}` : ""}`} placement="right" arrow>
        <Stack sx={{ alignItems: "center", gap: 0.5, cursor: "default" }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: connDot,
              boxShadow: connected ? `0 0 6px ${connDot}` : "none",
              transition: "all 0.3s",
            }}
          />
          {equity !== undefined && (
            <Typography
              sx={{
                fontSize: "0.55rem",
                color: "#475569",
                fontFamily: "monospace",
                textAlign: "center",
                lineHeight: 1.3,
                maxWidth: 52,
                wordBreak: "break-all",
              }}
            >
              {Number(equity).toFixed(0)}
              <br />
              {currency}
            </Typography>
          )}
        </Stack>
      </CustomTooltip>
    </Box>
  );
}
