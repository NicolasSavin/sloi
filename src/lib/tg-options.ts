export interface TgOptionPost {
  id: string;
  text: string;
  at: string;
}

function strip(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&/g, "&")
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseTgChannel(html: string): TgOptionPost[] {
  const wrap = [...html.matchAll(/tgme_widget_message_wrap[\s\S]*?tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/g)];
  const times = [...html.matchAll(/datetime="([^"]+)"/g)].map((m) => m[1]!);
  return wrap
    .map((m, i) => ({
      id: `tg-${i}-${(m[1] ?? "").slice(0, 12)}`,
      text: strip(m[1] ?? ""),
      at: times[i] ?? "",
    }))
    .filter((p) => p.text.length > 12)
    .slice(-8)
    .reverse();
}
