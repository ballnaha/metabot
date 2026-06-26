"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";

// Global mouse tracker to allow eye-tracking across the entire window
let globalMouse = { x: 0, y: 0, active: false };
if (typeof window !== "undefined") {
  const handleGlobalMouseMove = (e: MouseEvent) => {
    globalMouse.x = e.clientX;
    globalMouse.y = e.clientY;
    globalMouse.active = true;
  };
  const handleGlobalMouseLeave = () => {
    globalMouse.active = false;
  };
  window.addEventListener("mousemove", handleGlobalMouseMove);
  window.addEventListener("mouseleave", handleGlobalMouseLeave);
}

type BotState = "offline" | "idle" | "scanning" | "buy" | "sell";
interface LogEntry { id: number; time: string; level: string; event: string; message: string }

// Styling parameters for different bot states
const STATE_CFG: Record<BotState, {
  light: string;
  tag: string;
  tagColor: string;
  glow: string;
  particleColor: string;
}> = {
  offline:  { light: "#374151", tag: "OFFLINE",     tagColor: "#64748b", glow: "rgba(75,85,99,0.1)",  particleColor: "rgba(100,116,139,0.1)" },
  idle:     { light: "#22d3ee", tag: "STANDBY",     tagColor: "#60a5fa", glow: "rgba(59,130,246,0.3)", particleColor: "rgba(96,165,250,0.45)" },
  scanning: { light: "#60a5fa", tag: "SCANNING",    tagColor: "#60a5fa", glow: "rgba(59,130,246,0.4)", particleColor: "rgba(96,165,250,0.55)" },
  buy:      { light: "#34d399", tag: "BUY SIGNAL",  tagColor: "#10b981", glow: "rgba(16,185,129,0.6)", particleColor: "rgba(52,211,153,0.85)" },
  sell:     { light: "#f87171", tag: "SELL SIGNAL", tagColor: "#ef4444", glow: "rgba(239,68,68,0.6)",  particleColor: "rgba(248,113,113,0.85)" },
};

type GridSet = { idle: string[]; signal: string[] };

// ──────────────────────────────────────────────
// Programmatic Custom Robot Matrices
// X = Primary Body, Y = Secondary Accent, V = Visor Glass, L = Visor Pupil/Light
// ──────────────────────────────────────────────
const BOT_DESIGNS: Record<"crypto" | "gold" | "stock", GridSet> = {
  crypto: {
    idle: [
      "X......X", // Horns/Antenna
      "X.YYYY.X",
      ".XXXXXX.", // Head
      "XXVLLVXX", // Visor + Pupils
      "XXXXXXXX",
      ".XXXXXX.", // Neck
      "XXXXXXXX", // Torso
      "Y.XXXX.Y", // Arms down
      "XXXXXXXX",
      ".X.XX.X.",
      ".XX..XX.",
      "XX....XX", // Legs
    ],
    signal: [
      "Y......Y", // Horns glowing
      "X.YYYY.X",
      ".XXXXXX.",
      "XXVLLVXX",
      "XXXXXXXX",
      ".XXXXXX.",
      "XXXXXXXX",
      "Y.XXXX.Y",
      "XXXXXXXX",
      "XX....XX", // Arms raised / celebrating!
      "XX....XX",
      "..XXXX..",
    ]
  },
  gold: {
    idle: [
      "YYYYYYYY", // Heavy flat plate
      "YXXXXXXY",
      "XXXXXXXX",
      "XXXLLXXX", // Cyclops center eye
      "XXXXXXXX",
      "YXXXXXXY", // Armored shoulders
      "XXXXXXXX",
      "XXXXXXXX", // Heavy torso
      "Y.XXXX.Y",
      ".XXXXXX.",
      "XX....XX",
      "XX....XX",
    ],
    signal: [
      "YYYYYYYY",
      "YXXXXXXY",
      "XXXXXXXX",
      "XXXLLXXX",
      "XXXXXXXX",
      "YYYYYYYY", // Flared armored shoulders
      "XXXXXXXX",
      "XXXXXXXX",
      "Y.XXXX.Y",
      "XX....XX", // Extended heavy pose
      "XX....XX",
      "XX....XX",
    ]
  },
  stock: {
    idle: [
      "..YYYY..", // Corporate Top Hat
      "..YYYY..",
      "YYYYYYYY", // Hat Brim
      ".XXXXXX.", // Corporate head
      "XVLLLLVX", // Sunglasses style Visor
      ".XXXXXX.",
      "XXXXXXXX", // Torso
      "XXYXXYXX", // Suit tie details
      "XXXXXXXX",
      ".XXXXXX.",
      "..XX..XX",
      "..XX..XX",
    ],
    signal: [
      "..YYYY..",
      "..YYYY..",
      "YYYYYYYY",
      ".XXXXXX.",
      "XVLLLLVX",
      ".XXXXXX.",
      "XXXXXXXX",
      "XXYXXYXX",
      "XXXXXXXX",
      "XX....XX", // Corporate hands up!
      "XX....XX",
      "XX....XX",
    ]
  }
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  fade: number;
  char?: string;
}

export function PixelBotAvatar({
  botEnabled,
  assetType,
  recentLogs,
}: {
  botEnabled: boolean;
  assetType: "crypto" | "gold" | "stock";
  recentLogs: LogEntry[];
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  const [tagText, setTagText] = useState("STANDBY");
  const [tagColor, setTagColor] = useState("#60a5fa");
  const [flash, setFlash] = useState<"buy" | "sell" | null>(null);
  const lastStateTag = useRef("STANDBY");
  const lastStateColor = useRef("#60a5fa");

  // Detect signal flashes based on logs
  useEffect(() => {
    const latest = recentLogs[0];
    if (!latest) return;
    if (latest.event === "trade" || latest.level === "success") {
      const msg = (latest.message || "").toUpperCase();
      const isCrypto = assetType === "crypto" && (msg.includes("BTC") || msg.includes("ETH") || msg.includes("SOL") || msg.includes("XRP") || msg.includes("CRYPTO"));
      const isGold = assetType === "gold" && (msg.includes("GOLD") || msg.includes("XAU") || msg.includes("SILVER") || msg.includes("METAL"));
      const isStock = assetType === "stock" && (msg.includes("STOCK") || msg.includes("US STOCK") || msg.includes("AAPL") || msg.includes("MSFT") || msg.includes("TSLA") || msg.includes("NVDA"));
      
      if (isCrypto || isGold || isStock) {
        const isBuy = /buy/i.test(latest.message);
        setFlash(isBuy ? "buy" : "sell");
        const t = setTimeout(() => setFlash(null), 3000);
        return () => clearTimeout(t);
      }
    }
  }, [recentLogs, assetType]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let particles: Particle[] = [];
    let frameCount = 0;
    let blinkTimer = 0;
    let blinkFrames = 0;
    let scanlineY = 0;

    // Smooth movement/drift offsets for tracking
    let curEyeX = 0;
    let curEyeY = 0;
    let curFloatY = 0;

    // Glitch parameters
    let glitchActive = false;
    let glitchFrames = 0;
    let glitchShiftX = 0;

    // Constants
    const CANVAS_SIZE = 75;
    const P = 2.2; // Pixel size
    const BOT_W = 8 * P;
    const BOT_H = 12 * P;

    const run = () => {
      frameCount++;

      // 1. Determine active state & config
      const activeState: BotState = !botEnabled ? "offline" : (flash ?? ((frameCount % 180 < 50) ? "scanning" : "idle"));
      const cfg = STATE_CFG[activeState];

      // Update state tags safely
      if (lastStateTag.current !== cfg.tag) {
        lastStateTag.current = cfg.tag;
        setTagText(cfg.tag);
      }
      if (lastStateColor.current !== cfg.tagColor) {
        lastStateColor.current = cfg.tagColor;
        setTagColor(cfg.tagColor);
      }

      // Handle DPI scaling
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== CANVAS_SIZE * dpr) {
        canvas.width = CANVAS_SIZE * dpr;
        canvas.height = CANVAS_SIZE * dpr;
        canvas.style.width = `${CANVAS_SIZE}px`;
        canvas.style.height = `${CANVAS_SIZE}px`;
      }
      ctx.resetTransform();
      ctx.scale(dpr, dpr);

      // Clear Canvas
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      // 2. Generate themed particles (binary bits for standby/scanning, signals for active trades)
      if (activeState !== "offline" && particles.length < 15 && Math.random() < 0.16) {
        const angle = Math.random() * Math.PI;
        const radius = (CANVAS_SIZE / 2 - 8) * Math.random();

        let char = "";
        if (activeState === "idle" || activeState === "scanning") {
          char = Math.random() < 0.5 ? "0" : "1";
        } else if (activeState === "buy") {
          char = Math.random() < 0.5 ? "+" : "▲";
        } else if (activeState === "sell") {
          char = Math.random() < 0.5 ? "-" : "▼";
        }

        particles.push({
          x: CANVAS_SIZE / 2 + Math.cos(angle) * radius,
          y: CANVAS_SIZE - 12 - Math.random() * 8,
          vx: (Math.random() - 0.5) * 0.4,
          vy: -0.4 - Math.random() * 0.8,
          size: char ? 6.5 : (1 + Math.random() * 1.5),
          alpha: 0.15 + Math.random() * 0.5,
          fade: 0.005 + Math.random() * 0.015,
          char: char,
        });
      }

      // Draw background circular clipping for portal
      ctx.save();
      ctx.beginPath();
      ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 1, 0, Math.PI * 2);
      ctx.clip();

      // Render particles
      particles.forEach((part) => {
        part.x += part.vx;
        part.y += part.vy;
        part.alpha -= part.fade;

        ctx.fillStyle = cfg.particleColor;
        ctx.globalAlpha = Math.max(0, part.alpha);

        if (part.char) {
          ctx.font = "800 8px monospace";
          ctx.fillText(part.char, part.x, part.y);
        } else {
          ctx.fillRect(part.x, part.y, part.size, part.size);
        }
      });
      ctx.globalAlpha = 1.0;
      particles = particles.filter(p => p.alpha > 0);

      // 3. Eye Movement Calculations (Cursor tracking)
      let targetEyeX = 0;
      let targetEyeY = 0;

      if (globalMouse.active && activeState !== "offline") {
        const rect = canvas.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = globalMouse.x - centerX;
        const dy = globalMouse.y - centerY;
        const dist = Math.hypot(dx, dy);

        if (dist > 10) {
          const maxShift = 1.2; // Keep pupil inside visor
          const angle = Math.atan2(dy, dx);
          const factor = Math.min(maxShift, dist / 150);
          targetEyeX = Math.cos(angle) * factor;
          targetEyeY = Math.sin(angle) * factor * 0.7;
        }
      }

      // Smooth eye transition
      curEyeX += (targetEyeX - curEyeX) * 0.15;
      curEyeY += (targetEyeY - curEyeY) * 0.15;

      // 4. Scanning & Blinking logic
      if (activeState === "scanning") {
        curEyeX = Math.sin(frameCount * 0.12) * 1.0;
        curEyeY = 0;
      }

      blinkTimer++;
      if (blinkTimer > 240 + Math.random() * 200 && activeState !== "offline") {
        blinkTimer = 0;
        blinkFrames = 8;
      }
      if (blinkFrames > 0) blinkFrames--;

      // 5. Breathing Physics (Organic stretch & squash)
      const targetFloatY = activeState === "offline" ? 0 : Math.sin(frameCount * 0.05) * 1.5;
      curFloatY += (targetFloatY - curFloatY) * 0.1;

      const breatheScaleY = activeState === "offline" ? 1.0 : 1.0 + Math.sin(frameCount * 0.05) * 0.035;
      const breatheScaleX = activeState === "offline" ? 1.0 : 1.0 - Math.sin(frameCount * 0.05) * 0.015;

      // 6. Cyber-Glitch trigger
      if (activeState !== "offline" && !glitchActive && Math.random() < 0.003) {
        glitchActive = true;
        glitchFrames = 2 + Math.floor(Math.random() * 4);
        glitchShiftX = (Math.random() - 0.5) * 5;
      }
      if (glitchActive) {
        glitchFrames--;
        if (glitchFrames <= 0) {
          glitchActive = false;
          glitchShiftX = 0;
        }
      }

      // 7. Render Bot Grid
      const isSignalState = activeState === "buy" || activeState === "sell";
      const design = BOT_DESIGNS[assetType];
      const activeGrid = isSignalState ? design.signal : design.idle;

      // Setup dynamic coloring based on asset class and active state
      let bodyColor = "#3b82f6";
      let accentColor = "#60a5fa";
      let visorColor = "#0c1f3d";
      let pupilColor = cfg.light;

      if (activeState === "offline") {
        bodyColor = "#4b5563";
        accentColor = "#64748b";
        visorColor = "#1e293b";
        pupilColor = "#374151";
      } else {
        if (assetType === "crypto") {
          bodyColor = "#2563eb";
          accentColor = "#60a5fa";
          visorColor = "#0c1f3d";
        } else if (assetType === "stock") {
          bodyColor = "#7c3aed";
          accentColor = "#a78bfa";
          visorColor = "#1a0f30";
        } else {
          // Gold
          bodyColor = "#d97706";
          accentColor = "#fbbf24";
          visorColor = "#2d1600";
        }
      }

      const botStartX = (CANVAS_SIZE - BOT_W) / 2 + (glitchActive ? glitchShiftX : 0);
      const botStartY = (CANVAS_SIZE - BOT_H) / 2 + curFloatY;

      // Translate context to center, apply squash/stretch breathing, and translate back
      ctx.save();
      ctx.translate(CANVAS_SIZE / 2, CANVAS_SIZE / 2);
      ctx.scale(breatheScaleX, breatheScaleY);
      ctx.translate(-CANVAS_SIZE / 2, -CANVAS_SIZE / 2);

      activeGrid.forEach((row, rIdx) => {
        let renderY = botStartY + rIdx * P;

        if (glitchActive && Math.random() < 0.3) {
          renderY += (Math.random() - 0.5) * 1.5;
        }

        [...row].forEach((char, cIdx) => {
          const renderX = botStartX + cIdx * P;

          if (char === "X") {
            ctx.fillStyle = bodyColor;
            ctx.fillRect(renderX, renderY, P - 0.2, P - 0.2);
          } else if (char === "Y") {
            ctx.fillStyle = accentColor;
            ctx.fillRect(renderX, renderY, P - 0.2, P - 0.2);
          } else if (char === "V") {
            ctx.fillStyle = visorColor;
            ctx.fillRect(renderX, renderY, P - 0.2, P - 0.2);
          } else if (char === "L") {
            if (blinkFrames > 0) {
              ctx.fillStyle = visorColor;
              ctx.fillRect(renderX, renderY, P - 0.2, P - 0.2);
            } else {
              ctx.fillStyle = pupilColor;
              ctx.shadowColor = pupilColor;
              ctx.shadowBlur = isSignalState ? 5 : 2;
              ctx.fillRect(renderX + curEyeX, renderY + curEyeY, P - 0.2, P - 0.2);
              ctx.shadowBlur = 0;
            }
          }
        });
      });
      ctx.restore(); // Restore scale

      // 8. Cyberpunk Radar HUD Overlay
      ctx.restore(); // Stop circular clipping

      ctx.strokeStyle = cfg.tagColor;
      ctx.lineWidth = 1;
      ctx.globalAlpha = activeState === "offline" ? 0.2 : 0.45;

      // Dashed radar ring
      ctx.setLineDash([2, 8]);
      ctx.beginPath();
      ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Outer ticks
      ctx.globalAlpha = activeState === "offline" ? 0.1 : 0.3;
      ctx.beginPath();
      ctx.moveTo(CANVAS_SIZE / 2, 2);
      ctx.lineTo(CANVAS_SIZE / 2, 5);
      ctx.moveTo(CANVAS_SIZE / 2, CANVAS_SIZE - 2);
      ctx.lineTo(CANVAS_SIZE / 2, CANVAS_SIZE - 5);
      ctx.stroke();

      // Scanline sweep
      if (botEnabled) {
        scanlineY += 0.45;
        if (scanlineY > CANVAS_SIZE) scanlineY = 0;

        ctx.fillStyle = cfg.tagColor;
        ctx.globalAlpha = 0.08;
        ctx.fillRect(0, scanlineY, CANVAS_SIZE, 1.5);
      }
      ctx.globalAlpha = 1.0;

      animId = requestAnimationFrame(run);
    };

    animId = requestAnimationFrame(run);

    return () => cancelAnimationFrame(animId);
  }, [botEnabled, flash, assetType]);

  return (
    <Stack sx={{ alignItems: "center", flexShrink: 0 }}>
      <Box sx={{
        position: "relative",
        width: 75,
        height: 75,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(circle, rgba(16, 24, 48, 0.45) 0%, rgba(4, 8, 16, 0.95) 100%)",
        border: `1.5px solid ${tagColor}30`,
        boxShadow: `inset 0 0 10px rgba(0,0,0,0.9), 0 0 15px -3px ${tagColor}15`,
        overflow: "hidden",
        transition: "all 0.5s ease",
      }}>
        <canvas ref={canvasRef} style={{ display: "block" }} />
      </Box>

      {/* State label */}
      <Typography sx={{
        fontFamily: "monospace",
        fontSize: "0.52rem",
        fontWeight: 800,
        color: tagColor,
        letterSpacing: "0.08em",
        mt: 0.75,
        lineHeight: 1,
        textShadow: `0 0 4px ${tagColor}40`,
        transition: "color 0.4s ease",
      }}>
        {tagText}
      </Typography>
    </Stack>
  );
}

// ──────────────────────────────────────────────
// SlotCapacity Indicator
// ──────────────────────────────────────────────
export function SlotCapacity({
  used,
  max,
  on,
  color,
  glowColor,
}: {
  used: number;
  max: number;
  on: boolean;
  color: string;
  glowColor: string;
}) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
      {Array.from({ length: max }).map((_, i) => {
        const isActive = i < used && on;
        return (
          <Box 
            key={i} 
            sx={{
              width: 14,
              height: 7,
              borderRadius: "3px",
              bgcolor: isActive ? color : "rgba(255, 255, 255, 0.03)",
              border: `1px solid ${isActive ? "transparent" : "rgba(255, 255, 255, 0.06)"}`,
              boxShadow: isActive ? `0 0 10px ${glowColor}` : "none",
              transition: "all 0.3s ease",
            }} 
          />
        );
      })}
    </Stack>
  );
}

export default PixelBotAvatar;
