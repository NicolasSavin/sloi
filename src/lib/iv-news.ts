import type { NewsHalt } from "@/lib/calendar";
import type { OptionsSnapshot } from "@/lib/market/types";

export interface IvNewsSnap {
  phase: "quiet" | "building" | "elevated" | "crush";
  avgIv: number | null;
  because: string;
  therefore: string;
}

export function avgOptionIv(opt: OptionsSnapshot | null) {
  if (!opt?.rows.length) return null;
  const xs = opt.rows.map((r) => r.markIv).filter((n): n is number => n != null && n > 0);
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function buildIvNews(halt: NewsHalt | null | undefined, opt: OptionsSnapshot | null): IvNewsSnap {
  const avgIv = avgOptionIv(opt);
  const ivBit = avgIv != null ? `IV ETF ~${(avgIv * 100).toFixed(0)}%.` : "Цепочки IV нет.";
  if (halt?.active && halt.minutes <= 0) {
    return {
      phase: "crush",
      avgIv,
      because: `${halt.event} уже вышла (${Math.abs(halt.minutes)} мин). ${ivBit}`,
      therefore: "IV crush: премия опционов сдувается, первый бар часто ложный. Не догонять вынос.",
    };
  }
  if (halt?.active && halt.minutes > 0) {
    return {
      phase: "elevated",
      avgIv,
      because: `До ${halt.event} ${halt.minutes} мин. ${ivBit}`,
      therefore: "IV обычно раздута. Мейкер снимает котировки. Торговлю торможу.",
    };
  }
  if (halt && halt.impact === "High" && halt.minutes > 0 && halt.minutes <= 180) {
    return {
      phase: "building",
      avgIv,
      because: `Крупная ${halt.event} ${halt.minutes} мин. ${ivBit}`,
      therefore: "IV набирает. Новые входы только если зона далеко от удара новости.",
    };
  }
  return {
    phase: "quiet",
    avgIv,
    because: `${halt?.line ?? "Новостного окна нет."} ${ivBit}`,
    therefore: "Гамма спокойна. Смотрите структуру, не опционный шум.",
  };
}
