import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { MinuteChart } from "@/components/tv/minute-chart";
import { PlanDraw } from "@/components/tv/plan-draw";
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
  const [full, setFull] = useState(false);
  const screen = useRef<HTMLDivElement>(null);
  const [interval, setInterval] = useState("60");
  const [typed, setTyped] = useState("");
  const native = TV_INTERVALS.has(interval);
  const barMinutes = minutesOf(interval);

  useEffect(() => {
    setKey(readDeskKey());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F8") return;
      e.preventDefault();
      setFull((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const el = screen.current;
    if (!el) return;
    if (full) {
      if (document.fullscreenElement !== el) void el.requestFullscreen?.().catch(() => {});
    } else if (document.fullscreenElement === el) {
      void document.exitFullscreen?.().catch(() => {});
    }
  }, [full]);

  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === screen.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
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
      details: false,
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
      {full ? null : <AppNav />}
      {full ? null : (
        <div className="flex flex-wrap items-center gap-1 border-b border-white/10 bg-[#131722] px-2 py-1">
          <button type="button" onClick={() => setDraw(true)} className="h-7 rounded-sm bg-amber-100 px-3 text-xs font-semibold text-zinc-900">
            Рисовать
          </button>
          <button type="button" onClick={() => setFull(true)} className="h-7 rounded-sm bg-[#2a2e39] px-2 text-xs text-zinc-100">
            F8 весь экран
          </button>
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
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <select
              value={pair}
              onChange={(e) => void navigate({ to: "/ideas", search: { pair: e.target.value } })}
              className="h-7 rounded-sm bg-[#1e222d] px-2 text-xs text-zinc-100"
            >
              {PAIR_OPTIONS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <button type="button" disabled={busy} onClick={() => void send("SELL")} className="h-7 rounded-sm bg-[#f23645] px-3 text-xs font-semibold text-white disabled:opacity-60">
              Продать
            </button>
            <button type="button" disabled={busy} onClick={() => void send("BUY")} className="h-7 rounded-sm bg-[#089981] px-3 text-xs font-semibold text-white disabled:opacity-60">
              Купить
            </button>
            <button type="button" disabled={busy} onClick={() => void send("CLOSE")} className="h-7 rounded-sm bg-[#2a2e39] px-3 text-xs text-zinc-100 disabled:opacity-60">
              Закрыть
            </button>
          </div>
        </div>
      )}
      <div ref={screen} className="relative min-h-0 flex-1 bg-[#131722]">
        <div ref={host} className="absolute inset-0" />
        {!native ? <MinuteChart pair={pair} minutes={barMinutes} /> : null}
        {full ? (
          <button type="button" onClick={() => setFull(false)} className="absolute right-3 top-2 z-30 h-8 rounded-sm bg-black/70 px-3 text-xs text-zinc-200">
            Выйти
          </button>
        ) : null}
        {note && !draw ? <p className="absolute bottom-10 right-3 z-10 rounded bg-black/80 px-3 py-1 text-xs text-amber-100">{note}</p> : null}
        <div className={draw ? "absolute inset-0 z-20" : "hidden"}>
          <PlanDraw pair={pair} minutes={barMinutes} busy={busy} note={note} onClose={() => setDraw(false)} onSend={(how, plan) => void sendPlan(how, plan)} />
        </div>
      </div>
    </div>
  );
}
