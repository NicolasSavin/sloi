import { createFileRoute, Link } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { LiveShot } from "@/components/live-shot";
import { Spark } from "@/components/home/spark";
import { fetchHome } from "@/lib/market/fetch";
import type { HomeQuote } from "@/lib/home";
import type { NewsArticle } from "@/lib/news";
import { cn, formatPct, formatPrice } from "@/lib/utils";

export const Route = createFileRoute("/news/")({
  loader: () => fetchHome(),
  component: NewsIndex,
});

function timeLabel(raw: string) {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Card({
  item,
  quote,
  big,
}: {
  item: NewsArticle;
  quote?: HomeQuote;
  big?: boolean;
}) {
  return (
    <Link
      to="/news/$slug"
      params={{ slug: item.slug }}
      className={cn("news-card group relative block overflow-hidden rounded-xl", big ? "min-h-[26rem]" : "min-h-64")}
    >
      <LiveShot src={item.image} beat={item.slug.length} />
      <div className="news-veil absolute inset-0" />
      <div className="absolute inset-0 flex flex-col p-5 sm:p-6">
        <span className="inline-flex w-fit rounded-sm bg-accent px-2 py-1 font-mono text-[10px] tracking-[0.16em] text-accent-fg">
          {item.source === "SLOI" ? "СТОЛ SLOI" : item.foreign ? "ИНТЕРПРЕТАЦИЯ" : item.tag}
        </span>
        <div className="mt-auto">
          {quote ? (
            <div className="mb-3 flex items-end justify-between gap-3">
              <p className="font-mono text-xs text-accent">
                {quote.label} {formatPrice(quote.price, quote.decimals)}{" "}
                <span className={quote.changePct >= 0 ? "text-bull" : "text-bear"}>{formatPct(quote.changePct)}</span>
              </p>
              <Spark values={quote.spark} up={quote.changePct >= 0} />
            </div>
          ) : (
            <p className="font-mono text-xs text-accent">
              {item.source}
              {timeLabel(item.published) ? ` · ${timeLabel(item.published)}` : ""}
            </p>
          )}
          <h2 className={cn("font-display leading-tight text-fg", big ? "text-3xl sm:text-5xl" : "text-xl sm:text-2xl")}>
            {item.title}
          </h2>
          <p className="mt-2 line-clamp-2 text-sm text-muted">{item.dek || item.snippet}</p>
        </div>
      </div>
    </Link>
  );
}

function NewsIndex() {
  const data = Route.useLoaderData();
  const desk = data.news.filter((n) => n.source === "SLOI");
  const tape = data.news.filter((n) => n.source !== "SLOI");
  const hero = desk[0] ?? tape[0];
  const restDesk = desk.filter((n) => n.slug !== hero?.slug);
  const q = (id: string | null) => data.quotes.find((x) => x.id === id);

  return (
    <div className="min-h-dvh">
      <AppNav />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="font-mono text-xs tracking-[0.22em] text-accent">НОВОСТИ</p>
        <h1 className="mt-2 text-4xl sm:text-6xl">Стол пишет сам</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Собственные короткие статьи по графику и общедоступной ленте. Не копипаст агентств — факт, цена, что делает
          крупняк.
        </p>

        {hero ? (
          <div className="mt-8">
            <Card item={hero} quote={q(hero.relatedId)} big />
          </div>
        ) : null}

        {restDesk.length ? (
          <section className="mt-10">
            <p className="font-mono text-xs tracking-[0.18em] text-accent">КОРОТКО С ГРАФИКА</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {restDesk.map((n) => (
                <Card key={n.slug} item={n} quote={q(n.relatedId)} />
              ))}
            </div>
          </section>
        ) : null}

        {tape.length ? (
          <section className="mt-14">
            <p className="font-mono text-xs tracking-[0.18em] text-accent">ЛЕНТА · ИНТЕРПРЕТАЦИЯ</p>
            <h2 className="mt-2 text-2xl">Общедоступные новости</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tape.map((n) => (
                <Card key={n.slug} item={n} quote={q(n.relatedId)} />
              ))}
            </div>
          </section>
        ) : null}

        <p className="mt-12 text-xs text-dim">
          Это не приказ. Сделки — только в диспетчерской и в ленте советника.
        </p>
      </main>
    </div>
  );
}
