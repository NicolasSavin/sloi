import { Link } from "@tanstack/react-router";
import { LiveShot } from "@/components/live-shot";
import type { NewsArticle } from "@/lib/news";

export function NewsCrawl({ news }: { news: NewsArticle[] }) {
  if (news.length === 0) return null;
  const row = [...news, ...news, ...news];
  return (
    <div className="pointer-events-auto flex overflow-hidden border-t border-border bg-elevated/95">
      <span className="flex shrink-0 items-center bg-bear px-3 font-mono text-xs tracking-[0.16em] text-fg">
        ЛЕНТА
      </span>
      <div className="ticker-track flex w-max gap-10 py-2 pr-10 [animation:stratum-ticker_48s_linear_infinite]">
        {row.map((n, i) => (
          <Link
            key={`${n.slug}-${i}`}
            to="/news/$slug"
            params={{ slug: n.slug }}
            className="flex shrink-0 items-baseline gap-2 font-mono text-xs hover:text-accent"
          >
            <span className="text-accent">{n.tag}</span>
            <span>{n.title}</span>
            <span className="text-dim">{n.source}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function NewsRail({ news }: { news: NewsArticle[] }) {
  const items = news.slice(0, 4);
  if (items.length === 0) return null;
  return (
    <aside className="pointer-events-auto flex w-full flex-col gap-2">
      <p className="font-mono text-xs tracking-[0.18em] text-accent">НОВОСТИ ЭФИРА</p>
      {items.map((n, i) => (
        <Link
          key={n.slug}
          to="/news/$slug"
          params={{ slug: n.slug }}
          className="panel-volume group flex gap-3 overflow-hidden rounded-lg p-2"
        >
          <span className="relative size-14 shrink-0 overflow-hidden rounded-sm">
            <LiveShot src={n.image} beat={i} />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[10px] text-dim">{n.source}</p>
            <p className="mt-0.5 line-clamp-3 text-xs leading-snug">{n.title}</p>
          </div>
        </Link>
      ))}
    </aside>
  );
}
