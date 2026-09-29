import type { SmcSnapshot } from "@/lib/smc/engine";

type Side = "long" | "short";

export interface MetaRead {
  regime: string;
  strategy: string;
  score: number;
  fors: string[];
  against: string[];
  valid: boolean;
}

function wantSide(side: Side): "bull" | "bear" {
  return side === "long" ? "bull" : "bear";
}

/** Regime, then one strategy. A disagreeing module lowers the score. It does not delete the setup. */
export function judgeMeta(
  snap: Pick<
    SmcSnapshot,
    | "bias"
    | "trend"
    | "orderBlocks"
    | "fvgs"
    | "liquidity"
    | "flow"
    | "micro"
    | "wyckoff"
    | "divergences"
    | "auction"
    | "coil"
    | "margin"
  >,
  side: Side,
): MetaRead {
  const bull = wantSide(side);
  const fors: string[] = [];
  const against: string[] = [];
  let impulse = 0;

  const ob = (snap.orderBlocks ?? []).some(
    (z) => !z.mitigated && z.side === bull && (z.kind === "ob" || z.kind === "mitigation" || z.kind === "breaker"),
  );
  if (ob) {
    impulse += 25;
    fors.push(side === "long" ? "бычий ордерблок" : "медвежий ордерблок");
  }
  const fvg = (snap.fvgs ?? []).some((z) => !z.mitigated && z.kind === "fvg" && z.side === bull);
  if (fvg) {
    impulse += 15;
    fors.push(side === "long" ? "бычий имбаланс" : "медвежий имбаланс");
  }
  const splash = snap.micro?.splash;
  const splashWith =
    splash != null &&
    ((side === "long" && splash.side === "buy") || (side === "short" && splash.side === "sell")) &&
    snap.micro?.splashDelta?.verdict === "continue";
  if (splashWith) {
    impulse += 15;
    fors.push("всплеск и дельта в сторону хода");
  }
  const delta = snap.micro?.footprint.delta ?? snap.flow?.lastDelta ?? 0;
  const deltaWith = (side === "long" && delta > 0) || (side === "short" && delta < 0);
  if (deltaWith) {
    impulse += 15;
    fors.push("дельта по стороне");
  }
  const swept =
    side === "long"
      ? snap.liquidity?.some((l) => l.side === "sell" && l.swept)
      : snap.liquidity?.some((l) => l.side === "buy" && l.swept);
  if (swept) {
    impulse += 20;
    fors.push("ликвидность по пути уже снята");
  }
  const structureWith =
    (side === "long" && (snap.bias === "bullish" || snap.trend === "up")) ||
    (side === "short" && (snap.bias === "bearish" || snap.trend === "down"));
  if (structureWith) {
    impulse += 5;
    fors.push("структура по стороне");
  }
  const cvd = snap.flow?.cvdDiv;
  const cvdWith = cvd && ((side === "long" && cvd.side === "bull") || (side === "short" && cvd.side === "bear"));
  if (cvdWith) {
    impulse += 5;
    fors.push("CVD по стороне");
  }

  const where = snap.micro?.where;
  const vwapAgainst = (side === "long" && where === "below") || (side === "short" && where === "above");
  if (vwapAgainst) {
    impulse -= 3;
    against.push("VWAP против — контекст, не запрет");
  }
  const div = (snap.divergences ?? []).find((d) => !d.played && d.kind === "regular");
  const divAgainst = div && ((side === "long" && div.side === "bear") || (side === "short" && div.side === "bull"));
  if (divAgainst) {
    impulse -= 5;
    against.push("дивер против — слабый штраф");
  }
  const wyAgainst =
    (side === "long" && (snap.wyckoff?.event === "utad" || snap.wyckoff?.phase === "distribution")) ||
    (side === "short" && (snap.wyckoff?.event === "spring" || snap.wyckoff?.phase === "accumulation"));
  if (wyAgainst) {
    impulse -= 4;
    against.push("Вайкофф не в эту сторону");
  }

  const cores = [ob, fvg, splashWith || deltaWith, swept].filter(Boolean).length;
  const impulseOk = impulse >= 55 && cores >= 3;

  let trend = structureWith ? 40 : 0;
  if (deltaWith) trend += 15;
  if (splashWith) trend += 10;
  if (vwapAgainst) trend -= 8;
  if (divAgainst) trend -= 6;
  const trendOk = trend >= 48 && structureWith;

  let reversal = 0;
  if (divAgainst) reversal += 25;
  if (swept) reversal += 20;
  if (vwapAgainst) reversal += 15;
  if (snap.margin?.upper.active && side === "short") reversal += 10;
  if (snap.margin?.lower.active && side === "long") reversal += 10;
  const reversalOk = reversal >= 45 && Boolean(divAgainst);

  let strategy = "нет своей стратегии";
  let score = impulse;
  if (impulseOk) {
    strategy = "Order Flow Impulse";
    score = impulse;
  } else if (trendOk && trend >= reversal) {
    strategy = "ход по структуре";
    score = trend;
  } else if (reversalOk) {
    strategy = "возврат от края";
    score = reversal;
  }

  const impulseWord =
    snap.trend === "up" ? "бычий импульс" : snap.trend === "down" ? "медвежий импульс" : "диапазон";
  const regime = `${impulseWord}${swept ? " после снятия ликвидности" : ""}${where === "above" ? ", выше VWAP" : where === "below" ? ", ниже VWAP" : ""}`;

  return {
    regime,
    strategy,
    score: Math.max(0, Math.min(100, score)),
    fors,
    against,
    valid: impulseOk || trendOk || reversalOk,
  };
}
