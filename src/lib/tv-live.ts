import { TV_CHANNELS, youtubeEmbed, type TvChannel } from "@/lib/tv-channels";

type Clip = { id: string; title: string; live?: boolean };

function decodeTitle(raw: string) {
  return raw
    .replace(/\\u0026/g, "&")
    .replace(/\\"/g, '"')
    .replace(/&/g, "&")
    .slice(0, 42);
}

function pickClips(html: string, limit: number): Clip[] {
  const out: Clip[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g)) {
    const id = m[1]!;
    if (seen.has(id)) continue;
    seen.add(id);
    const slice = html.slice(m.index ?? 0, (m.index ?? 0) + 1200);
    const title =
      slice.match(/"text"\s*:\s*"([^"]{6,160})"/)?.[1] ??
      slice.match(/"simpleText"\s*:\s*"([^"]{6,160})"/)?.[1] ??
      "Эфир";
    const live = /isLiveNow"\s*:\s*true|"isLive"\s*:\s*true/.test(slice);
    out.push({ id, title: decodeTitle(title), live });
    if (out.length >= limit) break;
  }
  return out;
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
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.4",
        Cookie: "CONSENT=YES+; SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwMzA1LjA3X3AxGgJydSACGgYIgKq0sAY",
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

function asChannel(label: string, clip: Clip, i: number, live?: boolean): TvChannel {
  return {
    id: `ru-${label}-${i}-${clip.id}`,
    label,
    kind: "youtube",
    src: youtubeEmbed(clip.id),
    fallback: clip.id,
    live: live ?? Boolean(clip.live),
    lang: "ru",
    foreign: false,
    title: clip.title,
  };
}

const SEARCHES = [
  { q: "форекс аналитика сегодня", label: "Форекс" },
  { q: "золото прогноз сегодня", label: "Золото" },
  { q: "рынок новости сегодня", label: "Рынок" },
];

export async function resolveTvChannels(): Promise<TvChannel[]> {
  const studio = TV_CHANNELS.find((c) => c.kind === "reel") ?? TV_CHANNELS[0]!;
  const nets = TV_CHANNELS.filter((c) => c.kind === "youtube");

  const [netRows, searchRows] = await Promise.all([
    Promise.all(
      nets.map(async (ch) => {
        const html = await youtubeHtml(`https://www.youtube.com/${ch.handle}/videos`);
        const liveHtml = await youtubeHtml(`https://www.youtube.com/${ch.handle}/streams`);
        const live = liveHtml ? pickClips(liveHtml, 1).find((c) => c.live) : undefined;
        const clips = html ? pickClips(html, 3) : [];
        const list: TvChannel[] = [];
        if (live) list.push(asChannel(ch.label, live, 0, true));
        for (const [i, clip] of clips.entries()) {
          if (live && clip.id === live.id) continue;
          list.push(asChannel(ch.label, clip, i + 1));
        }
        if (list.length === 0 && ch.fallback) {
          list.push({
            ...ch,
            src: youtubeEmbed(ch.fallback),
            live: false,
          });
        }
        return list;
      }),
    ),
    Promise.all(
      SEARCHES.map(async (s) => {
        const html = await youtubeHtml(
          `https://www.youtube.com/results?search_query=${encodeURIComponent(s.q)}&hl=ru&gl=RU&sp=CAI%253D`,
        );
        if (!html) return [] as TvChannel[];
        return pickClips(html, 4).map((clip, i) => asChannel(s.label, clip, i));
      }),
    ),
  ]);

  const seen = new Set<string>();
  const extra: TvChannel[] = [];
  for (const row of [...netRows.flat(), ...searchRows.flat()]) {
    const id = row.fallback ?? row.id;
    if (seen.has(id)) continue;
    seen.add(id);
    extra.push(row);
    if (extra.length >= 14) break;
  }

  extra.sort((a, b) => Number(Boolean(b.live)) - Number(Boolean(a.live)));
  return [studio, ...extra];
}
