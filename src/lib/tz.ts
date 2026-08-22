import { create } from "zustand";
import { persist } from "zustand/middleware";

export const TZ_OPTS = [
  { id: "auto", label: "Авто (этот компьютер)", iana: "" },
  { id: "berlin", label: "Берлин GMT+1 / +2", iana: "Europe/Berlin" },
  { id: "riga", label: "Рига GMT+2 / +3", iana: "Europe/Riga" },
  { id: "london", label: "Лондон", iana: "Europe/London" },
  { id: "moscow", label: "Москва GMT+3", iana: "Europe/Moscow" },
  { id: "utc", label: "UTC", iana: "UTC" },
  { id: "ny", label: "Нью-Йорк", iana: "America/New_York" },
] as const;

export type TzId = (typeof TZ_OPTS)[number]["id"];

interface TzState {
  id: TzId;
  setId: (id: TzId) => void;
}

export const useTzStore = create<TzState>()(
  persist(
    (set) => ({
      id: "auto",
      setId: (id) => set({ id }),
    }),
    { name: "sloi-tz" },
  ),
);

export function browserTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function resolvedIana(id: TzId = useTzStore.getState().id) {
  if (id === "auto") return browserTz();
  return TZ_OPTS.find((z) => z.id === id)?.iana || browserTz();
}

export function formatInTz(
  at: number | string | Date,
  opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  },
  id?: TzId,
) {
  const d = typeof at === "number" || typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", { ...opts, timeZone: resolvedIana(id) });
}

export function clockInTz(id?: TzId) {
  return formatInTz(Date.now(), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, id);
}
