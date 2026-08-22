export type ChannelKind = "youtube" | "tradingview" | "reel";

export interface TvChannel {
  id: string;
  label: string;
  kind: ChannelKind;
  src?: string;
  live?: boolean;
  handle?: string;
  fallback?: string;
  lang?: "ru" | "en";
  foreign?: boolean;
  videos?: boolean;
  title?: string;
}

export const TV_CHANNELS: TvChannel[] = [
  { id: "stratum", label: "Студия", kind: "reel", lang: "ru" },
  {
    id: "euroru",
    label: "Евроньюс",
    kind: "youtube",
    handle: "@euronewsru",
    fallback: "lwYzwdBiaho",
    lang: "ru",
    videos: true,
  },
  {
    id: "rbc",
    label: "РБК",
    kind: "youtube",
    handle: "@rbc",
    fallback: "xu1308nJ0EU",
    lang: "ru",
    videos: true,
  },
  {
    id: "vedomosti",
    label: "Ведомости",
    kind: "youtube",
    handle: "@vedomosti",
    lang: "ru",
    videos: true,
  },
  {
    id: "ria",
    label: "РИА",
    kind: "youtube",
    handle: "@rianovosti",
    lang: "ru",
    videos: true,
  },
];

export function youtubeEmbed(videoId: string) {
  const q = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    controls: "0",
    enablejsapi: "1",
  });
  return `https://www.youtube.com/embed/${videoId}?${q.toString()}`;
}

export function withFallbackSrc(channel: TvChannel): TvChannel {
  if (channel.kind !== "youtube") return channel;
  const id = channel.fallback;
  return {
    ...channel,
    src: id ? youtubeEmbed(id) : channel.src,
    live: Boolean(channel.live),
  };
}

export function tvPlaylist(): TvChannel[] {
  return TV_CHANNELS.map(withFallbackSrc);
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
