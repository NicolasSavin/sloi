import { useEffect, useRef, useState } from "react";
import { fetchCustomBars, fetchMarket } from "@/lib/market/fetch";
import type { Candle } from "@/lib/market/types";
import { deltaDivergenceOn, type DivHit } from "@/lib/smc/delta-div";
import { deltaOf } from "@/lib/smc/flow";

const TF = { 5: "5m", 15: "15m", 60: "1h", 240: "4h", 1440: "1d" } as const;

type Bar = { o: number; h: number; l: number; c: number; time: number };

/** Одна дельта объёма свечами вокруг нуля, прямо под графиком. Второго объёма нет. */
export function DeltaLine({ pair, minutes, open }: { pair: string; minutes: number; open: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [bars, setBars] = useState<Bar[]>([]);
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
        const slice = candles.slice(-120);
        const next = toCandles(slice);
        setBars(next);
        setHit(deltaDivergenceOn(slice));
      } catch {
        if (!stop) {
          setBars([]);
          setHit(null);
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, [pair, minutes]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const paint = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
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
      ctx.fillStyle = "#131722";
      ctx.fillRect(0, 0, r.width, r.height);
      if (bars.length < 2) return;
      const left = 8;
      const right = r.width - 8;
      const top = 22;
      const bot = r.height - 6;
      let min = Math.min(...bars.map((b) => b.l), 0);
      let max = Math.max(...bars.map((b) => b.h), 0);
      const pad = (max - min) * 0.08 || 1;
      min -= pad;
      max += pad;
      const yOf = (v: number) => top + ((max - v) / (max - min)) * (bot - top);
      const slot = (right - left) / bars.length;
      const zero = yOf(0);
      ctx.strokeStyle = "rgba(180, 188, 200, 0.45)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(left, zero);
      ctx.lineTo(right, zero);
      ctx.stroke();
      ctx.setLineDash([]);
      bars.forEach((b, n) => {
        const x = left + n * slot + slot / 2;
        const up = b.c >= b.o;
        ctx.strokeStyle = up ? "#26a69a" : "#ef5350";
        ctx.fillStyle = up ? "#26a69a" : "#ef5350";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, yOf(b.h));
        ctx.lineTo(x, yOf(b.l));
        ctx.stroke();
        const bodyTop = yOf(Math.max(b.o, b.c));
        const bodyBot = yOf(Math.min(b.o, b.c));
        const w = Math.max(slot * 0.62, 2);
        ctx.fillRect(x - w / 2, bodyTop, w, Math.max(bodyBot - bodyTop, 1));
      });
      if (hit) {
        const ia = bars.findIndex((b) => b.time === hit.a.time);
        const ib = bars.findIndex((b) => b.time === hit.b.time);
        if (ia >= 0 && ib >= 0) {
          const x = (i: number) => left + i * slot + slot / 2;
          const color = hit.bull ? "#26a69a" : "#f23645";
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(x(ia), yOf(bars[ia]!.c));
          ctx.lineTo(x(ib), yOf(bars[ib]!.c));
          ctx.stroke();
          ctx.font = "bold 13px sans-serif";
          ctx.fillStyle = color;
          ctx.fillText(hit.bull ? "дивер дельты, вверх" : "дивер дельты, вниз", x(ia) + 6, yOf(bars[ia]!.c) - 8);
        }
      }
    };
    paint();
    const ro = new ResizeObserver(paint);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, [bars, hit, open]);

  if (!open) return null;
  return (
    <div className="relative h-36 shrink-0 border-t border-white/10 bg-[#131722]">
      <canvas ref={ref} className="absolute inset-0" />
    </div>
  );
}

function toCandles(rows: Candle[]): Bar[] {
  let cvd = 0;
  let prev = 0;
  return rows.map((c) => {
    const d = deltaOf(c);
    const o = prev;
    cvd += d;
    const span = Math.max(Math.abs(d) * 0.35, Math.abs(cvd - o) * 0.25);
    const bar = {
      time: c.time,
      o,
      c: cvd,
      h: Math.max(o, cvd) + span * 0.65,
      l: Math.min(o, cvd) - span * 0.35,
    };
    prev = cvd;
    return bar;
  });
}
