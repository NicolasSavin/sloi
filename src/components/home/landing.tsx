import { Link } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { NewsBoard } from "@/components/home/news";
import { QuoteBoard } from "@/components/home/quotes";
import { Ticker, NewsTicker, DeskTicker } from "@/components/home/ticker";
import { BrandMark } from "@/components/home/brand-mark";
import { HomeLeadPoster } from "@/components/home/lead-poster";
import { SessionStrip } from "@/components/session-strip";
import { HomeCalStrip } from "@/components/home/cal-strip";
import { DOMAIN } from "@/lib/brand";
import type { HomePayload } from "@/lib/home";

export function Landing({ data }: { data: HomePayload }) {
  return (
    <div className="min-h-dvh">
      <AppNav />
      <Ticker quotes={data.quotes} />
      <NewsTicker news={data.news} />
      <DeskTicker items={data.flashes} />
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <SessionStrip />
        <HomeCalStrip />
      </div>
      <HomeLeadPoster quotes={data.quotes} />
      <section className="relative overflow-hidden">
        <img src="/art/strata.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        <div className="mesh-orb absolute -left-24 -top-24 size-[28rem] rounded-full bg-[radial-gradient(circle,rgba(240,215,168,0.28),transparent_68%)]" />
        <div className="mesh-orb absolute -right-16 top-10 size-[22rem] rounded-full bg-[radial-gradient(circle,rgba(79,208,222,0.2),transparent_70%)] [animation-delay:-6s]" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/70 to-bg/25" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <BrandMark />
          <p className="mt-3 font-mono text-xs tracking-[0.28em] text-accent">слои рынка · {DOMAIN}</p>
          <h2 className="mt-6 max-w-3xl text-3xl font-medium tracking-tight sm:text-5xl">
            Котировки, новости и разбор крупняка — один стол
          </h2>
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
            <Link to="/news" className="inline-flex h-11 items-center rounded-sm px-5 text-sm shadow-[var(--shadow-border)]">
              Новости
            </Link>
            <Link to="/tv" className="inline-flex h-11 items-center rounded-sm px-5 text-sm shadow-[var(--shadow-border)]">
              ТВ-эфир
            </Link>
            <Link
              to="/cabinet"
              className="inline-flex h-11 items-center rounded-sm px-5 text-sm shadow-[var(--shadow-border)]"
            >
              Кабинет и ключ
            </Link>
            <Link to="/rating" className="inline-flex h-11 items-center rounded-sm px-5 text-sm shadow-[var(--shadow-border)]">
              Рейтинг и обзоры
            </Link>
            <Link to="/desk" className="inline-flex h-11 items-center rounded-sm px-5 text-sm shadow-[var(--shadow-border)]">
              Открыть график
            </Link>
            <Link to="/daily" className="inline-flex h-11 items-center rounded-sm px-5 text-sm shadow-[var(--shadow-border)]">
              Разбор сегодня
            </Link>
            <Link to="/advisor" className="inline-flex h-11 items-center rounded-sm px-5 text-sm text-muted hover:text-fg">
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
