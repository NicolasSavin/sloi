import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { PlanDraw } from "@/components/tv/plan-draw";
import { MinuteChart } from "@/components/tv/minute-chart";
import { deskCommandFn } from "@/lib/desk-api";
import { readDeskKey } from "@/lib/desk-key";
import { PAIR_OPTIONS } from "@/lib/ea-settings";
import { tvSymbol } from "@/lib/tradingview";

const FRAMES: [string, string][] = [
  ["1", "1м"],
  ["2", "2м"],
  ["3", "3м"],
  ["5", "5м"],
  ["10", "10м"],
  ["15", "15м"],
  ["30", "30м"],
  ["45", "45м"],
  ["60", "1ч"],
  ["90", "90м"],
  ["120", "2ч"],
  ["180", "3ч"],
  ["240", "4ч"],
  ["360", "6ч"],
  ["D", "Д"],
  ["W", "Н"],
  ["M", "М"],
];

const TV_INTERVALS = new Set(["1", "3", "5", "15", "30", "60", "120", "180", "240", "D", "W", "M"]);

function minutesOf(interval: string) {
  if (interval === "D") return 1440;
  if (interval === "W") return 10080;
  if (interval === "M") return 43200;
  const n = Number(interval);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

export const Route = createFileRoute("/ideas")({
  validateSearch: (s: Record<string, unknown>) => ({
    pair: typeof s.pair === "string" && PAIR_OPTIONS.includes(s.pair as (typeof PAIR_OPTIONS)[number]) ? s.pair : "EURUSD",
  }),
  component: IdeasPage,
});

function IdeasPage() {
  const { pair } = Route.useSearch();
  const navigate = useNavigate();
  const symbol = tvSymbol(pair);
  const host = useRef<HTMLDivElement>(null);
  const [key, setKey] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [draw, setDraw] = useState(false);
  const [interval, setInterval] = useState("60");
  const [typed, setTyped] = useState("");
  const native = TV_INTERVALS.has(interval);
  const barMinutes = minutesOf(interval);

  useEffect(() => {
    setKey(readDeskKey());
  }, []);

  useEffect(() => {
    const root = host.current;
    if (!root) return;
    if (!native) {
      root.replaceChildren();
      return;
    }
    root.replaceChildren();
    const box = document.createElement("div");
    box.className = "tradingview-widget-container";
    box.style.height = "100%";
    box.style.width = "100%";
    const pane = document.createElement("div");
    pane.className = "tradingview-widget-container__widget";
    pane.style.height = "calc(100% - 32px)";
    pane.style.width = "100%";
    const copy = document.createElement("div");
    copy.className = "tradingview-widget-container__copyright";
    copy.innerHTML =
      '<a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank"><span class="blue-text">График TradingView</span></a>';
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: "Asia/Dubai",
      theme: "dark",
      style: "1",
      locale: "ru",
      backgroundColor: "#131722",
      gridColor: "rgba(242, 242, 242, 0.06)",
      allow_symbol_change: true,
      hide_top_toolbar: false,
      hide_side_toolbar: false,
      hide_legend: false,
      withdateranges: true,
      details: true,
      save_image: true,
      studies: ["Volume@tv-basicstudies", "Volume Delta@tv-basicstudies"],
      support_host: "https://www.tradingview.com",
    });
    box.append(pane, copy, script);
    root.append(box);
    return () => root.replaceChildren();
  }, [symbol, interval, native]);

  async function send(kind: "BUY" | "SELL" | "CLOSE") {
    if (!key) {
      setNote("Сначала откройте кабинет в этом браузере.");
      return;
    }
    setBusy(true);
    setNote(kind === "BUY" ? "Покупка уходит брокеру…" : kind === "SELL" ? "Продажа уходит брокеру…" : "Закрываю пару у брокера…");
    const res = await deskCommandFn({ data: { key, kind, symbol: pair } });
    setBusy(false);
    setNote(res.ok ? "Приказ у вашего советника." : res.error);
  }

  async function sendPlan(how: "now" | "limit", plan: { side: "buy" | "sell"; entry: number; stop: number; target: number }) {
    if (!key) {
      setNote("Сначала откройте кабинет в этом браузере.");
      return;
    }
    setBusy(true);
    setNote(how === "now" ? "Рыночный приказ уходит брокеру…" : "Лимитка уходит брокеру…");
    const res = await deskCommandFn({
      data: {
        key,
        kind: plan.side === "buy" ? "BUY" : "SELL",
        symbol: pair,
        entry: plan.entry,
        stop: plan.stop,
        tp: plan.target,
        how,
      },
    });
    setBusy(false);
    setNote(res.ok ? "План у вашего советника." : res.error);
  }

  return (
    <div className="flex h-screen flex-col bg-[#131722] text-zinc-100">
      <AppNav />
      <div className="relative min-h-0 flex-1">
        <div ref={host} className="absolute inset-0" />
        {!native ? <MinuteChart pair={pair} minutes={barMinutes} /> : null}
        <div className="absolute left-3 top-2 z-10">
          <button type="button" onClick={() => setDraw(true)} className="h-10 rounded-sm bg-amber-100 px-4 text-sm font-semibold text-zinc-900 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
            Нарисовать план
          </button>
        </div>
        <div className="absolute left-3 top-14 z-10 flex max-w-[78vw] flex-wrap items-center gap-1 rounded-md bg-[#131722]/95 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
          {FRAMES.map(([id, name]) => (
            <button
              key={id}
              type="button"
              onClick={() => setInterval(id)}
              className={`h-7 rounded-sm px-2 text-xs ${interval === id ? "bg-amber-100 font-semibold text-zinc-900" : "bg-[#1e222d] text-zinc-200"}`}
            >
              {name}
            </button>
          ))}
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Math.round(Number(typed.replace(",", ".")));
              if (n >= 1 && n <= 1440) setInterval(String(n));
            }}
          >
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              inputMode="numeric"
              placeholder="мин"
              className="h-7 w-14 rounded-sm bg-[#1e222d] px-2 text-xs outline-none"
            />
            <button type="submit" className="h-7 rounded-sm bg-[#2a2e39] px-2 text-xs text-zinc-100">
              Свой
            </button>
          </form>
        </div>
        <div className="absolute right-3 top-2 z-10 flex max-w-[70vw] flex-wrap items-center justify-end gap-1 rounded-md bg-[#131722] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
          <select
            value={pair}
            onChange={(e) => void navigate({ to: "/ideas", search: { pair: e.target.value } })}
            className="h-9 rounded-sm bg-[#1e222d] px-2 text-xs text-zinc-100"
          >
            {PAIR_OPTIONS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy} onClick={() => void send("SELL")} className="h-9 rounded-sm bg-[#f23645] px-3 text-sm font-semibold text-white disabled:opacity-60">
            Продать
          </button>
          <button type="button" disabled={busy} onClick={() => void send("BUY")} className="h-9 rounded-sm bg-[#089981] px-3 text-sm font-semibold text-white disabled:opacity-60">
            Купить
          </button>
          <button type="button" disabled={busy} onClick={() => void send("CLOSE")} className="h-9 rounded-sm bg-[#2a2e39] px-3 text-sm text-zinc-100 disabled:opacity-60">
            Закрыть
          </button>
        </div>
        {note && !draw ? <p className="absolute bottom-10 right-3 z-10 rounded bg-black/80 px-3 py-1 text-xs text-amber-100">{note}</p> : null}
        {draw ? <PlanDraw pair={pair} minutes={barMinutes} busy={busy} note={note} onClose={() => setDraw(false)} onSend={(how, plan) => void sendPlan(how, plan)} /> : null}
      </div>
    </div>
  );
}
