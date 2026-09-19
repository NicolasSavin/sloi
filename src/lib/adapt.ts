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

const WEAK = new Set(["GBPJPY", "EURAUD", "EURGBP"]);
const HARD = new Set(["EURUSD", "XAUUSD"]);
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
  let minRr = 0.95;
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
      ? "История Yahoo: цель ≤1.5R, узкий стоп не берём, слабые кроссы в паузе. Реальные стопы MT4 ещё копятся."
      : level === 2
        ? `После ${streak || losses} стопов стол режет входы: RR≥1.25, живых не больше 1${pause.size ? `, пауза ${[...pause].join(", ")}` : ""}.`
        : level === 1
          ? `Серия минусов (${losses} из ${last.length}). Вход только с запасом хода, не больше 2 пар.`
          : `Последние ${last.length}: ${last.length - losses} плюс / ${losses} стоп. Плюс уроки истории (1.5R / слабые пары).`;
  return { minCover, minRr, maxLive, pause, level, line };
}

function wait(m: DigestMarket, title: string, therefore: string): DigestMarket {
  return {
    ...m,
    advice: { ...m.advice, action: "wait", title, therefore },
  };
}

/** Rules from the 269-idea Yahoo walk. Always on, not only after MT4 fills. */
export function applyLessons(markets: DigestMarket[]): DigestMarket[] {
  const dow = new Date().getUTCDay();
  const hour = new Date().getUTCHours();
  const asia = hour < 7 || hour >= 21;
  return markets.map((m) => {
    const live = m.advice.action === "long" || m.advice.action === "short";
    if (!live) return m;
    const id = m.spec.id;
    if (WEAK.has(id)) {
      return wait(m, "История: пара жгла", `${id} на прогоне архива почти без плюса. Стол не ставит, пока не будет 3 реальных плюса из MT4.`);
    }
    if (CRYPTO.has(id)) {
      return wait(m, "История: крипта слабая", "По крипте винрейт ~25%. Сигнал в журнал не пускаем.");
    }
    if (HARD.has(id) && m.score < 62) {
      return wait(m, "История: нужен набор слоёв", `${id} на архиве часто в стоп. Вход только со счётом ≥62.`);
    }
    const entry = m.setup.entry;
    const stop = m.setup.stop;
    if (entry != null && stop != null && m.spec.kind === "fx") {
      const pct = Math.abs(entry - stop) / Math.abs(entry);
      if (pct < 0.0015) {
        return wait(m, "История: стоп слишком узкий", "Микростоп (<0.15% цены) давал 36% плюса. Ждём зону пошире.");
      }
    }
    if (m.advice.action === "short" && m.spec.kind === "fx" && m.score < 64) {
      return wait(m, "История: шорт FX слабее", "Шорты мажоров 40%. Нужен счёт ≥64 или нефть/металл.");
    }
    const rr = m.advice.netRr;
    if (rr != null && rr > 2.2) {
      return wait(m, "История: жадная цель", `RR ${rr.toFixed(2)} на архиве 18–32% плюса. Цель должна быть ~1.5R.`);
    }
    if (dow === 1 && m.spec.kind === "fx" && m.score < 60) {
      return wait(m, "История: понедельник слабый", "Пн по FX 32%. Только сильный набор слоёв.");
    }
    if (asia && m.spec.kind === "fx" && m.score < 58) {
      return wait(m, "История: Азия", "Азиатская сессия по форексу 41%. Ждём Лондон или сильный счёт.");
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
        "Адаптация: мало хода после минусов",
        `Стол поднял планку: нужно ≥${g.minCover.toFixed(1)} круга спреда и RR ≥${g.minRr.toFixed(2)}. Сейчас ${(cover ?? 0).toFixed(1)} / ${(rr ?? 0).toFixed(2)}.`,
      );
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
        return wait(m, "Адаптация: лимит живых", `После минусов стол держит не больше ${g.maxLive} приказа. Этот слабее по счёту.`);
      });
    }
  }
  return next;
}
