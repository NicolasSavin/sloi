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
    <svg viewBox="0 0 1080 1480" className="block h-auto w-full" role="img" aria-label={`${pair} полный разбор`}>
      <rect width="1080" height="1480" fill="#07111f" />
      <rect x="24" y="24" width="1032" height="1432" fill="none" stroke="#12304a" strokeWidth="2" />

      <text x="540" y="78" textAnchor="middle" fill="#ffffff" fontSize="36" fontWeight="800" fontFamily="IBM Plex Sans, sans-serif">
        {pair} — ПОЛНЫЙ РАЗБОР {date}
      </text>
      <text x="540" y="108" textAnchor="middle" fill="#3ecbff" fontSize="13" letterSpacing="3" fontFamily="IBM Plex Mono, monospace">
        АНАЛИЗ • СТРУКТУРА • ПАТТЕРНЫ • СЕТАПЫ • УРОВНИ
      </text>
      <text x="540" y="148" textAnchor="middle" fill="#3ecbff" fontSize="12" letterSpacing="4" fontFamily="IBM Plex Mono, monospace">
        ТЕКУЩАЯ ЦЕНА
      </text>
      <text x="540" y="214" textAnchor="middle" fill="#3ecbff" fontSize="72" fontWeight="800" fontFamily="IBM Plex Sans, sans-serif">
        ≈ {price}
      </text>
      <text x="540" y="244" textAnchor="middle" fill="#64748b" fontSize="13" fontFamily="IBM Plex Mono, monospace">
        {side === "WAIT" ? "приказ ЖДАТЬ" : side === "BUY" ? "приказ ЛОНГ" : "приказ ШОРТ"}
      </text>

      {/* column 1 SMC */}
      <rect x="40" y="270" width="320" height="560" rx="8" fill="#081828" stroke="#1ec8e6" strokeWidth="3" />
      <text x="58" y="304" fill="#1ec8e6" fontSize="16" fontWeight="700" fontFamily="IBM Plex Mono, monospace">
        SMC SMART MONEY
      </text>
      <text x="200" y="338" textAnchor="middle" fill="#ff6b6b" fontSize="11" fontFamily="IBM Plex Mono, monospace">
        BUY-SIDE {hi}
      </text>
      <rect x="190" y="348" width="140" height="40" fill="#7a1d28" />
      <text x="260" y="366" textAnchor="middle" fill="#fecaca" fontSize="11">
        SUPPLY
      </text>
      <text x="260" y="382" textAnchor="middle" fill="#fff" fontSize="11">
        {sl}
      </text>
      <polyline
        points="56,430 80,410 104,438 128,400 152,428 176,392 200,420 224,404 248,430 272,412 296,436 320,418"
        fill="none"
        stroke="#cbd5e1"
        strokeWidth="2"
      />
      <rect x="56" y="470" width="150" height="40" fill="#0f4a3a" />
      <text x="131" y="488" textAnchor="middle" fill="#bbf7d0" fontSize="11">
        DEMAND / OB
      </text>
      <text x="131" y="504" textAnchor="middle" fill="#fff" fontSize="11">
        {tp}
      </text>
      <text x="200" y="540" textAnchor="middle" fill="#ff6b6b" fontSize="11" fontFamily="IBM Plex Mono, monospace">
        SELL-SIDE {lo}
      </text>
      <text x="200" y="580" textAnchor="middle" fill="#94a3b8" fontSize="12">
        вход {entry}
      </text>
      <text x="200" y="602" textAnchor="middle" fill="#94a3b8" fontSize="12">
        стоп {sl} · цель {tp}
      </text>
      <text x="200" y="780" textAnchor="middle" fill="#64748b" fontSize="11">
        ликвидность и блоки внутри range
      </text>

      {/* column 2 waves */}
      <rect x="380" y="270" width="320" height="560" rx="8" fill="#12081f" stroke="#8b5cf6" strokeWidth="3" />
      <text x="398" y="304" fill="#c4b5fd" fontSize="16" fontWeight="700" fontFamily="IBM Plex Mono, monospace">
        ВОЛНЫ ЭЛЛИОТТА
      </text>
      <polygon points="410,380 470,330 530,470 590,410 660,720" fill="#5b2ad6" opacity="0.35" />
      <polyline points="410,380 470,330 530,470 590,410 660,720" fill="none" stroke="#c4a4ff" strokeWidth="3" />
      <circle cx="410" cy="380" r="12" fill="#12081f" stroke="#c4a4ff" />
      <text x="410" y="385" textAnchor="middle" fill="#fff" fontSize="12">
        1
      </text>
      <circle cx="470" cy="330" r="12" fill="#12081f" stroke="#c4a4ff" />
      <text x="470" y="335" textAnchor="middle" fill="#fff" fontSize="12">
        2
      </text>
      <circle cx="530" cy="470" r="12" fill="#12081f" stroke="#c4a4ff" />
      <text x="530" y="475" textAnchor="middle" fill="#fff" fontSize="12">
        3
      </text>
      <circle cx="590" cy="410" r="12" fill="#12081f" stroke="#c4a4ff" />
      <text x="590" y="415" textAnchor="middle" fill="#fff" fontSize="12">
        4
      </text>
      <circle cx="660" cy="720" r="12" fill="#12081f" stroke="#c4a4ff" />
      <text x="660" y="725" textAnchor="middle" fill="#fff" fontSize="12">
        5
      </text>
      <text x="470" y="318" fill="#e9d5ff" fontSize="11">
        {hi}
      </text>
      <text x="590" y="398" fill="#e9d5ff" fontSize="11">
        {mid}
      </text>
      <text x="540" y="800" textAnchor="middle" fill="#94a3b8" fontSize="12">
        цель 5 → {lo}
      </text>

      {/* column 3 patterns */}
      <rect x="720" y="270" width="320" height="560" rx="8" fill="#1a1206" stroke="#f59e0b" strokeWidth="3" />
      <text x="738" y="304" fill="#fbbf24" fontSize="16" fontWeight="700" fontFamily="IBM Plex Mono, monospace">
        ПАТТЕРНЫ
      </text>
      <text x="738" y="334" fill="#fbbf24" fontSize="12">
        ГРАФИЧЕСКИЕ
      </text>
      <path d="M740 360 L1000 380 L1000 420 L740 400 Z" fill="none" stroke="#ef4444" strokeWidth="2" />
      <polyline points="750,392 780,378 810,388 840,368 870,384 900,370 930,382" fill="none" stroke="#cbd5e1" strokeWidth="2" />
      <text x="740" y="450" fill="#e2e8f0" fontSize="13">
        канал / range
      </text>

      <polyline points="740,500 770,540 800,498 830,540 860,500" fill="none" stroke="#cbd5e1" strokeWidth="2" />
      <line x1="740" y1="492" x2="860" y2="492" stroke="#22c55e" strokeDasharray="4 3" />
      <text x="880" y="520" fill="#e2e8f0" fontSize="13">
        double bottom
      </text>

      <line x1="740" y1="580" x2="900" y2="590" stroke="#ef4444" strokeWidth="2" />
      <line x1="740" y1="640" x2="900" y2="600" stroke="#ef4444" strokeWidth="2" />
      <polyline points="750,620 780,608 810,616 840,600 870,612" fill="none" stroke="#cbd5e1" strokeWidth="2" />
      <text x="740" y="668" fill="#e2e8f0" fontSize="13">
        triangle
      </text>

      <text x="738" y="704" fill="#f472b6" fontSize="12">
        ГАРМОНИЧЕСКИЕ
      </text>
      <polyline points="740,740 780,720 820,748 860,728" fill="none" stroke="#60a5fa" strokeWidth="2" />
      <text x="880" y="738" fill="#93c5fd" fontSize="12">
        AB=CD
      </text>
      <polyline points="740,790 780,770 820,798 860,778" fill="none" stroke="#fb7185" strokeWidth="2" />
      <text x="880" y="790" fill="#fda4af" fontSize="12">
        crab / fly
      </text>

      {/* bottom ATR + setups */}
      <rect x="40" y="850" width="500" height="360" rx="8" fill="#081828" stroke="#1ec8e6" strokeWidth="3" />
      <text x="58" y="884" fill="#fbbf24" fontSize="16" fontWeight="700" fontFamily="IBM Plex Mono, monospace">
        ATR + СЕТАПЫ
      </text>
      {[18, 22, 16, 28, 24, 34, 30, 42, 36, 48].map((h, i) => (
        <rect key={i} x={58 + i * 16} y={980 - h} width="12" height={h} fill="#f59e0b" />
      ))}
      <text x="58" y="1000" fill="#fbbf24" fontSize="12">
        DAILY ATR
      </text>

      <rect x="250" y="920" width="130" height="160" rx="6" fill="#2a1014" stroke="#ef4444" />
      <text x="315" y="948" textAnchor="middle" fill="#f87171" fontSize="13" fontWeight="700">
        SHORT
      </text>
      <text x="315" y="978" textAnchor="middle" fill="#e2e8f0" fontSize="12">
        {side === "SELL" ? entry : sl}
      </text>
      <text x="315" y="1000" textAnchor="middle" fill="#94a3b8" fontSize="11">
        SL {side === "SELL" ? sl : hi}
      </text>
      <text x="315" y="1022" textAnchor="middle" fill="#94a3b8" fontSize="11">
        TP {side === "SELL" ? tp : lo}
      </text>

      <rect x="390" y="920" width="130" height="160" rx="6" fill="#0d2a18" stroke="#22c55e" />
      <text x="455" y="948" textAnchor="middle" fill="#4ade80" fontSize="13" fontWeight="700">
        LONG
      </text>
      <text x="455" y="978" textAnchor="middle" fill="#e2e8f0" fontSize="12">
        {side === "BUY" ? entry : tp}
      </text>
      <text x="455" y="1000" textAnchor="middle" fill="#94a3b8" fontSize="11">
        SL {lo}
      </text>
      <text x="455" y="1022" textAnchor="middle" fill="#94a3b8" fontSize="11">
        TP {hi}
      </text>

      {/* levels */}
      <rect x="560" y="850" width="480" height="360" rx="8" fill="#081828" stroke="#1ec8e6" strokeWidth="3" />
      <text x="578" y="884" fill="#1ec8e6" fontSize="16" fontWeight="700" fontFamily="IBM Plex Mono, monospace">
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
          <rect x="578" y={910 + i * 48} width="150" height="32" rx="4" fill={String(col)} />
          <text x="653" y={932 + i * 48} textAnchor="middle" fill="#fff" fontSize="13" fontFamily="IBM Plex Mono, monospace">
            {val}
          </text>
          <text x="748" y={932 + i * 48} fill="#cbd5e1" fontSize="14">
            {name}
          </text>
        </g>
      ))}

      <text x="540" y="1260" textAnchor="middle" fill="#3ecbff" fontSize="13" letterSpacing="2" fontFamily="IBM Plex Mono, monospace">
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
