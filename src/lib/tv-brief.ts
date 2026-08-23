import type { TvChannel } from "@/lib/tv-channels";

export interface TvBrief {
  onAir: string;
  titles: string[];
  news: string[];
  note: string;
}

export const TV_REF =
  "Эфир — справка: о чём говорят на каналах. Не приказ, не вход, не отмена структуры.";

export function makeTvBrief(channels: TvChannel[], headlines: string[]): TvBrief {
  const live = channels.filter((c) => c.kind === "youtube" || c.kind === "reel");
  const on = live.find((c) => c.live) ?? live[0];
  const titles = live
    .map((c) => (c.title ? `${c.label}: ${c.title}` : c.label))
    .filter(Boolean)
    .slice(0, 6);
  const news = headlines.map((h) => h.trim()).filter((h) => h.length > 8).slice(0, 5);
  return {
    onAir: on ? `${on.label}${on.title ? ` · ${on.title}` : ""}` : "Студия SLOI",
    titles,
    news,
    note: TV_REF,
  };
}

export function tvBriefLine(brief?: TvBrief | null) {
  if (!brief) return TV_REF;
  const bits = [brief.onAir, ...brief.titles.slice(0, 2), ...brief.news.slice(0, 2)].filter(Boolean);
  return `${brief.note} Сейчас: ${bits.join(" · ")}`;
}
