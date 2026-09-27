import { useEffect, useRef, useState } from "react";
import { fetchCustomBars, fetchMarket } from "@/lib/market/fetch";
import type { Candle } from "@/lib/market/types";
import { deltaDivergenceOn } from "@/lib/smc/delta-div";

type Pt = { i: number; price: number; label: string };
type Fig = { name: string; color: string; up: boolean; ring: Pt[]; neck: [Pt, Pt] | null };
type Line = { a: Pt; b: Pt; name: string; color: string };

const TF = { 5: "5m", 15: "15m", 60: "1h", 240: "4h", 1440: "1d" } as const;

/** Найденные фигуры линиями на свечах TradingView. */
export function PatternOverlay({ pair, minutes }: { pair: string; minutes: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [rows, setRows] = useState<Candle[]>([]);
  const [figs, setFigs] = useState<Fig[]>([]);
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    let stop = false;
    const standard = TF[minutes as keyof typeof TF];
    void (async () => {
      try {
        const candles = standard
          ? (await fetchMarket({ data: { symbol: pair, timeframe: standard } })).candles.slice(-120)
          : (await fetchCustomBars({ data: { symbol: pair, minutes } })).candles.slice(-120);
        if (stop) return;
        const { analyzeMarket } = await import("@/lib/smc/engine");
        const snap = analyzeMarket(candles, null, undefined, { symbol: pair });
        const at = (time: number) => {
          let best = 0;
          let dist = Infinity;
          candles.forEach((c, i) => {
            const d = Math.abs(c.time - time);
            if (d < dist) {
              dist = d;
              best = i;
            }
          });
          return best;
        };
        const next: Fig[] = [];
        const colors = ["#ffb020", "#5ec8ff", "#d58bff"];
        const picked = [...snap.patterns].sort((a, b) => rank(a.id) - rank(b.id)).slice(0, 3);
        for (const [n, p] of picked.entries()) {
          const color = colors[n] ?? "#ffb020";
          const ordered = p.points
            .map((pt) => wick(candles, at(pt.time), pt.price, pt.label))
            .sort((a, b) => a.i - b.i);
          const up = p.side === "bull";
          if (p.id === "wedge" || p.id === "tri" || p.id === "exp") {
            const top = ordered.filter((pt) => pt.label === "верх");
            const bot = ordered.filter((pt) => pt.label === "низ");
            if (top.length >= 2 && bot.length >= 2) {
              next.push({
                name: p.name,
                color,
                up,
                ring: [top[0]!, top[top.length - 1]!, bot[bot.length - 1]!, bot[0]!],
                neck: null,
              });
            }
            continue;
          }
          const neckPts = ordered.filter((pt) => pt.label === "шея");
          next.push({
            name: p.name,
            color,
            up,
            ring: ordered,
            neck: neckPts.length >= 2 ? [neckPts[0]!, neckPts[neckPts.length - 1]!] : null,
          });
        }
        const extra: Line[] = [];
        const div = deltaDivergenceOn(candles);
        if (div) {
          extra.push({
            a: wick(candles, at(div.a.time), div.a.price, div.onHigh ? "верх" : "низ"),
            b: wick(candles, at(div.b.time), div.b.price, div.onHigh ? "верх" : "низ"),
            name: div.bull ? "дивер дельты вверх" : "дивер дельты вниз",
            color: "#d6ff4a",
          });
        }
        setRows(candles);
        setFigs(next);
        setLines(extra);
      } catch {
        if (!stop) {
          setFigs([]);
          setLines([]);
        }
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
      if (rows.length < 2 || (figs.length === 0 && lines.length === 0)) return;
      const left = 56;
      const right = r.width - 72;
      const top = 36;
      const bot = r.height - 78;
      if (right - left < 40 || bot - top < 40) return;
      let min = Math.min(...rows.map((c) => c.low));
      let max = Math.max(...rows.map((c) => c.high));
      const pad = (max - min) * 0.08 || 1;
      min -= pad;
      max += pad;
      const xOf = (i: number) => left + ((right - left) * i) / (rows.length - 1);
      const yOf = (price: number) => top + ((max - price) / (max - min)) * (bot - top);
      const label = (text: string, x: number, y: number, color: string) => {
        ctx.font = "bold 13px sans-serif";
        const w = ctx.measureText(text).width;
        const lx = Math.min(Math.max(left, x), right - w - 8);
        ctx.fillStyle = "rgba(12, 16, 24, 0.86)";
        ctx.fillRect(lx - 4, y - 14, w + 8, 18);
        ctx.fillStyle = color;
        ctx.fillText(text, lx, y);
      };
      for (const fig of figs) {
        if (fig.ring.length < 2) continue;
        ctx.strokeStyle = fig.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        fig.ring.forEach((pt, i) => {
          const x = xOf(pt.i);
          const y = yOf(pt.price);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        if (fig.ring.length <= 4) ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = fig.color;
        for (const pt of fig.ring) {
          ctx.beginPath();
          ctx.arc(xOf(pt.i), yOf(pt.price), 4, 0, Math.PI * 2);
          ctx.fill();
          if (pt.label && pt.label !== "верх" && pt.label !== "низ" && pt.label !== "шея") {
            label(pt.label, xOf(pt.i) + 8, yOf(pt.price) - 8, fig.color);
          }
        }
        if (fig.neck) {
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(xOf(fig.neck[0].i), yOf(fig.neck[0].price));
          ctx.lineTo(xOf(fig.neck[1].i), yOf(fig.neck[1].price));
          ctx.stroke();
          ctx.setLineDash([]);
          label("шея", xOf(fig.neck[1].i) + 8, yOf(fig.neck[1].price) + 16, fig.color);
        }
        const tip = fig.ring.reduce((a, b) => (a.i > b.i ? a : b));
        const ax = Math.min(xOf(tip.i) + 28, right - 16);
        const ay = yOf(tip.price);
        arrow(ctx, ax, ay, fig.up, fig.up ? "#26a69a" : "#f23645");
        label(`${fig.name}: ${fig.up ? "вверх" : "вниз"}`, ax - 10, fig.up ? ay - 54 : ay + 62, fig.up ? "#b7f0dc" : "#ffc1c6");
      }
      for (const line of lines) {
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(xOf(line.a.i), yOf(line.a.price));
        ctx.lineTo(xOf(line.b.i), yOf(line.b.price));
        ctx.stroke();
        for (const pt of [line.a, line.b]) {
          ctx.beginPath();
          ctx.arc(xOf(pt.i), yOf(pt.price), 3.5, 0, Math.PI * 2);
          ctx.fillStyle = line.color;
          ctx.fill();
        }
        if (!line.name) continue;
        const x = xOf(line.a.i) + 6;
        const y = yOf(line.a.price) - 8;
        ctx.font = "bold 13px sans-serif";
        const w = ctx.measureText(line.name).width;
        ctx.fillStyle = "rgba(12, 16, 24, 0.82)";
        ctx.fillRect(x - 4, y - 14, w + 8, 18);
        ctx.fillStyle = line.color;
        ctx.fillText(line.name, x, y);
      }
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [rows, lines, figs]);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 z-10" />;
}

function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, up: boolean, color: string) {
  const dir = up ? -1 : 1;
  const len = 42;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + dir * len);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y + dir * len);
  ctx.lineTo(x - 8, y + dir * (len - 14));
  ctx.lineTo(x + 8, y + dir * (len - 14));
  ctx.closePath();
  ctx.fill();
}

function rank(id: string) {
  if (id === "dragon" || id === "idragon") return 0;
  if (id === "hs" || id === "ihs") return 1;
  return 2;
}

function wick(rows: Candle[], i: number, price: number, label = ""): Pt {
  const at = Math.min(rows.length - 1, Math.max(0, Math.round(i)));
  const c = rows[at];
  if (!c) return { i: at, price, label };
  const high = new Set(["T1", "T2", "H", "верх", "горб", "левая голова", "правая голова", "голова"]);
  const low = new Set(["B1", "B2", "L", "низ", "дно", "лапа", "впадина", "брюхо", "левая лапа", "правая лапа", "плечо"]);
  if (high.has(label)) return { i: at, price: c.high, label };
  if (low.has(label)) return { i: at, price: c.low, label };
  return { i: at, price: Math.abs(c.high - price) <= Math.abs(c.low - price) ? c.high : c.low, label };
}
