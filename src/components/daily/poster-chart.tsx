import type { LeadChart } from "@/lib/digest";

export function PosterChart({ chart, bias }: { chart: LeadChart; bias: "bull" | "bear" | "warn" }) {
  const candles = chart.candles.slice(-72);
  if (candles.length < 8) {
    return <div className="flex h-[420px] items-center justify-center text-sm text-dim">Нет свечей для картины</div>;
  }
  const W = 1200;
  const H = 560;
  const L = 28;
  const R = 268;
  const T = 36;
  const B = 40;
  const innerW = W - L - R;
  const innerH = H - T - B;
  const maxH = Math.max(...candles.map((c) => c.high));
  const minL = Math.min(...candles.map((c) => c.low));
  const pad = (maxH - minL) * 0.08 || 0.0001;
  const hi = maxH + pad;
  const lo = minL - pad;
  const span = hi - lo || 1;
  const xOf = (i: number) => L + (i / Math.max(1, candles.length - 1)) * innerW;
  const yOf = (p: number) => T + ((hi - p) / span) * innerH;
  const last = candles.at(-1)!;
  const cw = Math.max(4, innerW / candles.length - 2.4);

  const wanted = ["вход", "стоп", "EQ", "верх", "низ"];
  const labels = chart.levels
    .filter((lv) => wanted.includes(lv.name))
    .sort((a, b) => b.price - a.price)
    .reduce<{ name: string; price: number; label: string; tone: string; y: number }[]>((acc, lv) => {
      const y = yOf(lv.price);
      const prev = acc.at(-1);
      acc.push({
        name: lv.name,
        price: lv.price,
        label: lv.priceLabel,
        tone: lv.tone,
        y: prev && Math.abs(prev.y - y) < 28 ? prev.y + (y >= prev.y ? 28 : -28) : y,
      });
      return acc;
    }, []);

  const tone = (t: string) => (t === "bull" ? "#6ee0a8" : t === "bear" ? "#f0a36a" : "#f0d7a8");
  const channelHi = [candles[0]!.high, candles[Math.floor(candles.length / 2)]!.high, last.high];
  const channelLo = [candles[0]!.low, candles[Math.floor(candles.length / 2)]!.low, last.low];

  return (
    <div className="poster-chart overflow-hidden rounded-xl">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Инфографика графика">
        <defs>
          <linearGradient id="pc-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1a120c" />
            <stop offset="100%" stopColor="#0b0907" />
          </linearGradient>
          <marker id="pc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill="#f0d7a8" />
          </marker>
          <marker id="pc-arrow-bull" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill="#6ee0a8" />
          </marker>
          <marker id="pc-arrow-bear" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill="#f0a36a" />
          </marker>
          <filter id="pc-glow">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width={W} height={H} fill="url(#pc-bg)" />
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1={L}
            x2={W - R}
            y1={T + innerH * g}
            y2={T + innerH * g}
            stroke="rgba(240,215,168,0.08)"
            strokeDasharray="3 8"
          />
        ))}

        {chart.zones.slice(0, 5).map((z) => {
          const y1 = yOf(z.top);
          const y2 = yOf(z.bottom);
          const top = Math.min(y1, y2);
          return (
            <rect
              key={z.id}
              x={L}
              y={top}
              width={innerW}
              height={Math.max(8, Math.abs(y2 - y1))}
              fill={z.side === "bull" ? "rgba(110,224,168,0.12)" : "rgba(240,163,106,0.12)"}
              stroke={z.side === "bull" ? "rgba(110,224,168,0.45)" : "rgba(240,163,106,0.45)"}
            />
          );
        })}

        <path
          className="poster-draw"
          d={`M ${xOf(0)} ${yOf(channelHi[0]!)} L ${xOf(Math.floor(candles.length / 2))} ${yOf(channelHi[1]!)} L ${xOf(candles.length - 1)} ${yOf(channelHi[2]!)}`}
          fill="none"
          stroke="rgba(240,163,106,0.75)"
          strokeWidth="2"
        />
        <path
          className="poster-draw"
          d={`M ${xOf(0)} ${yOf(channelLo[0]!)} L ${xOf(Math.floor(candles.length / 2))} ${yOf(channelLo[1]!)} L ${xOf(candles.length - 1)} ${yOf(channelLo[2]!)}`}
          fill="none"
          stroke="rgba(110,224,168,0.7)"
          strokeWidth="2"
        />

        {candles.map((c, i) => {
          const x = xOf(i);
          const bull = c.close >= c.open;
          const color = bull ? "#6ee0a8" : "#e08b84";
          return (
            <g key={c.time}>
              <line x1={x} x2={x} y1={yOf(c.high)} y2={yOf(c.low)} stroke={color} strokeWidth="1.4" />
              <rect
                x={x - cw / 2}
                y={yOf(Math.max(c.open, c.close))}
                width={cw}
                height={Math.max(1.5, Math.abs(yOf(c.open) - yOf(c.close)))}
                fill={color}
                opacity={0.55 + (i / candles.length) * 0.45}
              />
            </g>
          );
        })}

        {labels.map((lv) => (
          <g key={lv.name}>
            <line
              x1={L}
              x2={W - R + 8}
              y1={yOf(lv.price)}
              y2={yOf(lv.price)}
              stroke={tone(lv.tone)}
              strokeDasharray={lv.name === "вход" ? "0" : "6 7"}
              strokeWidth={lv.name === "вход" || lv.name === "стоп" ? 1.8 : 1}
              opacity="0.85"
            />
            <path
              className="poster-draw"
              d={`M ${W - R + 10} ${yOf(lv.price)} C ${W - R + 70} ${yOf(lv.price)}, ${W - R + 80} ${lv.y}, ${W - R + 92} ${lv.y}`}
              fill="none"
              stroke={tone(lv.tone)}
              strokeWidth="1.4"
              markerEnd={lv.tone === "bull" ? "url(#pc-arrow-bull)" : lv.tone === "bear" ? "url(#pc-arrow-bear)" : "url(#pc-arrow)"}
            />
            <g transform={`translate(${W - R + 100}, ${lv.y - 16})`}>
              <rect width="150" height="32" rx="8" fill="#16110c" stroke={tone(lv.tone)} />
              <text x="10" y="13" fill={tone(lv.tone)} fontFamily="IBM Plex Mono, monospace" fontSize="10">
                {lv.name.toUpperCase()}
              </text>
              <text x="10" y="26" fill="#f6edd9" fontFamily="IBM Plex Mono, monospace" fontSize="11">
                {lv.label}
              </text>
            </g>
          </g>
        ))}

        {chart.notes.slice(0, 4).map((n, i) => {
          const idx = candles.findIndex((c) => c.time >= n.time);
          const x = xOf(idx < 0 ? candles.length - 8 + i * 4 : idx);
          const y = yOf(n.price);
          return (
            <g key={`${n.name}-${i}`} filter="url(#pc-glow)">
              <circle cx={x} cy={y} r="5" fill={tone(n.tone)} className="poster-pulse" />
              <text
                x={x + 10}
                y={y - 10}
                fill={tone(n.tone)}
                fontFamily="IBM Plex Mono, monospace"
                fontSize="11"
              >
                {n.name} {n.priceLabel}
              </text>
            </g>
          );
        })}

        <g className="poster-scan">
          <line
            x1={xOf(candles.length - 1)}
            x2={xOf(candles.length - 1)}
            y1={T}
            y2={H - B}
            stroke="rgba(240,215,168,0.35)"
            strokeDasharray="4 6"
          />
        </g>
        <circle
          className="poster-pulse"
          cx={xOf(candles.length - 1)}
          cy={yOf(last.close)}
          r="7"
          fill={bias === "bear" ? "#f0a36a" : bias === "bull" ? "#6ee0a8" : "#f0d7a8"}
          filter="url(#pc-glow)"
        />

        <path
          className="poster-draw"
          d={
            bias === "bear"
              ? `M ${xOf(candles.length - 10)} ${yOf(last.close) - 40} L ${xOf(candles.length - 1)} ${yOf(last.close) + 50}`
              : `M ${xOf(candles.length - 10)} ${yOf(last.close) + 40} L ${xOf(candles.length - 1)} ${yOf(last.close) - 50}`
          }
          fill="none"
          stroke={bias === "bear" ? "#f0a36a" : "#6ee0a8"}
          strokeWidth="3"
          markerEnd={bias === "bear" ? "url(#pc-arrow-bear)" : "url(#pc-arrow-bull)"}
        />

        <text x={L} y={22} fill="#f0d7a8" fontFamily="IBM Plex Mono, monospace" fontSize="12" letterSpacing="3">
          КАРТИНА РЫНКА · СТРЕЛКИ И УРОВНИ НА ЦЕНЕ
        </text>
        <text x={L} y={H - 14} fill="#8a7d6a" fontFamily="IBM Plex Mono, monospace" fontSize="11">
          {chart.decimals >= 3 ? last.close.toFixed(chart.decimals) : last.close.toFixed(Math.min(5, chart.decimals))} · живые свечи, не схема
        </text>
      </svg>
    </div>
  );
}
