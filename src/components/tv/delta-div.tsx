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
  const [title, setTitle] = useState("Смотрю дельту…");
  const [caption, setCaption] = useState("");
  const [tone, setTone] = useState("text-zinc-200");

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const standard = ({ 5: "5m", 15: "15m", 60: "1h", 240: "4h", 1440: "1d" } as const)[minutes];
        const candles = standard
          ? (await fetchMarket({ data: { symbol: pair, timeframe: standard } })).candles
          : (await fetchCustomBars({ data: { symbol: pair, minutes } })).candles;
        if (stop) return;
        const { analyzeMarket } = await import("@/lib/smc/engine");
        const snap = analyzeMarket(candles.slice(-120), null, undefined, { symbol: pair });
        const div = snap.flow.cvdDiv;
        const rsi = snap.divergences.filter((d) => !d.played).at(-1);
        const next: Line[] = [];
        let view = candles.slice(-40);
        if (div?.from && div.to) {
          const ia = nearest(candles, div.from.time);
          const ib = nearest(candles, div.to.time);
          const lo = Math.max(0, Math.min(ia, ib) - 4);
          const hi = Math.min(candles.length, Math.max(ia, ib) + 5);
          view = candles.slice(lo, hi);
          next.push({
            a: div.from.time,
            ap: div.from.price,
            b: div.to.time,
            bp: div.to.price,
            text: div.side === "bull" ? "дельта бычья" : "дельта медвежья",
            color: div.side === "bull" ? "#7dffa8" : "#ffb020",
          });
          setTitle(div.side === "bull" ? "Дельта бычья" : "Дельта медвежья");
          setTone(div.side === "bull" ? "text-emerald-300" : "text-amber-300");
          setCaption(rsi ? `${div.because} ${rsi.side === "bull" ? "RSI тоже бычий." : "RSI тоже медвежий."}` : div.because);
        } else if (rsi) {
          setTitle(rsi.side === "bull" ? "RSI бычья" : "RSI медвежья");
          setTone(rsi.side === "bull" ? "text-sky-300" : "text-fuchsia-300");
          setCaption(rsi.note);
        } else {
          setTitle("Расхождения нет");
          setTone("text-zinc-200");
          setCaption("Цена и дельта идут в одну сторону. Отдельного сигнала на разворот стол не видит.");
        }
        setRows(view);
        setLines(next);
      } catch {
        if (!stop) {
          setTitle("Дельта не пришла");
          setCaption("");
          setRows([]);
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
      if (!ctx || rows.length < 4) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const split = Math.round(h * 0.68);
      const min = Math.min(...rows.map((c) => c.low));
      const max = Math.max(...rows.map((c) => c.high));
      const xOf = (i: number) => 12 + ((w - 24) * i) / Math.max(rows.length - 1, 1);
      const yOf = (p: number) => 8 + ((max - p) / (max - min || 1)) * (split - 16);
      const slot = (w - 24) / rows.length;
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
        ctx.fillRect(x - Math.max(slot * 0.3, 1.5), top, Math.max(slot * 0.6, 3), Math.max(bot - top, 1));
      });
      const delta = rows.map(deltaOf);
      const peak = Math.max(...delta.map((v) => Math.abs(v)), 1);
      const base = h - 8;
      const room = h - split - 12;
      delta.forEach((v, i) => {
        const bh = (Math.abs(v) / peak) * room;
        ctx.fillStyle = v >= 0 ? "rgba(38,166,154,0.9)" : "rgba(242,54,69,0.9)";
        ctx.fillRect(xOf(i) - Math.max(slot * 0.3, 1.5), v >= 0 ? base - bh : base - room, Math.max(slot * 0.6, 3), Math.max(bh, 1));
      });
      for (const line of lines) {
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(xOf(nearest(rows, line.a)), yOf(line.ap));
        ctx.lineTo(xOf(nearest(rows, line.b)), yOf(line.bp));
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows, lines]);

  return (
    <div className="flex h-36 shrink-0 border-t border-white/10 bg-[#0e1118]">
      <div className="flex w-80 shrink-0 flex-col justify-center px-3">
        <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Дивергенция стола</p>
        <p className={`mt-1 text-base font-semibold ${tone}`}>{title}</p>
        <p className="mt-1 text-xs leading-snug text-zinc-300">{caption}</p>
      </div>
      <div ref={box} className="relative min-w-0 flex-1">
        <canvas ref={canvas} className="absolute inset-0" />
      </div>
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
