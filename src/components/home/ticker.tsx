import { type ReactNode, useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import type { DeskFlash, HomeQuote } from "@/lib/home";
import type { NewsArticle } from "@/lib/news";
import { cn, formatPct, formatPrice } from "@/lib/utils";

function Marquee({ children, pxPerSec = 28 }: { children: ReactNode; pxPerSec?: number }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const track = trackRef.current;
    const seq = seqRef.current;
    if (!track || !seq) return;
    let x = 0;
    let last = performance.now();
    let paused = false;
    const rail = track.parentElement;
    const enter = () => {
      paused = true;
    };
    const leave = () => {
      paused = false;
    };
    rail?.addEventListener("mouseenter", enter);
    rail?.addEventListener("mouseleave", leave);
    let raf = 0;
    const step = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      const w = seq.offsetWidth;
      if (!paused && w > 8) {
        x -= (pxPerSec * dt) / 1000;
        if (x <= -w) x += w;
        track.style.transform = `translate3d(${x}px,0,0)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      rail?.removeEventListener("mouseenter", enter);
      rail?.removeEventListener("mouseleave", leave);
    };
  }, [pxPerSec]);
  return (
    <div ref={trackRef} className="ticker-move">
      <div ref={seqRef} className="ticker-seq">
        {children}
      </div>
      <div className="ticker-seq" aria-hidden>
        {children}
      </div>
    </div>
  );
}

export function Ticker({ quotes }: { quotes: HomeQuote[] }) {
  if (!quotes.length) return null;
  const chips = quotes.map((q) => {
    const up = q.changePct >= 0;
    return (
      <Link key={q.id} to="/desk" className="ticker-chip shrink-0 no-underline">
        <span className="font-mono text-[10px] tracking-[0.16em] text-accent">{q.label}</span>
        <span className="font-mono text-sm tabular-nums text-fg">{formatPrice(q.price, q.decimals)}</span>
        <span className={cn("font-mono text-xs tabular-nums", up ? "text-bull" : "text-bear")}>{formatPct(q.changePct)}</span>
      </Link>
    );
  });
  return (
    <div className="ticker-rail bg-gradient-to-r from-[#241c12] via-[#1a140e] to-[#120e0a]">
      <Marquee pxPerSec={26}>{chips}</Marquee>
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
  if (!mixed.length) return null;
  const chips = mixed.map((item) =>
    item.t === "news" ? (
      <Link
        key={`n-${item.n.slug}`}
        to="/news/$slug"
        params={{ slug: item.n.slug }}
        className="ticker-chip shrink-0 max-w-[28rem] no-underline"
      >
        <span className="font-mono text-[10px] tracking-[0.14em] text-[#7ee0ea]">{item.n.tag}</span>
        <span className="truncate text-sm text-fg">{item.n.title}</span>
        <span className="hidden font-mono text-[10px] text-dim sm:inline">{item.n.source}</span>
      </Link>
    ) : (
      <Link key={`d-${item.f.id}`} to={item.f.to ?? "/dispatch"} className="ticker-chip shrink-0 no-underline">
        <span className="font-mono text-[10px] tracking-[0.14em] text-accent">{item.f.kind === "site" ? "сайт" : "стол"}</span>
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
  );
  return (
    <div className="ticker-rail bg-gradient-to-r from-[#102028] via-[#14100c] to-[#1c1410]">
      <Marquee pxPerSec={22}>{chips}</Marquee>
    </div>
  );
}