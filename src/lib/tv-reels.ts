const REELS: Record<string, string> = {
  XAUUSD: "/reels/gold.mp4",
  XAGUSD: "/reels/gold.mp4",
  EURUSD: "/reels/eur.mp4",
  EURGBP: "/reels/eur.mp4",
  EURJPY: "/reels/eur.mp4",
  GBPUSD: "/reels/gbp.mp4",
  GBPJPY: "/reels/gbp.mp4",
  USDJPY: "/reels/jpy.mp4",
  USDCHF: "/reels/jpy.mp4",
  AUDUSD: "/reels/eur.mp4",
  NZDUSD: "/reels/eur.mp4",
  USDCAD: "/reels/spy.mp4",
  USOIL: "/reels/studio.mp4",
  SPY: "/reels/spy.mp4",
  QQQ: "/reels/spy.mp4",
  IWM: "/reels/spy.mp4",
  DIA: "/reels/spy.mp4",
};

export function reelFor(symbol: string) {
  return REELS[symbol] ?? "/reels/studio.mp4";
}
