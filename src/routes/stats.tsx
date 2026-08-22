import { createFileRoute } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { SignalBook, StatsByPair, StatsStrip } from "@/components/dispatch/book";
import { useDispatchStore } from "@/lib/dispatch-store";

export const Route = createFileRoute("/stats")({
  component: StatsPage,
});

function StatsPage() {
  const log = useDispatchStore((s) => s.log);
  return (
    <div className="min-h-dvh">
      <AppNav />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="font-mono text-xs tracking-[0.22em] text-accent">КНИГА СДЕЛОК</p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight sm:text-5xl">Почему так закрылось</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Старые сигналы не стираются. Винрейт считается только по цели и стопу. Новость и «не состоялся» — отдельно,
          это не победа и не поражение.
        </p>
        <div className="mt-8">
          <StatsStrip log={log} />
        </div>
        <StatsByPair log={log} />
        <section className="mt-12">
          <p className="font-mono text-xs tracking-[0.18em] text-accent">АРХИВ</p>
          <SignalBook log={log} />
        </section>
      </main>
    </div>
  );
}
