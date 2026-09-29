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
  let minCover = 1.05;
  let minRr = 0.9;
  let maxLive = 6;
  let level: 0 | 1 | 2 = 0;
  if (streak >= 3 || losses >= 5) {
    minCover = 1.25;
    minRr = 1.05;
    maxLive = 4;
    level = 2;
  } else if (streak >= 2 || losses >= 4) {
    minCover = 1.15;
    minRr = 1;
    maxLive = 5;
    level = 1;
  }
  const line =
    last.length < 3
      ? "Приказ, если есть зона, стоп и цель. Лимитка на возврат, рынком не догоняем."
      : level === 2
        ? `После серии стопов планка чуть выше: RR ≥${minRr.toFixed(2)}. Живых до ${maxLive}, пары не выключаем.`
        : level === 1
          ? `Серия минусов (${losses} из ${last.length}). RR ≥${minRr.toFixed(2)}, живых до ${maxLive}.`
          : `Последние ${last.length}: ${last.length - losses} плюс / ${losses} стоп. Зона со стопом и целью — уже приказ.`;
  return { minCover, minRr, maxLive, pause, level, line };
}

function wait(m: DigestMarket, title: string, therefore: string): DigestMarket {
  return {
    ...m,
    advice: { ...m.advice, action: "wait", title, therefore },
  };
}

/** Зона и возврат к ней — уже вход. Объём CD не обязателен: его нет на каждой паре. */
export function applyLessons(markets: DigestMarket[]): DigestMarket[] {
  return markets.map((m) => {
    const live = m.advice.action === "long" || m.advice.action === "short";
    if (!live) return m;
    const id = m.spec.id;
    const zoned = m.setup.entry != null && m.setup.stop != null;
    const entry = m.setup.entry;
    const vol = m.volumeSpeak ?? "";
    const kept = (m.advice.metaScore ?? 0) >= 58;
    if (!kept && /против входа|не догонять сплэш/i.test(vol)) {
      return wait(m, "Слой объёма против", vol);
    }
    if (WEAK.has(id) && m.score < 52) {
      return wait(m, "Слабая пара", `${id} на архиве жгла. Нужен счёт ≥52 и зона.`);
    }
    if (CRYPTO.has(id) && m.score < 58) {
      return wait(m, "Крипта без набора", "По крипте слабо. Нужен счёт ≥58 и зона.");
    }
    const stop = m.setup.stop;
    if (entry != null && stop != null && m.spec.kind === "fx") {
      const pct = Math.abs(entry - stop) / Math.abs(entry);
      if (pct < 0.0012) {
        return wait(m, "Стоп слишком узкий", "Микростоп. Ждём блок пошире.");
      }
    }
    const rr = m.advice.netRr;
    if (rr != null && rr > 2.4 && m.score < 55) {
      return wait(m, "Цель слишком далеко", `RR ${rr.toFixed(2)} при слабом счёте. Режем жадность.`);
    }
    const pullback =
      zoned &&
      entry != null &&
      ((m.advice.action === "short" && entry > m.lastClose) ||
        (m.advice.action === "long" && entry < m.lastClose));
    const withTrend =
      (m.advice.action === "long" && m.bias === "bullish") ||
      (m.advice.action === "short" && m.bias === "bearish");
    if (!zoned) {
      return wait(m, "Ждать зону", "Без живого блока или имбаланса приказа нет.");
    }
    if (!kept && !withTrend && !pullback) {
      return wait(m, "Против старшей структуры", "Час один не берём. Вход только когда старший график смотрит туда же, либо лимитка на возврат в зону.");
    }
    const entryInPremium = entry != null && entry >= m.range.eq;
    const entryInDiscount = entry != null && entry <= m.range.eq;
    if (!kept && m.advice.action === "long" && entryInPremium && !pullback) {
      return wait(m, "Покупка дорого", "Вход в верхней части диапазона. Покупку ставим ниже, в зону.");
    }
    if (!kept && m.advice.action === "short" && entryInDiscount && !pullback) {
      return wait(m, "Продажа дёшево", "Вход в нижней части диапазона. Продажу ставим выше, в зону.");
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
