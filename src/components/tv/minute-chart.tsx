import { useEffect, useRef, useState } from "react";
import { fetchCustomBars } from "@/lib/market/fetch";
import type { Candle } from "@/lib/market/types";

export function MinuteChart({ pair, minutes }: { pair: string; minutes: number }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [miss, setMiss] = useState("");

  useEffect(() => {
    let stop = false;
    setCandles([]);
    setMiss("");
    void fetchCustomBars({ data: { symbol: pair, minutes } })
      .then((res) => {
        if (stop) return;
        if (!res.candles.length) setMiss("Свечи на этот интервал не пришли.");
        else setCandles(res.candles);
      })
      .catch(() => {
        if (!stop) setMiss("Свечи на этот интервал не пришли.");
      });
    return () => {
      stop = true;
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
      ctx.fillStyle = "#131722";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#d4d4d8";
      ctx.font = "14px sans-serif";
      ctx.fillText(`${pair} · ${minutes} мин. TradingView такой интервал не отдаёт, свечи наши.`, 16, 28);
      if (candles.length < 2) return;
      const padL = 12;
      const padR = 72;
      const padY = 48;
      const min = Math.min(...candles.map((c) => c.low));
      const max = Math.max(...candles.map((c) => c.high));
      const xOf = (i: number) => padL + ((w - padL - padR) * i) / (candles.length - 1);
      const yOf = (p: number) => padY + ((max - p) / (max - min || 1)) * (h - padY - 16);
      const slot = (w - padL - padR) / candles.length;
      candles.forEach((c, i) => {
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
        ctx.fillRect(x - Math.max(slot * 0.32, 1.5), top, Math.max(slot * 0.64, 3), Math.max(bot - top, 1));
      });
      ctx.fillStyle = "#a1a1aa";
      ctx.font = "12px sans-serif";
      ctx.fillText(max.toLocaleString("en-US", { maximumFractionDigits: 5 }), w - padR + 6, padY + 4);
      ctx.fillText(min.toLocaleString("en-US", { maximumFractionDigits: 5 }), w - padR + 6, h - 12);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(el);
    return () => ro.disconnect();
  }, [candles, pair, minutes]);

  return (
    <div ref={box} className="absolute inset-0 bg-[#131722]">
      <canvas ref={canvas} className="absolute inset-0" />
      {miss ? <p className="absolute left-4 top-12 text-sm text-rose-300">{miss}</p> : null}
    </div>
  );
}
