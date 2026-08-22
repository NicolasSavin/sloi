export const MARKET_ART: Record<string, string> = {
  XAUUSD: "/art/gold.jpg",
  XAGUSD: "/art/gold.jpg",
  EURUSD: "/art/eur.jpg",
  EURGBP: "/art/eur.jpg",
  EURJPY: "/art/eur.jpg",
  GBPUSD: "/art/gbp.jpg",
  GBPJPY: "/art/gbp.jpg",
  USDJPY: "/art/jpy.jpg",
  USDCHF: "/art/jpy.jpg",
  AUDUSD: "/art/eur.jpg",
  NZDUSD: "/art/eur.jpg",
  USDCAD: "/art/spy.jpg",
  USOIL: "/art/strata.jpg",
  SPY: "/art/spy.jpg",
  QQQ: "/art/qqq.jpg",
  IWM: "/art/spy.jpg",
  DIA: "/art/spy.jpg",
};

export function marketArt(id?: string | null): string {
  if (!id) return "/art/strata.jpg";
  return MARKET_ART[id] ?? "/art/strata.jpg";
}

export default marketArt;
