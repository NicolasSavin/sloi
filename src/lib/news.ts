export interface NewsItem {
  id: string;
  slug: string;
  title: string;
  source: string;
  published: string;
  originHref: string;
  originTitle: string;
  snippet: string;
  image: string;
  tag: string;
  foreign: boolean;
}

export interface NewsTake {
  doing: string;
  waiting: string;
  leadsTo: string;
}

export interface NewsImpact {
  pair: string;
  pairLabel: string;
  tone: "bull" | "bear" | "neutral";
  weight: "сильно" | "умеренно" | "слабо";
  line: string;
}

export interface NewsArticle extends NewsItem {
  dek: string;
  body: string[];
  take: NewsTake;
  impact: NewsImpact;
  relatedId: string | null;
}

const SKIP =
  /метро|тройка|футбол|кино|сериал|погод|дети вместо|кустарного|крипт|bitcoin|биткоин|ethereum|войн|погиб|пропавш|royal mail|официальные курсы|украин|доставк|кривом роге|собак|вакцин|гибель|юаня на /i;

const MARKET =
  /золот|серебр|евро|доллар|фунт|иен[аые]|фрс|ставк|акци[яий]|индекс|валют|инфляц|облигац|бирж|\bgold\b|\bsilver\b|\bthe fed\b|\bfed\b|\bdollar\b|\beuro\b|\byen\b|sterling|\bstocks?\b|\byields?\b|\binflation\b|treasury|forex|nasdaq|s&p|powell|interest rates?/i;

function decodeEntities(s: string) {
  let t = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  for (let i = 0; i < 3; i++) {
    t = t
      .replace(/\x26amp;/g, "&")
      .replace(/\x26quot;/g, '"')
      .replace(/\x26#39;/g, "'")
      .replace(/\x26apos;/g, "'")
      .replace(/\x26nbsp;/g, " ")
      .replace(/\x26lt;/g, "<")
      .replace(/\x26gt;/g, ">")
      .replace(/\x26#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  }
  return t;
}

export function decodeXml(s: string) {
  return decodeEntities(s)
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeHref(s: string) {
  const t = decodeEntities(s).replace(/<[^>]+>/g, " ").trim();
  const m = t.match(/https?:\/\/[^\s"'<>]+/);
  return m?.[0] ?? t.split(/\s+/)[0] ?? "";
}

export function isForeign(title: string): boolean {
  const latin = (title.match(/[A-Za-z]/g) ?? []).length;
  const cyr = (title.match(/[А-Яа-яЁё]/g) ?? []).length;
  return latin > 10 && latin > cyr * 1.15;
}

export function slugOf(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-z0-9а-я]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  let h = 2166136261;
  for (let i = 0; i < title.length; i++) h = Math.imul(h ^ title.charCodeAt(i), 16777619);
  return `${base || "lenta"}-${(h >>> 0).toString(16).slice(0, 6)}`;
}

export function newsImage(title: string): string {
  const t = title.toLowerCase();
  if (/золот|серебр|gold|silver/.test(t)) return "/art/news/vault.jpg";
  if (/фрс|fed|ставк|инфляц|пауэл|powell/.test(t)) return "/art/news/fed.jpg";
  if (/иен|япон|tokyo|asia|boj/.test(t)) return "/art/news/asia.jpg";
  if (/евро|доллар|фунт|валют|курс|fx|forex|euro|dollar|sterling|yen/.test(t)) return "/art/news/fx.jpg";
  if (/акци|индекс|s&p|nasdaq|dow|фонд|wall|stock/.test(t)) return "/art/spy.jpg";
  return "/art/editorial.jpg";
}

export function newsTag(title: string): string {
  const t = title.toLowerCase();
  if (/золот|серебр|gold|silver/.test(t)) return "Металлы";
  if (/фрс|fed|ставк|инфляц|powell/.test(t)) return "Политика";
  if (/акци|индекс|фонд|stock|nasdaq|s&p|dow/.test(t)) return "Акции";
  if (/евро|доллар|фунт|иен|валют|euro|dollar|yen|sterling/.test(t)) return "Валюты";
  return "Рынок";
}

export function parseRss(xml: string): NewsItem[] {
  const chunks = xml.split(/<item[\s>]/i).slice(1);
  const out: NewsItem[] = [];
  for (const raw of chunks) {
    const title = decodeXml(raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    if (!title || SKIP.test(title) || !MARKET.test(title)) continue;
    const originHref = decodeHref(
      raw.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ??
        raw.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1] ??
        "",
    );
    let source = decodeXml(raw.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] ?? "");
    const published = decodeXml(raw.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "");
    const snippet = decodeXml(
      raw.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] ??
        raw.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i)?.[1] ??
        "",
    ).slice(0, 420);
    const thumb =
      raw.match(/<media:content[^>]+url="([^"]+)"/i)?.[1] ??
      raw.match(/<media:thumbnail[^>]+url="([^"]+)"/i)?.[1] ??
      "";
    if (!source) {
      if (/bbc\.co\.uk/i.test(originHref)) source = "BBC";
      else if (/reuters/i.test(originHref)) source = "Reuters";
      else source = "лента";
    }
    const foreign = isForeign(title);
    out.push({
      id: originHref || title,
      slug: slugOf(title),
      title: title.replace(/\s+-\s+[^-]+$/, "").trim() || title,
      source: source || "лента",
      published,
      originHref,
      originTitle: title,
      snippet,
      image: thumb && !/google\.com|gstatic\.com/i.test(thumb) ? thumb : newsImage(title),
      tag: newsTag(title),
      foreign,
    });
  }
  return out;
}

export function dedupeNews<T extends { title: string }>(items: T[], limit = 8): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const n of items) {
    const key = n.title.slice(0, 48).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
    if (out.length >= limit) break;
  }
  return out;
}
