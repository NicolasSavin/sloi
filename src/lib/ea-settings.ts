export const PAIR_OPTIONS = [
  "EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","NZDUSD",
  "EURGBP","EURJPY","GBPJPY","AUDJPY","CADJPY","NZDJPY","EURCHF","EURAUD","GBPAUD",
  "XAUUSD","XAGUSD","XTIUSD","XBRUSD","XNGUSD",
  "ETHUSD","LTCUSD","BCHUSD","BTCUSD","XRPUSD","TONUSD",
] as const;

export const TF_OPTIONS = [
  { id: 15, label: "M15" },
  { id: 60, label: "H1" },
  { id: 240, label: "H4" },
  { id: 1440, label: "D1" },
] as const;

export interface EaSettings {
  pairs: string[];
  suffix: string;
  workTF: number;
  autoTrade: boolean;
  lots: number;
  maxSpread: number;
  minCover: number;
  alerts: boolean;
}

export const DEFAULT_EA: EaSettings = {
  pairs: ["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","NZDUSD","EURGBP","EURJPY","GBPJPY","AUDJPY","CADJPY","NZDJPY","EURCHF","EURAUD","GBPAUD","XAUUSD","XAGUSD","XTIUSD","XBRUSD","XNGUSD","ETHUSD","LTCUSD","BCHUSD","BTCUSD","XRPUSD","TONUSD"],
  suffix: ".cs",
  workTF: 60,
  autoTrade: false,
  lots: 0.1,
  maxSpread: 80,
  minCover: 2.2,
  alerts: true,
};

export function watchListOf(s: EaSettings) {
  return s.pairs.join(",");
}

export function patchEaSource(src: string, s: EaSettings) {
  const list = watchListOf(s);
  return src
    .replace(/input string\s+WatchList\s+=\s+"[^"]*"/, `input string  WatchList       = "${list}"`)
    .replace(/input string\s+BrokerSuffix\s+=\s+"[^"]*"/, `input string  BrokerSuffix    = "${s.suffix}"`)
    .replace(/input int\s+WorkTF\s+=\s+\d+/, `input int     WorkTF          = ${s.workTF}`)
    .replace(/input bool\s+AutoTrade\s+=\s+(true|false)/, `input bool    AutoTrade       = ${s.autoTrade ? "true" : "false"}`)
    .replace(/input double\s+Lots\s+=\s+[0-9.]+/, `input double  Lots            = ${s.lots.toFixed(2)}`)
    .replace(/input int\s+MaxSpreadPoints\s+=\s+\d+/, `input int     MaxSpreadPoints = ${s.maxSpread}`)
    .replace(/input double\s+MinCover\s+=\s+[0-9.]+/, `input double  MinCover        = ${s.minCover}`)
    .replace(/input bool\s+AlertsOn\s+=\s+(true|false)/, `input bool    AlertsOn        = ${s.alerts ? "true" : "false"}`);
}
