import { Link } from "@tanstack/react-router";
import { LiveShot } from "@/components/live-shot";
import { Spark } from "@/components/home/spark";
import type { HomeQuote } from "@/lib/home";
import { cn, formatPct, formatPrice } from "@/lib/utils";

export function QuoteBoard({ quotes }: { quotes: HomeQuote[] }) {
  return (
    <section className="px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-xs tracking-[0.22em] text-accent">КОТИРОВКИ</p>
        <h2 className="mt-2 text-3xl">Стол дня</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quotes.map((q) => {
            const up = q.changePct >= 0;
            return (
              <Link
                key={q.id}
                to="/desk"
                className="panel-volume group relative overflow-hidden rounded-xl p-5"
              >
                <LiveShot src={q.art} beat={q.id.length} className="opacity-30 transition-opacity duration-500 group-hover:opacity-50" />
                <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/70 to-bg/30" />
                <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-mono text-xs tracking-wide text-accent">{q.label}</p>
                    <Spark values={q.spark} up={up} />
                  </div>
                  <p className="mt-6 font-display text-4xl tabular-nums tracking-tight">
                    {formatPrice(q.price, q.decimals)}
                  </p>
                  <p className={cn("mt-1 font-mono text-sm tabular-nums", up ? "text-bull" : "text-bear")}>
                    {formatPct(q.changePct)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
