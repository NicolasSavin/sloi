import type { DigestMarket } from "@/lib/digest";
import type { SignalHit } from "@/lib/dispatch-store";

export interface AdaptGates {
  minCover: number;
  minRr: number;
  maxLive: number;
  pause: Set<string>;
  level: 0 | 1 | 2;
  line: string;
}

export function adaptGates(log: SignalHit[]): AdaptGates {
  const real = log
    .filter((h) => h.filled && (h.status === "target" || h.status === "stop"))
    .sort((a, b) => (b.closedAt ?? b.at) - (a.closedAt ?? a.at));
  const last = real.slice(0, 8);
  const losses = last.filter((h) => h.status === "stop").length;
  let streak = 0;
  for (const h of last) {
    if (h.status !== "stop") break;
    streak++;
  }
  const pause = new Set<string>();
  const by = new Map<string, SignalHit[]>();
  for (const h of real) {
    const row = by.get(h.symbol) ?? [];
    if (row.length < 4) row.push(h);
    by.set(h.symbol, row);
  }
  for (const [id, rows] of by) {
    const stops = rows.filter((h) => h.status === "stop").length;
    if (rows.length >= 3 && stops >= 3) pause.add(id);
    if (rows.slice(0, 3).every((h) => h.status === "stop")) pause.add(id);
  }
  let minCover = 1.12;
  let minRr = 0.75;
  let maxLive = 4;
  let level: 0 | 1 | 2 = 0;
  if (streak >= 3 || losses >= 5) {
    minCover = 1.85;
    minRr = 1.25;
    maxLive = 1;
    level = 2;
  } else if (streak >= 2 || losses >= 4) {
    minCover = 1.5;
    minRr = 1.05;
    maxLive = 2;
    level = 1;
  }
  const line =
    last.length < 3
      ? "Адаптация ждёт 3 реальных исхода из MT4."
      : level === 2
        ? `После ${streak || losses} стопов стол режет входы: RR≥1.25, живых не больше 1${pause.size ? `, пауза ${[...pause].join(", ")}` : ""}.`
        : level === 1
          ? `Серия минусов (${losses} из ${last.length}). Вход только с запасом хода, не больше 2 пар.`
          : `Последние ${last.length}: ${last.length - losses} плюс / ${losses} стоп. Фильтры обычные.`;
  return { minCover, minRr, maxLive, pause, level, line };
}

export function applyAdapt(markets: DigestMarket[], g: AdaptGates): DigestMarket[] {
  let next = markets.map((m) => {
    const live = m.advice.action === "long" || m.advice.action === "short";
    if (!live) return m;
    if (g.pause.has(m.spec.id)) {
      return {
        ...m,
        advice: {
          ...m.advice,
          action: "wait" as const,
          title: "Адаптация: пара в минусе",
          therefore: `По ${m.spec.id} несколько стопов подряд. Стол не даёт новый вход, пока серия не сломается плюсом.`,
        },
      };
    }
    const cover = m.advice.covers;
    const rr = m.advice.netRr;
    if ((cover != null && cover < g.minCover) || (rr != null && rr < g.minRr)) {
      return {
        ...m,
        advice: {
          ...m.advice,
          action: "wait" as const,
          title: "Адаптация: мало хода после минусов",
          therefore: `Стол поднял планку: нужно ≥${g.minCover.toFixed(1)} круга спреда и RR ≥${g.minRr.toFixed(2)}. Сейчас ${(cover ?? 0).toFixed(1)} / ${(rr ?? 0).toFixed(2)}.`,
        },
      };
    }
    return m;
  });
  if (g.maxLive < 4) {
    const live = next.filter((m) => m.advice.action === "long" || m.advice.action === "short");
    if (live.length > g.maxLive) {
      const keep = new Set(
        [...live].sort((a, b) => b.score - a.score).slice(0, g.maxLive).map((m) => m.spec.id),
      );
      next = next.map((m) => {
        if (m.advice.action !== "long" && m.advice.action !== "short") return m;
        if (keep.has(m.spec.id)) return m;
        return {
          ...m,
          advice: {
            ...m.advice,
            action: "wait" as const,
            title: "Адаптация: лимит живых",
            therefore: `После минусов стол держит не больше ${g.maxLive} приказа. Этот слабее по счёту.`,
          },
        };
      });
    }
  }
  return next;
}
