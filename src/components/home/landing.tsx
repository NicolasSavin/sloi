import { Link } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { NewsBoard } from "@/components/home/news";
import { QuoteBoard } from "@/components/home/quotes";
import { Ticker } from "@/components/home/ticker";
import { DOMAIN } from "@/lib/brand";
import type { HomePayload } from "@/lib/home";

export function Landing({ data }: { data: HomePayload }) {
  return (
    <div className="min-h-dvh">
      <AppNav />
      <Ticker quotes={data.quotes} />
      <section className="relative overflow-hidden">
        <img src="/art/strata.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/75 to-bg/30" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="font-mono text-xs tracking-[0.28em] text-accent">SLOI · {DOMAIN}</p>
          <h1 className="mt-4 max-w-3xl text-5xl font-medium tracking-tight sm:text-7xl">
            Котировки, новости и разбор крупняка — один стол
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted">
            Живая лента цен, главные истории дня с иллюстрациями и график со smart money. Советник MT4 читает спред с
            вашего терминала.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/dispatch"
              className="btn-metal inline-flex h-11 items-center rounded-sm px-5 text-sm font-medium text-accent-fg"
            >
              Диспетчер
            </Link>
            <Link
              to="/tv"
              className="inline-flex h-11 items-center rounded-sm px-5 text-sm shadow-[var(--shadow-border)]"
            >
              ТВ-эфир
            </Link>
            <Link
              to="/desk"
              className="inline-flex h-11 items-center rounded-sm px-5 text-sm shadow-[var(--shadow-border)]"
            >
              Открыть график
            </Link>
            <Link
              to="/daily"
              className="inline-flex h-11 items-center rounded-sm px-5 text-sm shadow-[var(--shadow-border)]"
            >
              Разбор сегодня
            </Link>
            <Link
              to="/advisor"
              className="inline-flex h-11 items-center rounded-sm px-5 text-sm text-muted hover:text-fg"
            >
              Эксперт MT4
            </Link>
          </div>
        </div>
      </section>
      <QuoteBoard quotes={data.quotes} />
      <NewsBoard news={data.news} />
      <footer className="border-t border-border px-4 py-8 text-center sm:px-6">
        <p className="font-mono text-xs tracking-[0.22em] text-accent">{DOMAIN}</p>
        <p className="mt-2 text-xs text-dim">слои рынка · не тикер</p>
      </footer>
    </div>
  );
}
