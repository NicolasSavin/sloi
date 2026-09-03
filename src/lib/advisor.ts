import type { SymbolSpec } from "@/lib/market/types";
import type { SmcSnapshot } from "@/lib/smc/engine";
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

export function advise(snap: Pick<SmcSnapshot, "bias" | "localSetup" | "margin" | "wyckoff" | "patterns" | "auction" | "ivNews">, spec: SymbolSpec, spread = spec.spread): Advice {
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

  if (netReward <= 0 || (covers != null && covers < 2) || (netRr != null && netRr < 1.45)) {
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
  if (snap.auction?.vol === "compressed" && netRr != null && netRr < 1.8) {
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
  const marginNote =
    snap.margin?.where === "upper" && side === "long"
      ? " Цена в верхней марже — лимитка ниже, не рынок."
      : snap.margin?.where === "lower" && side === "short"
        ? " Цена в нижней марже — лимитка выше, не рынок."
        : "";
  const patNote = fight ? ` На графике ${fight.name} против — лимит всё равно, рынок нет.` : "";

  return {
    action: side,
    title: side === "long" ? "Лимит на покупку в зоне" : "Лимит на продажу в зоне",
    because: `Вход ${fmt(entry)}, стоп ${fmt(stop)}, цель ${fmt(target)}. Круг ${fmt(roundTrip)}.`,
    therefore: `Чистый RR ${netRr?.toFixed(2)}. Ордер вешаем заранее, пока цена идёт к зоне.${marginNote}${patNote}`,
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
