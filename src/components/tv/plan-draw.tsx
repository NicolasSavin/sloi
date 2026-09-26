import { useEffect, useRef, useState, type MouseEvent } from "react";
import { fetchCustomBars, fetchMarket } from "@/lib/market/fetch";
import type { Candle } from "@/lib/market/types";
import { retellSketch, type SketchPiece } from "@/lib/sketch";

type Tool = "entry" | "stop" | "target" | "line";
type Pt = { i: number; price: number };
type Stroke = { a: Pt; b: Pt };
type AutoMark =
  | { t: "zone"; a: number; b: number; top: number; bot: number; name: string; color: string }
  | { t: "h"; price: number; name: string; color: string }
  | { t: "line"; a: Pt; b: Pt; name: string; color: string };

const PAD_L = 12;
const PAD_R = 72;
const PAD_Y = 16;

export function PlanDraw({
  pair,
  minutes = 60,
  busy,
  note,
  onClose,
  onSend,
}: {
  pair: string;
  minutes?: number;
  busy: boolean;
  note: string;
  onClose: () => void;
  onSend: (how: "now" | "limit", plan: { side: "buy" | "sell"; entry: number; stop: number; target: number }) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [tool, setTool] = useState<Tool>("line");
  const [entry, setEntry] = useState<number | null>(null);
  const [stop, setStop] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [lines, setLines] = useState<Stroke[]>([]);
  const [draft, setDraft] = useState<Pt | null>(null);
  const [err, setErr] = useState("");
  const [words, setWords] = useState("");
  const [story, setStory] = useState<SketchPiece | null>(null);
  const [reading, setReading] = useState(false);
  const [marks, setMarks] = useState<AutoMark[]>([]);
  const [found, setFound] = useState("");
  const [pick, setPick] = useState<{ src: "user" | "auto"; i: number } | null>(null);
  const wait = useRef<number | null>(null);
  const drag = useRef<{ src: "user" | "auto"; i: number; end: "a" | "b" | "move"; last: Pt } | null>(null);

  useEffect(() => {
    let stopFetch = false;
    setCandles([]);
    setEntry(null);
    setStop(null);
    setTarget(null);
    setLines([]);
    setDraft(null);
    const standard = ({ 5: "5m", 15: "15m", 60: "1h", 240: "4h", 1440: "1d" } as const)[minutes];
    const load = standard
      ? fetchMarket({ data: { symbol: pair, timeframe: standard } }).then((payload) => payload.candles)
      : fetchCustomBars({ data: { symbol: pair, minutes } }).then((payload) => payload.candles);
    void load.then((rows) => {
      if (!stopFetch) setCandles(rows.slice(-90));
    });
    return () => {
      stopFetch = true;
    };
  }, [pair, minutes]);

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
      const extra = [
        entry,
        stop,
        target,
        ...lines.flatMap((l) => [l.a.price, l.b.price]),
        ...marks.flatMap((m) => (m.t === "h" ? [m.price] : m.t === "zone" ? [m.top, m.bot] : [m.a.price, m.b.price])),
      ];
      const { min, max } = span(candles, extra);
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
      for (const m of marks) {
        if (m.t === "zone") {
          const x1 = xOf(Math.min(m.a, m.b));
          const x2 = xOf(Math.max(m.a, m.b));
          ctx.fillStyle = m.color;
          ctx.fillRect(x1, yOf(m.top), Math.max(x2 - x1, 8), yOf(m.bot) - yOf(m.top));
          ctx.fillStyle = "#e4e4e7";
          ctx.font = "11px sans-serif";
          ctx.fillText(m.name, x1 + 4, yOf(m.top) + 12);
        } else if (m.t === "line") {
          drawLine(ctx, xOf(m.a.i), yOf(m.a.price), xOf(m.b.i), yOf(m.b.price), m.color);
          if (m.name) {
            ctx.fillStyle = m.color;
            ctx.font = "12px sans-serif";
            ctx.fillText(m.name, xOf(m.b.i) + 4, yOf(m.b.price));
          }
        } else {
          level(ctx, w, yOf, m.price, m.color, m.name);
        }
      }
      for (const line of lines) drawLine(ctx, xOf(line.a.i), yOf(line.a.price), xOf(line.b.i), yOf(line.b.price), "#f0d7a8");
      level(ctx, w, yOf, entry, "#089981", "вход");
      level(ctx, w, yOf, stop, "#f23645", "стоп");
      level(ctx, w, yOf, target, "#c4a86e", "тейк");
      const chosen = pick?.src === "user" ? lines[pick.i] : pick?.src === "auto" && marks[pick.i]?.t === "line" ? marks[pick.i] : null;
      if (chosen && "a" in chosen) {
        drawLine(ctx, xOf(chosen.a.i), yOf(chosen.a.price), xOf(chosen.b.i), yOf(chosen.b.price), "#ffffff");
        for (const pt of [chosen.a, chosen.b]) {
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(xOf(pt.i), yOf(pt.price), 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = "#71717a";
      ctx.font = "11px sans-serif";
      ctx.fillText(px(max), w - PAD_R + 8, PAD_Y + 4);
      ctx.fillText(px(min), w - PAD_R + 8, h - PAD_Y);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(el);
    return () => ro.disconnect();
  }, [candles, entry, stop, target, lines, marks, pick]);

  function at(e: MouseEvent<HTMLCanvasElement>): Pt | null {
    const el = box.current;
    if (!el || candles.length < 2) return null;
    const r = el.getBoundingClientRect();
    const w = r.width;
    const h = r.height;
    const { min, max } = span(candles, [
      entry,
      stop,
      target,
      ...lines.flatMap((l) => [l.a.price, l.b.price]),
      ...marks.flatMap((m) => (m.t === "h" ? [m.price] : m.t === "zone" ? [m.top, m.bot] : [m.a.price, m.b.price])),
    ]);
    const i = ((e.clientX - r.left - PAD_L) / (w - PAD_L - PAD_R)) * (candles.length - 1);
    const price = max - ((e.clientY - r.top - PAD_Y) / (h - PAD_Y * 2)) * (max - min);
    if (!Number.isFinite(price)) return null;
    return { i: Math.min(candles.length - 1, Math.max(0, i)), price };
  }

  function magnet(raw: Pt): Pt {
    const el = box.current;
    if (!el) return raw;
    const h = el.clientHeight;
    const { min, max } = span(candles, [
      entry,
      stop,
      target,
      ...lines.flatMap((l) => [l.a.price, l.b.price]),
      ...marks.flatMap((m) => (m.t === "h" ? [m.price] : m.t === "zone" ? [m.top, m.bot] : [m.a.price, m.b.price])),
    ]);
    const yPer = (h - PAD_Y * 2) / (max - min || 1);
    let bestI = Math.round(raw.i);
    let bestP = raw.price;
    let bestPx = 16;
    for (let i = Math.max(0, Math.floor(raw.i) - 1); i <= Math.min(candles.length - 1, Math.ceil(raw.i) + 1); i++) {
      const c = candles[i];
      if (!c) continue;
      for (const price of [c.open, c.high, c.low, c.close]) {
        const d = Math.abs(price - raw.price) * yPer;
        if (d < bestPx) {
          bestPx = d;
          bestP = price;
          bestI = i;
        }
      }
    }
    return { i: Math.min(candles.length - 1, Math.max(0, bestI)), price: bestP };
  }

  function pointPx(p: Pt) {
    const el = box.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const { min, max } = span(candles, [
      entry,
      stop,
      target,
      ...lines.flatMap((l) => [l.a.price, l.b.price]),
      ...marks.flatMap((m) => (m.t === "h" ? [m.price] : m.t === "zone" ? [m.top, m.bot] : [m.a.price, m.b.price])),
    ]);
    const x = r.left + PAD_L + ((r.width - PAD_L - PAD_R) * p.i) / Math.max(candles.length - 1, 1);
    const y = r.top + PAD_Y + ((max - p.price) / (max - min || 1)) * (r.height - PAD_Y * 2);
    return { x, y };
  }

  function lineDist(e: MouseEvent<HTMLCanvasElement>, a: Pt, b: Pt) {
    const A = pointPx(a);
    const B = pointPx(b);
    if (!A || !B) return 99;
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = dx * dx + dy * dy || 1;
    const t = Math.min(1, Math.max(0, ((e.clientX - A.x) * dx + (e.clientY - A.y) * dy) / len));
    const x = A.x + dx * t;
    const y = A.y + dy * t;
    return Math.hypot(e.clientX - x, e.clientY - y);
  }

  function nearest(e: MouseEvent<HTMLCanvasElement>) {
    let best: { src: "user" | "auto"; i: number } | null = null;
    let dist = 12;
    lines.forEach((line, i) => {
      const d = lineDist(e, line.a, line.b);
      if (d < dist) {
        dist = d;
        best = { src: "user", i };
      }
    });
    marks.forEach((m, i) => {
      if (m.t !== "line") return;
      const d = lineDist(e, m.a, m.b);
      if (d < dist) {
        dist = d;
        best = { src: "auto", i };
      }
    });
    return best;
  }

  function place(e: MouseEvent<HTMLCanvasElement>) {
    const raw = at(e);
    if (!raw) return;
    const p = magnet(raw);
    setErr("");
    setPick(null);
    if (tool === "entry") setEntry(p.price);
    else if (tool === "stop") setStop(p.price);
    else if (tool === "target") setTarget(p.price);
    else if (!draft) setDraft(p);
    else {
      setLines((rows) => [...rows, { a: draft, b: p }]);
      setDraft(null);
    }
  }

  function click(e: MouseEvent<HTMLCanvasElement>) {
    if (e.detail > 1) {
      if (wait.current) window.clearTimeout(wait.current);
      setPick(nearest(e));
      return;
    }
    if (wait.current) window.clearTimeout(wait.current);
    wait.current = window.setTimeout(() => place(e), 220);
  }

  function down(e: MouseEvent<HTMLCanvasElement>) {
    if (!pick) return;
    const stroke = pick.src === "user" ? lines[pick.i] : marks[pick.i]?.t === "line" ? marks[pick.i] : null;
    if (!stroke || !("a" in stroke)) return;
    const raw = at(e);
    if (!raw) return;
    const A = pointPx(stroke.a);
    const B = pointPx(stroke.b);
    if (!A || !B) return;
    const da = Math.hypot(e.clientX - A.x, e.clientY - A.y);
    const db = Math.hypot(e.clientX - B.x, e.clientY - B.y);
    const end = da < 12 ? "a" : db < 12 ? "b" : lineDist(e, stroke.a, stroke.b) < 8 ? "move" : null;
    if (!end) return;
    drag.current = { ...pick, end, last: magnet(raw) };
  }

  function move(e: MouseEvent<HTMLCanvasElement>) {
    const d = drag.current;
    const raw = at(e);
    if (!d || !raw) return;
    const p = magnet(raw);
    const di = p.i - d.last.i;
    const dp = p.price - d.last.price;
    if (d.src === "user") {
      setLines((rows) =>
        rows.map((line, i) => {
          if (i !== d.i) return line;
          if (d.end === "a") return { ...line, a: p };
          if (d.end === "b") return { ...line, b: p };
          return {
            a: { i: line.a.i + di, price: line.a.price + dp },
            b: { i: line.b.i + di, price: line.b.price + dp },
          };
        }),
      );
    } else {
      setMarks((rows) =>
        rows.map((m, i) => {
          if (i !== d.i || m.t !== "line") return m;
          if (d.end === "a") return { ...m, a: p };
          if (d.end === "b") return { ...m, b: p };
          return {
            ...m,
            a: { i: m.a.i + di, price: m.a.price + dp },
            b: { i: m.b.i + di, price: m.b.price + dp },
          };
        }),
      );
    }
    drag.current = { ...d, last: p };
  }

  function up() {
    drag.current = null;
  }

  const drawn = orderOf(entry, stop, target) ?? lineOrder(lines.at(-1) ?? null, candles);
  const plan = story?.plan
    ? { side: story.plan.side, entry: story.plan.entry, stop: story.plan.stop, target: story.plan.target }
    : drawn;

  async function findPattern() {
    if (candles.length < 20) {
      setErr("Свечей ещё мало.");
      return;
    }
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
    const next: AutoMark[] = [];
    for (const p of snap.patterns.slice(0, 3)) {
      const pts = p.points.map((pt) => ({ i: at(pt.time), price: pt.price, label: pt.label }));
      const color = p.side === "bull" ? "#26a69a" : "#ef5350";
      if (p.id === "wedge") {
        const top = pts.filter((pt) => pt.label === "верх");
        const bot = pts.filter((pt) => pt.label === "низ");
        if (top.length === 2) next.push({ t: "line", a: top[0]!, b: top[1]!, name: p.name, color });
        if (bot.length === 2) next.push({ t: "line", a: bot[0]!, b: bot[1]!, name: "", color });
        continue;
      }
      for (let i = 1; i < pts.length; i++) {
        next.push({ t: "line", a: pts[i - 1]!, b: pts[i]!, name: i === 1 ? p.name : "", color });
      }
    }
    const highs = snap.swings.filter((s) => s.type === "high").slice(-2);
    const lows = snap.swings.filter((s) => s.type === "low").slice(-2);
    if (highs.length === 2) {
      next.push({
        t: "line",
        a: { i: highs[0]!.index, price: highs[0]!.price },
        b: { i: highs[1]!.index, price: highs[1]!.price },
        name: "наклонная",
        color: "#7dd3fc",
      });
    }
    if (lows.length === 2) {
      next.push({
        t: "line",
        a: { i: lows[0]!.index, price: lows[0]!.price },
        b: { i: lows[1]!.index, price: lows[1]!.price },
        name: "наклонная",
        color: "#7dd3fc",
      });
    }
    for (const z of [...snap.fvgs, ...snap.orderBlocks].filter((z) => !z.mitigated).slice(-4)) {
      next.push({
        t: "zone",
        a: at(z.startTime),
        b: Math.max(at(z.endTime), candles.length - 1),
        top: z.top,
        bot: z.bottom,
        name: z.kind === "fvg" ? "имбаланс" : "ордерблок",
        color: z.kind === "fvg" ? "rgba(56,189,248,0.22)" : "rgba(168,85,247,0.22)",
      });
    }
    next.push({ t: "h", price: snap.dealingRange.high, name: "уровень", color: "#d4d4d8" });
    next.push({ t: "h", price: snap.dealingRange.low, name: "уровень", color: "#d4d4d8" });
    for (const l of snap.liquidity.filter((l) => !l.swept).slice(-4)) {
      next.push({ t: "h", price: l.price, name: "ликвидность", color: l.side === "buy" ? "#fbbf24" : "#fb7185" });
    }
    setMarks(next);
    setFound(snap.patterns[0] ? snap.patterns.map((p) => p.name).slice(0, 3).join(", ") : "фигуры на часе нет, зоны и уровни нанесены");
    setErr("");
  }

  function send(how: "now" | "limit") {
    if (!plan) {
      setErr("Нужны три цены: вход, стоп и тейк. Стоп и тейк с разных сторон входа.");
      return;
    }
    onSend(how, plan);
  }

  async function asNote() {
    const cv = canvas.current;
    if (!cv || candles.length < 2) {
      setErr("Сначала дождитесь свечей.");
      return;
    }
    setReading(true);
    setErr("");
    setStory(null);
    const image = shotOf(cv);
    const notes = [words.trim(), caption(pair, lines, entry, stop, target, drawn)].filter(Boolean).join("\n");
    const res = await fetch("/api/sketches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instrument: pair, notes, image }),
    });
    const saved = (await res.json()) as { notes?: string; instrument?: string; error?: string };
    setReading(false);
    if (!res.ok || !saved.notes) {
      setErr(saved.error || "Разбор не вышел. Напишите пару слов или проверьте ключ модели.");
      return;
    }
    const piece = retellSketch(saved.notes, saved.instrument || pair);
    if (!piece) {
      setErr("Текст не собрался.");
      return;
    }
    setStory(piece);
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[#0e1116]">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="text-xs tracking-[0.16em] text-amber-100/80">ПЛАН {pair}</span>
        <Tool name="Вход" on={tool === "entry"} click={() => setTool("entry")} />
        <Tool name="Стоп" on={tool === "stop"} click={() => setTool("stop")} />
        <Tool name="Тейк" on={tool === "target"} click={() => setTool("target")} />
        <Tool name="Линия" on={tool === "line"} click={() => setTool("line")} />
        <button type="button" onClick={() => void findPattern()} className="h-8 rounded-sm bg-sky-200 px-2 text-xs font-semibold text-zinc-900">
          Найти паттерн
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy || reading} onClick={() => void asNote()} className="h-8 rounded-sm bg-amber-100 px-3 text-sm font-semibold text-zinc-900 disabled:opacity-60">
            {reading ? "Смотрю график…" : "Как в заметке"}
          </button>
          <button type="button" disabled={busy || reading} onClick={() => send("now")} className="h-8 rounded-sm bg-[#089981] px-3 text-sm font-semibold text-white disabled:opacity-60">
            Сразу
          </button>
          <button type="button" disabled={busy || reading} onClick={() => send("limit")} className="h-8 rounded-sm border border-amber-200/40 px-3 text-sm text-amber-100 disabled:opacity-60">
            Лимитом
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-sm bg-[#2a2e39] px-3 text-sm">
            К графику
          </button>
        </div>
      </div>
      <div ref={box} className="relative min-h-0 flex-1">
        <canvas ref={canvas} onClick={click} onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up} className="absolute inset-0 cursor-crosshair" />
      </div>
      <div className="max-h-56 overflow-auto border-t border-white/10 px-3 py-2">
        <textarea
          value={words}
          onChange={(e) => setWords(e.target.value)}
          rows={2}
          placeholder="Свои слова, как в заметке. Можно пустым: тогда текст соберётся с графика. Например: вход по пробою шеи головы и плеч."
          className="w-full rounded-sm border border-white/10 bg-black/40 px-2 py-1 text-sm outline-none"
        />
        {story ? (
          <div className="mt-2 text-sm text-zinc-200">
            <p className="text-[11px] tracking-[0.18em] text-amber-100/80">{story.kicker}</p>
            <p className="mt-1 font-semibold">{story.title}</p>
            <p className="mt-1 leading-relaxed">{story.lead}</p>
            {story.paragraphs.map((p) => (
              <p key={p} className="mt-1 text-xs leading-relaxed text-zinc-400">
                {p}
              </p>
            ))}
            <p className="mt-1 text-xs text-zinc-500">Заметка также появилась на странице «Заметка». Приказ уходит только по кнопке Сразу или Лимитом.</p>
          </div>
        ) : (
          <p className="mt-1 text-xs text-zinc-400">
            {plan
              ? `${plan.side === "buy" ? "Покупка" : "Продажа"}. Вход ${px(plan.entry)}, стоп ${px(plan.stop)}, тейк ${px(plan.target)}.`
              : "Линия липнет к свече. Двойной клик открывает концы: их можно перетащить. «Как в заметке» пишет текст и собирает приказ."}{" "}
            {found ? ` Найдено: ${found}.` : ""} {err || note}
          </p>
        )}
        {story && (err || note) ? <p className="mt-1 text-xs text-amber-100">{err || note}</p> : null}
      </div>
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

function caption(
  pair: string,
  lines: Stroke[],
  entry: number | null,
  stop: number | null,
  target: number | null,
  plan: { side: "buy" | "sell"; entry: number; stop: number; target: number } | null,
) {
  const rows = [`Часовой график ${pair}. Нарисовано здесь, не снимок.`];
  lines.forEach((line, i) => {
    rows.push(`Наклонная ${i + 1}: от ${px(line.a.price)} к ${px(line.b.price)}.`);
  });
  if (entry != null) rows.push(`ВХОД ${entry}`);
  if (stop != null) rows.push(`СТОП ${stop}`);
  if (target != null) rows.push(`ТЕЙК ${target}`);
  if (plan) rows.push(`ПРОБОЙ ${plan.side === "buy" ? "BUY" : "SELL"}`);
  if (lines.length >= 2) rows.push("Две наклонные, это клин или канал.");
  return rows.join("\n");
}

function shotOf(cv: HTMLCanvasElement) {
  const max = 960;
  const scale = Math.min(1, max / Math.max(cv.width, 1));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cv.width * scale));
  out.height = Math.max(1, Math.round(cv.height * scale));
  const ctx = out.getContext("2d");
  if (!ctx) return cv.toDataURL("image/jpeg", 0.62);
  ctx.drawImage(cv, 0, 0, out.width, out.height);
  return out.toDataURL("image/jpeg", 0.62);
}

function orderOf(entry: number | null, stop: number | null, target: number | null) {
  if (entry == null || stop == null || target == null) return null;
  if (stop < entry && entry < target) return { side: "buy" as const, entry, stop, target };
  if (target < entry && entry < stop) return { side: "sell" as const, entry, stop, target };
  return null;
}

function lineOrder(line: Stroke | null, candles: Candle[]) {
  if (!line || candles.length < 5) return null;
  const last = candles.length - 1;
  const spanI = line.b.i - line.a.i || 1;
  const entry = line.a.price + ((last - line.a.i) / spanI) * (line.b.price - line.a.price);
  const from = Math.max(0, Math.floor(Math.min(line.a.i, line.b.i)));
  const slice = candles.slice(from);
  if (!slice.length || !Number.isFinite(entry)) return null;
  const hi = Math.max(...slice.map((c) => c.high));
  const lo = Math.min(...slice.map((c) => c.low));
  const height = Math.max(hi - lo, Math.abs(line.a.price - line.b.price));
  if (line.b.price <= line.a.price) {
    const stop = Math.max(hi, line.a.price, line.b.price);
    const target = entry - height;
    if (stop > entry && entry > target) return { side: "sell" as const, entry, stop, target };
  } else {
    const stop = Math.min(lo, line.a.price, line.b.price);
    const target = entry + height;
    if (target > entry && entry > stop) return { side: "buy" as const, entry, stop, target };
  }
  return null;
}
