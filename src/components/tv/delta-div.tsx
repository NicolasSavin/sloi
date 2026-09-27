import { useEffect, useRef, useState } from "react";
import { fetchCustomBars, fetchMarket } from "@/lib/market/fetch";
import type { Candle } from "@/lib/market/types";
import { deltaOf } from "@/lib/smc/flow";

type Line = { a: number; ap: number; b: number; bp: number; text: string; color: string };

export function DeltaDivergence({ pair, minutes }: { pair: string; minutes: number }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [rows, setRows] = useState<Candle[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [caption, setCaption] = useState("Дивергенция стола");

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const standard = ({ 5: "5m", 15: "15m", 60: "1h", 240: "4h", 1440: "1d" } as const)[minutes];
        const candles = standard
          ? (await fetchMarket({ data: { symbol: pair, timeframe: standard } })).candles
          : (await fetchCustomBars({ data: { symbol: pair, minutes } })).candles;
        const view = candles.slice(-70);
        if (stop) return;
        setRows(view);
        const { analyzeMarket } = await import("@/lib/smc/engine");
        const snap = analyzeMarket(view, null, undefined, { symbol: pair });
        const next: Line[] = [];
        const div = snap.flow.cvdDiv;
        if (div?.from && div.to) {
          next.push({
            a: div.from.time,
            ap: div.from.price,
            b: div.to.time,
            bp: div.to.price,
            text: div.side === "bull" ? "дельта бычья" : "дельта медвежья",
            color: div.side === "bull" ? "#7dffa8" : "#ffb020",
          });
        }
        const rsi = snap.divergences.filter((d) => !d.played).at(-1);
        if (rsi) {
          const i = nearest(view, rsi.priceTime);
          const c = view[i];
          if (c) {
            next.push({
              a: c.time,
              ap: rsi.side === "bull" ? c.low : c.high,
              b: c.time,
              bp: rsi.side === "bull" ? c.low : c.high,
              text: rsi.side === "bull" ? "RSI бычья" : "RSI медвежья",
              color: rsi.side === "bull" ? "#5ec8ff" : "#d58bff",
            });
          }
        }
        setLines(next);
        setCaption(div ? div.therefore : rsi?.note ?? "Регулярной дивергенции дельты и RSI нет");
      } catch {
        if (!stop) {
          setRows([]);
          setLines([]);
        }
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
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0e1118";
      ctx.fillRect(0, 0, w, h);
      if (rows.length < 8) return;
      const split = Math.round(h * 0.62);
      const min = Math.min(...rows.map((c) => c.low));
      const max = Math.max(...rows.map((c) => c.high));
      const xOf = (i: number) => 8 + ((w - 16) * i) / Math.max(rows.length - 1, 1);
      const yOf = (p: number) => 18 + ((max - p) / (max - min || 1)) * (split - 26);
      const slot = (w - 16) / rows.length;
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
        ctx.fillRect(x - Math.max(slot * 0.28, 1), top, Math.max(slot * 0.56, 2), Math.max(bot - top, 1));
      });
      const delta = rows.map(deltaOf);
      const peak = Math.max(...delta.map((v) => Math.abs(v)), 1);
      const mid = split + (h - split) * 0.55;
      delta.forEach((v, i) => {
        const bh = (Math.abs(v) / peak) * ((h - split) * 0.38);
        ctx.fillStyle = v >= 0 ? "rgba(38,166,154,0.85)" : "rgba(242,54,69,0.85)";
        ctx.fillRect(xOf(i) - Math.max(slot * 0.28, 1), v >= 0 ? mid - bh : mid, Math.max(slot * 0.56, 2), Math.max(bh, 1));
      });
      for (const line of lines) {
        const ia = nearest(rows, line.a);
        const ib = nearest(rows, line.b);
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(xOf(ia), yOf(line.ap));
        ctx.lineTo(xOf(ib), yOf(line.bp));
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.font = "bold 12px sans-serif";
        ctx.fillStyle = line.color;
        ctx.fillText(line.text, xOf(ib) + 6, yOf(line.bp));
      }
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows, lines]);

  return (
    <div ref={box} className="relative h-40 shrink-0 border-t border-white/10 bg-[#0e1118]">
      <canvas ref={canvas} className="absolute inset-0" />
      <p className="pointer-events-none absolute left-2 top-1 max-w-[70%] truncate text-[11px] text-zinc-300">{caption}</p>
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
