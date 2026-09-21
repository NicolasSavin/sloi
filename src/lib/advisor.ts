import type { SymbolSpec } from "@/lib/market/types";
import type { SmcSnapshot, Zone } from "@/lib/smc/engine";
import { zoneName } from "@/lib/smc/engine";
import { entryVolume } from "@/lib/smc/micro";
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

export function advise(snap: Pick<SmcSnapshot, "bias" | "localSetup" | "margin" | "wyckoff" | "patterns" | "auction" | "ivNews" | "micro" | "divergences" | "flow" | "coil" | "lastClose" | "orderBlocks">, spec: SymbolSpec, spread = spec.spread): Advice {
  const roundTrip = spread * 2;
  const entry = snap.localSetup.entry;
  const stop = snap.localSetup.stop;
  const target = snap.localSetup.targets[0] ?? null;
  const fmt = (n: number) => formatPrice(n, spec.decimals);

  if (entry == null || stop == null || target == null) {
    return {
      action: "wait",
      title: "Ждать край диапазона",
      because: "Нет зоны входа со стопом и целью. Спред в середине только увеличивает шум.",
      therefore: "Лимитку не ставим, пока нет блока/FVG с запасом хода.",
      spread,
      roundTrip,
      grossRisk: null,
      grossReward: null,
      netRisk: null,
      netReward: null,
      netRr: null,
      covers: null,
    };
  }

  const side: "long" | "short" = target > entry ? "long" : "short";
  const grossRisk = Math.abs(entry - stop);
  const grossReward = Math.abs(target - entry);
  const netRisk = grossRisk + spread;
  const netReward = grossReward - spread;
  const covers = roundTrip > 0 ? grossReward / roundTrip : null;
  const netRr = netRisk > 0 ? netReward / netRisk : null;

  const minCover = 1.12;
  const minRr = 0.75;
  if (netReward <= 0 || (covers != null && covers < minCover) || (netRr != null && netRr < minRr)) {
    return {
      action: "skip",
      title: "Пропуск: спред съедает ход",
      because: `Круг стоит ${fmt(roundTrip)} (спред ${fmt(spread)} × 2). До первой цели ${fmt(grossReward)}.`,
      therefore:
        netReward <= 0
          ? "После спреда прибыли нет даже до первой цели. Сигнал не берём."
          : `Чистый запас ${(covers ?? 0).toFixed(1)} круга и RR ${netRr?.toFixed(2) ?? "—"}. Мало, чтобы платить спред.`,
      spread,
      roundTrip,
      grossRisk,
      grossReward,
      netRisk,
      netReward,
      netRr,
      covers,
    };
  }

  if (snap.wyckoff?.event === "utad" && side === "long") {
    return {
      action: "wait",
      title: "Ждать: Вайкофф раздаёт вверху",
      because: snap.wyckoff.because,
      therefore: snap.wyckoff.therefore,
      spread,
      roundTrip,
      grossRisk,
      grossReward,
      netRisk,
      netReward,
      netRr,
      covers,
    };
  }
  if (snap.wyckoff?.event === "spring" && side === "short") {
    return {
      action: "wait",
      title: "Ждать: Вайкофф набирает внизу",
      because: snap.wyckoff.because,
      therefore: snap.wyckoff.therefore,
      spread,
      roundTrip,
      grossRisk,
      grossReward,
      netRisk,
      netReward,
      netRr,
      covers,
    };
  }
  if (snap.wyckoff?.phase === "distribution" && side === "long") {
    return {
      action: "wait",
      title: "Ждать: фаза раздачи",
      because: snap.wyckoff.because,
      therefore: "В distribution лонг — кормить выход. Шорт от премии, не ловить хай.",
      spread,
      roundTrip,
      grossRisk,
      grossReward,
      netRisk,
      netReward,
      netRr,
      covers,
    };
  }
  if (snap.wyckoff?.phase === "accumulation" && side === "short") {
    return {
      action: "wait",
      title: "Ждать: фаза набора",
      because: snap.wyckoff.because,
      therefore: "В accumulation шорт — против крупняка. Лонг после спринга, не сам вынос.",
      spread,
      roundTrip,
      grossRisk,
      grossReward,
      netRisk,
      netReward,
      netRr,
      covers,
    };
  }
  if (snap.ivNews?.phase === "crush") {
    return {
      action: "wait",
      title: "Ждать: IV crush после новости",
      because: snap.ivNews.because,
      therefore: snap.ivNews.therefore,
      spread,
      roundTrip,
      grossRisk,
      grossReward,
      netRisk,
      netReward,
      netRr,
      covers,
    };
  }
  if (snap.auction?.orb === "broke-high" && side === "short") {
    return {
      action: "wait",
      title: "Ждать: ORB вверх, не шортить середину",
      because: snap.auction.because,
      therefore: snap.auction.therefore,
      spread,
      roundTrip,
      grossRisk,
      grossReward,
      netRisk,
      netReward,
      netRr,
      covers,
    };
  }
  if (snap.auction?.orb === "broke-low" && side === "long") {
    return {
      action: "wait",
      title: "Ждать: ORB вниз, не ловить дно",
      because: snap.auction.because,
      therefore: snap.auction.therefore,
      spread,
      roundTrip,
      grossRisk,
      grossReward,
      netRisk,
      netReward,
      netRr,
      covers,
    };
  }
  if (snap.auction?.vol === "compressed" && netRr != null && netRr < 1.8 && snap.coil?.kind !== "coil") {
    return {
      action: "skip",
      title: "Пропуск: волатильность сжата",
      because: snap.auction.because,
      therefore: "Ход короткий. Спред съест цель. Ждём расширение или ближе край IB.",
      spread,
      roundTrip,
      grossRisk,
      grossReward,
      netRisk,
      netReward,
      netRr,
      covers,
    };
  }
  if (snap.coil?.kind === "spike") {
    const chase =
      (side === "long" && snap.coil.dir === "up") || (side === "short" && snap.coil.dir === "down");
    if (chase) {
      return {
        action: "wait",
        title: "Ждать: шпиль без полки",
        because: snap.coil.because,
        therefore: snap.coil.therefore,
        spread,
        roundTrip,
        grossRisk,
        grossReward,
        netRisk,
        netReward,
        netRr,
        covers,
      };
    }
  }
  const vol = entryVolume(side, snap.micro, snap.lastClose ?? entry, entry);
  if (vol.verdict === "wait") {
    return {
      action: "wait",
      title: vol.title,
      because: vol.because,
      therefore: vol.therefore,
      spread,
      roundTrip,
      grossRisk,
      grossReward,
      netRisk,
      netReward,
      netRr,
      covers,
    };
  }
  const onBlk = divOnOrderBlock(snap, side);
  if (onBlk.verdict === "wait") {
    return {
      action: "wait",
      title: onBlk.title,
      because: onBlk.because,
      therefore: onBlk.therefore,
      spread,
      roundTrip,
      grossRisk,
      grossReward,
      netRisk,
      netReward,
      netRr,
      covers,
    };
  }
  const cvd = snap.flow?.cvdDiv;
  const atEdge = cvd?.where === "edge" || snap.margin.upper.active || snap.margin.lower.active;
  const div = snap.divergences?.[0];
  if (
    atEdge &&
    div?.kind === "regular" &&
    ((side === "long" && div.side === "bear") || (side === "short" && div.side === "bull"))
  ) {
    return {
      action: "wait",
      title: div.side === "bear" ? "Ждать: медвежья дивергенция на краю" : "Ждать: бычья дивергенция на краю",
      because: div.note,
      therefore: "Дивер на краю зоны. Против него лимитку не ставим.",
      spread,
      roundTrip,
      grossRisk,
      grossReward,
      netRisk,
      netReward,
      netRr,
      covers,
    };
  }
  if (cvd && cvd.where === "edge" && ((side === "long" && cvd.side === "bear") || (side === "short" && cvd.side === "bull"))) {
    return {
      action: "wait",
      title: "Ждать: объём против на краю",
      because: cvd.because,
      therefore: cvd.therefore,
      spread,
      roundTrip,
      grossRisk,
      grossReward,
      netRisk,
      netReward,
      netRr,
      covers,
    };
  }
  const inf = snap.micro?.infusion;
  const hid = snap.divergences?.find((d) => d.kind === "hidden");
  const hidNote =
    hid && ((hid.side === "bull" && side === "long") || (hid.side === "bear" && side === "short"))
      ? " Скрытая дивергенция по стороне — откат, не разворот."
      : hid && ((hid.side === "bear" && side === "long") || (hid.side === "bull" && side === "short"))
        ? " Скрытая дивергенция против — лимит, не рынок."
        : "";
  const infNote = inf
    ? inf.side === (side === "long" ? "sell" : "buy")
      ? " Цель — вливание Каташева (остановка)."
      : " Вливание по стороне входа — от лужи, не сквозь."
    : "";
  const fight = snap.patterns?.find((p) => (p.side === "bear" && side === "long") || (p.side === "bull" && side === "short"));
  const patNote = fight ? ` На графике ${fight.name} против — лимит всё равно, рынок нет.` : "";
  const marginNote =
    snap.margin?.where === "upper" && side === "long"
      ? " Цена в верхней марже — лимитка ниже, не рынок."
      : snap.margin?.where === "lower" && side === "short"
        ? " Цена в нижней марже — лимитка выше, не рынок."
        : "";
  const coilNote =
    snap.coil?.kind === "coil"
      ? " Полка у уровня — пробой скорее живой, сжатие не режем."
      : snap.coil?.kind === "spike"
        ? " Шпиль без полки — лимит на возврат, не рынок вдогонку."
        : "";
  const volNote =
    cvd && cvd.where === "edge" && ((side === "long" && cvd.side === "bull") || (side === "short" && cvd.side === "bear"))
      ? ` ${cvd.therefore}`
      : cvd && cvd.where === "mid"
        ? " Дивер в середине не считаю."
        : "";

  const blkNote = onBlk.verdict === "confirm" ? ` ${onBlk.therefore}` : "";
  const volOk = vol.verdict === "confirm" ? ` ${vol.therefore}` : vol.because ? ` ${vol.therefore}` : "";

  return {
    action: side,
    title:
      vol.verdict === "confirm" && vol.title
        ? vol.title
        : side === "long"
          ? "Лимит на покупку в зоне"
          : "Лимит на продажу в зоне",
    because: `Вход ${fmt(entry)}, стоп ${fmt(stop)}, цель ${fmt(target)}. Круг ${fmt(roundTrip)}.${vol.verdict === "confirm" ? ` ${vol.because}` : ""}`,
    therefore: `Чистый RR ${netRr?.toFixed(2)}. Ордер вешаем заранее, пока цена идёт к зоне.${blkNote}${marginNote}${patNote}${infNote}${hidNote}${coilNote}${volNote}${volOk}`,
    spread,
    roundTrip,
    grossRisk,
    grossReward,
    netRisk,
    netReward,
    netRr,
    covers,
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
