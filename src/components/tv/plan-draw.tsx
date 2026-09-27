import { useEffect, useRef, useState, type MouseEvent } from "react";
import { fetchCustomBars, fetchMarket } from "@/lib/market/fetch";
import type { Candle } from "@/lib/market/types";
import { retellSketch, type SketchPiece } from "@/lib/sketch";
import { graphicBreak, patternOrder } from "@/lib/smc/patterns";
import { deltaDivergenceOn } from "@/lib/smc/delta-div";
import { deltaOf } from "@/lib/smc/flow";

type Tool = "entry" | "stop" | "target" | "line";
type Pt = { i: number; price: number };
type Stroke = { a: Pt; b: Pt };
type AutoMark =
  | { t: "zone"; a: number; b: number; top: number; bot: number; name: string; color: string }
  | { t: "h"; price: number; name: string; color: string }
  | { t: "line"; a: Pt; b: Pt; name: string; color: string }
  | { t: "poly"; pts: Pt[]; color: string; title?: string };

const LEFT = 12;
const RIGHT = 70;
const VIEW = 80;

export function PlanDraw({
  pair,
  minutes = 60,
  busy,
  note,
  seek,
  onClose,
  onSend,
}: {
  pair: string;
  minutes?: number;
  busy: boolean;
  note: string;
  seek: boolean;
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

  const loaded = useRef("");

  useEffect(() => {
    let stopFetch = false;
    const key = `${pair}|${minutes}`;
    const same = loaded.current === key;
    loaded.current = key;
    if (!same) {
      setLines([]);
      setDraft(null);
      setEntry(null);
      setStop(null);
      setTarget(null);
      setMarks([]);
      setStory(null);
    }
    const standard = ({ 5: "5m", 15: "15m", 60: "1h", 240: "4h", 1440: "1d" } as const)[minutes];
    const load = standard
      ? fetchMarket({ data: { symbol: pair, timeframe: standard } }).then((payload) => payload.candles)
      : fetchCustomBars({ data: { symbol: pair, minutes } }).then((payload) => payload.candles);
    void load.then((rows) => {
      if (!stopFetch) setCandles(rows.slice(-120));
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
      ctx.clearRect(0, 0, w, h);
      if (candles.length < 2) return;
      const extra = [
        entry,
        stop,
        target,
        ...lines.flatMap((l) => [l.a.price, l.b.price]),
        ...marks.flatMap((m) => (m.t === "h" ? [m.price] : m.t === "zone" ? [m.top, m.bot] : m.t === "poly" ? m.pts.map((p) => p.price) : [m.a.price, m.b.price])),
      ];
      const first = marks.reduce((min, m) => {
        if (m.t === "poly") return Math.min(min, ...m.pts.map((p) => p.i));
        if (m.t !== "line") return min;
        return Math.min(min, m.a.i, m.b.i);
      }, candles.length);
      const { xOf, yOf, start, rows } = axes(w, h, candles, extra, first);
      ctx.fillStyle = "#131722";
      ctx.fillRect(0, 0, w, h);
      const slot = (w - LEFT - RIGHT) / Math.max(rows.length, 1);
      rows.forEach((c, n) => {
        const up = c.close >= c.open;
        ctx.strokeStyle = up ? "#26a69a" : "#ef5350";
        ctx.fillStyle = ctx.strokeStyle;
        const x = xOf(start + n);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, yOf(c.high));
        ctx.lineTo(x, yOf(c.low));
        ctx.stroke();
        const top = yOf(Math.max(c.open, c.close));
        const bot = yOf(Math.min(c.open, c.close));
        ctx.fillRect(x - Math.max(slot * 0.32, 1.2), top, Math.max(slot * 0.64, 2.4), Math.max(bot - top, 1));
      });
      paintDelta(ctx, w, h, rows, start, xOf, slot, marks);
      const seen = start + rows.length;
      const inside = (i: number) => i >= start && i < seen;
      for (const m of marks) {
        if (m.t !== "poly" || m.pts.length < 3) continue;
        ctx.beginPath();
        m.pts.forEach((p, i) => (i ? ctx.lineTo(xOf(p.i), yOf(p.price)) : ctx.moveTo(xOf(p.i), yOf(p.price))));
        ctx.closePath();
        ctx.fillStyle = `${m.color}33`;
        ctx.fill();
      }
      const captions: Array<{ x: number; y: number; text: string; color: string }> = [];
      for (const m of marks) {
        if (m.t === "poly" && m.title && m.pts.length >= 3) {
          const x = m.pts.reduce((s, p) => s + xOf(p.i), 0) / m.pts.length;
          const y = Math.min(...m.pts.map((p) => yOf(p.price))) - 36;
          captions.push({ x, y, text: m.title, color: m.color });
        }
      }
      for (const m of marks) {
        if (m.t !== "line" || m.name.startsWith("дивер")) continue;
        drawLine(ctx, xOf(m.a.i), yOf(m.a.price), xOf(m.b.i), yOf(m.b.price), m.color);
        dot(ctx, xOf(m.a.i), yOf(m.a.price), m.color);
        dot(ctx, xOf(m.b.i), yOf(m.b.price), m.color);
        if (!m.name) continue;
        captions.push({ x: xOf(m.a.i), y: yOf(m.a.price) - 18, text: speak(m.name), color: m.color });
      }
      placeTags(ctx, captions);
      const divs = marks.filter((m) => m.t === "line" && m.name.startsWith("дивер"));
      ctx.font = "bold 16px sans-serif";
      ctx.fillStyle = "#d6ff4a";
      ctx.fillText(divs[0]?.t === "line" ? divs[0].name : "дивергенции дельты нет", 16, 26);
      for (const m of divs) {
        if (m.t !== "line" || !inside(m.a.i) || !inside(m.b.i)) continue;
        ctx.strokeStyle = "#d6ff4a";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(xOf(m.a.i), yOf(m.a.price));
        ctx.lineTo(xOf(m.b.i), yOf(m.b.price));
        ctx.stroke();
        ctx.lineWidth = 1;
        for (const p of [m.a, m.b]) {
          ctx.beginPath();
          ctx.arc(xOf(p.i), yOf(p.price), 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      for (const line of lines) drawLine(ctx, xOf(line.a.i), yOf(line.a.price), xOf(line.b.i), yOf(line.b.price), "#f0d7a8");
      if (draft) {
        ctx.fillStyle = "#f0d7a8";
        ctx.beginPath();
        ctx.arc(xOf(draft.i), yOf(draft.price), 5, 0, Math.PI * 2);
        ctx.fill();
      }
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
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(el);
    return () => ro.disconnect();
  }, [candles, entry, stop, target, lines, marks, pick, draft]);

  function at(e: MouseEvent<HTMLCanvasElement>): Pt | null {
    const el = box.current;
    if (!el || candles.length < 2) return null;
    const r = el.getBoundingClientRect();
    const { min, max, start, rows, top, priceBottom, plotRight } = axes(r.width, r.height, candles, [
      entry,
      stop,
      target,
      ...lines.flatMap((l) => [l.a.price, l.b.price]),
      ...marks.flatMap((m) => (m.t === "h" ? [m.price] : m.t === "zone" ? [m.top, m.bot] : m.t === "poly" ? m.pts.map((p) => p.price) : [m.a.price, m.b.price])),
    ]);
    const i = start + ((e.clientX - r.left - LEFT) / (r.width - LEFT - plotRight)) * Math.max(rows.length - 1, 1);
    const price = max - ((e.clientY - r.top - top) / Math.max(priceBottom - top, 1)) * (max - min);
    if (!Number.isFinite(price)) return null;
    return { i: Math.min(candles.length - 1, Math.max(0, i)), price };
  }

  function magnet(raw: Pt): Pt {
    const el = box.current;
    if (!el) return raw;
    const h = el.clientHeight;
    const { min, max, top, priceBottom } = axes(el.clientWidth, h, candles, [
      entry,
      stop,
      target,
      ...lines.flatMap((l) => [l.a.price, l.b.price]),
      ...marks.flatMap((m) => (m.t === "h" ? [m.price] : m.t === "zone" ? [m.top, m.bot] : m.t === "poly" ? m.pts.map((p) => p.price) : [m.a.price, m.b.price])),
    ]);
    const yPer = (priceBottom - top) / (max - min || 1);
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
    const { xOf, yOf } = axes(r.width, r.height, candles, [
      entry,
      stop,
      target,
      ...lines.flatMap((l) => [l.a.price, l.b.price]),
      ...marks.flatMap((m) => (m.t === "h" ? [m.price] : m.t === "zone" ? [m.top, m.bot] : m.t === "poly" ? m.pts.map((p) => p.price) : [m.a.price, m.b.price])),
    ]);
    return { x: r.left + xOf(p.i), y: r.top + yOf(p.price) };
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
    setErr("");
    setFound("Смотрю свечи…");
    let rows = candles;
    if (rows.length < 20) {
      const standard = ({ 5: "5m", 15: "15m", 60: "1h", 240: "4h", 1440: "1d" } as const)[minutes];
      try {
        rows = standard
          ? (await fetchMarket({ data: { symbol: pair, timeframe: standard } })).candles.slice(-120)
          : (await fetchCustomBars({ data: { symbol: pair, minutes } })).candles.slice(-120);
      } catch {
        setFound("");
        setErr("Свечи не пришли. Нажмите ещё раз.");
        return;
      }
      setCandles(rows);
    }
    if (rows.length < 20) {
      setFound("");
      setErr("Свечей ещё мало для фигуры.");
      return;
    }
    try {
      const { analyzeMarket } = await import("@/lib/smc/engine");
      const snap = analyzeMarket(rows, null, undefined, { symbol: pair });
      const at = (time: number) => {
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
      };
      const next: AutoMark[] = [];
      const figureColor = ["#ffb020", "#5ec8ff", "#d58bff"];
      const picked = [...snap.patterns].sort((a, b) => rank(a.id) - rank(b.id)).slice(0, 2);
      picked.forEach((p, n) => {
        const pts = p.points.map((pt) => ({ i: at(pt.time), price: pt.price, label: pt.label }));
        const color = figureColor[n] ?? "#ffb020";
        const onWick = (pt: { i: number; price: number; label: string }) => wick(rows, pt.i, pt.price, pt.label);
        const ordered = [...pts].sort((a, b) => a.i - b.i);
        if (p.id === "wedge" || p.id === "tri" || p.id === "exp") {
          const top = ordered.filter((pt) => pt.label === "верх");
          const bot = ordered.filter((pt) => pt.label === "низ");
          const chain = (side: typeof top, title: string) => {
            for (let i = 1; i < side.length; i++) {
              next.push({ t: "line", a: onWick(side[i - 1]!), b: onWick(side[i]!), name: i === 1 ? title : "", color });
            }
          };
          chain(top, p.name);
          chain(bot, "");
          const ring = [...top, ...[...bot].reverse()].map(onWick);
          if (ring.length >= 3) next.push({ t: "poly", pts: ring, color, title: p.name });
          if (top.length >= 2 && bot.length >= 2) {
            next.push({ t: "line", a: onWick(top[0]!), b: onWick(bot[0]!), name: "", color });
            next.push({ t: "line", a: onWick(top[top.length - 1]!), b: onWick(bot[bot.length - 1]!), name: "", color });
          }
          return;
        }
        const shape = ordered.filter((pt) => pt.label !== "шея").map(onWick);
        if (shape.length >= 3) next.push({ t: "poly", pts: shape, color, title: p.name });
        const body = ordered.filter((pt) => pt.label !== "шея");
        for (let i = 1; i < body.length; i++) {
          next.push({ t: "line", a: onWick(body[i - 1]!), b: onWick(body[i]!), name: body[i - 1]!.label, color });
        }
        const last = body.at(-1);
        if (last) next.push({ t: "line", a: onWick(last), b: onWick(last), name: last.label, color });
        if (p.id === "dragon" || p.id === "idragon") {
          const a = body[0];
          const b = body.at(-1);
          if (a && b) next.push({ t: "line", a: onWick(a), b: onWick(b), name: "", color });
        }
        const neck = ordered.filter((pt) => pt.label === "шея");
        if (neck.length === 2) next.push({ t: "line", a: onWick(neck[0]!), b: onWick(neck[1]!), name: "шея", color });
      });
      const divName = deltaDivergence(rows, at, next);
      const order = patternOrder(rows, snap.swings, snap.atr) ?? graphicBreak(rows, snap.swings, snap.atr);
      if (order) {
        setEntry(order.entry);
        setStop(order.stop);
        setTarget(order.target);
      }
      setMarks(next);
      const names = [...snap.patterns.map((p) => p.name).slice(0, 3), divName].filter(Boolean);
      setFound(names.length ? names.join(", ") : order ? order.name : "фигуры нет, на полосе зоны и уровни");
      setErr("");
    } catch {
      setFound("");
      setErr("Разбор фигуры не вышел. Нажмите ещё раз.");
    }
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

  useEffect(() => {
    if (!seek) {
      setMarks([]);
      setFound("График открыт. Линия, вход, стоп и тейк ставятся на свечи. Приказ уходит советнику, в заметку — только кнопка «В заметку».");
      return;
    }
    void findPattern();
  }, [pair, minutes, seek]);

  return (
    <>
      <div ref={box} className="pointer-events-none absolute inset-0 z-20">
        <canvas
          ref={canvas}
          onClick={click}
          onMouseDown={down}
          onMouseMove={move}
          onMouseUp={up}
          onMouseLeave={up}
          className={`absolute inset-0 ${tool === "line" || tool === "entry" || tool === "stop" || tool === "target" ? "pointer-events-auto cursor-crosshair" : "pointer-events-none"}`}
        />
      </div>
      <div className="fixed inset-x-0 bottom-0 z-[90] border-t border-white/10 bg-[#131722]/95 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs tracking-[0.16em] text-amber-100/80">{pair}</span>
          <Tool name="Вход" on={tool === "entry"} click={() => setTool("entry")} />
          <Tool name="Стоп" on={tool === "stop"} click={() => setTool("stop")} />
          <Tool name="Тейк" on={tool === "target"} click={() => setTool("target")} />
          <Tool name="Линия" on={tool === "line"} click={() => setTool("line")} />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy || reading} onClick={() => void asNote()} className="h-8 rounded-sm bg-[#2a2e39] px-3 text-sm text-zinc-100 disabled:opacity-60">
              {reading ? "Пишу…" : "В заметку"}
            </button>
            <button type="button" disabled={busy || reading} onClick={() => send("now")} className="h-8 rounded-sm bg-[#089981] px-3 text-sm font-semibold text-white disabled:opacity-60">
              Приказ сразу
            </button>
            <button type="button" disabled={busy || reading} onClick={() => send("limit")} className="h-8 rounded-sm bg-amber-100 px-3 text-sm font-semibold text-zinc-900 disabled:opacity-60">
              Приказ лимитом
            </button>
          </div>
        </div>
        <textarea
          value={words}
          onChange={(e) => setWords(e.target.value)}
          rows={1}
          placeholder="Текст заметки. На приказ брокеру не влияет."
          className="mt-2 w-full rounded-sm border border-white/10 bg-black/40 px-2 py-1 text-sm outline-none"
        />
        {story ? (
          <div className="mt-2 text-sm text-zinc-200">
            <p className="font-semibold">{story.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">{story.lead}</p>
          </div>
        ) : (
          <p className="mt-1 text-sm text-amber-100">
            {found ? `Найдено: ${found}.` : ""}
            {plan ? ` ${plan.side === "buy" ? "Покупка" : "Продажа"} ${px(plan.entry)}, стоп ${px(plan.stop)}, тейк ${px(plan.target)}.` : ""}
            {err ? ` ${err}` : ""}
          </p>
        )}
      </div>
    </>
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
  ctx.moveTo(LEFT, y);
  ctx.lineTo(w - RIGHT, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.font = "12px sans-serif";
  ctx.fillText(`${name} ${px(price)}`, w - RIGHT + 6, y + 4);
}

function drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.lineWidth = 1;
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#131722";
  ctx.stroke();
  ctx.lineWidth = 1;
}

function paintDelta(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rows: Candle[],
  start: number,
  xOf: (i: number) => number,
  slot: number,
  marks: AutoMark[],
) {
  const paneTop = h - 220;
  const paneBot = h - 136;
  if (paneBot - paneTop < 24 || rows.length < 2) return;
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(LEFT, paneTop, w - LEFT - RIGHT, paneBot - paneTop);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.strokeRect(LEFT, paneTop, w - LEFT - RIGHT, paneBot - paneTop);
  const deltas = rows.map((c) => deltaOf(c));
  const peak = Math.max(...deltas.map((d) => Math.abs(d)), 1);
  const mid = (paneTop + paneBot) / 2;
  const room = (paneBot - paneTop) / 2 - 8;
  ctx.font = "12px sans-serif";
  ctx.fillStyle = "#c8d0dc";
  ctx.fillText("дельта объёма", LEFT + 6, paneTop + 14);
  const tip = (i: number) => {
    const d = deltas[i - start];
    if (d == null) return null;
    const bh = (Math.abs(d) / peak) * room;
    return { x: xOf(i), y: d >= 0 ? mid - bh : mid + bh };
  };
  rows.forEach((_, n) => {
    const d = deltas[n] ?? 0;
    const x = xOf(start + n);
    const bh = (Math.abs(d) / peak) * room;
    ctx.fillStyle = d >= 0 ? "#26a69a" : "#ef5350";
    ctx.fillRect(x - Math.max(slot * 0.28, 1), d >= 0 ? mid - bh : mid, Math.max(slot * 0.56, 2), Math.max(bh, 1));
  });
  for (const m of marks) {
    if (m.t !== "line" || !m.name.startsWith("дивер")) continue;
    const a = tip(m.a.i);
    const b = tip(m.b.i);
    if (!a || !b) continue;
    ctx.strokeStyle = "#d6ff4a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.lineWidth = 1;
    for (const p of [a, b]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#d6ff4a";
      ctx.fill();
    }
    ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = "#d6ff4a";
    ctx.fillText(m.name, Math.min(a.x, b.x), paneTop + 28);
  }
}

function rank(id: string) {
  if (id === "dragon" || id === "idragon") return 0;
  if (id === "hs" || id === "ihs") return 1;
  return 2;
}

function speak(name: string) {
  if (name === "B1") return "левое дно";
  if (name === "B2") return "правое дно";
  if (name === "T1") return "левая вершина";
  if (name === "T2") return "правая вершина";
  return name;
}

function placeTags(ctx: CanvasRenderingContext2D, items: Array<{ x: number; y: number; text: string; color: string }>) {
  const used: Array<{ x: number; y: number; w: number }> = [];
  for (const item of items) {
    ctx.font = "bold 13px sans-serif";
    const w = ctx.measureText(item.text).width + 10;
    let y = item.y;
    for (let n = 0; n < 6; n++) {
      const hit = used.some((r) => Math.abs(r.x - item.x) < (r.w + w) / 2 && Math.abs(r.y - y) < 18);
      if (!hit) break;
      y -= 18;
    }
    tag(ctx, item.x, y, item.text, item.color);
    used.push({ x: item.x, y, w });
  }
}

function tag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  ctx.font = "bold 13px sans-serif";
  const width = ctx.measureText(text).width;
  const left = Math.max(LEFT, x - width / 2);
  ctx.fillStyle = "rgba(10, 14, 24, 0.88)";
  ctx.fillRect(left - 4, y - 16, width + 8, 18);
  ctx.fillStyle = color;
  ctx.fillText(text, left, y - 3);
}

function deltaDivergence(rows: Candle[], at: (time: number) => number, next: AutoMark[]) {
  const hit = deltaDivergenceOn(rows);
  if (!hit) return "";
  const name = hit.bull ? "дивер дельты бычий" : "дивер дельты медвежий";
  const tip = hit.onHigh ? "верх" : "низ";
  next.push({
    t: "line",
    a: wick(rows, at(hit.a.time), hit.a.price, tip),
    b: wick(rows, at(hit.b.time), hit.b.price, tip),
    name,
    color: "#d6ff4a",
  });
  return name;
}

function wick(rows: Candle[], i: number, price: number, label = ""): Pt {
  const at = Math.min(rows.length - 1, Math.max(0, Math.round(i)));
  const c = rows[at];
  if (!c) return { i: at, price };
  const high = new Set(["T1", "T2", "H", "верх", "горб", "левая голова", "правая голова"]);
  const low = new Set(["B1", "B2", "L", "низ", "дно", "лапа", "брюхо", "левая лапа", "правая лапа"]);
  if (high.has(label)) return { i: at, price: c.high };
  if (low.has(label)) return { i: at, price: c.low };
  return { i: at, price: Math.abs(c.high - price) <= Math.abs(c.low - price) ? c.high : c.low };
}

function axes(w: number, h: number, candles: Candle[], extra: Array<number | null>, first = candles.length) {
  const fit = Number.isFinite(first) ? Math.max(0, first - 3) : candles.length;
  const start = Math.max(0, Math.min(fit, candles.length - 24));
  const rows = candles.slice(start);
  const raw = rows.length ? rows : candles;
  const lo = Math.min(...raw.map((c) => c.low));
  const hi = Math.max(...raw.map((c) => c.high));
  const room = hi - lo || Math.abs(hi) * 0.01 || 1;
  const near = extra.filter((n): n is number => n != null && Number.isFinite(n) && n > lo - room * 0.4 && n < hi + room * 0.4);
  const { min, max } = span(raw, near);
  const top = 36;
  const bottom = 228;
  const plotRight = RIGHT;
  const xOf = (i: number) => {
    const local = i - start;
    return LEFT + ((w - LEFT - plotRight) * local) / Math.max(rows.length - 1, 1);
  };
  const yOf = (p: number) => top + ((max - p) / (max - min || 1)) * Math.max(h - top - bottom, 1);
  return { start, rows, min, max, bottom, top, priceBottom: h - bottom, plotRight, xOf, yOf };
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
