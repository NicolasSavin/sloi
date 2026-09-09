import { liveClusters } from "@/lib/broker-tape";
import { buildCirclePath, type CirclePath } from "@/lib/smc/micro";

export interface CorrSnap {
  status: "for" | "against" | "neutral";
  note: string;
}

const CROSS_LEGS: Record<string, { a: string; b: string; sa: 1 | -1; sb: 1 | -1 }> = {
  EURJPY: { a: "EURUSD", b: "USDJPY", sa: 1, sb: 1 },
  GBPJPY: { a: "GBPUSD", b: "USDJPY", sa: 1, sb: 1 },
  AUDJPY: { a: "AUDUSD", b: "USDJPY", sa: 1, sb: 1 },
  NZDJPY: { a: "NZDUSD", b: "USDJPY", sa: 1, sb: 1 },
  CADJPY: { a: "USDCAD", b: "USDJPY", sa: -1, sb: 1 },
  EURGBP: { a: "EURUSD", b: "GBPUSD", sa: 1, sb: -1 },
  EURAUD: { a: "EURUSD", b: "AUDUSD", sa: 1, sb: -1 },
  GBPAUD: { a: "GBPUSD", b: "AUDUSD", sa: 1, sb: -1 },
  EURCHF: { a: "EURUSD", b: "USDCHF", sa: 1, sb: -1 },
};

function lean(p: CirclePath): number {
  if (p.dir === "up") return p.pct - 50;
  if (p.dir === "down") return 50 - p.pct;
  return 0;
}

export function inheritCircle(id: string, close: number, nowSec: number): CirclePath | null {
  const spec = CROSS_LEGS[id];
  if (!spec) return null;
  const na = liveClusters(spec.a);
  const nb = liveClusters(spec.b);
  if (!na.length && !nb.length) return null;
  const pa = buildCirclePath(na, close, nowSec);
  const pb = buildCirclePath(nb, close, nowSec);
  const mixed = spec.sa * lean(pa) + spec.sb * lean(pb);
  const dir: CirclePath["dir"] = mixed > 3 ? "up" : mixed < -3 ? "down" : "flat";
  const pct = Math.round(Math.min(72, 50 + Math.abs(mixed) * 0.55));
  const because = `Кросс ${id} ← ${spec.a} ${pa.dir === "flat" ? "бок" : pa.dir === "up" ? "↑" : "↓"}${pa.pct}% и ${spec.b} ${pb.dir === "flat" ? "бок" : pb.dir === "up" ? "↑" : "↓"}${pb.pct}%. CD на мажорах, не на этом чарте.`;
  const therefore =
    dir === "flat"
      ? "Ноги спорят или пустые. Кросс без своей ленты — ждать диспетчера."
      : `По корреляции скорее ${dir === "up" ? "ВВЕРХ" : "ВНИЗ"} · ${pct}%. Шариков на кроссе нет — это вывод с ${spec.a}/${spec.b}.`;
  return { dir, pct, because, therefore, via: "cross" };
}

export function buildCorr(
  id: string,
  input: { dxyChange?: number | null; yieldChange?: number | null; oilChange?: number | null },
): CorrSnap {
  const dxy = input.dxyChange ?? 0;
  const yld = input.yieldChange ?? 0;
  const oil = input.oilChange ?? 0;
  const dxyUp = dxy > 0.15;
  const dxyDn = dxy < -0.15;
  const yldUp = yld > 0.4;
  const yldDn = yld < -0.4;
  const oilUp = oil > 0.6;
  const oilDn = oil < -0.6;

  if (id === "EURUSD" || id === "GBPUSD" || id === "AUDUSD" || id === "NZDUSD" || id.startsWith("EUR") || id.startsWith("GBP")) {
    if (dxyUp) return { status: "against", note: `DXY ${dxy >= 0 ? "+" : ""}${dxy.toFixed(2)}% — доллар в спросе, ветер против евро/фунта/аусси.` };
    if (dxyDn) return { status: "for", note: `DXY ${dxy.toFixed(2)}% — доллар слабеет, попутный фон для этой пары.` };
    return { status: "neutral", note: "Доллар без импульса. Корреляция не даёт стороны." };
  }
  if (id === "USDJPY" || id === "USDCHF" || id === "USDCAD") {
    if (id === "USDCAD" && oilUp) return { status: "against", note: `Нефть ${oil >= 0 ? "+" : ""}${oil.toFixed(1)}% — CAD чаще в спросе, лонг USDCAD против нефти.` };
    if (id === "USDCAD" && oilDn) return { status: "for", note: `Нефть ${oil.toFixed(1)}% — давление на CAD, попутный фон лонгу USDCAD.` };
    if (dxyUp) return { status: "for", note: `DXY ${dxy >= 0 ? "+" : ""}${dxy.toFixed(2)}% — доллар в спросе, попутный фон этой паре.` };
    if (dxyDn) return { status: "against", note: `DXY ${dxy.toFixed(2)}% — доллар отдают, ветер против USD-мажора.` };
    return { status: "neutral", note: "Доллар спокойный. Корреляция нейтральна." };
  }
  if (id === "XAUUSD" || id === "XAGUSD") {
    if (yldUp && dxyUp) return { status: "against", note: `Доходности и доллар растут — классический встречный ветер металлу.` };
    if (yldDn || dxyDn) return { status: "for", note: `Ставки/доллар слабеют — попутный фон золоту и серебру.` };
    return { status: "neutral", note: "Ставки и доллар без явного импульса для металла." };
  }
  if (id === "XTIUSD" || id === "XBRUSD") {
    if (dxyUp) return { status: "against", note: "Крепкий доллар часто давит нефть." };
    if (dxyDn) return { status: "for", note: "Слабый доллар — попутный фон нефти." };
    return { status: "neutral", note: "Нефть сейчас больше про свой спрос, чем про DXY." };
  }
  if (id === "XNGUSD") return { status: "neutral", note: "Газ слабо связан с DXY. Смотрите свой диапазон и погоду/запасы, не доллар." };
  if (id === "SPY" || id === "QQQ" || id === "DIA" || id === "IWM") {
    if (yldUp) return { status: "against", note: "Растущие доходности — ветер против индекса." };
    if (yldDn) return { status: "for", note: "Доходности падают — попутный фон риску." };
    return { status: "neutral", note: "Ставки не дают стороне по индексу." };
  }
  return { status: "neutral", note: "Для этого инструмента жёсткой корреляции с DXY/ставками нет." };
}
