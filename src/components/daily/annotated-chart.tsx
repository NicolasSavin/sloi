import { useEffect, useRef, useState } from "react";
import type { IChartApi, IPriceLine, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import type { ChartNote, LeadChart } from "@/lib/digest";

function token(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function toneColor(tone: ChartNote["tone"], bull: string, bear: string, accent: string) {
  if (tone === "bull") return bull;
  if (tone === "bear") return bear;
  return accent;
}

export function AnnotatedChart({ chart }: { chart: LeadChart }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const [ready, setReady] = useState(false);
  const [pins, setPins] = useState<{ note: ChartNote; x: number; y: number }[]>([]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let api: IChartApi | null = null;
    void import("lightweight-charts").then((lc) => {
      if (cancelled || !hostRef.current) return;
      const muted = token("--color-muted", "#b5aea3");
      const bull = token("--color-bull", "#7eab95");
      const bear = token("--color-bear", "#c48986");
      api = lc.createChart(hostRef.current, {
        autoSize: true,
        layout: {
          background: { type: lc.ColorType.Solid, color: "rgba(9,9,11,0.55)" },
          textColor: muted,
          fontFamily: "IBM Plex Mono, IBM Plex Sans, sans-serif",
          fontSize: 11,
          attributionLogo: false,
        },
        grid: {
          vertLines: { color: "rgba(228,213,187,0.06)" },
          horzLines: { color: "rgba(228,213,187,0.06)" },
        },
        rightPriceScale: { borderColor: "rgba(228,213,187,0.14)", scaleMargins: { top: 0.1, bottom: 0.08 } },
        timeScale: { borderColor: "rgba(228,213,187,0.14)", timeVisible: true, secondsVisible: false },
      });
      const series = api.addSeries(lc.CandlestickSeries, {
        upColor: bull,
        downColor: bear,
        borderVisible: false,
        wickUpColor: bull,
        wickDownColor: bear,
      });
      chartRef.current = api;
      seriesRef.current = series;
      const paint = () => {
        const c = chartRef.current;
        const s = seriesRef.current;
        const canvas = overlayRef.current;
        if (!c || !s || !canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);
        const ts = c.timeScale();
        const paintMargin = (
          top: number,
          bottom: number,
          fill: string,
          live: boolean,
          label: string,
        ) => {
          const y1 = s.priceToCoordinate(top);
          const y2 = s.priceToCoordinate(bottom);
          if (y1 == null || y2 == null) return;
          const y = Math.min(y1, y2);
          const h = Math.max(8, Math.abs(y2 - y1));
          ctx.fillStyle = fill;
          ctx.fillRect(0, y, rect.width, h);
          ctx.fillStyle = live ? "#f0e6d4" : "rgba(232,220,200,0.7)";
          ctx.font = "bold 11px IBM Plex Mono, monospace";
          ctx.fillText(label, 10, y + 14);
        };
        paintMargin(
          chart.margin.upper.top,
          chart.margin.upper.bottom,
          chart.margin.upper.active ? "rgba(181,122,122,0.28)" : "rgba(181,122,122,0.12)",
          chart.margin.upper.active,
          chart.margin.upper.active ? "МАРЖА ВЕРХ · ЦЕНА ЗДЕСЬ" : "МАРЖА ВЕРХ",
        );
        paintMargin(
          chart.margin.lower.top,
          chart.margin.lower.bottom,
          chart.margin.lower.active ? "rgba(111,158,134,0.28)" : "rgba(111,158,134,0.12)",
          chart.margin.lower.active,
          chart.margin.lower.active ? "МАРЖА НИЗ · ЦЕНА ЗДЕСЬ" : "МАРЖА НИЗ",
        );
        for (const z of chart.zones) {
          const x1 = ts.timeToCoordinate(z.startTime as UTCTimestamp);
          const y1 = s.priceToCoordinate(z.top);
          const y2 = s.priceToCoordinate(z.bottom);
          if (x1 == null || y1 == null || y2 == null) continue;
          const top = Math.min(y1, y2);
          const h = Math.max(4, Math.abs(y2 - y1));
          ctx.fillStyle = z.side === "bull" ? "rgba(126,171,149,0.2)" : "rgba(196,137,134,0.2)";
          ctx.fillRect(x1, top, rect.width - x1, h);
          ctx.fillStyle = z.side === "bull" ? "rgba(126,171,149,0.85)" : "rgba(196,137,134,0.85)";
          ctx.font = "11px IBM Plex Mono, monospace";
          ctx.fillText(
            z.kind === "breaker" ? "брейкер" : z.kind === "mitigation" ? "мит." : z.kind === "ob" ? "блок" : "FVG",
            x1 + 6,
            top + 12,
          );
        }
        const next: { note: ChartNote; x: number; y: number }[] = [];
        for (const note of chart.notes) {
          const x = ts.timeToCoordinate(note.time as UTCTimestamp);
          const y = s.priceToCoordinate(note.price);
          if (x == null || y == null) continue;
          next.push({ note, x, y });
        }
        next.sort((a, b) => a.y - b.y);
        for (let i = 1; i < next.length; i++) {
          const gap = next[i]!.y - next[i - 1]!.y;
          if (gap < 36) next[i]!.y = next[i - 1]!.y + 36;
        }
        setPins(next);
      };
      api.timeScale().subscribeVisibleLogicalRangeChange(paint);
      setReady(true);
      requestAnimationFrame(paint);
    });
    return () => {
      cancelled = true;
      setReady(false);
      api?.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [chart.zones, chart.notes, chart.margin]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!ready || !series || chart.candles.length === 0) return;
    void import("lightweight-charts").then((lc) => {
      if (seriesRef.current !== series) return;
      series.setData(
        chart.candles.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
      );
      for (const line of linesRef.current) series.removePriceLine(line);
      linesRef.current = [];
      const bull = token("--color-bull", "#7eab95");
      const bear = token("--color-bear", "#c48986");
      const accent = token("--color-accent", "#e4d5bb");
      const used: number[] = [];
      const key = ["вход", "стоп", "EQ", "верх", "низ"];
      for (const lv of chart.levels) {
        if (!key.includes(lv.name)) continue;
        if (used.some((p) => Math.abs(p - lv.price) / Math.max(lv.price, 1e-8) < 0.0008)) continue;
        used.push(lv.price);
        linesRef.current.push(
          series.createPriceLine({
            price: lv.price,
            color: toneColor(lv.tone, bull, bear, accent),
            lineWidth: lv.name === "вход" || lv.name === "стоп" ? 2 : 1,
            lineStyle: lv.name === "вход" ? lc.LineStyle.Solid : lc.LineStyle.Dashed,
            axisLabelVisible: true,
            title: `${lv.name} ${lv.priceLabel}`,
          }),
        );
      }
      chartRef.current?.timeScale().fitContent();
    });
  }, [chart.candles, chart.levels, ready]);

  return (
    <div className="relative h-[420px] overflow-hidden rounded-[inherit] sm:h-[520px]">
      <div ref={hostRef} className="absolute inset-0" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0" />
    </div>
  );
}
