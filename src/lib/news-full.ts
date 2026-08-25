import { askPlain } from "@/lib/ai/plain";
import { isForeign } from "@/lib/news";

export interface FullStory {
  title: string;
  html: string;
  translated: boolean;
  sourceUrl: string;
  error?: string;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const cache = new Map<string, { at: number; data: FullStory }>();

function absUrl(src: string, base: string) {
  try {
    return new URL(src, base).href;
  } catch {
    return src;
  }
}

function decodeEntities(s: string) {
  return s
    .replace(/&/g, "&")
    .replace(/"/g, '"')
    .replace(/&#39;|'/g, "'")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

async function getText(url: string, timeoutMs = 8000): Promise<{ url: string; html: string } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return { url: res.url || url, html };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function pickBody(html: string) {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const article =
    cleaned.match(/<article[\s\S]{200,}?<\/article>/i)?.[0] ??
    cleaned.match(/itemprop=["']articleBody["'][\s\S]{200,}?<\/div>/i)?.[0] ??
    cleaned.match(/class=["'][^"']*(?:article-body|post-content|entry-content|news-content|article__text|js-mediator-article)[^"']*["'][^>]*>[\s\S]{200,}?<\/div>/i)?.[0] ??
    cleaned.match(/<main[\s\S]{200,}?<\/main>/i)?.[0] ??
    cleaned;
  return article;
}

function imgFromTag(tag: string, base: string) {
  const src =
    tag.match(/\s(?:src|data-src|data-original|data-lazy-src|data-image)=["']([^"']+)["']/i)?.[1] ??
    tag.match(/srcset=["']([^"'\s]+)/i)?.[1];
  if (!src || src.startsWith("data:")) return "";
  const alt = tag.match(/alt=["']([^"']*)["']/i)?.[1] ?? "";
  return `<img src="${absUrl(src, base)}" alt="${alt.replace(/"/g, "")}" loading="lazy" />`;
}

function htmlFromChunk(chunk: string, base: string) {
  const parts: string[] = [];
  const re =
    /<(p|h1|h2|h3|h4|blockquote|li|figcaption)(\s[^>]*)?>([\s\S]*?)<\/\1>|<img\b[^>]*>|<figure\b[^>]*>[\s\S]*?<\/figure>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(chunk))) {
    const raw = m[0];
    if (/^<img/i.test(raw) || /^<figure/i.test(raw)) {
      const imgs = [...raw.matchAll(/<img\b[^>]*>/gi)].map((x) => imgFromTag(x[0], base)).filter(Boolean);
      parts.push(...imgs);
      continue;
    }
    const tag = (m[1] || "p").toLowerCase();
    let inner = decodeEntities(m[3] ?? "")
      .replace(/<img\b[^>]*>/gi, (im) => imgFromTag(im, base))
      .replace(/<\/?(script|iframe|object|form|style)[^>]*>/gi, "")
      .replace(/on\w+=["'][^"']*["']/gi, "")
      .replace(/<(?!\/?(strong|em|b|i|br|span|img)\b)[^>]+>/gi, "");
    inner = inner.replace(/\s+/g, " ").trim();
    if (!inner || inner.length < 2) continue;
    const wrap = tag === "li" ? "p" : tag === "h1" ? "h2" : tag;
    parts.push(`<${wrap}>${inner}</${wrap}>`);
  }
  return parts.join("\n");
}

function mdToHtml(md: string) {
  const lines = md.split(/\n+/);
  const out: string[] = [];
  for (const line of lines) {
    const img = line.match(/!\[([^\]]*)\]\((https?:[^)]+)\)/);
    if (img) {
      out.push(`<img src="${img[2]}" alt="${img[1]}" loading="lazy" />`);
      continue;
    }
    const t = line.replace(/^#+\s*/, "").trim();
    if (!t) continue;
    if (/^#{1,2}\s/.test(line)) out.push(`<h2>${t}</h2>`);
    else out.push(`<p>${t}</p>`);
  }
  return out.join("\n");
}

async function viaJina(url: string): Promise<string> {
  const hit = await getText(`https://r.jina.ai/${url}`, 10000);
  if (!hit?.html) return "";
  const text = hit.html.replace(/^[\s\S]*?Markdown Content:\s*/i, hit.html);
  return mdToHtml(text).slice(0, 80_000);
}

function pageTitle(html: string) {
  const t =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1] ??
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
    "";
  return decodeEntities(t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 180);
}

async function unwrapGoogle(url: string) {
  if (!/news\.google\.com/i.test(url)) return url;
  const hit = await getText(url, 7000);
  if (!hit) return url;
  const next =
    hit.html.match(/<a[^>]+href=["'](https?:\/\/(?!news\.google\.com)[^"']+)["']/i)?.[1] ??
    hit.url;
  return next || url;
}

async function translateHtml(html: string, title: string) {
  const plain = html
    .replace(/<img([^>]*)>/gi, "\n[[IMG$1]]\n")
    .replace(/<h2>([\s\S]*?)<\/h2>/gi, "\n## $1\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 7000);
  const res = await askPlain(
    "Переведи текст новости на русский. Сохрани абзацы и строки [[IMG ...]] без изменения. Эмодзи не удаляй. Без предисловий и без оценки рынка.",
    `${title}\n\n${plain}`,
  );
  if ("miss" in res) return null;
  const parts = res.text.split(/\n+/).map((line) => {
    const img = line.match(/\[\[IMG([^\]]*)\]\]/);
    if (img) return `<img${img[1]}>`;
    if (line.startsWith("## ")) return `<h2>${line.slice(3)}</h2>`;
    const t = line.trim();
    return t ? `<p>${t}</p>` : "";
  });
  return parts.filter(Boolean).join("\n");
}

export async function loadFullStory(href: string, foreignHint?: boolean, fallbackTitle?: string): Promise<FullStory> {
  const key = href.slice(0, 300);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.data;

  let url = href;
  try {
    url = await unwrapGoogle(href);
  } catch {
    url = href;
  }

  let html = "";
  let title = fallbackTitle || "";
  const page = await getText(url, 8000);
  if (page) {
    title = pageTitle(page.html) || title;
    html = htmlFromChunk(pickBody(page.html), page.url);
  }
  if ((html.match(/<p>/g) ?? []).length < 2) {
    const jina = await viaJina(url);
    if (jina) html = jina;
  }

  if (!html) {
    const miss: FullStory = {
      title,
      html: "",
      translated: false,
      sourceUrl: url,
      error: "Источник не отдал полный текст (часто так с Google News). Откройте оригинал.",
    };
    cache.set(key, { at: Date.now(), data: miss });
    return miss;
  }

  const foreign = foreignHint ?? isForeign(`${title} ${html.replace(/<[^>]+>/g, " ").slice(0, 400)}`);
  let translated = false;
  if (foreign) {
    const ru = await translateHtml(html, title);
    if (ru) {
      html = ru;
      translated = true;
    }
  }

  const data: FullStory = { title, html, translated, sourceUrl: url };
  cache.set(key, { at: Date.now(), data });
  return data;
}
