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
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  BellOff,
  BellRing,
  Filter,
  Layers,
  Save,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";

type StrategyInfo = {
  name: string;
  description: string;
};

type BotSettingsForm = {
  position_sizing_mode: string;
  stake_amount: number;
  max_open_trades: number;
  max_crypto_open_trades?: number;
  magic: number;
  atr_sl_mult: number;
  default_rr: number;
  strategy: string;
  auto_trade_interval: number;
  use_ai?: boolean;
  bot_enabled: boolean;
  telegram_enabled?: boolean;
};

type CryptoBotSettingsProps = {
  open: boolean;
  onClose: () => void;
  settingsForm: BotSettingsForm;
  setSettingsForm: (form: BotSettingsForm) => void;
  strategies: StrategyInfo[];
  selectedStrategyValue: string;
  activeStrategy?: StrategyInfo;
  strategyDescription: string;
  strategyLabel: (name: string) => string;
  savingSettings: boolean;
  onSave: () => void;
  cryptoInput: string;
  setCryptoInput: (val: string) => void;
  onDetectCryptoSymbols: () => void;
  detectingCryptoSymbols: boolean;
  allCryptoSymbols: string[];
  onValidateSymbols: () => void;
  validatingSymbols: boolean;
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
  const handleDecrement = () => {
    const newVal = Math.max(min, Number((value - step).toFixed(precision)));
    onChange(newVal);
  };

  const handleIncrement = () => {
    const newVal = Math.min(max, Number((value + step).toFixed(precision)));
    onChange(newVal);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, width: "100%" }}>
      <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 600, px: 0.5 }}>
        {label}
      </Typography>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          bgcolor: "rgba(255, 255, 255, 0.01)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 2,
          overflow: "hidden",
          transition: "all 0.2s",
          "&:focus-within": {
            borderColor: "#3b82f6",
            boxShadow: "0 0 0 1px rgba(59, 130, 246, 0.2)",
          },
        }}
      >
        <Button
          onClick={handleDecrement}
          disabled={value <= min}
          sx={{
            minWidth: 40,
            width: 40,
            height: 40,
            borderRadius: 0,
            color: "#94a3b8",
            bgcolor: "transparent",
            fontSize: "1.2rem",
            fontWeight: 500,
            borderRight: "1px solid rgba(255, 255, 255, 0.05)",
            "&:hover": { bgcolor: "rgba(255, 255, 255, 0.03)", color: "#fff" },
            "&.Mui-disabled": { color: "rgba(255,255,255,0.05)" },
          }}
        >
          -
        </Button>
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) {
              onChange(Math.max(min, Math.min(max, Number(val.toFixed(precision)))));
            } else if (e.target.value === "") {
              onChange(min);
            }
          }}
          style={{
            flexGrow: 1,
            width: "100%",
            border: "none",
            background: "transparent",
            color: "#fff",
            textAlign: "center",
            fontFamily: "ui-monospace, monospace",
            fontWeight: 600,
            fontSize: "1rem",
            outline: "none",
          }}
        />
        <Button
          onClick={handleIncrement}
          disabled={value >= max}
          sx={{
            minWidth: 40,
            width: 40,
            height: 40,
            borderRadius: 0,
            color: "#94a3b8",
            bgcolor: "transparent",
            fontSize: "1.2rem",
            fontWeight: 500,
            borderLeft: "1px solid rgba(255, 255, 255, 0.05)",
            "&:hover": { bgcolor: "rgba(255, 255, 255, 0.03)", color: "#fff" },
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

export default function CryptoBotSettings({
  open,
  onClose,
  settingsForm,
  setSettingsForm,
  strategies,
  selectedStrategyValue,
  activeStrategy,
  strategyDescription,
  strategyLabel,
  savingSettings,
  onSave,
  cryptoInput,
  setCryptoInput,
  onDetectCryptoSymbols,
  detectingCryptoSymbols,
  allCryptoSymbols,
  onValidateSymbols,
  validatingSymbols,
}: CryptoBotSettingsProps) {
  const [newSymbolInput, setNewSymbolInput] = useState("");

  const handleAddSymbol = () => {
    const clean = newSymbolInput.trim().toUpperCase();
    if (!clean) return;
    const list = cryptoInput ? cryptoInput.split(",").map(x => x.trim().toUpperCase()).filter(Boolean) : [];
    if (!list.includes(clean)) {
      const updated = [...list, clean];
      setCryptoInput(updated.join(", "));
    }
    setNewSymbolInput("");
  };

  const handleKeyDown = (e: any) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddSymbol();
    }
  };

  const handleRemoveSymbol = (sym: string) => {
    const list = cryptoInput ? cryptoInput.split(",").map(x => x.trim().toUpperCase()).filter(Boolean) : [];
    const updated = list.filter(x => x !== sym);
    setCryptoInput(updated.join(", "));
  };

  const patchSettings = (patch: Partial<BotSettingsForm>) => {
    setSettingsForm({ ...settingsForm, ...patch });
  };

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
            borderLeft: "1px solid rgba(59, 130, 246, 0.18)",
            backgroundImage: "none",
          },
        },
      }}
    >
      <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <Stack
          direction="row"
          spacing={1.5}
          sx={{
            alignItems: "center",
            justifyContent: "space-between",
            px: 3,
            py: 2.25,
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
            <Box sx={{ p: 0.8, borderRadius: 2, bgcolor: "rgba(59, 130, 246, 0.1)", display: "flex", color: "#3b82f6" }}>
              <SettingsIcon size={18} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ color: "#fff", fontWeight: 650, lineHeight: 1.15 }}>
                ตั้งค่าบอท
              </Typography>
              <Typography variant="caption" color="text.secondary">
                กลยุทธ์ ขนาดไม้ และการยืนยันออเดอร์
              </Typography>
            </Box>
          </Stack>
          <Button
            variant="text"
            color="inherit"
            onClick={onClose}
            sx={{ minWidth: 38, width: 38, height: 38, p: 0, borderRadius: 2 }}
          >
            <X size={18} />
          </Button>
        </Stack>

        <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 3 }}>
          <Stack spacing={2.5}>
            <Box sx={{ p: 2, bgcolor: "rgba(59, 130, 246, 0.03)", border: "1px solid rgba(59, 130, 246, 0.1)", borderRadius: 1 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                  <Filter size={18} color="#3b82f6" />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 650, color: "#fff" }}>
                      คัดเหรียญน่าเทรด (Crypto Symbols)
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      พิมพ์เหรียญแล้วกด Enter หรือกดปุ่ม สแกนเหรียญ เพื่อตรวจหาอัตโนมัติ
                    </Typography>
                  </Box>
                </Stack>

                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Autocomplete
                    freeSolo
                    size="small"
                    options={allCryptoSymbols || []}
                    inputValue={newSymbolInput}
                    onInputChange={(_event, newInputValue) => {
                      setNewSymbolInput(newInputValue);
                    }}
                    onChange={(_event, value) => {
                      if (value) {
                        const clean = typeof value === "string" ? value.trim().toUpperCase() : "";
                        if (clean) {
                          const list = cryptoInput ? cryptoInput.split(",").map(x => x.trim().toUpperCase()).filter(Boolean) : [];
                          if (!list.includes(clean)) {
                            const updated = [...list, clean];
                            setCryptoInput(updated.join(", "));
                          }
                          setNewSymbolInput("");
                        }
                      }
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder="พิมพ์ค้นหาเหรียญ เช่น BTCUSD"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddSymbol();
                          }
                        }}
                        sx={{
                          "& .MuiInputBase-root": {
                            height: 40,
                            bgcolor: "rgba(255,255,255,0.01)",
                            color: "#fff",
                            borderRadius: 1,
                            "& fieldset": {
                              borderColor: "rgba(255, 255, 255, 0.08)",
                            },
                            "&:hover fieldset": {
                              borderColor: "rgba(255, 255, 255, 0.2) !important",
                            },
                            "&.Mui-focused fieldset": {
                              borderColor: "#3b82f6 !important",
                            }
                          },
                          "& .MuiInputBase-input": {
                            color: "#fff",
                            fontSize: "0.9rem",
                          }
                        }}
                      />
                    )}
                    slotProps={{
                      paper: {
                        sx: {
                          bgcolor: "#0d1321",
                          border: "1px solid rgba(59,130,246,0.18)",
                          color: "#e2e8f0",
                          "& .MuiAutocomplete-option": {
                            fontWeight: 700,
                            fontSize: "0.9rem",
                            "&[aria-selected='true']": {
                              bgcolor: "rgba(59, 130, 246, 0.16)",
                            },
                            "&.Mui-focused": {
                              bgcolor: "rgba(255, 255, 255, 0.04)",
                            }
                          }
                        },
                      },
                    }}
                    sx={{ flexGrow: 1 }}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleAddSymbol}
                    sx={{
                      height: 40,
                      fontWeight: 600,
                      px: 2,
                      minWidth: "fit-content",
                      bgcolor: "#3b82f6",
                      "&:hover": { bgcolor: "#2563eb" },
                      borderRadius: 1,
                    }}
                  >
                    เพิ่ม
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={onDetectCryptoSymbols}
                    disabled={detectingCryptoSymbols}
                    sx={{
                      height: 40,
                      borderColor: "rgba(59, 130, 246, 0.25)",
                      color: "#60a5fa",
                      fontWeight: 600,
                      px: 2,
                      minWidth: "fit-content",
                      bgcolor: "rgba(59, 130, 246, 0.04)",
                      "&:hover": { borderColor: "#3b82f6", bgcolor: "rgba(59, 130, 246, 0.08)" },
                      "&.Mui-disabled": { color: "rgba(255,255,255,0.2)" },
                      borderRadius: 1,
                    }}
                  >
                    {detectingCryptoSymbols ? <CircularProgress size={16} color="inherit" /> : "สแกนเหรียญ"}
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={onValidateSymbols}
                    disabled={validatingSymbols}
                    sx={{
                      height: 40,
                      borderColor: "rgba(234, 179, 8, 0.25)",
                      color: "#fbbf24",
                      fontWeight: 600,
                      px: 2,
                      minWidth: "fit-content",
                      bgcolor: "rgba(234, 179, 8, 0.04)",
                      "&:hover": { borderColor: "#eab308", bgcolor: "rgba(234, 179, 8, 0.08)" },
                      "&.Mui-disabled": { color: "rgba(255,255,255,0.2)" },
                      borderRadius: 1,
                    }}
                  >
                    {validatingSymbols ? <CircularProgress size={16} color="inherit" /> : "กรองเหรียญ"}
                  </Button>
                </Stack>

                {/* Render current tags (chips) */}
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, pt: 0.5 }}>
                  {(() => {
                    const list = cryptoInput ? cryptoInput.split(",").map(x => x.trim().toUpperCase()).filter(Boolean) : [];
                    if (list.length === 0) {
                      return (
                        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic", px: 0.5 }}>
                          ยังไม่มีเหรียญในรายการสแกน
                        </Typography>
                      );
                    }
                    return list.map((sym) => (
                      <Chip
                        key={sym}
                        label={sym}
                        onDelete={() => handleRemoveSymbol(sym)}
                        size="small"
                        sx={{
                          bgcolor: "rgba(59, 130, 246, 0.08)",
                          color: "#fff",
                          border: "1px solid rgba(59, 130, 246, 0.2)",
                          fontWeight: 700,
                          borderRadius: 1,
                          "& .MuiChip-deleteIcon": {
                            color: "rgba(255, 255, 255, 0.4)",
                            transition: "color 0.2s",
                            "&:hover": { color: "#ef4444" }
                          }
                        }}
                      />
                    ));
                  })()}
                </Box>
              </Stack>
            </Box>

            <FormControl size="small" fullWidth>
              <InputLabel sx={{ color: "#94a3b8" }}>โหมดคำนวณขนาดไม้</InputLabel>
              <Select
                label="โหมดคำนวณขนาดไม้"
                value={settingsForm.position_sizing_mode}
                onChange={(e) => patchSettings({ position_sizing_mode: e.target.value })}
                sx={{ bgcolor: "rgba(255,255,255,0.01)", "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.08)" } }}
              >
                <MenuItem value="risk_pct">คำนวณจากความเสี่ยงจุดตัดขาดทุน</MenuItem>
                <MenuItem value="equal_slots">แบ่งทุนเท่ากันทุกช่อง</MenuItem>
              </Select>
            </FormControl>

            <QuickNumberInput
              label="วงเงินต่อไม้"
              value={settingsForm.stake_amount}
              onChange={(val) => patchSettings({ stake_amount: val })}
              step={50}
              min={0}
              precision={2}
              helperText="ใส่ 0 เพื่อให้ระบบแบ่งทุนอัตโนมัติจาก Equity / จำนวนช่อง"
            />

            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
              <QuickNumberInput
                label="จำนวนช่องคริปโตสูงสุด"
                value={settingsForm.max_crypto_open_trades ?? settingsForm.max_open_trades}
                onChange={(val) => patchSettings({ max_crypto_open_trades: val })}
                step={1}
                min={1}
                precision={0}
              />

              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 600, px: 0.5 }}>
                  Magic Number ของบอท
                </Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <input
                    type="text"
                    value={settingsForm.magic}
                    onChange={(e) => patchSettings({ magic: parseInt(e.target.value) || 0 })}
                    style={{
                      flexGrow: 1,
                      height: 40,
                      borderRadius: 8,
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      background: "rgba(255, 255, 255, 0.01)",
                      color: "#fff",
                      padding: "0 12px",
                      fontFamily: "ui-monospace, monospace",
                      fontWeight: 600,
                      outline: "none",
                      fontSize: "1rem",
                    }}
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => patchSettings({ magic: Math.floor(100000 + Math.random() * 900000) })}
                    sx={{
                      height: 40,
                      borderColor: "rgba(255,255,255,0.08)",
                      color: "#94a3b8",
                      fontWeight: 600,
                      px: 1.5,
                      minWidth: "fit-content",
                      "&:hover": { borderColor: "rgba(255,255,255,0.2)", color: "#fff" },
                    }}
                  >
                    สุ่มเลข
                  </Button>
                </Stack>
              </Box>
            </Box>

            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
              <QuickNumberInput
                label="ระยะตัดขาดทุน (ATR)"
                value={settingsForm.atr_sl_mult}
                onChange={(val) => patchSettings({ atr_sl_mult: val })}
                step={0.1}
                min={0.1}
                precision={1}
              />
              <QuickNumberInput
                label="เป้ากำไร (R:R)"
                value={settingsForm.default_rr}
                onChange={(val) => patchSettings({ default_rr: val })}
                step={0.1}
                min={0.1}
                precision={1}
              />
            </Box>

            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1.2fr 0.8fr" }, alignItems: "end" }}>
              <FormControl size="small" fullWidth>
                <InputLabel sx={{ color: "#94a3b8" }}>กลยุทธ์ที่ใช้</InputLabel>
                <Select
                  label="กลยุทธ์ที่ใช้"
                  value={selectedStrategyValue}
                  onChange={(e) => patchSettings({ strategy: e.target.value })}
                  sx={{ bgcolor: "rgba(255,255,255,0.01)", "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.08)" } }}
                >
                  <MenuItem value="" disabled>
                    กำลังโหลดกลยุทธ์...
                  </MenuItem>
                  {strategies.map((s) => (
                    <MenuItem key={s.name} value={s.name}>
                      {strategyLabel(s.name)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <QuickNumberInput
                label="สแกนทุก (วินาที)"
                value={settingsForm.auto_trade_interval}
                onChange={(val) => patchSettings({ auto_trade_interval: val })}
                step={10}
                min={10}
                precision={0}
              />
            </Box>

            {activeStrategy && (
              <Box sx={{ p: 1.5, bgcolor: "rgba(59, 130, 246, 0.06)", border: "1px solid rgba(59, 130, 246, 0.16)", borderRadius: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.75 }}>
                  <Layers size={14} color="#60a5fa" />
                  <Typography variant="caption" sx={{ color: "#bfdbfe", fontWeight: 650 }}>
                    {strategyLabel(activeStrategy.name)}
                  </Typography>
                </Stack>
                <Typography variant="caption" sx={{ display: "block", color: "#94a3b8", lineHeight: 1.55 }}>
                  {strategyDescription}
                </Typography>
              </Box>
            )}

            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1.25, py: 1, bgcolor: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: 2 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                {settingsForm.use_ai ? <ShieldCheck size={16} color="#10b981" /> : <ShieldAlert size={16} color="#94a3b8" />}
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 650 }}>
                    {settingsForm.use_ai ? "เปิดให้ AI ตรวจซ้ำ" : "ใช้กลยุทธ์อย่างเดียว"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {settingsForm.use_ai ? "AI ต้องเห็นด้วยก่อนส่งสัญญาณซื้อ/ขาย" : "บอทจะทำตามกลยุทธ์ที่เลือกโดยตรง"}
                  </Typography>
                </Box>
              </Stack>
              <Switch checked={settingsForm.use_ai ?? false} onChange={(e) => patchSettings({ use_ai: e.target.checked })} color="success" />
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1.25, py: 1, bgcolor: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: 2 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                {settingsForm.bot_enabled ? <ShieldCheck size={16} color="#10b981" /> : <ShieldAlert size={16} color="#ef4444" />}
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 650 }}>
                    {settingsForm.bot_enabled ? "เปิดการใช้งานบอท" : "ปิดการใช้งานบอท"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {settingsForm.bot_enabled ? "บอทกำลังทำงาน สแกนและส่งออเดอร์อัตโนมัติ" : "หยุดการสแกนและซื้อขายอัตโนมัติชั่วคราว"}
                  </Typography>
                </Box>
              </Stack>
              <Switch checked={settingsForm.bot_enabled ?? false} onChange={(e) => patchSettings({ bot_enabled: e.target.checked })} color="success" />
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1.25, py: 1, bgcolor: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: 2 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                {settingsForm.telegram_enabled ? <BellRing size={16} color="#3b82f6" /> : <BellOff size={16} color="#94a3b8" />}
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 650 }}>
                    {settingsForm.telegram_enabled ? "เปิดการแจ้งเตือน Telegram" : "ปิดการแจ้งเตือน Telegram"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {settingsForm.telegram_enabled ? "บอทจะส่งแจ้งเตือนสัญญาณ ปิด position และสรุปรายวัน" : "หยุดส่งข้อความทุกประเภทไปยัง Telegram"}
                  </Typography>
                </Box>
              </Stack>
              <Switch checked={settingsForm.telegram_enabled ?? true} onChange={(e) => patchSettings({ telegram_enabled: e.target.checked })} color="primary" />
            </Box>
          </Stack>
        </Box>

        <Box sx={{ p: 3, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <Button
            variant="contained"
            fullWidth
            onClick={onSave}
            disabled={savingSettings}
            startIcon={savingSettings ? <CircularProgress size={18} color="inherit" /> : <Save size={18} />}
            sx={{
              py: 1.5,
              fontWeight: 650,
              bgcolor: "#3b82f6",
              "&:hover": { bgcolor: "#2563eb" },
              boxShadow: "0 4px 12px rgba(59, 130, 246, 0.2)",
              borderRadius: 2,
            }}
          >
            บันทึกการตั้งค่า
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}
