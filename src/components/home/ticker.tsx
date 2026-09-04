import { Link } from "@tanstack/react-router";
import type { DeskFlash, HomeQuote } from "@/lib/home";
import type { NewsArticle } from "@/lib/news";
import { cn, formatPct, formatPrice } from "@/lib/utils";

export function Ticker({ quotes }: { quotes: HomeQuote[] }) {
  const row = quotes.length ? [...quotes, ...quotes, ...quotes] : [];
  if (!row.length) return null;
  return (
    <div className="ticker-rail bg-gradient-to-r from-[#241c12] via-[#1a140e] to-[#120e0a]">
      <div className="ticker-track flex w-max items-center gap-3 py-2.5 pr-6 [animation:stratum-ticker_42s_linear_infinite] hover:[animation-play-state:paused]">
        {row.map((q, i) => {
          const up = q.changePct >= 0;
          return (
            <Link
              key={`${q.id}-${i}`}
              to="/desk"
              className="ticker-chip shrink-0 no-underline"
            >
              <span className="font-mono text-[10px] tracking-[0.16em] text-accent">{q.label}</span>
              <span className="font-mono text-sm tabular-nums text-fg">{formatPrice(q.price, q.decimals)}</span>
              <span className={cn("font-mono text-xs tabular-nums", up ? "text-bull" : "text-bear")}>
                {formatPct(q.changePct)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function NewsTicker({ news }: { news: NewsArticle[] }) {
  const row = news.length ? [...news, ...news, ...news] : [];
  if (!row.length) return null;
  return (
    <div className="ticker-rail bg-gradient-to-r from-[#102028] via-[#14100c] to-[#1c1410]">
      <div className="ticker-track-rev flex w-max items-center gap-3 py-2.5 pr-6 [animation:stratum-ticker-rev_55s_linear_infinite] hover:[animation-play-state:paused]">
        {row.map((n, i) => (
          <Link
            key={`${n.slug}-${i}`}
            to="/news/$slug"
            params={{ slug: n.slug }}
            className="ticker-chip shrink-0 max-w-[28rem] no-underline"
          >
            <span className="font-mono text-[10px] tracking-[0.14em] text-[#7ee0ea]">{n.tag}</span>
            <span className="truncate text-sm text-fg">{n.title}</span>
            <span className="hidden font-mono text-[10px] text-dim sm:inline">{n.source}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function DeskTicker({ items }: { items: DeskFlash[] }) {
  const row = items.length ? [...items, ...items, ...items] : [];
  if (!row.length) return null;
  return (
    <div className="ticker-rail bg-gradient-to-r from-[#1a2418] via-[#16110c] to-[#241810]">
      <div className="ticker-track flex w-max items-center gap-3 py-2.5 pr-6 [animation:stratum-ticker_48s_linear_infinite] hover:[animation-play-state:paused]">
        {row.map((f, i) => (
          <Link
            key={`${f.id}-${i}`}
            to={f.to ?? "/dispatch"}
            className="ticker-chip shrink-0 no-underline"
          >
            <span className="font-mono text-[10px] tracking-[0.14em] text-accent">
              {f.kind === "site" ? "сайт" : "стол"}
            </span>
            <span className="text-sm text-fg">{f.text}</span>
            <span
              className={cn(
                "font-mono text-[10px]",
                f.tone === "bull" ? "text-bull" : f.tone === "bear" ? "text-bear" : "text-dim",
              )}
            >
              {f.tone === "bull" ? "▲" : f.tone === "bear" ? "▼" : "●"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
