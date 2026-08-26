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

const MAX_MS = 4 * 60 * 60_000;

export function seedHold(rows: { symbol: string; action: "long" | "short"; entry: number | null; stop: number | null; target: number | null; at?: number; status?: string }[]) {
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

export function applyHold(markets: DigestMarket[]): DigestMarket[] {
  const hold = bag();
  const now = Date.now();
  return markets.map((m) => {
    const live = m.advice.action === "long" || m.advice.action === "short";
    const entry = m.setup.entry;
    const stop = m.setup.stop;
    if (live && entry != null && stop != null) {
      const prev = hold.get(m.spec.id);
      const action = m.advice.action as "long" | "short";
      hold.set(m.spec.id, {
        action,
        entry,
        stop,
        target: m.setup.targets[0] ?? 0,
        since: prev?.action === action ? prev.since : now,
      });
      return m;
    }
    const prev = hold.get(m.spec.id);
    if (!prev) return m;
    if (/Стоп: новость|Стоп: крупная|Пауза после стопа/.test(m.advice.title)) {
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
    if (prev.action === "long" && m.bias === "bearish") {
      hold.delete(m.spec.id);
      return m;
    }
    if (prev.action === "short" && m.bias === "bullish") {
      hold.delete(m.spec.id);
      return m;
    }
    return {
      ...m,
      advice: {
        ...m.advice,
        action: prev.action,
        title: "Держим приказ",
        therefore:
          "Приказ с сайта не снимаем из‑за шума, «поздно» или слабого счёта. Снимаем только стоп, новость или встречный характер.",
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

export function applyCool(markets: DigestMarket[], stopped: Map<string, number>, ms = 50 * 60_000): DigestMarket[] {
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
