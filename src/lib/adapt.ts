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

const WEAK = new Set(["GBPJPY", "EURAUD"]);
const CRYPTO = new Set(["BTCUSD", "ETHUSD", "LTCUSD", "BCHUSD", "XRPUSD", "TONUSD"]);

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
  let minRr = 0.85;
  let maxLive = 6;
  let level: 0 | 1 | 2 = 0;
  if (streak >= 3 || losses >= 5) {
    minCover = 1.85;
    minRr = 1.25;
    maxLive = 1;
    level = 2;
  } else if (streak >= 2 || losses >= 4) {
    minCover = 1.5;
    minRr = 1.15;
    maxLive = 1;
    level = 1;
  }
  const line =
    last.length < 3
      ? "Зона важнее счёта: ордерблок, ликвидность, сплэш → лимитка. Крипта и GBPJPY по-прежнему режем."
      : level === 2
        ? `После ${streak || losses} стопов: RR≥1.25, живых не больше 1${pause.size ? `, пауза ${[...pause].join(", ")}` : ""}.`
        : level === 1
          ? `Серия минусов (${losses} из ${last.length}). Один живой приказ, RR ≥1.15.`
          : `Последние ${last.length}: ${last.length - losses} плюс / ${losses} стоп. Зоны ставим, слабые пары режем.`;
  return { minCover, minRr, maxLive, pause, level, line };
}

function wait(m: DigestMarket, title: string, therefore: string): DigestMarket {
  return {
    ...m,
    advice: { ...m.advice, action: "wait", title, therefore },
  };
}

/** Keep limits when OB/FVG/liquidity exist. Only cut the pairs that burned the archive. */
export function applyLessons(markets: DigestMarket[]): DigestMarket[] {
  return markets.map((m) => {
    const live = m.advice.action === "long" || m.advice.action === "short";
    if (!live) return m;
    const id = m.spec.id;
    const zoned = m.setup.entry != null && m.setup.stop != null;
    if (WEAK.has(id) && m.score < 55 && !zoned) {
      return wait(m, "Слабая пара без зоны", `${id} на архиве жгла. Без ордерблока не ставим.`);
    }
    if (CRYPTO.has(id) && m.score < 58) {
      return wait(m, "Крипта без набора", "По крипте слабо. Нужен счёт ≥58 и зона.");
    }
    const entry = m.setup.entry;
    const stop = m.setup.stop;
    if (entry != null && stop != null && m.spec.kind === "fx") {
      const pct = Math.abs(entry - stop) / Math.abs(entry);
      if (pct < 0.0012) {
        return wait(m, "Стоп слишком узкий", "Микростоп. Ждём блок пошире.");
      }
    }
    const rr = m.advice.netRr;
    if (rr != null && rr > 2.4 && !zoned) {
      return wait(m, "Цель слишком далеко", `RR ${rr.toFixed(2)}. Без зоны не догоняем.`);
    }
    return m;
  });
}

export function applyAdapt(markets: DigestMarket[], g: AdaptGates): DigestMarket[] {
  let next = applyLessons(markets).map((m) => {
    const live = m.advice.action === "long" || m.advice.action === "short";
    if (!live) return m;
    if (g.pause.has(m.spec.id)) {
      return wait(m, "Адаптация: пара в минусе", `По ${m.spec.id} несколько стопов подряд. Стол не даёт новый вход, пока серия не сломается плюсом.`);
    }
    const cover = m.advice.covers;
    const rr = m.advice.netRr;
    if ((cover != null && cover < g.minCover) || (rr != null && rr < g.minRr)) {
      return wait(
        m,
        "Адаптация: мало хода",
        `Планка: ≥${g.minCover.toFixed(1)} круга спреда и RR ≥${g.minRr.toFixed(2)}. Сейчас ${(cover ?? 0).toFixed(1)} / ${(rr ?? 0).toFixed(2)}.`,
      );
    }
    return m;
  });
  const live = next.filter((m) => m.advice.action === "long" || m.advice.action === "short");
  if (live.length > g.maxLive) {
    const keep = new Set(
      [...live].sort((a, b) => b.score - a.score).slice(0, g.maxLive).map((m) => m.spec.id),
    );
    next = next.map((m) => {
      if (m.advice.action !== "long" && m.advice.action !== "short") return m;
      if (keep.has(m.spec.id)) return m;
      return wait(m, "Лимит живых", `Не больше ${g.maxLive} приказа сразу. Этот слабее по счёту.`);
    });
  }
  return next;
}
