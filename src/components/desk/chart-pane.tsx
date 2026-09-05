import { useEffect, useRef, useState } from "react";
import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesPrimitive,
  ISeriesMarkersPluginApi,
  SeriesAttachedParameter,
  SeriesMarker,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/market/types";
import type { OverlayFlags } from "@/lib/desk-store";
import { useDeskStore } from "@/lib/desk-store";
import type { Advice } from "@/lib/advisor";
import type { LocalSetup, SmcSnapshot, Zone } from "@/lib/smc/engine";
import { zoneReach } from "@/lib/smc/engine";
import { deltaOf } from "@/lib/smc/flow";
import { cn } from "@/lib/utils";

function token(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function drawVolumeCandles(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  chart: IChartApi,
  series: ISeriesApi<"Candlestick">,
  candles: Candle[],
  clear = false,
) {
  if (clear) ctx.clearRect(0, 0, width, height);
  const ts = chart.timeScale();
  const spacing = Math.max(3, (ts.options().barSpacing as number | undefined) ?? 8);
  const bodyW = Math.max(2.8, spacing * 0.64);
  const depth = Math.min(6, bodyW * 0.42);
  for (const c of candles) {
    const x = ts.timeToCoordinate(c.time as UTCTimestamp);
    if (x == null || x < -24 || x > width + 24) continue;
    const yO = series.priceToCoordinate(c.open);
    const yC = series.priceToCoordinate(c.close);
    const yH = series.priceToCoordinate(c.high);
    const yL = series.priceToCoordinate(c.low);
    if (yO == null || yC == null || yH == null || yL == null) continue;
    const up = c.close >= c.open;
    const top = Math.min(yO, yC);
    const bot = Math.max(yO, yC);
    const h = Math.max(1.8, bot - top);
    const left = x - bodyW / 2;
    ctx.strokeStyle = up ? "rgba(180,255,220,1)" : "rgba(255,180,180,1)";
    ctx.lineWidth = Math.max(1.4, spacing * 0.14);
    ctx.beginPath();
    ctx.moveTo(x, yH);
    ctx.lineTo(x, yL);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(left + bodyW, top);
    ctx.lineTo(left + bodyW + depth, top - depth);
    ctx.lineTo(left + bodyW + depth, bot - depth);
    ctx.lineTo(left + bodyW, bot);
    ctx.closePath();
    ctx.fillStyle = up ? "rgba(12,70,40,0.95)" : "rgba(80,16,16,0.95)";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left + depth, top - depth);
    ctx.lineTo(left + bodyW + depth, top - depth);
    ctx.lineTo(left + bodyW, top);
    ctx.closePath();
    ctx.fillStyle = up ? "rgba(190,255,220,0.95)" : "rgba(255,190,190,0.92)";
    ctx.fill();
    const g = ctx.createLinearGradient(left, top, left + bodyW, bot);
    if (up) {
      g.addColorStop(0, "#f2fff8");
      g.addColorStop(0.35, "#6affb0");
      g.addColorStop(1, "#148a48");
    } else {
      g.addColorStop(0, "#ffe0e0");
      g.addColorStop(0.35, "#ff6a6a");
      g.addColorStop(1, "#8a1818");
    }
    ctx.fillStyle = g;
    ctx.fillRect(left, top, bodyW, h);
    ctx.strokeStyle = up ? "rgba(240,255,246,0.85)" : "rgba(255,230,230,0.75)";
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, bodyW, h);
  }
}

function paintPathArrow(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  width: number,
  blink: boolean,
) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 24) return;
  const fade = blink ? 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(Date.now() / 260)) : 1;
  const ang = Math.atan2(dy, dx);
  const head = Math.max(14, width * 2.2);
  const ux = dx / len;
  const uy = dy / len;
  const bx = x1 - ux * head;
  const by = y1 - uy * head;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = blink ? 16 : 8;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + (dy > 0 ? 8 : -8), bx, by);
  ctx.stroke();
  ctx.translate(x1, y1);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-head, head * 0.42);
  ctx.lineTo(-head * 0.72, 0);
  ctx.lineTo(-head, -head * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPathArrows(
  ctx: CanvasRenderingContext2D,
  width: number,
  chart: IChartApi,
  series: ISeriesApi<"Candlestick">,
  snap: SmcSnapshot | null,
  order: Advice | null,
  setup: LocalSetup | null,
  lastTime: number,
) {
  if (!snap) return;
  const yNow = series.priceToCoordinate(snap.lastClose);
  if (yNow == null) return;
  const ts = chart.timeScale();
  const scaleW = typeof ts.width === "function" ? ts.width() : width - 64;
  const lastX = ts.timeToCoordinate(lastTime as UTCTimestamp) ?? Math.max(80, (scaleW || width) - 140);
  const xStart = lastX;
  const atr = snap.atr || Math.abs(snap.lastClose) * 0.002;
  let shortDir: "up" | "down" | null = null;
  if (snap.boxVector && snap.boxVector.dir !== "none") shortDir = snap.boxVector.dir;
  else if (snap.bias === "bullish") shortDir = "up";
  else if (snap.bias === "bearish") shortDir = "down";
  if (shortDir) {
    const magnet = snap.boxVector?.magnet ?? snap.sweepFuel?.target ?? (shortDir === "up" ? snap.lastClose + atr : snap.lastClose - atr);
    const yMag = series.priceToCoordinate(magnet) ?? yNow + (shortDir === "up" ? -80 : 80);
    const xEnd = Math.min((scaleW || width) - 18, xStart + 92);
    paintPathArrow(ctx, xStart, yNow, xEnd, yMag, shortDir === "up" ? "#4dffb0" : "#ff5a5a", 4.2, true);
  }
  if (order?.action === "long" || order?.action === "short") {
    const up = order.action === "long";
    const tgt = setup?.targets[0] ?? (up ? snap.lastClose + atr * 1.8 : snap.lastClose - atr * 1.8);
    const yT = series.priceToCoordinate(tgt) ?? yNow + (up ? -140 : 140);
    const xEnd = Math.min((scaleW || width) - 10, xStart + 150);
    paintPathArrow(ctx, xStart + 6, yNow, xEnd, yT, up ? "#8affc8" : "#ff8888", 8.5, false);
  }
}

function pulseRings(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, strong = true) {
  const beat = 0.5 + 0.5 * Math.sin(Date.now() / 200);
  const rings = strong ? 3 : 2;
  for (let r = 1; r <= rings; r++) {
    ctx.beginPath();
    ctx.arc(x, y, 8 + r * (strong ? 8 : 5) * beat, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.globalAlpha = (1 - r / (rings + 1)) * (0.3 + 0.7 * beat);
    ctx.lineWidth = strong ? 2.6 : 1.8;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(x, y, 6 + 4 * beat, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.5 + 0.5 * beat;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#1a1208";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawCreature(
  ctx: CanvasRenderingContext2D,
  kind: "bull" | "bear",
  lively: boolean,
  now: number,
) {
  const t = now / 1000;
  const bounce = Math.sin(t * (lively ? 5.2 : 2.4)) * (lively ? 6 : 2.5);
  const wave = lively ? 0.15 + Math.sin(t * 7.5) * 0.85 : Math.sin(t * 1.6) * 0.18;
  const blink = Math.sin(t * 2.1) > 0.92;
  const smile = lively ? 0.9 : 0.45;
  ctx.save();
  ctx.translate(0, bounce);
  ctx.scale(lively ? 1.05 : 0.95, lively ? 1.05 : 0.95);

  if (kind === "bull") {
    ctx.fillStyle = "#6a4814";
    ctx.beginPath();
    ctx.ellipse(-14, 18, 7, 12, -0.2, 0, Math.PI * 2);
    ctx.ellipse(10, 18, 7, 12, 0.15, 0, Math.PI * 2);
    ctx.fill();
    const body = ctx.createRadialGradient(-6, -4, 4, 0, 6, 28);
    body.addColorStop(0, "#f0d48a");
    body.addColorStop(1, "#a06a18");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 6, 22, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c48a28";
    ctx.beginPath();
    ctx.ellipse(0, -14, 16, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f6e0a8";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-12, -22);
    ctx.quadraticCurveTo(-22, -36, -8, -24);
    ctx.moveTo(12, -22);
    ctx.quadraticCurveTo(22, -36, 8, -24);
    ctx.stroke();
    ctx.save();
    ctx.translate(18, -2);
    ctx.rotate(-0.4 + wave);
    ctx.fillStyle = "#d4a040";
    ctx.beginPath();
    ctx.ellipse(10, 0, 11, 6, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5a3810";
    ctx.beginPath();
    ctx.ellipse(20, 0, 5, 6, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#1a1208";
    if (blink) {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-7, -16);
      ctx.lineTo(-3, -16);
      ctx.moveTo(3, -16);
      ctx.lineTo(7, -16);
      ctx.strokeStyle = "#1a1208";
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(-5, -16, 2.2, 0, Math.PI * 2);
      ctx.arc(5, -16, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#3a2208";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, -10, 6, 0.15, Math.PI - 0.15);
    ctx.stroke();
    ctx.strokeStyle = "#8a6020";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-20, 4);
    ctx.quadraticCurveTo(-32, 4 + Math.sin(t * 8) * 8, -26, 14);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#3a2414";
    ctx.beginPath();
    ctx.ellipse(-12, 18, 8, 11, -0.15, 0, Math.PI * 2);
    ctx.ellipse(12, 18, 8, 11, 0.15, 0, Math.PI * 2);
    ctx.fill();
    const fur = ctx.createRadialGradient(-4, -2, 6, 2, 8, 30);
    fur.addColorStop(0, "#c48448");
    fur.addColorStop(1, "#5a3010");
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.ellipse(0, 6, 24, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -12, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-13, -24, 7, 0, Math.PI * 2);
    ctx.arc(13, -24, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8c090";
    ctx.beginPath();
    ctx.ellipse(0, -8, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a1810";
    ctx.beginPath();
    ctx.arc(0, -8, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(16, 0);
    ctx.rotate(-0.3 + wave);
    ctx.fillStyle = "#8a4a20";
    ctx.beginPath();
    ctx.ellipse(12, 2, 12, 7, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f0c8a0";
    ctx.beginPath();
    ctx.arc(22, 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#1a1208";
    if (blink) {
      ctx.strokeStyle = "#1a1208";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, -16);
      ctx.lineTo(-3, -16);
      ctx.moveTo(3, -16);
      ctx.lineTo(8, -16);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(-6, -16, 2.4, 0, Math.PI * 2);
      ctx.arc(6, -16, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#2a1408";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    if (smile > 0.6) ctx.arc(0, -6, 7, 0.25, Math.PI - 0.25);
    else ctx.arc(0, -5, 5, 0.4, Math.PI - 0.4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawZones(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  chart: IChartApi,
  series: ISeriesApi<"Candlestick">,
  zones: Zone[],
  overlays: OverlayFlags,
  snap: SmcSnapshot | null,
  setup?: LocalSetup | null,
  order?: Advice | null,
  lastTime = 0,
  wipe = true,
  candles: Candle[] = [],
  pair = "",
  faceI = 0,
) {
  if (width < 16 || height < 16) return;
  if (wipe) ctx.clearRect(0, 0, width, height);
  const ts = chart.timeScale();
  const plotW = Math.max(40, width - 58);
  const notes: { time: number; price: number; text: string; tone: string }[] = [];
  const busy: { x: number; y: number; w: number; h: number }[] = [];
  const occupy = (x: number, y: number, w: number, h: number) => busy.push({ x, y, w, h });
  occupy(plotW * 0.28, 4, plotW * 0.44, 40);
  occupy(Math.min(plotW * 0.38, 360), 44, plotW - Math.min(plotW * 0.38, 360) - 12, 40);
  const PALETTE: Record<string, { top: string; mid: string; stroke: string; b0: string; b1: string; t0: string; t1: string }> = {
    fvg: { top: "rgba(255,186,40,0.16)", mid: "rgba(255,230,120,0.28)", stroke: "#ffe070", b0: "#fff3b0", b1: "#c48410", t0: "#fff6c8", t1: "#7a4a00" },
    ob: { top: "rgba(20,170,90,0.16)", mid: "rgba(90,255,160,0.28)", stroke: "#7dffc0", b0: "#c8ffdc", b1: "#0e7a40", t0: "#e8fff0", t1: "#0a4a24" },
    obBear: { top: "rgba(210,40,50,0.16)", mid: "rgba(255,110,110,0.28)", stroke: "#ff8888", b0: "#ffd0d0", b1: "#a01818", t0: "#ffe8e8", t1: "#6a0808" },
    liq: { top: "rgba(170,220,40,0.14)", mid: "rgba(230,255,120,0.24)", stroke: "#d8ff50", b0: "#f0ffb0", b1: "#6a8a10", t0: "#f6ffd0", t1: "#3a5208" },
    sweep: { top: "rgba(255,160,20,0.22)", mid: "rgba(255,210,80,0.34)", stroke: "#ffc040", b0: "#ffe090", b1: "#b06000", t0: "#fff0c0", t1: "#6a3800" },
    choch: { top: "rgba(120,90,255,0.50)", mid: "rgba(190,170,255,0.74)", stroke: "#c8b4ff", b0: "#ece0ff", b1: "#4a30b0", t0: "#f6f0ff", t1: "#2a1878" },
    vec: { top: "rgba(20,190,200,0.46)", mid: "rgba(100,240,250,0.70)", stroke: "#40e8f0", b0: "#c8ffff", b1: "#087878", t0: "#e8ffff", t1: "#045050" },
    entry: { top: "rgba(232,190,80,0.44)", mid: "rgba(255,220,140,0.68)", stroke: "#f0c860", b0: "#fff0b8", b1: "#a07018", t0: "#fff8d8", t1: "#5a4010" },
    stop: { top: "rgba(220,50,50,0.44)", mid: "rgba(255,120,120,0.66)", stroke: "#ff7070", b0: "#ffd0d0", b1: "#901818", t0: "#fff0f0", t1: "#5a0808" },
    tp: { top: "rgba(30,170,100,0.44)", mid: "rgba(110,230,160,0.66)", stroke: "#50e090", b0: "#c8ffdc", b1: "#0e7040", t0: "#e8fff0", t1: "#0a4020" },
    wait: { top: "rgba(160,160,180,0.32)", mid: "rgba(210,210,230,0.52)", stroke: "#c0c0d0", b0: "#f0f0f8", b1: "#505068", t0: "#ffffff", t1: "#303048" },
    margin: { top: "rgba(201,160,90,0.10)", mid: "rgba(240,210,140,0.18)", stroke: "#d4b070", b0: "#f8e8c0", b1: "#8a6020", t0: "#fff8e0", t1: "#5a3810" },
    pat: { top: "rgba(80,140,220,0.40)", mid: "rgba(150,190,255,0.64)", stroke: "#80b8ff", b0: "#d8e8ff", b1: "#2058a8", t0: "#f0f6ff", t1: "#103868" },
  };
  const fillVolume = (x: number, y: number, w: number, h: number, tone: string, blink = false) => {
    const p = PALETTE[tone] ?? PALETTE.fvg!;
    const pulse = blink ? 0.42 + 0.16 * (0.5 + 0.5 * Math.sin(Date.now() / 260)) : 0.72;
    ctx.save();
    ctx.globalAlpha = pulse;
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, p.top);
    g.addColorStop(0.42, p.mid);
    g.addColorStop(1, p.top);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = p.stroke;
    ctx.lineWidth = blink ? 2.2 : 1.6;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.38)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 1, y + h - 1);
    ctx.lineTo(x + 1, y + 1);
    ctx.lineTo(x + w - 1, y + 1);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.moveTo(x + 1, y + h - 1);
    ctx.lineTo(x + w - 1, y + h - 1);
    ctx.lineTo(x + w - 1, y + 1);
    ctx.stroke();
  };
  const mark = (time: number, price: number, text: string, tone: string) => {
    if (notes.some((n) => n.text === text && Math.abs(n.price - price) < 1e-8)) return;
    notes.push({ time, price, text, tone });
  };
  const band = (price: number, stroke: string, label: string) => {
    const y = series.priceToCoordinate(price);
    if (y == null) return;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(plotW, y);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  if (overlays.margin !== false && snap) {
    const paint = (top: number, bottom: number, fill: string, stroke: string, label: string) => {
      const y1 = series.priceToCoordinate(top);
      const y2 = series.priceToCoordinate(bottom);
      if (y1 == null || y2 == null) return;
      const y = Math.min(y1, y2);
      const h = Math.max(4, Math.abs(y2 - y1));
      fillVolume(0, y, plotW, Math.max(16, h), "margin", label.includes("цена"));
      if (label.includes("цена")) mark(lastTime, (top + bottom) / 2, "Маржа", "margin");
      occupy(0, y, plotW * 0.45, h);
    };
    paint(
      snap.margin.upper.top,
      snap.margin.upper.bottom,
      "rgba(181,122,122,0.10)",
      "rgba(201,184,150,0.45)",
      snap.margin.upper.active ? "маржа верх (цена здесь)" : "маржа верх",
    );
    paint(
      snap.margin.lower.top,
      snap.margin.lower.bottom,
      "rgba(111,158,134,0.10)",
      "rgba(201,184,150,0.45)",
      snap.margin.lower.active ? "маржа низ (цена здесь)" : "маржа низ",
    );
  }

  if (overlays.fvg || overlays.ob) {
    const last = snap?.lastClose ?? 0;
    const atr = snap?.atr ?? 0;
    const dist = (z: Zone) => zoneReach(z, last, atr) ?? Number.POSITIVE_INFINITY;
    const liveOb = zones.filter((z) => z.kind !== "fvg" && zoneReach(z, last, atr) != null);
    const liveFvg = zones.filter((z) => z.kind === "fvg" && !z.mitigated);
    const lastPx = last || snap?.lastClose || 0;
    const nearFvg = [...liveFvg].sort(
      (a, b) => Math.abs((a.top + a.bottom) / 2 - lastPx) - Math.abs((b.top + b.bottom) / 2 - lastPx),
    );
    const picked = [
      ...(overlays.fvg ? nearFvg.slice(0, 2) : []),
      ...(overlays.ob
        ? liveOb.filter((z) => z.kind === "ob" || z.kind === "breaker" || z.kind === "mitigation").sort((a, b) => dist(a) - dist(b)).slice(0, 3)
        : []),
    ];
    for (const z of picked) {
      const x1 = ts.timeToCoordinate(z.startTime as UTCTimestamp) ?? 8;
      const left = Math.max(4, x1);
      const xEnd = ts.timeToCoordinate(z.endTime as UTCTimestamp);
      const imb = z.kind === "fvg";
      const zw = imb
        ? Math.max(36, Math.min(plotW - left - 24, (xEnd != null ? xEnd - left : 70) + 48))
        : Math.max(80, plotW - left - 8);
      const y1 = series.priceToCoordinate(z.top);
      const y2 = series.priceToCoordinate(z.bottom);
      if (y1 == null || y2 == null) continue;
      const top = Math.min(y1, y2);
      const h = Math.max(imb ? 6 : 14, Math.abs(y2 - y1));
      const bull = z.side === "bull";
      const broken =
        z.kind === "breaker" ||
        (z.kind === "ob" && (z.side === "bull" ? lastPx < z.bottom : lastPx > z.top));
      const tone = imb ? "fvg" : broken ? "choch" : bull ? "ob" : "obBear";
      const near = !imb && dist(z) <= (atr || 1) * 0.9;
      fillVolume(left, top, zw, h, tone, near);
      occupy(left, top, zw, h);
      const inside = imb ? "Имбаланс" : broken ? "Брейкер блок" : z.kind === "mitigation" ? "Митигейшн" : "Ордерблок";
      const note = broken ? "ордерблок пробит" : z.kind === "mitigation" ? "возврат в блок" : "";
      const pal = PALETTE[tone] ?? PALETTE.fvg!;
      if (zw >= 86 && h >= 20) {
        ctx.save();
        ctx.font = `700 ${Math.min(18, Math.max(11, h * 0.42))}px IBM Plex Sans, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const label = inside;
        let size = Math.min(18, Math.max(11, h * 0.42));
        ctx.font = `700 ${size}px IBM Plex Sans, sans-serif`;
        while (size > 10 && ctx.measureText(label).width > zw - 16) {
          size -= 1;
          ctx.font = `700 ${size}px IBM Plex Sans, sans-serif`;
        }
        if (ctx.measureText(label).width <= zw - 12) {
          ctx.strokeStyle = "rgba(8,6,4,0.55)";
          ctx.lineWidth = 3.5;
          ctx.strokeText(label, left + zw / 2, top + h / 2);
          const lg = ctx.createLinearGradient(left, top, left, top + h);
          lg.addColorStop(0, pal.t0);
          lg.addColorStop(1, pal.t1);
          ctx.fillStyle = lg;
          ctx.fillText(label, left + zw / 2, top + h / 2);
        }
        ctx.restore();
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }
      if (note) mark(z.startTime, (z.top + z.bottom) / 2, note, tone);
      else if (zw < 86 || h < 20) mark(z.startTime, (z.top + z.bottom) / 2, inside, tone);
    }
  }

  if (overlays.structure !== false && snap) {
    const lastCh = [...snap.events].reverse().find((e) => e.kind === "CHoCH" && Math.abs(e.price - snap.lastClose) <= snap.atr * 1.4);
    if (lastCh) {
      const y = series.priceToCoordinate(lastCh.price);
      const x = ts.timeToCoordinate(lastCh.time as UTCTimestamp);
      if (y != null && x != null) {
        ctx.strokeStyle = PALETTE.choch!.stroke;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(plotW, y);
        ctx.stroke();
        mark(lastCh.time, lastCh.price, lastCh.side === "bull" ? "CHoCH вверх" : "CHoCH вниз", "choch");
      }
    }
  }

  if (overlays.liquidity && snap) {
    const atr = snap.atr || 1;
    const last = snap.lastClose;
    const dLiq = (p: (typeof snap.liquidity)[number]) => Math.abs(last - p.price);
    const near = snap.liquidity.filter((p) => dLiq(p) <= atr * 1.4);
    const taken = (l: (typeof snap.liquidity)[number]) => l.sweptTime != null;
    const bsl = [...near].filter((l) => l.side === "buy" && !taken(l)).sort((a, b) => dLiq(a) - dLiq(b))[0];
    const ssl = [...near].filter((l) => l.side === "sell" && !taken(l)).sort((a, b) => dLiq(a) - dLiq(b))[0];
    const sweep = [...near].filter((l) => taken(l)).sort((a, b) => dLiq(a) - dLiq(b))[0];
    const live = [bsl, ssl].filter(Boolean) as typeof snap.liquidity;
    const drawn = [...live.slice(0, 2), ...(sweep && !live.some((l) => Math.abs(l.price - sweep.price) < atr * 0.15) ? [sweep] : [])];
    for (const pool of drawn) {
      const y = series.priceToCoordinate(pool.price);
      const yPad = series.priceToCoordinate(pool.price + (pool.side === "buy" ? snap.atr * 0.35 : -snap.atr * 0.35));
      const x0 = ts.timeToCoordinate(pool.time as UTCTimestamp) ?? plotW * 0.45;
      const hit = pool.sweptTime != null;
      const xEnd = hit
        ? (ts.timeToCoordinate(pool.sweptTime as UTCTimestamp) ?? x0 + 40)
        : (ts.timeToCoordinate(lastTime as UTCTimestamp) ?? plotW - 8);
      if (y == null || yPad == null) continue;
      const top = Math.min(y, yPad);
      const h = Math.max(16, Math.abs(yPad - y));
      const w = Math.max(110, hit ? xEnd - x0 : plotW - Math.max(0, x0) - 8);
      fillVolume(x0, top, w, h, hit ? "sweep" : "liq", !hit);
      occupy(x0, top, w, h);
      ctx.strokeStyle = hit ? "rgba(232, 160, 60, 0.75)" : "rgba(80, 120, 180, 0.7)";
      ctx.setLineDash(hit ? [5, 4] : []);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      mark(hit ? pool.sweptTime! : pool.time, pool.price, hit ? "Съём" : "Ликвидность", hit ? "sweep" : "liq");
    }
    const fuel = snap.sweepFuel;
    if (fuel) {
      const label = fuel.grade === "strong" ? "Откат сильный" : fuel.grade === "mid" ? "Откат средний" : "Откат слабый";
      mark(fuel.takeTime, fuel.takePrice, label, fuel.reverse === "up" ? "tp" : "stop");
      if (fuel.target != null) mark(lastTime, fuel.target, "Куда вернут после съёма", "entry");
    }
  }

  if (snap?.cdTape?.live) {
    const book = snap.cdTape.book;
    const maxV = Math.max(1, ...book.map((l) => l.volume));
    for (const l of book) {
      const y = series.priceToCoordinate(l.price);
      if (y == null) continue;
      const w = 10 + (l.volume / maxV) * 42;
      const h = 7;
      const x = plotW - w - 2;
      ctx.fillStyle = l.side === "bid" ? "rgba(50,200,120,0.45)" : "rgba(230,80,80,0.45)";
      ctx.fillRect(x, y - h / 2, w, h);
      ctx.strokeStyle = l.side === "bid" ? "rgba(120,255,180,0.8)" : "rgba(255,140,140,0.8)";
      ctx.strokeRect(x, y - h / 2, w, h);
    }
    if (book[0]) mark(lastTime, book[0].price, book[0].side === "bid" ? "Стакан бид" : "Стакан аск", book[0].side === "bid" ? "ob" : "obBear");
  }

  if (snap && snap.boxVector && snap.boxVector.dir !== "none" && snap.boxVector.magnet != null) {
    mark(lastTime, snap.boxVector.magnet, snap.boxVector.dir === "up" ? "Вектор вверх" : "Вектор вниз", "vec");
  }

  if (overlays.patterns !== false && snap) {
    for (const p of snap.patterns) {
      if (p.points.length < 2) continue;
      const tone = p.family === "harmonic" ? "pat" : p.side === "bull" ? "ob" : "obBear";
      const pal = PALETTE[tone] ?? PALETTE.pat!;
      const coords: { x: number; y: number; label: string; time: number; price: number }[] = [];
      for (const pt of p.points) {
        const x = ts.timeToCoordinate(pt.time as UTCTimestamp);
        const y = series.priceToCoordinate(pt.price);
        if (x == null || y == null) continue;
        coords.push({ x, y, label: pt.label, time: pt.time, price: pt.price });
      }
      if (coords.length < 2) continue;
      ctx.strokeStyle = pal.stroke;
      ctx.lineWidth = p.family === "harmonic" ? 2.4 : 2;
      ctx.setLineDash(p.family === "harmonic" ? [] : [7, 4]);
      ctx.shadowColor = pal.stroke;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      coords.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
      if (coords.length >= 3) {
        ctx.strokeStyle = pal.stroke;
        ctx.globalAlpha = 0.45;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(coords[0]!.x, coords[0]!.y);
        ctx.lineTo(coords.at(-1)!.x, coords.at(-1)!.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      for (const c of coords) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = pal.b0;
        ctx.fill();
        ctx.strokeStyle = pal.stroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = "600 10px IBM Plex Sans, sans-serif";
        ctx.strokeStyle = "rgba(8,8,10,0.7)";
        ctx.lineWidth = 3;
        ctx.strokeText(c.label, c.x + 7, c.y - 7);
        const lg = ctx.createLinearGradient(c.x, c.y - 14, c.x, c.y);
        lg.addColorStop(0, pal.t0);
        lg.addColorStop(1, pal.t1);
        ctx.fillStyle = lg;
        ctx.fillText(c.label, c.x + 7, c.y - 7);
      }
      const lastPt = coords.at(-1)!;
      mark(lastPt.time, lastPt.price, p.name, tone);
    }
  }

  if (setup && (setup.entry != null || setup.stop != null)) {
    const liveOrd = order?.action === "long" || order?.action === "short";
    if (setup.entry != null) {
      band(setup.entry, "rgba(232,210,160,0.9)", liveOrd ? "вход приказа" : "зона диспетчера");
      const y = series.priceToCoordinate(setup.entry);
      if (y != null) mark(lastTime, setup.entry, liveOrd ? "Вход" : "Зона", "entry");
    }
    if (setup.stop != null) {
      band(setup.stop, "rgba(220,150,150,0.9)", "стоп");
      const y = series.priceToCoordinate(setup.stop);
      if (y != null) mark(lastTime, setup.stop, "Стоп", "stop");
    }
    setup.targets.slice(0, 1).forEach((t) => {
      band(t, "rgba(150,210,180,0.9)", "тейк 1");
      const y = series.priceToCoordinate(t);
      if (y != null) mark(lastTime, t, "Тейк", "tp");
    });
  }

  if (snap) {
    const yNow = series.priceToCoordinate(snap.lastClose);
    if (yNow != null) {
      const t = order?.action === "long" ? "Лонг" : order?.action === "short" ? "Шорт" : "Ждут";
      mark(lastTime, snap.lastClose, t, t === "Лонг" ? "tp" : t === "Шорт" ? "stop" : "wait");
    }
  }

  if (candles.length) drawVolumeCandles(ctx, width, height, chart, series, candles, false);

  ctx.font = "13px IBM Plex Sans, sans-serif";
  const hits = (box: { x: number; y: number; w: number; h: number }) =>
    busy.some(
      (b) => box.x < b.x + b.w + 8 && box.x + box.w + 8 > b.x && box.y < b.y + b.h + 8 && box.y + box.h + 8 > b.y,
    );
  const shown = notes.slice(0, 8);
  const tick = Date.now();
  for (const n of shown) {
    const ax = ts.timeToCoordinate(n.time as UTCTimestamp);
    const ay = series.priceToCoordinate(n.price);
    if (ax == null || ay == null) continue;
    const lines = n.text.split("|");
    ctx.font = "600 13px IBM Plex Sans, sans-serif";
    const lineW = Math.max(...lines.map((l) => ctx.measureText(l).width), 80);
    const bw = Math.min(220, lineW + 22);
    const bh = lines.length > 1 ? 48 : 34;
    const candidates = [
      { x: ax + 28, y: ay + 22 },
      { x: ax + 28, y: ay - bh - 22 },
      { x: ax - bw - 20, y: ay + 16 },
      { x: ax - bw - 20, y: ay - bh - 16 },
      { x: ax + 48, y: ay + 40 },
    ];
    let placed: { x: number; y: number } | null = null;
    for (const c of candidates) {
      const box = { x: c.x, y: Math.max(8, Math.min(height - bh - 8, c.y)), w: bw, h: bh };
      if (hits(box)) continue;
      placed = { x: box.x, y: box.y };
      break;
    }
    if (!placed) continue;
    const bx = placed.x;
    const by = placed.y;
    occupy(bx, by, bw, bh);
    const pal = PALETTE[n.tone] ?? PALETTE.fvg!;
    const cx = bx + bw / 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(cx - 8, by + (ay < by ? 0 : bh));
    ctx.lineTo(cx + 8, by + (ay < by ? 0 : bh));
    ctx.closePath();
    ctx.fillStyle = pal.b0;
    ctx.fill();
    ctx.strokeStyle = pal.stroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    const r = 8;
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + bw - r, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
    ctx.lineTo(bx + bw, by + bh - r);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
    ctx.lineTo(bx + r, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
    ctx.lineTo(bx, by + r);
    ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath();
    const hot =
      n.tone === "sweep" ||
      n.tone === "tp" ||
      n.tone === "stop" ||
      n.tone === "choch" ||
      /ВЛИВАНИЕ|СПЛЭШ|Имбаланс|Лонг|Шорт|Брейкер/.test(n.text);
    const beat = hot ? 0.82 + 0.18 * Math.sin(tick / 260) : 1;
    ctx.globalAlpha = beat;
    ctx.shadowColor = hot ? pal.stroke : "rgba(0,0,0,0.45)";
    ctx.shadowBlur = hot ? 18 + 8 * Math.sin(tick / 260) : 14;
    ctx.shadowOffsetY = 5;
    const g = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    g.addColorStop(0, pal.b0);
    g.addColorStop(0.45, pal.b1);
    g.addColorStop(1, pal.b0);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = pal.stroke;
    ctx.lineWidth = hot ? 2 : 1.5;
    ctx.stroke();
    const slide = ((tick / 18) % (bw + 50)) - 25;
    const shine = ctx.createLinearGradient(bx + slide - 20, by, bx + slide + 40, by + bh);
    shine.addColorStop(0, "rgba(255,255,255,0)");
    shine.addColorStop(0.45, "rgba(255,248,220,0.38)");
    shine.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = shine;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = "600 13px IBM Plex Sans, sans-serif";
    lines.forEach((line, i) => {
      const tw = ctx.measureText(line).width;
      const tx = bx + (bw - tw) / 2;
      const ty = by + (lines.length > 1 ? 20 + i * 16 : 22);
      ctx.strokeStyle = "rgba(20,12,4,0.55)";
      ctx.lineWidth = 3.2;
      ctx.lineJoin = "round";
      ctx.strokeText(line, tx, ty);
      const tg = ctx.createLinearGradient(tx, ty - 12, tx, ty + 4);
      tg.addColorStop(0, pal.t0);
      tg.addColorStop(1, pal.t1);
      ctx.fillStyle = tg;
      ctx.fillText(line, tx, ty);
    });
  }

  const cd = snap?.cdTape;
  if (cd?.live && snap) {
    const scaleLeft = plotW - 8;
    const chipW = 200;
    const chipH = 42;
    const bars = cd.bars?.length ? cd.bars : [{ time: lastTime, volume: cd.volume ?? 0, delta: cd.delta ?? 0, ask: cd.ask ?? 0, bid: cd.bid ?? 0, splash: cd.splash, infusion: cd.infusion, imbalance: false }];
    const lastIx = bars.length - 1;
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i]!;
      const candle = candles.find((c) => Math.abs(c.time - bar.time) < 3600) ?? (i === lastIx ? candles.at(-1) : undefined);
      if (!candle) continue;
      const ax = ts.timeToCoordinate(candle.time as UTCTimestamp);
      const ay = series.priceToCoordinate(candle.close);
      if (ax == null || ay == null) continue;
      if (ax < 12 || ax > scaleLeft - 8) continue;
      const notable = bar.splash || bar.infusion || bar.imbalance || i === lastIx;
      const col = bar.splash ? "#ffb020" : bar.infusion ? "#c8f030" : bar.imbalance ? "#ff6a6a" : "#e8c070";
      const beat = 0.5 + 0.5 * Math.sin(Date.now() / 200);
      const blink = bar.splash || bar.infusion || i === lastIx;
      if (blink) {
        for (let r = 1; r <= 3; r++) {
          ctx.beginPath();
          ctx.arc(ax, ay, 10 + r * 7 * beat, 0, Math.PI * 2);
          ctx.strokeStyle = col;
          ctx.globalAlpha = (1 - r / 4) * (0.35 + 0.65 * beat);
          ctx.lineWidth = 2.4;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      ctx.arc(ax, ay, notable ? 8 + 5 * (blink ? beat : 0) : 5, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.globalAlpha = blink ? 0.55 + 0.45 * beat : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#1a1208";
      ctx.stroke();
      if (!notable) continue;
      const title = bar.splash ? "СПЛЭШ" : bar.infusion ? "ВЛИВАНИЕ" : i === lastIx ? "CD" : "ASK/BID";
      const sub = i === lastIx
        ? `V ${Math.round(bar.volume)}  Δ ${Math.round(bar.delta)}  A ${Math.round(bar.ask)}  B ${Math.round(bar.bid)}`
        : bar.splash
          ? "вынос стопов, не цель"
          : bar.infusion
            ? "цель / остановка"
            : `A ${Math.round(bar.ask)}  B ${Math.round(bar.bid)}`;
      const candidates = [
        { x: ax - chipW - 22, y: ay - chipH / 2 },
        { x: ax - chipW - 22, y: ay - chipH - 14 },
        { x: ax - chipW - 22, y: ay + 16 },
        { x: ax - chipW * 2 - 36, y: ay - chipH / 2 },
        { x: 10, y: ay - chipH / 2 },
      ];
      let box: { x: number; y: number } | null = null;
      for (const c of candidates) {
        const x = Math.max(8, Math.min(c.x, scaleLeft - chipW - 6));
        const y = Math.max(8, Math.min(c.y, height - chipH - 8));
        const b = { x, y, w: chipW, h: chipH };
        if (hits(b)) continue;
        box = { x, y };
        break;
      }
      if (!box) continue;
      occupy(box.x, box.y, chipW, chipH);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ax - 10, ay);
      ctx.lineTo(box.x + chipW, box.y + chipH / 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(12,10,8,0.92)";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(box.x, box.y, chipW, chipH, 10);
      else ctx.rect(box.x, box.y, chipW, chipH);
      ctx.fill();
      ctx.stroke();
      ctx.font = "bold 13px IBM Plex Sans, sans-serif";
      ctx.fillStyle = col;
      ctx.globalAlpha = bar.splash || bar.infusion ? 0.5 + 0.5 * beat : 1;
      ctx.fillText(title, box.x + 12, box.y + 16);
      ctx.globalAlpha = 1;
      ctx.font = "bold 12px IBM Plex Mono, monospace";
      ctx.fillStyle = "#fff6e0";
      ctx.fillText(sub, box.x + 12, box.y + 34);
    }
  }

  if (overlays.profile !== false && snap?.volumeProfile?.bins?.length) {
    const bins = snap.volumeProfile.bins;
    const maxV = Math.max(...bins.map((b) => b.volume), 1);
    const histW = 72;
    const x0 = plotW - histW - 4;
    occupy(x0, 8, histW, height - 16);
    ctx.fillStyle = "rgba(8,10,14,0.35)";
    ctx.fillRect(x0 - 4, 8, histW + 8, height - 16);
    for (const b of bins) {
      const y = series.priceToCoordinate(b.price);
      if (y == null) continue;
      const w = 6 + (b.volume / maxV) * (histW - 10);
      const pocish = Math.abs(b.price - snap.volumeProfile.poc) < snap.atr * 0.08;
      const dpocish = Math.abs(b.price - snap.volumeProfile.dpoc) < snap.atr * 0.08;
      ctx.fillStyle = dpocish ? "rgba(80,224,144,0.85)" : pocish ? "rgba(212,176,112,0.75)" : "rgba(180,170,150,0.38)";
      ctx.fillRect(x0 + histW - w, y - 4, w, 8);
    }
    const yPoc = series.priceToCoordinate(snap.volumeProfile.poc);
    if (yPoc != null) {
      ctx.strokeStyle = "rgba(212,176,112,0.7)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x0 - 8, yPoc);
      ctx.lineTo(plotW, yPoc);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const path = snap.volumeProfile.dpocPath ?? [];
    if (path.length > 1) {
      ctx.strokeStyle = "rgba(80,224,144,0.95)";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      let started = false;
      for (const p of path) {
        const x = ts.timeToCoordinate(p.time as UTCTimestamp);
        const y = series.priceToCoordinate(p.price);
        if (x == null || y == null || x > plotW - 8) continue;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      const lastP = path.at(-1)!;
      const lx = ts.timeToCoordinate(lastP.time as UTCTimestamp);
      const ly = series.priceToCoordinate(lastP.price);
      if (lx != null && ly != null && lx < plotW - 8) {
        ctx.beginPath();
        ctx.arc(lx, ly, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#50e090";
        ctx.fill();
        const lab = { x: Math.max(8, lx - 108), y: ly - 16, w: 96, h: 28 };
        if (!hits(lab) && lab.x + lab.w < plotW - 8) {
          occupy(lab.x, lab.y, lab.w, lab.h);
          ctx.fillStyle = "rgba(10,28,18,0.92)";
          ctx.strokeStyle = "#50e090";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(lab.x, lab.y, lab.w, lab.h, 8);
          else ctx.rect(lab.x, lab.y, lab.w, lab.h);
          ctx.fill();
          ctx.stroke();
          ctx.font = "bold 13px IBM Plex Sans, sans-serif";
          ctx.fillStyle = "#50e090";
          ctx.fillText("dPOC", lab.x + 10, lab.y + 19);
        }
      }
    }
  }

  const nowMs = Date.now();
  const pretty = pair.replace(/[^A-Za-z]/g, "").toUpperCase();
  const title = pretty.length === 6 ? `${pretty.slice(0, 3)} / ${pretty.slice(3)}` : pretty || "SLOI";
  ctx.font = "700 40px Cormorant Garamond, Times New Roman, serif";
  const tw = ctx.measureText(title).width;
  const tx = Math.max(8, (plotW - tw) / 2);
  const ty = 34;
  const slide = ((nowMs / 18) % Math.max(tw, 80)) / Math.max(tw, 80);
  const g = ctx.createLinearGradient(tx, ty - 28, tx + tw, ty);
  g.addColorStop(0, "#6a4a12");
  g.addColorStop(Math.max(0.04, slide - 0.15), "#e8c070");
  g.addColorStop(Math.min(0.96, slide), "#fff8e0");
  g.addColorStop(Math.min(1, slide + 0.15), "#e8c070");
  g.addColorStop(1, "#6a4a12");
  ctx.shadowColor = "rgba(240,200,120,0.45)";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#3a2208";
  ctx.fillText(title, tx + 2, ty + 2);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(20,12,4,0.7)";
  ctx.lineWidth = 5;
  ctx.strokeText(title, tx, ty);
  ctx.fillStyle = g;
  ctx.fillText(title, tx, ty);

  const lastEv = snap?.events.at(-1);
  const smart =
    snap?.micro.splash
      ? "крупняк снял стопы"
      : snap?.micro.infusion
        ? "крупняк набирает объём"
        : lastEv?.kind === "CHoCH" && lastEv.side === "bear"
          ? "крупняк сломал структуру вниз"
          : lastEv?.kind === "CHoCH" && lastEv.side === "bull"
            ? "крупняк сломал структуру вверх"
            : lastEv?.kind === "BOS" && lastEv.side === "bear"
              ? "крупняк давит вниз"
              : lastEv?.kind === "BOS" && lastEv.side === "bull"
                ? "крупняк толкает вверх"
                : snap?.sweepFuel
                  ? "сняли ликвидность"
                  : "крупняк в диапазоне";
  const vec = snap?.boxVector;
  const near = vec && vec.dir === "up" ? "в ближайшее время вверх" : vec && vec.dir === "down" ? "в ближайшее время вниз" : "ближайший ход боком";
  let tape = `Ждать · ${near} · ${smart} · входа нет`;
  if (order?.action === "long") tape = `Покупать · ${near} · ${smart}`;
  else if (order?.action === "short") tape = `Продавать · ${near} · ${smart}`;
  else if (order?.action === "skip") tape = `Не входить · ${near} · ${smart} · хода на спред мало`;
  tape = `${tape}     ·     ${tape}     ·     `;
  const tapeX = Math.min(plotW * 0.38, 368);
  const tapeBoxW = Math.max(180, plotW - tapeX - 16);
  const tapeY = 46;
  const tapeH = 36;
  const barG = ctx.createLinearGradient(tapeX, tapeY, tapeX, tapeY + tapeH);
  barG.addColorStop(0, "rgba(70,52,22,0.92)");
  barG.addColorStop(0.45, "rgba(22,16,10,0.9)");
  barG.addColorStop(1, "rgba(12,8,6,0.92)");
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = barG;
  ctx.fillRect(tapeX, tapeY, tapeBoxW, tapeH);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = "rgba(240,210,140,0.55)";
  ctx.lineWidth = 1.4;
  ctx.strokeRect(tapeX + 0.5, tapeY + 0.5, tapeBoxW - 1, tapeH - 1);
  ctx.strokeStyle = "rgba(255,248,220,0.22)";
  ctx.beginPath();
  ctx.moveTo(tapeX + 1, tapeY + 1);
  ctx.lineTo(tapeX + tapeBoxW - 1, tapeY + 1);
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.rect(tapeX + 6, tapeY, tapeBoxW - 12, tapeH);
  ctx.clip();
  ctx.font = "700 20px IBM Plex Sans, sans-serif";
  const tapeW = ctx.measureText(tape).width;
  const mx = -((nowMs / 16) % tapeW);
  const ty2 = tapeY + 25;
  const tg = ctx.createLinearGradient(tapeX + mx, ty2, tapeX + mx + tapeW, ty2);
  const pulse = 0.35 + 0.3 * Math.sin(nowMs / 400);
  tg.addColorStop(0, "#c4a060");
  tg.addColorStop(pulse, "#fff6dc");
  tg.addColorStop(1, "#c4a060");
  ctx.strokeStyle = "rgba(20,12,4,0.65)";
  ctx.lineWidth = 3.5;
  ctx.strokeText(tape, tapeX + 10 + mx, ty2);
  ctx.strokeText(tape, tapeX + 10 + mx + tapeW, ty2);
  ctx.fillStyle = tg;
  ctx.fillText(tape, tapeX + 10 + mx, ty2);
  ctx.fillText(tape, tapeX + 10 + mx + tapeW, ty2);
  ctx.restore();

  const action = order?.action;
  const kind: "bull" | "bear" =
    action === "short" || vec?.dir === "down" || snap?.bias === "bearish" ? "bear" : "bull";
  const lively = action === "long" || action === "short";
  const slot = { x: 28, y: Math.max(96, height - 132) };
  occupy(slot.x, slot.y - 12, 96, 96);
  ctx.save();
  ctx.translate(slot.x + 44, slot.y + 48);
  const beat = 0.5 + 0.5 * Math.sin(nowMs / 180);
  for (let r = 1; r <= 3; r++) {
    ctx.beginPath();
    ctx.arc(0, 8, 34 + r * 9 * beat, 0, Math.PI * 2);
    ctx.strokeStyle = kind === "bull" ? "rgba(232,190,80,0.35)" : "rgba(200,90,70,0.32)";
    ctx.globalAlpha = (1 - r / 4) * beat;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  drawCreature(ctx, kind, lively, nowMs);
  ctx.restore();
}

function drawProfile(
  canvas: HTMLCanvasElement,
  series: ISeriesApi<"Candlestick">,
  snap: SmcSnapshot | null,
  on: boolean,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  if (!on || !snap) return;
  const bins = snap.clusters.bins;
  const max = Math.max(...bins.map((b) => Math.max(b.buy, b.sell, 1)), 1);
  const mid = rect.width * 0.48;
  for (const b of bins) {
    const y = series.priceToCoordinate(b.price);
    if (y == null) continue;
    const buyW = (b.buy / max) * (rect.width - mid - 4);
    const sellW = (b.sell / max) * (mid - 4);
    ctx.fillStyle = b.imbalance === "sell" ? "rgba(181,122,122,0.7)" : "rgba(181,122,122,0.32)";
    ctx.fillRect(mid - sellW, y - 3, sellW, 6);
    ctx.fillStyle = b.imbalance === "buy" ? "rgba(111,158,134,0.7)" : "rgba(111,158,134,0.32)";
    ctx.fillRect(mid, y - 3, buyW, 6);
    if (Math.abs(b.price - snap.clusters.poc) < snap.atr * 0.12) {
      ctx.strokeStyle = "rgba(201,184,150,0.9)";
      ctx.strokeRect(2, y - 4, rect.width - 4, 8);
    }
  }
  ctx.fillStyle = "rgba(232,220,200,0.7)";
  ctx.font = "9px IBM Plex Mono, monospace";
  ctx.fillText("S", 4, 12);
  ctx.fillText("B", rect.width - 12, 12);
}

function drawTape(
  ctx: CanvasRenderingContext2D,
  width: number,
  chart: IChartApi,
  series: ISeriesApi<"Candlestick">,
  candles: Candle[],
  snap: SmcSnapshot | null,
  on: boolean,
  book: { bids: { price: number; volume: number }[]; asks: { price: number; volume: number }[] } | null,
) {
  if (!on) return;
  const ts = chart.timeScale();
  const lastN = candles.slice(-18);
  const maxV = Math.max(...lastN.map((c) => c.volume), 1);
  for (let i = 0; i < lastN.length; i++) {
    const c = lastN[i]!;
    const x = ts.timeToCoordinate(c.time as UTCTimestamp);
    const yH = series.priceToCoordinate(c.high);
    const yL = series.priceToCoordinate(c.low);
    const yC = series.priceToCoordinate(c.close);
    if (x == null || yH == null || yL == null || yC == null) continue;
    const next = lastN[i + 1];
    const x2 = next ? ts.timeToCoordinate(next.time as UTCTimestamp) : x + 10;
    const w = Math.max(4, Math.min(14, ((x2 ?? x + 10) - x) * 0.55));
    const span = c.high - c.low || 1;
    const buyShare = Math.min(1, Math.max(0, (c.close - c.low) / span));
    const thick = 3 + (c.volume / maxV) * 7;
    ctx.fillStyle = "rgba(181,122,122,0.45)";
    ctx.fillRect(x - thick / 2, Math.min(yC, yL), thick, Math.abs(yL - yC) || 2);
    ctx.fillStyle = "rgba(111,158,134,0.45)";
    ctx.fillRect(x - thick / 2, Math.min(yH, yC), thick, Math.abs(yC - yH) || 2);
    if (buyShare > 0.7) {
      ctx.strokeStyle = "rgba(111,158,134,0.9)";
      ctx.strokeRect(x - w / 2, Math.min(yH, yL), w, Math.abs(yH - yL) || 4);
    }
  }
  const last = candles.at(-1);
  const beat = 0.5 + 0.5 * Math.sin(Date.now() / 200);
  if (snap?.micro.infusion && last) {
    const x = ts.timeToCoordinate(last.time as UTCTimestamp);
    const yH = series.priceToCoordinate(last.high);
    const yL = series.priceToCoordinate(last.low);
    const yC = series.priceToCoordinate(last.close);
    if (x != null && yH != null && yL != null && yC != null) {
      ctx.strokeStyle = `rgba(200,240,48,${0.45 + 0.55 * beat})`;
      ctx.lineWidth = 2 + 2 * beat;
      ctx.strokeRect(x - 10 - 4 * beat, Math.min(yH, yL) - 4, 20 + 8 * beat, Math.abs(yH - yL) + 8);
      pulseRings(ctx, x, yC, "#c8f030", true);
      ctx.font = "bold 13px IBM Plex Sans, sans-serif";
      ctx.fillStyle = "#c8f030";
      ctx.globalAlpha = 0.55 + 0.45 * beat;
      ctx.fillText("ВЛИВАНИЕ", x - 36, Math.min(yH, yL) - 12);
      ctx.globalAlpha = 1;
    }
  }
  if (snap?.micro.splash && last) {
    const x = ts.timeToCoordinate(last.time as UTCTimestamp);
    const yC = series.priceToCoordinate(last.close);
    if (x != null && yC != null) pulseRings(ctx, x, yC, "#ffb020", true);
  }
  for (const n of snap?.micro.nodes.filter((x) => x.kind === "splash" || x.kind === "infusion").slice(-8) ?? []) {
    const x = ts.timeToCoordinate(n.time as UTCTimestamp);
    const y = series.priceToCoordinate(n.price);
    if (x == null || y == null) continue;
    pulseRings(ctx, x, y, n.kind === "splash" ? "#ffb020" : "#c8f030", n.kind === "splash");
  }
  const tp = snap?.localSetup.targets[0];
  for (const n of snap?.micro.nodes.filter((x) => x.kind === "infusion").slice(-6) ?? []) {
    const y = series.priceToCoordinate(n.price);
    if (y == null) continue;
    const isTp = tp != null && Math.abs(tp - n.price) < (snap?.atr ?? 0) * 0.3;
    ctx.strokeStyle = isTp ? "rgba(212,184,140,0.95)" : "rgba(201,184,150,0.45)";
    ctx.lineWidth = isTp ? 2 : 1;
    ctx.setLineDash(isTp ? [] : [5, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = isTp ? "#f0e6d4" : "rgba(232,220,200,0.7)";
    ctx.font = "bold 10px IBM Plex Mono, monospace";
    ctx.fillText(isTp ? "TP · INFUSION" : "INFUSION", 8, y - 4);
  }
  for (const n of snap?.micro.nodes.filter((x) => x.kind === "imbalance").slice(-4) ?? []) {
    const y = series.priceToCoordinate(n.price);
    if (y == null) continue;
    ctx.strokeStyle = "rgba(220,160,90,0.55)";
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(240,200,140,0.85)";
    ctx.font = "bold 10px IBM Plex Mono, monospace";
    ctx.fillText("ДИСБАЛАНС", 8, y - 4);
  }
  if (snap?.micro.splash && last) {
    const x = ts.timeToCoordinate(last.time as UTCTimestamp);
    const y = series.priceToCoordinate(last.close);
    if (x != null && y != null) {
      ctx.fillStyle = snap.micro.splash.side === "buy" ? "rgba(111,158,134,0.25)" : "rgba(181,122,122,0.25)";
      ctx.fillRect(x - 16, y - 40, 32, 80);
      ctx.fillStyle = "#f0e6d4";
      ctx.font = "bold 11px IBM Plex Mono, monospace";
      ctx.fillText("SPLASH", x - 22, y - 44);
    }
  }
  if (book && (book.bids.length || book.asks.length)) {
    const max = Math.max(...book.bids.map((l) => l.volume), ...book.asks.map((l) => l.volume), 1);
    const x0 = width - 70;
    for (const l of book.asks.slice(0, 8)) {
      const y = series.priceToCoordinate(l.price);
      if (y == null) continue;
      ctx.fillStyle = "rgba(181,122,122,0.55)";
      ctx.fillRect(x0, y - 3, (l.volume / max) * 60, 6);
    }
    for (const l of book.bids.slice(0, 8)) {
      const y = series.priceToCoordinate(l.price);
      if (y == null) continue;
      ctx.fillStyle = "rgba(111,158,134,0.55)";
      ctx.fillRect(x0, y - 3, (l.volume / max) * 60, 6);
    }
    ctx.fillStyle = "rgba(232,220,200,0.8)";
    ctx.font = "9px IBM Plex Mono, monospace";
    ctx.fillText("ASK/BID", x0, 12);
  }
}

class SmcPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<"Candlestick"> | null = null;
  private _upd: (() => void) | null = null;
  private blink: ReturnType<typeof setInterval> | null = null;
  private faceClock: ReturnType<typeof setInterval> | null = null;
  faceI = 0;
  payload: {
    zones: Zone[];
    overlays: OverlayFlags;
    snap: SmcSnapshot | null;
    setup: LocalSetup | null;
    order: Advice | null;
    candles: Candle[];
    book: { bids: { price: number; volume: number }[]; asks: { price: number; volume: number }[] } | null;
    pair: string;
  } = {
    zones: [],
    overlays: {
      fvg: true,
      ob: true,
      liquidity: true,
      profile: true,
      waves: false,
      divergences: true,
      margin: true,
      patterns: true,
      flow: true,
      structure: true,
    },
    snap: null,
    setup: null,
    order: null,
    candles: [],
    book: null,
    pair: "EURUSD",
  };

  private unsub: (() => void) | null = null;
  attached(param: SeriesAttachedParameter<Time>) {
    this.chart = param.chart as IChartApi;
    this.series = param.series as ISeriesApi<"Candlestick">;
    this._upd = param.requestUpdate;
    this.blink = setInterval(() => this._upd?.(), 180);
    this.faceClock = setInterval(() => {
      this.faceI += 1;
      this._upd?.();
    }, 1800);
    this.unsub = this.chart.timeScale().subscribeVisibleLogicalRangeChange(() => this._upd?.()) as unknown as () => void;
  }
  detached() {
    this.unsub?.();
    this.unsub = null;
    if (this.blink) clearInterval(this.blink);
    this.blink = null;
    if (this.faceClock) clearInterval(this.faceClock);
    this.faceClock = null;
    this.chart = null;
    this.series = null;
    this._upd = null;
  }
  refresh() {
    this._upd?.();
  }
  paneViews() {
    return [
      {
        zOrder: () => "top" as const,
        renderer: () => ({
          draw: (target: {
            useMediaCoordinateSpace: (
              fn: (scope: { context: CanvasRenderingContext2D; mediaSize: { width: number; height: number } }) => void,
            ) => void;
          }) => {
            const chart = this.chart;
            const series = this.series;
            if (!chart || !series) return;
            const p = this.payload;
            target.useMediaCoordinateSpace((scope) => {
              drawVolumeCandles(
                scope.context,
                scope.mediaSize.width,
                scope.mediaSize.height,
                chart,
                series,
                p.candles,
                true,
              );
              drawZones(
                scope.context,
                scope.mediaSize.width,
                scope.mediaSize.height,
                chart,
                series,
                p.zones,
                p.overlays,
                p.snap,
                p.setup,
                p.order,
                p.candles.at(-1)?.time ?? 0,
                false,
                p.candles,
                p.pair,
                this.faceI,
              );
              drawTape(
                scope.context,
                scope.mediaSize.width,
                chart,
                series,
                p.candles,
                p.snap,
                p.overlays.flow,
                p.book,
              );
              drawPathArrows(
                scope.context,
                scope.mediaSize.width,
                chart,
                series,
                p.snap,
                p.order,
                p.setup,
                p.candles.at(-1)?.time ?? 0,
              );
            });
          },
        }),
      },
    ];
  }
}

export function ChartPane({
  candles,
  snap,
  overlays,
  book = null,
  order = null,
  setup = null,
  className,
}: {
  candles: Candle[];
  snap: SmcSnapshot | null;
  overlays: OverlayFlags;
  book?: { bids: { price: number; volume: number }[]; asks: { price: number; volume: number }[] } | null;
  order?: Advice | null;
  setup?: LocalSetup | null;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const primitiveRef = useRef<SmcPrimitive | null>(null);
  const profileRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const cvdRef = useRef<ISeriesApi<"Line"> | null>(null);
  const vwapRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<UTCTimestamp> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const snapRef = useRef(snap);
  const overlaysRef = useRef(overlays);
  const candlesRef = useRef(candles);
  const bookRef = useRef(book);
  const orderRef = useRef(order);
  const setupRef = useRef(setup);
  const pair = useDeskStore((s) => s.symbol);
  const pairRef = useRef(pair);
  const [ready, setReady] = useState(false);
  snapRef.current = snap;
  overlaysRef.current = overlays;
  candlesRef.current = candles;
  bookRef.current = book;
  orderRef.current = order;
  setupRef.current = setup;
  pairRef.current = pair;
  overlaysRef.current = overlays;
  candlesRef.current = candles;
  bookRef.current = book;
  orderRef.current = order;
  setupRef.current = setup;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let chart: IChartApi | null = null;
    let ro: ResizeObserver | null = null;

    void import("lightweight-charts").then((lc) => {
      if (cancelled || !hostRef.current) return;
      const bg = token("--color-bg", "#0a0a0b");
      const fg = token("--color-fg", "#f0f0f2");
      const muted = token("--color-muted", "#9a9aa3");
      const bull = token("--color-bull", "#6f9e86");
      const bear = token("--color-bear", "#b57a7a");
      chart = lc.createChart(hostRef.current, {
        autoSize: true,
        layout: {
          background: { type: lc.ColorType.Solid, color: bg },
          textColor: muted,
          fontFamily: "IBM Plex Sans, Segoe UI, sans-serif",
          fontSize: 11,
          attributionLogo: false,
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.04)" },
          horzLines: { color: "rgba(255,255,255,0.04)" },
        },
        rightPriceScale: {
          borderColor: "rgba(255,255,255,0.08)",
          scaleMargins: { top: 0.08, bottom: 0.22 },
        },
        timeScale: {
          borderColor: "rgba(255,255,255,0.08)",
          timeVisible: true,
          secondsVisible: false,
        },
        crosshair: {
          vertLine: {
            color: fg,
            width: 1,
            style: lc.LineStyle.Dotted,
            labelBackgroundColor: bg,
          },
          horzLine: {
            color: fg,
            width: 1,
            style: lc.LineStyle.Dotted,
            labelBackgroundColor: bg,
          },
        },
      });
      const series = chart.addSeries(lc.CandlestickSeries, {
        upColor: "rgba(0,0,0,0)",
        downColor: "rgba(0,0,0,0)",
        borderVisible: false,
        wickUpColor: "rgba(0,0,0,0)",
        wickDownColor: "rgba(0,0,0,0)",
      });
      const volume = chart.addSeries(lc.HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
      });
      chart.priceScale("vol").applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      });
      const cvd = chart.addSeries(lc.LineSeries, {
        color: "rgba(201,184,150,0.85)",
        lineWidth: 2,
        priceScaleId: "cvd",
        lastValueVisible: true,
        priceLineVisible: false,
      });
      chart.priceScale("cvd").applyOptions({
        scaleMargins: { top: 0.68, bottom: 0.16 },
      });
      const vwap = chart.addSeries(lc.LineSeries, {
        color: "rgba(201,184,150,0.95)",
        lineWidth: 2,
        lastValueVisible: true,
        priceLineVisible: false,
        title: "VWAP",
      });
      const markers = lc.createSeriesMarkers(series, []);
      chartRef.current = chart;
      seriesRef.current = series;
      volumeRef.current = volume;
      cvdRef.current = cvd;
      vwapRef.current = vwap;
      markersRef.current = markers as ISeriesMarkersPluginApi<UTCTimestamp>;
      const primitive = new SmcPrimitive();
      series.attachPrimitive(primitive);
      primitiveRef.current = primitive;

      const paint = () => {
        const prim = primitiveRef.current;
        if (prim) {
          prim.payload = {
            zones: [...(snapRef.current?.fvgs ?? []), ...(snapRef.current?.orderBlocks ?? [])],
            overlays: overlaysRef.current,
            snap: snapRef.current,
            setup: setupRef.current,
            order: orderRef.current,
            candles: candlesRef.current,
            book: bookRef.current,
            pair: pairRef.current,
          };
          prim.refresh();
        }
        const s = seriesRef.current;
        if (s && profileRef.current) {
          drawProfile(profileRef.current, s, snapRef.current, overlaysRef.current.profile);
        }
      };
      chart.timeScale().subscribeVisibleLogicalRangeChange(paint);
      ro = new ResizeObserver(() => paint());
      ro.observe(hostRef.current);
      requestAnimationFrame(paint);
      setReady(true);
    });

    return () => {
      cancelled = true;
      setReady(false);
      ro?.disconnect();
      primitiveRef.current = null;
      chart?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
      cvdRef.current = null;
      vwapRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    const volume = volumeRef.current;
    const cvd = cvdRef.current;
    const vwap = vwapRef.current;
    if (!ready || !series || !volume || !cvd || candles.length === 0) return;
    const bull = token("--color-bull", "#6f9e86");
    const bear = token("--color-bear", "#b57a7a");
    series.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    let run = 0;
    volume.setData(
      candles.map((c) => {
        const d = deltaOf(c);
        return {
          time: c.time as UTCTimestamp,
          value: c.volume,
          color: d >= 0 ? `${bull}99` : `${bear}99`,
        };
      }),
    );
    cvd.setData(
      candles.map((c) => {
        run += deltaOf(c);
        return { time: c.time as UTCTimestamp, value: run };
      }),
    );
    if (vwap) {
      let pv = 0;
      let vv = 0;
      vwap.setData(
        candles.map((c) => {
          const tp = (c.high + c.low + c.close) / 3;
          const v = c.volume || 1;
          pv += tp * v;
          vv += v;
          return { time: c.time as UTCTimestamp, value: pv / vv };
        }),
      );
    }
    chartRef.current?.timeScale().fitContent();
  }, [candles, ready]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!ready || !series || !chart) return;
    void import("lightweight-charts").then((lc) => {
      try {
      if (seriesRef.current !== series) return;
      for (const line of linesRef.current) series.removePriceLine(line);
      linesRef.current = [];
      if (!snap) {
        markersRef.current?.setMarkers([]);
        return;
      }
      const accent = token("--color-accent", "#c8ccd4");
      const bull = token("--color-bull", "#6f9e86");
      const bear = token("--color-bear", "#b57a7a");
      const muted = token("--color-muted", "#9a9aa3");
      const add = (price: number, title: string, color: string, dotted = false, wide = false) => {
        linesRef.current.push(
          series.createPriceLine({
            price,
            color,
            lineWidth: wide ? 2 : 1,
            lineStyle: wide ? lc.LineStyle.Solid : dotted ? lc.LineStyle.Dashed : lc.LineStyle.SparseDotted,
            axisLabelVisible: true,
            title,
          }),
        );
      };
      add(snap.dealingRange.eq, "EQ", muted, true);
      if (overlays.margin !== false) {
        add(snap.margin.upper.bottom, "M↑", token("--color-accent", "#c9b896"), true);
        add(snap.margin.lower.top, "M↓", token("--color-accent", "#c9b896"), true);
        for (const m of snap.margin.magnets.slice(0, 3)) {
          add(m.price, m.kind === "round" ? "RND" : m.kind === "eqh" ? "EQH" : "EQL", muted, true);
        }
      }
      if (overlays.profile) {
        add(snap.volumeProfile.poc, "POC", accent);
        add(snap.volumeProfile.vah, "VAH", muted, true);
        add(snap.volumeProfile.val, "VAL", muted, true);
        add(snap.micro.vwap, "VWAP", accent);
        add(snap.micro.upper, "VWAP+σ", muted, true);
        add(snap.micro.lower, "VWAP−σ", muted, true);
      }
      if (overlays.liquidity) {
        for (const p of snap.liquidity.filter((l) => l.equal || l.swept).slice(-4)) {
          add(
            p.price,
            p.swept ? "SWEEP" : p.side === "buy" ? "BSL" : "SSL",
            p.side === "buy" ? bull : bear,
          );
        }
      }
      if (snap.boxVector && snap.boxVector.dir !== "none" && snap.boxVector.magnet != null) {
        add(
          snap.boxVector.magnet,
          snap.boxVector.dir === "up" ? "ВЕКТОР вверх" : "ВЕКТОР вниз",
          snap.boxVector.dir === "up" ? bull : bear,
          false,
          true,
        );
      }
      const cmd = order;
      const cmdSetup = setup;
      if (cmdSetup && (cmdSetup.entry != null || cmdSetup.stop != null)) {
        const live = cmd?.action === "long" || cmd?.action === "short";
        const col = cmd?.action === "short" ? bear : cmd?.action === "long" ? bull : accent;
        if (cmdSetup.entry != null) {
          add(cmdSetup.entry, live ? (cmd?.action === "long" ? "ПРИКАЗ BUY" : "ПРИКАЗ SELL") : "ЗОНА ДИСП.", col, !live, live);
        }
        if (cmdSetup.stop != null) add(cmdSetup.stop, live ? "ПРИКАЗ SL" : "SL ДИСП.", bear, !live, live);
        cmdSetup.targets.slice(0, 2).forEach((t, i) => add(t, live ? `ПРИКАЗ TP${i + 1}` : `TP${i + 1}`, bull, !live, live));
      }
      const markers: SeriesMarker<UTCTimestamp>[] = [
        ...(overlays.structure !== false
          ? snap.events.slice(-8).map((e): SeriesMarker<UTCTimestamp> => ({
              time: e.time as UTCTimestamp,
              position: e.side === "bull" ? "belowBar" : "aboveBar",
              color: e.side === "bull" ? bull : bear,
              shape: e.side === "bull" ? "arrowUp" : "arrowDown",
              text: e.kind,
            }))
          : []),
        ...(overlays.divergences
          ? snap.divergences.map((d): SeriesMarker<UTCTimestamp> => ({
              time: d.priceTime as UTCTimestamp,
              position: d.side === "bull" ? "belowBar" : "aboveBar",
              color: d.side === "bull" ? bull : bear,
              shape: "circle",
              text: d.kind === "hidden" ? "HID" : "DIV",
            }))
          : []),
        ...(overlays.waves
          ? snap.waves.map((w): SeriesMarker<UTCTimestamp> => ({
              time: w.time as UTCTimestamp,
              position: "inBar",
              color: accent,
              shape: "square",
              text: w.label,
            }))
          : []),
        ...(overlays.patterns !== false
          ? snap.patterns.flatMap((p) =>
              p.points.map(
                (pt): SeriesMarker<UTCTimestamp> => ({
                  time: pt.time as UTCTimestamp,
                  position: p.side === "bull" ? "belowBar" : "aboveBar",
                  color: p.family === "harmonic" ? accent : p.side === "bull" ? bull : bear,
                  shape: "circle",
                  text: pt.label,
                }),
              ),
            )
          : []),
        ...(overlays.flow !== false && snap.micro.splash
          ? [
              {
                time: (snap.swings.at(-1)?.time ?? snap.events.at(-1)?.time ?? 0) as UTCTimestamp,
                position: snap.micro.splash.side === "buy" ? "belowBar" : "aboveBar",
                color: snap.micro.splash.side === "buy" ? bull : bear,
                shape: snap.micro.splash.side === "buy" ? "arrowUp" : "arrowDown",
                text: "SPLASH",
              } satisfies SeriesMarker<UTCTimestamp>,
            ]
          : []),
      ];
      markersRef.current?.setMarkers(markers);
      const prim = primitiveRef.current;
      if (prim) {
        prim.payload = {
          zones: [...snap.fvgs, ...snap.orderBlocks],
          overlays,
          snap,
          setup,
          order,
          candles,
          book,
          pair,
        };
        prim.refresh();
      }
      if (profileRef.current) drawProfile(profileRef.current, series, snap, overlays.profile);
      } catch {
        /* overlay must not blank candles */
      }
    });
  }, [snap, overlays, ready, order, setup, pair]);

  return (
    <div className={cn("relative overflow-hidden bg-bg", className)}>
      <div ref={hostRef} className="absolute inset-0" />
      <canvas
        ref={profileRef}
        className="pointer-events-none absolute top-0 right-14 bottom-8 z-10 w-32"
      />
    </div>
  );
}
