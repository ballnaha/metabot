"use client";

import { useEffect, useState } from "react";
import { Box, Divider, Stack, Tooltip, TooltipProps, tooltipClasses, Typography, styled, Menu, MenuItem, ListItemIcon } from "@mui/material";
import {
  Award,
  Coins,
  Globe,
  Hexagon,
  RefreshCw,
  ScrollText,
  Settings,
  TrendingUp,
  Menu as MenuIcon,
  BarChart2,
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
  { label: "ทอง",      icon: <Award size={18} />,       path: "/gold" },
  { label: "Forex",    icon: <BarChart2 size={18} />,   path: "/forex" },
  { label: "คริปโต",   icon: <Coins size={18} />,      path: "/crypto" },
  { label: "หุ้น",     icon: <Globe size={18} />,       path: "/stocks" },
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
          width: { xs: 36, md: 40 },
          height: { xs: 36, md: 40 },
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

  const [mobileMenuAnchor, setMobileMenuAnchor] = useState<null | HTMLElement>(null);
  const isMobileMenuOpen = Boolean(mobileMenuAnchor);

  const connDot   = connected === null ? "#64748b" : connected ? "#10b981" : "#ef4444";
  const connLabel = connected === null ? "กำลังเชื่อมต่อ" : connected ? "MT5 Online" : "MT5 ออฟไลน์";

  const isMenuTabActive = pathname === "/settings" || isMobileMenuOpen;

  return (
    <>
      {/* DESKTOP SIDEBAR - Renders on md (900px) and up */}
      <Box
        sx={{
          display: { xs: "none", md: "flex" },
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          width: SIDEBAR_W,
          bgcolor: "#080d18",
          borderRight: "1px solid rgba(255,255,255,0.04)",
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

        {/* Settings — bottom nav */}
        <SideBtn
          icon={<Settings size={18} />}
          label="ตั้งค่า"
          active={pathname === "/settings"}
          onClick={() => router.push("/settings")}
        />

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

      {/* MOBILE BOTTOM NAVBAR - Renders on mobile (xs to md) */}
      <Box
        sx={{
          display: { xs: "flex", md: "none" },
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: 64,
          bgcolor: "rgba(8, 13, 24, 0.85)",
          backdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.4)",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-around",
          px: 1,
          zIndex: 1200,
        }}
      >
        {/* Navigation Tabs */}
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.path;
          return (
            <Box
              key={item.path}
              onClick={() => router.push(item.path)}
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                cursor: "pointer",
                position: "relative",
                color: active ? "#60a5fa" : "#64748b",
                transition: "color 0.15s ease",
                "&:active": {
                  opacity: 0.7,
                }
              }}
            >
              {item.icon}
              <Typography sx={{ fontSize: "0.58rem", fontWeight: 700, mt: 0.5, letterSpacing: "0.02em" }}>
                {item.label}
              </Typography>
              {active && (
                <Box
                  sx={{
                    position: "absolute",
                    bottom: 4,
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    bgcolor: "#60a5fa",
                    boxShadow: "0 0 6px #60a5fa",
                  }}
                />
              )}
            </Box>
          );
        })}

        {/* 5th Tab - Quick Actions Menu */}
        <Box
          onClick={(e) => setMobileMenuAnchor(e.currentTarget)}
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            cursor: "pointer",
            position: "relative",
            color: isMenuTabActive ? "#60a5fa" : "#64748b",
            transition: "color 0.15s ease",
            "&:active": {
              opacity: 0.7,
            }
          }}
        >
          <MenuIcon size={20} />
          <Typography sx={{ fontSize: "0.58rem", fontWeight: 700, mt: 0.5, letterSpacing: "0.02em" }}>
            เมนู
          </Typography>
          {isMenuTabActive && (
            <Box
              sx={{
                position: "absolute",
                bottom: 4,
                width: 4,
                height: 4,
                borderRadius: "50%",
                bgcolor: "#60a5fa",
                boxShadow: "0 0 6px #60a5fa",
              }}
            />
          )}
        </Box>
      </Box>

      {/* Mobile Drawer Menu */}
      <Menu
        anchorEl={mobileMenuAnchor}
        open={isMobileMenuOpen}
        onClose={() => setMobileMenuAnchor(null)}
        slotProps={{
          paper: {
            sx: {
              bgcolor: "#0f172a",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 2,
              color: "#e2e8f0",
              minWidth: 200,
              boxShadow: "0 -10px 25px rgba(0,0,0,0.5)",
              mb: 1.5,
              "& .MuiMenuItem-root": {
                fontSize: "0.8rem",
                py: 1.25,
                px: 2,
                "&:hover": {
                  bgcolor: "rgba(255,255,255,0.04)",
                },
                "&.Mui-selected": {
                  bgcolor: "rgba(59,130,246,0.15)",
                  color: "#60a5fa",
                  fontWeight: 700,
                  "&:hover": {
                    bgcolor: "rgba(59,130,246,0.2)",
                  }
                }
              }
            }
          }
        }}
        anchorOrigin={{
          vertical: "top",
          horizontal: "center",
        }}
        transformOrigin={{
          vertical: "bottom",
          horizontal: "center",
        }}
      >
        <Box sx={{ px: 2, py: 1, borderBottom: "1px solid rgba(255,255,255,0.06)", mb: 0.5 }}>
          <Typography sx={{ fontSize: "0.62rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            ระบบบอทอัตโนมัติ
          </Typography>
        </Box>
        
        <MenuItem
          onClick={() => {
            setMobileMenuAnchor(null);
            router.push("/settings");
          }}
          selected={pathname === "/settings"}
        >
          <ListItemIcon sx={{ color: "#94a3b8", minWidth: "28px !important" }}>
            <Settings size={16} />
          </ListItemIcon>
          ตั้งค่าระบบหลัก (Settings)
        </MenuItem>

        <MenuItem
          onClick={() => {
            setMobileMenuAnchor(null);
            onOpenLog();
          }}
        >
          <ListItemIcon sx={{ color: "#f59e0b", minWidth: "28px !important" }}>
            <ScrollText size={16} />
          </ListItemIcon>
          ประวัติกิจกรรมบอท (Log)
        </MenuItem>

        <MenuItem
          onClick={() => {
            setMobileMenuAnchor(null);
            onSync();
          }}
        >
          <ListItemIcon sx={{ color: "#10b981", minWidth: "28px !important" }}>
            <RefreshCw size={16} />
          </ListItemIcon>
          ซิงก์พอร์ตบอท (Sync)
        </MenuItem>
      </Menu>
    </>
  );
}
