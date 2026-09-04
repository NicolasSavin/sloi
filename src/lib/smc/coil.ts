import type { Candle } from "@/lib/market/types";

export type CoilKind = "coil" | "spike" | "none";

export interface CoilBreak {
  kind: CoilKind;
  dir: "up" | "down" | "flat";
  level: number;
  because: string;
  therefore: string;
}

function tr(c: Candle, p: Candle) {
  return Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
}

export function buildCoilBreak(
  candles: Candle[],
  atr: number,
  swings: { type: "high" | "low"; price: number }[],
): CoilBreak {
  const none: CoilBreak = {
    kind: "none",
    dir: "flat",
    level: candles.at(-1)?.close ?? 0,
    because: "Нет полки у края и нет голого шпиля.",
    therefore: "Обычный подход. Правило пробоя не трогает приказ.",
  };
  if (candles.length < 12 || atr <= 0) return none;
  const last = candles.at(-1)!;
  const body = candles.slice(0, -1);
  const look = body.slice(-20);
  const swingHi = [...swings].reverse().find((s) => s.type === "high");
  const swingLo = [...swings].reverse().find((s) => s.type === "low");
  const lvlHigh = swingHi?.price ?? Math.max(...look.map((c) => c.high));
  const lvlLow = swingLo?.price ?? Math.min(...look.map((c) => c.low));

  const coilBars = body.slice(-7);
  const coilHi = Math.max(...coilBars.map((c) => c.high));
  const coilLo = Math.min(...coilBars.map((c) => c.low));
  const coilSpan = coilHi - coilLo;
  const avgRange = coilBars.reduce((a, c, i) => a + (i ? tr(c, coilBars[i - 1]!) : c.high - c.low), 0) / coilBars.length;
  const tight = coilSpan <= atr * 0.75 && avgRange <= atr * 0.48;
  const atHigh = tight && Math.abs(coilHi - lvlHigh) <= atr * 0.28;
  const atLow = tight && Math.abs(coilLo - lvlLow) <= atr * 0.28;

  const lastRange = last.high - last.low;
  const prev = candles.at(-2)!;
  const prevRange = prev.high - prev.low;
  const sharp = lastRange >= atr * 1.15 || (lastRange + prevRange) / 2 >= atr * 1.05;
  const pierceUp = last.high > lvlHigh + atr * 0.12;
  const pierceDn = last.low < lvlLow - atr * 0.12;
  const closeBack =
    (pierceUp && last.close < lvlHigh) || (pierceDn && last.close > lvlLow);
  const closeThrough = (pierceUp && last.close > lvlHigh) || (pierceDn && last.close < lvlLow);

  if ((atHigh || atLow) && closeThrough) {
    const dir = atHigh && pierceUp ? "up" : "down";
    const level = dir === "up" ? lvlHigh : lvlLow;
    return {
      kind: "coil",
      dir,
      level,
      because: `Микрополка у ${dir === "up" ? "сопротивления" : "поддержки"} ${level.toFixed(last.close > 50 ? 2 : 5)}: сжатие ${(coilSpan / atr).toFixed(2)} ATR.`,
      therefore: "Полка у края — чаще живой пробой. Не резать вход только из‑за сжатия ATR.",
    };
  }
  if ((atHigh || atLow) && !sharp) {
    const dir = atHigh ? "up" : "down";
    const level = dir === "up" ? lvlHigh : lvlLow;
    return {
      kind: "coil",
      dir,
      level,
      because: `Цена прижалась полкой к ${dir === "up" ? "верху" : "низу"} ${level.toFixed(last.close > 50 ? 2 : 5)}.`,
      therefore: "Крупняк часто набирает у края. Ждём выход из полки, не шпиль из середины.",
    };
  }
  if (sharp && (pierceUp || pierceDn) && !atHigh && !atLow) {
    const dir = pierceUp ? "up" : "down";
    const level = dir === "up" ? lvlHigh : lvlLow;
    return {
      kind: "spike",
      dir,
      level,
      because: `Голый шпиль сквозь ${dir === "up" ? "верх" : "низ"} ${level.toFixed(last.close > 50 ? 2 : 5)} без полки.${closeBack ? " Закрытие обратно внутрь." : ""}`,
      therefore: closeBack
        ? "Скорее ложный пробой: стопы сняли, ждать возврат к уровню, не догонять шпиль."
        : "Резкий пробой без набора. Не входить вдогонку — дать цене вернуться к краю.",
    };
  }
  return none;
}
