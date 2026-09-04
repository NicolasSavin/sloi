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
  wipe = true,
) {
  if (width < 16 || height < 16) return;
  if (wipe) ctx.clearRect(0, 0, width, height);
  const ts = chart.timeScale();
  const plotW = Math.max(40, width - 58);
  const notes: { ax: number; ay: number; text: string }[] = [];
  const mark = (ax: number, ay: number, text: string) => {
    if (ay < 8 || ay > height - 8) return;
    notes.push({ ax, ay, text });
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
      ctx.fillStyle = fill;
      ctx.fillRect(0, y, plotW, h);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(0, y, plotW, h);
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
      const zw = Math.min(110, Math.max(36, xEnd != null ? xEnd - x1 : 80));
      const y1 = series.priceToCoordinate(z.top);
      const y2 = series.priceToCoordinate(z.bottom);
      if (y1 == null || y2 == null) continue;
      const top = Math.min(y1, y2);
      const h = Math.max(4, Math.abs(y2 - y1));
      const bull = z.side === "bull";
      const imb = z.kind === "fvg";
      ctx.fillStyle = imb ? (bull ? "rgba(212,160,48,0.16)" : "rgba(200,120,40,0.16)") : bull ? "rgba(46,140,96,0.18)" : "rgba(176,64,64,0.18)";
      ctx.strokeStyle = imb ? "#c9a24a" : bull ? "#5a9e78" : "#b07070";
      ctx.lineWidth = 1.5;
      ctx.fillRect(x1, top, zw, h);
      ctx.strokeRect(x1, top, zw, h);
      const name = imb ? "имбаланс" : "ордерблок";
      mark(x1 + zw, top + h / 2, name);
    }
  }

  if (overlays.structure !== false && snap) {
    const lastCh = [...snap.events].reverse().find((e) => e.kind === "CHoCH" && Math.abs(e.price - snap.lastClose) <= snap.atr * 1.4);
    if (lastCh) {
      const y = series.priceToCoordinate(lastCh.price);
      const x = ts.timeToCoordinate(lastCh.time as UTCTimestamp);
      if (y != null && x != null) {
        ctx.strokeStyle = lastCh.side === "bull" ? "rgba(150,210,180,0.7)" : "rgba(220,150,150,0.7)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(plotW, y);
        ctx.stroke();
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
        ctx.fillStyle = "rgba(236, 228, 168, 0.35)";
        ctx.strokeStyle = "rgba(90, 140, 70, 0.85)";
        ctx.lineWidth = 1.5;
        ctx.fillRect(x0, top, plotW - x0 - 8, h);
        ctx.strokeRect(x0, top, plotW - x0 - 8, h);
        ctx.strokeStyle = "rgba(80, 120, 180, 0.7)";
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(plotW - 8, y);
        ctx.stroke();
        mark(x0 + (plotW - x0) * 0.7, top + h, pool.swept ? "Съём" : "Ликвидность");
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
      mark(plotW - 40, magY, up ? "Вектор вверх" : "Вектор вниз");
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
          if (started) ctx.stroke();
        }
      }
    }
  }

  if (setup && (setup.entry != null || setup.stop != null)) {
    const liveOrd = order?.action === "long" || order?.action === "short";
    if (setup.entry != null) band(setup.entry, "rgba(232,210,160,0.9)", liveOrd ? "вход приказа" : "зона диспетчера");
    if (setup.stop != null) band(setup.stop, "rgba(220,150,150,0.9)", "стоп");
    setup.targets.slice(0, 2).forEach((t, i) => band(t, "rgba(150,210,180,0.9)", `тейк ${i + 1}`));
  }

  if (snap) {
    const yNow = series.priceToCoordinate(snap.lastClose);
    if (yNow != null) mark(plotW * 0.7, yNow, order?.action === "long" ? "Лонг" : order?.action === "short" ? "Шорт" : "Ждут");
  }

  ctx.font = "13px IBM Plex Sans, sans-serif";
  const shown = notes.slice(0, 5);
  const bw = 128;
  const bh = 36;
  let colY = Math.min(height * 0.55, height - shown.length * (bh + 14) - 20);
  for (let i = 0; i < shown.length; i++) {
    const n = shown[i]!;
    const bx = Math.min(plotW - bw - 10, Math.max(plotW * 0.58, n.ax + 12));
    let by = colY;
    if (by < 20) by = 20;
    if (by + bh > height - 8) by = height - bh - 8;
    colY = by + bh + 14;
    const cx = bx + bw / 2;
    ctx.beginPath();
    ctx.moveTo(n.ax, n.ay);
    ctx.lineTo(cx - 10, by);
    ctx.lineTo(cx + 10, by);
    ctx.closePath();
    ctx.fillStyle = "rgba(243, 226, 176, 0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(90, 130, 70, 0.85)";
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
    ctx.fillStyle = "rgba(247, 232, 190, 0.95)";
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#2f5a28";
    ctx.font = "600 13px IBM Plex Sans, sans-serif";
    const tw = ctx.measureText(n.text).width;
    ctx.fillText(n.text, bx + (bw - tw) / 2, by + 23);
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

  attached(param: SeriesAttachedParameter<Time>) {
    this.chart = param.chart as IChartApi;
    this.series = param.series as ISeriesApi<"Candlestick">;
    this._upd = param.requestUpdate;
  }
  detached() {
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
        upColor: bull,
        downColor: bear,
        borderVisible: false,
        wickUpColor: bull,
        wickDownColor: bear,
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
