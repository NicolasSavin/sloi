import type { LeadChart } from "@/lib/digest";

export function PosterChart({ chart, bias }: { chart: LeadChart; bias: "bull" | "bear" | "warn" }) {
  const candles = chart.candles.slice(-80);
  if (candles.length < 8) {
    return <div className="flex h-[380px] items-center justify-center text-sm text-dim">Нет свечей для картины</div>;
  }
  const W = 1280;
  const H = 560;
  const L = 16;
  const R = 268;
  const T = 48;
  const B = 36;
  const innerW = W - L - R;
  const innerH = H - T - B;
  const maxH = Math.max(...candles.map((c) => c.high));
  const minL = Math.min(...candles.map((c) => c.low));
  const pad = (maxH - minL) * 0.14 || 0.0001;
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

  const zones = chart.zones.slice(-6);
  const events = chart.events.slice(-6);
  const liq = chart.liquidity.slice(-5);
  const waves = chart.waves.slice(-5);

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
        <text x={L} y={28} fill="#5eead4" fontFamily="IBM Plex Mono, monospace" fontSize="13" letterSpacing="2.2">
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
          const x2 = Math.max(x1 + 28, xTime(z.endTime || t1));
          const y1 = yOf(z.top);
          const y2 = yOf(z.bottom);
          const top = Math.min(y1, y2);
          const h = Math.max(10, Math.abs(y2 - y1));
          const bull = z.side === "bull";
          const fvg = z.kind === "fvg";
          const label = fvg ? "FVG" : bull ? "Demand / OB" : "Supply / OB";
          return (
            <g key={z.id}>
              <rect
                x={x1}
                y={top}
                width={Math.min(innerW - (x1 - L), Math.max(36, x2 - x1 + innerW * 0.12))}
                height={h}
                fill={fvg ? (bull ? "url(#fvgHatchBull)" : "url(#fvgHatchBear)") : bull ? "rgba(46,204,113,0.22)" : "rgba(231,76,60,0.22)"}
                stroke={bull ? "#2ecc71" : "#e74c3c"}
                strokeWidth="1.4"
                strokeDasharray={fvg ? "4 3" : undefined}
              />
              <text
                x={x1 + 8}
                y={top + 14}
                fill={bull ? "#86efac" : "#fca5a5"}
                fontSize="11"
                fontFamily="IBM Plex Sans, sans-serif"
                fontWeight="700"
              >
                {label}
              </text>
            </g>
          );
        })}

        {eq ? (
          <g>
            <line x1={L} x2={L + innerW} y1={yOf(eq.price)} y2={yOf(eq.price)} stroke="#f1c40f" strokeDasharray="6 5" strokeWidth="1.4" />
            <text x={L + 8} y={yOf(eq.price) - 6} fill="#f1c40f" fontSize="11" fontFamily="IBM Plex Mono, monospace">
              EQ {eq.priceLabel}
            </text>
          </g>
        ) : null}
        {ote ? (
          <line x1={L} x2={L + innerW} y1={yOf(ote.price)} y2={yOf(ote.price)} stroke="#5eead4" strokeDasharray="2 6" strokeWidth="1" opacity="0.7" />
        ) : null}
        {entry ? (
          <g>
            <line x1={L} x2={L + innerW} y1={yOf(entry.price)} y2={yOf(entry.price)} stroke="#e2e8f0" strokeWidth="1.6" />
            <text x={L + innerW - 8} y={yOf(entry.price) - 6} textAnchor="end" fill="#e2e8f0" fontSize="11" fontFamily="IBM Plex Mono, monospace">
              вход {entry.priceLabel}
            </text>
          </g>
        ) : null}
        {stop ? (
          <line x1={L} x2={L + innerW} y1={yOf(stop.price)} y2={yOf(stop.price)} stroke="#e74c3c" strokeDasharray="4 4" strokeWidth="1.3" />
        ) : null}

        {liq.map((l, i) => {
          const y = yOf(l.price);
          const buy = l.side === "buy";
          return (
            <g key={`${l.side}-${l.time}-${i}`}>
              <line
                x1={L}
                x2={L + innerW}
                y1={y}
                y2={y}
                stroke={buy ? "#38bdf8" : "#fb7185"}
                strokeDasharray="1 5"
                strokeWidth="1.3"
              />
              <text x={L + innerW + 8} y={y + 4} fill={buy ? "#38bdf8" : "#fb7185"} fontSize="11" fontFamily="IBM Plex Mono, monospace">
                {buy ? "BSL" : "SSL"} {l.swept ? "× свип" : ""} {px(l.price)}
              </text>
            </g>
          );
        })}

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
            <g key={`${e.kind}-${e.time}-${i}`}>
              <path
                d={up ? `M ${x} ${y + 16} L ${x - 8} ${y + 2} L ${x + 8} ${y + 2} Z` : `M ${x} ${y - 16} L ${x - 8} ${y - 2} L ${x + 8} ${y - 2} Z`}
                fill={up ? "#2ecc71" : "#e74c3c"}
              />
              <text
                x={x + 12}
                y={up ? y + 22 : y - 20}
                fill={up ? "#86efac" : "#fca5a5"}
                fontSize="12"
                fontWeight="700"
                fontFamily="IBM Plex Sans, sans-serif"
              >
                {e.kind}
              </text>
            </g>
          );
        })}

        {waves.map((w) => {
          const x = xOf(tIdx(w.time));
          const y = yOf(w.price);
          return (
            <g key={`${w.label}-${w.time}`}>
              <circle cx={x} cy={y} r="11" fill="#0b1020" stroke="#f1c40f" strokeWidth="2" />
              <text x={x} y={y + 4} textAnchor="middle" fill="#f1c40f" fontSize="11" fontFamily="IBM Plex Sans, sans-serif" fontWeight="700">
                {w.label.replace(/[^0-9A-Ea-e]/g, "").slice(0, 2) || w.label.slice(0, 1)}
              </text>
            </g>
          );
        })}

        <text x={xOf(Math.floor(candles.length * 0.18))} y={yOf(chHi[0]!) - 8} fill={stroke} fontSize="12" fontWeight="700" fontFamily="IBM Plex Sans, sans-serif">
          {down ? "Нисходящий канал" : "Восходящий канал"}
        </text>
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
