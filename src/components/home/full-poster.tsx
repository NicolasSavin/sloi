import { useQuery } from "@tanstack/react-query";
import { fetchMarket } from "@/lib/market/fetch";
import type { Candle } from "@/lib/market/types";
import type { HomeQuote } from "@/lib/home";

interface Tape {
  id: string;
  side: "BUY" | "SELL" | "WAIT";
  entry: number;
  sl: number;
  tp: number;
  last: number;
}

function parseTape(text: string): Tape[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const p = line.split(/\s+/);
      const id = p[0] ?? "EURUSD";
      const raw = (p[1] ?? "WAIT").toUpperCase();
      const side = raw === "BUY" || raw === "LONG" ? "BUY" : raw === "SELL" || raw === "SHORT" ? "SELL" : "WAIT";
      return {
        id,
        side,
        entry: Number(p[2] || 0),
        sl: Number(p[3] || 0),
        tp: Number(p[4] || 0),
        last: Number(p[5] || p[2] || 0),
      } satisfies Tape;
    });
}

function pickLead(rows: Tape[], quotes: HomeQuote[]): Tape {
  const live = rows.filter((r) => r.side === "BUY" || r.side === "SELL");
  const fx = live.filter((r) => !/XAU|XAG|XTI|XBR|XNG|BTC|ETH|XRP|TON|LTC|BCH|SPY|QQQ/.test(r.id));
  const pool = fx.length ? fx : live.length ? live : rows;
  const scored = [...pool].sort((a, b) => {
    const qa = quotes.find((q) => q.id === a.id);
    const qb = quotes.find((q) => q.id === b.id);
    return (b.side === "WAIT" ? 0 : 2) - (a.side === "WAIT" ? 0 : 2) || Math.abs(qb?.changePct ?? 0) - Math.abs(qa?.changePct ?? 0);
  });
  return scored[0] ?? { id: "EURUSD", side: "WAIT", entry: 1.16, sl: 1.17, tp: 1.15, last: 1.16 };
}

function fmt(n: number, id: string) {
  if (!Number.isFinite(n) || n === 0) return "—";
  if (id.includes("JPY")) return n.toFixed(3);
  if (/XAU|SPY|QQQ|BTC|ETH/.test(id)) return n.toFixed(2);
  if (/XAG|XTI|XBR/.test(id)) return n.toFixed(3);
  return n.toFixed(5).replace(/0+$/, "").replace(/\.$/, "");
}

function labelOf(id: string) {
  return id.length === 6 ? `${id.slice(0, 3)}/${id.slice(3)}` : id;
}

function today() {
  const d = new Date();
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
}

function CandleSnap({
  sell,
  slN,
  entryN,
  tpN,
  sl,
  entry,
  tp,
  price,
  candles,
  source,
}: {
  sell: boolean;
  slN: number;
  entryN: number;
  tpN: number;
  sl: string;
  entry: string;
  tp: string;
  price: string;
  candles: Candle[];
  source?: string;
}) {
  const bars = candles.slice(-36);
  const highs = bars.map((c) => c.high);
  const lows = bars.map((c) => c.low);
  const extra = [slN, entryN, tpN].filter((n) => Number.isFinite(n) && n > 0);
  const max = Math.max(...highs, ...extra);
  const min = Math.min(...lows, ...extra.filter((n) => n > 0));
  const pad = (max - min) * 0.08 || 1;
  const topP = max + pad;
  const botP = min - pad;
  const y0 = 668;
  const y1 = 948;
  const yOf = (p: number) => y0 + ((topP - p) / (topP - botP || 1)) * (y1 - y0);
  const w = bars.length ? Math.min(22, 900 / bars.length) : 14;

  return (
    <g>
      <rect x="36" y="620" width="1008" height="360" rx="10" fill="url(#chartBg)" stroke="#1e3a5f" strokeWidth="2" />
      <text x="52" y="646" fill="#67e8f9" fontSize="13" fontWeight="700" letterSpacing="1">
        СНИМОК H1 · {source === "demo" ? "резерв" : source ?? "live"} · бычьи / медвежьи
      </text>
      {Number.isFinite(slN) && slN > 0 && (
        <line x1="60" y1={yOf(slN)} x2="980" y2={yOf(slN)} stroke="#fb7185" strokeDasharray="5 4" strokeWidth="1.2" />
      )}
      {Number.isFinite(entryN) && entryN > 0 && (
        <line x1="60" y1={yOf(entryN)} x2="980" y2={yOf(entryN)} stroke="#fbbf24" strokeDasharray="4 4" strokeWidth="1.2" />
      )}
      {Number.isFinite(tpN) && tpN > 0 && (
        <line x1="60" y1={yOf(tpN)} x2="980" y2={yOf(tpN)} stroke="#4ade80" strokeDasharray="5 4" strokeWidth="1.2" />
      )}
      {bars.map((c, i) => {
        const x = 60 + i * w;
        const bull = c.close >= c.open;
        const bodyTop = yOf(Math.max(c.open, c.close));
        const bodyBot = yOf(Math.min(c.open, c.close));
        const h = Math.max(2.2, bodyBot - bodyTop);
        return (
          <g key={c.time} filter="url(#glow)">
            <line x1={x + w * 0.4} y1={yOf(c.high)} x2={x + w * 0.4} y2={yOf(c.low)} stroke={bull ? "url(#wickGreen)" : "url(#wickGrad)"} strokeWidth="1.6" />
            <rect x={x} y={bodyTop} width={Math.max(6, w * 0.72)} height={h} rx="1.5" fill={bull ? "url(#candleGreen)" : "url(#candleRed)"} />
            <rect x={x} y={bodyTop} width={Math.max(2, w * 0.22)} height={h} rx="1.5" fill={bull ? "url(#shineGreen)" : "url(#candleShine)"} opacity="0.4" />
          </g>
        );
      })}
      <text x="990" y={yOf(slN) + 4} fill="#fda4af" fontSize="11">
        SL {sl}
      </text>
      <text x="990" y={yOf(entryN) + 4} fill="#fde68a" fontSize="11">
        IN {entry}
      </text>
      <text x="990" y={yOf(tpN) + 4} fill="#86efac" fontSize="11">
        TP {tp}
      </text>
      <text x="52" y="966" fill="#94a3b8" fontSize="12">
        NOW {price} · {sell ? `SHORT ${entry}` : `LONG ${entry}`}
      </text>
    </g>
  );
}

function OnePoster({ t, quote, candles, source }: { t: Tape; quote?: HomeQuote; candles: Candle[]; source?: string }) {
  const px = quote?.price && quote.price > 0 ? quote.price : candles.at(-1)?.close || t.last || t.entry;
  const pair = labelOf(t.id);
  const date = today();
  const sell = t.side !== "BUY";
  const entry = fmt(t.entry, t.id);
  const sl = fmt(t.sl, t.id);
  const tp = fmt(t.tp, t.id);
  const price = fmt(px, t.id);
  const hi = fmt(Math.max(t.sl, t.entry, px), t.id);
  const lo = fmt(Math.min(t.tp || px, px, t.entry), t.id);

  return (
    <svg viewBox="0 0 1080 1680" className="block h-auto w-full" role="img" aria-label={`${pair} разбор`}>
      <defs>
        <linearGradient id="candleRed" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fecaca" />
          <stop offset="35%" stopColor="#f43f5e" />
          <stop offset="100%" stopColor="#4c0519" />
        </linearGradient>
        <linearGradient id="candleGreen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bbf7d0" />
          <stop offset="35%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#052e16" />
        </linearGradient>
        <linearGradient id="candleShine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff1f2" />
          <stop offset="100%" stopColor="#fb7185" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="shineGreen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ecfdf5" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="wickGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fecdd3" />
          <stop offset="100%" stopColor="#9f1239" />
        </linearGradient>
        <linearGradient id="wickGreen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bbf7d0" />
          <stop offset="100%" stopColor="#166534" />
        </linearGradient>
        <linearGradient id="chartBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#071018" />
          <stop offset="100%" stopColor="#0a0610" />
        </linearGradient>
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="0.8" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="1080" height="1680" fill="#020617" />
      <text x="36" y="56" fill="#e2e8f0" fontSize="28" fontWeight="800">
        {pair} — РАСШИРЕННЫЙ ПОЛНЫЙ РАЗБОР {date}
      </text>
      <text x="36" y="118" fill="#22d3ee" fontSize="56" fontWeight="800">
        ≈ {price}
      </text>
      <rect x="420" y="86" width="150" height="28" rx="14" fill="#155e75" />
      <text x="495" y="106" textAnchor="middle" fill="#a5f3fc" fontSize="12" fontWeight="700">
        CURRENT PRICE
      </text>
      <text x="36" y="146" fill="#64748b" fontSize="12">
        ({date} — диспетчер {t.side === "WAIT" ? "ЖДАТЬ" : t.side === "BUY" ? "ЛОНГ" : "ШОРТ"} · H1 слепок)
      </text>
      <rect x="700" y="70" width="160" height="78" rx="8" fill="#0b1220" stroke="#1e3a5f" />
      <text x="716" y="94" fill="#67e8f9" fontSize="12">
        ATR / H1
      </text>
      <text x="716" y="118" fill="#e2e8f0" fontSize="15" fontWeight="700">
        {candles.length} свечей
      </text>
      <rect x="876" y="70" width="168" height="78" rx="8" fill="#0b1220" stroke="#1e3a5f" />
      <text x="892" y="94" fill={sell ? "#f87171" : "#4ade80"} fontSize="12">
        Bias
      </text>
      <text x="892" y="118" fill="#e2e8f0" fontSize="15" fontWeight="700">
        {sell ? "Медвежий" : "Бычий"}
      </text>

      <rect x="24" y="170" width="250" height="430" rx="10" fill="#041018" stroke="#22d3ee" strokeWidth="2" />
      <text x="40" y="198" fill="#22d3ee" fontSize="13" fontWeight="800">
        1. SMC SMART MONEY
      </text>
      <text x="40" y="250" fill="#67e8f9" fontSize="14" fontWeight="700">
        Demand {tp}
      </text>
      <text x="40" y="306" fill="#fda4af" fontSize="14" fontWeight="700">
        Supply {sl}
      </text>
      <text x="40" y="362" fill="#fda4af" fontSize="13">
        BSL выше {hi}
      </text>
      <text x="40" y="418" fill="#fda4af" fontSize="13">
        SSL ниже {lo}
      </text>

      <rect x="284" y="170" width="250" height="430" rx="10" fill="#10081c" stroke="#a855f7" strokeWidth="2" />
      <text x="300" y="198" fill="#d8b4fe" fontSize="13" fontWeight="800">
        2. ВОЛНЫ ЭЛЛИОТТА
      </text>
      <polyline points="310,260 350,230 400,320 450,280 510,480" fill="none" stroke="#c084fc" strokeWidth="3" />
      <text x="300" y="540" fill="#e9d5ff" fontSize="13">
        цель 5 → {lo}
      </text>

      <rect x="544" y="170" width="250" height="430" rx="10" fill="#1a0b10" stroke="#ef4444" strokeWidth="2" />
      <text x="560" y="198" fill="#fca5a5" fontSize="12" fontWeight="800">
        3. ПАТТЕРНЫ
      </text>
      <text x="560" y="304" fill="#fecaca" fontSize="12">
        канал / triangle / AB=CD
      </text>
      <text x="560" y="340" fill="#fecaca" fontSize="12">
        по слепку H1, не схема
      </text>

      <rect x="804" y="170" width="252" height="430" rx="10" fill="#06140c" stroke="#22c55e" strokeWidth="2" />
      <text x="820" y="198" fill="#86efac" fontSize="12" fontWeight="800">
        4. СЕТАПЫ
      </text>
      <text x="834" y="246" fill="#f87171" fontSize="14" fontWeight="800">
        SHORT {sell ? entry : sl}
      </text>
      <text x="834" y="274" fill="#fecaca" fontSize="13">
        SL {sl} TP {tp}
      </text>
      <text x="834" y="410" fill="#4ade80" fontSize="14" fontWeight="800">
        LONG {t.side === "BUY" ? entry : tp}
      </text>
      <text x="834" y="438" fill="#bbf7d0" fontSize="13">
        SL {lo} TP {hi}
      </text>

      <CandleSnap sell={sell} slN={t.sl} entryN={t.entry} tpN={t.tp} sl={sl} entry={entry} tp={tp} price={price} candles={candles} source={source} />

      <rect x="36" y="1000" width="1008" height="80" rx="8" fill="#071018" stroke="#1e3a5f" />
      <text x="52" y="1034" fill="#67e8f9" fontSize="14" fontWeight="800">
        SHORT · {sell ? entry : sl} / SL {sl} / TP {tp}    LONG · {t.side === "BUY" ? entry : tp} / SL {lo} / TP {hi}
      </text>
      <text x="52" y="1060" fill="#94a3b8" fontSize="12">
        свечи = последние 36 часов пары диспетчера
      </text>
      <text x="540" y="1140" textAnchor="middle" fill="#64748b" fontSize="12">
        РИСК 0.5–1% · НЕ ЯВЛЯЕТСЯ РЕКОМЕНДАЦИЕЙ
      </text>
    </svg>
  );
}

export function HomeFullPoster({ quotes = [] }: { quotes?: HomeQuote[] }) {
  const tape = useQuery({
    queryKey: ["home-signals-poster"],
    queryFn: async () => {
      const res = await fetch("/api/signals.txt", { cache: "no-store" });
      if (!res.ok) throw new Error("tape");
      return parseTape(await res.text());
    },
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
  const lead = tape.data?.length ? pickLead(tape.data, quotes) : null;
  const mkt = useQuery({
    queryKey: ["home-poster-ohlc", lead?.id],
    enabled: Boolean(lead?.id),
    queryFn: () => fetchMarket({ data: { symbol: lead!.id, timeframe: "1h" } }),
    staleTime: 40_000,
    refetchInterval: 60_000,
  });
  const quote = lead ? quotes.find((x) => x.id === lead.id) : undefined;
  const candles = mkt.data?.candles ?? [];
  return (
    <section className="mx-auto max-w-[1100px] px-3 py-4 sm:px-6">
      {lead && candles.length >= 8 ? (
        <OnePoster t={lead} quote={quote} candles={candles} source={mkt.data?.source} />
      ) : (
        <p className="border border-[#12304a] bg-[#020617] px-4 py-10 text-center text-sm text-slate-400">
          {tape.isError || mkt.isError ? "Не удалось снять слепок H1." : "Снимаю актуальный график…"}
        </p>
      )}
    </section>
  );
}
