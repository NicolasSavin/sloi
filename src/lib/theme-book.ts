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
  const bestShort = [...shortUsd].sort(rank)[0];
  const bestLong = [...longUsd].sort(rank)[0];

  const eur = markets.find((m) => m.spec.id === "EURUSD");
  const gbp = markets.find((m) => m.spec.id === "GBPUSD");
  const smtBias =
    eur &&
    gbp &&
    ((eur.bias === "bullish" && gbp.bias === "bearish") || (eur.bias === "bearish" && gbp.bias === "bullish"));
  const smtLive =
    Boolean(eur && gbp && usdSide(eur) && usdSide(gbp) && usdSide(eur) !== usdSide(gbp));

  let keepShort: DigestMarket | undefined = bestShort;
  let keepLong: DigestMarket | undefined = bestLong;
  if (bestShort && bestLong && !smtLive) {
    if (bestShort.score >= bestLong.score) keepLong = undefined;
    else keepShort = undefined;
  }

  return markets.map((m) => {
    const side = usdSide(m);
    if (!side) return m;
    if (side === "shortUsd" && keepShort && m.spec.id !== keepShort.spec.id) {
      return waitTwin(m, keepShort.spec.label, "Сейчас несколько лонгов против доллара.");
    }
    if (side === "longUsd" && keepLong && m.spec.id !== keepLong.spec.id) {
      return waitTwin(m, keepLong.spec.label, "Сейчас несколько лонгов в доллар.");
    }
    if (smtLive && (m.spec.id === "EURUSD" || m.spec.id === "GBPUSD") && (m.advice.action === "long" || m.advice.action === "short")) {
      return {
        ...m,
        advice: {
          ...m.advice,
          therefore: `${m.advice.therefore} SMT: евро и фунт не согласны — держим расхождение, не оба в одну сторону.`,
        },
      };
    }
    if (smtBias && (m.spec.id === "EURUSD" || m.spec.id === "GBPUSD") && (m.advice.action === "long" || m.advice.action === "short") && !smtLive) {
      return {
        ...m,
        advice: {
          ...m.advice,
          therefore: `${m.advice.therefore} SMT на карте евро/фунт, приказ один — второй в ждать.`,
        },
      };
    }
    return m;
  });
}
