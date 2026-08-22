export interface JournalEntry {
  id: string;
  at: number;
  symbol: string;
  timeframe: string;
  bias: string;
  headline: string;
  note: string;
}

const KEY = "stratum-journal";

export function loadJournal(): JournalEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as JournalEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveJournal(entries: JournalEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(entries.slice(0, 40)));
}
