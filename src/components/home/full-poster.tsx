import { useQuery } from "@tanstack/react-query";
import { fetchMarket } from "@/lib/market/fetch";
import { detectPatterns } from "@/lib/smc/patterns";
import { analyzeMarket, type Swing } from "@/lib/smc/engine";
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

function swingsOf(bars: Candle[]): Swing[] {
  const out: Swing[] = [];
  for (let i = 2; i < bars.length - 2; i++) {
    const c = bars[i]!;
    const l = bars.slice(i - 2, i + 3);
    if (l.every((x) => c.high >= x.high)) out.push({ index: i, time: c.time, price: c.high, type: "high" });
    if (l.every((x) => c.low <= x.low)) out.push({ index: i, time: c.time, price: c.low, type: "low" });
  }
  return out;
}

function atrOf(bars: Candle[]) {
  const n = Math.min(14, bars.length);
  if (n < 2) return 1;
  let s = 0;
  for (let i = bars.length - n; i < bars.length; i++) {
    const c = bars[i]!;
    const p = bars[i - 1] ?? c;
    s += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  return s / n;
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
  const bars = candles.slice(-48);
  const snap = analyzeMarket(candles);
  const swings = swingsOf(bars);
  const hits = detectPatterns(swings, atrOf(bars), bars);
  const obs = snap.orderBlocks.filter((z) => !z.mitigated).slice(-4);
  const fvgs = snap.fvgs.filter((z) => !z.mitigated).slice(-4);
  const liq = snap.liquidity.slice(-6);
  const evs = snap.events.slice(-3);
  const highs = bars.map((c) => c.high);
  const lows = bars.map((c) => c.low);
  const extra = [
    slN,
    entryN,
    tpN,
    ...obs.flatMap((z) => [z.top, z.bottom]),
    ...fvgs.flatMap((z) => [z.top, z.bottom]),
    ...liq.map((l) => l.price),
  ].filter((n) => Number.isFinite(n) && n > 0);
  const max = Math.max(...highs, ...extra);
  const min = Math.min(...lows, ...extra.filter((n) => n > 0));
  const pad = (max - min) * 0.1 || 1;
  const topP = max + pad;
  const botP = min - pad;
  const y0 = 392;
  const y1 = 678;
  const yOf = (p: number) => y0 + ((topP - p) / (topP - botP || 1)) * (y1 - y0);
  const w = bars.length ? Math.min(18, 900 / bars.length) : 14;
  const xOf = (time: number) => {
    const i = bars.findIndex((c) => c.time >= time);
    return 60 + Math.max(0, i < 0 ? bars.length - 1 : i) * w;
  };
  const sh = swings.filter((s) => s.type === "high").slice(-3);
  const slw = swings.filter((s) => s.type === "low").slice(-3);

  return (
    <g>
      <rect x="36" y="348" width="1008" height="360" rx="10" fill="url(#chartBg)" stroke="#1e3a5f" strokeWidth="2" />
      <text x="52" y="372" fill="#67e8f9" fontSize="13" fontWeight="700">
        SMC H1 · {source === "demo" ? "резерв" : source ?? "live"} · OB / FVG / BSL-SSL / BOS
      </text>
      {obs.map((z) => {
        const x = xOf(z.startTime);
        const y = yOf(z.top);
        const h = Math.max(6, yOf(z.bottom) - yOf(z.top));
        const bull = z.side === "bull";
        return (
          <g key={z.id}>
            <rect x={x} y={y} width={Math.max(40, 980 - x)} height={h} fill={bull ? "#14532d" : "#7f1d1d"} opacity="0.35" />
            <text x={x + 6} y={y + 12} fill={bull ? "#86efac" : "#fecaca"} fontSize="10" fontWeight="700">
              {bull ? "DEMAND OB" : "SUPPLY OB"}
            </text>
          </g>
        );
      })}
      {fvgs.map((z) => {
        const x = xOf(z.startTime);
        const y = yOf(z.top);
        const h = Math.max(4, yOf(z.bottom) - yOf(z.top));
        return (
          <g key={z.id}>
            <rect x={x} y={y} width={Math.max(28, 980 - x)} height={h} fill="#38bdf8" opacity="0.22" />
            <text x={x + 6} y={y + 11} fill="#7dd3fc" fontSize="10">
              FVG {z.side === "bull" ? "бык" : "медв"}
            </text>
          </g>
        );
      })}
      {liq.map((l, i) => (
        <g key={`${l.side}-${l.time}-${i}`}>
          <line x1="60" y1={yOf(l.price)} x2="980" y2={yOf(l.price)} stroke={l.side === "buy" ? "#fb7185" : "#f472b6"} strokeDasharray="2 3" strokeWidth="1" opacity="0.7" />
          <text x="62" y={yOf(l.price) - 3} fill="#fda4af" fontSize="10">
            {l.side === "buy" ? "BSL" : "SSL"}
            {l.swept ? " swept" : ""}
          </text>
        </g>
      ))}
      {sh.length >= 2 && <polyline points={sh.map((s) => `${xOf(s.time)},${yOf(s.price)}`).join(" ")} fill="none" stroke="#ef4444" strokeWidth="1.4" />}
      {slw.length >= 2 && <polyline points={slw.map((s) => `${xOf(s.time)},${yOf(s.price)}`).join(" ")} fill="none" stroke="#22c55e" strokeWidth="1.4" />}
      {Number.isFinite(slN) && slN > 0 && <line x1="60" y1={yOf(slN)} x2="980" y2={yOf(slN)} stroke="#fb7185" strokeDasharray="5 4" />}
      {Number.isFinite(entryN) && entryN > 0 && <line x1="60" y1={yOf(entryN)} x2="980" y2={yOf(entryN)} stroke="#fbbf24" strokeDasharray="4 4" />}
      {Number.isFinite(tpN) && tpN > 0 && <line x1="60" y1={yOf(tpN)} x2="980" y2={yOf(tpN)} stroke="#4ade80" strokeDasharray="5 4" />}
      {bars.map((c, i) => {
        const x = 60 + i * w;
        const bull = c.close >= c.open;
        const bodyTop = yOf(Math.max(c.open, c.close));
        const bodyBot = yOf(Math.min(c.open, c.close));
        const h = Math.max(2.2, bodyBot - bodyTop);
        return (
          <g key={c.time}>
            <line x1={x + w * 0.4} y1={yOf(c.high)} x2={x + w * 0.4} y2={yOf(c.low)} stroke={bull ? "url(#wickGreen)" : "url(#wickGrad)"} strokeWidth="1.4" />
            <rect x={x} y={bodyTop} width={Math.max(5, w * 0.7)} height={h} rx="1.2" fill={bull ? "url(#candleGreen)" : "url(#candleRed)"} />
          </g>
        );
      })}
      {evs.map((e) => (
        <g key={`${e.kind}-${e.time}`}>
          <circle cx={xOf(e.time)} cy={yOf(e.price)} r="5" fill={e.side === "bull" ? "#22c55e" : "#ef4444"} stroke="#fff" />
          <text x={xOf(e.time) + 8} y={yOf(e.price) - 6} fill="#e2e8f0" fontSize="11" fontWeight="700">
            {e.kind}
          </text>
        </g>
      ))}
      {hits.map((hit) => (
        <g key={hit.id}>
          <polyline
            points={hit.points.map((p) => `${xOf(p.time)},${yOf(p.price)}`).join(" ")}
            fill="none"
            stroke={hit.family === "harmonic" ? "#c084fc" : hit.side === "bear" ? "#fb7185" : "#38bdf8"}
            strokeWidth="1.8"
          />
          <text x={xOf(hit.points.at(-1)!.time)} y={yOf(hit.points.at(-1)!.price) + 14} fill="#fde68a" fontSize="10">
            {hit.name}
          </text>
        </g>
      ))}
      <text x="52" y="696" fill="#94a3b8" fontSize="12">
        NOW {price} · {sell ? `SHORT ${entry}` : `LONG ${entry}`} · OB {obs.length} · FVG {fvgs.length} · {evs.at(-1)?.kind ?? "—"}
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
  const snap = analyzeMarket(candles);
  const liveOb = snap.orderBlocks.filter((z) => !z.mitigated).slice(-2);
  const liveFvg = snap.fvgs.filter((z) => !z.mitigated).slice(-2);
  const hits = detectPatterns(swingsOf(candles.slice(-48)), atrOf(candles.slice(-48)), candles.slice(-48));

  return (
    <svg viewBox="0 0 1080 860" className="block h-auto w-full" role="img" aria-label={`${pair} разбор`}>
      <defs>
        <linearGradient id="candleRed" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fecaca" />
          <stop offset="40%" stopColor="#f43f5e" />
          <stop offset="100%" stopColor="#4c0519" />
        </linearGradient>
        <linearGradient id="candleGreen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bbf7d0" />
          <stop offset="40%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#052e16" />
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
      </defs>
      <rect width="1080" height="860" fill="#020617" />
      <text x="36" y="42" fill="#e2e8f0" fontSize="24" fontWeight="800">
        {pair} — ПОЛНЫЙ РАЗБОР {date}
      </text>
      <text x="36" y="86" fill="#22d3ee" fontSize="36" fontWeight="800">
        ≈ {price}
      </text>
      <text x="320" y="82" fill="#64748b" fontSize="12">
        {t.side === "WAIT" ? "ЖДАТЬ" : t.side === "BUY" ? "ЛОНГ" : "ШОРТ"} · H1 SMC
      </text>

      <rect x="24" y="108" width="250" height="220" rx="8" fill="#041018" stroke="#22d3ee" strokeWidth="2" />
      <text x="40" y="132" fill="#22d3ee" fontSize="13" fontWeight="800">
        1. SMC на графике
      </text>
      <text x="40" y="158" fill="#fda4af" fontSize="12">
        OB {liveOb.length} · FVG {liveFvg.length}
      </text>
      {liveOb.slice(0, 2).map((z, i) => (
        <text key={z.id} x="40" y={182 + i * 20} fill={z.side === "bull" ? "#86efac" : "#fecaca"} fontSize="12">
          {z.side === "bull" ? "Demand" : "Supply"} {fmt(z.bottom, t.id)}-{fmt(z.top, t.id)}
        </text>
      ))}
      <text x="40" y="248" fill="#94a3b8" fontSize="12">
        {snap.events.at(-1)?.kind ?? "—"} {snap.bias}
      </text>
      <text x="40" y="272" fill="#64748b" fontSize="11">
        зоны стола, не шаблон
      </text>

      <rect x="284" y="108" width="250" height="220" rx="8" fill="#10081c" stroke="#a855f7" strokeWidth="2" />
      <text x="300" y="132" fill="#d8b4fe" fontSize="13" fontWeight="800">
        2. СВИНГИ
      </text>
      <text x="300" y="164" fill="#e9d5ff" fontSize="13">
        красная — хаи / BSL
      </text>
      <text x="300" y="188" fill="#e9d5ff" fontSize="13">
        зелёная — лои / SSL
      </text>

      <rect x="544" y="108" width="250" height="220" rx="8" fill="#1a0b10" stroke="#ef4444" strokeWidth="2" />
      <text x="560" y="132" fill="#fca5a5" fontSize="12" fontWeight="800">
        3. ПАТТЕРНЫ
      </text>
      {hits.length ? (
        hits.slice(0, 4).map((h, i) => (
          <text key={h.id} x="560" y={160 + i * 22} fill="#fecaca" fontSize="13">
            {h.name}
          </text>
        ))
      ) : (
        <text x="560" y="168" fill="#fecaca" fontSize="13">
          чистый range
        </text>
      )}

      <rect x="804" y="108" width="252" height="220" rx="8" fill="#06140c" stroke="#22c55e" strokeWidth="2" />
      <text x="820" y="132" fill="#86efac" fontSize="12" fontWeight="800">
        4. СЕТАП
      </text>
      <text x="820" y="164" fill="#f87171" fontSize="14" fontWeight="800">
        SHORT {sell ? entry : sl}
      </text>
      <text x="820" y="188" fill="#fecaca" fontSize="13">
        SL {sl} · TP {tp}
      </text>
      <text x="820" y="224" fill="#4ade80" fontSize="14" fontWeight="800">
        LONG {t.side === "BUY" ? entry : tp}
      </text>

      <CandleSnap sell={sell} slN={t.sl} entryN={t.entry} tpN={t.tp} sl={sl} entry={entry} tp={tp} price={price} candles={candles} source={source} />

      <text x="52" y="740" fill="#94a3b8" fontSize="13">
        {hits[0]?.because ?? "OB/FVG/BSL с того же H1, что у диспетчера."}
      </text>
      <text x="540" y="780" textAnchor="middle" fill="#64748b" fontSize="12">
        НЕ ЯВЛЯЕТСЯ РЕКОМЕНДАЦИЕЙ
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
