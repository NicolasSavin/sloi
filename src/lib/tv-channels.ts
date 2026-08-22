export type ChannelKind = "youtube" | "tradingview" | "reel" | "bumper";

export interface TvChannel {
  id: string;
  label: string;
  kind: ChannelKind;
  src?: string;
  live?: boolean;
  handle?: string;
  channelId?: string;
  fallback?: string;
  lang?: "ru" | "en";
  foreign?: boolean;
  videos?: boolean;
  title?: string;
}

export const RSS_NETS: TvChannel[] = [
  {
    id: "euroru",
    label: "Евроньюс",
    kind: "youtube",
    channelId: "UCFzJjgVicCtFxJ5B0P_ei8A",
    fallback: "j8z6woknGV8",
    lang: "ru",
  },
  {
    id: "vedomosti",
    label: "Ведомости",
    kind: "youtube",
    channelId: "UCQdb0kgNp10fVlHWbkqKO8w",
    fallback: "QsUuwCsWpWc",
    lang: "ru",
  },
];

export const TV_CHANNELS: TvChannel[] = [
  { id: "stratum", label: "Студия", kind: "reel", lang: "ru" },
  ...RSS_NETS,
];

export function youtubeChannelPlaylist(channelId: string) {
  return `UU${channelId.slice(2)}`;
}

export function youtubeEmbed(videoId: string) {
  const q = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    controls: "1",
  });
  return `https://www.youtube.com/embed/${videoId}?${q.toString()}`;
}

export function youtubeSeriesEmbed(channelId: string) {
  const list = youtubeChannelPlaylist(channelId);
  return `https://www.youtube.com/embed/videoseries?list=${list}&autoplay=1&mute=1&rel=0&playsinline=1&controls=1`;
}

export function bumperOf(i: number): TvChannel {
  return { id: `bumper-${i}`, label: "SLOI 24", kind: "bumper", lang: "ru", title: "заставка" };
}

export function weaveBumpers(list: TvChannel[]): TvChannel[] {
  const yt = list.filter((c) => c.kind === "youtube");
  const rest = list.filter((c) => c.kind !== "youtube");
  if (!yt.length) return [bumperOf(0), ...rest];
  const out: TvChannel[] = [];
  yt.forEach((c, i) => {
    out.push(c);
    if (i % 2 === 1) out.push(bumperOf(i + 1));
  });
  out.push(...rest);
  return out;
}

export function withFallbackSrc(channel: TvChannel): TvChannel {
  if (channel.kind !== "youtube") return channel;
  if (channel.channelId) {
    return { ...channel, src: youtubeSeriesEmbed(channel.channelId), fallback: channel.fallback };
  }
  const id = channel.fallback;
  return { ...channel, src: id ? youtubeEmbed(id) : channel.src };
}

export function tvPlaylist(): TvChannel[] {
  const nets = RSS_NETS.map(withFallbackSrc);
  const studio: TvChannel = { id: "stratum", label: "Студия", kind: "reel", lang: "ru" };
  return weaveBumpers([...nets, studio]);
}

const TV_SYMBOL: Record<string, string> = {
  XAUUSD: "OANDA:XAUUSD",
  XAGUSD: "OANDA:XAGUSD",
  EURUSD: "FX:EURUSD",
  GBPUSD: "FX:GBPUSD",
  USDJPY: "FX:USDJPY",
  USDCHF: "FX:USDCHF",
  AUDUSD: "FX:AUDUSD",
  USDCAD: "FX:USDCAD",
  NZDUSD: "FX:NZDUSD",
  EURGBP: "FX:EURGBP",
  EURJPY: "FX:EURJPY",
  GBPJPY: "FX:GBPJPY",
  USOIL: "TVC:USOIL",
  SPY: "AMEX:SPY",
  QQQ: "NASDAQ:QQQ",
  IWM: "AMEX:IWM",
  DIA: "AMEX:DIA",
};

export function tvSymbol(id: string) {
  return TV_SYMBOL[id] ?? "FX:EURUSD";
}

export function tradingViewSrc(symbolId: string) {
  const symbol = encodeURIComponent(tvSymbol(symbolId));
  return `https://s.tradingview.com/widgetembed/?symbol=${symbol}&interval=60&hidesidetoolbar=0&symboledit=1&saveimage=0&toolbarbg=0a0a0b&theme=dark&style=1&timezone=Europe%2FRiga&withdateranges=1&hideideas=1&locale=ru&hidevolume=0`;
}
