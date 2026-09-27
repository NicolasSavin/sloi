import { useEffect, useRef, useState } from "react";
import { fetchCustomBars, fetchMarket } from "@/lib/market/fetch";
import type { Candle } from "@/lib/market/types";

type Tool = "entry" | "stop" | "target";
const TF = { 5: "5m", 15: "15m", 60: "1h", 240: "4h", 1440: "1d" } as const;

/** Клик по графику ставит вход, стоп и тейк. Отсюда же уходит приказ советнику. */
export function MarkOrder({
  pair,
  minutes,
  busy,
  onSend,
}: {
  pair: string;
  minutes: number;
  busy: boolean;
  onSend: (how: "now" | "limit", plan: { side: "buy" | "sell"; entry: number; stop: number; target: number }) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [rows, setRows] = useState<Candle[]>([]);
  const [tool, setTool] = useState<Tool>("entry");
  const [entry, setEntry] = useState<number | null>(null);
  const [stop, setStop] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const scale = useRef<{ min: number; max: number; top: number; bot: number } | null>(null);

  useEffect(() => {
    let stopFetch = false;
    const standard = TF[minutes as keyof typeof TF];
    void (async () => {
      try {
        const candles = standard
          ? (await fetchMarket({ data: { symbol: pair, timeframe: standard } })).candles.slice(-120)
          : (await fetchCustomBars({ data: { symbol: pair, minutes } })).candles.slice(-120);
        if (!stopFetch) setRows(candles);
      } catch {
        if (!stopFetch) setRows([]);
      }
    })();
    return () => {
      stopFetch = true;
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
      if (!ctx || rows.length < 2) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);
      const top = 36;
      const bot = r.height - 78;
      let min = Math.min(...rows.map((c) => c.low));
      let max = Math.max(...rows.map((c) => c.high));
      const pad = (max - min) * 0.08 || 1;
      min -= pad;
      max += pad;
      scale.current = { min, max, top, bot };
      const yOf = (price: number) => top + ((max - price) / (max - min)) * (bot - top);
      const level = (price: number | null, color: string, name: string) => {
        if (price == null) return;
        const y = yOf(price);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(56, y);
        ctx.lineTo(r.width - 72, y);
        ctx.stroke();
        ctx.font = "bold 13px sans-serif";
        ctx.fillStyle = color;
        ctx.fillText(`${name} ${price.toFixed(price > 20 ? 2 : 5)}`, 64, y - 6);
      };
      level(entry, "#26a69a", "вход");
      level(stop, "#f23645", "стоп");
      level(target, "#ffb020", "тейк");
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [rows, entry, stop, target]);

  function priceAt(y: number) {
    const s = scale.current;
    if (!s || s.bot <= s.top) return null;
    const t = (y - s.top) / (s.bot - s.top);
    return s.max - t * (s.max - s.min);
  }

  function click(e: React.MouseEvent<HTMLCanvasElement>) {
    const y = e.nativeEvent.offsetY;
    const price = priceAt(y);
    if (price == null || !Number.isFinite(price)) return;
    if (tool === "entry") setEntry(price);
    if (tool === "stop") setStop(price);
    if (tool === "target") setTarget(price);
  }

  const plan = orderOf(entry, stop, target);
  const closed = marketClosed(pair);

  return (
    <>
      <canvas ref={ref} onClick={click} className="absolute inset-0 z-20 cursor-crosshair" />
      <div className="absolute inset-x-2 bottom-2 z-30 flex flex-wrap items-center gap-2 rounded-md bg-[#131722]/95 px-2 py-2">
        {(
          [
            ["entry", "Вход"],
            ["stop", "Стоп"],
            ["target", "Тейк"],
          ] as const
        ).map(([id, name]) => (
          <button key={id} type="button" onClick={() => setTool(id)} className={`h-8 rounded-sm px-3 text-sm ${tool === id ? "bg-amber-100 font-semibold text-zinc-900" : "bg-[#2a2e39] text-zinc-100"}`}>
            {name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setEntry(null);
            setStop(null);
            setTarget(null);
          }}
          className="h-8 rounded-sm bg-[#2a2e39] px-3 text-sm text-zinc-100"
        >
          Стереть
        </button>
        <span className="text-xs text-zinc-300">
          {closed
            ? "Рынок закрыт. Сразу брокер не откроет. Отложка встанет и дождётся открытия."
            : plan
              ? `${plan.side === "buy" ? "Покупка" : "Продажа"} ${fmt(plan.entry)}, стоп ${fmt(plan.stop)}, тейк ${fmt(plan.target)}`
              : "Клик по графику ставит выбранный уровень. Стоп и тейк — с разных сторон входа."}
        </span>
        <button type="button" disabled={busy || !plan || closed} onClick={() => plan && onSend("now", plan)} className="ml-auto h-8 rounded-sm bg-[#089981] px-3 text-sm font-semibold text-white disabled:opacity-50">
          Приказ сразу
        </button>
        <button type="button" disabled={busy || !plan} onClick={() => plan && onSend("limit", plan)} className="h-8 rounded-sm bg-amber-100 px-3 text-sm font-semibold text-zinc-900 disabled:opacity-50">
          {closed ? "Отложка до открытия" : "Приказ лимитом"}
        </button>
      </div>
    </>
  );
}

function marketClosed(pair: string) {
  if (pair.endsWith("USD") && ["BTC", "ETH", "LTC", "BCH", "XRP", "TON"].some((c) => pair.startsWith(c))) return false;
  const d = new Date();
  const day = d.getUTCDay();
  const hour = d.getUTCHours();
  if (day === 6) return true;
  if (day === 0 && hour < 22) return true;
  if (day === 5 && hour >= 22) return true;
  return false;
}

function orderOf(entry: number | null, stop: number | null, target: number | null) {
  if (entry == null || stop == null || target == null) return null;
  if (stop < entry && entry < target) return { side: "buy" as const, entry, stop, target };
  if (target < entry && entry < stop) return { side: "sell" as const, entry, stop, target };
  return null;
}

function fmt(n: number) {
  return n > 20 ? n.toFixed(2) : n.toFixed(5);
}
