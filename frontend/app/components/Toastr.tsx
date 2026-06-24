"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { Box, Stack, Typography, IconButton } from "@mui/material";
import { X, CheckCircle2, AlertTriangle, AlertCircle, Info } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastrContextType {
  showToast: (message: string, type: ToastType, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

const ToastrContext = createContext<ToastrContextType | undefined>(undefined);

export function useToastr() {
  const context = useContext(ToastrContext);
  if (!context) {
    throw new Error("useToastr must be used within a ToastrProvider");
  }
  return context;
}

export function ToastrProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType, duration = 4000) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, message, type, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback((msg: string, dur?: number) => showToast(msg, "success", dur), [showToast]);
  const error = useCallback((msg: string, dur?: number) => showToast(msg, "error", dur), [showToast]);
  const warning = useCallback((msg: string, dur?: number) => showToast(msg, "warning", dur), [showToast]);
  const info = useCallback((msg: string, dur?: number) => showToast(msg, "info", dur), [showToast]);

  const contextValue = useMemo(() => ({ showToast, success, error, warning, info }), [showToast, success, error, warning, info]);

  return (
    <ToastrContext.Provider value={contextValue}>
      {children}
      {/* Toastr Container */}
      <Box
        sx={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          maxWidth: 400,
          width: "100%",
          pointerEvents: "none",
        }}
      >
        <Stack spacing={1.5} sx={{ width: "100%" }}>
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
          ))}
        </Stack>
      </Box>
    </ToastrContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const { message, type } = toast;

  const config = {
    success: {
      color: "#16c784",
      bg: "rgba(22, 199, 132, 0.08)",
      border: "rgba(22, 199, 132, 0.2)",
      icon: <CheckCircle2 size={20} color="#16c784" />,
    },
    error: {
      color: "#ea3943",
      bg: "rgba(234, 57, 67, 0.08)",
      border: "rgba(234, 57, 67, 0.2)",
      icon: <AlertCircle size={20} color="#ea3943" />,
    },
    warning: {
      color: "#f0a020",
      bg: "rgba(240, 160, 32, 0.08)",
      border: "rgba(240, 160, 32, 0.2)",
      icon: <AlertTriangle size={20} color="#f0a020" />,
    },
    info: {
      color: "#3b82f6",
      bg: "rgba(59, 130, 246, 0.08)",
      border: "rgba(59, 130, 246, 0.2)",
      icon: <Info size={20} color="#3b82f6" />,
    },
  }[type];

  return (
    <Box
      sx={{
        pointerEvents: "auto",
        display: "flex",
        alignItems: "center",
        gap: 2,
        p: 2,
        borderRadius: 0.5,
        bgcolor: "rgba(15, 20, 28, 0.85)",
        backdropFilter: "blur(12px)",
        border: "1px solid",
        borderColor: config.border,
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)",
        position: "relative",
        overflow: "hidden",
        animation: "slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "@keyframes slideIn": {
          "0%": {
            opacity: 0,
            transform: "translateY(20px) scale(0.95)",
          },
          "100%": {
            opacity: 1,
            transform: "translateY(0) scale(1)",
          },
        },
        "&::before": {
          content: '""',
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 5,
          bgcolor: config.color,
        },
      }}
    >
      <Box sx={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
        {config.icon}
      </Box>
      <Typography variant="body2" sx={{ flexGrow: 1, color: "text.primary", fontWeight: 600, pr: 1 }}>
        {message}
      </Typography>
      <IconButton size="small" onClick={onClose} sx={{ color: "text.secondary", "&:hover": { color: "text.primary" } }}>
        <X size={16} />
      </IconButton>
    </Box>
  );
}
