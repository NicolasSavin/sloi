import { Link } from "@tanstack/react-router";
import { LiveShot } from "@/components/live-shot";
import { cn } from "@/lib/utils";
import type { NewsArticle } from "@/lib/news";

function timeLabel(raw: string) {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function NewsCard({
  item,
  variant,
}: {
  item: NewsArticle;
  variant: "hero" | "wide" | "tile";
}) {
  return (
    <Link
      to="/news/$slug"
      params={{ slug: item.slug }}
      className={cn(
        "news-card group relative block min-h-44 overflow-hidden rounded-xl",
        variant === "hero" && "min-h-80 sm:min-h-[28rem]",
        variant === "wide" && "min-h-72 sm:min-h-80 lg:col-span-2",
        variant === "tile" && "aspect-[5/4]",
      )}
    >
      <LiveShot src={item.image} beat={item.slug.length} />
      <div className="news-veil absolute inset-0" />
      <div className="absolute inset-0 flex flex-col p-4 sm:p-6">
        <span className="inline-flex w-fit rounded-sm bg-accent px-2 py-1 font-mono text-xs tracking-[0.16em] text-accent-fg">
          {item.tag}
        </span>
        {item.impact ? (
          <span className="mt-2 inline-flex w-fit max-w-[90%] rounded-sm bg-bg/70 px-2 py-1 font-mono text-[10px] text-accent">
            {item.impact.pairLabel} · {item.impact.weight}
          </span>
        ) : null}
        <div className="mt-auto max-w-3xl">
          <p className="font-mono text-xs text-accent">
            {item.source}
            {timeLabel(item.published) ? ` · ${timeLabel(item.published)}` : ""}
          </p>
          <h3
            className={cn(
              "mt-2 font-display leading-tight text-fg",
              variant === "hero" && "text-3xl sm:text-5xl",
              variant === "wide" && "text-2xl sm:text-4xl",
              variant === "tile" && "line-clamp-3 text-xl sm:text-2xl",
            )}
          >
            {item.title}
          </h3>
        </div>
      </div>
    </Link>
  );
}

export function NewsBoard({ news }: { news: NewsArticle[] }) {
  const hero = news[0];
  const wide = news[1];
  const rest = news.slice(2, 6);
  if (!hero) return null;
  return (
    <section className="px-4 pb-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs tracking-[0.22em] text-accent">ЛЕНТА</p>
            <h2 className="mt-2 text-3xl">Фундаментальные новости</h2>
          </div>
          <Link to="/news" className="font-mono text-xs text-accent hover:text-fg">
            Все новости
          </Link>
        </div>
        <div className="mt-6 grid gap-4">
          <NewsCard item={hero} variant="hero" />
          <div className="grid gap-4 lg:grid-cols-3">
            {wide ? <NewsCard item={wide} variant="wide" /> : null}
            {rest[0] ? <NewsCard item={rest[0]} variant="tile" /> : null}
          </div>
          {rest.length > 1 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rest.slice(1).map((n) => (
                <NewsCard key={n.slug} item={n} variant="tile" />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
