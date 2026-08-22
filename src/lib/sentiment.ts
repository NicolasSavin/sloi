export interface SentimentSnap {
  risk: "risk-on" | "risk-off" | "mixed";
  vix: number | null;
  vixChange: number | null;
  dxy: number | null;
  dxyChange: number | null;
  retail: "chasing-long" | "chasing-short" | "flat";
  smart: "accumulating" | "distributing" | "waiting";
  line: string;
}

export function buildSentiment(input: {
  vix: { price: number; changePct: number } | null;
  dxy: { price: number; changePct: number } | null;
  bias: "bullish" | "bearish" | "range";
  premiumDiscount: "premium" | "discount" | "equilibrium";
}): SentimentSnap {
  const vix = input.vix?.price ?? null;
  const vixChange = input.vix?.changePct ?? null;
  const dxy = input.dxy?.price ?? null;
  const dxyChange = input.dxy?.changePct ?? null;

  let risk: SentimentSnap["risk"] = "mixed";
  if (vix != null) {
    if (vix >= 22 || (vixChange != null && vixChange > 6)) risk = "risk-off";
    else if (vix <= 14 && (vixChange == null || vixChange < 3)) risk = "risk-on";
  }

  let retail: SentimentSnap["retail"] = "flat";
  let smart: SentimentSnap["smart"] = "waiting";
  if (input.bias === "bullish" && input.premiumDiscount === "premium") {
    retail = "chasing-long";
    smart = "distributing";
  } else if (input.bias === "bullish" && input.premiumDiscount === "discount") {
    retail = "flat";
    smart = "accumulating";
  } else if (input.bias === "bearish" && input.premiumDiscount === "discount") {
    retail = "chasing-short";
    smart = "accumulating";
  } else if (input.bias === "bearish" && input.premiumDiscount === "premium") {
    retail = "flat";
    smart = "distributing";
  }

  const vixBit =
    vix != null
      ? `VIX ${vix.toFixed(1)}${vixChange != null ? ` (${vixChange >= 0 ? "+" : ""}${vixChange.toFixed(1)}%)` : ""} — ${risk === "risk-off" ? "рынок нервный, риск выключают" : risk === "risk-on" ? "страх низкий, ритейл спокойно сидит в риске" : "нейтральный фон"}`
      : "индекс страха сейчас недоступен";
  const dxyBit =
    dxy != null
      ? `доллар ${dxy.toFixed(2)}${dxyChange != null ? ` (${dxyChange >= 0 ? "+" : ""}${dxyChange.toFixed(1)}%)` : ""} — ${dxyChange != null && dxyChange > 0.2 ? "доллар в спросе, давление на золото и евро" : dxyChange != null && dxyChange < -0.2 ? "доллар слабеет, попутный фон для золота и евро" : "доллар без явного импульса"}`
      : "индекс доллара недоступен";
  const posBit =
    smart === "accumulating"
      ? "по структуре крупняк набирает, ритейл ещё не в тренде"
      : smart === "distributing"
        ? "ритейл уже догоняет у края диапазона — классика, когда крупняк начинает раздавать"
        : "оба сидят в середине: сентимент не даёт стороны";

  return {
    risk,
    vix,
    vixChange,
    dxy,
    dxyChange,
    retail,
    smart,
    line: `Сентимент: ${vixBit}. ${dxyBit}. ${posBit}.`,
  };
}
