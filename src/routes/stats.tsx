import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { SignalBook, StatsByPair, StatsByReason, StatsStrip } from "@/components/dispatch/book";
import type { SignalHit } from "@/lib/dispatch-store";
import { useDispatchStore } from "@/lib/dispatch-store";

export const Route = createFileRoute("/stats")({
  component: StatsPage,
});

async function loadArchive(): Promise<SignalHit[]> {
  const res = await fetch("/api/archive.json", { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { log?: SignalHit[] };
  return Array.isArray(data.log) ? data.log : [];
}

function mergeLogs(server: SignalHit[], local: SignalHit[]) {
  const map = new Map<string, SignalHit>();
  for (const h of local) map.set(h.id, h);
  for (const h of server) {
    const prev = map.get(h.id);
    if (!prev) {
      map.set(h.id, h);
      continue;
    }
    const prevClosed = (prev.status ?? "open") !== "open";
    const nextClosed = (h.status ?? "open") !== "open";
    if (!prevClosed && nextClosed) map.set(h.id, h);
    else if (prevClosed && !nextClosed) continue;
    else map.set(h.id, { ...prev, ...h });
  }
  return [...map.values()].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

function StatsPage() {
  const local = useDispatchStore((s) => s.log);
  const q = useQuery({
    queryKey: ["signal-archive"],
    queryFn: loadArchive,
    refetchInterval: 60_000,
    staleTime: 20_000,
  });
  const log = useMemo(() => mergeLogs(q.data ?? [], local), [q.data, local]);

  return (
    <div className="min-h-dvh">
      <AppNav />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="font-mono text-xs tracking-[0.22em] text-accent">КНИГА СДЕЛОК</p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight sm:text-5xl">Почему так закрылось</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Архив сервера + ваш журнал в браузере. Винрейт только по цели и стопу после реального касания входа.
          Тень через зону без закрытия — не сделка. Новость и «не состоялся» — отдельно. С 1.6.0: не больше 4 живых
          приказов, стоп шире, пауза 3 часа после стопа, против макро/премии не входим.
        </p>
        {q.isLoading ? <p className="mt-6 text-sm text-dim">Гружу архив…</p> : null}
        <div className="mt-8">
          <StatsStrip log={log} />
        </div>
        <StatsByPair log={log} />
        <StatsByReason log={log} />
        <section className="mt-12">
          <p className="font-mono text-xs tracking-[0.18em] text-accent">АРХИВ</p>
          <SignalBook log={log} />
        </section>
      </main>
    </div>
  );
}
