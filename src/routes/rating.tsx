import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { Badge } from "@/components/ui/badge";
import { ANALYST_BOARD } from "@/lib/analysts";
import { fetchReviews } from "@/lib/market/fetch";
import { bookStats } from "@/lib/signal-book";
import type { SignalHit } from "@/lib/dispatch-store";
import { useDispatchStore } from "@/lib/dispatch-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rating")({
  component: RatingPage,
});

async function loadArchive(): Promise<SignalHit[]> {
  const res = await fetch("/api/archive.json", { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { log?: SignalHit[] };
  return Array.isArray(data.log) ? data.log : [];
}

function RatingPage() {
  const local = useDispatchStore((s) => s.log);
  const arch = useQuery({ queryKey: ["signal-archive"], queryFn: loadArchive, staleTime: 20_000 });
  const clips = useQuery({ queryKey: ["review-clips"], queryFn: fetchReviews, staleTime: 120_000 });
  const log = useMemo(() => {
    const map = new Map<string, SignalHit>();
    for (const h of local) map.set(h.id, h);
    for (const h of arch.data ?? []) if (!map.has(h.id)) map.set(h.id, h);
    return [...map.values()];
  }, [arch.data, local]);
  const pairs = bookStats(log)
    .bySymbol.map((r) => {
      const decided = r.wins + r.losses;
      return { ...r, decided, winRate: decided ? r.wins / decided : null };
    })
    .sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1) || b.wins - a.wins);
  const clipBy = new Map((clips.data ?? []).map((c) => [c.id, c]));

  return (
    <div className="min-h-dvh">
      <AppNav />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="font-mono text-xs tracking-[0.22em] text-accent">РЕЙТИНГ И ОБЗОРЫ</p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight sm:text-5xl">Кто в плюсе — и кого смотреть</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Доходность считается только по сделкам стола (цель/стоп после входа). Рейтинг ютуб-аналитиков — оценка
          качества разбора, не их скрытый P&L: чужие сделки с экрана не проверить.
        </p>

        <section className="mt-10">
          <p className="font-mono text-xs tracking-[0.18em] text-accent">ДОХОДНОСТЬ СТОЛА</p>
          <h2 className="mt-2 text-2xl">Пары по винрейту</h2>
          {pairs.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Мало закрытых сделок. Подождите архив или встаньте на смену.</p>
          ) : (
            <ol className="mt-4 grid gap-3 sm:grid-cols-2">
              {pairs.map((p, i) => (
                <li key={p.id} className="panel-volume flex items-center justify-between rounded-xl px-4 py-4">
                  <div>
                    <p className="font-mono text-[11px] text-dim">#{i + 1}</p>
                    <p className="text-lg font-medium">{p.label}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-3xl tabular-nums">
                      {p.winRate == null ? "—" : `${Math.round(p.winRate * 100)}%`}
                    </p>
                    <p className="font-mono text-xs text-dim">
                      +{p.wins} / −{p.losses}
                      {p.open ? ` · ${p.open} открыт` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <Link to="/stats" className="mt-3 inline-block text-sm text-accent">
            Полный архив
          </Link>
        </section>

        <section className="mt-14">
          <p className="font-mono text-xs tracking-[0.18em] text-accent">ПРОФЕССИОНАЛЬНЫЙ РЕЙТИНГ</p>
          <h2 className="mt-2 text-2xl">Аналитики в эфире</h2>
          <ol className="mt-5 space-y-4">
            {ANALYST_BOARD.map((a) => {
              const clip = clipBy.get(a.id);
              return (
                <li key={a.id} className="panel-volume overflow-hidden rounded-2xl">
                  <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-3xl text-accent">#{a.rank}</span>
                        <h3 className="text-xl">{a.label}</h3>
                        <Badge tone={a.kind === "разбор" ? "bull" : a.kind === "шоу" ? "warn" : "neutral"}>{a.grade}</Badge>
                        <Badge>{a.kind}</Badge>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-muted">{a.note}</p>
                    </div>
                    {clip ? (
                      <div className="relative min-h-44 bg-black lg:min-h-full">
                        <iframe
                          title={clip.title}
                          src={`https://www.youtube.com/embed/${clip.videoId}?rel=0&modestbranding=1`}
                          className="absolute inset-0 h-full w-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    ) : (
                      <div className="flex min-h-32 items-center px-5 text-sm text-dim">Ролик подгружается…</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="mt-14">
          <p className="font-mono text-xs tracking-[0.18em] text-accent">ВИДЕООБЗОРЫ</p>
          <h2 className="mt-2 text-2xl">Последние ролики</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(clips.data ?? []).map((c) => (
              <article key={`${c.id}-${c.videoId}`} className="panel-volume overflow-hidden rounded-xl">
                <div className="relative aspect-video bg-black">
                  <iframe
                    title={c.title}
                    src={`https://www.youtube.com/embed/${c.videoId}?rel=0&modestbranding=1`}
                    className="absolute inset-0 h-full w-full"
                    allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <div className="p-4">
                  <p className="font-mono text-[10px] tracking-wide text-accent">{c.label}</p>
                  <p className={cn("mt-1 line-clamp-2 text-sm", c.role === "skip" ? "text-dim" : "text-fg")}>{c.title}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
