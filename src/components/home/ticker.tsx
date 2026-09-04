import { Link } from "@tanstack/react-router";
import type { DeskFlash, HomeQuote } from "@/lib/home";
import type { NewsArticle } from "@/lib/news";
import { cn, formatPct, formatPrice } from "@/lib/utils";

export function Ticker({ quotes }: { quotes: HomeQuote[] }) {
  const row = quotes.length ? [...quotes, ...quotes] : [];
  if (!row.length) return null;
  return (
    <div className="ticker-rail bg-gradient-to-r from-[#241c12] via-[#1a140e] to-[#120e0a]">
      <div className="ticker-move">
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

export function NewsTicker({ news, flashes = [] }: { news: NewsArticle[]; flashes?: DeskFlash[] }) {
  const mixed: ({ t: "news"; n: NewsArticle } | { t: "desk"; f: DeskFlash })[] = [];
  const n = Math.max(news.length, flashes.length);
  for (let i = 0; i < n; i++) {
    if (news[i]) mixed.push({ t: "news", n: news[i]! });
    if (flashes[i]) mixed.push({ t: "desk", f: flashes[i]! });
  }
  const row = mixed.length ? [...mixed, ...mixed] : [];
  if (!row.length) return null;
  return (
    <div className="ticker-rail bg-gradient-to-r from-[#102028] via-[#14100c] to-[#1c1410]">
      <div className="ticker-move-rev">
        {row.map((item, i) =>
          item.t === "news" ? (
            <Link
              key={`n-${item.n.slug}-${i}`}
              to="/news/$slug"
              params={{ slug: item.n.slug }}
              className="ticker-chip shrink-0 max-w-[28rem] no-underline"
            >
              <span className="font-mono text-[10px] tracking-[0.14em] text-[#7ee0ea]">{item.n.tag}</span>
              <span className="truncate text-sm text-fg">{item.n.title}</span>
              <span className="hidden font-mono text-[10px] text-dim sm:inline">{item.n.source}</span>
            </Link>
          ) : (
            <Link
              key={`d-${item.f.id}-${i}`}
              to={item.f.to ?? "/dispatch"}
              className="ticker-chip shrink-0 no-underline"
            >
              <span className="font-mono text-[10px] tracking-[0.14em] text-accent">
                {item.f.kind === "site" ? "сайт" : "стол"}
              </span>
              <span className="text-sm text-fg">{item.f.text}</span>
              <span
                className={cn(
                  "font-mono text-[10px]",
                  item.f.tone === "bull" ? "text-bull" : item.f.tone === "bear" ? "text-bear" : "text-dim",
                )}
              >
                {item.f.tone === "bull" ? "▲" : item.f.tone === "bear" ? "▼" : "●"}
              </span>
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
