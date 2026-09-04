import { RSS_NETS, weaveBumpers, withFallbackSrc, youtubeEmbed, youtubeQueueEmbed, youtubeSeriesEmbed, type TvChannel } from "@/lib/tv-channels";

type Clip = { id: string; title: string };

function decodeTitle(raw: string) {
  return raw
    .replace(/"/g, '"')
    .replace(/&/g, "&")
    .replace(/&#39;/g, "'")
    .slice(0, 48);
}

async function rssClips(channelId: string): Promise<Clip[]> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 SLOI-TV/1.0", Accept: "application/atom+xml,application/xml,text/xml" },
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const xml = await res.text();
    const ids = [...xml.matchAll(/<yt:videoId>([^<]+)<\/yt:videoId>/g)].map((m) => m[1]!);
    const titles = [...xml.matchAll(/<media:title>([^<]+)<\/media:title>/g)].map((m) => decodeTitle(m[1]!));
    const seen = new Set<string>();
    const out: Clip[] = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, title: titles[i] ?? "Эфир" });
      if (out.length >= 8) break;
    }
    return out;
  } catch {
    return [];
  }
}

export async function resolveTvChannels(): Promise<TvChannel[]> {
  const studio: TvChannel = { id: "stratum", label: "Студия", kind: "reel", lang: "ru" };
  const rows = await Promise.all(
    RSS_NETS.filter((n) => n.role !== "skip").map(async (net) => {
      const head: TvChannel[] = net.channelId
        ? [
            {
              id: `${net.id}-live`,
              label: net.label,
              kind: "youtube",
              src: youtubeSeriesEmbed(net.channelId),
              channelId: net.channelId,
              fallback: net.fallback,
              live: true,
              lang: "ru",
              title: "эфир канала",
            },
          ]
        : [];
      const clips = await rssClips(net.channelId ?? "");
      const rest = (clips.length ? clips : net.fallback ? [{ id: net.fallback, title: net.label }] : []).map(
        (clip, i) => ({
          id: `${net.id}-${i}-${clip.id}`,
          label: net.label,
          kind: "youtube" as const,
          src: youtubeEmbed(clip.id),
          fallback: clip.id,
          live: false,
          lang: "ru" as const,
          foreign: false,
          title: clip.title,
        }),
      );
      return [...head, ...rest];
    }),
  );
  const extra = rows.flat();
  const ids = extra.filter((c) => !c.live && c.fallback).map((c) => c.fallback!);
  const ether: TvChannel = {
    id: "ether",
    label: "Эфир",
    kind: "youtube",
    src: youtubeQueueEmbed(ids.length ? ids : ["j8z6woknGV8"]),
    live: true,
    lang: "ru",
    title: "без пауз",
  };
  if (extra.length === 0) {
    return [ether, ...RSS_NETS.map(withFallbackSrc), studio];
  }
  return [ether, ...extra.filter((c) => c.live), studio];
}

export async function reviewClips(): Promise<
  { id: string; label: string; role?: TvChannel["role"]; videoId: string; title: string }[]
> {
  const nets = RSS_NETS.filter((n) => n.role === "desk" || n.role === "news" || n.role === "skip");
  const rows = await Promise.all(
    nets.map(async (net) => {
      const clips = net.channelId ? await rssClips(net.channelId) : [];
      const clip = clips[0] ?? (net.fallback ? { id: net.fallback, title: net.label } : null);
      if (!clip) return null;
      return { id: net.id, label: net.label, role: net.role, videoId: clip.id, title: clip.title };
    }),
  );
  return rows.filter((r): r is NonNullable<typeof r> => Boolean(r));
}
