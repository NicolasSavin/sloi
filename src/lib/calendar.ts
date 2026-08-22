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
      line: `Крупная новость: ${current.label} (${current.country}) ${phase}. Торговлю торможу — спред и стопы в такие минуты лгут.`,
      next: upcoming ? { event: upcoming.label, at: upcoming.at, label: whenLabel(upcoming.at, now) } : null,
    };
  }
  return {
    active: false,
    event: upcoming?.label ?? "",
    country: upcoming?.country ?? "",
    at: upcoming?.at ?? 0,
    minutes: upcoming ? Math.round((upcoming.at - now) / 60000) : 0,
    line: upcoming
      ? `Следующая крупная: ${upcoming.label} (${upcoming.country}) ${whenLabel(upcoming.at, now)}.`
      : "Крупных новостей в календаре рядом нет.",
    next: upcoming ? { event: upcoming.label, at: upcoming.at, label: whenLabel(upcoming.at, now) } : null,
  };
}

export const EMPTY_HALT: NewsHalt = {
  active: false,
  event: "",
  country: "",
  at: 0,
  minutes: 0,
  line: "Календарь новостей сейчас недоступен.",
  next: null,
};
