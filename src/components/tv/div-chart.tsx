import { useEffect, useRef, useState } from "react";
import { fetchCustomBars, fetchMarket } from "@/lib/market/fetch";
import type { Candle } from "@/lib/market/types";
import { latestDeltaDivergence } from "@/lib/smc/delta-div";
import { deltaOf } from "@/lib/smc/flow";

export function DivChart({ pair, minutes }: { pair: string; minutes: number }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [rows, setRows] = useState<Candle[]>([]);
  const [line, setLine] = useState<{ a: number; ap: number; b: number; bp: number; name: string } | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const standard = ({ 5: "5m", 15: "15m", 60: "1h", 240: "4h", 1440: "1d" } as const)[minutes];
        const candles = standard
          ? (await fetchMarket({ data: { symbol: pair, timeframe: standard } })).candles
          : (await fetchCustomBars({ data: { symbol: pair, minutes } })).candles;
        const view = candles.slice(-80);
        if (stop) return;
        const { analyzeMarket } = await import("@/lib/smc/engine");
        const snap = analyzeMarket(view, null, undefined, { symbol: pair });
        const hit = latestDeltaDivergence(snap.swings, snap.flow.bars);
        setRows(view);
        setLine(
          hit
            ? {
                a: hit.a.time,
                ap: hit.a.price,
                b: hit.b.time,
                bp: hit.b.price,
                name: hit.bull ? "дивер дельты бычий" : "дивер дельты медвежий",
              }
            : null,
        );
      } catch {
        if (!stop) setRows([]);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [pair, minutes]);

  useEffect(() => {
    const el = box.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const paint = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      cv.width = Math.max(1, Math.floor(w * dpr));
      cv.height = Math.max(1, Math.floor(h * dpr));
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      const ctx = cv.getContext("2d");
      if (!ctx || rows.length < 8) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#131722";
      ctx.fillRect(0, 0, w, h);
      const split = Math.round(h * 0.78);
      const min = Math.min(...rows.map((c) => c.low));
      const max = Math.max(...rows.map((c) => c.high));
      const xOf = (i: number) => 16 + ((w - 78) * i) / Math.max(rows.length - 1, 1);
      const yOf = (p: number) => 36 + ((max - p) / (max - min || 1)) * (split - 52);
      const slot = (w - 78) / rows.length;
      rows.forEach((c, i) => {
        const up = c.close >= c.open;
        ctx.strokeStyle = up ? "#26a69a" : "#ef5350";
        ctx.fillStyle = ctx.strokeStyle;
        const x = xOf(i);
        ctx.beginPath();
        ctx.moveTo(x, yOf(c.high));
        ctx.lineTo(x, yOf(c.low));
        ctx.stroke();
        const top = yOf(Math.max(c.open, c.close));
        const bot = yOf(Math.min(c.open, c.close));
        ctx.fillRect(x - Math.max(slot * 0.3, 1.4), top, Math.max(slot * 0.6, 2.8), Math.max(bot - top, 1));
      });
      const delta = rows.map(deltaOf);
      const peak = Math.max(...delta.map((v) => Math.abs(v)), 1);
      const paneTop = split + 6;
      const paneBot = h - 8;
      const mid = (paneTop + paneBot) / 2;
      const room = (paneBot - paneTop) / 2;
      delta.forEach((v, i) => {
        const bh = (Math.abs(v) / peak) * room;
        ctx.fillStyle = v >= 0 ? "rgba(38,166,154,0.9)" : "rgba(242,54,69,0.9)";
        ctx.fillRect(xOf(i) - Math.max(slot * 0.3, 1.4), v >= 0 ? mid - bh : mid, Math.max(slot * 0.6, 2.8), Math.max(bh, 1));
      });
      ctx.fillStyle = "#d6ff4a";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText(line ? line.name : "дивергенции дельты нет", 16, 24);
      if (!line) return;
      const ia = nearest(rows, line.a);
      const ib = nearest(rows, line.b);
      ctx.strokeStyle = "#d6ff4a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xOf(ia), yOf(line.ap));
      ctx.lineTo(xOf(ib), yOf(line.bp));
      ctx.stroke();
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows, line]);

  return (
    <div ref={box} className="absolute inset-0 z-10 bg-[#131722]">
      <canvas ref={canvas} className="absolute inset-0" />
    </div>
  );
}

function nearest(rows: Candle[], time: number) {
  let best = 0;
  let dist = Infinity;
  rows.forEach((c, i) => {
    const d = Math.abs(c.time - time);
    if (d < dist) {
      dist = d;
      best = i;
    }
  });
  return best;
}
