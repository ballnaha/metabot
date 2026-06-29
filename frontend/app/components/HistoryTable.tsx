"use client";

import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from "@mui/material";

// ── Shared formatting helpers (previously copy-pasted into every market page) ──

export const MONO = { fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums" };

export const fmt = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined || Number.isNaN(Number(n)) ? "-" : Number(n).toFixed(d);

export const formatBangkokTime = (value: string) => {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  const date = new Date(hasTimezone ? value : `${value}+07:00`);
  return date.toLocaleString("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  });
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type HistoryDeal = {
  ticket: number;
  order: number;
  time: string;
  symbol: string;
  type: string;
  entry: string;
  volume: number;
  price: number;
  entry_price?: number | null;
  pct?: number | null;
  commission: number;
  swap: number;
  profit: number;
  magic: number;
  comment: string;
};

type HistoryTableProps = {
  /** The page slice to render. */
  deals: HistoryDeal[];
  /** Full (unpaginated) length, for the pagination control + empty state. */
  totalCount: number;
  page: number;
  rowsPerPage: number;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rowsPerPage: number) => void;
  /** True if the deal was opened by the bot (drives the Bot/Manual badge). */
  isBot: (deal: HistoryDeal) => boolean;
  /** Decimal places for the price column (forex pairs differ from crypto/stocks). */
  priceDecimals?: (deal: HistoryDeal) => number;
  /** Small grey line under the price (e.g. notional value, or lot size). */
  priceSubtitle?: (deal: HistoryDeal) => string;
  /** Accent colour for the Bot badge (cyan on forex, blue elsewhere). */
  botBadgeColor?: { fg: string; bg: string; border: string };
  /** Message shown when there are no deals. */
  emptyMessage: string;
};

const DEFAULT_BOT_BADGE = {
  fg: "#60a5fa",
  bg: "rgba(59,130,246,0.1)",
  border: "rgba(59,130,246,0.2)",
};

const HEAD_CELL = {
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
};

export default function HistoryTable({
  deals,
  totalCount,
  page,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  isBot,
  priceDecimals,
  priceSubtitle,
  botBadgeColor = DEFAULT_BOT_BADGE,
  emptyMessage,
}: HistoryTableProps) {
  return (
    <Box sx={{ overflowX: "auto", mt: 2 }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ "& th": { bgcolor: "#0a1020", borderBottomColor: "rgba(255,255,255,0.08)", py: 1.25 } }}>
            <TableCell sx={HEAD_CELL}>เวลา</TableCell>
            <TableCell sx={HEAD_CELL}>Symbol</TableCell>
            <TableCell sx={HEAD_CELL}>ประเภท</TableCell>
            <TableCell align="right" sx={HEAD_CELL}>Volume</TableCell>
            <TableCell align="right" sx={HEAD_CELL}>ราคา</TableCell>
            <TableCell align="right" sx={HEAD_CELL}>กำไร / ขาดทุน</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {deals.map((h) => {
            const isLong = h.entry === "IN" ? h.type === "BUY" : h.type === "SELL";
            const isOpen = h.entry === "IN";
            const bot = isBot(h);
            const dec = priceDecimals ? priceDecimals(h) : 2;
            // IN (open) = blue · OUT (close) = green/red based on realized P/L
            const ac = isOpen ? "#60a5fa" : h.profit > 0 ? "#10b981" : h.profit < 0 ? "#ef4444" : "#64748b";
            const abg = isOpen ? "rgba(59,130,246,0.1)" : h.profit > 0 ? "rgba(16,185,129,0.08)" : h.profit < 0 ? "rgba(239,68,68,0.08)" : "rgba(100,116,139,0.08)";
            const aborder = isOpen ? "rgba(59,130,246,0.25)" : h.profit > 0 ? "rgba(16,185,129,0.22)" : h.profit < 0 ? "rgba(239,68,68,0.22)" : "rgba(100,116,139,0.15)";
            const rowBg = isOpen ? "rgba(59,130,246,0.022)" : h.profit > 0 ? "rgba(16,185,129,0.02)" : h.profit < 0 ? "rgba(239,68,68,0.02)" : "transparent";
            const accentBorder = isOpen ? "rgba(59,130,246,0.45)" : h.profit > 0 ? "rgba(16,185,129,0.45)" : h.profit < 0 ? "rgba(239,68,68,0.45)" : "rgba(100,116,139,0.25)";
            return (
              <TableRow
                key={`${h.ticket}-${h.time}`}
                sx={{ bgcolor: rowBg, "& td": { borderBottomColor: "rgba(255,255,255,0.04)", py: 0.6 }, "&:hover": { bgcolor: `${rowBg} !important`, filter: "brightness(1.4)" } }}
              >
                <TableCell sx={{ ...MONO, color: "#64748b", fontSize: "0.75rem", whiteSpace: "nowrap", borderLeft: `3px solid ${accentBorder}`, pl: 2 }}>
                  {formatBangkokTime(h.time)}
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                    <Typography sx={{ ...MONO, fontWeight: 800, fontSize: "0.82rem", color: "#e2e8f0" }}>{h.symbol}</Typography>
                    <Typography sx={{ ...MONO, fontSize: "0.68rem", color: "#334155" }}>#{h.ticket}</Typography>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, px: 0.75, py: 0.2, borderRadius: 0.75, bgcolor: abg, border: `1px solid ${aborder}` }}>
                      <Box sx={{ width: 4, height: 4, borderRadius: isOpen ? "50%" : "1px", bgcolor: ac, flexShrink: 0 }} />
                      <Typography sx={{ fontSize: "0.7rem", fontWeight: 800, color: ac, whiteSpace: "nowrap" }}>
                        {isOpen ? "Open" : "Close"} {isLong ? "Long" : "Short"}
                      </Typography>
                    </Box>
                    <Box sx={{ display: "inline-flex", px: 0.6, py: 0.15, borderRadius: 0.5, bgcolor: bot ? botBadgeColor.bg : "rgba(100,116,139,0.1)", border: `1px solid ${bot ? botBadgeColor.border : "rgba(100,116,139,0.15)"}` }}>
                      <Typography sx={{ fontSize: "0.62rem", fontWeight: 800, color: bot ? botBadgeColor.fg : "#64748b", letterSpacing: "0.03em" }}>
                        {bot ? "Bot" : "Manual"}
                      </Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell align="right" sx={{ ...MONO, color: "#94a3b8", fontSize: "0.78rem" }}>{fmt(h.volume, 2)}</TableCell>
                <TableCell align="right">
                  <Typography sx={{ ...MONO, color: "#94a3b8", fontSize: "0.78rem" }}>{fmt(h.price, dec)}</Typography>
                  {priceSubtitle && (
                    <Typography sx={{ ...MONO, color: "#475569", fontSize: "0.68rem" }}>{priceSubtitle(h)}</Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.75} sx={{ justifyContent: "flex-end", alignItems: "center" }}>
                    {h.commission !== 0 && (
                      <Typography sx={{ ...MONO, fontSize: "0.68rem", color: "#475569" }}>comm {fmt(h.commission)}</Typography>
                    )}
                    {isOpen ? (
                      <Typography sx={{ ...MONO, fontWeight: 700, fontSize: "0.78rem", color: "#475569", fontStyle: "italic" }}>—</Typography>
                    ) : (
                      <Stack sx={{ alignItems: "flex-end" }}>
                        <Typography sx={{ ...MONO, fontWeight: 800, fontSize: "0.85rem", color: h.profit > 0 ? "#10b981" : h.profit < 0 ? "#ef4444" : "#64748b" }}>
                          {h.profit > 0 ? "+" : ""}{fmt(h.profit)}
                        </Typography>
                        {h.pct != null && (
                          <Typography sx={{ ...MONO, fontWeight: 700, fontSize: "0.68rem", color: h.pct > 0 ? "#10b981" : h.pct < 0 ? "#ef4444" : "#64748b" }}>
                            {h.pct > 0 ? "+" : ""}{fmt(h.pct, 2)}%
                          </Typography>
                        )}
                      </Stack>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}
          {totalCount === 0 && (
            <TableRow>
              <TableCell colSpan={6}>
                <Typography color="text.secondary" variant="body2" sx={{ py: 1 }}>
                  {emptyMessage}
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <TablePagination
        rowsPerPageOptions={[5, 10, 20, 50]}
        component="div"
        count={totalCount}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={(_e, p) => onPageChange(p)}
        onRowsPerPageChange={(e) => { onRowsPerPageChange(parseInt(e.target.value, 10)); onPageChange(0); }}
        labelRowsPerPage="แถวต่อหน้า:"
        labelDisplayedRows={({ from, to, count }) => `${from}–${to} จาก ${count}`}
        sx={{
          color: "#94a3b8",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          "& .MuiTablePagination-toolbar": { minHeight: 44, px: 1 },
          "& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows": { fontSize: "0.78rem" },
          "& .MuiTablePagination-selectIcon": { color: "#64748b" },
          "& .MuiIconButton-root": { color: "#64748b" },
          "& .MuiIconButton-root.Mui-disabled": { color: "rgba(255,255,255,0.1)" },
        }}
      />
    </Box>
  );
}
