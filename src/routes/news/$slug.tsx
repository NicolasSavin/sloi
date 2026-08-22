import { createFileRoute, Link } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { LiveShot } from "@/components/live-shot";
import { fetchArticle } from "@/lib/market/fetch";
import { formatPct, formatPrice } from "@/lib/utils";

export const Route = createFileRoute("/news/$slug")({
  loader: ({ params }) => fetchArticle({ data: { slug: params.slug } }),
  pendingComponent: function NewsPending() {
    return (
      <div className="min-h-dvh">
        <AppNav />
        <p className="px-5 py-16 text-sm text-muted">Открываю статью…</p>
      </div>
    );
  },
  component: NewsPage,
});

function timeLabel(raw: string) {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function NewsPage() {
  const { article, quotes } = Route.useLoaderData();
  if (!article) {
    return (
      <div className="min-h-dvh">
        <AppNav />
        <main className="mx-auto max-w-2xl px-4 py-16">
          <h1 className="text-3xl">Статья не найдена</h1>
          <p className="mt-3 text-muted">Лента обновилась. Вернитесь на главную.</p>
          <Link to="/" className="mt-6 inline-flex text-accent">
            На главную
          </Link>
        </main>
      </div>
    );
  }
  const related = quotes.find((q) => q.id === article.relatedId);

  return (
    <div className="min-h-dvh">
      <AppNav />
      <article>
        <header className="news-card relative min-h-80 overflow-hidden sm:min-h-[28rem]">
          <LiveShot src={article.image} />
          <div className="news-veil absolute inset-0" />
          <div className="relative mx-auto flex min-h-80 max-w-3xl flex-col justify-end px-4 py-10 sm:min-h-[28rem] sm:px-6 sm:py-14">
            <p className="font-mono text-xs tracking-[0.18em] text-accent">
              {article.foreign ? "ИНТЕРПРЕТАЦИЯ · " : ""}
              {article.tag} · {article.source}
              {timeLabel(article.published) ? ` · ${timeLabel(article.published)}` : ""}
            </p>
            <h1 className="mt-3 text-4xl font-medium leading-tight sm:text-6xl">{article.title}</h1>
            <p className="mt-4 max-w-prose text-base text-muted">{article.dek}</p>
          </div>
        </header>

        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
          {article.impact ? (
            <section className="panel-volume mb-10 rounded-xl p-5 sm:p-8">
              <p className="font-mono text-xs tracking-[0.22em] text-accent">ОЦЕНКА ВЛИЯНИЯ</p>
              <p className="mt-2 text-2xl">
                {article.impact.pairLabel}: {article.impact.weight},{" "}
                {article.impact.tone === "bull" ? "в плюс" : article.impact.tone === "bear" ? "в минус" : "нейтрально"}
              </p>
              <p className="mt-3 text-base leading-relaxed text-muted">{article.impact.line}</p>
            </section>
          ) : null}
          {article.body.map((p) => (
            <p key={p.slice(0, 40)} className="mt-5 text-base leading-relaxed first:mt-0">
              {p}
            </p>
          ))}

          <section className="panel-volume mt-10 rounded-xl p-5 sm:p-8">
            <p className="font-mono text-xs tracking-[0.22em] text-accent">КАК ЧИТАЕТ SLOI</p>
            <h2 className="mt-2 text-2xl">Что это значит для рынка</h2>
            <dl className="mt-6 space-y-5">
              <div>
                <dt className="font-mono text-xs text-dim">делает</dt>
                <dd className="mt-1 text-base leading-relaxed">{article.take.doing}</dd>
              </div>
              <div>
                <dt className="font-mono text-xs text-dim">ждёт</dt>
                <dd className="mt-1 text-base leading-relaxed">{article.take.waiting}</dd>
              </div>
              <div>
                <dt className="font-mono text-xs text-dim">к чему приведёт</dt>
                <dd className="mt-1 text-base leading-relaxed">{article.take.leadsTo}</dd>
              </div>
            </dl>
          </section>

          {related ? (
            <Link to="/desk" className="panel-volume mt-6 flex items-center justify-between gap-4 rounded-xl p-5">
              <div>
                <p className="font-mono text-xs text-accent">СТОЛ</p>
                <p className="mt-1 text-lg">{related.label}</p>
              </div>
              <p className="font-display text-3xl tabular-nums">
                {formatPrice(related.price, related.decimals)}
                <span className="ml-2 font-sans text-sm text-muted">{formatPct(related.changePct)}</span>
              </p>
            </Link>
          ) : null}

          {article.originHref ? (
            <p className="mt-8 text-xs text-dim">
              По мотивам {article.source}. Первоисточник —{" "}
              <a
                href={article.originHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                здесь
              </a>
              . Не инвестиционная рекомендация.
            </p>
          ) : (
            <p className="mt-8 text-xs text-dim">Не инвестиционная рекомендация.</p>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/" className="inline-flex h-11 items-center text-sm text-accent">
              ← К ленте
            </Link>
            <Link to="/daily" className="inline-flex h-11 items-center text-sm text-muted">
              Разбор сегодня
            </Link>
          </div>
        </div>
      </article>
    </div>
  );
}
