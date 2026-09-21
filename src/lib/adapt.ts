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

const WEAK = new Set(["GBPJPY", "EURAUD", "EURGBP", "GBPAUD", "EURUSD"]);
const HARD = new Set(["XAUUSD", "XAGUSD"]);
const CRYPTO = new Set(["BTCUSD", "ETHUSD", "LTCUSD", "BCHUSD", "XRPUSD", "TONUSD"]);
const BEST = new Set(["XTIUSD", "XBRUSD", "USDCAD", "USDJPY", "AUDJPY", "NZDUSD", "EURJPY"]);

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
  let minCover = 1.2;
  let minRr = 1.0;
  let maxLive = 2;
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
      ? "Режим 70%: RR 1.0–1.8, не больше 2 живых, евро/кроссы/крипта в паузе. Это цель по бумаге, не обещание."
      : level === 2
        ? `После ${streak || losses} стопов: RR≥1.25, живых не больше 1${pause.size ? `, пауза ${[...pause].join(", ")}` : ""}.`
        : level === 1
          ? `Серия минусов (${losses} из ${last.length}). Один живой приказ, RR ≥1.15.`
          : `Последние ${last.length}: ${last.length - losses} плюс / ${losses} стоп. Режим 70% включён.`;
  return { minCover, minRr, maxLive, pause, level, line };
}

function wait(m: DigestMarket, title: string, therefore: string): DigestMarket {
  return {
    ...m,
    advice: { ...m.advice, action: "wait", title, therefore },
  };
}

/** Paper combo that printed ~74–86% on 269 Yahoo walks: RR 1–1.8, skip weak, no chase. */
export function applyLessons(markets: DigestMarket[]): DigestMarket[] {
  const dow = new Date().getUTCDay();
  const hour = new Date().getUTCHours();
  const asia = hour < 7 || hour >= 21;
  return markets.map((m) => {
    const live = m.advice.action === "long" || m.advice.action === "short";
    if (!live) return m;
    const id = m.spec.id;
    if (WEAK.has(id)) {
      return wait(
        m,
        "Режим 70%: пара снята",
        `${id} на архиве 0–35% плюса. Ради винрейта стол не ставит. Нефть, USDCAD, йены — да.`,
      );
    }
    if (CRYPTO.has(id)) {
      return wait(m, "Режим 70%: крипта снята", "По крипте ~25%. Не берём.");
    }
    if (HARD.has(id) && m.score < 70) {
      return wait(m, "Режим 70%: золото/серебро", `${id} на архиве слабо. Нужен счёт ≥70 и зона.`);
    }
    if (!BEST.has(id) && !HARD.has(id) && m.score < 68) {
      return wait(m, "Режим 70%: не лучшая пара", `${id} не из связки 70%+. Вход только со счётом ≥68.`);
    }
    const entry = m.setup.entry;
    const stop = m.setup.stop;
    if (entry != null && stop != null && m.spec.kind === "fx") {
      const pct = Math.abs(entry - stop) / Math.abs(entry);
      if (pct < 0.0015) {
        return wait(m, "Режим 70%: стоп узкий", "Микростоп давал 36%. Ждём зону пошире.");
      }
    }
    if (m.advice.action === "short" && m.spec.kind === "fx" && m.score < 70) {
      return wait(m, "Режим 70%: шорт FX", "Шорты форекса 40%. Нужен счёт ≥70 или нефть/металл.");
    }
    const rr = m.advice.netRr;
    if (rr != null && rr < 1.0) {
      return wait(m, "Режим 70%: RR мало", `Сейчас ${rr.toFixed(2)}. Берём только 1.0–1.8.`);
    }
    if (rr != null && rr > 1.8) {
      return wait(m, "Режим 70%: цель слишком далеко", `RR ${rr.toFixed(2)} на архиве 32%. Нужно ~1.5R.`);
    }
    if (dow === 1 && m.spec.kind === "fx" && m.score < 68) {
      return wait(m, "Режим 70%: понедельник", "Пн по FX 32%. Только сильный набор.");
    }
    if (asia && m.spec.kind === "fx" && m.score < 66) {
      return wait(m, "Режим 70%: Азия", "Азия 41%. Ждём Лондон.");
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
      return wait(m, "Режим 70%: лимит живых", `Не больше ${g.maxLive} приказа сразу. Этот слабее по счёту.`);
    });
  }
  return next;
}
