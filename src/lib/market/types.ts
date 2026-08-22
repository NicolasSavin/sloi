export type Timeframe = "5m" | "15m" | "1h" | "4h" | "1d";

export type MarketKind = "metal" | "fx" | "index" | "energy";

export interface SymbolSpec {
  id: string;
  label: string;
  kind: MarketKind;
  decimals: number;
  yahoo: string;
  binance?: string;
  bybit?: string;
  optionsYahoo?: string;
  /** Typical one-way retail spread in price units. User can override. */
  spread: number;
  /** Pip / point size for display. */
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

export interface MarketPayload {
  symbol: string;
  timeframe: Timeframe;
  source: "binance" | "bybit" | "yahoo" | "demo";
  candles: Candle[];
  options: OptionsSnapshot | null;
  trades?: { price: number; qty: number; buy: boolean }[];
  staleSec?: number;
}
