"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToastr } from "../components/Toastr";
import Sidebar, { SIDEBAR_W } from "../components/Sidebar";
import TopBar from "../components/TopBar";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
} from "@mui/material";
import { Bot, Key, Pencil, Plus, Save, Settings, Sliders, Trash2, ShieldAlert } from "lucide-react";

type MT5Profile = { id: string; label: string; login: number; server: string };

const PROFILES_KEY = "mt5_profiles";
const DEFAULT_PROFILES: MT5Profile[] = [
  { id: "demo", label: "Demo (Dry Run)", login: 1301668618, server: "XMGlobal-MT5 6" },
  { id: "live", label: "Live",           login: 113493107,  server: "XMGlobal-MT5 2" },
];

function profileColor(label: string) {
  const l = label.toLowerCase();
  if (l.includes("live"))  return { bg: "rgba(16,185,129,0.15)", text: "#34d399", border: "rgba(16,185,129,0.4)", bgHover: "rgba(16,185,129,0.22)" };
  if (l.includes("demo"))  return { bg: "rgba(59,130,246,0.15)", text: "#60a5fa", border: "rgba(59,130,246,0.4)", bgHover: "rgba(59,130,246,0.22)" };
  return                          { bg: "rgba(139,92,246,0.15)", text: "#a78bfa", border: "rgba(139,92,246,0.4)", bgHover: "rgba(139,92,246,0.22)" };
}

function loadProfiles(): MT5Profile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (raw) return JSON.parse(raw) as MT5Profile[];
  } catch {}
  return DEFAULT_PROFILES;
}

function saveProfiles(profiles: MT5Profile[]) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

type Account = {
  login: number;
  server: string;
  currency: string;
  balance: number;
  equity: number;
  margin_free: number;
  profit: number;
};

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`/api/${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || res.statusText);
  return data;
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <Stack spacing={0.5} sx={{ mb: 2.5 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Box sx={{ color: "#3b82f6", display: "flex" }}>{icon}</Box>
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1 }}>
          {title}
        </Typography>
      </Stack>
      {subtitle && (
        <Typography variant="caption" color="text.secondary" sx={{ pl: 0.5 }}>
          {subtitle}
        </Typography>
      )}
    </Stack>
  );
}

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
          height: 40,
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
            height: "100%",
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
            height: "100%",
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
            height: "100%",
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

export default function SettingsPage() {
  const toastr = useToastr();

  const [account, setAccount] = useState<Account | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const connectedRef = useRef<boolean | null>(null);
  useEffect(() => { connectedRef.current = connected; }, [connected]);

  const [form, setForm] = useState<any>({
    mt5_login: "",
    mt5_password: "",
    mt5_server: "",
    mt5_path: "",
    deepseek_api_key: "",
    deepseek_model: "deepseek-chat",
    gemini_api_key: "",
    gemini_model: "gemini-1.5-flash",
    telegram_bot_token: "",
    telegram_chat_id: "",
    telegram_enabled: true,
    max_daily_loss_pct: 0,
    max_consecutive_losses: 0,
  });

  // Account profiles (editable, stored in localStorage)
  const [profiles, setProfiles] = useState<MT5Profile[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [passwords, setPasswords] = useState<Record<string, string>>({});

  // Profile editor dialog
  const [editDialog, setEditDialog] = useState<{ open: boolean; profile: MT5Profile | null }>({ open: false, profile: null });
  const [editForm, setEditForm] = useState<Omit<MT5Profile, "id">>({ label: "", login: 0, server: "" });

  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const a = await api("account");
      setAccount(a);
      if (connectedRef.current === false) toastr.success("MT5 terminal connected.");
      setConnected(true);
    } catch (e: any) {
      if (connectedRef.current !== false) toastr.error(`MT5 disconnected: ${e.message}`);
      setConnected(false);
    }
  }, [toastr]);

  useEffect(() => {
    const loaded = loadProfiles();
    setProfiles(loaded);

    refresh();
    api("settings")
      .then((data) => {
        setForm(data);
        const login = Number(data.mt5_login);
        const matched = loaded.find((p) => p.login === login);
        const id = matched?.id ?? loaded[0]?.id ?? "";
        setActiveId(id);
        if (data.mt5_password && id) {
          setPasswords((prev) => ({ ...prev, [id]: data.mt5_password }));
        }
      })
      .catch((e) => toastr.error(`Failed to load settings: ${e.message}`));
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh, toastr]);

  function handleProfileSwitch(_: React.MouseEvent, id: string | null) {
    if (!id) return;
    setPasswords((prev) => ({ ...prev, [activeId]: form.mt5_password || "" }));
    const p = profiles.find((x) => x.id === id)!;
    setActiveId(id);
    setForm((prev: any) => ({
      ...prev,
      mt5_login:    p.login,
      mt5_server:   p.server,
      mt5_password: passwords[id] ?? "",
    }));
  }

  function handlePasswordChange(val: string) {
    setPasswords((prev) => ({ ...prev, [activeId]: val }));
    setForm((prev: any) => ({ ...prev, mt5_password: val }));
  }

  function openAdd() {
    setEditForm({ label: "", login: 0, server: "" });
    setEditDialog({ open: true, profile: null });
  }

  function openEdit(p: MT5Profile) {
    setEditForm({ label: p.label, login: p.login, server: p.server });
    setEditDialog({ open: true, profile: p });
  }

  function deleteProfile(id: string) {
    const next = profiles.filter((p) => p.id !== id);
    setProfiles(next);
    saveProfiles(next);
    if (activeId === id && next.length > 0) {
      const first = next[0];
      setActiveId(first.id);
      setForm((prev: any) => ({ ...prev, mt5_login: first.login, mt5_server: first.server, mt5_password: passwords[first.id] ?? "" }));
    }
  }

  function saveEditDialog() {
    if (!editForm.label || !editForm.login) return;
    let next: MT5Profile[];
    if (editDialog.profile) {
      next = profiles.map((p) => p.id === editDialog.profile!.id ? { ...p, ...editForm } : p);
      if (activeId === editDialog.profile.id) {
        setForm((prev: any) => ({ ...prev, mt5_login: editForm.login, mt5_server: editForm.server }));
      }
    } else {
      const newP: MT5Profile = { id: crypto.randomUUID(), ...editForm };
      next = [...profiles, newP];
    }
    setProfiles(next);
    saveProfiles(next);
    setEditDialog({ open: false, profile: null });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setWarning(null);
    try {
      const res = await api("settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      toastr.success("บันทึกการตั้งค่าเรียบร้อย!");
      if (res.warning) {
        setWarning(res.warning);
        toastr.warning(res.warning, 6000);
      }
      refresh();
    } catch (e: any) {
      toastr.error(e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const equity = account?.equity;
  const currency = account?.currency ?? "USD";

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "#060c18" }}>
      <Sidebar
        connected={connected}
        equity={equity}
        currency={currency}
        onOpenLog={() => {}}
        onSync={refresh}
      />

      <Box sx={{ ml: `${SIDEBAR_W}px`, flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <TopBar
          pageTitle="Global Settings"
          pageIcon={<Settings size={16} />}
          connected={connected}
          accountLogin={account?.login}
          balance={account?.balance}
          equity={equity}
          currency={currency}
          openPl={account?.profit ?? 0}
          botEnabled={form.bot_enabled ?? true}
          strategy={form.strategy ?? ""}
        />

        <Container maxWidth="lg" sx={{ py: 3, flex: 1 }}>
          <Box component="form" onSubmit={handleSave} sx={{ display: "flex", flexDirection: "column", gap: 3 }}>

            {warning && (
              <Alert severity="warning" onClose={() => setWarning(null)}>
                {warning}
              </Alert>
            )}

            {/* Row 1 — MT5 + AI Keys */}
            <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>

              {/* MT5 Connection */}
              <Card>
                <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                  <SectionHeader icon={<Sliders size={16} />} title="MetaTrader 5 (MT5) Connection" />

                  {/* Account profile switcher */}
                  <Stack spacing={1.5}>
                    <ToggleButtonGroup
                      exclusive
                      value={activeId}
                      onChange={handleProfileSwitch}
                      size="small"
                      sx={{ flexWrap: "wrap", gap: 0.5 }}
                    >
                      {profiles.map((p) => {
                        const color = profileColor(p.label);
                        return (
                          <ToggleButton
                            key={p.id}
                            value={p.id}
                            sx={{
                              flex: "1 1 auto",
                              py: 1,
                              px: 2,
                              "&.Mui-selected": {
                                bgcolor: color.bg,
                                color:   color.text,
                                borderColor: color.border,
                                "&:hover": { bgcolor: color.bgHover },
                              },
                            }}
                          >
                            <Stack sx={{ alignItems: "center", gap: 0.3 }}>
                              <Typography sx={{ fontSize: "0.78rem", fontWeight: 700, lineHeight: 1 }}>
                                {p.label}
                              </Typography>
                              <Typography sx={{ fontSize: "0.62rem", opacity: 0.55, lineHeight: 1, fontFamily: "monospace" }}>
                                #{p.login}
                              </Typography>
                            </Stack>
                          </ToggleButton>
                        );
                      })}
                    </ToggleButtonGroup>

                    {/* Action bar for selected profile */}
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "flex-end" }}>
                      <Button
                        size="small"
                        startIcon={<Plus size={14} />}
                        onClick={openAdd}
                        sx={{ fontSize: "0.72rem", color: "#64748b", "&:hover": { color: "#60a5fa" } }}
                      >
                        เพิ่ม Account
                      </Button>
                      <Button
                        size="small"
                        startIcon={<Pencil size={14} />}
                        onClick={() => { const p = profiles.find((x) => x.id === activeId); if (p) openEdit(p); }}
                        sx={{ fontSize: "0.72rem", color: "#64748b", "&:hover": { color: "#60a5fa" } }}
                      >
                        แก้ไข
                      </Button>
                      {profiles.length > 1 && (
                        <Button
                          size="small"
                          startIcon={<Trash2 size={14} />}
                          onClick={() => deleteProfile(activeId)}
                          sx={{ fontSize: "0.72rem", color: "#64748b", "&:hover": { color: "#f87171" } }}
                        >
                          ลบ
                        </Button>
                      )}
                    </Stack>
                  </Stack>

                  <TextField
                    label="MT5 Password"
                    size="small"
                    type="password"
                    value={form.mt5_password || ""}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="MT5 Server"
                    size="small"
                    value={form.mt5_server || ""}
                    onChange={(e) => setForm({ ...form, mt5_server: e.target.value })}
                    fullWidth
                  />
                  <TextField
                    label="MT5 Path (Optional)"
                    size="small"
                    value={form.mt5_path || ""}
                    onChange={(e) => setForm({ ...form, mt5_path: e.target.value })}
                    placeholder="e.g. C:\Program Files\XM Global MT5\terminal64.exe"
                    fullWidth
                  />
                </CardContent>
              </Card>

              {/* Edit / Add profile dialog */}
              <Dialog open={editDialog.open} onClose={() => setEditDialog({ open: false, profile: null })} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontSize: "0.95rem", fontWeight: 700 }}>
                  {editDialog.profile ? "แก้ไข Account" : "เพิ่ม Account ใหม่"}
                </DialogTitle>
                <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "12px !important" }}>
                  <TextField
                    label="ชื่อ (เช่น Demo, Live, ของฉัน)"
                    size="small"
                    value={editForm.label}
                    onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                    fullWidth
                    autoFocus
                  />
                  <TextField
                    label="MT5 Login ID"
                    size="small"
                    type="number"
                    value={editForm.login || ""}
                    onChange={(e) => setEditForm({ ...editForm, login: parseInt(e.target.value) || 0 })}
                    fullWidth
                  />
                  <TextField
                    label="MT5 Server"
                    size="small"
                    value={editForm.server}
                    onChange={(e) => setEditForm({ ...editForm, server: e.target.value })}
                    fullWidth
                  />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                  <Button onClick={() => setEditDialog({ open: false, profile: null })} color="inherit" size="small">
                    ยกเลิก
                  </Button>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={saveEditDialog}
                    disabled={!editForm.label || !editForm.login}
                  >
                    บันทึก
                  </Button>
                </DialogActions>
              </Dialog>

              {/* AI API Keys */}
              <Card>
                <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                  <SectionHeader icon={<Key size={16} />} title="AI Advice Engine — API Keys" />
                  <TextField
                    label="Gemini API Key"
                    size="small"
                    type="password"
                    value={form.gemini_api_key || ""}
                    onChange={(e) => setForm({ ...form, gemini_api_key: e.target.value })}
                    fullWidth
                  />
                  <TextField
                    label="Gemini Model"
                    size="small"
                    value={form.gemini_model || ""}
                    onChange={(e) => setForm({ ...form, gemini_model: e.target.value })}
                    fullWidth
                  />
                  <TextField
                    label="DeepSeek API Key"
                    size="small"
                    type="password"
                    value={form.deepseek_api_key || ""}
                    onChange={(e) => setForm({ ...form, deepseek_api_key: e.target.value })}
                    fullWidth
                  />
                  <TextField
                    label="DeepSeek Model"
                    size="small"
                    value={form.deepseek_model || ""}
                    onChange={(e) => setForm({ ...form, deepseek_model: e.target.value })}
                    fullWidth
                  />
                </CardContent>
              </Card>
            </Box>

            {/* Row 2 — Telegram & Risk settings */}
            <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
              <Card>
                <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                  <SectionHeader icon={<Bot size={16} />} title="Telegram Notifications" />
                  <TextField
                    label="Bot Token"
                    size="small"
                    type="password"
                    value={form.telegram_bot_token || ""}
                    onChange={(e) => setForm({ ...form, telegram_bot_token: e.target.value })}
                    fullWidth
                  />
                  <TextField
                    label="Chat ID"
                    size="small"
                    value={form.telegram_chat_id || ""}
                    onChange={(e) => setForm({ ...form, telegram_chat_id: e.target.value })}
                    fullWidth
                  />
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", pl: 0.5 }}>
                    <Switch
                      checked={form.telegram_enabled ?? true}
                      onChange={(e) => setForm({ ...form, telegram_enabled: e.target.checked })}
                      size="small"
                    />
                    <Typography variant="body2" color="text.secondary">
                      เปิดใช้การแจ้งเตือน Telegram
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>

              {/* Risk Management & Circuit Breakers */}
              <Card>
                <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                  <SectionHeader icon={<ShieldAlert size={16} />} title="Risk Management & Circuit Breakers" />
                  
                  <QuickNumberInput
                    label="ขีดจำกัดขาดทุนรายวัน: Max Daily Loss (%)"
                    value={form.max_daily_loss_pct !== undefined && form.max_daily_loss_pct !== null ? Math.round(form.max_daily_loss_pct * 100) : 0}
                    onChange={(val) => setForm({ ...form, max_daily_loss_pct: val / 100 })}
                    step={1}
                    min={0}
                    max={100}
                    precision={0}
                    helperText="สั่งพักการเทรดอัตโนมัติเมื่อเสียถึง % ของบาลานซ์ในวันนั้น (0 = ปิดใช้งาน เช่น 5 = 5%)"
                  />

                  <QuickNumberInput
                    label="จำนวนไม้ที่ขาดทุนติดต่อกัน: Max Consecutive Losses"
                    value={form.max_consecutive_losses !== undefined && form.max_consecutive_losses !== null ? form.max_consecutive_losses : 0}
                    onChange={(val) => setForm({ ...form, max_consecutive_losses: val })}
                    step={1}
                    min={0}
                    max={100}
                    precision={0}
                    helperText="สั่งพักการเทรดอัตโนมัติเมื่อเสียติดต่อกันตามจำนวนครั้ง (0 = ปิดใช้งาน)"
                  />
                </CardContent>
              </Card>
            </Box>

            {/* Save bar */}
            <Box sx={{ display: "flex", justifyContent: "flex-end", pb: 2 }}>
              <Button
                variant="contained"
                type="submit"
                disabled={saving}
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Save size={16} />}
                size="large"
                sx={{ px: 5, py: 1.5, borderRadius: 2 }}
              >
                {saving ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
              </Button>
            </Box>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}
