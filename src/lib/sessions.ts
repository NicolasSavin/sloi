export interface SessionBand {
  id: "tokyo" | "london" | "newyork";
  label: string;
  open: number;
  close: number;
  active: boolean;
}

export interface SessionSnap {
  londonHour: string;
  rigaHour: string;
  bands: SessionBand[];
  overlap: boolean;
  line: string;
}

function hourIn(tz: string, now: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { h, m, label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, frac: h + m / 60 };
}

export function sessionNow(now = Date.now()): SessionSnap {
  const lon = hourIn("Europe/London", now);
  const riga = hourIn("Europe/Riga", now);
  const tokyoOn = lon.frac >= 0 && lon.frac < 9;
  const londonOn = lon.frac >= 8 && lon.frac < 16.5;
  const nyOn = lon.frac >= 13 && lon.frac < 22;
  const overlap = londonOn && nyOn;
  const bands: SessionBand[] = [
    { id: "tokyo", label: "Токио", open: 0, close: 9, active: tokyoOn },
    { id: "london", label: "Лондон", open: 8, close: 16.5, active: londonOn },
    { id: "newyork", label: "Нью-Йорк", open: 13, close: 22, active: nyOn },
  ];
  const live = bands.filter((b) => b.active).map((b) => b.label);
  const line = overlap
    ? "Пересечение Лондон–Нью-Йорк: самый жирный оборот. Крупняк обычно здесь."
    : live.length
      ? `Сейчас ${live.join(" + ")}. Края дня чаще роняют на открытии сессии.`
      : "Межсессионная пауза. Объём тонкий, края врут чаще.";
  return {
    londonHour: lon.label,
    rigaHour: riga.label,
    bands,
    overlap,
    line,
  };
}
