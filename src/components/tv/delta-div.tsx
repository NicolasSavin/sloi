import { useEffect, useRef, useState } from "react";
import { fetchCustomBars, fetchMarket } from "@/lib/market/fetch";
import type { Candle } from "@/lib/market/types";

type Mark = { i: number; side: "bull" | "bear" };

export function DeltaDivergence({ pair, minutes }: { pair: string; minutes: number }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [rows, setRows] = useState<Candle[]>([]);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const standard = ({ 5: "5m", 15: "15m", 60: "1h", 240: "4h", 1440: "1d" } as const)[minutes];
        const candles = standard
          ? (await fetchMarket({ data: { symbol: pair, timeframe: standard } })).candles
          : (await fetchCustomBars({ data: { symbol: pair, minutes } })).candles;
        if (!stop) setRows(candles.slice(-80));
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
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0e1118";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#d4d4d8";
      ctx.font = "12px sans-serif";
      ctx.fillText("Дивергенция дельты", 10, 16);
      if (rows.length < 8) return;
      const delta = rows.map(barDelta);
      const cvd = delta.reduce<number[]>((acc, v) => {
        acc.push((acc.at(-1) ?? 0) + v);
        return acc;
      }, []);
      const marks = divergences(rows, cvd);
      const max = Math.max(...delta.map((v) => Math.abs(v)), 1);
      const mid = h * 0.58;
      const slot = (w - 16) / rows.length;
      delta.forEach((v, i) => {
        const bh = (Math.abs(v) / max) * (h * 0.34);
        ctx.fillStyle = v >= 0 ? "rgba(38,166,154,0.9)" : "rgba(242,54,69,0.9)";
        ctx.fillRect(8 + i * slot, v >= 0 ? mid - bh : mid, Math.max(slot * 0.62, 1), Math.max(bh, 1));
      });
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.moveTo(8, mid);
      ctx.lineTo(w - 8, mid);
      ctx.stroke();
      for (const m of marks) {
        const x = 8 + m.i * slot + slot * 0.3;
        ctx.fillStyle = m.side === "bull" ? "#7dffa8" : "#ffb020";
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(m.side === "bull" ? "бычья" : "медвежья", x - 16, m.side === "bull" ? h - 8 : 32);
      }
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows]);

  return (
    <div ref={box} className="relative h-28 shrink-0 border-t border-white/10 bg-[#0e1118]">
      <canvas ref={canvas} className="absolute inset-0" />
    </div>
  );
}

function barDelta(c: Candle) {
  if (c.buyVolume != null && c.volume > 0) return c.buyVolume - (c.volume - c.buyVolume);
  const span = c.high - c.low;
  if (!(span > 0) || !(c.volume > 0)) return Math.sign(c.close - c.open);
  return c.volume * (2 * ((c.close - c.low) / span) - 1);
}

function divergences(rows: Candle[], cvd: number[]): Mark[] {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = 2; i < rows.length - 2; i++) {
    const p = rows[i]!;
    if (p.high >= rows[i - 1]!.high && p.high >= rows[i - 2]!.high && p.high > rows[i + 1]!.high && p.high > rows[i + 2]!.high) highs.push(i);
    if (p.low <= rows[i - 1]!.low && p.low <= rows[i - 2]!.low && p.low < rows[i + 1]!.low && p.low < rows[i + 2]!.low) lows.push(i);
  }
  const out: Mark[] = [];
  const h1 = highs.at(-2);
  const h2 = highs.at(-1);
  if (h1 != null && h2 != null && rows[h2]!.high > rows[h1]!.high && cvd[h2]! < cvd[h1]!) out.push({ i: h2, side: "bear" });
  const l1 = lows.at(-2);
  const l2 = lows.at(-1);
  if (l1 != null && l2 != null && rows[l2]!.low < rows[l1]!.low && cvd[l2]! > cvd[l1]!) out.push({ i: l2, side: "bull" });
  return out;
}
