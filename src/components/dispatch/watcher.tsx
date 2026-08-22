import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { isOpenAction, useDispatchStore } from "@/lib/dispatch-store";
import { fetchDigest, fetchMarket } from "@/lib/market/fetch";
import { playDispatch, speakRu, unlockSound } from "@/lib/sound";
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
  const seen = useRef<Record<string, string>>({});
  const primed = useRef(false);
  const settling = useRef(false);

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
      for (const m of markets) seen.current[m.spec.id] = m.advice.action;
      primed.current = true;
      return;
    }
    for (const m of markets) {
      const prev = seen.current[m.spec.id];
      const next = m.advice.action;
      seen.current[m.spec.id] = next;
      if (!isOpenAction(next)) continue;
      if (prev === next) continue;
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
      if (voiceOn) {
        void speakRu(`Сигнал. ${m.spec.label}. ${next === "long" ? "Лонг" : "Шорт"}. ${m.advice.title}`);
      }
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
        patchHits(next);
      } finally {
        settling.current = false;
      }
    };
    void run();
  }, [q.data, patchHits]);

  useEffect(() => {
    if (!onDuty) primed.current = false;
  }, [onDuty]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => clearFlash(), 9000);
    return () => window.clearTimeout(t);
  }, [flash, clearFlash]);

  const art = typeof marketArt === "function" ? marketArt(flash?.symbol) : "/art/strata.jpg";

  return (
    <>
      {flash ? (
        <div className="fixed inset-x-0 top-0 z-40 px-3 pt-3">
          <div
            className={cn(
              "panel-volume group relative mx-auto flex max-w-3xl overflow-hidden rounded-xl",
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
