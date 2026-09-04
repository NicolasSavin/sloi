import type { DailyDigest } from "@/lib/digest";
import type { NewsArticle } from "@/lib/news";
import { VERSION } from "@/lib/brand";

export interface HomeQuote {
  id: string;
  label: string;
  price: number;
  changePct: number;
  spark: number[];
  decimals: number;
  art: string;
}

export interface DeskFlash {
  id: string;
  kind: "site" | "bias";
  text: string;
  to?: "/desk" | "/dispatch" | "/cabinet" | "/tv" | "/rating" | "/about" | "/advisor";
  tone: "bull" | "bear" | "neutral";
}

export interface HomePayload {
  quotes: HomeQuote[];
  news: NewsArticle[];
  source: string;
  flashes: DeskFlash[];
}

export function siteFlashes(): DeskFlash[] {
  return [
    { id: "ver", kind: "site", text: `Новости сайта · SLOI ${VERSION}: слои на графике, архив сделок`, to: "/about", tone: "neutral" },
    { id: "ea", kind: "site", text: "Советник берёт приказы со стола, виртуальные отложки", to: "/advisor", tone: "neutral" },
    { id: "tv", kind: "site", text: "ТВ: русские обзоры без паузы YouTube", to: "/tv", tone: "neutral" },
    { id: "rate", kind: "site", text: "Рейтинг пар и видеообзоры аналитиков", to: "/rating", tone: "neutral" },
    { id: "cab", kind: "site", text: "Кабинет: ключ, звук, свой экземпляр советника", to: "/cabinet", tone: "neutral" },
  ];
}

export function digestFlashes(digest: DailyDigest | null | undefined): DeskFlash[] {
  const markets = digest?.markets ?? [];
  const word = (a: string) =>
    a === "long" ? "вероятнее лонг" : a === "short" ? "вероятнее шорт" : a === "wait" ? "ждут край" : "без входа";
  const pack = (action: "long" | "short" | "wait", n: number) =>
    markets
      .filter((m) => m.advice.action === action)
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .slice(0, n)
      .map((m) => ({
        id: `bias-${m.spec.id}`,
        kind: "bias" as const,
        text: `${m.spec.label}: ${word(m.advice.action)}`,
        to: "/dispatch" as const,
        tone: (m.advice.action === "long" ? "bull" : m.advice.action === "short" ? "bear" : "neutral") as DeskFlash["tone"],
      }));
  return [...pack("long", 4), ...pack("short", 4), ...pack("wait", 3)];
}

export function weaveFlashes(digest: DailyDigest | null | undefined): DeskFlash[] {
  const site = siteFlashes();
  const bias = digestFlashes(digest);
  const out: DeskFlash[] = [];
  const max = Math.max(site.length, bias.length);
  for (let i = 0; i < max; i++) {
    if (site[i]) out.push(site[i]!);
    if (bias[i]) out.push(bias[i]!);
  }
  return out.length ? out : site;
}