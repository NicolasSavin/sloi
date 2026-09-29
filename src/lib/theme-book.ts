import type { DigestMarket } from "@/lib/digest";

/** Лонг этих = короткая ставка на доллар. */
const SHORT_USD = new Set(["EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "XAUUSD", "XAGUSD"]);
/** Лонг этих = длинная ставка на доллар. */
const LONG_USD = new Set(["USDJPY", "USDCHF", "USDCAD"]);

function usdSide(m: DigestMarket): "shortUsd" | "longUsd" | null {
  const a = m.advice.action;
  if (a !== "long" && a !== "short") return null;
  if (SHORT_USD.has(m.spec.id)) return a === "long" ? "shortUsd" : "longUsd";
  if (LONG_USD.has(m.spec.id)) return a === "long" ? "longUsd" : "shortUsd";
  return null;
}

function waitTwin(m: DigestMarket, winner: string, theme: string): DigestMarket {
  return {
    ...m,
    advice: {
      ...m.advice,
      action: "wait",
      title: "Ждать: одна ставка на доллар",
      therefore: `${theme} Лучше ${winner} (выше счёт). Три стопа подряд из одной темы доллара — уже было.`,
    },
  };
}

export function applyThemeBook(markets: DigestMarket[]): DigestMarket[] {
  const live = markets.filter((m) => usdSide(m));
  const shortUsd = live.filter((m) => usdSide(m) === "shortUsd");
  const longUsd = live.filter((m) => usdSide(m) === "longUsd");

  const rank = (a: DigestMarket, b: DigestMarket) => b.score - a.score || a.spec.id.localeCompare(b.spec.id);
  const keepShort = new Set([...shortUsd].sort(rank).slice(0, 3).map((m) => m.spec.id));
  const keepLong = new Set([...longUsd].sort(rank).slice(0, 3).map((m) => m.spec.id));

  return markets.map((m) => {
    const side = usdSide(m);
    if (!side) return m;
    if (side === "shortUsd" && keepShort.size && !keepShort.has(m.spec.id)) {
      const winner = shortUsd.find((x) => keepShort.has(x.spec.id));
      return waitTwin(m, winner?.spec.label ?? "лидер", "Против доллара уже три приказа. Этот слабее.");
    }
    if (side === "longUsd" && keepLong.size && !keepLong.has(m.spec.id)) {
      const winner = longUsd.find((x) => keepLong.has(x.spec.id));
      return waitTwin(m, winner?.spec.label ?? "лидер", "В доллар уже три приказа. Этот слабее.");
    }
    return m;
  });
}
