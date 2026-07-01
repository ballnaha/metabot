"use client";

import React, { useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
  FormControl,
  InputLabel,
  ListSubheader,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  BarChart2,
  BellOff,
  BellRing,
  Filter,
  Layers,
  RotateCcw,
  Save,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";

const FOREX_SHORT = ["forex_intraday"];
const FOREX_LONG  = ["forex_trend_pullback"];

const FOREX_DEFAULTS: Partial<ForexSettings> = {
  forex_timeframe: "H1",
  forex_strategy: "forex_trend_pullback",
  forex_atr_sl_mult: 1.5,
  forex_rr: 2.0,
  forex_risk_per_trade: 0.01,
  forex_max_lot: 2.0,
  max_forex_open_trades: 5,
  forex_use_ai: false,
  forex_bot_enabled: false,
  telegram_enabled: true,
};

type StrategyInfo = { name: string; description: string };

type ForexSettings = {
  forex_strategy: string;
  forex_auto_trade_interval: number;
  forex_risk_per_trade: number;
  forex_max_lot: number;
  forex_magic: number;
  forex_atr_sl_mult: number;
  forex_rr: number;
  max_forex_open_trades: number;
  forex_timeframe: string;
  forex_use_ai: boolean;
  forex_bot_enabled: boolean;
  telegram_enabled?: boolean;
};

type ForexBotSettingsProps = {
  open: boolean;
  onClose: () => void;
  settings: ForexSettings;
  patchSettings: (patch: Partial<ForexSettings>) => void;
  strategies: StrategyInfo[];
  strategyLabel: (name: string) => string;
  savingSettings: boolean;
  onSave: () => void;
  forexInput: string;
  setForexInput: (val: string) => void;
  onDetectForexSymbols: (filterType: string) => void;
  detectingForexSymbols: boolean;
  forexFilterType: string;
  setForexFilterType: (v: string) => void;
  allForexSymbols: string[];
  onValidateSymbols: () => void;
  validatingSymbols: boolean;
  scanMins: number;
  setScanMins: (v: number) => void;
};

function QuickNumberInput({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999999,
  precision = 0,
  helperText,
}: {
  label: string;
  value: number;
  onChange: (val: number) => void;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  helperText?: string;
}) {
  const valNum = value ?? min ?? 0;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, width: "100%" }}>
      <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 600, px: 0.5 }}>
        {label}
      </Typography>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          height: 40,
          bgcolor: "rgba(255,255,255,0.01)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 2,
          overflow: "hidden",
          transition: "all 0.2s",
          "&:focus-within": {
            borderColor: "#06b6d4",
            boxShadow: "0 0 0 1px rgba(6,182,212,0.2)",
          },
        }}
      >
        <Button
          onClick={() => onChange(Math.max(min, Number((valNum - step).toFixed(precision))))}
          disabled={valNum <= min}
          sx={{
            minWidth: 40, width: 40, height: "100%", borderRadius: 0,
            color: "#94a3b8", bgcolor: "transparent", fontSize: "1.2rem", fontWeight: 500,
            borderRight: "1px solid rgba(255,255,255,0.05)",
            "&:hover": { bgcolor: "rgba(255,255,255,0.03)", color: "#fff" },
            "&.Mui-disabled": { color: "rgba(255,255,255,0.05)" },
          }}
        >
          -
        </Button>
        <input
          type="text"
          value={valNum}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) onChange(Math.max(min, Math.min(max, Number(val.toFixed(precision)))));
            else if (e.target.value === "") onChange(min);
          }}
          style={{
            flexGrow: 1, width: "100%", height: "100%", border: "none", background: "transparent",
            color: "#fff", textAlign: "center", fontFamily: "ui-monospace, monospace",
            fontWeight: 600, fontSize: "1rem", outline: "none",
          }}
        />
        <Button
          onClick={() => onChange(Math.min(max, Number((valNum + step).toFixed(precision))))}
          disabled={valNum >= max}
          sx={{
            minWidth: 40, width: 40, height: "100%", borderRadius: 0,
            color: "#94a3b8", bgcolor: "transparent", fontSize: "1.2rem", fontWeight: 500,
            borderLeft: "1px solid rgba(255,255,255,0.05)",
            "&:hover": { bgcolor: "rgba(255,255,255,0.03)", color: "#fff" },
            "&.Mui-disabled": { color: "rgba(255,255,255,0.05)" },
          }}
        >
          +
        </Button>
      </Box>
      {helperText && (
        <Typography variant="caption" sx={{ color: "#64748b", px: 0.5, fontSize: "0.78rem" }}>
          {helperText}
        </Typography>
      )}
    </Box>
  );
}

export default function ForexBotSettings({
  open, onClose, settings, patchSettings, strategies, strategyLabel,
  savingSettings, onSave, forexInput, setForexInput,
  onDetectForexSymbols, detectingForexSymbols, allForexSymbols,
  onValidateSymbols, validatingSymbols,
  forexFilterType, setForexFilterType,
  scanMins, setScanMins,
}: ForexBotSettingsProps) {
  const TF_DEFAULTS: Record<string, number> = { M15: 3, M30: 5, H1: 15, H4: 30, D1: 60 };
  const [newSymbolInput, setNewSymbolInput] = useState("");

  const currentList = forexInput
    ? forexInput.split(",").map((x) => x.trim()).filter(Boolean)
    : [];

  const activeStrategy = strategies.find((s) => s.name === settings.forex_strategy);
  const patch = patchSettings;

  function addSymbol(raw: string) {
    const clean = raw.trim().toUpperCase();
    if (!clean) return;
    if (!currentList.some((x) => x.toUpperCase() === clean)) {
      setForexInput([...currentList, clean].join(", "));
    }
    setNewSymbolInput("");
  }

  function removeSymbol(sym: string) {
    setForexInput(currentList.filter((x) => x !== sym).join(", "));
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: { xs: "100vw", sm: 720, md: 800 },
            bgcolor: "#0d1321",
            color: "#e2e8f0",
            borderLeft: "1px solid rgba(6, 182, 212, 0.18)",
            backgroundImage: "none",
          },
        },
      }}
    >
      <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <Stack
          direction="row" spacing={1.5}
          sx={{ alignItems: "center", justifyContent: "space-between", px: 3, py: 2.25, borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
            <Box sx={{ p: 0.8, borderRadius: 2, bgcolor: "rgba(6,182,212,0.1)", display: "flex", color: "#06b6d4" }}>
              <SettingsIcon size={18} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ color: "#fff", fontWeight: 650, lineHeight: 1.15 }}>
                ตั้งค่า Forex Bot
              </Typography>
              <Typography variant="caption" color="text.secondary">
                กลยุทธ์ ขนาดไม้ และการยืนยันออเดอร์
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={0.75}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => patch(FOREX_DEFAULTS)}
              startIcon={<RotateCcw size={14} />}
              sx={{
                height: 34, fontSize: "0.72rem", fontWeight: 700, px: 1.5,
                borderColor: "rgba(6,182,212,0.3)", color: "#22d3ee",
                "&:hover": { borderColor: "#06b6d4", bgcolor: "rgba(6,182,212,0.08)" },
              }}
            >
              ค่า Default
            </Button>
            <Button
              variant="text" color="inherit" onClick={onClose}
              sx={{ minWidth: 38, width: 38, height: 38, p: 0, borderRadius: 2 }}
            >
              <X size={18} />
            </Button>
          </Stack>
        </Stack>

        {/* Body */}
        <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 3 }}>
          <Stack spacing={2.5}>

            {/* Forex Symbols */}
            <Box sx={{ p: 2, bgcolor: "rgba(6,182,212,0.03)", border: "1px solid rgba(6,182,212,0.1)", borderRadius: 1 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                  <Filter size={18} color="#06b6d4" />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 650, color: "#fff" }}>
                      คู่เงิน Forex ที่ต้องการเทรด
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      แนะนำให้กด สแกน Forex เพื่อดึงชื่อที่ถูกต้องจาก MT5 (เช่น EURUSD, GBPJPY)
                    </Typography>
                  </Box>
                </Stack>

                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Autocomplete
                    freeSolo
                    size="small"
                    options={allForexSymbols}
                    inputValue={newSymbolInput}
                    onInputChange={(_e, v) => setNewSymbolInput(v)}
                    onChange={(_e, v) => { if (typeof v === "string" && v) addSymbol(v); }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder="เช่น EURUSD, GBPJPY, AUDUSD"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSymbol(newSymbolInput); } }}
                        sx={{
                          "& .MuiInputBase-root": {
                            height: 40, bgcolor: "rgba(255,255,255,0.01)", color: "#fff", borderRadius: 1,
                            "& fieldset": { borderColor: "rgba(255,255,255,0.08)" },
                            "&:hover fieldset": { borderColor: "rgba(255,255,255,0.2) !important" },
                            "&.Mui-focused fieldset": { borderColor: "#06b6d4 !important" },
                          },
                          "& .MuiInputBase-input": { color: "#fff", fontSize: "0.9rem" },
                        }}
                      />
                    )}
                    slotProps={{
                      paper: {
                        sx: {
                          bgcolor: "#0d1321", border: "1px solid rgba(6,182,212,0.18)", color: "#e2e8f0",
                          "& .MuiAutocomplete-option": {
                            fontWeight: 700, fontSize: "0.9rem",
                            "&[aria-selected='true']": { bgcolor: "rgba(6,182,212,0.16)" },
                            "&.Mui-focused": { bgcolor: "rgba(255,255,255,0.04)" },
                          },
                        },
                      },
                    }}
                    sx={{ flexGrow: 1 }}
                  />
                  <Button
                    variant="contained" size="small"
                    onClick={() => addSymbol(newSymbolInput)}
                    sx={{ height: 40, fontWeight: 600, px: 2, minWidth: "fit-content", bgcolor: "#06b6d4", "&:hover": { bgcolor: "#0891b2" }, borderRadius: 1 }}
                  >
                    เพิ่ม
                  </Button>
                </Stack>

                <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 1 }}>
                  <FormControl size="small" sx={{ minWidth: 180, flexGrow: 1 }}>
                    <InputLabel id="forex-filter-type-label">ประเภทการสแกน</InputLabel>
                    <Select
                      labelId="forex-filter-type-label"
                      label="ประเภทการสแกน"
                      value={forexFilterType}
                      onChange={(e) => setForexFilterType(e.target.value)}
                      sx={{
                        height: 40,
                        bgcolor: "rgba(255,255,255,0.01)",
                        color: "#fff",
                        "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.08)" },
                        "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.2) !important" },
                        "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#06b6d4 !important" },
                      }}
                    >
                      <MenuItem value="major">Major Pairs (8 คู่หลัก)</MenuItem>
                      <MenuItem value="major_minor">Major + Minor Pairs</MenuItem>
                      <MenuItem value="all">ทั้งหมด</MenuItem>
                    </Select>
                  </FormControl>

                  <Button
                    variant="outlined" size="small"
                    onClick={() => onDetectForexSymbols(forexFilterType)} disabled={detectingForexSymbols}
                    sx={{
                      height: 40, borderColor: "rgba(6,182,212,0.25)", color: "#22d3ee",
                      fontWeight: 600, px: 2, minWidth: "fit-content",
                      bgcolor: "rgba(6,182,212,0.04)",
                      "&:hover": { borderColor: "#06b6d4", bgcolor: "rgba(6,182,212,0.08)" },
                      "&.Mui-disabled": { color: "rgba(255,255,255,0.2)" }, borderRadius: 1,
                    }}
                  >
                    {detectingForexSymbols ? <CircularProgress size={16} color="inherit" /> : "สแกน Forex"}
                  </Button>
                  <Button
                    variant="outlined" size="small"
                    onClick={onValidateSymbols} disabled={validatingSymbols}
                    sx={{
                      height: 40, borderColor: "rgba(234,179,8,0.25)", color: "#fbbf24",
                      fontWeight: 600, px: 2, minWidth: "fit-content",
                      bgcolor: "rgba(234,179,8,0.04)",
                      "&:hover": { borderColor: "#eab308", bgcolor: "rgba(234,179,8,0.08)" },
                      "&.Mui-disabled": { color: "rgba(255,255,255,0.2)" }, borderRadius: 1,
                    }}
                  >
                    {validatingSymbols ? <CircularProgress size={16} color="inherit" /> : "กรอง"}
                  </Button>
                  <Button
                    variant="outlined" size="small"
                    onClick={() => setForexInput("")}
                    disabled={!forexInput}
                    sx={{
                      height: 40, borderColor: "rgba(239,68,68,0.25)", color: "#f87171",
                      fontWeight: 600, px: 2, minWidth: "fit-content",
                      bgcolor: "rgba(239,68,68,0.04)",
                      "&:hover": { borderColor: "#ef4444", bgcolor: "rgba(239,68,68,0.08)" },
                      "&.Mui-disabled": { color: "rgba(255,255,255,0.1)", borderColor: "rgba(255,255,255,0.05)" }, borderRadius: 1,
                    }}
                  >
                    ล้างทั้งหมด
                  </Button>
                </Stack>

                {/* Chips */}
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, pt: 0.5 }}>
                  {currentList.length === 0 ? (
                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic", px: 0.5 }}>
                      ยังไม่มีคู่เงินในรายการสแกน
                    </Typography>
                  ) : currentList.map((sym) => (
                    <Chip
                      key={sym}
                      label={sym}
                      onDelete={() => removeSymbol(sym)}
                      size="small"
                      sx={{
                        bgcolor: "rgba(6,182,212,0.08)", color: "#fff",
                        border: "1px solid rgba(6,182,212,0.2)", fontWeight: 700, borderRadius: 1,
                        "& .MuiChip-deleteIcon": {
                          color: "rgba(255,255,255,0.4)", transition: "color 0.2s",
                          "&:hover": { color: "#ef4444" },
                        },
                      }}
                    />
                  ))}
                </Box>
              </Stack>
            </Box>

            {/* Timeframe + Interval */}
            <Box
              sx={{
                p: 2,
                bgcolor: "rgba(255,255,255,0.01)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 1,
              }}
            >
              <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", display: "block", mb: 1.5 }}>
                การตั้งค่าการสแกน
              </Typography>
              <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, width: "100%" }}>
                  <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 600, px: 0.5 }}>
                    Timeframe
                  </Typography>
                  <Select
                    size="small"
                    value={settings.forex_timeframe || "H4"}
                    onChange={(e) => {
                      patch({ forex_timeframe: e.target.value });
                      setScanMins(TF_DEFAULTS[e.target.value] ?? 30);
                    }}
                    sx={{
                      height: 40,
                      bgcolor: "rgba(255,255,255,0.01)",
                      color: "#fff",
                      borderRadius: 2,
                      "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.08)" },
                      "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.2) !important" },
                      "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#06b6d4 !important" },
                      "& .MuiSelect-select": { color: "#fff" },
                    }}
                  >
                    {[
                      { v: "M15", l: "M15 — 15 นาที" },
                      { v: "M30", l: "M30 — 30 นาที" },
                      { v: "H1", l: "H1 — 1 ชั่วโมง" },
                      { v: "H4", l: "H4 — 4 ชั่วโมง" },
                      { v: "D1", l: "D1 — รายวัน" },
                    ].map(({ v, l }) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
                  </Select>
                </Box>

                <QuickNumberInput
                  label="สแกน Signal ทุก (นาที)"
                  value={scanMins}
                  onChange={setScanMins}
                  step={1}
                  min={1}
                  max={120}
                  precision={0}
                  helperText={`default: ${TF_DEFAULTS[settings.forex_timeframe] ?? 30} นาที สำหรับ ${settings.forex_timeframe || "H4"}`}
                />
              </Box>
            </Box>

            {/* Max slots + Magic */}
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
              <QuickNumberInput
                label="ช่องคู่เงิน Forex สูงสุด"
                value={settings.max_forex_open_trades}
                onChange={(val) => patch({ max_forex_open_trades: val })}
                step={1} min={1} precision={0}
              />
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 600, px: 0.5 }}>
                  Forex Magic Number
                </Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <input
                    type="text"
                    value={settings.forex_magic ?? 0}
                    onChange={(e) => patch({ forex_magic: parseInt(e.target.value) || 0 })}
                    style={{
                      flexGrow: 1, height: 40, borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.01)",
                      color: "#fff", padding: "0 12px",
                      fontFamily: "ui-monospace, monospace",
                      fontWeight: 600, outline: "none", fontSize: "1rem",
                    }}
                  />
                  <Button
                    variant="outlined" size="small"
                    onClick={() => patch({ forex_magic: Math.floor(100000 + Math.random() * 900000) })}
                    sx={{
                      height: 40, borderColor: "rgba(255,255,255,0.08)", color: "#94a3b8",
                      fontWeight: 600, px: 1.5, minWidth: "fit-content",
                      "&:hover": { borderColor: "rgba(255,255,255,0.2)", color: "#fff" },
                    }}
                  >
                    สุ่มเลข
                  </Button>
                </Stack>
              </Box>
            </Box>

            {/* Risk + Max Lot */}
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
              <QuickNumberInput
                label="ความเสี่ยงต่อไม้ (%)"
                value={settings.forex_risk_per_trade}
                onChange={(val) => patch({ forex_risk_per_trade: val })}
                step={0.005} min={0.001} max={1} precision={3}
                helperText="0.01 = 1% ของ balance"
              />
              <QuickNumberInput
                label="Lot สูงสุดต่อออเดอร์"
                value={settings.forex_max_lot}
                onChange={(val) => patch({ forex_max_lot: val })}
                step={0.01} min={0.01} precision={2}
                helperText="Forex มักใช้ 0.01–1.0 lot"
              />
            </Box>

            {/* ATR + RR */}
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
              <QuickNumberInput
                label="ระยะตัดขาดทุน (ATR ×)"
                value={settings.forex_atr_sl_mult}
                onChange={(val) => patch({ forex_atr_sl_mult: val })}
                step={0.1} min={0.5} precision={1}
                helperText="Forex แนะนำ 1.5–3×"
              />
              <QuickNumberInput
                label="เป้ากำไร (R:R)"
                value={settings.forex_rr}
                onChange={(val) => patch({ forex_rr: val })}
                step={0.1} min={0.5} precision={1}
              />
            </Box>

            {/* Strategy */}
            <FormControl size="small" fullWidth>
              <InputLabel sx={{ color: "#94a3b8" }}>กลยุทธ์ที่ใช้</InputLabel>
              <Select
                label="กลยุทธ์ที่ใช้"
                value={settings.forex_strategy || ""}
                onChange={(e) => patch({ forex_strategy: e.target.value })}
                sx={{ bgcolor: "rgba(255,255,255,0.01)", "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.08)" } }}
              >
                {strategies.length === 0 && <MenuItem value="" disabled>กำลังโหลดกลยุทธ์...</MenuItem>}
                {(() => {
                  const subSx = { bgcolor: "transparent", color: "#22d3ee", fontSize: "0.60rem", fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.10em", pt: 1, pb: 0.25 };
                  const short_   = strategies.filter((s) => FOREX_SHORT.includes(s.name));
                  const long_    = strategies.filter((s) => FOREX_LONG.includes(s.name));
                  const general  = strategies.filter((s) => !FOREX_SHORT.includes(s.name) && !FOREX_LONG.includes(s.name));
                  return [
                    ...(short_.length > 0 ? [<ListSubheader key="hdr-short" sx={subSx}>⚡ เทรดสั้น (M15)</ListSubheader>] : []),
                    ...short_.map((s) => <MenuItem key={s.name} value={s.name}>{strategyLabel(s.name)}</MenuItem>),
                    ...(long_.length > 0 ? [<ListSubheader key="hdr-long" sx={subSx}>📈 เทรดยาว (H1)</ListSubheader>] : []),
                    ...long_.map((s) => <MenuItem key={s.name} value={s.name}>{strategyLabel(s.name)}</MenuItem>),
                    ...(general.length > 0 && (short_.length > 0 || long_.length > 0) ? [<ListSubheader key="hdr-general" sx={subSx}>── ทั่วไป ──</ListSubheader>] : []),
                    ...general.map((s) => <MenuItem key={s.name} value={s.name}>{strategyLabel(s.name)}</MenuItem>),
                  ];
                })()}
              </Select>
            </FormControl>

            {/* Strategy description */}
            {activeStrategy && (
              <Box sx={{ p: 1.5, bgcolor: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.16)", borderRadius: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.75 }}>
                  <Layers size={14} color="#22d3ee" />
                  <Typography variant="caption" sx={{ color: "#a5f3fc", fontWeight: 650 }}>
                    {strategyLabel(activeStrategy.name)}
                  </Typography>
                </Stack>
                <Typography variant="caption" sx={{ display: "block", color: "#94a3b8", lineHeight: 1.55 }}>
                  {activeStrategy.description}
                </Typography>
              </Box>
            )}

            {/* AI toggle */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1.25, py: 1, bgcolor: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: 2 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                {settings.forex_use_ai ? <ShieldCheck size={16} color="#10b981" /> : <ShieldAlert size={16} color="#94a3b8" />}
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 650 }}>
                    {settings.forex_use_ai ? "เปิดให้ AI ตรวจซ้ำ" : "ใช้กลยุทธ์อย่างเดียว"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {settings.forex_use_ai ? "AI ต้องเห็นด้วยก่อนส่งสัญญาณซื้อ/ขาย" : "บอทจะทำตามกลยุทธ์ที่เลือกโดยตรง"}
                  </Typography>
                </Box>
              </Stack>
              <Switch checked={settings.forex_use_ai ?? false} onChange={(e) => patch({ forex_use_ai: e.target.checked })} color="success" />
            </Box>

            {/* Bot enabled toggle */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1.25, py: 1, bgcolor: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: 2 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                {settings.forex_bot_enabled ? <ShieldCheck size={16} color="#10b981" /> : <ShieldAlert size={16} color="#ef4444" />}
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 650 }}>
                    {settings.forex_bot_enabled ? "เปิดบอท Forex อัตโนมัติ" : "ปิดบอท Forex อัตโนมัติ"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {settings.forex_bot_enabled ? "บอทจะสแกนและส่งออเดอร์ตามรอบที่กำหนด" : "หยุด auto trade แต่ยังวิเคราะห์มือได้"}
                  </Typography>
                </Box>
              </Stack>
              <Switch checked={settings.forex_bot_enabled ?? false} onChange={(e) => patch({ forex_bot_enabled: e.target.checked })} color="success" />
            </Box>

            {/* Telegram toggle */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1.25, py: 1, bgcolor: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: 2 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                {settings.telegram_enabled ? <BellRing size={16} color="#06b6d4" /> : <BellOff size={16} color="#94a3b8" />}
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 650 }}>
                    {settings.telegram_enabled ? "เปิดการแจ้งเตือน Telegram" : "ปิดการแจ้งเตือน Telegram"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {settings.telegram_enabled ? "บอทจะส่งแจ้งเตือนสัญญาณและสรุปรายวัน" : "หยุดส่งข้อความทุกประเภทไปยัง Telegram"}
                  </Typography>
                </Box>
              </Stack>
              <Switch checked={settings.telegram_enabled ?? true} onChange={(e) => patch({ telegram_enabled: e.target.checked })} color="primary" />
            </Box>

            {/* Global Settings link */}
            <Box
              component="a"
              href="/settings"
              sx={{
                display: "flex", alignItems: "center", gap: 1,
                px: 1.5, py: 1.25, borderRadius: 1.5,
                bgcolor: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.18)",
                color: "#60a5fa", textDecoration: "none",
                "&:hover": { bgcolor: "rgba(59,130,246,0.1)", borderColor: "rgba(59,130,246,0.35)" },
                transition: "all 0.15s",
              }}
            >
              <Box sx={{ fontSize: "1rem", lineHeight: 1, flexShrink: 0 }}>⚙️</Box>
              <Box>
                <Typography sx={{ fontSize: "0.78rem", fontWeight: 700, color: "#60a5fa", lineHeight: 1.3 }}>
                  Position Sizing / Min Lot Guard / Notional Cap
                </Typography>
                <Typography sx={{ fontSize: "0.65rem", color: "#475569", lineHeight: 1.4 }}>
                  ตั้งค่าใน Global Settings — ใช้กับทุก asset group
                </Typography>
              </Box>
            </Box>
          </Stack>
        </Box>

        {/* Save button */}
        <Box sx={{ p: 3, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <Button
            variant="contained" fullWidth onClick={onSave} disabled={savingSettings}
            startIcon={savingSettings ? <CircularProgress size={18} color="inherit" /> : <Save size={18} />}
            sx={{
              py: 1.5, fontWeight: 650, bgcolor: "#06b6d4",
              "&:hover": { bgcolor: "#0891b2" },
              boxShadow: "0 4px 12px rgba(6,182,212,0.2)", borderRadius: 2,
            }}
          >
            บันทึกการตั้งค่า
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}
