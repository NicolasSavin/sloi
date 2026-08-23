import type { Advice } from "@/lib/advisor";
import type { NewsHalt } from "@/lib/calendar";
import type { Candle } from "@/lib/market/types";
import type { SessionSnap } from "@/lib/sessions";

export function skewLimit(id: string) {
  if (id === "XAUUSD") return 0.35;
  if (id === "XAGUSD") return 0.4;
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

export function ltfTrigger(h1: Candle[] | undefined, action: "long" | "short", entry: number) {
  const last = h1?.at(-1);
  const prev = h1?.at(-2);
  if (!last || !prev) return { ok: true, note: "H1 нет — не блокируем" };
  if (action === "long") {
    const against = last.close < last.open && last.close < prev.close;
    if (against) return { ok: false, note: "H4 лонг, но H1 ещё медвежий. Ждём бычью свечу у зоны." };
    return { ok: true, note: "H1 не спорит с лонгом" };
  }
  const against = last.close > last.open && last.close > prev.close;
  if (against) return { ok: false, note: "H4 шорт, но H1 ещё бычий. Ждём медвежью свечу у зоны." };
  return { ok: true, note: "H1 не спорит с шортом" };
}

export function fillMode(action: "long" | "short", last: number, entry: number, stop: number) {
  const zone = Math.abs(entry - stop) * 0.3;
  if (!Number.isFinite(zone) || zone <= 0) return "LIMIT" as const;
  if (action === "long") return last <= entry + zone ? ("MARKET" as const) : ("LIMIT" as const);
  return last >= entry - zone ? ("MARKET" as const) : ("LIMIT" as const);
}

export function refineAdvice(
  advice: Advice,
  opts: { id: string; halt?: NewsHalt | null; session?: SessionSnap | null; h1?: Candle[]; entry?: number },
): Advice {
  if (haltApplies(opts.id, opts.halt)) {
    return {
      ...advice,
      action: "wait",
      title: "Стоп: новость по этой паре",
      therefore: `${opts.halt?.line ?? "Календарь."} Другие пары без этой валюты не глушу.`,
    };
  }
  const sess = sessionAllows(opts.id, opts.session);
  if (!sess.ok && (advice.action === "long" || advice.action === "short")) {
    return { ...advice, action: "wait", title: "Ждать сессию", therefore: sess.note };
  }
  if (advice.action !== "long" && advice.action !== "short") return advice;
  const trig = ltfTrigger(opts.h1, advice.action, opts.entry ?? 0);
  if (!trig.ok) return { ...advice, action: "wait", title: "Ждать H1", therefore: trig.note };
  return { ...advice, therefore: `${advice.therefore} ${trig.note}${sess.note ? ` ${sess.note}.` : ""}` };
}
