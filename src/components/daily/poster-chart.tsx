import type { LeadChart } from "@/lib/digest";

type Mark = {
  id: string;
  x: number;
  y: number;
  ox: number;
  oy: number;
  text: string;
  fill: string;
  side: "left" | "right" | "up";
};

function spread(marks: Mark[], minGap: number, top: number, bottom: number) {
  const bySide = (side: Mark["side"]) => {
    const rows = marks.filter((m) => m.side === side).sort((a, b) => a.y - b.y);
    for (let i = 1; i < rows.length; i++) {
      if (rows[i]!.y - rows[i - 1]!.y < minGap) rows[i]!.y = rows[i - 1]!.y + minGap;
    }
    for (let i = rows.length - 2; i >= 0; i--) {
      if (rows[i + 1]!.y - rows[i]!.y < minGap) rows[i]!.y = rows[i + 1]!.y - minGap;
    }
    for (const r of rows) r.y = Math.min(bottom, Math.max(top, r.y));
    for (let i = 1; i < rows.length; i++) {
      if (rows[i]!.y - rows[i - 1]!.y < minGap) rows[i]!.y = Math.min(bottom, rows[i - 1]!.y + minGap);
    }
  };
  bySide("left");
  bySide("right");
  bySide("up");
  return marks;
}

export function PosterChart({ chart, bias }: { chart: LeadChart; bias: "bull" | "bear" | "warn" }) {
  const candles = chart.candles.slice(-80);
  if (candles.length < 8) {
    return <div className="flex h-[380px] items-center justify-center text-sm text-dim">Нет свечей для картины</div>;
  }
  const W = 1400;
  const H = 620;
  const L = 168;
  const R = 280;
  const T = 52;
  const B = 28;
  const innerW = W - L - R;
  const innerH = H - T - B;
  const maxH = Math.max(...candles.map((c) => c.high));
  const minL = Math.min(...candles.map((c) => c.low));
  const pad = (maxH - minL) * 0.16 || 0.0001;
  const hi = maxH + pad;
  const lo = minL - pad;
  const span = hi - lo || 1;
  const xOf = (i: number) => L + (i / Math.max(1, candles.length - 1)) * innerW;
  const yOf = (p: number) => T + ((hi - p) / span) * innerH;
  const last = candles.at(-1)!;
  const cw = Math.max(3.2, innerW / candles.length - 1.8);
  const t0 = candles[0]!.time;
  const t1 = last.time;
  const xTime = (time: number) => {
    if (time <= t0) return L;
    if (time >= t1) return L + innerW;
    const i = candles.findIndex((c) => c.time >= time);
    return xOf(i < 0 ? candles.length - 1 : i);
  };
  const tIdx = (time: number) => {
    const i = candles.findIndex((c) => c.time >= time);
    return i < 0 ? candles.length - 1 : i;
  };

  const first = candles[0]!;
  const mid = candles[Math.floor(candles.length * 0.45)]!;
  const chHi = [first.high, mid.high, last.high];
  const chLo = [first.low, mid.low, last.low];
  const down = chart.trend !== "up";
  const stroke = down ? "#e74c3c" : "#2ecc71";
  const px = (n: number) => n.toFixed(Math.min(5, chart.decimals));

  const eq = chart.levels.find((l) => l.name === "EQ");
  const entry = chart.levels.find((l) => l.name === "вход" || l.id === "entry");
  const stop = chart.levels.find((l) => l.name === "стоп" || l.id === "stop");
  const ote = chart.levels.find((l) => l.name === "0.62");

  const zones = chart.zones.slice(-4);
  const waves = chart.waves.slice(-5);

  const events = [...chart.events].slice(-8).reduce<typeof chart.events>((acc, e) => {
    const x = xTime(e.time);
    const y = yOf(e.price);
    const near = acc.find((p) => Math.hypot(xTime(p.time) - x, yOf(p.price) - y) < 36 && p.kind === e.kind);
    if (near) return acc;
    acc.push(e);
    return acc;
  }, []);

  const marks: Mark[] = [];
  const add = (id: string, x: number, y: number, text: string, fill: string, side: Mark["side"]) => {
    marks.push({ id, x, y, ox: x, oy: y, text, fill, side });
  };
  add("ch", xOf(Math.floor(candles.length * 0.18)), yOf(chHi[0]!) - 18, down ? "Нисходящий канал" : "Восходящий канал", stroke, "up");
  if (eq) add("eq", L + 18, yOf(eq.price), `EQ ${eq.priceLabel}`, "#fde047", "left");
  if (entry) add("entry", L + innerW - 8, yOf(entry.price), `вход ${entry.priceLabel}`, "#f8fafc", "right");
  if (stop) add("stop", L + innerW - 8, yOf(stop.price), `стоп ${stop.priceLabel}`, "#fca5a5", "right");
  if (ote) add("ote", L + 18, yOf(ote.price), `OTE 0.62 ${ote.priceLabel}`, "#5eead4", "left");
  zones.forEach((z, i) => {
    const bull = z.side === "bull";
    add(
      `z-${z.id}-${i}`,
      xTime(z.startTime) + 20,
      yOf((z.top + z.bottom) / 2),
      z.kind === "fvg" ? "FVG" : bull ? "Demand / OB" : "Supply / OB",
      bull ? "#86efac" : "#fca5a5",
      i % 2 === 0 ? "up" : "left",
    );
  });
  events.forEach((e, i) => {
    add(
      `e-${e.kind}-${e.time}-${i}`,
      xTime(e.time),
      yOf(e.price),
      e.kind,
      e.side === "bull" ? "#86efac" : "#fca5a5",
      e.side === "bull" ? "up" : "right",
    );
  });
  chart.liquidity.slice(-4).forEach((l, i) => {
    add(
      `liq-${l.side}-${i}`,
      L + innerW,
      yOf(l.price),
      `${l.side === "buy" ? "BSL" : "SSL"}${l.swept ? " × свип" : ""} ${px(l.price)}`,
      l.side === "buy" ? "#7dd3fc" : "#fb7185",
      "right",
    );
  });
  spread(marks, 36, T + 22, H - 24);

  return (
    <div className="overflow-hidden rounded-xl border border-[#2a3144] bg-[#07090f]">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="SMC на графике">
        <defs>
          <linearGradient id="chFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.14" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
          </linearGradient>
          <pattern id="fvgHatchBull" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#2ecc71" strokeWidth="1.2" opacity="0.55" />
          </pattern>
          <pattern id="fvgHatchBear" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#e74c3c" strokeWidth="1.2" opacity="0.55" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="#07090f" />
        <text x={L} y={32} fill="#5eead4" fontFamily="IBM Plex Mono, monospace" fontSize="16" fontWeight="700" letterSpacing="2">
          SMC НА ГРАФИКЕ · БЛОКИ · FVG · BOS/CHoCH · ЛИКВИДНОСТЬ
        </text>

        <path
          d={`M ${xOf(0)} ${yOf(chHi[0]!)} L ${xOf(Math.floor(candles.length * 0.45))} ${yOf(chHi[1]!)} L ${xOf(candles.length - 1)} ${yOf(chHi[2]!)} L ${xOf(candles.length - 1)} ${yOf(chLo[2]!)} L ${xOf(Math.floor(candles.length * 0.45))} ${yOf(chLo[1]!)} L ${xOf(0)} ${yOf(chLo[0]!)} Z`}
          fill="url(#chFill)"
        />
        <path
          d={`M ${xOf(0)} ${yOf(chHi[0]!)} L ${xOf(Math.floor(candles.length * 0.45))} ${yOf(chHi[1]!)} L ${xOf(candles.length - 1)} ${yOf(chHi[2]!)}`}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          opacity="0.55"
        />
        <path
          d={`M ${xOf(0)} ${yOf(chLo[0]!)} L ${xOf(Math.floor(candles.length * 0.45))} ${yOf(chLo[1]!)} L ${xOf(candles.length - 1)} ${yOf(chLo[2]!)}`}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          opacity="0.55"
        />

        {chart.margin.upper.active ? (
          <rect
            x={L}
            y={yOf(chart.margin.upper.top)}
            width={innerW}
            height={Math.max(4, yOf(chart.margin.upper.bottom) - yOf(chart.margin.upper.top))}
            fill="rgba(231,76,60,0.08)"
          />
        ) : null}
        {chart.margin.lower.active ? (
          <rect
            x={L}
            y={yOf(chart.margin.lower.top)}
            width={innerW}
            height={Math.max(4, yOf(chart.margin.lower.bottom) - yOf(chart.margin.lower.top))}
            fill="rgba(46,204,113,0.08)"
          />
        ) : null}

        {zones.map((z) => {
          const x1 = xTime(z.startTime);
          const y1 = yOf(z.top);
          const y2 = yOf(z.bottom);
          const top = Math.min(y1, y2);
          const h = Math.max(10, Math.abs(y2 - y1));
          const bull = z.side === "bull";
          const fvg = z.kind === "fvg";
          return (
            <rect
              key={z.id}
              x={x1}
              y={top}
              width={Math.min(innerW - (x1 - L), Math.max(48, innerW * 0.22))}
              height={h}
              fill={fvg ? (bull ? "url(#fvgHatchBull)" : "url(#fvgHatchBear)") : bull ? "rgba(46,204,113,0.22)" : "rgba(231,76,60,0.22)"}
              stroke={bull ? "#2ecc71" : "#e74c3c"}
              strokeWidth="1.6"
              strokeDasharray={fvg ? "4 3" : undefined}
            />
          );
        })}

        {eq ? <line x1={L} x2={L + innerW} y1={yOf(eq.price)} y2={yOf(eq.price)} stroke="#f1c40f" strokeDasharray="6 5" strokeWidth="1.6" /> : null}
        {ote ? <line x1={L} x2={L + innerW} y1={yOf(ote.price)} y2={yOf(ote.price)} stroke="#5eead4" strokeDasharray="2 6" strokeWidth="1.2" opacity="0.7" /> : null}
        {entry ? <line x1={L} x2={L + innerW} y1={yOf(entry.price)} y2={yOf(entry.price)} stroke="#e2e8f0" strokeWidth="1.7" /> : null}
        {stop ? <line x1={L} x2={L + innerW} y1={yOf(stop.price)} y2={yOf(stop.price)} stroke="#e74c3c" strokeDasharray="4 4" strokeWidth="1.4" /> : null}

        {chart.liquidity.slice(-4).map((l, i) => (
          <line
            key={`ln-${i}`}
            x1={L}
            x2={L + innerW}
            y1={yOf(l.price)}
            y2={yOf(l.price)}
            stroke={l.side === "buy" ? "#38bdf8" : "#fb7185"}
            strokeDasharray="1 5"
            strokeWidth="1.4"
          />
        ))}

        {candles.map((c, i) => {
          const x = xOf(i);
          const bull = c.close >= c.open;
          const color = bull ? "#2ecc71" : "#e74c3c";
          return (
            <g key={c.time}>
              <line x1={x} x2={x} y1={yOf(c.high)} y2={yOf(c.low)} stroke={color} strokeWidth="1.5" />
              <rect
                x={x - cw / 2}
                y={yOf(Math.max(c.open, c.close))}
                width={cw}
                height={Math.max(1.6, Math.abs(yOf(c.open) - yOf(c.close)))}
                fill={color}
              />
            </g>
          );
        })}

        {events.map((e, i) => {
          const x = xTime(e.time);
          const y = yOf(e.price);
          const up = e.side === "bull";
          return (
            <path
              key={`arr-${e.time}-${i}`}
              d={up ? `M ${x} ${y + 14} L ${x - 9} ${y} L ${x + 9} ${y} Z` : `M ${x} ${y - 14} L ${x - 9} ${y} L ${x + 9} ${y} Z`}
              fill={up ? "#2ecc71" : "#e74c3c"}
            />
          );
        })}

        {waves.map((w) => {
          const x = xOf(tIdx(w.time));
          const y = yOf(w.price);
          return (
            <g key={`${w.label}-${w.time}`}>
              <circle cx={x} cy={y} r="13" fill="#0b1020" stroke="#f1c40f" strokeWidth="2.2" />
              <text x={x} y={y + 5} textAnchor="middle" fill="#fde047" fontSize="13" fontFamily="IBM Plex Sans, sans-serif" fontWeight="800">
                {w.label.replace(/[^0-9A-Ea-e]/g, "").slice(0, 2) || w.label.slice(0, 1)}
              </text>
            </g>
          );
        })}

        {marks.map((m) => {
          const boxW = Math.min(270, 22 + m.text.length * 9.4);
          const boxH = 30;
          const tx =
            m.side === "right"
              ? L + innerW + 14
              : m.side === "left"
                ? 8
                : Math.min(Math.max(m.ox + 14, L + 8), L + innerW - boxW - 8);
          const ty = m.y - boxH / 2;
          const joinX = m.side === "right" ? tx : m.side === "left" ? tx + boxW : tx + 12;
          return (
            <g key={m.id}>
              <path
                d={`M ${m.ox} ${m.oy} L ${joinX} ${m.y}`}
                fill="none"
                stroke={m.fill}
                strokeWidth="1.5"
                opacity="0.9"
              />
              <rect x={tx} y={ty} width={boxW} height={boxH} rx="6" fill="#07090f" stroke={m.fill} strokeWidth="1.8" />
              <text
                x={tx + 10}
                y={ty + 20}
                fill={m.fill}
                fontSize="15"
                fontWeight="700"
                fontFamily="IBM Plex Sans, sans-serif"
              >
                {m.text}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="grid gap-2 border-t border-[#2a3144] bg-[#0a101c] px-3 py-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg bg-[#12351f] px-3 py-2 ring-2 ring-[#2ecc71]">
          <p className="text-base font-semibold text-[#86efac]">Demand / FVG / BOS↑</p>
          <p className="text-xs text-[#bbf7d0]">зелёный — покупки крупняка</p>
        </div>
        <div className="rounded-lg bg-[#3a1218] px-3 py-2 ring-2 ring-[#e74c3c]">
          <p className="text-base font-semibold text-[#fca5a5]">Supply / FVG / BOS↓</p>
          <p className="text-xs text-[#fecaca]">красный — продажи крупняка</p>
        </div>
        <div className="rounded-lg bg-[#082f49] px-3 py-2 ring-2 ring-[#38bdf8]">
          <p className="text-base font-semibold text-[#7dd3fc]">BSL / SSL</p>
          <p className="text-xs text-[#bae6fd]">ликвидность · × свип стопов</p>
        </div>
        <div className="rounded-lg bg-[#3b2f0a] px-3 py-2 ring-2 ring-[#f1c40f]">
          <p className="text-base font-semibold text-[#fde047]">EQ · волны</p>
          <p className="text-xs text-[#fef08a]">середина диапазона и счёт 1–5</p>
        </div>
        <div className="rounded-lg bg-[#0e1524] px-3 py-2 ring-2 ring-[#5eead4]">
          <p className="text-base font-semibold text-[#5eead4]">
            {bias === "bear" ? "Приоритет SHORT" : bias === "bull" ? "Приоритет LONG" : "Внутри range"}
          </p>
          <p className="font-mono text-sm text-white">{px(last.close)}</p>
        </div>
      </div>
    </div>
  );
}
