import type { DigestMarket } from "@/lib/digest";

interface Held {
  action: "long" | "short";
  entry: number;
  stop: number;
  target: number;
  since: number;
}

const g = globalThis as typeof globalThis & { __sloiHold__?: Map<string, Held> };

function bag() {
  if (!g.__sloiHold__) g.__sloiHold__ = new Map();
  return g.__sloiHold__;
}

export function isHeld(id: string) {
  return bag().has(id);
}

/** Держим приказ дольше — не мигаем WAIT каждые 20 мин. */
const MAX_MS = 6 * 60 * 60_000;

export function seedHold(
  rows: {
    symbol: string;
    action: "long" | "short";
    entry: number | null;
    stop: number | null;
    target: number | null;
    at?: number;
    status?: string;
  }[],
) {
  const hold = bag();
  if (hold.size) return;
  for (const r of rows) {
    if ((r.status ?? "open") !== "open") continue;
    if (r.entry == null || r.stop == null) continue;
    hold.set(r.symbol, {
      action: r.action,
      entry: r.entry,
      stop: r.stop,
      target: r.target ?? 0,
      since: r.at ?? Date.now(),
    });
  }
}

/**
 * Пока есть живой приказ (или hold) — не отдаём WAIT из‑за шума H1.
 * Снимаем только: новость/пауза после стопа, цена пробила stop, 6ч, или встречный
 * живой приказ (лонг→шорт) с новым entry.
 */
export function applyHold(markets: DigestMarket[]): DigestMarket[] {
  const hold = bag();
  const now = Date.now();
  return markets.map((m) => {
    const live = m.advice.action === "long" || m.advice.action === "short";
    const entry = m.setup.entry;
    const stop = m.setup.stop;
    const prev = hold.get(m.spec.id);

    if (live && entry != null && stop != null) {
      const action = m.advice.action as "long" | "short";
      // Встречный живой приказ — принимаем (разворот), не «шум WAIT».
      if (prev && prev.action !== action) {
        hold.set(m.spec.id, {
          action,
          entry,
          stop,
          target: m.setup.targets[0] ?? 0,
          since: now,
        });
        return {
          ...m,
          advice: {
            ...m.advice,
            therefore:
              (m.advice.therefore ?? "") +
              " Смена стороны: новый приказ сменил предыдущий hold.",
          },
        };
      }
      hold.set(m.spec.id, {
        action,
        entry,
        stop,
        target: m.setup.targets[0] ?? 0,
        since: prev?.action === action ? prev.since : now,
      });
      // Уже в hold той же стороны — плашка «держим».
      if (prev?.action === action) {
        return {
          ...m,
          advice: {
            ...m.advice,
            title: "Держим приказ",
            therefore:
              "Приказ не снимаем из‑за шума H1. Снимаем только стоп, новость, 6ч или встречный приказ.",
          },
        };
      }
      return m;
    }

    if (!prev) return m;

    // Жёсткие причины снять hold
    if (/Стоп: новость|Стоп: крупная|Пауза после стопа|Торговля запрещена/.test(m.advice.title)) {
      hold.delete(m.spec.id);
      return m;
    }
    if (now - prev.since > MAX_MS) {
      hold.delete(m.spec.id);
      return m;
    }
    if (prev.action === "long" && m.lastClose <= prev.stop) {
      hold.delete(m.spec.id);
      return m;
    }
    if (prev.action === "short" && m.lastClose >= prev.stop) {
      hold.delete(m.spec.id);
      return m;
    }

    // WAIT / слабый счёт / bias flip — НЕ снимаем. Держим прежние уровни.
    return {
      ...m,
      advice: {
        ...m.advice,
        action: prev.action,
        title: "Держим приказ",
        therefore:
          "Стол не мигает WAIT: приказ с сайта держим. Снимаем только стоп, новость, 6 часов или встречный живой приказ.",
      },
      setup: {
        ...m.setup,
        entry: prev.entry,
        stop: prev.stop,
        targets: prev.target ? [prev.target, ...m.setup.targets.slice(1)] : m.setup.targets,
      },
    };
  });
}

export function applyCool(
  markets: DigestMarket[],
  stopped: Map<string, number>,
  ms = 50 * 60_000,
): DigestMarket[] {
  const now = Date.now();
  return markets.map((m) => {
    const at = stopped.get(m.spec.id);
    if (at == null || now - at > ms) return m;
    if (m.advice.action !== "long" && m.advice.action !== "short") return m;
    const min = Math.max(1, Math.round((ms - (now - at)) / 60_000));
    return {
      ...m,
      advice: {
        ...m.advice,
        action: "wait",
        title: "Пауза после стопа",
        therefore: `Сайт: по этой паре стоп ${min} мин назад. Не входим, пока не выйдет пауза.`,
      },
    };
  });
}

/** Keep at most 4 live orders; already-held symbols stay. */
export function capLive(markets: DigestMarket[], max = 4): DigestMarket[] {
  const live = markets.filter((m) => m.advice.action === "long" || m.advice.action === "short");
  if (live.length <= max) return markets;
  const heldIds = new Set(live.filter((m) => isHeld(m.spec.id)).map((m) => m.spec.id));
  const ranked = [...live].sort((a, b) => {
    const ha = heldIds.has(a.spec.id) ? 1 : 0;
    const hb = heldIds.has(b.spec.id) ? 1 : 0;
    return hb - ha || b.score - a.score;
  });
  const keep = new Set(ranked.slice(0, max).map((m) => m.spec.id));
  return markets.map((m) => {
    if (m.advice.action !== "long" && m.advice.action !== "short") return m;
    if (keep.has(m.spec.id)) return m;
    return {
      ...m,
      advice: {
        ...m.advice,
        action: "wait",
        title: "Не в топ дня",
        therefore: `Живых приказов не больше ${max}. Этот слабее по счёту (${m.score}/100).`,
      },
    };
  });
}
