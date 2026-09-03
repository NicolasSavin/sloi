export type Timeframe = "5m" | "15m" | "1h" | "4h" | "1d";

export type MarketKind = "metal" | "fx" | "index" | "energy" | "crypto";

export interface SymbolSpec {
  id: string;
  label: string;
  kind: MarketKind;
  decimals: number;
  yahoo: string;
  binance?: string;
  bybit?: string;
  optionsYahoo?: string;
  futuresYahoo?: string;
  /** Typical one-way retail spread in price units. User can override. */
  spread: number;
  pip: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume?: number;
  /** CME/Yahoo futures volume (delayed), when mapped onto this bar. */
  cmeVolume?: number;
  cmeTicker?: string;
}

export interface OptionsRow {
  strike: number;
  expiry: string;
  callOi: number;
  putOi: number;
  callVol: number;
  putVol: number;
  markIv: number | null;
}

export interface OptionsSnapshot {
  currency: string;
  spot: number;
  maxPain: number | null;
  callOi: number;
  putOi: number;
  putCall: number | null;
  magnetStrikes: number[];
  rows: OptionsRow[];
  note: string;
}

export interface OptionConstruction {
  ticker: string;
  expiry: string;
  putCall: number | null;
  maxPain: number | null;
  strike: number | null;
  type: "call-wall" | "put-wall" | "mixed";
  wanted: "up" | "down" | "flat";
  why: string;
}

export interface MarketPayload {
  symbol: string;
  timeframe: Timeframe;
  source: "binance" | "bybit" | "yahoo" | "demo";
  candles: Candle[];
  options: OptionsSnapshot | null;
  trades?: { price: number; qty: number; buy: boolean }[];
  staleSec?: number;
  cme?: { ticker: string; delayed: true; bars: number } | null;
}
