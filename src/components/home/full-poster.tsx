import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { fetchDigest } from "@/lib/market/fetch";
import { fetchMarket } from "@/lib/market/fetch";
import { analyzeMarket } from "@/lib/smc/engine";
import { buildPoster, toDigestMarket, todayKey, type DailyPoster } from "@/lib/digest";
import { actionLabel } from "@/lib/advisor";
import { cn } from "@/lib/utils";

function MiniStructure({ down }: { down: boolean }) {
  return (
    <svg viewBox="0 0 220 90" className="mt-3 h-24 w-full">
      <text x="110" y="12" textAnchor="middle" fill="#ef4444" fontSize="8" fontFamily="monospace">
        BUY-SIDE LIQUIDITY
      </text>
      <rect x="130" y="18" width="70" height="16" rx="2" fill="rgba(239,68,68,0.35)" stroke="#ef4444" />
      <text x="165" y="29" textAnchor="middle" fill="#fecaca" fontSize="7">
        SUPPLY
      </text>
      <path
        d={down ? "M12 28 L40 40 L70 32 L100 48 L130 38 L160 55 L190 48 L208 62" : "M12 62 L40 50 L70 58 L100 42 L130 52 L160 35 L190 42 L208 28"}
        fill="none"
        stroke="#94a3b8"
        strokeWidth="1.6"
      />
      <rect x="20" y="58" width="80" height="14" rx="2" fill="rgba(34,197,94,0.3)" stroke="#22c55e" />
      <text x="60" y="68" textAnchor="middle" fill="#bbf7d0" fontSize="7">
        DEMAND / OB
      </text>
      <text x="110" y="86" textAnchor="middle" fill="#22d3ee" fontSize="8" fontFamily="monospace">
        SELL-SIDE LIQUIDITY
      </text>
    </svg>
  );
}

function WaveSketch({ down }: { down: boolean }) {
  const ys = down ? [22, 10, 34, 18, 48] : [42, 28, 36, 14, 8];
  const pts = [12, 48, 84, 120, 156].map((x, i) => `${x},${ys[i]}`).join(" ");
  return (
    <svg viewBox="0 0 170 58" className="mt-3 h-16 w-full">
      <polyline points={pts} fill="none" stroke="#c4a4ff" strokeWidth="2" />
      {[12, 48, 84, 120, 156].map((x, i) => (
        <g key={x}>
          <circle cx={x} cy={ys[i]} r="7" fill="#1a1030" stroke="#c4a4ff" />
          <text x={x} y={ys[i]! + 3} textAnchor="middle" fill="#c4a4ff" fontSize="8">
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}

function PatternSketches() {
  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-start gap-2">
        <svg viewBox="0 0 56 28" className="h-8 w-14 shrink-0">
          <path d="M4 6 L52 14 L52 22 L4 14 Z" fill="rgba(231,76,60,0.25)" stroke="#e74c3c" strokeWidth="1.2" />
          <path d="M8 16 L18 12 L28 15 L38 10 L48 13" fill="none" stroke="#94a3b8" strokeWidth="1" />
        </svg>
        <p className="text-[10px] leading-snug text-slate-300">
          <span className="font-mono text-[#f0a36a]">КАНАЛ / RANGE</span>
          <br />
          Цена внутри. Пробой по тренду усиливает сценарий.
        </p>
      </div>
      <div className="flex items-start gap-2">
        <svg viewBox="0 0 56 28" className="h-8 w-14 shrink-0">
          <path d="M6 8 L18 20 L30 10 L42 20 L50 12" fill="none" stroke="#94a3b8" strokeWidth="1.2" />
          <line x1="6" y1="22" x2="50" y2="22" stroke="#22c55e" strokeDasharray="2 2" />
        </svg>
        <p className="text-[10px] leading-snug text-slate-300">
          <span className="font-mono text-[#f0a36a]">DOUBLE BOTTOM</span>
          <br />
          Нужен пробой шеи — пока не подтверждён.
        </p>
      </div>
      <div className="flex items-start gap-2">
        <svg viewBox="0 0 56 28" className="h-8 w-14 shrink-0">
          <path d="M8 6 L48 10 L28 24 Z" fill="none" stroke="#e74c3c" strokeWidth="1.2" />
          <path d="M12 18 L22 14 L32 16 L40 12" fill="none" stroke="#94a3b8" strokeWidth="1" />
        </svg>
        <p className="text-[10px] leading-snug text-slate-300">
          <span className="font-mono text-[#f0a36a]">ТРЕУГОЛЬНИК</span>
          <br />
          Сжатие к краю. Пробой = сценарий дня.
        </p>
      </div>
    </div>
  );
}

function SetupBlock({
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
    <div
      className={cn(
        "rounded-lg px-3 py-2.5",
        short ? "bg-[#3a1218] ring-1 ring-[#e74c3c]/" : "bg-[#12351f] ring-1 ring-[#2ecc71]",
      )}
    >
      <p className="font-mono text-[11px] tracking-wide">
        {short ? "↓ SHORT СЕТАП" : "↑ LONG СЕТАП"}
        {priority ? (
          <span className="ml-2 rounded bg-black/40 px-1.5 py-0.5 text-[9px]">приоритет</span>
        ) : (
          <span className="ml-2 rounded bg-black/40 px-1.5 py-0.5 text-[9px]">контртренд</span>
        )}
      </p>
      <p className="mt-1 font-mono text-[11px] leading-relaxed text-slate-200">
        {entry} | SL {sl}
        <br />
        TP {tp1} / {tp2}
      </p>
    </div>
  );
}

function PosterBody({ p, action }: { p: DailyPoster; action: string }) {
  const down = p.biasTone === "bear";
  const smc = p.cards.find((c) => c.kicker === "1") ?? p.cards[0];
  const elliot = p.cards.find((c) => c.kicker === "2") ?? p.cards[1];
  const patterns = p.cards.find((c) => c.kicker === "3") ?? p.cards[2];

  return (
    <figure className="overflow-hidden rounded-2xl border border-[#1e293b] bg-[#05070c] text-[#e8eef7] shadow-[0_24px_80px_-24px_rgba(56,189,248,0.4)]">
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
            {p.pair.toUpperCase()} — ПОЛНЫЙ РАЗБОР {p.dateLabel}
          </h1>
          <p className="mt-2 font-mono text-[10px] tracking-[0.2em] text-slate-500 sm:text-[11px]">
            АНАЛИЗ · СТРУКТУРА · ПАТТЕРНЫ · СЕТАПЫ · КЛЮЧЕВЫЕ УРОВНИ
          </p>
          <p className="mt-4 font-mono text-[10px] tracking-[0.18em] text-[#22d3ee]">ТЕКУЩАЯ ЦЕНА</p>
          <p className="mt-1 font-display text-5xl font-medium leading-none text-[#22d3ee] sm:text-6xl">≈ {p.price}</p>
          <p className="mt-2 font-mono text-[10px] text-slate-500">
            H1 · приказ {action} · {p.headline}
          </p>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          <section className="rounded-xl bg-[#0a1628] p-4 ring-1 ring-[#14b8c6]/40">
            <p className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-[#22d3ee]">
              <span className="inline-flex size-6 items-center justify-center rounded-full bg-[#14b8c6] text-[11px] font-bold text-[#042226]">
                1
              </span>
              SMC SMART MONEY
            </p>
            <ul className="mt-3 space-y-1.5 text-[12px] leading-snug text-slate-300">
              {(smc?.rows ?? []).slice(0, 7).map((r) => (
                <li key={r.label}>
                  <span className="text-slate-500">{r.label}: </span>
                  {r.value}
                </li>
              ))}
            </ul>
            <MiniStructure down={down} />
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{smc?.footer}</p>
          </section>

          <section className="rounded-xl bg-[#120a1c] p-4 ring-1 ring-[#a78bfa]/40">
            <p className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-[#c4a4ff]">
              <span className="inline-flex size-6 items-center justify-center rounded-full bg-[#c4a4ff] text-[11px] font-bold text-[#1a1030]">
                2
              </span>
              ВОЛНЫ ЭЛЛИОТТА
            </p>
            <ul className="mt-3 space-y-1.5 text-[12px] leading-snug text-slate-300">
              {(elliot?.rows ?? []).map((r) => (
                <li key={r.label}>
                  <span className="text-slate-500">{r.label}: </span>
                  {r.value}
                </li>
              ))}
            </ul>
            <WaveSketch down={down} />
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{elliot?.footer}</p>
          </section>

          <section className="rounded-xl bg-[#1a1008] p-4 ring-1 ring-[#f0a36a]/40">
            <p className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-[#f0a36a]">
              <span className="inline-flex size-6 items-center justify-center rounded-full bg-[#f0a36a] text-[11px] font-bold text-[#2a150c]">
                3
              </span>
              ПАТТЕРНЫ С ОБЪЯСНЕНИЯМИ
            </p>
            <p className="mt-2 font-mono text-[10px] tracking-wide text-slate-500">ГРАФИЧЕСКИЕ</p>
            <PatternSketches />
            <p className="mt-3 font-mono text-[10px] tracking-wide text-slate-500">ГАРМОНИЧЕСКИЕ</p>
            <ul className="mt-1 space-y-1 text-[11px] leading-snug text-slate-300">
              {(patterns?.rows ?? []).slice(0, 3).map((r) => (
                <li key={r.label}>
                  <span className="text-[#f0a36a]">{r.label}</span> — {r.value}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{patterns?.footer}</p>
          </section>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <section className="rounded-xl bg-[#0c1220] p-4 ring-1 ring-[#1e293b]">
            <p className="font-mono text-[11px] tracking-[0.16em] text-[#5eead4]">ATR + ТОРГОВЫЕ СЕТАПЫ</p>
            <p className="mt-2 text-sm">
              <span className="font-mono text-lg text-white">{p.atr}</span>
              <span className="ml-2 text-xs text-slate-500">{p.atrNote}</span>
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {p.setups.map((s) => (
                <SetupBlock key={s.side} {...s} />
              ))}
            </div>
            <p className="mt-3 text-[11px] text-slate-500">{p.risk}</p>
          </section>

          <section className="rounded-xl bg-[#0c1220] p-4 ring-1 ring-[#1e293b]">
            <p className="font-mono text-[11px] tracking-[0.16em] text-[#5eead4]">КЛЮЧЕВЫЕ УРОВНИ</p>
            <ul className="mt-3 space-y-2.5">
              {p.levels.map((lv) => (
                <li key={lv.name} className="flex items-center gap-3">
                  <div
                    className={cn(
                      "min-w-[6.5rem] rounded-md px-2.5 py-1.5 text-center font-mono text-sm font-semibold tabular-nums",
                      lv.tone === "bear" && "bg-gradient-to-r from-[#e74c3c] to-[#7f1d1d]",
                      lv.tone === "bull" && "bg-gradient-to-r from-[#22c55e] to-[#14532d]",
                      lv.tone === "neutral" && "bg-gradient-to-r from-[#22d3ee] to-[#155e75]",
                    )}
                  >
                    {lv.price}
                  </div>
                  <span className="text-xs text-slate-400">
                    <span className="text-slate-200">{lv.name}</span> · {lv.hint}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <p className="mt-4 text-center font-mono text-[10px] tracking-wide text-slate-600">
          SMC + ELLIOTT + PATTERNS + ATR · НЕ ЯВЛЯЕТСЯ ТОРГОВОЙ РЕКОМЕНДАЦИЕЙ
        </p>
      </div>
    </figure>
  );
}

export function HomeFullPoster() {
  const q = useQuery({
    queryKey: ["home-digest-full"],
    queryFn: () => fetchDigest(),
    staleTime: 45_000,
    refetchInterval: 60_000,
  });
  const digest = q.data?.digest;
  const lead = digest?.lead;

  const live = useQuery({
    queryKey: ["home-poster-pair", lead?.spec.id, "1h"],
    queryFn: () => fetchMarket({ data: { symbol: lead!.spec.id, timeframe: "1h" } }),
    enabled: Boolean(lead?.spec.id),
    staleTime: 45_000,
  });

  const built = useMemo(() => {
    if (!lead || !live.data?.candles.length) return null;
    const snap = analyzeMarket(live.data.candles, live.data.options, live.data.trades);
    const market = toDigestMarket(lead.spec, snap, lead.spec.spread, live.data.candles.at(-1), live.data.options);
    return {
      poster: buildPoster(market, snap, todayKey()),
      action: actionLabel(market.advice.action),
    };
  }, [lead, live.data]);

  const poster = built?.poster ?? (digest ? digest.poster : null);
  const action = built?.action ?? (lead ? actionLabel(lead.advice.action) : "—");

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.22em] text-accent">СЕГОДНЯ · ПОЛНЫЙ РАЗБОР</p>
          <h2 className="mt-1 text-2xl font-medium">Актуальная пара стола</h2>
          <p className="mt-1 text-sm text-muted">
            Тот же стиль, что на эталонном постере: SMC · Эллиотт · паттерны · сетапы · уровни. Пара — лид с живым
            приказом.
          </p>
        </div>
        <Link to="/daily" className="font-mono text-xs text-accent underline-offset-4 hover:underline">
          выпуск и статья →
        </Link>
      </div>
      {poster ? (
        <PosterBody p={poster} action={action} />
      ) : (
        <p className="rounded-2xl border border-border px-4 py-16 text-center text-sm text-muted">Собираю постер…</p>
      )}
    </section>
  );
}
