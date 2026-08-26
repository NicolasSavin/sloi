import { useQuery } from "@tanstack/react-query";
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
    const liveA = a.side === "WAIT" ? 0 : 2;
    const liveB = b.side === "WAIT" ? 0 : 2;
    return liveB - liveA || Math.abs(qb?.changePct ?? 0) - Math.abs(qa?.changePct ?? 0);
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
  if (id.length === 6) return `${id.slice(0, 3)}/${id.slice(3)}`;
  return id;
}

function today() {
  const d = new Date();
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}

function StaticChart({
  side,
  sl,
  entry,
  tp,
  price,
}: {
  side: Tape["side"];
  sl: string;
  entry: string;
  tp: string;
  price: string;
}) {
  const sell = side !== "BUY";
  return (
    <g>
      <rect x="40" y="258" width="1000" height="280" rx="8" fill="#081018" stroke="#1ec8e6" strokeWidth="2" />
      <text x="56" y="280" fill="#3ecbff" fontSize="13" fontFamily="IBM Plex Mono, monospace" letterSpacing="2">
        СТАТИЧНЫЙ ГРАФИК · ЗОНЫ · СТРЕЛКИ
      </text>

      {/* BSL */}
      <text x="520" y="298" textAnchor="middle" fill="#fb7185" fontSize="11" fontFamily="IBM Plex Mono, monospace">
        BUY-SIDE LIQUIDITY {sl}
      </text>

      {/* supply zone */}
      <rect x="520" y="306" width="360" height="36" fill="#7f1d1d" opacity="0.85" />
      <text x="700" y="322" textAnchor="middle" fill="#fecaca" fontSize="12" fontWeight="700">
        SUPPLY / OB
      </text>
      <text x="700" y="336" textAnchor="middle" fill="#fff" fontSize="11">
        {sl}
      </text>

      {/* dashed levels */}
      <line x1="70" y1="324" x2="1010" y2="324" stroke="#ef4444" strokeDasharray="5 4" strokeWidth="1.2" />
      <line x1="70" y1="390" x2="1010" y2="390" stroke="#fbbf24" strokeDasharray="4 4" strokeWidth="1.2" />
      <line x1="70" y1="456" x2="1010" y2="456" stroke="#22c55e" strokeDasharray="5 4" strokeWidth="1.2" />

      {/* price path */}
      <polyline
        points="80,430 140,400 200,418 260,360 320,388 380,340 440,368 500,330 560,350 620,318 680,370 740,348 800,400 860,380 920,420 980,400"
        fill="none"
        stroke="#e2e8f0"
        strokeWidth="2.4"
      />

      {/* current price marker */}
      <circle cx="800" cy="400" r="6" fill="#3ecbff" />
      <text x="814" y="396" fill="#3ecbff" fontSize="12" fontWeight="700">
        NOW {price}
      </text>

      {/* demand zone */}
      <rect x="80" y="448" width="280" height="36" fill="#14532d" opacity="0.9" />
      <text x="220" y="464" textAnchor="middle" fill="#bbf7d0" fontSize="12" fontWeight="700">
        DEMAND / OB
      </text>
      <text x="220" y="478" textAnchor="middle" fill="#fff" fontSize="11">
        {tp}
      </text>

      <text x="520" y="528" textAnchor="middle" fill="#fb7185" fontSize="11" fontFamily="IBM Plex Mono, monospace">
        SELL-SIDE LIQUIDITY {tp}
      </text>

      {/* arrows */}
      {sell ? (
        <g>
          <path d="M500 350 L500 440" stroke="#ef4444" strokeWidth="2.4" markerEnd="url(#arrRed)" />
          <text x="510" y="400" fill="#f87171" fontSize="12" fontWeight="700">
            шорт {entry}
          </text>
          <path d="M860 400 L860 456" stroke="#22c55e" strokeWidth="2" markerEnd="url(#arrGreen)" />
          <text x="872" y="430" fill="#86efac" fontSize="11">
            TP {tp}
          </text>
          <path d="M620 318 L620 306" stroke="#fbbf24" strokeWidth="2" markerEnd="url(#arrGold)" />
          <text x="628" y="302" fill="#fde68a" fontSize="11">
            SL {sl}
          </text>
        </g>
      ) : (
        <g>
          <path d="M500 430 L500 350" stroke="#22c55e" strokeWidth="2.4" markerEnd="url(#arrGreen)" />
          <text x="510" y="390" fill="#86efac" fontSize="12" fontWeight="700">
            лонг {entry}
          </text>
          <path d="M860 400 L860 324" stroke="#22c55e" strokeWidth="2" markerEnd="url(#arrGreen)" />
          <text x="872" y="360" fill="#86efac" fontSize="11">
            TP {sl}
          </text>
        </g>
      )}

      <text x="70" y="392" fill="#fbbf24" fontSize="11">
        ENTRY {entry}
      </text>
      <text x="70" y="458" fill="#4ade80" fontSize="11">
        TARGET
      </text>
    </g>
  );
}

function OnePoster({ t, quote }: { t: Tape; quote?: HomeQuote }) {
  const px = quote?.price && quote.price > 0 ? quote.price : t.last || t.entry;
  const pair = labelOf(t.id);
  const date = today();
  const side = t.side;
  const entry = fmt(t.entry, t.id);
  const sl = fmt(t.sl, t.id);
  const tp = fmt(t.tp, t.id);
  const price = fmt(px, t.id);
  const hi = fmt(Math.max(t.sl, t.entry, px), t.id);
  const lo = fmt(Math.min(t.tp || px, px, t.entry), t.id);
  const mid = fmt((t.entry + (t.tp || t.entry)) / 2, t.id);

  return (
    <svg viewBox="0 0 1080 1760" className="block h-auto w-full" role="img" aria-label={`${pair} полный разбор`}>
      <defs>
        <marker id="arrRed" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="#ef4444" />
        </marker>
        <marker id="arrGreen" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="#22c55e" />
        </marker>
        <marker id="arrGold" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="#fbbf24" />
        </marker>
      </defs>
      <rect width="1080" height="1760" fill="#07111f" />
      <rect x="24" y="24" width="1032" height="1712" fill="none" stroke="#12304a" strokeWidth="2" />

      <text x="540" y="70" textAnchor="middle" fill="#ffffff" fontSize="34" fontWeight="800" fontFamily="IBM Plex Sans, sans-serif">
        {pair} — ПОЛНЫЙ РАЗБОР {date}
      </text>
      <text x="540" y="98" textAnchor="middle" fill="#3ecbff" fontSize="13" letterSpacing="3" fontFamily="IBM Plex Mono, monospace">
        АНАЛИЗ • СТРУКТУРА • ПАТТЕРНЫ • СЕТАПЫ • УРОВНИ
      </text>
      <text x="540" y="128" textAnchor="middle" fill="#3ecbff" fontSize="12" letterSpacing="4" fontFamily="IBM Plex Mono, monospace">
        ТЕКУЩАЯ ЦЕНА
      </text>
      <text x="540" y="188" textAnchor="middle" fill="#3ecbff" fontSize="64" fontWeight="800" fontFamily="IBM Plex Sans, sans-serif">
        ≈ {price}
      </text>
      <text x="540" y="218" textAnchor="middle" fill="#64748b" fontSize="13" fontFamily="IBM Plex Mono, monospace">
        {side === "WAIT" ? "приказ ЖДАТЬ" : side === "BUY" ? "приказ ЛОНГ" : "приказ ШОРТ"}
      </text>

      <StaticChart side={side} sl={sl} entry={entry} tp={tp} price={price} />

      <rect x="40" y="556" width="320" height="500" rx="8" fill="#081828" stroke="#1ec8e6" strokeWidth="3" />
      <text x="58" y="588" fill="#1ec8e6" fontSize="16" fontWeight="700" fontFamily="IBM Plex Mono, monospace">
        SMC SMART MONEY
      </text>
      <text x="200" y="624" textAnchor="middle" fill="#ff6b6b" fontSize="11">
        BSL {hi}
      </text>
      <rect x="170" y="634" width="140" height="36" fill="#7a1d28" />
      <text x="240" y="656" textAnchor="middle" fill="#fff" fontSize="12">
        SUPPLY {sl}
      </text>
      <polyline points="56,710 90,690 124,718 158,678 192,708 226,668 260,698 294,680" fill="none" stroke="#cbd5e1" strokeWidth="2" />
      <rect x="56" y="740" width="150" height="36" fill="#0f4a3a" />
      <text x="131" y="762" textAnchor="middle" fill="#fff" fontSize="12">
        DEMAND {tp}
      </text>
      <text x="200" y="808" textAnchor="middle" fill="#ff6b6b" fontSize="11">
        SSL {lo}
      </text>
      <text x="200" y="860" textAnchor="middle" fill="#94a3b8" fontSize="13">
        вход {entry}
      </text>
      <text x="200" y="882" textAnchor="middle" fill="#94a3b8" fontSize="13">
        SL {sl} · TP {tp}
      </text>

      <rect x="380" y="556" width="320" height="500" rx="8" fill="#12081f" stroke="#8b5cf6" strokeWidth="3" />
      <text x="398" y="588" fill="#c4b5fd" fontSize="16" fontWeight="700" fontFamily="IBM Plex Mono, monospace">
        ВОЛНЫ ЭЛЛИОТТА
      </text>
      <polygon points="410,650 470,600 530,740 590,680 660,980" fill="#5b2ad6" opacity="0.35" />
      <polyline points="410,650 470,600 530,740 590,680 660,980" fill="none" stroke="#c4a4ff" strokeWidth="3" />
      {[
        [410, 650, "1"],
        [470, 600, "2"],
        [530, 740, "3"],
        [590, 680, "4"],
        [660, 980, "5"],
      ].map(([x, y, n]) => (
        <g key={String(n)}>
          <circle cx={x as number} cy={y as number} r="12" fill="#12081f" stroke="#c4a4ff" />
          <text x={x as number} y={(y as number) + 5} textAnchor="middle" fill="#fff" fontSize="12">
            {n}
          </text>
        </g>
      ))}
      <text x="470" y="588" fill="#e9d5ff" fontSize="11">
        {hi}
      </text>
      <text x="540" y="1028" textAnchor="middle" fill="#94a3b8" fontSize="12">
        цель 5 → {lo} · mid {mid}
      </text>

      <rect x="720" y="556" width="320" height="500" rx="8" fill="#1a1206" stroke="#f59e0b" strokeWidth="3" />
      <text x="738" y="588" fill="#fbbf24" fontSize="16" fontWeight="700" fontFamily="IBM Plex Mono, monospace">
        ПАТТЕРНЫ
      </text>
      <path d="M740 620 L1000 640 L1000 680 L740 660 Z" fill="none" stroke="#ef4444" strokeWidth="2" />
      <polyline points="750,652 790,638 830,648 870,628 910,644" fill="none" stroke="#cbd5e1" strokeWidth="2" />
      <text x="740" y="710" fill="#e2e8f0" fontSize="13">
        канал / range
      </text>
      <polyline points="740,760 770,800 800,758 830,800 860,760" fill="none" stroke="#cbd5e1" strokeWidth="2" />
      <line x1="740" y1="752" x2="860" y2="752" stroke="#22c55e" strokeDasharray="4 3" />
      <text x="880" y="780" fill="#e2e8f0" fontSize="13">
        double bottom
      </text>
      <line x1="740" y1="840" x2="900" y2="850" stroke="#ef4444" strokeWidth="2" />
      <line x1="740" y1="900" x2="900" y2="860" stroke="#ef4444" strokeWidth="2" />
      <text x="740" y="928" fill="#e2e8f0" fontSize="13">
        triangle
      </text>
      <polyline points="740,970 780,950 820,978 860,958" fill="none" stroke="#60a5fa" strokeWidth="2" />
      <text x="880" y="968" fill="#93c5fd" fontSize="12">
        AB=CD
      </text>

      <rect x="40" y="1076" width="500" height="360" rx="8" fill="#081828" stroke="#1ec8e6" strokeWidth="3" />
      <text x="58" y="1110" fill="#fbbf24" fontSize="16" fontWeight="700" fontFamily="IBM Plex Mono, monospace">
        ATR + СЕТАПЫ
      </text>
      {[18, 22, 16, 28, 24, 34, 30, 42, 36, 48].map((h, i) => (
        <rect key={i} x={58 + i * 16} y={1206 - h} width="12" height={h} fill="#f59e0b" />
      ))}
      <rect x="250" y="1146" width="130" height="160" rx="6" fill="#2a1014" stroke="#ef4444" />
      <text x="315" y="1174" textAnchor="middle" fill="#f87171" fontSize="13" fontWeight="700">
        SHORT
      </text>
      <text x="315" y="1204" textAnchor="middle" fill="#e2e8f0" fontSize="12">
        {side === "SELL" ? entry : sl}
      </text>
      <text x="315" y="1226" textAnchor="middle" fill="#94a3b8" fontSize="11">
        SL {side === "SELL" ? sl : hi}
      </text>
      <text x="315" y="1248" textAnchor="middle" fill="#94a3b8" fontSize="11">
        TP {side === "SELL" ? tp : lo}
      </text>
      <rect x="390" y="1146" width="130" height="160" rx="6" fill="#0d2a18" stroke="#22c55e" />
      <text x="455" y="1174" textAnchor="middle" fill="#4ade80" fontSize="13" fontWeight="700">
        LONG
      </text>
      <text x="455" y="1204" textAnchor="middle" fill="#e2e8f0" fontSize="12">
        {side === "BUY" ? entry : tp}
      </text>
      <text x="455" y="1226" textAnchor="middle" fill="#94a3b8" fontSize="11">
        SL {lo}
      </text>
      <text x="455" y="1248" textAnchor="middle" fill="#94a3b8" fontSize="11">
        TP {hi}
      </text>

      <rect x="560" y="1076" width="480" height="360" rx="8" fill="#081828" stroke="#1ec8e6" strokeWidth="3" />
      <text x="578" y="1110" fill="#1ec8e6" fontSize="16" fontWeight="700" fontFamily="IBM Plex Mono, monospace">
        КЛЮЧЕВЫЕ УРОВНИ
      </text>
      {[
        [hi, "Resistance / supply", "#1d4ed8"],
        [sl, "Stop / инвалидация", "#7c3aed"],
        [price, "Current", "#0ea5e9"],
        [entry, "Entry", "#0369a1"],
        [tp, "Target / SSL", "#6d28d9"],
      ].map(([val, name, col], i) => (
        <g key={String(name)}>
          <rect x="578" y={1136 + i * 48} width="150" height="32" rx="4" fill={String(col)} />
          <text x="653" y={1158 + i * 48} textAnchor="middle" fill="#fff" fontSize="13" fontFamily="IBM Plex Mono, monospace">
            {val}
          </text>
          <text x="748" y={1158 + i * 48} fill="#cbd5e1" fontSize="14">
            {name}
          </text>
        </g>
      ))}

      <text x="540" y="1490" textAnchor="middle" fill="#3ecbff" fontSize="13" letterSpacing="2" fontFamily="IBM Plex Mono, monospace">
        SMC + ELLIOTT + PATTERNS + ATR · НЕ ЯВЛЯЕТСЯ РЕКОМЕНДАЦИЕЙ
      </text>
    </svg>
  );
}

export function HomeFullPoster({ quotes = [] }: { quotes?: HomeQuote[] }) {
  const q = useQuery({
    queryKey: ["home-signals-poster"],
    queryFn: async () => {
      const res = await fetch("/api/signals.txt", { cache: "no-store" });
      if (!res.ok) throw new Error("tape");
      return parseTape(await res.text());
    },
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const lead = q.data?.length ? pickLead(q.data, quotes) : null;
  const quote = lead ? quotes.find((x) => x.id === lead.id) : undefined;

  return (
    <section className="mx-auto max-w-[1100px] px-3 py-4 sm:px-6">
      {lead ? (
        <OnePoster t={lead} quote={quote} />
      ) : (
        <p className="border border-[#12304a] bg-[#07111f] px-4 py-10 text-center text-sm text-slate-400">
          {q.isError ? "Лента сигналов не ответила." : "Собираю постер…"}
        </p>
      )}
    </section>
  );
}
