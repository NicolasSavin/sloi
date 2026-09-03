import type { Advice } from "@/lib/advisor";
import type { NewsHalt } from "@/lib/calendar";
import type { Candle } from "@/lib/market/types";
import type { SessionSnap } from "@/lib/sessions";
import type { MacroPlay } from "@/lib/macro-scenarios";
import { playAligned } from "@/lib/macro-scenarios";

export function skewLimit(id: string) {
  if (id === "XAUUSD") return 1.0;
  if (id === "XAGUSD") return 1.2;
  if (id === "XTIUSD" || id === "XBRUSD" || id === "USOIL") return 0.4;
  if (id === "XNGUSD") return 0.8;
  if (/BTC/.test(id) || /ETH/.test(id)) return 1.5;
  if (/LTC|XRP|TON|BCH/.test(id)) return 2.2;
  if (id.includes("JPY")) return 0.15;
  if (["EURUSD", "GBPUSD", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD"].includes(id)) return 0.08;
  return 0.12;
}

export function haltApplies(id: string, halt?: NewsHalt | null) {
  if (!halt?.active) return false;
  const c = `${halt.country} ${halt.event}`;
  if (/NFP|CPI|PCE|ФРС|Пауэлл|FOMC|занятост|инфляц|ставк/i.test(c) || /USD|United States|US/i.test(halt.country)) {
    return /USD|XAU|XAG|XTI|XBR|XNG|USOIL|SPY|QQQ|IWM|DIA|ETH|LTC|BCH|BTC|XRP|TON/.test(id);
  }
  if (/ЕЦБ|ECB|EMU|EUR|Germany|Euro/i.test(c)) return /EUR/.test(id);
  if (/Англии|BOE|GBP|United Kingdom|UK/i.test(c)) return /GBP/.test(id);
  if (/Япони|BOJ|JPY|Japan/i.test(c)) return /JPY/.test(id);
  if (/AUD|Australia/i.test(c)) return /AUD/.test(id);
  if (/CAD|Canada/i.test(c)) return /CAD/.test(id);
  if (/NZD|New Zealand/i.test(c)) return /NZD/.test(id);
  if (/CHF|Swiss/i.test(c)) return /CHF/.test(id);
  return /USD/.test(id);
}

export function sessionAllows(id: string, session?: SessionSnap | null) {
  if (!session) return { ok: true, note: "" };
  const lon = session.bands.find((b) => b.id === "london")?.active;
  const ny = session.bands.find((b) => b.id === "newyork")?.active;
  if (lon || ny) return { ok: true, note: session.overlap ? "пересечение Лондон–Нью-Йорк" : "сессия открыта" };
  if (/XAU|XAG|XTI|XBR|XNG|USOIL|JPY/.test(id)) return { ok: true, note: "Азия: металл и энергия торгуются" };
  if (/ETH|LTC|BCH|BTC|XRP|TON/.test(id)) return { ok: true, note: "Крипта 24/7, сессии FX не глушат" };
  return { ok: false, note: "Тонкая Азия. Мажор FX не открываем до Лондона." };
}

export function stackGrade(
  action: "long" | "short",
  h4?: "bullish" | "bearish" | "range",
  d1?: "bullish" | "bearish" | "range",
  choch?: boolean,
): { grade: "D1" | "H4" | "H1"; block: "none" | "market" | "all"; note: string } {
  const against = (b?: string) =>
    (action === "long" && b === "bearish") || (action === "short" && b === "bullish");
  const withUs = (b?: string) =>
    (action === "long" && b === "bullish") || (action === "short" && b === "bearish");
  const h4x = against(h4);
  const d1x = against(d1);
  const h4w = withUs(h4);
  const d1w = withUs(d1);
  if (h4x && d1x) {
    if (choch) {
      return {
        grade: "H1",
        block: "market",
        note: "CHoCH на часе против H4/D1 — разворот. Только лимит, не догон.",
      };
    }
    return { grade: "H1", block: "all", note: "H4 и дневка против, на часе нет CHoCH. Не берём." };
  }
  if (d1w && h4w) {
    return { grade: "D1", block: "none", note: "H1+H4+D1 вместе. В зоне можно рынок." };
  }
  if (h4w && !d1x) {
    return { grade: "H4", block: "none", note: "Час с четвёркой. Дневка не спорит." };
  }
  if (h4x || d1x) {
    return {
      grade: "H1",
      block: "market",
      note: choch
        ? "CHoCH против старшего — лимит в новую зону."
        : "Старший против — только лимит с часа.",
    };
  }
  return { grade: "H1", block: "market", note: "Только час. Лимит к зоне, не догон." };
}

export function htfAllows(bias: "bullish" | "bearish" | "range" | undefined, action: "long" | "short") {
  if (!bias || bias === "range") return { ok: true, note: "H4 без стороны — часовик решает." };
  if (action === "long" && bias === "bearish") {
    return { ok: false, note: "H1 лонг, но H4 медвежий. Против старшего не открываем." };
  }
  if (action === "short" && bias === "bullish") {
    return { ok: false, note: "H1 шорт, но H4 бычий. Против старшего не открываем." };
  }
  return { ok: true, note: "H4 попутный часовику." };
}

export function ltfTrigger(h1: Candle[] | undefined, action: "long" | "short", entry: number) {
  const last = h1?.at(-1);
  const prev = h1?.at(-2);
  if (!last || !prev) return { ok: true, note: "M15 нет — не блокируем" };
  if (action === "long") {
    const against = last.close < last.open && prev.close < prev.open && last.close < prev.close;
    if (against) return { ok: false, note: "H1 лонг, но два M15 подряд вниз. Ждём реакцию в зоне." };
    return { ok: true, note: "M15 не спорит с лонгом" };
  }
  const against = last.close > last.open && prev.close > prev.open && last.close > prev.close;
  if (against) return { ok: false, note: "H1 шорт, но два M15 подряд вверх. Ждём реакцию в зоне." };
  return { ok: true, note: "M15 не спорит с шортом" };
}

export function fillMode(
  action: "long" | "short",
  last: number,
  entry: number,
  stop: number,
  target?: number,
): "LIMIT" | "MARKET" | "LATE" {
  const risk = Math.abs(entry - stop);
  const zone = risk * 0.38;
  if (!Number.isFinite(zone) || zone <= 0) return "LIMIT";
  if (action === "long") {
    if (target != null && target > entry && last > entry + (target - entry) * 0.32) return "LATE";
    if (last <= entry + zone) return "MARKET";
    return "LIMIT";
  }
  if (target != null && target < entry && last < entry - (entry - target) * 0.32) return "LATE";
  if (last >= entry - zone) return "MARKET";
  return "LIMIT";
}

export function refineAdvice(
  advice: Advice,
  opts: {
    id: string;
    halt?: NewsHalt | null;
    session?: SessionSnap | null;
    h1?: Candle[];
    entry?: number;
    stop?: number;
    last?: number;
    htfBias?: "bullish" | "bearish" | "range";
    d1Bias?: "bullish" | "bearish" | "range";
    choch?: boolean;
    target?: number;
    score?: number;
    hasZone?: boolean;
    premiumDiscount?: "premium" | "discount" | "equilibrium";
    play?: MacroPlay;
  },
): Advice {
  if (haltApplies(opts.id, opts.halt)) {
    return {
      ...advice,
      action: "wait",
      title: "Стоп: новость по этой паре",
      therefore: `${opts.halt?.line ?? "Календарь."} Другие пары без этой валюты не глушу.`,
    };
  }
  if (advice.action !== "long" && advice.action !== "short") return advice;
  const sess = sessionAllows(opts.id, opts.session);
  const last = opts.last ?? opts.h1?.at(-1)?.close ?? opts.entry ?? 0;
  const entry = opts.entry ?? last;
  const stop = opts.stop ?? 0;
  const mode = fillMode(advice.action, last, entry, stop, opts.target);
  if (mode === "LATE") {
    return { ...advice, action: "wait", title: "Поздно: цена уже убежала", therefore: "Лимитку не догоняем." };
  }
  const stack = stackGrade(advice.action, opts.htfBias, opts.d1Bias, opts.choch);
  const align = playAligned(opts.id, opts.play, advice.action);
  const score = (opts.score ?? 50) + align.boost;
  const need = align.ok ? 42 : 52;
  const h1need = align.ok ? 48 : 62;
  if (!opts.hasZone) {
    return {
      ...advice,
      action: "wait",
      title: "Ждать зону",
      therefore: "Нет живого блока или FVG. Пустой край не торгуем.",
    };
  }
  const pd = opts.premiumDiscount;
  if (!align.ok && advice.action === "long" && pd === "premium" && !opts.choch) {
    return {
      ...advice,
      action: "wait",
      title: "Лонг в премии — нет",
      therefore: "Цена дорогая относительно диапазона. Покупка только после CHoCH или возврата в дисконт.",
    };
  }
  if (!align.ok && advice.action === "short" && pd === "discount" && !opts.choch) {
    return {
      ...advice,
      action: "wait",
      title: "Шорт в дисконте — нет",
      therefore: "Цена дешёвая относительно диапазона. Продажа только после CHoCH или возврата в премию.",
    };
  }
  if (score < need && !opts.choch) {
    return {
      ...advice,
      action: "wait",
      title: "Слабое совпадение слоёв",
      therefore: `Счёт ${score}/100, нет CHoCH. Ждём, пока структура, зона и старший ТФ не сойдутся.`,
    };
  }
  if (stack.grade === "H1" && !opts.choch && score < h1need) {
    return {
      ...advice,
      action: "wait",
      title: "Только час — мало",
      therefore: `${stack.note} Без CHoCH и счёта выше 62 лимитку не вешаем.`,
    };
  }
  if (stack.block === "all") {
    return { ...advice, action: "wait", title: "Ждать старший ТФ", therefore: stack.note };
  }
  if (mode === "MARKET") {
    const bits = [stack.note, align.ok ? align.note : "", "Цена в зоне — рынок, не отложка."].filter(Boolean).join(" ");
    const title = advice.action === "long" ? "Рынок: лонг в зоне" : "Рынок: шорт в зоне";
    return { ...advice, title, therefore: `${advice.therefore} ${bits}` };
  }
  const bits = [stack.note, align.ok ? align.note : "", !sess.ok ? "Азия: только лимит." : sess.note].filter(Boolean).join(" ");
  const title =
    stack.grade === "D1"
      ? advice.action === "long"
        ? "Лонг H1+H4+D1"
        : "Шорт H1+H4+D1"
      : stack.grade === "H4"
        ? advice.action === "long"
          ? "Лонг H1+H4"
          : "Шорт H1+H4"
        : advice.title;
  return { ...advice, title, therefore: `${advice.therefore} ${bits}` };
}
