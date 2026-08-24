import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PosterChart } from "@/components/daily/poster-chart";
import { LiveShot } from "@/components/live-shot";
import { marketArt } from "@/lib/art";
import {
  buildPoster,
  chartFromSnap,
  todayKey,
  toDigestMarket,
  type DailyDigest,
  type PosterCard,
} from "@/lib/digest";
import { fetchMarket } from "@/lib/market/fetch";
import { analyzeMarket } from "@/lib/smc/engine";
import { actionLabel } from "@/lib/advisor";
import { formatPct } from "@/lib/utils";
import { cn } from "@/lib/utils";

const TONE: Record<PosterCard["tone"], string> = {
  cyan: "jewel-cyan",
  violet: "jewel-violet",
  amber: "jewel-amber",
  emerald: "jewel-emerald",
};

export function DailyInfographic({ digest }: { digest: DailyDigest }) {
  const [id, setId] = useState(digest.lead.spec.id);
  const isLead = id === digest.lead.spec.id;
  const picked = digest.markets.find((m) => m.spec.id === id) ?? digest.lead;

  const extra = useQuery({
    queryKey: ["daily-pair", id, "1h"],
    queryFn: () => fetchMarket({ data: { symbol: id, timeframe: "1h" } }),
    enabled: !isLead,
    staleTime: 45_000,
  });

  const built = useMemo(() => {
    if (isLead || !extra.data?.candles.length) return null;
    const snap = analyzeMarket(extra.data.candles, extra.data.options, extra.data.trades);
    const market = toDigestMarket(picked.spec, snap, picked.spec.spread, extra.data.candles.at(-1), extra.data.options);
    return {
      poster: buildPoster(market, snap, todayKey()),
      chart: chartFromSnap(snap, extra.data.candles, picked.spec.decimals),
      changePct: market.changePct,
    };
  }, [isLead, extra.data, picked.spec]);

  const p = built?.poster ?? digest.poster;
  const chart = built?.chart ?? digest.chart;
  const changePct = built?.changePct ?? digest.lead.changePct;
  const art = marketArt(picked.spec.id);

  return (
    <figure className="poster-board overflow-hidden rounded-2xl">
      <div className="relative px-4 pb-6 pt-5 sm:px-7 sm:pt-7">
        <LiveShot src={art} className="opacity-10" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-[#0d0b09]/75 to-[#0d0b09]" />
        <div className="relative z-10">
          <p className="font-mono text-[11px] tracking-[0.28em] text-accent">
            {p.pair.toUpperCase()} — РАСШИРЕННЫЙ ПОЛНЫЙ РАЗБОР · {p.dateLabel.toUpperCase()}
          </p>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted">
            Кадр <span className="text-fg">H1</span>. Пересчёт стола ~45 с. Лидер выпуска — живой приказ диспетчера, иначе
            пара с максимальным score направленной структуры. Чип ниже меняет постер, не приказ сов.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {digest.markets.map((m) => (
              <button
                key={m.spec.id}
                type="button"
                onClick={() => setId(m.spec.id)}
                className={cn(
                  "h-8 rounded-full px-2.5 font-mono text-[10px]",
                  m.spec.id === id ? "bg-accent text-accent-fg" : "bg-subtle text-muted",
                )}
              >
                {m.advice.action === "long" ? "🟢 " : m.advice.action === "short" ? "🔴 " : ""}
                {m.spec.id}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-display text-6xl font-medium leading-none tracking-tight sm:text-7xl">{p.price}</p>
              <p className="mt-2 font-mono text-xs tracking-[0.2em] text-accent">
                CURRENT PRICE · {formatPct(changePct)}
                {extra.isFetching && !isLead ? " · гружу пару…" : ""}
              </p>
            </div>
            <div className="grid min-w-[240px] gap-2 sm:grid-cols-2">
              <div className="panel-volume rounded-xl px-4 py-3">
                <p className="font-mono text-[10px] tracking-[0.18em] text-dim">ATR DAILY</p>
                <p className="mt-1 text-lg font-medium">{p.atr}</p>
                <p className="text-xs text-dim">{p.atrNote}</p>
              </div>
              <div
                className={cn(
                  "rounded-xl px-4 py-3",
                  p.biasTone === "bear" ? "jewel-amber" : p.biasTone === "bull" ? "jewel-emerald" : "panel-volume",
                )}
              >
                <p className="font-mono text-[10px] tracking-[0.18em] text-dim">BIAS</p>
                <p className="mt-1 text-lg font-medium">
                  {p.biasTone === "bear" ? "🐻 " : p.biasTone === "bull" ? "🐂 " : "⚖ "}
                  {p.bias}
                </p>
                <p className="mt-1 font-mono text-[10px] text-dim">приказ {actionLabel(picked.advice.action)}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-4">
            {p.cards.map((c) => (
              <section key={c.kicker} className={cn("rounded-xl p-4", TONE[c.tone])}>
                <p className="font-mono text-[10px] tracking-[0.2em] text-accent">
                  {c.kicker}. {c.title}
                </p>
                <ul className="mt-3 space-y-2">
                  {c.rows.map((r) => (
                    <li key={r.label} className="text-sm leading-snug">
                      <span className="emoji-live mr-1">{r.icon}</span>
                      <span className="text-dim">{r.label}. </span>
                      <span>{r.value}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs leading-relaxed text-muted">{c.footer}</p>
              </section>
            ))}
          </div>

          <div className="mt-6">
            <p className="mb-2 font-mono text-[10px] tracking-[0.22em] text-accent">
              ГРАФИЧЕСКИЕ + ГАРМОНИЧЕСКИЕ ПАТТЕРНЫ · ПОЯСНЕНИЯ НА ГРАФИКЕ
            </p>
            <PosterChart chart={chart} bias={p.biasTone} />
          </div>

          {p.patternPills.length ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {p.patternPills.map((pill) => (
                <div key={pill.title} className="panel-volume rounded-xl px-3 py-3">
                  <p className="font-mono text-[10px] tracking-[0.16em] text-accent">{pill.title.toUpperCase()}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{pill.text}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            <div className="space-y-2">
              {p.setups.map((s) => (
                <div key={s.side} className={cn("rounded-xl px-4 py-3", s.side === "short" ? "jewel-amber" : "jewel-emerald")}>
                  <p className="font-mono text-[10px] tracking-[0.18em]">
                    {s.side === "short" ? "🐻 SHORT" : "🐂 LONG"} {s.priority ? "· ПРИОРИТЕТ" : "· КОНТРТРЕНД"}
                  </p>
                  <p className="mt-2 font-mono text-sm tabular-nums">
                    вход {s.entry} · SL {s.sl} · TP1 {s.tp1} · TP2 {s.tp2}
                  </p>
                </div>
              ))}
            </div>
            <div className="panel-volume rounded-xl px-4 py-3">
              <p className="font-mono text-[10px] tracking-[0.18em] text-accent">КЛЮЧЕВЫЕ УРОВНИ</p>
              <ul className="mt-3 space-y-2">
                {p.levels.map((lv) => (
                  <li key={lv.name} className="flex items-baseline justify-between gap-3 text-sm">
                    <span
                      className={cn(
                        "font-mono tabular-nums",
                        lv.tone === "bear" ? "text-bear" : lv.tone === "bull" ? "text-bull" : "text-accent",
                      )}
                    >
                      {lv.price}
                    </span>
                    <span className="text-right text-xs text-dim">
                      {lv.name} · {lv.hint}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[10px] tracking-wide text-dim">
            <span>🛡 {p.risk}</span>
            <span>🔍 Следить за объёмом на пробоях</span>
            <span>ℹ Не является рекомендацией</span>
          </p>
        </div>
      </div>
    </figure>
  );
}
