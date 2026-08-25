import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PosterChart } from "@/components/daily/poster-chart";
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
import { cn } from "@/lib/utils";

const TONE: Record<PosterCard["tone"], string> = {
  cyan: "jewel-cyan",
  violet: "jewel-violet",
  amber: "jewel-amber",
  emerald: "jewel-emerald",
};

const NUM: Record<string, string> = {
  cyan: "bg-[#14b8c6] text-[#042226]",
  violet: "bg-[#c4a4ff] text-[#1a1030]",
  amber: "bg-[#f0a36a] text-[#2a150c]",
  emerald: "bg-[#6ee0a8] text-[#042016]",
};

function WaveSketch({ down }: { down: boolean }) {
  const pts = down
    ? "M8 18 L28 8 L48 28 L68 16 L88 40"
    : "M8 36 L28 22 L48 30 L68 12 L88 8";
  return (
    <svg viewBox="0 0 96 48" className="mt-3 h-14 w-full">
      <path d={pts} fill="none" stroke="#c4a4ff" strokeWidth="2.4" />
      {[8, 28, 48, 68, 88].map((x, i) => (
        <g key={x}>
          <circle cx={x} cy={down ? [18, 8, 28, 16, 40][i] : [36, 22, 30, 12, 8][i]} r="6" fill="#1a1030" stroke="#c4a4ff" />
          <text x={x} y={(down ? [18, 8, 28, 16, 40][i]! : [36, 22, 30, 12, 8][i]!) + 3} textAnchor="middle" fill="#c4a4ff" fontSize="8">
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}

function ChannelSketch() {
  return (
    <svg viewBox="0 0 88 36" className="h-9 w-full">
      <path d="M4 8 L84 20 L84 30 L4 18 Z" fill="rgba(231,76,60,0.25)" stroke="#e74c3c" strokeWidth="1.6" />
      <path d="M10 22 L22 16 L34 20 L46 12 L58 18 L70 10 L80 14" fill="none" stroke="#94a3b8" strokeWidth="1.2" />
    </svg>
  );
}

function SetupCard({
  side,
  priority,
  entry,
  sl,
  tp1,
  tp2,
}: {
  side: "short" | "long";
  priority: boolean;
  entry: string;
  sl: string;
  tp1: string;
  tp2: string;
}) {
  const short = side === "short";
  return (
    <div className={cn("rounded-xl px-3 py-3", short ? "bg-[#3a1218] ring-1 ring-[#e74c3c]" : "bg-[#12351f] ring-1 ring-[#2ecc71]")}>
      <p className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em]">
        <span>{short ? "🐻" : "🐂"}</span>
        <span>{short ? "SHORT" : "LONG"}</span>
        <span className="rounded-full bg-black/30 px-2 py-0.5 text-[9px]">{priority ? "приоритет" : "контртренд"}</span>
      </p>
      <svg viewBox="0 0 120 36" className="mt-2 h-8 w-full">
        {short ? (
          <polygon points="8,6 112,6 60,32" fill="rgba(231,76,60,0.85)" />
        ) : (
          <polygon points="8,30 112,30 60,6" fill="rgba(46,204,113,0.85)" />
        )}
      </svg>
      <p className="mt-1 font-mono text-[11px] leading-relaxed">
        Вход {entry}
        <br />
        SL {sl} · TP1 {tp1} · TP2 {tp2}
      </p>
    </div>
  );
}

const BAR: Record<string, string> = {
  bear: "from-[#e74c3c] to-[#7f1d1d]",
  bull: "from-[#22c55e] to-[#14532d]",
  warn: "from-[#f59e0b] to-[#78350f]",
  neutral: "from-[#22d3ee] to-[#155e75]",
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
    };
  }, [isLead, extra.data, picked.spec]);

  const p = built?.poster ?? digest.poster;
  const chart = built?.chart ?? digest.chart;
  const down = p.biasTone === "bear";

  const pills =
    p.patternPills.length >= 3
      ? p.patternPills.slice(0, 4)
      : [
          { title: down ? "Нисходящий канал" : "Восходящий канал", text: "Цена внутри. Пробой по тренду усиливает, против — пересмотр." },
          { title: "Double Bottom / Top", text: "Пока не подтверждён. Нужен пробой шеи и объём." },
          { title: "Triangle / flag", text: "Серия сжатий к краю диапазона. Пробой = сценарий дня." },
          { title: "Гармоника", text: p.cards[2]?.footer || "Идеального Gartley/Bat может не быть — это тоже вывод." },
          ...p.patternPills,
        ].slice(0, 4);

  return (
    <figure className="overflow-hidden rounded-2xl border border-[#243044] bg-[#05070c] text-[#e8eef7] shadow-[0_24px_80px_-28px_rgba(56,189,248,0.35)]">
      <div className="px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-3 flex flex-wrap gap-1">
          {digest.markets.map((m) => (
            <button
              key={m.spec.id}
              type="button"
              onClick={() => setId(m.spec.id)}
              className={cn(
                "h-7 rounded-full px-2 font-mono text-[10px]",
                m.spec.id === id ? "bg-[#14b8c6] text-[#042226]" : "bg-[#121826] text-slate-400",
              )}
            >
              {m.spec.id}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-4xl">
              {p.headline}
            </h1>
            <p className="mt-2 font-mono text-[11px] tracking-[0.18em] text-slate-500">
              {p.pair.toUpperCase()} · {p.dateLabel}
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <p className="font-display text-5xl font-medium leading-none sm:text-7xl">≈ {p.price}</p>
              <span className="mb-1 rounded-md bg-[#14b8c6] px-2 py-1 font-mono text-[10px] font-bold tracking-widest text-[#042226]">
                CURRENT PRICE
              </span>
            </div>
            <p className="mt-2 font-mono text-[10px] tracking-wide text-slate-500">
              {p.dateLabel} — ДАННЫЕ НА МОМЕНТ АНАЛИЗА · H1 · приказ {actionLabel(picked.advice.action)}
              {extra.isFetching && !isLead ? " · гружу…" : ""}
            </p>
          </div>
          <div className="grid min-w-[260px] gap-2 sm:grid-cols-2">
            <div className="rounded-xl bg-[#0c1220] px-4 py-3 ring-1 ring-[#1e293b]">
              <p className="font-mono text-[10px] tracking-[0.16em] text-slate-400">ATR Daily</p>
              <p className="mt-1 text-xl font-medium">{p.atr}</p>
              <p className="text-xs text-slate-500">{p.atrNote}</p>
            </div>
            <div className={cn("rounded-xl px-4 py-3", down ? "bg-[#3a1218] ring-1 ring-[#e74c3c]" : p.biasTone === "bull" ? "bg-[#12351f] ring-1 ring-[#2ecc71]" : "bg-[#0c1220] ring-1 ring-[#1e293b]")}>
              <p className="font-mono text-[10px] tracking-[0.16em] text-slate-400">Bias</p>
              <p className="mt-1 text-lg font-medium">
                {down ? "🐻 Медвежий" : p.biasTone === "bull" ? "🐂 Бычий" : "⚖ Range"}
              </p>
              <p className="text-xs text-slate-400">{p.bias}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-4">
          {p.cards.map((c) => (
            <section key={c.kicker} className={cn("rounded-2xl p-4", TONE[c.tone])}>
              <p className="flex items-center gap-2 font-mono text-[11px] tracking-[0.16em]">
                <span className={cn("inline-flex size-6 items-center justify-center rounded-full text-[11px] font-bold", NUM[c.tone])}>
                  {c.kicker}
                </span>
                {c.title}
              </p>
              {c.kicker === "2" ? <WaveSketch down={down} /> : null}
              {c.kicker === "3" ? (
                <div className="mt-2 space-y-2">
                  <ChannelSketch />
                </div>
              ) : null}
              {c.kicker === "4" ? (
                <div className="mt-3 space-y-2">
                  {p.setups.map((s) => (
                    <SetupCard key={s.side} {...s} />
                  ))}
                </div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {c.rows.map((r) => (
                    <li key={r.label} className="text-[13px] leading-snug">
                      <span className="mr-1">{r.icon}</span>
                      <span className="opacity-70">{r.label}: </span>
                      <span>{r.value}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs leading-relaxed opacity-80">{c.footer}</p>
            </section>
          ))}
        </div>

        <div className="mt-5">
          <PosterChart chart={chart} bias={p.biasTone} />
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {pills.map((pill) => (
            <div key={pill.title} className="rounded-xl bg-[#0c1220] px-3 py-3 ring-1 ring-[#1e293b]">
              <p className="font-mono text-[10px] tracking-[0.14em] text-[#5eead4]">{pill.title.toUpperCase()}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{pill.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="font-mono text-[11px] tracking-[0.2em] text-[#5eead4]">ТОРГОВЫЕ СЕТАПЫ + УРОВНИ</p>
            {p.setups.map((s) => (
              <SetupCard key={`b-${s.side}`} {...s} />
            ))}
          </div>
          <div className="rounded-xl bg-[#0c1220] px-4 py-4 ring-1 ring-[#1e293b]">
            <p className="font-mono text-[11px] tracking-[0.2em] text-[#5eead4]">КЛЮЧЕВЫЕ УРОВНИ</p>
            <ul className="mt-4 space-y-3">
              {p.levels.map((lv) => (
                <li key={lv.name} className="flex items-center gap-3">
                  <div
                    className={cn(
                      "h-8 min-w-[7.5rem] rounded-md bg-gradient-to-r px-3 text-sm font-semibold leading-8 tabular-nums",
                      BAR[lv.tone] ?? BAR.neutral,
                    )}
                  >
                    {lv.price}
                  </div>
                  <span className="text-xs text-slate-400">
                    {lv.name} · {lv.hint}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-[#0c1220] px-3 py-3 text-xs text-slate-400 ring-1 ring-[#1e293b]">
            🛡 {p.risk}
          </div>
          <div className="rounded-xl bg-[#0c1220] px-3 py-3 text-xs text-slate-400 ring-1 ring-[#1e293b]">
            🔍 Объём подтверждает истинность движения.
          </div>
          <div className="rounded-xl bg-[#0c1220] px-3 py-3 text-xs text-slate-400 ring-1 ring-[#1e293b]">
            ℹ Образовательный материал. Не рекомендация к сделке.
          </div>
        </div>
      </div>
    </figure>
  );
}
