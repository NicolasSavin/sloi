import type { DigestMarket } from "@/lib/digest";

/** Чем выше — тем охотнее пара на постере главной / Сегодня. */
export function leadScore(m: DigestMarket): number {
  const live = m.advice.action === "long" || m.advice.action === "short";
  const e = m.setup.entry;
  const s = m.setup.stop;
  const risk = e != null && s != null ? Math.abs(e - s) : 0;
  const away = live && e != null && risk > 0 ? Math.abs(m.lastClose - e) / risk : 9;
  let n = 0;
  if (live) n += 100;
  if (m.advice.title === "Держим приказ") n += 35;
  if (m.spec.kind === "fx") n += 18;
  else if (m.spec.kind === "metal") n += 6;
  else if (m.spec.kind === "energy") n += 4;
  n += Math.min(28, m.score);
  const rr = m.advice.netRr;
  if (rr != null && rr > 0) n += Math.min(24, rr * 8);
  if (away < 0.35) n += 28;
  else if (away < 0.7) n += 12;
  else if (away < 1.2) n += 4;
  if (m.wind?.kind === "tail") n += 8;
  if (m.wind?.kind === "head") n -= 10;
  return n;
}

export function pickLead(markets: DigestMarket[]): DigestMarket {
  const ranked = [...markets].sort((a, b) => leadScore(b) - leadScore(a) || b.score - a.score);
  return ranked[0]!;
}
