export interface CalEvent {
  title: string;
  label: string;
  country: string;
  at: number;
  impact: "High" | "Medium" | "Low";
}

export interface NewsHalt {
  active: boolean;
  event: string;
  country: string;
  at: number;
  minutes: number;
  line: string;
  impact: "High" | "Medium" | "";
  next: { event: string; at: number; label: string } | null;
}

const RU: [RegExp, string][] = [
  [/non-farm|nfp|employment change/i, "занятость NFP"],
  [/unemployment rate/i, "безработица"],
  [/core cpi|cpi/i, "инфляция CPI"],
  [/core pce|pce/i, "PCE"],
  [/fomc|federal funds|interest rate|rate statement|rate decision/i, "решение по ставке"],
  [/ecb /i, "ЕЦБ"],
  [/boe |mpc /i, "Банк Англии"],
  [/boj /i, "Банк Японии"],
  [/gdp/i, "ВВП"],
  [/retail sales/i, "розница"],
  [/ppi/i, "PPI"],
  [/ism /i, "ISM"],
  [/powell|chair/i, "выступление Пауэлла"],
];

export function ruEvent(title: string) {
  for (const [re, name] of RU) if (re.test(title)) return name;
  return title;
}

function cdata(block: string, tag: string) {
  const c = block.match(new RegExp(`<${tag}><!\\[CDATA\\[(.*?)\\]\\]>`, "i"));
  if (c) return c[1]!.trim();
  const p = block.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "i"));
  return (p?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
}

function etToUtc(year: number, month: number, day: number, hour: number, minute: number) {
  const dst = month > 3 && month < 11;
  const offset = dst ? 4 : 5;
  return Date.UTC(year, month - 1, day, hour + offset, minute);
}

function parseStamp(date: string, time: string): number | null {
  const dm = date.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!dm) return null;
  const month = Number(dm[1]);
  const day = Number(dm[2]);
  const year = Number(dm[3]);
  const t = time.trim().toLowerCase();
  if (!t || t === "all day" || t === "tentative") return null;
  const am = t.includes("am");
  const pm = t.includes("pm");
  const hm = t.replace(/[ap]m/g, "").trim();
  const [hRaw, mRaw] = hm.split(":");
  let hour = Number(hRaw);
  const minute = Number(mRaw ?? 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (pm && hour < 12) hour += 12;
  if (am && hour === 12) hour = 0;
  return etToUtc(year, month, day, hour, minute);
}

export function parseFfJson(raw: unknown): CalEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: CalEvent[] = [];
  for (const row of raw) {
    const r = row as { title?: string; country?: string; date?: string; impact?: string };
    const title = String(r.title ?? "").trim();
    const at = Date.parse(String(r.date ?? ""));
    if (!title || !Number.isFinite(at)) continue;
    const impactRaw = String(r.impact ?? "");
    const impact = impactRaw === "High" || impactRaw === "Medium" || impactRaw === "Low" ? impactRaw : "Low";
    out.push({
      title,
      label: ruEvent(title),
      country: String(r.country ?? ""),
      at,
      impact,
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

export function parseFfCalendar(xml: string): CalEvent[] {
  const chunks = xml.split(/<event>/i).slice(1);
  const out: CalEvent[] = [];
  for (const chunk of chunks) {
    const body = chunk.split(/<\/event>/i)[0] ?? "";
    const impactRaw = cdata(body, "impact");
    const impact = impactRaw === "High" || impactRaw === "Medium" || impactRaw === "Low" ? impactRaw : "Low";
    const title = cdata(body, "title");
    const country = cdata(body, "country");
    const date = cdata(body, "date");
    const time = cdata(body, "time");
    const at = parseStamp(date, time);
    if (!title || !at) continue;
    out.push({ title, label: ruEvent(title), country, at, impact });
  }
  return out.sort((a, b) => a.at - b.at);
}

function windowMin(ev: CalEvent) {
  const t = ev.title;
  if (/fomc|rate statement|interest rate|non-farm|nfp|cpi|pce/i.test(t)) {
    return { before: 45, after: 30 };
  }
  if (ev.impact === "High") return { before: 30, after: 20 };
  return { before: 15, after: 10 };
}

function whenLabel(at: number, now: number) {
  const min = Math.round((at - now) / 60000);
  const abs = Math.abs(min);
  const clock = new Date(at).toLocaleString("ru-RU", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Riga",
  });
  if (min > 90) return `${clock} (через ${Math.round(min / 60)} ч)`;
  if (min > 0) return `через ${abs} мин`;
  if (min >= -5) return "прямо сейчас";
  return `${abs} мин назад`;
}

export function buildHalt(events: CalEvent[], now = Date.now()): NewsHalt {
  const high = events.filter((e) => e.impact === "High");
  let current: CalEvent | null = null;
  let minutes = 0;
  for (const ev of high) {
    const { before, after } = windowMin(ev);
    const from = ev.at - before * 60_000;
    const to = ev.at + after * 60_000;
    if (now >= from && now <= to) {
      current = ev;
      minutes = Math.round((ev.at - now) / 60000);
      break;
    }
  }
  const upcoming = high.find((e) => e.at - now > 0 && (!current || e.at !== current.at)) ?? null;
  if (current) {
    const phase = minutes > 0 ? `через ${minutes} мин` : minutes === 0 ? "сейчас" : `${Math.abs(minutes)} мин как вышла`;
    return {
      active: true,
      event: current.label,
      country: current.country,
      at: current.at,
      minutes,
      impact: "High",
      line: `Крупная новость: ${current.label} (${current.country}) ${phase}. Торговлю торможу — спред и стопы в такие минуты лгут.`,
      next: upcoming ? { event: upcoming.label, at: upcoming.at, label: whenLabel(upcoming.at, now) } : null,
    };
  }
  const midSoon = events
    .filter((e) => e.impact === "Medium" && e.at - now > -5 * 60_000 && e.at - now < 45 * 60_000)
    .sort((a, b) => a.at - b.at)[0];
  const pick = upcoming ?? midSoon ?? null;
  const grade = upcoming ? "High" : midSoon ? "Medium" : "";
  return {
    active: false,
    event: pick?.label ?? "",
    country: pick?.country ?? "",
    at: pick?.at ?? 0,
    minutes: pick ? Math.round((pick.at - now) / 60000) : 0,
    impact: grade,
    line: upcoming
      ? `Следующая крупная: ${upcoming.label} (${upcoming.country}) ${whenLabel(upcoming.at, now)}.`
      : midSoon
        ? `Средняя новость: ${midSoon.label} (${midSoon.country}) ${whenLabel(midSoon.at, now)}. Ордер не снимаю, спред может расшириться.`
        : "Крупных и средних новостей рядом нет.",
    next: pick ? { event: pick.label, at: pick.at, label: whenLabel(pick.at, now) } : null,
  };
}

export const EMPTY_HALT: NewsHalt = {
  active: false,
  event: "",
  country: "",
  at: 0,
  minutes: 0,
  impact: "",
  line: "Лента ForexFactory не пришла. Торговлю не глушу — смотрите новости на главной.",
  next: null,
};

export function newsCurrency(halt: Pick<NewsHalt, "country" | "event">) {
  const c = `${halt.country} ${halt.event}`;
  if (/ЕЦБ|ECB|EMU|EUR|Germany|Euro/i.test(c)) return "евро";
  if (/Англии|BOE|GBP|United Kingdom|UK/i.test(c)) return "фунту";
  if (/Япони|BOJ|JPY|Japan/i.test(c)) return "иене";
  if (/AUD|Australia/i.test(c)) return "австралийцу";
  if (/CAD|Canada/i.test(c)) return "канадцу";
  if (/NZD|New Zealand/i.test(c)) return "новозеландцу";
  if (/CHF|Swiss/i.test(c)) return "франку";
  if (/XAU|золот/i.test(c)) return "золоту";
  return "доллару";
}

export function newsAlertText(halt: NewsHalt) {
  const pair = newsCurrency(halt);
  const name = halt.event || "цифра календаря";
  const when =
    halt.minutes > 0 ? `через ${halt.minutes} минут` : halt.minutes === 0 ? "прямо сейчас" : "уже вышла";
  if (halt.active) {
    return `Крупная новость по ${pair}: ${name}. ${when}. Торговля запрещена.`;
  }
  if (halt.impact === "High" && halt.minutes > 0 && halt.minutes <= 45) {
    return `Крупная новость по ${pair}: ${name}. ${when}. Ближе к выходу торговлю остановлю.`;
  }
  if (halt.impact === "High") {
    return `Дальше по календарю крупная по ${pair}: ${name}. ${when}. Сейчас торговля не запрещена.`;
  }
  if (halt.impact === "Medium") {
    return `Средняя новость по ${pair}: ${name}. ${when}. Торговлю не останавливаю, следите за спредом.`;
  }
  return halt.line;
}

export function newsAlertKey(halt: NewsHalt) {
  const bucket =
    halt.minutes > 20 ? 30 : halt.minutes > 10 ? 15 : halt.minutes > 3 ? 5 : halt.active ? 0 : -1;
  return `${halt.impact}|${halt.event}|${halt.at}|${bucket}`;
}

/** Грубые окна США, если XML молчит. Не High — не стоп советника. */
export function fallbackCalendar(now = Date.now()): CalEvent[] {
  const out: CalEvent[] = [];
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  for (let d = 0; d < 7; d++) {
    const day = new Date(start.getTime() + d * 86400000);
    const wd = day.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth();
    const dd = day.getUTCDate();
    out.push({
      title: "US data window",
      label: "окно США (CPI/NFP/FOMC — уточняйте ленту)",
      country: "USD",
      at: Date.UTC(y, m, dd, 12, 30, 0),
      impact: "Medium",
    });
    if (wd === 3) {
      out.push({
        title: "Crude oil inventories",
        label: "запасы нефти EIA",
        country: "USD",
        at: Date.UTC(y, m, dd, 14, 30, 0),
        impact: "Medium",
      });
    }
  }
  return out;
}
