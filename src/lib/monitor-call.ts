import type { DigestMarket } from "@/lib/digest";
import type { FundamentalSnap } from "@/lib/fundamentals";
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

function nameOf(m: DigestMarket) {
  return pairRu(m.spec.id, m.spec.label);
}

export function snapshotKey(m: DigestMarket) {
  return `${m.advice.action}|${m.advice.title}|${m.changePct.toFixed(1)}`;
}

export function linesFromTick(
  markets: DigestMarket[],
  fund: FundamentalSnap | undefined,
  prev: Map<string, string>,
  first: boolean,
): MonitorLine[] {
  const at = Date.now();
  const out: MonitorLine[] = [];
  const halt = fund?.halt;
  if (halt?.active || (halt?.impact === "High" && halt.minutes <= 20 && halt.minutes >= 0)) {
    const key = `halt:${halt.event}:${halt.minutes}`;
    if (prev.get("__halt") !== key) {
      prev.set("__halt", key);
      const when = halt.active ? "уже в эфире" : `через ${halt.minutes} минут`;
      const text = `${clockRu(at)} Новость. ${halt.line ?? halt.event}. ${when}. Торговлю по доллару и золоту не открываем.`;
      out.push({ id: key, at, pair: "USD", text, speak: text, tone: "alert" });
    }
  }
  if (first) {
    const live = markets.filter((m) => m.advice.action === "long" || m.advice.action === "short");
    const text =
      live.length === 0
        ? `${clockRu(at)} Монитор стола в эфире. Живых приказов нет. Следим за краями коробок.`
        : `${clockRu(at)} Монитор в эфире. В работе ${live.map((m) => nameOf(m)).join(", ")}.`;
    out.push({ id: `open-${at}`, at, pair: "SLOI", text, speak: text, tone: "neutral" });
  }
  const movers = [...markets].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  for (const m of movers.slice(0, 14)) {
    const key = snapshotKey(m);
    const was = prev.get(m.spec.id);
    prev.set(m.spec.id, key);
    if (!first && was === key) continue;
    if (first && Math.abs(m.changePct) < 0.25 && m.advice.action === "wait") continue;
    const n = nameOf(m);
    const pct = `${m.changePct >= 0 ? "плюс" : "минус"} ${Math.abs(m.changePct).toFixed(2)}`;
    let text = "";
    let tone: MonitorLine["tone"] = "neutral";
    if (m.advice.action === "long") {
      tone = "bull";
      text = `${clockRu(at)} ${n}. ${m.advice.title}. Цена ${pct} за час. ${m.advice.therefore.slice(0, 160)}`;
    } else if (m.advice.action === "short") {
      tone = "bear";
      text = `${clockRu(at)} ${n}. ${m.advice.title}. Цена ${pct} за час. ${m.advice.therefore.slice(0, 160)}`;
    } else if (Math.abs(m.changePct) >= 0.35) {
      tone = m.changePct < 0 ? "bear" : "bull";
      text = `${clockRu(at)} ${n} резко: ${pct} за час. Приказ: ждать. ${m.advice.title}.`;
    } else if (!first && was && was.split("|")[0] !== m.advice.action) {
      text = `${clockRu(at)} ${n}: сценарий сменился. Теперь ${m.advice.title}.`;
    } else if (first) {
      continue;
    } else {
      continue;
    }
    const speak = text.replace(/\s+/g, " ").slice(0, 280);
    out.push({ id: `${m.spec.id}-${at}`, at, pair: m.spec.id, text, speak, tone });
  }
  return out.slice(0, 6);
}
