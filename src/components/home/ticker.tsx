import type { HomeQuote } from "@/lib/home";
import { cn, formatPct, formatPrice } from "@/lib/utils";

export function Ticker({ quotes }: { quotes: HomeQuote[] }) {
  const row = [...quotes, ...quotes, ...quotes];
  return (
    <div className="overflow-hidden border-b border-border bg-elevated/80">
      <div className="ticker-track flex w-max gap-8 py-2.5 pr-8 [animation:stratum-ticker_38s_linear_infinite] hover:[animation-play-state:paused]">
        {row.map((q, i) => {
          const up = q.changePct >= 0;
          return (
            <div key={`${q.id}-${i}`} className="flex shrink-0 items-baseline gap-2 font-mono text-xs">
              <span className="tracking-[0.14em] text-dim">{q.label}</span>
              <span className="tabular-nums text-fg">{formatPrice(q.price, q.decimals)}</span>
              <span className={cn("tabular-nums", up ? "text-bull" : "text-bear")}>{formatPct(q.changePct)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
