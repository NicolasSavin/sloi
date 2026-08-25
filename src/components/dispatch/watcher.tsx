import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { isOpenAction, useDispatchStore } from "@/lib/dispatch-store";
import { fetchDigest, fetchMarket } from "@/lib/market/fetch";
import { fillMode } from "@/lib/execution";
import { playDispatch, scriptCancel, scriptExit, scriptFill, scriptOrder, scriptReady, speakRu, unlockSound } from "@/lib/sound";
import { deskToast } from "@/lib/notify";
import { newsAlertKey, newsAlertText } from "@/lib/calendar";
import { useDeskStore } from "@/lib/desk-store";
import { actionLabel } from "@/lib/advisor";
import { LiveShot } from "@/components/live-shot";
import { marketArt } from "@/lib/art";
import { settleHit } from "@/lib/signal-book";
import { cn, formatPrice } from "@/lib/utils";

export function DispatchWatcher() {
  const onDuty = useDispatchStore((s) => s.onDuty);
  const flash = useDispatchStore((s) => s.flash);
  const log = useDispatchStore((s) => s.log);
  const pushHit = useDispatchStore((s) => s.pushHit);
  const patchHits = useDispatchStore((s) => s.patchHits);
  const clearFlash = useDispatchStore((s) => s.clearFlash);
  const voiceOn = useDeskStore((s) => s.voiceOn);
  const soundOn = useDeskStore((s) => s.soundOn);
  const seen = useRef<Record<string, { action: string; mode?: string; ready?: boolean; filled?: boolean }>>({});
  const closedVoice = useRef<Record<string, string>>({});
  const primed = useRef(false);
  const settling = useRef(false);
  const newsSeen = useRef("");

  const openHits = log.filter((h) => (h.status ?? "open") === "open");
  const watching = onDuty || openHits.length > 0;

  const q = useQuery({
    queryKey: ["dispatch-digest"],
    queryFn: () => fetchDigest(),
    enabled: watching,
    refetchInterval: watching ? 45_000 : false,
    staleTime: 20_000,
  });

  useEffect(() => {
    const markets = q.data?.digest.markets;
    if (!onDuty || !markets) return;
    if (!primed.current) {
      for (const m of markets) seen.current[m.spec.id] = { action: m.advice.action };
      primed.current = true;
      return;
    }
    for (const m of markets) {
      const prev = seen.current[m.spec.id] ?? { action: "wait" };
      const next = m.advice.action;
      const live = isOpenAction(next);
      const was = isOpenAction(prev.action as "long" | "short" | "wait" | "skip");
      let mode: "LIMIT" | "MARKET" | "LATE" | undefined;
      let pips = 0;
      if (live && m.setup.entry != null && m.setup.stop != null) {
        mode = fillMode(next, m.lastClose, m.setup.entry, m.setup.stop, m.setup.targets[0]);
        pips = m.spec.pip > 0 ? Math.round(Math.abs(m.lastClose - m.setup.entry) / m.spec.pip) : 0;
      }
      if (was && !live) {
        if (voiceOn) void speakRu(scriptCancel(m.spec.id, m.spec.label, prev.action as "long" | "short"));
        void deskToast("SLOI · отмена", scriptCancel(m.spec.id, m.spec.label, prev.action as "long" | "short"), {
          tag: m.spec.id,
        });
        seen.current[m.spec.id] = { action: next };
        continue;
      }
      if (live && prev.action !== next) {
        if (was && voiceOn) void speakRu(scriptCancel(m.spec.id, m.spec.label, prev.action as "long" | "short"));
        const hit = {
          id: `${m.spec.id}-${next}-${Date.now()}`,
          at: Date.now(),
          symbol: m.spec.id,
          label: m.spec.label,
          action: next,
          entry: m.setup.entry,
          stop: m.setup.stop,
          target: m.setup.targets[0] ?? null,
          title: m.advice.title,
          decimals: m.spec.decimals,
          status: "open" as const,
        };
        pushHit(hit);
        if (soundOn) playDispatch(next);
        if (voiceOn) void speakRu(scriptOrder(m));
        void deskToast(
          `SLOI · ${m.spec.label}`,
          scriptOrder(m),
          { tag: m.spec.id, url: "/dispatch" },
        );
        seen.current[m.spec.id] = {
          action: next,
          mode,
          ready: mode === "MARKET" || pips <= 4,
          filled: mode === "MARKET",
        };
        continue;
      }
      if (live && prev.action === next) {
        if (mode === "MARKET" && prev.mode === "LIMIT" && !prev.filled) {
          if (voiceOn) void speakRu(scriptFill(m.spec.id, m.spec.label, next));
          if (soundOn) playDispatch(next);
          void deskToast("SLOI · вход", scriptFill(m.spec.id, m.spec.label, next), { tag: m.spec.id });
          seen.current[m.spec.id] = { ...prev, mode, filled: true, ready: true };
          continue;
        }
        if (mode === "LIMIT" && pips <= 8 && !prev.ready) {
          if (voiceOn) void speakRu(scriptReady(m.spec.id, m.spec.label, next, pips));
          void deskToast("SLOI · зона", scriptReady(m.spec.id, m.spec.label, next, pips), { tag: `${m.spec.id}-ready` });
          seen.current[m.spec.id] = { ...prev, mode, ready: true };
          continue;
        }
        seen.current[m.spec.id] = { ...prev, mode };
        continue;
      }
      seen.current[m.spec.id] = { action: next, mode };
    }
  }, [q.data, onDuty, pushHit, soundOn, voiceOn]);

  useEffect(() => {
    const digest = q.data?.digest;
    if (!digest || settling.current) return;
    const open = useDispatchStore.getState().log.filter((h) => (h.status ?? "open") === "open");
    if (open.length === 0) return;
    settling.current = true;
    const run = async () => {
      try {
        const ids = [...new Set(open.map((h) => h.symbol))].slice(0, 8);
        const tapes = await Promise.all(
          ids.map((id) => fetchMarket({ data: { symbol: id, timeframe: "1h" } }).catch(() => null)),
        );
        const byId = new Map(ids.map((id, i) => [id, tapes[i]?.candles]));
        const halt = digest.fund.halt;
        const next = open.map((h) => {
          const market = digest.markets.find((m) => m.spec.id === h.symbol);
          return settleHit(h, market, halt, byId.get(h.symbol));
        });
        for (const h of next) {
          const st = h.status ?? "open";
          if (st === "open") continue;
          if (closedVoice.current[h.id] === st) continue;
          closedVoice.current[h.id] = st;
          if (voiceOn) void speakRu(scriptExit(h));
          if (soundOn) playDispatch(st === "target" ? "long" : "short");
          void deskToast(
            st === "target" ? "SLOI · тейк" : st === "stop" ? "SLOI · стоп" : "SLOI · закрыто",
            scriptExit(h),
            { tag: h.symbol },
          );
        }
        patchHits(next);
      } finally {
        settling.current = false;
      }
    };
    void run();
  }, [q.data, patchHits, voiceOn, soundOn]);

  useEffect(() => {
    if (!onDuty) primed.current = false;
  }, [onDuty]);

  const halt = q.data?.digest.fund?.halt;
  const newsLine = halt ? newsAlertText(halt) : "";
  const warnNews = Boolean(halt?.event && newsLine);
  const [newsOpen, setNewsOpen] = useState(false);

  useEffect(() => {
    if (!onDuty || !halt || !warnNews) {
      setNewsOpen(false);
      return;
    }
    const key = newsAlertKey(halt);
    if (newsSeen.current === key) return;
    newsSeen.current = key;
    setNewsOpen(true);
    if (soundOn) playDispatch("short");
    if (voiceOn) void speakRu(newsLine);
    if (!halt.active) {
      const t = window.setTimeout(() => setNewsOpen(false), 12_000);
      return () => window.clearTimeout(t);
    }
  }, [onDuty, halt?.at, halt?.minutes, halt?.active, halt?.event, newsLine, warnNews, soundOn, voiceOn]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => clearFlash(), 9000);
    return () => window.clearTimeout(t);
  }, [flash, clearFlash]);

  const art = typeof marketArt === "function" ? marketArt(flash?.symbol) : "/art/strata.jpg";

  return (
    <>
      {flash ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-16 z-30 px-3">
          <div
            className={cn(
              "pointer-events-auto panel-volume group relative mx-auto flex max-w-3xl overflow-hidden rounded-xl",
              flash.action === "long" ? "border-bull/40" : "border-bear/40",
            )}
          >
            <span className="relative h-20 w-28 shrink-0 overflow-hidden sm:w-36">
              <LiveShot src={art} />
            </span>
            <div className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3">
              <span className={cn("size-2.5 shrink-0 rounded-full on-air-dot", flash.action === "long" ? "bg-bull" : "bg-bear")} />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs tracking-[0.16em] text-accent">СИГНАЛ ДИСПЕТЧЕРУ</p>
                <p className="truncate text-lg">
                  {flash.label} · {actionLabel(flash.action)}
                  {flash.entry != null ? ` · вход ${formatPrice(flash.entry, flash.decimals)}` : ""}
                </p>
              </div>
              <Link to="/dispatch" className="shrink-0 text-sm text-accent">
                Табло
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {onDuty && newsOpen && newsLine ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-16 z-30 px-3">
          <div className="pointer-events-auto panel-volume mx-auto flex max-w-3xl items-start gap-3 rounded-xl border-bear/50 bg-bg/95 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs tracking-[0.16em] text-accent">
                {halt?.active ? "КАЛЕНДАРЬ · ТОРМОЖУ" : "КАЛЕНДАРЬ"}
              </p>
              <p className="mt-1 text-lg leading-snug">{newsLine}</p>
            </div>
            <button type="button" className="shrink-0 pt-1 text-sm text-muted" onClick={() => setNewsOpen(false)}>
              закрыть
            </button>
          </div>
        </div>
      ) : null}

      {onDuty ? (
        <button
          type="button"
          onClick={() => unlockSound()}
          className="fixed bottom-4 left-4 z-30 hidden items-center gap-2 rounded-sm bg-elevated/90 px-3 py-2 font-mono text-xs tracking-wide shadow-[var(--shadow-volume)] sm:inline-flex"
        >
          <span className="on-air-dot size-1.5 rounded-full bg-bull" />
          на смене · слушаю пары
        </button>
      ) : null}
    </>
  );
}
