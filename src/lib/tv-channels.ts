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
  /** desk = разбор/обучение с зонами; news = фундамент; skip = не крутим как «прогноз». */
  role?: "desk" | "news" | "skip";
}

export const RSS_NETS: TvChannel[] = [
  {
    id: "fxmaker",
    label: "FxForTrader",
    kind: "youtube",
    channelId: "UCnsDPgikxrcjytTy_mjb2pw",
    fallback: "x9pIUqArO_s",
    lang: "ru",
    role: "desk",
  },
  {
    id: "sanchodt",
    label: "SanchoDT",
    kind: "youtube",
    channelId: "UCc2J9DJeaBVaTzIuFlUMdQg",
    fallback: "pewgrPZEb1Q",
    lang: "ru",
    role: "skip",
  },
  {
    id: "zvezdin",
    label: "Звёздин",
    kind: "youtube",
    channelId: "UCeboUXLKHz3eoZ3y5XvTqqg",
    fallback: "BgQqF2ZbPIY",
    lang: "ru",
    role: "desk",
  },
  {
    id: "tradetoday",
    label: "Trade Today",
    kind: "youtube",
    channelId: "UC_q-tHPBUpBpFTQ0Ggumm5A",
    fallback: "b2aHrVz3J3w",
    lang: "ru",
    role: "skip",
  },
  {
    id: "finexpert",
    label: "FinExpert",
    kind: "youtube",
    channelId: "UCCtXfq1Rrwdt8hj7QFGSZdQ",
    fallback: "C-XWolyd1r8",
    lang: "ru",
    role: "skip",
  },
  {
    id: "tyukov",
    label: "Тюков",
    kind: "youtube",
    channelId: "UCQvAbe1wqthJ0Aa6bA0l2MQ",
    fallback: "dEve9-qyotk",
    lang: "ru",
    role: "skip",
  },
  {
    id: "porter",
    label: "Brooks Porter",
    kind: "youtube",
    channelId: "UCVTKU3mQsRbY30_7B-tO9Zg",
    fallback: "WmOSV00a0Fs",
    lang: "ru",
    role: "skip",
  },
  {
    id: "rbc",
    label: "РБК Инвестиции",
    kind: "youtube",
    channelId: "UCD23js7wHnyG_yhimDMpLpg",
    lang: "ru",
    role: "news",
  },
  {
    id: "bcs",
    label: "БКС",
    kind: "youtube",
    channelId: "UCdUwDSicdhcU9N8iap4c4Ow",
    lang: "ru",
    role: "news",
  },
  {
    id: "tinvest",
    label: "Т-Инвест",
    kind: "youtube",
    channelId: "UCSoHzhlpiQeheYOMk2D6Nog",
    lang: "ru",
    role: "news",
  },
  {
    id: "investfuture",
    label: "InvestFuture",
    kind: "youtube",
    channelId: "UCQmYubm0bFtExa7Q9oHT6Rg",
    lang: "ru",
    role: "news",
  },
  {
    id: "vedomosti",
    label: "Ведомости",
    kind: "youtube",
    channelId: "UCQdb0kgNp10fVlHWbkqKO8w",
    fallback: "QsUuwCsWpWc",
    lang: "ru",
    role: "news",
  },
  {
    id: "euroru",
    label: "Евроньюс",
    kind: "youtube",
    channelId: "UCFzJjgVicCtFxJ5B0P_ei8A",
    fallback: "j8z6woknGV8",
    lang: "ru",
    role: "news",
  },
];

export const TV_CHANNELS: TvChannel[] = [
  { id: "stratum", label: "Студия", kind: "reel", lang: "ru" },
  ...RSS_NETS.filter((n) => n.role !== "skip"),
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
  return `https://www.youtube.com/embed/videoseries?list=${list}&autoplay=1&mute=1&rel=0&playsinline=1&controls=0&loop=1&iv_load_policy=3&modestbranding=1`;
}

export function youtubeQueueEmbed(ids: string[]) {
  const uniq = [...new Set(ids.filter((id) => /^[a-zA-Z0-9_-]{11}$/.test(id)))];
  const first = uniq[0];
  if (!first) return "";
  const q = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    rel: "0",
    modestbranding: "1",
    iv_load_policy: "3",
    controls: "0",
    playsinline: "1",
    loop: "1",
    playlist: uniq.join(","),
  });
  return `https://www.youtube.com/embed/${first}?${q.toString()}`;
}

export function bumperOf(i: number): TvChannel {
  return { id: `bumper-${i}`, label: "SLOI 24", kind: "bumper", lang: "ru", title: "заставка" };
}

export function weaveBumpers(list: TvChannel[]): TvChannel[] {
  return list.filter((c) => c.kind !== "bumper");
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
  const ids = RSS_NETS.map((n) => n.fallback).filter((id): id is string => Boolean(id));
  const ether: TvChannel = {
    id: "ether",
    label: "Эфир",
    kind: "youtube",
    src: youtubeQueueEmbed(ids.length ? ids : ["j8z6woknGV8"]),
    live: true,
    lang: "ru",
    title: "без пауз",
  };
  return [ether, ...RSS_NETS.map(withFallbackSrc)];
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
