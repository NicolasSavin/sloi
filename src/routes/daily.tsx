import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppNav } from "@/components/app-nav";
import { FundStrip } from "@/components/fund-strip";
import { LiveShot } from "@/components/live-shot";
import { DailyInfographic } from "@/components/daily/infographic";
import { fetchDigest } from "@/lib/market/fetch";
import { marketArt } from "@/lib/art";
import { actionLabel } from "@/lib/advisor";
import { Badge } from "@/components/ui/badge";
import { pairHeadline, writeArticle } from "@/lib/digest";
import { formatPct, formatPrice } from "@/lib/utils";
import { useDeskStore } from "@/lib/desk-store";

export const Route = createFileRoute("/daily")({
  loader: async () => {
    try {
      return await fetchDigest();
    } catch {
      return null;
    }
  },
  pendingComponent: DailyPending,
  component: DailyPage,
});

function DailyPending() {
  return (
    <div className="min-h-dvh">
      <AppNav />
      <p className="px-5 py-16 text-sm text-muted">Собираю выпуск дня…</p>
    </div>
  );
}

function DailyPage() {
  const seed = Route.useLoaderData();
  const q = useQuery({
    queryKey: ["dispatch-digest"],
    queryFn: () => fetchDigest(),
    initialData: seed ?? undefined,
    staleTime: 45_000,
    refetchInterval: 60_000,
  });
  const data = q.data ?? seed;
  if (!data) {
    return (
      <div className="min-h-dvh">
        <AppNav />
        <p className="px-5 py-16 text-sm text-muted">Не удалось собрать выпуск дня. Обновите страницу.</p>
      </div>
    );
  }
  const { digest } = data;
  const symbol = useDeskStore((s) => s.symbol);
  const setSymbol = useDeskStore((s) => s.setSymbol);
  const picked = digest.markets.find((m) => m.spec.id === symbol) ?? digest.lead;
  const others = digest.markets.filter((m) => m.spec.id !== picked.spec.id);
  const article = writeArticle(picked, others, digest.date, digest.sentiment, digest.fund);
  return (
    <div className="min-h-dvh">
      <AppNav />
      <main className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-10">
        <DailyInfographic digest={digest} selectedId={picked.spec.id} onSelect={setSymbol} />
        <div className="mt-6">
          <FundStrip fund={digest.fund} />
        </div>

        <section className="panel-volume mt-6 rounded-xl p-5">
          <p className="font-mono text-xs tracking-[0.2em] text-accent">ОПЦИОНЫ · @Options_FX</p>
          {digest.tgOptions.length ? (
            <ul className="mt-3 space-y-3">
              {digest.tgOptions.slice(0, 5).map((p) => (
                <li key={p.text.slice(0, 40)} className="text-sm leading-relaxed text-muted">
                  {p.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Канал не отдаёт публичную ленту без Telegram. Берём наши уровни max pain / OI с Yahoo, а посты смотрите
              напрямую:{" "}
              <a className="text-accent underline-offset-2 hover:underline" href="https://t.me/Options_FX" target="_blank" rel="noreferrer">
                t.me/Options_FX
              </a>
            </p>
          )}
        </section>

        <article className="panel-volume mt-10 rounded-xl p-5 sm:p-8">
          <p className="font-mono text-xs tracking-[0.2em] text-accent">{article.kicker}</p>
          <h2 className="mt-2 text-3xl font-medium">{article.title}</h2>
          <p className="mt-3 text-muted">{article.dek}</p>
          <p className="mt-2 font-mono text-[11px] text-dim">Текст ниже только про {picked.spec.id}, не про лид дня.</p>
          {article.body.split("\n\n").map((p) => (
            <p key={p.slice(0, 24)} className="mt-4 text-base leading-relaxed">
              {p}
            </p>
          ))}
        </article>

        <section className="mt-14">
          <h2 className="text-2xl">Рынки выпуска</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {digest.markets.map((m) => (
              <li key={m.spec.id}>
                <button
                  type="button"
                  onClick={() => setSymbol(m.spec.id)}
                  className="panel-volume group w-full overflow-hidden rounded-xl text-left"
                >
                <div className="relative h-28 overflow-hidden">
                  <LiveShot src={marketArt(m.spec.id)} beat={m.spec.id.length} />
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium leading-snug">{pairHeadline(m)}</span>
                    <Badge tone={m.bias === "bullish" ? "bull" : m.bias === "bearish" ? "bear" : "warn"}>
                      {actionLabel(m.advice.action)}
                    </Badge>
                  </div>
                  {m.wind ? (
                    <p className="mt-1 font-mono text-xs text-dim">
                      макро {m.wind.kind === "tail" ? "попутный" : m.wind.kind === "head" ? "встречный" : "нейтральный"}
                    </p>
                  ) : null}
                  <p className="mt-2 font-mono text-sm tabular-nums">
                    {formatPrice(m.lastClose, m.spec.decimals)}{" "}
                    <span className="text-muted">{formatPct(m.changePct)}</span>
                  </p>
                </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
