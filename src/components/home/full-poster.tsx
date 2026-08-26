import { useQuery } from "@tanstack/react-query";
import { fetchDigest } from "@/lib/market/fetch";
import { actionLabel } from "@/lib/advisor";
import type { DailyPoster } from "@/lib/digest";

function StructureMap({
  supply,
  demand,
  bsl,
  ssl,
}: {
  supply: string;
  demand: string;
  bsl: string;
  ssl: string;
}) {
  return (
    <svg viewBox="0 0 320 200" className="h-auto w-full">
      <defs>
        <linearGradient id="gLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
      </defs>
      <text x="160" y="16" textAnchor="middle" fill="#ff5b5b" fontSize="11" fontFamily="ui-monospace,monospace" letterSpacing="1">
        BUY-SIDE LIQUIDITY
      </text>
      <text x="160" y="30" textAnchor="middle" fill="#fda4af" fontSize="10" fontFamily="ui-monospace,monospace">
        {bsl}
      </text>
      <rect x="190" y="38" width="110" height="36" rx="3" fill="#7a1d28" opacity="0.9" />
      <text x="245" y="54" textAnchor="middle" fill="#fecaca" fontSize="11" fontFamily="ui-monospace,monospace">
        SUPPLY
      </text>
      <text x="245" y="68" textAnchor="middle" fill="#fff1f2" fontSize="10" fontFamily="ui-monospace,monospace">
        {supply}
      </text>
      <path
        d="M12 70 L32 58 L52 74 L72 50 L92 68 L112 42 L132 62 L152 38 L172 58 L192 48 L212 66 L232 52 L252 70 L272 56 L300 80"
        fill="none"
        stroke="url(#gLine)"
        strokeWidth="2.2"
      />
      <rect x="24" y="118" width="130" height="36" rx="3" fill="#0f4a3a" opacity="0.95" />
      <text x="89" y="134" textAnchor="middle" fill="#bbf7d0" fontSize="11" fontFamily="ui-monospace,monospace">
        DEMAND / OB
      </text>
      <text x="89" y="148" textAnchor="middle" fill="#ecfdf5" fontSize="10" fontFamily="ui-monospace,monospace">
        {demand}
      </text>
      <text x="160" y="182" textAnchor="middle" fill="#ff4d4d" fontSize="11" fontFamily="ui-monospace,monospace" letterSpacing="1">
        SELL-SIDE LIQUIDITY
      </text>
      <text x="160" y="196" textAnchor="middle" fill="#fda4af" fontSize="10" fontFamily="ui-monospace,monospace">
        {ssl}
      </text>
    </svg>
  );
}

function WaveMap({ high, mid, low, invalid }: { high: string; mid: string; low: string; invalid: string }) {
  return (
    <svg viewBox="0 0 300 220" className="h-auto w-full">
      <polygon points="24,40 80,12 140,110 190,70 250,190" fill="#5b2ad6" opacity="0.4" />
      <polyline points="24,40 80,12 140,110 190,70 250,190" fill="none" stroke="#c4a4ff" strokeWidth="3" />
      {[
        [24, 40, "1"],
        [80, 12, "2"],
        [140, 110, "3"],
        [190, 70, "4"],
        [250, 190, "5"],
      ].map(([x, y, n]) => (
        <g key={String(n)}>
          <circle cx={x as number} cy={y as number} r="12" fill="#12081f" stroke="#c4a4ff" strokeWidth="2" />
          <text x={x as number} y={(y as number) + 4} textAnchor="middle" fill="#f5f3ff" fontSize="12" fontWeight="700">
            {n}
          </text>
        </g>
      ))}
      <text x="80" y="6" fill="#e9d5ff" fontSize="11" fontFamily="ui-monospace,monospace">
        {high}
      </text>
      <text x="255" y="28" fill="#fda4af" fontSize="11" fontFamily="ui-monospace,monospace">
        {invalid}
      </text>
      <text x="255" y="90" fill="#e9d5ff" fontSize="11" fontFamily="ui-monospace,monospace">
        {mid}
      </text>
      <text x="255" y="210" fill="#e9d5ff" fontSize="11" fontFamily="ui-monospace,monospace">
        {low}
      </text>
    </svg>
  );
}

function PatternMap() {
  return (
    <svg viewBox="0 0 300 280" className="h-auto w-full">
      <text x="8" y="16" fill="#fbbf24" fontSize="11" fontFamily="ui-monospace,monospace" letterSpacing="1">
        GRAPHIC
      </text>
      {/* channel */}
      <path d="M10 30 L120 42 L120 68 L10 56 Z" fill="rgba(239,68,68,0.15)" stroke="#ef4444" strokeWidth="1.6" />
      <polyline points="18,52 38,44 58,50 78,36 98,46 112,38" fill="none" stroke="#cbd5e1" strokeWidth="1.5" />
      <text x="130" y="42" fill="#fbbf24" fontSize="10" fontWeight="700">
        CHANNEL / RANGE
      </text>
      <text x="130" y="56" fill="#94a3b8" fontSize="9">
        пробой по тренду усиливает
      </text>

      {/* double bottom */}
      <polyline points="10,110 35,140 60,100 85,140 110,105" fill="none" stroke="#cbd5e1" strokeWidth="1.8" />
      <line x1="10" y1="98" x2="110" y2="98" stroke="#22c55e" strokeDasharray="3 2" strokeWidth="1.4" />
      <text x="130" y="118" fill="#fbbf24" fontSize="10" fontWeight="700">
        DOUBLE BOTTOM
      </text>
      <text x="130" y="132" fill="#94a3b8" fontSize="9">
        нужен пробой neckline
      </text>

      {/* triangle */}
      <line x1="10" y1="168" x2="110" y2="176" stroke="#ef4444" strokeWidth="1.5" />
      <line x1="10" y1="210" x2="110" y2="182" stroke="#ef4444" strokeWidth="1.5" />
      <polyline points="18,196 38,186 58,192 78,178 98,188" fill="none" stroke="#cbd5e1" strokeWidth="1.5" />
      <text x="130" y="186" fill="#fbbf24" fontSize="10" fontWeight="700">
        TRIANGLE
      </text>
      <text x="130" y="200" fill="#94a3b8" fontSize="9">
        сжатие → пробой = сценарий
      </text>

      <text x="8" y="236" fill="#f472b6" fontSize="11" fontFamily="ui-monospace,monospace" letterSpacing="1">
        HARMONIC
      </text>
      <polyline points="10,268 40,248 70,262 100,252" fill="none" stroke="#60a5fa" strokeWidth="1.8" />
      <text x="8" y="278" fill="#93c5fd" fontSize="9">
        A B C D
      </text>
      <polyline points="160,248 190,268 220,246 250,266" fill="none" stroke="#fb7185" strokeWidth="1.8" />
      <text x="160" y="278" fill="#fda4af" fontSize="9">
        Butterfly / Crab
      </text>
    </svg>
  );
}

function AtrBars() {
  const hs = [12, 16, 14, 20, 18, 26, 22, 32, 28, 40];
  return (
    <svg viewBox="0 0 100 48" className="h-12 w-[100px]">
      {hs.map((h, i) => (
        <rect key={i} x={i * 10} y={48 - h} width="8" height={h} fill="#f59e0b" rx="1" />
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
    <figure className="overflow-hidden border border-[#12304a] bg-[#07111f] text-[#e8eef8]">
      <div className="px-3 py-4 sm:px-6 sm:py-5">
        <header className="text-center">
          <h1 className="text-[20px] font-extrabold tracking-wide text-white sm:text-[32px]">
            {p.pair.toUpperCase()} — ПОЛНЫЙ РАЗБОР {p.dateLabel}
          </h1>
          <p className="mt-1 font-mono text-[10px] tracking-[0.22em] text-[#3ecbff] sm:text-[12px]">
            АНАЛИЗ • СТРУКТУРА • ПАТТЕРНЫ • СЕТАПЫ • КЛЮЧЕВЫЕ УРОВНИ
          </p>
          <p className="mt-3 font-mono text-[11px] tracking-[0.2em] text-[#3ecbff]">ТЕКУЩАЯ ЦЕНА</p>
          <p className="mt-1 text-[48px] font-black leading-none text-[#3ecbff] sm:text-[60px]">≈ {p.price}</p>
          <p className="mt-1 font-mono text-[10px] text-slate-500">приказ {action}</p>
        </header>

        {/* 3 visual columns — picture first */}
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <section className="flex flex-col rounded-md border-2 border-[#1ec8e6] bg-[#081828] p-3">
            <p className="mb-2 font-mono text-[12px] font-bold tracking-wide text-[#1ec8e6]">SMC SMART MONEY</p>
            <div className="flex-1">
              <StructureMap supply={supply} demand={demand} bsl={bsl} ssl={ssl} />
            </div>
            <p className="mt-2 line-clamp-2 text-center text-[11px] text-slate-400">{smc?.footer}</p>
          </section>

          <section className="flex flex-col rounded-md border-2 border-[#8b5cf6] bg-[#12081f] p-3">
            <p className="mb-2 font-mono text-[12px] font-bold tracking-wide text-[#c4b5fd]">ВОЛНЫ ЭЛЛИОТТА</p>
            <div className="flex-1">
              <WaveMap high={high} mid={mid} low={low} invalid={high} />
            </div>
            <p className="mt-2 line-clamp-2 text-center text-[11px] text-slate-400">{el?.footer}</p>
          </section>

          <section className="flex flex-col rounded-md border-2 border-[#f59e0b] bg-[#1a1206] p-3">
            <p className="mb-2 font-mono text-[12px] font-bold tracking-wide text-[#fbbf24]">ПАТТЕРНЫ</p>
            <div className="flex-1">
              <PatternMap />
            </div>
          </section>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <section className="rounded-md border-2 border-[#1ec8e6] bg-[#081828] p-3">
            <p className="font-mono text-[12px] font-bold tracking-wide text-[#fbbf24]">ATR + СЕТАПЫ</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded bg-[#1a1408] p-2 ring-1 ring-[#f59e0b]/40">
                <p className="font-mono text-[10px] text-[#fbbf24]">DAILY ATR</p>
                <p className="text-lg font-bold">{p.atr}</p>
                <AtrBars />
              </div>
              <div className="rounded bg-[#2a1014] p-2 ring-1 ring-[#ef4444]">
                <p className="font-mono text-[11px] font-bold text-[#f87171]">SHORT</p>
                <p className="mt-1 font-mono text-[12px] leading-snug">
                  {short?.entry}
                  <br />
                  SL {short?.sl}
                  <br />
                  TP {short?.tp1}
                </p>
              </div>
              <div className="rounded bg-[#0d2a18] p-2 ring-1 ring-[#22c55e]">
                <p className="font-mono text-[11px] font-bold text-[#4ade80]">LONG</p>
                <p className="mt-1 font-mono text-[12px] leading-snug">
                  {long?.entry}
                  <br />
                  SL {long?.sl}
                  <br />
                  TP {long?.tp1}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-md border-2 border-[#1ec8e6] bg-[#081828] p-3">
            <p className="font-mono text-[12px] font-bold tracking-wide text-[#1ec8e6]">УРОВНИ</p>
            <ul className="mt-3 space-y-2">
              {p.levels.map((lv) => (
                <li key={lv.name} className="flex items-center gap-3">
                  <div
                    className={
                      lv.tone === "bear"
                        ? "min-w-[6.8rem] rounded bg-gradient-to-r from-[#2563eb] to-[#1e3a8a] px-2 py-1 text-center font-mono text-sm font-bold"
                        : lv.tone === "bull"
                          ? "min-w-[6.8rem] rounded bg-gradient-to-r from-[#7c3aed] to-[#4c1d95] px-2 py-1 text-center font-mono text-sm font-bold"
                          : "min-w-[6.8rem] rounded bg-gradient-to-r from-[#0ea5e9] to-[#075985] px-2 py-1 text-center font-mono text-sm font-bold"
                    }
                  >
                    {lv.price}
                  </div>
                  <span className="text-[12px] text-slate-300">{lv.name}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <p className="mt-3 text-center font-mono text-[10px] tracking-[0.14em] text-[#3ecbff]">
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
