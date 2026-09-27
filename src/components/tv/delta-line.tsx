import { useEffect, useRef, useState } from "react";
import { fetchCustomBars, fetchMarket } from "@/lib/market/fetch";
import type { Candle } from "@/lib/market/types";
import { deltaDivergenceOn, type DivHit } from "@/lib/smc/delta-div";

const TF = { 5: "5m", 15: "15m", 60: "1h", 240: "4h", 1440: "1d" } as const;

/** Линия дивергенции дельты поверх свечей TradingView, без своей панели объёма. */
export function DeltaLine({ pair, minutes }: { pair: string; minutes: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [rows, setRows] = useState<Candle[]>([]);
  const [hit, setHit] = useState<DivHit | null>(null);

  useEffect(() => {
    let stop = false;
    const standard = TF[minutes as keyof typeof TF];
    void (async () => {
      try {
        const candles = standard
          ? (await fetchMarket({ data: { symbol: pair, timeframe: standard } })).candles
          : (await fetchCustomBars({ data: { symbol: pair, minutes } })).candles;
        if (stop) return;
        const slice = candles.slice(-150);
        setRows(slice);
        setHit(deltaDivergenceOn(slice));
      } catch {
        if (!stop) setHit(null);
      }
    })();
    return () => {
      stop = true;
    };
  }, [pair, minutes]);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const paint = () => {
      const r = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);
      if (!hit || rows.length < 2) return;
      const left = 54;
      const right = r.width - 68;
      const top = 32;
      const bot = r.height - 46;
      if (right - left < 40 || bot - top < 40) return;
      let min = Math.min(...rows.map((c) => c.low));
      let max = Math.max(...rows.map((c) => c.high));
      const pad = (max - min) * 0.06 || Math.abs(max) * 0.001 || 1;
      min -= pad;
      max += pad;
      const xOf = (time: number) => {
        let n = rows.findIndex((c) => c.time === time);
        if (n < 0) n = rows.length - 1;
        return left + ((right - left) * n) / (rows.length - 1);
      };
      const yOf = (price: number) => top + ((max - price) / (max - min)) * (bot - top);
      const ax = xOf(hit.a.time);
      const ay = yOf(hit.a.price);
      const bx = xOf(hit.b.time);
      const by = yOf(hit.b.price);
      ctx.strokeStyle = hit.bull ? "#26a69a" : "#f23645";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const [x, y] of [
        [ax, ay],
        [bx, by],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = hit.bull ? "#26a69a" : "#f23645";
        ctx.fill();
      }
      ctx.font = "bold 14px sans-serif";
      ctx.fillStyle = hit.bull ? "#b7f0dc" : "#ffc1c6";
      const text = hit.bull ? "дивер дельты, вверх" : "дивер дельты, вниз";
      ctx.fillText(text, Math.min(ax, bx) + 8, Math.min(ay, by) - 10);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [hit, rows]);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 z-10" />;
}
