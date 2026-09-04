import { useEffect, useRef, useState } from "react";
import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  SeriesMarker,
  UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/market/types";
import type { OverlayFlags } from "@/lib/desk-store";
import type { Advice } from "@/lib/advisor";
import type { LocalSetup, SmcSnapshot, Zone } from "@/lib/smc/engine";
import { deltaOf } from "@/lib/smc/flow";
import { cn } from "@/lib/utils";

function token(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function drawZones(
  canvas: HTMLCanvasElement,
  chart: IChartApi,
  series: ISeriesApi<"Candlestick">,
  zones: Zone[],
  overlays: OverlayFlags,
  snap: SmcSnapshot | null,
  setup?: LocalSetup | null,
  order?: Advice | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  const ts = chart.timeScale();
  const plotW = Math.max(40, rect.width - 58);
  const band = (price: number, fill: string, stroke: string, label: string, thick = 16) => {
    const y = series.priceToCoordinate(price);
    if (y == null) return;
    ctx.fillStyle = fill;
    ctx.fillRect(0, y - thick / 2, plotW, thick);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(plotW, y);
    ctx.stroke();
    ctx.fillStyle = "#f4eee4";
    ctx.font = "bold 13px IBM Plex Sans, sans-serif";
    ctx.fillText(label, 10, y - thick / 2 - 4);
  };
  const pill = (x: number, y: number, text: string, bg: string, fg: string) => {
    ctx.font = "bold 14px IBM Plex Sans, sans-serif";
    const w = ctx.measureText(text).width + 16;
    ctx.fillStyle = bg;
    ctx.fillRect(x, y - 17, w, 22);
    ctx.fillStyle = fg;
    ctx.fillText(text, x + 8, y);
  };
  if (overlays.margin !== false && snap) {
    const paint = (top: number, bottom: number, fill: string, stroke: string, label: string, live: boolean) => {
      const y1 = series.priceToCoordinate(top);
      const y2 = series.priceToCoordinate(bottom);
      if (y1 == null || y2 == null) return;
      const y = Math.min(y1, y2);
      const h = Math.max(8, Math.abs(y2 - y1));
      ctx.fillStyle = fill;
      ctx.fillRect(0, y, rect.width, h);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = live ? 2 : 1;
      ctx.setLineDash(live ? [] : [6, 5]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(rect.width, y);
      ctx.moveTo(0, y + h);
      ctx.lineTo(rect.width, y + h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = live ? "#f0e6d4" : "rgba(232,220,200,0.75)";
      ctx.font = "bold 11px IBM Plex Mono, ui-monospace, monospace";
      ctx.fillText(label, 10, Math.min(y + 16, y + h - 4));
    };
    paint(
      snap.margin.upper.top,
      snap.margin.upper.bottom,
      snap.margin.upper.active ? "rgba(181,122,122,0.28)" : "rgba(181,122,122,0.12)",
      snap.margin.upper.active ? "rgba(201,184,150,0.9)" : "rgba(201,184,150,0.35)",
      `МАРЖА ВЕРХ  ${snap.margin.upper.bottom.toFixed(snap.lastClose >= 50 ? 1 : 5)}–${snap.margin.upper.top.toFixed(snap.lastClose >= 50 ? 1 : 5)}${snap.margin.upper.active ? "  ← ЦЕНА ЗДЕСЬ" : ""}`,
      snap.margin.upper.active,
    );
    paint(
      snap.margin.lower.top,
      snap.margin.lower.bottom,
      snap.margin.lower.active ? "rgba(111,158,134,0.28)" : "rgba(111,158,134,0.12)",
      snap.margin.lower.active ? "rgba(201,184,150,0.9)" : "rgba(201,184,150,0.35)",
      `МАРЖА НИЗ  ${snap.margin.lower.bottom.toFixed(snap.lastClose >= 50 ? 1 : 5)}–${snap.margin.lower.top.toFixed(snap.lastClose >= 50 ? 1 : 5)}${snap.margin.lower.active ? "  ← ЦЕНА ЗДЕСЬ" : ""}`,
      snap.margin.lower.active,
    );
  }
  if (snap?.auction.ib) {
    const ib = snap.auction.ib;
    const y1 = series.priceToCoordinate(ib.high);
    const y2 = series.priceToCoordinate(ib.low);
    if (y1 != null && y2 != null) {
      const y = Math.min(y1, y2);
      const h = Math.max(6, Math.abs(y2 - y1));
      ctx.fillStyle = "rgba(90,140,180,0.12)";
      ctx.fillRect(0, y, rect.width, h);
      ctx.strokeStyle = "rgba(140,180,210,0.7)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y1);
      ctx.lineTo(rect.width, y1);
      ctx.moveTo(0, y2);
      ctx.lineTo(rect.width, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#d8e6f0";
      ctx.font = "bold 10px IBM Plex Mono, monospace";
      ctx.fillText(`${ib.session}  ${snap.auction.orb}`, 10, y + 14);
    }
  }
  if (overlays.fvg || overlays.ob) {
    const last = snap?.lastClose ?? 0;
    const dist = (z: Zone) => {
      if (last >= Math.min(z.top, z.bottom) && last <= Math.max(z.top, z.bottom)) return 0;
      return Math.min(Math.abs(last - z.top), Math.abs(last - z.bottom));
    };
    const live = zones.filter((z) => !z.mitigated);
    const picked = [
      ...(overlays.fvg ? live.filter((z) => z.kind === "fvg").sort((a, b) => dist(a) - dist(b)).slice(0, 1) : []),
      ...(overlays.ob
        ? live
            .filter((z) => z.kind === "ob" || z.kind === "breaker" || z.kind === "mitigation")
            .sort((a, b) => dist(a) - dist(b))
            .slice(0, 1)
        : []),
    ];
    for (const z of picked) {
      const x1 = ts.timeToCoordinate(z.startTime as UTCTimestamp) ?? 8;
      const y1 = series.priceToCoordinate(z.top);
      const y2 = series.priceToCoordinate(z.bottom);
      if (y1 == null || y2 == null) continue;
      const top = Math.min(y1, y2);
      const h = Math.abs(y2 - y1);
      if (h < 12) continue;
      const bull = z.side === "bull";
      const imb = z.kind === "fvg";
      ctx.fillStyle = imb
        ? bull
          ? "rgba(212, 160, 48, 0.42)"
          : "rgba(200, 120, 40, 0.42)"
        : bull
          ? "rgba(46, 140, 96, 0.50)"
          : "rgba(176, 64, 64, 0.50)";
      ctx.strokeStyle = imb ? "#ffd56a" : bull ? "#7dffb8" : "#ff8a8a";
      ctx.lineWidth = 3;
      ctx.fillRect(x1, top, plotW - x1, h);
      ctx.strokeRect(x1, top, plotW - x1, h);
      const name = imb
        ? bull
          ? "ИМБАЛАНС спрос"
          : "ИМБАЛАНС предложение"
        : z.kind === "breaker"
          ? "БЛОК брейкер"
          : bull
            ? "ОРДЕРБЛОК спрос"
            : "ОРДЕРБЛОК предложение";
      pill(
        x1 + 6,
        top + 18,
        name,
        imb ? "rgba(40,28,8,0.94)" : bull ? "rgba(12,40,28,0.94)" : "rgba(48,16,16,0.94)",
        imb ? "#ffe7a0" : bull ? "#b6ffd4" : "#ffc4c4",
      );
    }
  }
  if (overlays.structure !== false && snap) {
    const lastBos = [...snap.events].reverse().find((e) => e.kind === "BOS");
    const lastCh = [...snap.events].reverse().find((e) => e.kind === "CHoCH");
    for (const e of [lastCh, lastBos].filter(Boolean) as typeof snap.events) {
      const x = ts.timeToCoordinate(e.time as UTCTimestamp);
      const y = series.priceToCoordinate(e.price);
      if (x == null || y == null) continue;
      ctx.strokeStyle = e.side === "bull" ? "rgba(150,210,180,0.95)" : "rgba(220,150,150,0.95)";
      ctx.lineWidth = e.kind === "CHoCH" ? 3 : 2;
      ctx.setLineDash(e.kind === "CHoCH" ? [] : [6, 4]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(plotW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#f4eee4";
      ctx.font = "bold 12px IBM Plex Sans, sans-serif";
      ctx.fillText(`${e.kind} ${e.side === "bull" ? "↑" : "↓"}`, x + 6, y - 6);
    }
  }

  if (overlays.liquidity && snap) {
    const atr = snap.atr || 1;
    const last = snap.lastClose;
    const dLiq = (p: (typeof snap.liquidity)[number]) => Math.abs(last - p.price);
    const pools = snap.liquidity;
    const bsl = [...pools].filter((l) => l.side === "buy" && !l.swept).sort((a, b) => dLiq(a) - dLiq(b))[0];
    const ssl = [...pools].filter((l) => l.side === "sell" && !l.swept).sort((a, b) => dLiq(a) - dLiq(b))[0];
    const sweep = [...pools].filter((l) => l.swept).sort((a, b) => b.time - a.time)[0];
    for (const p of [bsl, ssl, sweep].filter(Boolean) as typeof pools) {
      const x = ts.timeToCoordinate(p.time as UTCTimestamp) ?? 8;
      const y = series.priceToCoordinate(p.price);
      if (y == null) continue;
      const y2 = series.priceToCoordinate(p.price + atr * 0.12) ?? y - 14;
      const topL = Math.min(y, y2);
      const hh = Math.max(14, Math.abs(y2 - y));
      ctx.fillStyle = p.swept ? "rgba(232, 196, 96, 0.40)" : "rgba(120, 190, 230, 0.38)";
      ctx.strokeStyle = p.swept ? "#ffe08a" : "#9ee0ff";
      ctx.lineWidth = 3;
      ctx.fillRect(x, topL, plotW - x, hh);
      ctx.strokeRect(x, topL, plotW - x, hh);
      const label = p.swept ? "СЪЁМ ЛИКВИДНОСТИ" : p.side === "buy" ? "ЛИКВИДНОСТЬ BSL" : "ЛИКВИДНОСТЬ SSL";
      pill(x + 6, topL + 18, label, "rgba(16,24,36,0.94)", p.swept ? "#ffe08a" : "#c8f0ff");
    }
  }

  if (overlays.patterns !== false && snap) {
    for (const p of snap.patterns.slice(0, 1)) {
      ctx.strokeStyle = p.side === "bull" ? "rgba(180,220,190,0.95)" : "rgba(230,180,170,0.95)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      let started = false;
      let lastX = 0;
      let lastY = 0;
      for (const pt of p.points) {
        const x = ts.timeToCoordinate(pt.time as UTCTimestamp);
        const y = series.priceToCoordinate(pt.price);
        if (x == null || y == null) continue;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
        lastX = x;
        lastY = y;
        ctx.fillStyle = "#f4eee4";
        ctx.font = "bold 11px IBM Plex Sans, sans-serif";
        ctx.fillText(pt.label, x + 4, y - 8);
      }
      if (started) {
        ctx.stroke();
        ctx.fillStyle = "#f4eee4";
        ctx.font = "bold 13px IBM Plex Sans, sans-serif";
        ctx.fillText(p.name, lastX + 8, lastY + 16);
      }
    }
  }

  if (setup && (setup.entry != null || setup.stop != null)) {
    const live = order?.action === "long" || order?.action === "short";
    const side = order?.action === "short" ? "шорт" : order?.action === "long" ? "лонг" : "зона";
    if (setup.entry != null) {
      band(
        setup.entry,
        live ? "rgba(212,184,140,0.28)" : "rgba(201,184,150,0.14)",
        "rgba(232,210,160,0.95)",
        live ? `ВХОД ${side}` : "ЗОНА ДИСПЕТЧЕРА",
        18,
      );
    }
    if (setup.stop != null) {
      band(setup.stop, "rgba(181,122,122,0.22)", "rgba(220,150,150,0.95)", "СТОП", 14);
    }
    setup.targets.slice(0, 2).forEach((t, i) => {
      band(t, "rgba(111,158,134,0.22)", "rgba(150,210,180,0.95)", `ТЕЙК ${i + 1}`, 14);
    });
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
  canvas: HTMLCanvasElement,
  chart: IChartApi,
  series: ISeriesApi<"Candlestick">,
  candles: Candle[],
  snap: SmcSnapshot | null,
  on: boolean,
  book: { bids: { price: number; volume: number }[]; asks: { price: number; volume: number }[] } | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx || !on) return;
  const rect = canvas.getBoundingClientRect();
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
    ctx.lineTo(rect.width, y);
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
    const x0 = rect.width - 70;
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
  const overlayRef = useRef<HTMLCanvasElement>(null);
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

      const paint = () => {
        const c = chartRef.current;
        const s = seriesRef.current;
        if (!c || !s) return;
        if (overlayRef.current) {
          drawZones(
            overlayRef.current,
            c,
            s,
            [...(snapRef.current?.fvgs ?? []), ...(snapRef.current?.orderBlocks ?? [])],
            overlaysRef.current,
            snapRef.current,
            setupRef.current,
            orderRef.current,
          );
          if (overlaysRef.current.flow) {
            drawTape(
              overlayRef.current,
              c,
              s,
              candlesRef.current,
              snapRef.current,
              true,
              bookRef.current,
            );
          }
        }
        if (profileRef.current) {
          drawProfile(profileRef.current, s, snapRef.current, overlaysRef.current.profile);
        }
      };
      chart.timeScale().subscribeVisibleLogicalRangeChange(paint);
      setReady(true);
    });

    return () => {
      cancelled = true;
      setReady(false);
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
      if (overlayRef.current) {
        drawZones(
          overlayRef.current,
          chart,
          series,
          [...snap.fvgs, ...snap.orderBlocks],
          overlays,
          snap,
          setup,
          order,
        );
        if (overlays.flow) drawTape(overlayRef.current, chart, series, candles, snap, true, book);
      }
      if (profileRef.current) drawProfile(profileRef.current, series, snap, overlays.profile);
    });
  }, [snap, overlays, ready, order, setup]);

  return (
    <div className={cn("relative overflow-hidden bg-bg", className)}>
      <div ref={hostRef} className="absolute inset-0" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0" />
      <canvas
        ref={profileRef}
        className="pointer-events-none absolute top-0 right-14 bottom-8 w-32"
      />
    </div>
  );
}
