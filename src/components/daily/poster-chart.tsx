import type { LeadChart } from "@/lib/digest";

export function PosterChart({ chart, bias }: { chart: LeadChart; bias: "bull" | "bear" | "warn" }) {
  const candles = chart.candles.slice(-80);
  if (candles.length < 8) {
    return <div className="flex h-[380px] items-center justify-center text-sm text-dim">Нет свечей для картины</div>;
  }
  const W = 1280;
  const H = 520;
  const L = 16;
  const R = 210;
  const T = 44;
  const B = 28;
  const innerW = W - L - R;
  const innerH = H - T - B;
  const maxH = Math.max(...candles.map((c) => c.high));
  const minL = Math.min(...candles.map((c) => c.low));
  const pad = (maxH - minL) * 0.12 || 0.0001;
  const hi = maxH + pad;
  const lo = minL - pad;
  const span = hi - lo || 1;
  const xOf = (i: number) => L + (i / Math.max(1, candles.length - 1)) * innerW;
  const yOf = (p: number) => T + ((hi - p) / span) * innerH;
  const last = candles.at(-1)!;
  const cw = Math.max(3.2, innerW / candles.length - 1.8);
  const tIdx = (time: number) => {
    const i = candles.findIndex((c) => c.time >= time);
    return i < 0 ? candles.length - 1 : i;
  };

  const first = candles[0]!;
  const mid = candles[Math.floor(candles.length * 0.45)]!;
  const chHi = [first.high, mid.high, last.high];
  const chLo = [first.low, mid.low, last.low];
  const down = chart.trend !== "up";
  const fill = down ? "rgba(232, 72, 72, 0.16)" : "rgba(46, 204, 113, 0.14)";
  const stroke = down ? "#e74c3c" : "#2ecc71";

  const waves = chart.waves.slice(-5);
  const callouts = [
    ...chart.notes.slice(0, 3).map((n) => ({
      x: xOf(tIdx(n.time)),
      y: yOf(n.price),
      title: n.name,
      sub: n.hint,
      tone: n.tone,
    })),
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-[#2a3144] bg-[#07090f]">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Инфографика графика">
        <defs>
          <linearGradient id="chFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill="#07090f" />
        <text x={L} y={26} fill="#5eead4" fontFamily="IBM Plex Mono, monospace" fontSize="13" letterSpacing="2.4">
          ГРАФИЧЕСКИЕ + ГАРМОНИЧЕСКИЕ ПАТТЕРНЫ (ПОЯСНЕНИЯ НА ГРАФИКЕ)
        </text>

        <path
          d={`M ${xOf(0)} ${yOf(chHi[0]!)} L ${xOf(Math.floor(candles.length * 0.45))} ${yOf(chHi[1]!)} L ${xOf(candles.length - 1)} ${yOf(chHi[2]!)} L ${xOf(candles.length - 1)} ${yOf(chLo[2]!)} L ${xOf(Math.floor(candles.length * 0.45))} ${yOf(chLo[1]!)} L ${xOf(0)} ${yOf(chLo[0]!)} Z`}
          fill="url(#chFill)"
        />
        <path
          d={`M ${xOf(0)} ${yOf(chHi[0]!)} L ${xOf(Math.floor(candles.length * 0.45))} ${yOf(chHi[1]!)} L ${xOf(candles.length - 1)} ${yOf(chHi[2]!)}`}
          fill="none"
          stroke={stroke}
          strokeWidth="3"
        />
        <path
          d={`M ${xOf(0)} ${yOf(chLo[0]!)} L ${xOf(Math.floor(candles.length * 0.45))} ${yOf(chLo[1]!)} L ${xOf(candles.length - 1)} ${yOf(chLo[2]!)}`}
          fill="none"
          stroke={stroke}
          strokeWidth="3"
        />

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

        {waves.map((w) => {
          const i = tIdx(w.time);
          const x = xOf(i);
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

        {callouts.map((c, i) => (
          <g key={`${c.title}-${i}`}>
            <line x1={c.x} x2={Math.min(c.x + 90, W - R - 10)} y1={c.y} y2={c.y - 28} stroke="#5eead4" strokeWidth="1.4" />
            <text x={Math.min(c.x + 96, W - R)} y={c.y - 32} fill="#5eead4" fontSize="12" fontFamily="IBM Plex Sans, sans-serif" fontWeight="600">
              {c.title}
            </text>
            <text x={Math.min(c.x + 96, W - R)} y={c.y - 16} fill="#94a3b8" fontSize="10" fontFamily="IBM Plex Sans, sans-serif">
              {c.sub}
            </text>
          </g>
        ))}

        <text x={xOf(Math.floor(candles.length * 0.22))} y={yOf(chHi[0]!) - 10} fill="#e74c3c" fontSize="13" fontWeight="700" fontFamily="IBM Plex Sans, sans-serif">
          {down ? "Нисходящий канал / Expanding Range" : "Восходящий канал"}
        </text>

        <g transform={`translate(${W - R + 12}, ${T})`}>
          <rect width="186" height="52" rx="8" fill="#0e1524" stroke="#5eead4" />
          <text x="10" y="20" fill="#5eead4" fontSize="11" fontFamily="IBM Plex Mono, monospace">
            {bias === "bear" ? "Приоритет SHORT" : bias === "bull" ? "Приоритет LONG" : "Внутри range"}
          </text>
          <text x="10" y="38" fill="#e2e8f0" fontSize="12" fontFamily="IBM Plex Mono, monospace">
            {last.close.toFixed(Math.min(5, chart.decimals))}
          </text>
        </g>
      </svg>
    </div>
  );
}
