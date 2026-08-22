import { TV_CHANNELS, youtubeEmbed, type TvChannel } from "@/lib/tv-channels";

function pickVideo(html: string, fallback?: string): { id: string; live: boolean } | null {
  const liveAt = html.search(/isLiveNow"\s*:\s*true|"isLive"\s*:\s*true/);
  if (liveAt >= 0) {
    const chunk = html.slice(Math.max(0, liveAt - 1200), liveAt + 200);
    const ids = [...chunk.matchAll(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g)].map((m) => m[1]!);
    const id = ids.at(-1) ?? fallback;
    if (id) return { id, live: true };
  }
  if (fallback && html.includes(fallback)) return { id: fallback, live: html.includes("isLiveNow") };
  const counts = new Map<string, number>();
  for (const m of html.matchAll(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g)) {
    const id = m[1]!;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) return { id: top[0], live: false };
  return fallback ? { id: fallback, live: false } : null;
}

async function youtubeHtml(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: "CONSENT=YES+; SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwMzA1LjA3X3AxGgJlbiACGgYIgKq0sAY",
      },
      redirect: "follow",
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function resolveTvChannels(): Promise<TvChannel[]> {
  const rows = await Promise.all(
    TV_CHANNELS.map(async (ch) => {
      if (ch.kind !== "youtube" || !ch.handle) return ch;
      const path = ch.videos ? "videos" : "streams";
      const html = await youtubeHtml(`https://www.youtube.com/${ch.handle}/${path}`);
      const picked = html ? pickVideo(html, ch.fallback) : ch.fallback ? { id: ch.fallback, live: false } : null;
      if (!picked) return ch;
      return {
        ...ch,
        src: youtubeEmbed(picked.id),
        live: ch.videos ? false : picked.live || ch.lang === "ru" || ch.id === "euronews" || ch.id === "france24",
      };
    }),
  );
  const extra = await latestAnalysis(rows.map((r) => videoIdFrom(r.src)));
  return [...rows, ...extra];
}

function videoIdFrom(src?: string) {
  const m = src?.match(/embed\/([a-zA-Z0-9_-]{11})/);
  return m?.[1] ?? "";
}

async function latestAnalysis(skip: string[]): Promise<TvChannel[]> {
  const html = await youtubeHtml(
    "https://www.youtube.com/results?search_query=forex+market+analysis&sp=CAI%253D",
  );
  if (!html) return [];
  const seen = new Set(skip.filter(Boolean));
  const ids: string[] = [];
  for (const m of html.matchAll(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g)) {
    const id = m[1]!;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= 6) break;
  }
  return ids.map((id, i) => ({
    id: `yt-desk-${i}-${id}`,
    label: "YouTube · форекс",
    kind: "youtube" as const,
    src: youtubeEmbed(id),
    fallback: id,
    live: false,
    lang: "en" as const,
    foreign: true,
  }));
}
