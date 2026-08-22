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
  },
  {
    id: "rbc",
    label: "РБК",
    kind: "youtube",
    handle: "@rbc",
    fallback: "xu1308nJ0EU",
    lang: "ru",
  },
  {
    id: "euronews",
    label: "Euronews",
    kind: "youtube",
    handle: "@euronews",
    fallback: "pykpO5kQJ98",
    lang: "en",
  },
  {
    id: "france24",
    label: "France 24",
    kind: "youtube",
    handle: "@FRANCE24",
    fallback: "a47ckXKZjxI",
    lang: "en",
  },
  {
    id: "dw",
    label: "DW",
    kind: "youtube",
    handle: "@dwnews",
    fallback: "LuKwFajn37U",
    lang: "en",
  },
  {
    id: "kitco",
    label: "Kitco",
    kind: "youtube",
    handle: "@KitcoNEWS",
    fallback: "1Y0d-z2Qq8Y",
    lang: "en",
    foreign: true,
    videos: true,
  },
  {
    id: "fxstreet",
    label: "FXStreet",
    kind: "youtube",
    handle: "@FXStreet",
    lang: "en",
    foreign: true,
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
    live: channel.lang === "ru" || channel.id === "euronews" || channel.id === "france24",
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
