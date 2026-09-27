export type DivPoint = { time: number; price: number; type: "high" | "low" };
export type DivBar = { time: number; cvd: number };

export function latestDeltaDivergence(swings: DivPoint[], bars: DivBar[]) {
  if (bars.length < 4) return null;
  const cvdAt = (time: number) => {
    let best = bars[0]!;
    let dist = Infinity;
    for (const bar of bars) {
      const d = Math.abs(bar.time - time);
      if (d < dist) {
        dist = d;
        best = bar;
      }
    }
    return best.cvd;
  };
  const pick = (type: "high" | "low") => {
    const pts = swings.filter((s) => s.type === type).slice(-8);
    for (let i = pts.length - 1; i >= 1; i--) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (type === "high" && b.price > a.price && cvdAt(b.time) < cvdAt(a.time)) return { a, b, bull: false as const };
      if (type === "low" && b.price < a.price && cvdAt(b.time) > cvdAt(a.time)) return { a, b, bull: true as const };
    }
    return null;
  };
  const high = pick("high");
  const low = pick("low");
  if (high && low) return high.b.time >= low.b.time ? high : low;
  return high ?? low;
}
