import type { SymbolSpec } from "@/lib/market/types";
import type { SmcSnapshot, Zone } from "@/lib/smc/engine";
import { zoneName } from "@/lib/smc/engine";
import { decideMeta } from "@/lib/meta-engine";
import { formatPrice } from "@/lib/utils";

export type AdviceAction = "long" | "short" | "wait" | "skip";

export interface Advice {
  action: AdviceAction;
  title: string;
  because: string;
  therefore: string;
  spread: number;
  roundTrip: number;
  grossRisk: number | null;
  grossReward: number | null;
  netRisk: number | null;
  netReward: number | null;
  netRr: number | null;
  covers: number | null;
  metaScore?: number;
  metaStrategy?: string;
}

function chartLesson(
  snap: Pick<SmcSnapshot, "dealingRange" | "liquidity" | "fvgs" | "lastClose" | "divergences" | "flow" | "patterns">,
  side: "long" | "short",
): { title: string; because: string; therefore: string } | { note: string } {
  const px = snap.lastClose;
  const range = snap.dealingRange;
  if (px == null || !range || !(range.high > range.low)) {
    return {
      title: "Ждать закрытия часа",
      because: "Нет границы полки.",
      therefore: "Ордер заранее не ставим.",
    };
  }
  const live = (snap.divergences ?? []).filter((d) => !d.played);
  const cvd = snap.flow?.cvdDiv?.played ? null : snap.flow?.cvdDiv;
  const bear = live.some((d) => d.kind === "regular" && d.side === "bear") || cvd?.side === "bear";
  const bull = live.some((d) => d.kind === "regular" && d.side === "bull") || cvd?.side === "bull";
  const agrees = side === "long" ? bull && !bear : bear && !bull;
  if (!agrees) {
    return {
      title: bear || bull ? "Ждать: дивер против" : "Ждать: дивер не подтвердил",
      because:
        bear || bull
          ? "Дивер отделяет настоящий ход. Сейчас он смотрит в другую сторону."
          : "Без дивера полка и флаг пустые. Ход не отделён от шума.",
      therefore: "Ордера нет, пока дивер не встанет по стороне закрытия.",
    };
  }
  const figure = snap.patterns?.find((p) => /голова|двойн/.test(p.name));
  if (figure && figure.side !== (side === "long" ? "bull" : "bear")) {
    return {
      title: "Ждать: фигура против",
      because: `${figure.name} смотрит не туда, куда дивер.`,
      therefore: "Фигуру и дивер не рвём. Ордера нет.",
    };
  }
  const head = figure?.points.find((p) => p.label === "голова")?.price;
  if (head != null && ((side === "long" && px <= head) || (side === "short" && px >= head))) {
    return {
      title: "Ждать: голову сняли",
      because: "Экстремум фигуры уже пробит.",
      therefore: "План снят. Новую фигуру не дорисовываем на сломанной.",
    };
  }
  const pause = snap.patterns?.some((p) => /флаг|вымпел|треугольник/.test(p.name));
  const closedOut = side === "long" ? px >= range.high : px <= range.low;
  const reclaimed =
    side === "long"
      ? snap.liquidity?.some((l) => l.side === "sell" && l.swept && px > l.price)
      : snap.liquidity?.some((l) => l.side === "buy" && l.swept && px < l.price);
  if (!closedOut && !reclaimed) {
    return {
      title: "Ждать: час ещё внутри",
      because: figure
        ? `${figure.name} и дивер уже в одну сторону, но час ещё не закрылся за границей. Старое правило не снимаем.`
        : pause
          ? "Флаг, вымпел и полка сами по себе не вход. Нужен час, закрытый за границей."
          : "Полка сама по себе не вход. Нужен час, закрытый за границей, или съём и закрытие обратно.",
      therefore: "Лимит заранее не вешаем. Фигура без закрытия часа ордер не открывает.",
    };
  }
  const edge = snap.fvgs?.filter((z) => !z.mitigated && z.kind === "fvg").find((z) => {
    const lo = Math.min(z.top, z.bottom);
    const hi = Math.max(z.top, z.bottom);
    return side === "long" ? lo > px : hi < px;
  });
  const bothSwept =
    snap.liquidity?.some((l) => l.side === "sell" && l.swept) &&
    snap.liquidity?.some((l) => l.side === "buy" && l.swept);
  const figureNote = figure ? ` ${figure.name} и дивер в одну сторону.` : "";
  const sweptNote = bothSwept ? " Стопы сняты с обеих сторон, перекрытые дыры целью не ставим." : "";
  return {
    note: edge
      ? `${figureNote} Цель — ближний край открытого имбаланса, не весь прямоугольник.${sweptNote}`
      : `${figureNote} Имбаланса впереди нет — та же картинка, но слабее.${sweptNote}`,
  };
}

function blockUnderPrice(snap: Pick<SmcSnapshot, "orderBlocks" | "localSetup" | "lastClose">): Zone | null {
  const last = snap.lastClose;
  const zones = snap.orderBlocks ?? [];
  if (!Number.isFinite(last) || !zones.length) return null;
  const hit = zones.find((z) => {
    if (z.mitigated && z.kind === "ob") return false;
    const lo = Math.min(z.top, z.bottom);
    const hi = Math.max(z.top, z.bottom);
    const pad = Math.max((hi - lo) * 0.45, Math.abs(last) * 0.00035);
    return last >= lo - pad && last <= hi + pad;
  });
  if (hit) return hit;
  const e = snap.localSetup?.entry;
  if (e == null) return null;
  return (
    zones.find((z) => {
      const lo = Math.min(z.top, z.bottom);
      const hi = Math.max(z.top, z.bottom);
      return e >= lo && e <= hi;
    }) ?? null
  );
}

/** Regular div on the OB = block may fail. With-side / hidden = block is the turn. */
export function divOnOrderBlock(
  snap: Pick<SmcSnapshot, "orderBlocks" | "localSetup" | "lastClose" | "divergences" | "flow">,
  side: "long" | "short",
): { verdict: "confirm" | "wait" | "neutral"; title: string; because: string; therefore: string } {
  const z = blockUnderPrice(snap);
  const empty = { verdict: "neutral" as const, title: "", because: "", therefore: "" };
  if (!z) return empty;
  const name = zoneName(z);
  const blockLong = z.side === "bull";
  const div = snap.divergences?.[0];
  const hid = snap.divergences?.find((d) => d.kind === "hidden");
  const cvd = snap.flow?.cvdDiv;
  const rsiAgainst =
    div?.kind === "regular" &&
    ((blockLong && div.side === "bear") || (!blockLong && div.side === "bull"));
  const rsiWith =
    div?.kind === "regular" &&
    ((blockLong && div.side === "bull") || (!blockLong && div.side === "bear"));
  const cvdAgainst =
    Boolean(cvd) && ((blockLong && cvd!.side === "bear") || (!blockLong && cvd!.side === "bull"));
  const takingBlock = (side === "long") === blockLong;
  if (takingBlock && (rsiAgainst || cvdAgainst)) {
    return {
      verdict: "wait",
      title: "Дивер на ордерблоке",
      because: [`Цена в ${name}.`, rsiAgainst ? div!.note : "", cvdAgainst ? cvd!.because : ""]
        .filter(Boolean)
        .join(" "),
      therefore: blockLong
        ? "Бычий блок, покупки слабеют: цена ещё здесь, RSI/дельта уже нет. Часто пробой и брейкер. Лонг от блока не ставим."
        : "Медвежий блок, продажи выдыхаются. Шорт от блока — кормить разворот. Ждём CHoCH.",
    };
  }
  if (takingBlock && rsiWith) {
    return {
      verdict: "confirm",
      title: "",
      because: `Дивер на ${name} по стороне: ${div!.note}`,
      therefore: "Импульс в блок живой. Лимит в зону, не рынок сквозь него.",
    };
  }
  if (takingBlock && hid && ((blockLong && hid.side === "bull") || (!blockLong && hid.side === "bear"))) {
    return {
      verdict: "confirm",
      title: "",
      because: `Скрытая дивергенция на ${name}: ${hid.note}`,
      therefore: "Скрытая — откат в блок, не разворот. Лимит в блок по тренду.",
    };
  }
  return empty;
}

export function advise(snap: Pick<SmcSnapshot, "bias" | "trend" | "atr" | "lastChangePct" | "localSetup" | "margin" | "wyckoff" | "patterns" | "auction" | "ivNews" | "micro" | "divergences" | "flow" | "coil" | "lastClose" | "orderBlocks" | "dealingRange" | "liquidity" | "fvgs" | "reaction">, spec: SymbolSpec, spread = spec.spread): Advice {
  const roundTrip = spread * 2;
  const fmt = (n: number) => formatPrice(n, spec.decimals);
  const meta = decideMeta(snap, { spreadEats: false });
  const planned = meta.plan;
  const entry = planned?.entry ?? snap.localSetup.entry;
  const stop = planned?.stop ?? snap.localSetup.stop;
  const target = planned?.target ?? snap.localSetup.targets[0] ?? null;
  const setupSide: "long" | "short" | null =
    snap.localSetup.entry != null && snap.localSetup.targets[0] != null
      ? snap.localSetup.targets[0] > snap.localSetup.entry
        ? "long"
        : "short"
      : null;
  const callSide = meta.decision === "LONG" ? "long" : meta.decision === "SHORT" ? "short" : null;
  const side = planned ? callSide : callSide != null && callSide === setupSide ? callSide : null;

  if (entry == null || stop == null || target == null || side == null) {
    return {
      action: meta.decision === "PASS" ? "skip" : "wait",
      title: meta.decision === "PASS" ? "Пропуск" : "Ждать сценарий",
      because: meta.because,
      therefore: meta.therefore,
      spread,
      roundTrip,
      grossRisk: null,
      grossReward: null,
      netRisk: null,
      netReward: null,
      netRr: null,
      covers: null,
      metaScore: meta.score,
      metaStrategy: meta.strategy,
    };
  }

  const grossRisk = Math.abs(entry - stop);
  const grossReward = Math.abs(target - entry);
  const netRisk = grossRisk + spread;
  const netReward = grossReward - spread;
  const covers = roundTrip > 0 ? grossReward / roundTrip : null;
  const netRr = netRisk > 0 ? netReward / netRisk : null;
  const minCover = 1.2;
  const minRr = 0.95;
  if (netReward <= 0 || (covers != null && covers < minCover) || (netRr != null && netRr < minRr)) {
    return {
      action: "skip",
      title: "Пропуск: спред съедает ход",
      because: `Круг стоит ${fmt(roundTrip)} (спред ${fmt(spread)} × 2). До первой цели ${fmt(grossReward)}.`,
      therefore:
        netReward <= 0
          ? "После спреда прибыли нет даже до первой цели. Сигнал не берём."
          : `Чистый запас ${(covers ?? 0).toFixed(1)} круга и RR ${netRr?.toFixed(2) ?? "—"}. Мало, чтобы платить спред. ${meta.therefore}`,
      spread,
      roundTrip,
      grossRisk,
      grossReward,
      netRisk,
      netReward,
      netRr,
      covers,
      metaScore: meta.score,
      metaStrategy: meta.strategy,
    };
  }

  return {
    action: side,
    title: side === "long" ? `Лонг · ${meta.strategy}` : `Шорт · ${meta.strategy}`,
    because: meta.because,
    therefore: `${meta.therefore} Вход ${fmt(entry)}, стоп ${fmt(stop)}, цель ${fmt(target)}.`,
    spread,
    roundTrip,
    grossRisk,
    grossReward,
    netRisk,
    netReward,
    netRr,
    covers,
    metaScore: meta.score,
    metaStrategy: meta.strategy,
  };
}

export function actionLabel(action: AdviceAction): string {
  if (action === "long") return "Лонг";
  if (action === "short") return "Шорт";
  if (action === "skip") return "Пропуск";
  return "Ждать";
}

export function actionTone(action: AdviceAction): "bull" | "bear" | "warn" | "neutral" {
  if (action === "long") return "bull";
  if (action === "short") return "bear";
  if (action === "skip") return "warn";
  return "neutral";
}
