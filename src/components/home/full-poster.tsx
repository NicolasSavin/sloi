import { useQuery } from "@tanstack/react-query";
import { fetchDigest } from "@/lib/market/fetch";
import { actionLabel } from "@/lib/advisor";
import type { DailyPoster } from "@/lib/digest";

function StructureMap({ supply, demand, bsl, ssl }: { supply: string; demand: string; bsl: string; ssl: string }) {
  return (
    <svg viewBox="0 0 280 130" className="mt-3 w-full">
      <text x="140" y="12" textAnchor="middle" fill="#ff5b5b" fontSize="8" fontFamily="ui-monospace,monospace" letterSpacing="0.6">
        BUY-SIDE LIQUIDITY {bsl}
      </text>
      <path d="M8 48 L28 40 L48 52 L68 36 L88 50 L108 30 L128 46 L148 28 L168 44 L188 34 L208 48 L228 38 L252 58" fill="none" stroke="#c9d4e8" strokeWidth="1.6" />
      <rect x="168" y="18" width="96" height="22" fill="#7a1d28" opacity="0.85" />
      <text x="216" y="27" textAnchor="middle" fill="#ffb4b4" fontSize="7" fontFamily="ui-monospace,monospace">
        SUPPLY
      </text>
      <text x="216" y="37" textAnchor="middle" fill="#ffd0d0" fontSize="7" fontFamily="ui-monospace,monospace">
        {supply}
      </text>
      <rect x="28" y="78" width="110" height="22" fill="#0f4a3a" opacity="0.9" />
      <text x="83" y="87" textAnchor="middle" fill="#9ff3d0" fontSize="7" fontFamily="ui-monospace,monospace">
        DEMAND / OB
      </text>
      <text x="83" y="97" textAnchor="middle" fill="#c6ffe8" fontSize="7" fontFamily="ui-monospace,monospace">
        {demand}
      </text>
      <text x="140" y="124" textAnchor="middle" fill="#ff4d4d" fontSize="8" fontFamily="ui-monospace,monospace">
        SELL-SIDE LIQUIDITY {ssl}
      </text>
    </svg>
  );
}

function WaveMap({ high, mid, low, invalid }: { high: string; mid: string; low: string; invalid: string }) {
  return (
    <svg viewBox="0 0 260 150" className="mt-2 w-full">
      <polygon points="20,28 70,8 118,78 168,48 214,128" fill="#5b2ad6" opacity="0.35" />
      <polyline points="20,28 70,8 118,78 168,48 214,128" fill="none" stroke="#c4a4ff" strokeWidth="2.2" />
      {[
        [20, 28, "1"],
        [70, 8, "2"],
        [118, 78, "3"],
        [168, 48, "4"],
        [214, 128, "5"],
      ].map(([x, y, n]) => (
        <g key={String(n)}>
          <circle cx={x as number} cy={y as number} r="8" fill="#12081f" stroke="#c4a4ff" />
          <text x={x as number} y={(y as number) + 3} textAnchor="middle" fill="#e9d5ff" fontSize="8">
            {n}
          </text>
        </g>
      ))}
      <text x="70" y="0" fill="#e9d5ff" fontSize="8" fontFamily="ui-monospace,monospace">
        {high}
      </text>
      <text x="216" y="18" fill="#fda4af" fontSize="8" fontFamily="ui-monospace,monospace">
        {invalid}
      </text>
      <text x="216" y="62" fill="#e9d5ff" fontSize="8" fontFamily="ui-monospace,monospace">
        {mid}
      </text>
      <text x="216" y="144" fill="#e9d5ff" fontSize="8" fontFamily="ui-monospace,monospace">
        {low}
      </text>
    </svg>
  );
}

function PatternCol() {
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] text-[#ffb15a]">
        ■ ГРАФИЧЕСКИЕ
      </p>
      <div className="flex gap-2">
        <svg viewBox="0 0 70 40" className="h-10 w-[70px] shrink-0">
          <path d="M4 6 L66 16 L66 28 L4 18 Z" fill="none" stroke="#ef4444" strokeWidth="1.4" />
          <polyline points="8,20 18,14 28,18 38,10 48,16 58,8" fill="none" stroke="#cbd5e1" strokeWidth="1.2" />
          <text x="62" y="36" fill="#94a3b8" fontSize="7">
            (3)
          </text>
        </svg>
        <p className="text-[11px] leading-snug text-slate-300">
          <span className="block font-semibold text-[#ffb15a]">НИСХОДЯЩИЙ КАНАЛ</span>
          Цена внутри расширяющегося диапазона. Пробой вниз усиливает медвежий сценарий.
        </p>
      </div>
      <div className="flex gap-2">
        <svg viewBox="0 0 70 40" className="h-10 w-[70px] shrink-0">
          <polyline points="6,10 18,28 30,12 42,28 54,10" fill="none" stroke="#cbd5e1" strokeWidth="1.3" />
          <line x1="6" y1="8" x2="56" y2="8" stroke="#22c55e" strokeDasharray="2 2" />
          <text x="4" y="38" fill="#94a3b8" fontSize="7">
            (3)
          </text>
          <text x="40" y="38" fill="#94a3b8" fontSize="7">
            (4)
          </text>
        </svg>
        <p className="text-[11px] leading-snug text-slate-300">
          <span className="block font-semibold text-[#ffb15a]">DOUBLE BOTTOM (НЕ ПОДТВЕРЖДЁН)</span>
          Для подтверждения нужен пробой neckline.
        </p>
      </div>
      <div className="flex gap-2">
        <svg viewBox="0 0 70 40" className="h-10 w-[70px] shrink-0">
          <polyline points="8,8 58,14" fill="none" stroke="#ef4444" strokeWidth="1.3" />
          <polyline points="8,30 58,16" fill="none" stroke="#ef4444" strokeWidth="1.3" />
          <polyline points="12,22 22,16 32,20 42,12 52,18" fill="none" stroke="#cbd5e1" strokeWidth="1.2" />
          <text x="2" y="38" fill="#94a3b8" fontSize="7">
            (3)
          </text>
          <text x="52" y="38" fill="#94a3b8" fontSize="7">
            (5)
          </text>
        </svg>
        <p className="text-[11px] leading-snug text-slate-300">
          <span className="block font-semibold text-[#ffb15a]">DESCENDING TRIANGLE</span>
          Lower highs + поддержка. Пробой вниз = усиление продаж.
        </p>
      </div>
      <p className="flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] text-[#ff7ad9]">
        ◆ ГАРМОНИЧЕСКИЕ
      </p>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] leading-snug text-slate-300">
          Нет идеального завершённого Gartley/Bat.
          <br />
          Возможен AB=CD внутри range.
        </p>
        <svg viewBox="0 0 70 40" className="h-10 w-[70px] shrink-0">
          <polyline points="8,28 22,8 36,24 58,16" fill="none" stroke="#60a5fa" strokeWidth="1.4" />
          <text x="6" y="36" fill="#93c5fd" fontSize="7">
            A
          </text>
          <text x="20" y="7" fill="#93c5fd" fontSize="7">
            B
          </text>
          <text x="34" y="36" fill="#93c5fd" fontSize="7">
            C
          </text>
          <text x="56" y="14" fill="#93c5fd" fontSize="7">
            D
          </text>
        </svg>
      </div>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] leading-snug text-slate-300">
          Потенциал Bearish Butterfly/Crab при росте к верху range.
        </p>
        <svg viewBox="0 0 70 40" className="h-10 w-[70px] shrink-0">
          <polyline points="8,10 24,30 40,8 58,28" fill="none" stroke="#fb7185" strokeWidth="1.4" />
          <text x="6" y="8" fill="#fda4af" fontSize="7">
            A
          </text>
          <text x="22" y="38" fill="#fda4af" fontSize="7">
            B
          </text>
          <text x="38" y="7" fill="#fda4af" fontSize="7">
            C
          </text>
          <text x="56" y="38" fill="#fda4af" fontSize="7">
            D
          </text>
        </svg>
      </div>
    </div>
  );
}

function AtrBars() {
  const hs = [10, 14, 12, 18, 16, 22, 20, 28, 24, 36];
  return (
    <svg viewBox="0 0 90 44" className="h-11 w-[90px]">
      {hs.map((h, i) => (
        <rect key={i} x={i * 9} y={44 - h} width="7" height={h} fill="#f59e0b" />
      ))}
    </svg>
  );
}

function rowOf(card: { rows: { label: string; value: string }[] } | undefined, label: string) {
  return card?.rows.find((r) => r.label.toLowerCase().includes(label.toLowerCase()))?.value ?? "—";
}

function PosterBoard({ p, action }: { p: DailyPoster; action: string }) {
  const smc = p.cards.find((c) => c.kicker === "1") ?? p.cards[0];
  const el = p.cards.find((c) => c.kicker === "2") ?? p.cards[1];
  const supply = rowOf(smc, "Supply");
  const demand = rowOf(smc, "Demand");
  const bsl = rowOf(smc, "Buy-side");
  const ssl = rowOf(smc, "Sell-side");
  const short = p.setups.find((s) => s.side === "short");
  const long = p.setups.find((s) => s.side === "long");
  const high = p.levels[0]?.price ?? "—";
  const low = p.levels.at(-1)?.price ?? "—";
  const mid = p.levels[2]?.price ?? p.price;

  return (
    <figure className="overflow-hidden rounded-none border border-[#12304a] bg-[#07111f] text-[#e8eef8]" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
      <div className="px-4 py-5 sm:px-7 sm:py-6">
        <header className="text-center">
          <h1 className="text-[22px] font-extrabold tracking-wide text-white sm:text-[34px]">
            {p.pair.toUpperCase()} — ПОЛНЫЙ РАЗБОР {p.dateLabel}
          </h1>
          <p className="mt-1 font-mono text-[11px] tracking-[0.22em] text-[#3ecbff] sm:text-[12px]">
            АНАЛИЗ • СТРУКТУРА • ПАТТЕРНЫ • СЕТАПЫ • КЛЮЧЕВЫЕ УРОВНИ
          </p>
          <p className="mt-3 font-mono text-[11px] tracking-[0.2em] text-[#3ecbff]">ТЕКУЩАЯ ЦЕНА</p>
          <p className="mt-1 text-[52px] font-black leading-none text-[#3ecbff] sm:text-[64px]">≈ {p.price}</p>
          <p className="mt-1 font-mono text-[10px] text-slate-500">приказ {action}</p>
        </header>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <section className="rounded-md border-2 border-[#1ec8e6] bg-[#081828] p-4">
            <p className="flex items-center gap-2 font-mono text-[13px] font-bold tracking-wide text-[#1ec8e6]">
              ◆ SMC SMART MONEY
            </p>
            <ul className="mt-3 space-y-2 text-[12.5px] leading-snug text-slate-200">
              {(smc?.rows ?? []).slice(0, 6).map((r) => (
                <li key={r.label} className="flex gap-2">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#1ec8e6]" />
                  <span>
                    <b className="text-white">{r.label}:</b> {r.value}
                  </span>
                </li>
              ))}
            </ul>
            <StructureMap supply={supply} demand={demand} bsl={bsl} ssl={ssl} />
            <p className="mt-2 text-[11px] text-slate-400">{smc?.footer}</p>
          </section>

          <section className="rounded-md border-2 border-[#8b5cf6] bg-[#12081f] p-4">
            <p className="flex items-center gap-2 font-mono text-[13px] font-bold tracking-wide text-[#c4b5fd]">
              ≈ ВОЛНЫ ЭЛЛИОТТА
            </p>
            <ul className="mt-3 space-y-2 text-[12.5px] leading-snug text-slate-200">
              {(el?.rows ?? []).map((r) => (
                <li key={r.label} className="flex gap-2">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#c4b5fd]" />
                  <span>
                    <b className="text-white">{r.label}:</b> {r.value}
                  </span>
                </li>
              ))}
            </ul>
            <WaveMap high={high} mid={mid} low={low} invalid={high} />
            <p className="mt-2 text-[11px] text-slate-400">{el?.footer}</p>
          </section>

          <section className="rounded-md border-2 border-[#f59e0b] bg-[#1a1206] p-4">
            <p className="flex items-center gap-2 font-mono text-[13px] font-bold tracking-wide text-[#fbbf24]">
              ▣ ПАТТЕРНЫ С ОБЪЯСНЕНИЯМИ
            </p>
            <div className="mt-3">
              <PatternCol />
            </div>
          </section>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <section className="rounded-md border-2 border-[#1ec8e6] bg-[#081828] p-4">
            <p className="flex items-center gap-2 font-mono text-[13px] font-bold tracking-wide text-[#fbbf24]">
              █ ATR + ТОРГОВЫЕ СЕТАПЫ
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr_1fr]">
              <div className="rounded-md bg-[#1a1408] p-3 ring-1 ring-[#f59e0b]/50">
                <p className="font-mono text-[10px] tracking-wide text-[#fbbf24]">DAILY ATR</p>
                <p className="mt-1 text-lg font-bold text-white">{p.atr}</p>
                <p className="text-[10px] text-slate-400">{p.atrNote}</p>
                <div className="mt-2">
                  <AtrBars />
                </div>
              </div>
              <div className="rounded-md bg-[#2a1014] p-3 ring-1 ring-[#ef4444]">
                <p className="font-mono text-[11px] font-bold text-[#f87171]">▼ SHORT CETAP</p>
                <p className="mt-2 font-mono text-[12px] leading-relaxed">
                  {short?.entry}
                  <br />
                  SL {short?.sl}
                  <br />
                  TP {short?.tp1} / {short?.tp2}
                </p>
                <p className="mt-2 text-[11px] text-slate-400">Продажи от supply zone. SL выше локального максимума.</p>
              </div>
              <div className="rounded-md bg-[#0d2a18] p-3 ring-1 ring-[#22c55e]">
                <p className="font-mono text-[11px] font-bold text-[#4ade80]">▲ LONG CETAP</p>
                <p className="mt-2 font-mono text-[12px] leading-relaxed">
                  {long?.entry}
                  <br />
                  SL {long?.sl}
                  <br />
                  TP {long?.tp1} / {long?.tp2}
                </p>
                <p className="mt-2 text-[11px] text-slate-400">Покупки от demand / double bottom. SL ниже края range.</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-500">{p.risk}</p>
          </section>

          <section className="rounded-md border-2 border-[#1ec8e6] bg-[#081828] p-4">
            <p className="flex items-center gap-2 font-mono text-[13px] font-bold tracking-wide text-[#1ec8e6]">
              ☰ КЛЮЧЕВЫЕ УРОВНИ
            </p>
            <ul className="mt-4 space-y-3">
              {p.levels.map((lv) => (
                <li key={lv.name} className="flex items-center gap-3">
                  <div
                    className={
                      lv.tone === "bear"
                        ? "min-w-[7.2rem] rounded bg-gradient-to-r from-[#2563eb] to-[#1e3a8a] px-3 py-1.5 text-center font-mono text-sm font-bold"
                        : lv.tone === "bull"
                          ? "min-w-[7.2rem] rounded bg-gradient-to-r from-[#7c3aed] to-[#4c1d95] px-3 py-1.5 text-center font-mono text-sm font-bold"
                          : "min-w-[7.2rem] rounded bg-gradient-to-r from-[#0ea5e9] to-[#075985] px-3 py-1.5 text-center font-mono text-sm font-bold"
                    }
                  >
                    {lv.price}
                  </div>
                  <span className="text-[12px] text-slate-300">
                    {lv.name} / {lv.hint}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 flex flex-wrap gap-4 font-mono text-[10px] text-slate-500">
              <span className="text-[#f87171]">● RESISTANCE / SUPPLY</span>
              <span className="text-[#22d3ee]">● SUPPORT / DEMAND</span>
              <span className="text-[#c084fc]">● LIQUIDITY / BREAK</span>
            </p>
          </section>
        </div>

        <p className="mt-4 text-center font-mono text-[11px] tracking-[0.14em] text-[#3ecbff]">
          SMC + ELLIOTT + PATTERNS + ATR · НЕ ЯВЛЯЕТСЯ ТОРГОВОЙ РЕКОМЕНДАЦИЕЙ
        </p>
      </div>
    </figure>
  );
}

export function HomeFullPoster() {
  const q = useQuery({
    queryKey: ["dispatch-digest"],
    queryFn: () => fetchDigest(),
    staleTime: 45_000,
    refetchInterval: 90_000,
    retry: 1,
  });
  const digest = q.data?.digest;
  const poster = digest?.poster ?? null;
  const action = digest?.lead ? actionLabel(digest.lead.advice.action) : "—";

  return (
    <section className="mx-auto max-w-[1100px] px-3 py-6 sm:px-6">
      {poster ? (
        <PosterBoard p={poster} action={action} />
      ) : (
        <p className="rounded-md border border-[#12304a] bg-[#07111f] px-4 py-16 text-center text-sm text-slate-400">
          {q.isError ? "Дайджест не отдал постер. Обновите страницу." : "Собираю постер…"}
        </p>
      )}
    </section>
  );
}
