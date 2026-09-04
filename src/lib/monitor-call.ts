import type { DigestMarket } from "@/lib/digest";
import type { FundamentalSnap } from "@/lib/fundamentals";
import type { TapeRow } from "@/lib/market/fetch";
import { pairRu } from "@/lib/sound";

export interface MonitorLine {
  id: string;
  at: number;
  pair: string;
  text: string;
  speak: string;
  tone: "bull" | "bear" | "alert" | "neutral";
}

export function clockRu(at = Date.now()) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

function nameOf(id: string, label: string) {
  return pairRu(id, label);
}

function bounceRead(row: TapeRow) {
  const bars = row.bars;
  if (bars.length < 4) return null;
  const last = bars.at(-1)!;
  const a = bars.at(-2)!;
  const b = bars.at(-3)!;
  const lo = Math.min(...bars.map((x) => x.l));
  const hi = Math.max(...bars.map((x) => x.h));
  const span = hi - lo || 1;
  const offLow = (last.c - lo) / span;
  const rising = last.c > a.c && a.c > b.c;
  const pin = last.c > last.o && last.l <= lo * 1.0002 && last.c > last.l + (last.h - last.l) * 0.45;
  const dump = last.c < last.o && last.h - last.l > span * 0.5;
  if (dump) return "dump" as const;
  if (pin) return "pin" as const;
  if (rising && offLow > 0.18) return "bounce" as const;
  if (offLow > 0.55 && last.c > last.o) return "reclaim" as const;
  return null;
}

export function linesFromTick(
  markets: DigestMarket[],
  fund: FundamentalSnap | undefined,
  tape: TapeRow[] | undefined,
  prev: Map<string, string>,
  first: boolean,
): MonitorLine[] {
  const at = Date.now();
  const out: MonitorLine[] = [];
  const halt = fund?.halt;
  if (halt?.active || (halt?.impact === "High" && halt.minutes <= 20 && halt.minutes >= 0)) {
    const key = `halt:${halt.event}:${Math.floor((halt.minutes ?? 0) / 5)}`;
    if (prev.get("__halt") !== key) {
      prev.set("__halt", key);
      const when = halt.active ? "уже в эфире" : `через ${halt.minutes} минут`;
      const text = `${clockRu(at)} Новость. ${halt.line ?? halt.event}. ${when}. По золоту и доллару не входим вдогонку.`;
      out.push({ id: key, at, pair: "USD", text, speak: text, tone: "alert" });
    }
  }
  if (first) {
    const text = `${clockRu(at)} Монитор в эфире. Комментирую ход цены и вектор коробки, не приказы диспетчера.`;
    out.push({ id: `open-${at}`, at, pair: "SLOI", text, speak: text, tone: "neutral" });
  }

  for (const m of markets) {
    const v = m.boxVector;
    if (!v || v.dir === "none") continue;
    const vk = `v:${m.spec.id}:${v.dir}:${v.magnet ?? 0}`;
    if (!first && prev.get(vk) === "1") continue;
    prev.set(vk, "1");
    const n = nameOf(m.spec.id, m.spec.label);
    const dir = v.dir === "up" ? "вверх" : "вниз";
    const mag = v.magnet != null ? ` к ${v.magnet > 50 ? v.magnet.toFixed(0) : v.magnet.toFixed(4)}` : "";
    const text = `${clockRu(at)} ${n}: вектор коробки ${dir}${mag}. ${v.because}`;
    out.push({
      id: vk,
      at,
      pair: m.spec.id,
      text,
      speak: text.replace(/\s+/g, " ").slice(0, 280),
      tone: v.dir === "up" ? "bull" : "bear",
    });
  }

  const tapeRows = tape?.length ? tape : [];
  const ordered = [
    ...tapeRows.filter((r) => r.id === "XAUUSD"),
    ...tapeRows.filter((r) => r.id !== "XAUUSD"),
  ];

  for (const row of ordered) {
    const n = nameOf(row.id, row.label);
    const chg = row.prev ? ((row.last - row.prev) / row.prev) * 100 : 0;
    const read = bounceRead(row);
    const key = `${read ?? "flat"}|${row.last.toFixed(row.decimals > 2 ? 1 : 2)}`;
    const was = prev.get(`t:${row.id}`);
    if (!first && was === key) continue;
    prev.set(`t:${row.id}`, key);

    let text = "";
    let tone: MonitorLine["tone"] = "neutral";
    if (read === "dump") {
      tone = "bear";
      text = `${clockRu(at)} ${n}: удар вниз на пятнадцатиминутках. Широкий бар, стопы ниже. Не ловим шпиль.`;
    } else if (read === "pin") {
      tone = "bull";
      text = `${clockRu(at)} ${n}: длинный фитиль с минимума. Сходили за стопами и вернули. Похоже на попытку отхода.`;
    } else if (read === "bounce") {
      tone = "bull";
      text = `${clockRu(at)} ${n} пытается вернуться в рост: несколько баров вверх от низа ямы. До старой полки ещё не дошли.`;
    } else if (read === "reclaim") {
      tone = "bull";
      text = `${clockRu(at)} ${n} отвоевал больше половины ямы. Смотрим, удержат ли этот край.`;
    } else if (first && (row.id === "XAUUSD" || Math.abs(chg) >= 0.12)) {
      text = `${clockRu(at)} ${n}: ${chg >= 0 ? "плюс" : "минус"} ${Math.abs(chg).toFixed(2)} на пятнадцати минутах. Следим за краем ямы.`;
    } else {
      continue;
    }
    const speak = text.replace(/\s+/g, " ").slice(0, 280);
    out.push({ id: `${row.id}-${at}`, at, pair: row.id, text, speak, tone });
  }
  return out.slice(0, 8);
}
