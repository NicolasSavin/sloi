export interface CorrSnap {
  status: "for" | "against" | "neutral";
  note: string;
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
