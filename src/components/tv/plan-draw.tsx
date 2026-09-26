import { useEffect, useRef, useState, type MouseEvent } from "react";
import { fetchMarket } from "@/lib/market/fetch";
import type { Candle } from "@/lib/market/types";

type Tool = "entry" | "stop" | "target" | "line";
type Pt = { i: number; price: number };
type Stroke = { a: Pt; b: Pt };

const PAD_L = 12;
const PAD_R = 72;
const PAD_Y = 16;

export function PlanDraw({
  pair,
  busy,
  note,
  onClose,
  onSend,
}: {
  pair: string;
  busy: boolean;
  note: string;
  onClose: () => void;
  onSend: (how: "now" | "limit", plan: { side: "buy" | "sell"; entry: number; stop: number; target: number }) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [tool, setTool] = useState<Tool>("entry");
  const [entry, setEntry] = useState<number | null>(null);
  const [stop, setStop] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [lines, setLines] = useState<Stroke[]>([]);
  const [draft, setDraft] = useState<Pt | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let stopFetch = false;
    setCandles([]);
    setEntry(null);
    setStop(null);
    setTarget(null);
    setLines([]);
    setDraft(null);
    void fetchMarket({ data: { symbol: pair, timeframe: "1h" } }).then((payload) => {
      if (!stopFetch) setCandles(payload.candles.slice(-90));
    });
    return () => {
      stopFetch = true;
    };
  }, [pair]);

  useEffect(() => {
    const el = box.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const paint = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w < 20 || h < 20) return;
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.floor(w * dpr);
      cv.height = Math.floor(h * dpr);
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0e1116";
      ctx.fillRect(0, 0, w, h);
      if (candles.length < 2) {
        ctx.fillStyle = "#a1a1aa";
        ctx.font = "14px sans-serif";
        ctx.fillText("Свечи ещё грузятся…", 24, 36);
        return;
      }
      const { min, max } = span(candles, [entry, stop, target, ...lines.flatMap((l) => [l.a.price, l.b.price])]);
      const xOf = (i: number) => PAD_L + ((w - PAD_L - PAD_R) * i) / Math.max(candles.length - 1, 1);
      const yOf = (p: number) => PAD_Y + ((max - p) / (max - min || 1)) * (h - PAD_Y * 2);
      const slot = (w - PAD_L - PAD_R) / candles.length;
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
      for (const line of lines) drawLine(ctx, xOf(line.a.i), yOf(line.a.price), xOf(line.b.i), yOf(line.b.price), "#f0d7a8");
      level(ctx, w, yOf, entry, "#089981", "вход");
      level(ctx, w, yOf, stop, "#f23645", "стоп");
      level(ctx, w, yOf, target, "#c4a86e", "тейк");
      ctx.fillStyle = "#71717a";
      ctx.font = "11px sans-serif";
      ctx.fillText(px(max), w - PAD_R + 8, PAD_Y + 4);
      ctx.fillText(px(min), w - PAD_R + 8, h - PAD_Y);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(el);
    return () => ro.disconnect();
  }, [candles, entry, stop, target, lines]);

  function at(e: MouseEvent<HTMLCanvasElement>): Pt | null {
    const el = box.current;
    if (!el || candles.length < 2) return null;
    const r = el.getBoundingClientRect();
    const w = r.width;
    const h = r.height;
    const { min, max } = span(candles, [entry, stop, target, ...lines.flatMap((l) => [l.a.price, l.b.price])]);
    const i = ((e.clientX - r.left - PAD_L) / (w - PAD_L - PAD_R)) * (candles.length - 1);
    const price = max - ((e.clientY - r.top - PAD_Y) / (h - PAD_Y * 2)) * (max - min);
    if (!Number.isFinite(price)) return null;
    return { i: Math.min(candles.length - 1, Math.max(0, i)), price };
  }

  function click(e: MouseEvent<HTMLCanvasElement>) {
    const p = at(e);
    if (!p) return;
    setErr("");
    if (tool === "entry") setEntry(p.price);
    else if (tool === "stop") setStop(p.price);
    else if (tool === "target") setTarget(p.price);
    else if (!draft) setDraft(p);
    else {
      setLines((rows) => [...rows, { a: draft, b: p }]);
      setDraft(null);
    }
  }

  const plan = orderOf(entry, stop, target);

  function send(how: "now" | "limit") {
    if (!plan) {
      setErr("Нужны три цены: вход, стоп и тейк. Стоп и тейк с разных сторон входа.");
      return;
    }
    onSend(how, plan);
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[#0e1116]">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="text-xs tracking-[0.16em] text-amber-100/80">ПЛАН {pair}</span>
        <Tool name="Вход" on={tool === "entry"} click={() => setTool("entry")} />
        <Tool name="Стоп" on={tool === "stop"} click={() => setTool("stop")} />
        <Tool name="Тейк" on={tool === "target"} click={() => setTool("target")} />
        <Tool name="Линия" on={tool === "line"} click={() => setTool("line")} />
        <button type="button" onClick={() => { setLines([]); setDraft(null); }} className="h-8 rounded-sm px-2 text-xs text-zinc-400">
          Стереть линии
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={() => send("now")} className="h-8 rounded-sm bg-[#089981] px-3 text-sm font-semibold text-white disabled:opacity-60">
            Сразу
          </button>
          <button type="button" disabled={busy} onClick={() => send("limit")} className="h-8 rounded-sm border border-amber-200/40 px-3 text-sm text-amber-100 disabled:opacity-60">
            Лимитом
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-sm bg-[#2a2e39] px-3 text-sm">
            К графику
          </button>
        </div>
      </div>
      <div ref={box} className="relative min-h-0 flex-1">
        <canvas ref={canvas} onClick={click} className="absolute inset-0 cursor-crosshair" />
      </div>
      <p className="border-t border-white/10 px-3 py-2 text-xs text-zinc-400">
        {plan
          ? `${plan.side === "buy" ? "Покупка" : "Продажа"}. Вход ${px(plan.entry)}, стоп ${px(plan.stop)}, тейк ${px(plan.target)}.`
          : "Клик по графику ставит цену выбранной кнопки. Линия — два клика, она для разметки и в приказ сама не входит."}{" "}
        {err || note}
      </p>
    </div>
  );
}

function Tool({ name, on, click }: { name: string; on: boolean; click: () => void }) {
  return (
    <button type="button" onClick={click} className={`h-8 rounded-sm px-2 text-xs ${on ? "bg-amber-100 text-zinc-900" : "bg-[#1e222d] text-zinc-200"}`}>
      {name}
    </button>
  );
}

function span(candles: Candle[], extra: Array<number | null>) {
  let min = Math.min(...candles.map((c) => c.low));
  let max = Math.max(...candles.map((c) => c.high));
  for (const n of extra) {
    if (n == null || !Number.isFinite(n)) continue;
    min = Math.min(min, n);
    max = Math.max(max, n);
  }
  const pad = (max - min || Math.abs(max) * 0.01 || 1) * 0.08;
  return { min: min - pad, max: max + pad };
}

function px(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: n > 100 ? 2 : 5 });
}

function level(
  ctx: CanvasRenderingContext2D,
  w: number,
  yOf: (p: number) => number,
  price: number | null,
  color: string,
  name: string,
) {
  if (price == null) return;
  const y = yOf(price);
  ctx.strokeStyle = color;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(PAD_L, y);
  ctx.lineTo(w - PAD_R, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.font = "12px sans-serif";
  ctx.fillText(`${name} ${px(price)}`, w - PAD_R + 6, y + 4);
}

function drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.lineWidth = 1;
}

function orderOf(entry: number | null, stop: number | null, target: number | null) {
  if (entry == null || stop == null || target == null) return null;
  if (stop < entry && entry < target) return { side: "buy" as const, entry, stop, target };
  if (target < entry && entry < stop) return { side: "sell" as const, entry, stop, target };
  return null;
}
