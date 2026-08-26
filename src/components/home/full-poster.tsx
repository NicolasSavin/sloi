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

function CandleSnap({ sell, sl, entry, tp, price }: { sell: boolean; sl: string; entry: string; tp: string; price: string }) {
  const bars = [
    [1, 42, 18, 8],
    [0, 38, 22, 12],
    [1, 48, 16, 6],
    [1, 36, 20, 10],
    [0, 44, 14, 8],
    [1, 52, 18, 4],
    [1, 40, 22, 10],
    [0, 34, 16, 8],
    [1, 46, 20, 6],
    [1, 32, 18, 9],
    [0, 38, 14, 7],
    [1, 28, 16, 8],
    [1, 36, 12, 5],
    [0, 30, 18, 9],
    [1, 24, 14, 6],
    [1, 34, 16, 8],
    [0, 22, 12, 5],
    [1, 28, 18, 7],
    [1, 20, 14, 6],
    [0, 26, 10, 4],
    [1, 18, 12, 5],
    [1, 22, 16, 7],
  ];
  return (
    <g>
      <rect x="36" y="620" width="1008" height="360" rx="10" fill="#071018" stroke="#1a3a55" strokeWidth="2" />
      <text x="52" y="646" fill="#22d3ee" fontSize="14" fontWeight="700" letterSpacing="1.2">
        ГРАФИЧЕСКИЕ + ГАРМОНИЧЕСКИЕ ПАТТЕРНЫ (ПОЯСНЕНИЯ НА ГРАФИКЕ)
      </text>
      {/* descending channel */}
      <path d="M70 690 L760 780 L760 840 L70 750 Z" fill="rgba(239,68,68,0.08)" stroke="#ef4444" strokeWidth="2" />
      <text x="86" y="708" fill="#f87171" fontSize="13" fontWeight="700">
        Нисходящий канал / Expanding Range
      </text>
      <text x="520" y="768" fill="#38bdf8" fontSize="12">
        Descending Triangle
      </text>
      {/* candles */}
      {bars.map(([dn, body, wickU, wickD], i) => {
        const x = 80 + i * 28;
        const base = 820 - i * 4;
        const top = base - body;
        const color = dn ? "#ef4444" : "#22c55e";
        return (
          <g key={i}>
            <line x1={x + 5} y1={top - wickU} x2={x + 5} y2={base + wickD} stroke={color} strokeWidth="1.4" />
            <rect x={x} y={top} width="10" height={Math.max(body, 4)} fill={color} />
          </g>
        );
      })}
      <text x="700" y="700" fill="#fbbf24" fontSize="12" fontWeight="700">
        Supply {sl}
      </text>
      <text x="620" y="880" fill="#a78bfa" fontSize="12">
        Double Bottom? {tp}
      </text>
      <text x="780" y="820" fill="#22d3ee" fontSize="13" fontWeight="700">
        NOW {price}
      </text>
      <path d={sell ? "M900 760 L900 880" : "M900 860 L900 720"} stroke={sell ? "#ef4444" : "#22c55e"} strokeWidth="3" markerEnd="url(#arrMain)" />
      <text x="914" y="820" fill={sell ? "#f87171" : "#4ade80"} fontSize="13" fontWeight="700">
        {sell ? `SHORT ${entry}` : `LONG ${entry}`}
      </text>
      <text x="52" y="960" fill="#94a3b8" fontSize="12">
        SL {sl} · ENTRY {entry} · TP {tp}
      </text>
    </g>
  );
}

function OnePoster({ t, quote }: { t: Tape; quote?: HomeQuote }) {
  const px = quote?.price && quote.price > 0 ? quote.price : t.last || t.entry;
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
        <marker id="arrMain" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill={sell ? "#ef4444" : "#22c55e"} />
        </marker>
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
        ({date} — данные диспетчера, приказ {t.side === "WAIT" ? "ЖДАТЬ" : t.side === "BUY" ? "ЛОНГ" : "ШОРТ"})
      </text>

      <rect x="700" y="70" width="160" height="78" rx="8" fill="#0b1220" stroke="#1e3a5f" />
      <text x="716" y="94" fill="#67e8f9" fontSize="12">
        ATR Daily
      </text>
      <text x="716" y="118" fill="#e2e8f0" fontSize="16" fontWeight="700">
        спред + ход
      </text>
      <rect x="876" y="70" width="168" height="78" rx="8" fill="#0b1220" stroke="#1e3a5f" />
      <text x="892" y="94" fill={sell ? "#f87171" : "#4ade80"} fontSize="12">
        Bias
      </text>
      <text x="892" y="118" fill="#e2e8f0" fontSize="15" fontWeight="700">
        {sell ? "Медвежий" : "Бычий"}
      </text>

      {/* 4 columns */}
      <rect x="24" y="170" width="250" height="430" rx="10" fill="#041018" stroke="#22d3ee" strokeWidth="2" />
      <text x="40" y="198" fill="#22d3ee" fontSize="13" fontWeight="800">
        1. SMC SMART MONEY
      </text>
      <text x="40" y="230" fill="#cbd5e1" fontSize="13">
        Demand / OB
      </text>
      <text x="40" y="250" fill="#67e8f9" fontSize="14" fontWeight="700">
        {tp}
      </text>
      <text x="40" y="286" fill="#cbd5e1" fontSize="13">
        Supply Zone
      </text>
      <text x="40" y="306" fill="#fda4af" fontSize="14" fontWeight="700">
        {sl}
      </text>
      <text x="40" y="342" fill="#cbd5e1" fontSize="13">
        Buy-side liquidity
      </text>
      <text x="40" y="362" fill="#fda4af" fontSize="13">
        выше {hi}
      </text>
      <text x="40" y="398" fill="#cbd5e1" fontSize="13">
        Sell-side liquidity
      </text>
      <text x="40" y="418" fill="#fda4af" fontSize="13">
        ниже {lo}
      </text>
      <text x="40" y="460" fill="#67e8f9" fontSize="12">
        Bias: {sell ? "приоритет продаж от supply" : "приоритет покупок от demand"}
      </text>

      <rect x="284" y="170" width="250" height="430" rx="10" fill="#10081c" stroke="#a855f7" strokeWidth="2" />
      <text x="300" y="198" fill="#d8b4fe" fontSize="13" fontWeight="800">
        2. ВОЛНЫ ЭЛЛИОТТА
      </text>
      <polyline points="310,260 350,230 400,320 450,280 510,480" fill="none" stroke="#c084fc" strokeWidth="3" />
      {[
        [310, 260, "1"],
        [350, 230, "2"],
        [400, 320, "3"],
        [450, 280, "4"],
        [510, 480, "5"],
      ].map(([x, y, n]) => (
        <g key={String(n)}>
          <circle cx={x as number} cy={y as number} r="11" fill="#1e1033" stroke="#c084fc" />
          <text x={x as number} y={(y as number) + 4} textAnchor="middle" fill="#fff" fontSize="11">
            {n}
          </text>
        </g>
      ))}
      <text x="300" y="540" fill="#e9d5ff" fontSize="13">
        цель волны 5 → {lo}
      </text>
      <text x="300" y="564" fill="#fda4af" fontSize="12">
        инвалидация {hi}
      </text>

      <rect x="544" y="170" width="250" height="430" rx="10" fill="#1a0b10" stroke="#ef4444" strokeWidth="2" />
      <text x="560" y="198" fill="#fca5a5" fontSize="12" fontWeight="800">
        3. ПАТТЕРНЫ
      </text>
      <path d="M560 230 L760 250 L760 280 L560 260 Z" fill="none" stroke="#ef4444" strokeWidth="2" />
      <text x="560" y="304" fill="#fecaca" fontSize="12">
        Нисходящий канал
      </text>
      <polyline points="560,340 590,370 620,338 650,370 680,342" fill="none" stroke="#e2e8f0" strokeWidth="2" />
      <text x="560" y="396" fill="#fecaca" fontSize="12">
        Double Bottom?
      </text>
      <line x1="560" y1="430" x2="720" y2="438" stroke="#ef4444" />
      <line x1="560" y1="470" x2="720" y2="444" stroke="#ef4444" />
      <text x="560" y="494" fill="#fecaca" fontSize="12">
        Descending Triangle
      </text>
      <text x="560" y="540" fill="#93c5fd" fontSize="12">
        AB=CD внутри range
      </text>
      <text x="560" y="564" fill="#f9a8d4" fontSize="12">
        Butterfly / Crab у {sl}
      </text>

      <rect x="804" y="170" width="252" height="430" rx="10" fill="#06140c" stroke="#22c55e" strokeWidth="2" />
      <text x="820" y="198" fill="#86efac" fontSize="12" fontWeight="800">
        4. СЕТАПЫ + УРОВНИ
      </text>
      <rect x="820" y="220" width="220" height="150" rx="8" fill="#3f0d12" />
      <text x="834" y="246" fill="#f87171" fontSize="14" fontWeight="800">
        SHORT {t.side === "SELL" ? "(приоритет)" : ""}
      </text>
      <text x="834" y="274" fill="#fecaca" fontSize="13">
        Вход {sell ? entry : sl}
      </text>
      <text x="834" y="298" fill="#fecaca" fontSize="13">
        SL {sl}
      </text>
      <text x="834" y="322" fill="#fecaca" fontSize="13">
        TP {tp}
      </text>
      <rect x="820" y="384" width="220" height="150" rx="8" fill="#052e16" />
      <text x="834" y="410" fill="#4ade80" fontSize="14" fontWeight="800">
        LONG {t.side === "BUY" ? "(приоритет)" : ""}
      </text>
      <text x="834" y="438" fill="#bbf7d0" fontSize="13">
        Вход {t.side === "BUY" ? entry : tp}
      </text>
      <text x="834" y="462" fill="#bbf7d0" fontSize="13">
        SL {lo}
      </text>
      <text x="834" y="486" fill="#bbf7d0" fontSize="13">
        TP {hi}
      </text>
      <text x="820" y="564" fill="#86efac" fontSize="11">
        лонг только после BOS вверх
      </text>

      <CandleSnap sell={sell} sl={sl} entry={entry} tp={tp} price={price} />

      <rect x="36" y="1000" width="240" height="110" rx="8" fill="#1a0b10" stroke="#ef4444" />
      <text x="50" y="1028" fill="#f87171" fontSize="12" fontWeight="700">
        КАНАЛ / RANGE
      </text>
      <text x="50" y="1056" fill="#fecaca" fontSize="12">
        Пробой вниз = усиление {sell ? "шорта" : "коррекции"}
      </text>
      <rect x="288" y="1000" width="240" height="110" rx="8" fill="#0b1220" stroke="#38bdf8" />
      <text x="302" y="1028" fill="#7dd3fc" fontSize="12" fontWeight="700">
        DOUBLE BOTTOM
      </text>
      <text x="302" y="1056" fill="#bae6fd" fontSize="12">
        {tp} — нужен пробой neckline
      </text>
      <rect x="540" y="1000" width="240" height="110" rx="8" fill="#1a1408" stroke="#f59e0b" />
      <text x="554" y="1028" fill="#fbbf24" fontSize="12" fontWeight="700">
        TRIANGLE
      </text>
      <text x="554" y="1056" fill="#fde68a" fontSize="12">
        сжатие у {lo} → сценарий пробоя
      </text>
      <rect x="792" y="1000" width="252" height="110" rx="8" fill="#1a1020" stroke="#c084fc" />
      <text x="806" y="1028" fill="#e9d5ff" fontSize="12" fontWeight="700">
        ГАРМОНИКА
      </text>
      <text x="806" y="1056" fill="#ddd6fe" fontSize="12">
        AB=CD / Crab у {sl}
      </text>

      <rect x="36" y="1130" width="500" height="220" rx="10" fill="#071018" stroke="#1e3a5f" />
      <text x="52" y="1160" fill="#67e8f9" fontSize="14" fontWeight="800">
        ТОРГОВЫЕ СЕТАПЫ + УРОВНИ
      </text>
      <text x="52" y="1196" fill="#f87171" fontSize="16" fontWeight="800">
        SHORT · вход {sell ? entry : sl} · SL {sl} · TP {tp}
      </text>
      <text x="52" y="1230" fill="#4ade80" fontSize="16" fontWeight="800">
        LONG · вход {t.side === "BUY" ? entry : tp} · SL {lo} · TP {hi}
      </text>
      <text x="52" y="1270" fill="#94a3b8" fontSize="13">
        Приказ диспетчера: {t.side}
      </text>

      <rect x="552" y="1130" width="492" height="220" rx="10" fill="#071018" stroke="#1e3a5f" />
      <text x="568" y="1160" fill="#67e8f9" fontSize="14" fontWeight="800">
        КЛЮЧЕВЫЕ УРОВНИ
      </text>
      {[
        [hi, "Resistance / supply", "#2563eb"],
        [sl, "Supply (приоритет)", "#7c3aed"],
        [price, "Current zone", "#0891b2"],
        [tp, "Demand / target", "#6d28d9"],
      ].map(([val, name, col], i) => (
        <g key={String(name)}>
          <rect x="568" y={1176 + i * 38} width="150" height="28" rx="4" fill={String(col)} />
          <text x="643" y={1196 + i * 38} textAnchor="middle" fill="#fff" fontSize="13" fontWeight="700">
            {val}
          </text>
          <text x="736" y={1196 + i * 38} fill="#cbd5e1" fontSize="13">
            {name}
          </text>
        </g>
      ))}

      <text x="540" y="1400" textAnchor="middle" fill="#64748b" fontSize="12">
        РИСК 0.5–1% · СЛЕДИТЬ ЗА ОБЪЁМОМ НА ПРОБОЯХ · НЕ ЯВЛЯЕТСЯ РЕКОМЕНДАЦИЕЙ
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
        <p className="border border-[#12304a] bg-[#020617] px-4 py-10 text-center text-sm text-slate-400">
          {q.isError ? "Лента сигналов не ответила." : "Собираю постер…"}
        </p>
      )}
    </section>
  );
}
