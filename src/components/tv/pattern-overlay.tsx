import { useEffect, useRef, useState } from "react";
import { fetchCustomBars, fetchMarket } from "@/lib/market/fetch";
import type { Candle } from "@/lib/market/types";
import { deltaDivergenceOn } from "@/lib/smc/delta-div";

type Pt = { i: number; price: number; label: string };
type Fig = { name: string; color: string; up: boolean; ring: Pt[]; neck: [Pt, Pt] | null; rails: boolean };
type Line = { a: Pt; b: Pt; name: string; color: string };

const TF = { 5: "5m", 15: "15m", 60: "1h", 240: "4h", 1440: "1d" } as const;

/** Найденные фигуры линиями на свечах TradingView. */
export function PatternOverlay({ pair, minutes, figures, divergence }: { pair: string; minutes: number; figures: boolean; divergence: boolean }) {
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
          ? (await fetchMarket({ data: { symbol: pair, timeframe: standard } })).candles.slice(-span(minutes))
          : (await fetchCustomBars({ data: { symbol: pair, minutes } })).candles.slice(-span(minutes));
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
        const picked = [...snap.patterns].sort((a, b) => {
          const last = (p: (typeof snap.patterns)[number]) => Math.max(...p.points.map((pt) => pt.time));
          return last(b) - last(a);
        });
        const p = figures ? picked[0] : undefined;
        if (p) {
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
                color: "#ffb020",
                up,
                ring: [top[0]!, top[top.length - 1]!, bot[0]!, bot[bot.length - 1]!],
                neck: null,
                rails: true,
              });
            }
          } else {
            const neckPts = ordered.filter((pt) => pt.label === "шея");
            next.push({
              name: p.name,
              color: "#5ec8ff",
              up,
              ring: ordered,
              neck: neckPts.length >= 2 ? [neckPts[0]!, neckPts[neckPts.length - 1]!] : null,
              rails: false,
            });
          }
        }
        const extra: Line[] = [];
        const div = deltaDivergenceOn(candles);
        if (divergence && div) {
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
  }, [pair, minutes, figures, divergence]);

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
      const left = 58;
      const right = r.width - 68;
      const top = 48;
      const bot = r.height * 0.62;
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
        ctx.lineWidth = 3.5;
        const stroke = (a: Pt, b: Pt) => {
          ctx.beginPath();
          ctx.moveTo(xOf(a.i), yOf(a.price));
          ctx.lineTo(xOf(b.i), yOf(b.price));
          ctx.stroke();
        };
        if (fig.rails && fig.ring.length >= 4) {
          const topA = fig.ring[0]!;
          const topB = fig.ring[1]!;
          const botA = fig.ring[2]!;
          const botB = fig.ring[3]!;
          ctx.beginPath();
          ctx.moveTo(xOf(topA.i), yOf(topA.price));
          ctx.lineTo(xOf(topB.i), yOf(topB.price));
          ctx.lineTo(xOf(botB.i), yOf(botB.price));
          ctx.lineTo(xOf(botA.i), yOf(botA.price));
          ctx.closePath();
          ctx.fillStyle = "rgba(255, 176, 32, 0.22)";
          ctx.fill();
          stroke(topA, topB);
          stroke(botA, botB);
        } else {
          ctx.beginPath();
          fig.ring.forEach((pt, i) => {
            const x = xOf(pt.i);
            const y = yOf(pt.price);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
        }
        const seen: Array<{ x: number; y: number }> = [];
        const place = (text: string, x: number, y: number, color: string) => {
          let yy = y;
          for (let n = 0; n < 8; n++) {
            if (!seen.some((s) => Math.abs(s.x - x) < 90 && Math.abs(s.y - yy) < 20)) break;
            yy -= 20;
          }
          seen.push({ x, y: yy });
          label(text, x, yy, color);
        };
        ctx.fillStyle = fig.color;
        for (const pt of fig.ring) {
          ctx.beginPath();
          ctx.arc(xOf(pt.i), yOf(pt.price), 4, 0, Math.PI * 2);
          ctx.fill();
          const word = plain(pt.label);
          if (word && word !== "верх" && word !== "низ" && word !== "шея") place(word, xOf(pt.i) + 8, yOf(pt.price) - 10, fig.color);
        }
        if (fig.neck) {
          ctx.setLineDash([6, 4]);
          stroke(fig.neck[0], fig.neck[1]);
          ctx.setLineDash([]);
          place("шея", xOf(fig.neck[1].i) + 8, yOf(fig.neck[1].price) + 18, fig.color);
        }
        const tip = fig.ring.reduce((a, b) => (a.i > b.i ? a : b));
        const ax = Math.min(xOf(tip.i) + 36, right - 18);
        const ay = yOf(tip.price);
        arrow(ctx, ax, ay, fig.up, fig.up ? "#26a69a" : "#f23645");
        place(`${fig.name}. ${fig.up ? "Ждём ход вверх" : "Ждём ход вниз"}`, left + 8, top + 28, fig.up ? "#b7f0dc" : "#ffd0a8");
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

function span(minutes: number) {
  if (minutes <= 15) return 280;
  if (minutes <= 60) return 336;
  if (minutes <= 240) return 180;
  return 140;
}

function plain(label: string) {
  if (label === "T1") return "левая вершина";
  if (label === "T2") return "правая вершина";
  if (label === "B1") return "левое дно";
  if (label === "B2") return "правое дно";
  if (label === "H") return "голова";
  return label;
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
