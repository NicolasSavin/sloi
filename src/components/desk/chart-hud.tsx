import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useDeskStore } from "@/lib/desk-store";
import { TIMEFRAMES } from "@/lib/market/symbols";
import { actionLabel } from "@/lib/advisor";
import type { Advice } from "@/lib/advisor";
import type { LocalSetup } from "@/lib/smc/engine";
import { cn, formatPrice } from "@/lib/utils";
import { deskCommandFn } from "@/lib/desk-api";
import { brokerMid, liveOhlc } from "@/lib/broker-tape";
import { readDeskKey } from "@/lib/desk-key";

export function ChartHud({ boxRef }: { boxRef: RefObject<HTMLDivElement | null> }) {
  const timeframe = useDeskStore((s) => s.timeframe);
  const setTimeframe = useDeskStore((s) => s.setTimeframe);
  const quoteSource = useDeskStore((s) => s.quoteSource);
  const setQuoteSource = useDeskStore((s) => s.setQuoteSource);
  const toggleOverlay = useDeskStore((s) => s.toggleOverlay);
  const overlays = useDeskStore((s) => s.overlays);
  const requestFit = useDeskStore((s) => s.requestFit);
  const symbol = useDeskStore((s) => s.symbol);
  const [wide, setWide] = useState(false);
  const [deskKey, setDeskKey] = useState("");
  const [note, setNote] = useState("");
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setNowTick((n) => n + 1), 4000);
    return () => window.clearInterval(id);
  }, []);
  const mt4n = liveOhlc(symbol).length;
  const mt4last = brokerMid(symbol, "client") ?? brokerMid(symbol);
  const mt4tag = mt4n >= 2 ? ` ${mt4n}` : mt4last ? " last" : " 0";
  void nowTick;
  useEffect(() => { setDeskKey(readDeskKey()); }, []);
  const cmd = async (kind: "BUY" | "SELL" | "CLOSE" | "CLOSE_PROFIT" | "CLOSE_ALL") => {
    if (!deskKey) {
      setNote("ключ в кабинете");
      return;
    }
    const r = await deskCommandFn({
      data: { key: deskKey, kind, symbol: kind === "CLOSE" || kind === "BUY" || kind === "SELL" ? symbol : undefined },
    });
    setNote(r.ok ? `${kind} → сов` : r.error ?? "ошибка");
  };

  const sync = useCallback(() => {
    const el = boxRef.current;
    const on = Boolean(el && document.fullscreenElement === el);
    setWide(on);
    window.setTimeout(() => requestFit(), 80);
  }, [boxRef, requestFit]);

  const toggle = useCallback(async () => {
    const el = boxRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      /* браузер запретил */
    }
  }, [boxRef]);

  useEffect(() => {
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [sync]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "F1") {
        e.preventDefault();
        e.stopPropagation();
        toggleOverlay("callouts");
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        toggleOverlay("tapeInf");
        return;
      }
      if (e.key === "F3") {
        e.preventDefault();
        toggleOverlay("tapeSplash");
        return;
      }
      if (e.key === "F4") {
        e.preventDefault();
        toggleOverlay("tapeImb");
        return;
      }
      if (e.key === "F8") {
        e.preventDefault();
        e.stopPropagation();
        void toggle();
        return;
      }
      if (e.key === "F9") {
        e.preventDefault();
        e.stopPropagation();
        toggleOverlay("callouts");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [toggle, toggleOverlay]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between gap-2 p-2">
      <div className="pointer-events-auto flex flex-wrap items-center gap-0.5 rounded-md bg-bg/80 p-1 backdrop-blur-sm">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.id}
            type="button"
            onClick={() => setTimeframe(tf.id)}
            className={cn(
              "h-8 min-w-9 rounded-sm px-2 font-mono text-[11px]",
              tf.id === timeframe ? "bg-subtle text-fg" : "text-muted hover:text-fg",
            )}
          >
            {tf.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        <button
          type="button"
          onClick={() => setQuoteSource("yahoo")}
          className={cn(
            "h-8 rounded-sm px-2 font-mono text-[11px]",
            quoteSource === "yahoo" ? "bg-subtle text-fg" : "text-muted hover:text-fg",
          )}
        >
          Yahoo
        </button>
        <button
          type="button"
          onClick={() => setQuoteSource("broker")}
          className={cn(
            "h-8 rounded-sm px-2 font-mono text-[11px]",
            quoteSource === "broker" ? "bg-subtle text-fg" : "text-muted hover:text-fg",
          )}
          title={mt4n ? `${mt4n} часовых баров с терминала` : mt4last ? "есть last брокера, баров мало" : "бары с терминала не пришли — сов 4.92"}
        >
          MT4{mt4tag}
        </button>
      </div>
      <div className="pointer-events-auto flex flex-wrap items-center gap-1">
        <button type="button" onClick={() => void cmd("BUY")} className="h-8 rounded-md bg-bg/80 px-2 font-mono text-[11px] text-bull/90 backdrop-blur-sm ring-1 ring-bull/30 hover:bg-bull/10">купить</button>
        <button type="button" onClick={() => void cmd("SELL")} className="h-8 rounded-md bg-bg/80 px-2 font-mono text-[11px] text-bear/90 backdrop-blur-sm ring-1 ring-bear/30 hover:bg-bear/10">продать</button>
        <button type="button" onClick={() => void cmd("CLOSE")} className="h-8 rounded-md bg-bg/80 px-2 font-mono text-[11px] text-muted backdrop-blur-sm hover:text-fg">закрыть</button>
        <button type="button" onClick={() => void cmd("CLOSE_PROFIT")} className="h-8 rounded-md bg-bg/80 px-2 font-mono text-[11px] text-muted backdrop-blur-sm hover:text-fg">+прибыль</button>
        <button type="button" onClick={() => void cmd("CLOSE_ALL")} className="h-8 rounded-md bg-bg/80 px-2 font-mono text-[11px] text-muted backdrop-blur-sm hover:text-fg">всё</button>
        {note ? <span className="max-w-[9rem] truncate font-mono text-[10px] text-dim">{note}</span> : null}
        {(
          [
            ["callouts", "F1", "пузыри"],
            ["tapeInf", "F2", "вливание"],
            ["tapeSplash", "F3", "сплэш"],
            ["tapeImb", "F4", "IMB"],
          ] as const
        ).map(([key, fk, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleOverlay(key)}
            className={cn(
              "inline-flex h-8 items-center rounded-md bg-bg/80 px-1.5 font-mono text-[10px] backdrop-blur-sm",
              overlays[key] !== false ? "text-muted hover:text-fg" : "text-gold",
            )}
            title={`${fk} — ${label}`}
          >
            {fk}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            useDeskStore.getState().requestFit();
            window.dispatchEvent(new Event("sloi-fit"));
          }}
          className="inline-flex h-8 items-center rounded-md bg-bg/80 px-2 font-mono text-[11px] text-muted backdrop-blur-sm hover:text-fg"
          title="Подогнать цену и время"
        >
          масштаб
        </button>
        <button
          type="button"
          onClick={() => void toggle()}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-bg/80 px-2 font-mono text-[11px] text-muted backdrop-blur-sm hover:text-fg"
          aria-label={wide ? "Свернуть график" : "Полный экран F8"}
          title="F8 — полный экран"
        >
          {wide ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          {wide ? "свернуть" : "F8 экран"}
        </button>
      </div>
    </div>
  );
}

export function OrderHud({
  order,
  setup,
  decimals,
  loading,
  boxVector,
}: {
  order?: Advice | null;
  setup?: LocalSetup | null;
  decimals: number;
  loading?: boolean;
  boxVector?: { dir: "up" | "down" | "none"; magnet: number | null; because: string } | null;
}) {
  const [open, setOpen] = useState(true);
  const live = order?.action === "long" || order?.action === "short";
  const side = order ? actionLabel(order.action) : loading ? "гружу стол…" : "нет ленты";
  const entry = live && setup?.entry != null ? formatPrice(setup.entry, decimals) : null;
  const stop = live && setup?.stop != null ? formatPrice(setup.stop, decimals) : null;
  const tp = live && setup?.targets[0] != null ? formatPrice(setup.targets[0], decimals) : null;
  const vec =
    boxVector && boxVector.dir !== "none"
      ? `Вектор ${boxVector.dir === "up" ? "вверх" : "вниз"}${boxVector.magnet != null ? ` к ${formatPrice(boxVector.magnet, decimals)}` : ""}`
      : null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-12 z-30 px-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "pointer-events-auto max-w-xl rounded-md border border-accent/40 bg-bg text-left shadow-[var(--shadow-volume)]",
          open ? "px-3 py-2" : "px-3 py-1.5",
        )}
        title={open ? "Свернуть приказ" : "Развернуть приказ"}
      >
        <p className="font-mono text-[10px] tracking-[0.16em] text-accent">
          {open
            ? live
              ? "ПРИКАЗ ДИСПЕТЧЕРА · ДЕРЖИМ, ПОКА НЕ СМЕНИТ"
              : "ПРИКАЗ ДИСПЕТЧЕРА"
            : `ПРИКАЗ · ${side}`}
        </p>
        {open ? (
          <>
            <p className="mt-1 text-sm font-medium">
              {live ? `${side} · вход ${entry} · стоп ${stop} · цель ${tp}` : `${side}. Зоны на графике — карта, не ордер.`}
            </p>
            {vec ? <p className="mt-1 text-xs text-muted">{vec}. Середина не вход.</p> : null}
          </>
        ) : null}
      </button>
    </div>
  );
}

export function ChartStage({ children, className }: { children: ReactNode; className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={boxRef} className={cn("desk-chart relative min-h-[220px] bg-bg", className)}>
      {children}
      <ChartHud boxRef={boxRef} />
    </div>
  );
}
