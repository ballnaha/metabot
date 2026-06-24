"use client";

import { createTheme } from "@mui/material/styles";

/** Professional dark trading theme. */
const theme = createTheme({
  palette: {
    mode: "dark",
    background: { default: "#07090e", paper: "#0f141c" },
    primary: { main: "#3b82f6" },
    secondary: { main: "#6366f1" },
    success: { main: "#16c784" },
    error: { main: "#ea3943" },
    warning: { main: "#f0a020" },
    text: { primary: "#f1f5f9", secondary: "#94a3b8" },
    divider: "rgba(148, 163, 184, 0.08)",
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: "Sarabun, ui-sans-serif, system-ui, -apple-system, sans-serif",
    h6: { fontWeight: 800, letterSpacing: 0 },
    button: { textTransform: "none", fontWeight: 600, borderRadius: 10 },
    overline: { letterSpacing: 0, fontWeight: 700 },
  },
  components: {
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: "linear-gradient(180deg, #111827, #0f172a)",
          border: "1px solid rgba(148, 163, 184, 0.08)",
          boxShadow: "0 4px 20px -2px rgba(0, 0, 0, 0.4)",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          "&:hover": {
            borderColor: "rgba(59, 130, 246, 0.15)",
            boxShadow: "0 8px 30px -4px rgba(0, 0, 0, 0.5), 0 0 15px rgba(59, 130, 246, 0.03)",
          },
        },
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "rgba(7,9,14,0.75)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(148, 163, 184, 0.08)",
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 10,
          transition: "all 0.2s ease-in-out",
          "&:hover": {
            transform: "translateY(-1px)",
          },
          "&:active": {
            transform: "translateY(0)",
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: "rgba(255, 255, 255, 0.02)",
          transition: "all 0.2s ease-in-out",
          "& fieldset": {
            borderColor: "rgba(148, 163, 184, 0.12)",
          },
          "&:hover fieldset": {
            borderColor: "rgba(59, 130, 246, 0.3)",
          },
          "&.Mui-focused fieldset": {
            borderColor: "#3b82f6",
          },
        },
      },
    },
  },
});

export default theme;
