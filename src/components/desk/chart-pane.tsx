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
) {
  ctx.clearRect(0, 0, width, height);
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
    ctx.strokeStyle = up ? "rgba(120,255,180,0.9)" : "rgba(255,140,140,0.9)";
    ctx.lineWidth = Math.max(1.2, spacing * 0.12);
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
      g.addColorStop(0, "#d4ffe8");
      g.addColorStop(0.4, "#3edc82");
      g.addColorStop(1, "#0d5a32");
    } else {
      g.addColorStop(0, "#ffc8c8");
      g.addColorStop(0.4, "#e04848");
      g.addColorStop(1, "#6a1010");
    }
    ctx.fillStyle = g;
    ctx.fillRect(left, top, bodyW, h);
    ctx.strokeStyle = up ? "rgba(220,255,236,0.55)" : "rgba(255,210,210,0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, bodyW, h);
  }
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
) {
  if (width < 16 || height < 16) return;
  if (wipe) ctx.clearRect(0, 0, width, height);
  const ts = chart.timeScale();
  const plotW = Math.max(40, width - 58);
  const notes: { time: number; price: number; text: string; tone: string }[] = [];
  const busy: { x: number; y: number; w: number; h: number }[] = [];
  const occupy = (x: number, y: number, w: number, h: number) => busy.push({ x, y, w, h });
  const PALETTE: Record<string, { top: string; mid: string; stroke: string; b0: string; b1: string; t0: string; t1: string }> = {
    fvg: { top: "rgba(255,186,40,0.38)", mid: "rgba(255,230,120,0.62)", stroke: "#ffd24a", b0: "#fff3b0", b1: "#c48410", t0: "#fff6c8", t1: "#7a4a00" },
    ob: { top: "rgba(20,170,90,0.40)", mid: "rgba(90,255,160,0.58)", stroke: "#5dffb0", b0: "#c8ffdc", b1: "#0e7a40", t0: "#e8fff0", t1: "#0a4a24" },
    obBear: { top: "rgba(210,40,50,0.40)", mid: "rgba(255,110,110,0.58)", stroke: "#ff6a6a", b0: "#ffd0d0", b1: "#a01818", t0: "#ffe8e8", t1: "#6a0808" },
    liq: { top: "rgba(170,220,40,0.38)", mid: "rgba(230,255,120,0.58)", stroke: "#c8f030", b0: "#f0ffb0", b1: "#6a8a10", t0: "#f6ffd0", t1: "#3a5208" },
    sweep: { top: "rgba(255,160,20,0.40)", mid: "rgba(255,210,80,0.58)", stroke: "#ffb020", b0: "#ffe090", b1: "#b06000", t0: "#fff0c0", t1: "#6a3800" },
    choch: { top: "rgba(120,90,255,0.32)", mid: "rgba(190,170,255,0.50)", stroke: "#b8a0ff", b0: "#ece0ff", b1: "#4a30b0", t0: "#f6f0ff", t1: "#2a1878" },
    vec: { top: "rgba(20,190,200,0.32)", mid: "rgba(100,240,250,0.50)", stroke: "#40e8f0", b0: "#c8ffff", b1: "#087878", t0: "#e8ffff", t1: "#045050" },
    entry: { top: "rgba(232,190,80,0.30)", mid: "rgba(255,220,140,0.48)", stroke: "#f0c860", b0: "#fff0b8", b1: "#a07018", t0: "#fff8d8", t1: "#5a4010" },
    stop: { top: "rgba(220,50,50,0.30)", mid: "rgba(255,120,120,0.46)", stroke: "#ff7070", b0: "#ffd0d0", b1: "#901818", t0: "#fff0f0", t1: "#5a0808" },
    tp: { top: "rgba(30,170,100,0.30)", mid: "rgba(110,230,160,0.46)", stroke: "#50e090", b0: "#c8ffdc", b1: "#0e7040", t0: "#e8fff0", t1: "#0a4020" },
    wait: { top: "rgba(160,160,180,0.22)", mid: "rgba(210,210,230,0.40)", stroke: "#c0c0d0", b0: "#f0f0f8", b1: "#505068", t0: "#ffffff", t1: "#303048" },
    margin: { top: "rgba(201,160,90,0.22)", mid: "rgba(240,210,140,0.40)", stroke: "#d4b070", b0: "#f8e8c0", b1: "#8a6020", t0: "#fff8e0", t1: "#5a3810" },
    pat: { top: "rgba(80,140,220,0.28)", mid: "rgba(150,190,255,0.46)", stroke: "#80b8ff", b0: "#d8e8ff", b1: "#2058a8", t0: "#f0f6ff", t1: "#103868" },
  };
  const fillVolume = (x: number, y: number, w: number, h: number, tone: string) => {
    const p = PALETTE[tone] ?? PALETTE.fvg!;
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, p.top);
    g.addColorStop(0.42, p.mid);
    g.addColorStop(1, p.top);
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    const shine = ctx.createLinearGradient(x, y, x, y + Math.min(10, h));
    shine.addColorStop(0, "rgba(255,255,255,0.22)");
    shine.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = shine;
    ctx.fillRect(x, y, w, Math.min(10, h));
    ctx.strokeStyle = p.stroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
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
      fillVolume(0, y, plotW, h, "margin");
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
    const live = zones.filter((z) => zoneReach(z, last, atr) != null);
    const picked = [
      ...(overlays.fvg ? live.filter((z) => z.kind === "fvg").sort((a, b) => dist(a) - dist(b)).slice(0, 2) : []),
      ...(overlays.ob
        ? live.filter((z) => z.kind === "ob" || z.kind === "breaker" || z.kind === "mitigation").sort((a, b) => dist(a) - dist(b)).slice(0, 2)
        : []),
    ];
    for (const z of picked) {
      const x1 = ts.timeToCoordinate(z.startTime as UTCTimestamp) ?? 8;
      const xEnd = ts.timeToCoordinate(z.endTime as UTCTimestamp);
      const zw = Math.min(160, Math.max(48, xEnd != null ? xEnd - x1 : 90));
      const y1 = series.priceToCoordinate(z.top);
      const y2 = series.priceToCoordinate(z.bottom);
      if (y1 == null || y2 == null) continue;
      const top = Math.min(y1, y2);
      const h = Math.max(4, Math.abs(y2 - y1));
      const bull = z.side === "bull";
      const imb = z.kind === "fvg";
      const tone = imb ? "fvg" : bull ? "ob" : "obBear";
      fillVolume(x1, top, zw, h, tone);
      occupy(x1, top, zw, h);
      mark(z.startTime, (z.top + z.bottom) / 2, imb ? "Имбаланс" : "Ордерблок", tone);
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
    const bsl = [...near].filter((l) => l.side === "buy" && !l.swept).sort((a, b) => dLiq(a) - dLiq(b))[0];
    const ssl = [...near].filter((l) => l.side === "sell" && !l.swept).sort((a, b) => dLiq(a) - dLiq(b))[0];
    const sweep = [...near].filter((l) => l.swept).sort((a, b) => dLiq(a) - dLiq(b))[0];
    const pool = bsl ?? ssl ?? sweep;
    if (pool) {
      const y = series.priceToCoordinate(pool.price);
      const yPad = series.priceToCoordinate(pool.price + (pool.side === "buy" ? snap.atr * 0.35 : -snap.atr * 0.35));
      const x0 = ts.timeToCoordinate(pool.time as UTCTimestamp) ?? plotW * 0.45;
      if (y != null && yPad != null) {
        const top = Math.min(y, yPad);
        const h = Math.max(10, Math.abs(yPad - y));
        fillVolume(x0, top, plotW - x0 - 8, h, pool.swept ? "sweep" : "liq");
        occupy(x0, top, plotW - x0 - 8, h);
        ctx.strokeStyle = "rgba(80, 120, 180, 0.7)";
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(plotW - 8, y);
        ctx.stroke();
        mark(pool.time, pool.price, pool.swept ? "Съём" : "Ликвидность", pool.swept ? "sweep" : "liq");
      }
    }
  }

  if (snap && snap.boxVector && snap.boxVector.dir !== "none" && snap.boxVector.magnet != null) {
    const magY = series.priceToCoordinate(snap.boxVector.magnet);
    const lastY = series.priceToCoordinate(snap.lastClose);
    if (magY != null && lastY != null) {
      const up = snap.boxVector.dir === "up";
      ctx.strokeStyle = up ? "rgba(150,210,180,0.85)" : "rgba(220,150,150,0.85)";
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(plotW - 22, lastY);
      ctx.lineTo(plotW - 22, magY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(plotW - 22, magY);
      ctx.lineTo(plotW - 28, magY + (up ? 10 : -10));
      ctx.lineTo(plotW - 16, magY + (up ? 10 : -10));
      ctx.closePath();
      ctx.fill();
      mark(lastTime, snap.boxVector.magnet, up ? "Вектор вверх" : "Вектор вниз", "vec");
    }
  }

  if (overlays.patterns !== false && snap) {
    const p = snap.patterns[0];
    if (p) {
      const prices = p.points.map((pt) => pt.price);
      if (prices.length) {
        const lo = Math.min(...prices);
        const hi = Math.max(...prices);
        if (!(snap.lastClose < lo - snap.atr * 1.5 || snap.lastClose > hi + snap.atr * 1.5)) {
          ctx.strokeStyle = p.side === "bull" ? "rgba(180,220,190,0.7)" : "rgba(230,180,170,0.7)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          let started = false;
          let lastY = 0;
          for (const pt of p.points) {
            const x = ts.timeToCoordinate(pt.time as UTCTimestamp);
            const y = series.priceToCoordinate(pt.price);
            if (x == null || y == null) continue;
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else ctx.lineTo(x, y);
            lastY = y;
          }
          if (started) {
            ctx.stroke();
            mark(p.points.at(-1)?.time ?? lastTime, p.points.at(-1)?.price ?? snap.lastClose, p.name, "pat");
          }
        }
      }
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

  ctx.font = "13px IBM Plex Sans, sans-serif";
  const bw = 124;
  const bh = 34;
  const hits = (box: { x: number; y: number; w: number; h: number }) =>
    busy.some(
      (b) => box.x < b.x + b.w + 8 && box.x + box.w + 8 > b.x && box.y < b.y + b.h + 8 && box.y + box.h + 8 > b.y,
    );
  const shown = notes.slice(0, 8);
  for (const n of shown) {
    const ax = ts.timeToCoordinate(n.time as UTCTimestamp);
    const ay = series.priceToCoordinate(n.price);
    if (ax == null || ay == null) continue;
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
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    const g = ctx.createLinearGradient(bx, by, bx, by + bh);
    g.addColorStop(0, pal.b0);
    g.addColorStop(1, pal.b1);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = pal.stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const shine = ctx.createLinearGradient(bx, by, bx, by + 12);
    shine.addColorStop(0, "rgba(255,255,255,0.4)");
    shine.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = shine;
    ctx.fill();
    ctx.font = "600 13px IBM Plex Sans, sans-serif";
    const tw = ctx.measureText(n.text).width;
    const tx = bx + (bw - tw) / 2;
    const ty = by + 22;
    ctx.strokeStyle = "rgba(20,12,4,0.55)";
    ctx.lineWidth = 3.2;
    ctx.lineJoin = "round";
    ctx.strokeText(n.text, tx, ty);
    const tg = ctx.createLinearGradient(tx, ty - 12, tx, ty + 4);
    tg.addColorStop(0, pal.t0);
    tg.addColorStop(1, pal.t1);
    ctx.fillStyle = tg;
    ctx.fillText(n.text, tx, ty);
  }
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
  if (snap?.micro.infusion && last) {
    const x = ts.timeToCoordinate(last.time as UTCTimestamp);
    const yH = series.priceToCoordinate(last.high);
    const yL = series.priceToCoordinate(last.low);
    if (x != null && yH != null && yL != null) {
      ctx.strokeStyle = "rgba(201,184,150,0.95)";
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 10, Math.min(yH, yL) - 4, 20, Math.abs(yH - yL) + 8);
      ctx.fillStyle = "#f0e6d4";
      ctx.font = "bold 11px IBM Plex Mono, monospace";
      ctx.fillText("INFUSION", x - 28, Math.min(yH, yL) - 8);
    }
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
  payload: {
    zones: Zone[];
    overlays: OverlayFlags;
    snap: SmcSnapshot | null;
    setup: LocalSetup | null;
    order: Advice | null;
    candles: Candle[];
    book: { bids: { price: number; volume: number }[]; asks: { price: number; volume: number }[] } | null;
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
  };

  private unsub: (() => void) | null = null;
  attached(param: SeriesAttachedParameter<Time>) {
    this.chart = param.chart as IChartApi;
    this.series = param.series as ISeriesApi<"Candlestick">;
    this._upd = param.requestUpdate;
    this.unsub = this.chart.timeScale().subscribeVisibleLogicalRangeChange(() => this._upd?.()) as unknown as () => void;
  }
  detached() {
    this.unsub?.();
    this.unsub = null;
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
  const [ready, setReady] = useState(false);
  snapRef.current = snap;
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
        };
        prim.refresh();
      }
      if (profileRef.current) drawProfile(profileRef.current, series, snap, overlays.profile);
      } catch {
        /* overlay must not blank candles */
      }
    });
  }, [snap, overlays, ready, order, setup]);

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
