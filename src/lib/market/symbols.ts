import type { SymbolSpec, Timeframe } from "./types";

export const SYMBOLS: SymbolSpec[] = [
  { id: "XAUUSD", label: "Золото", kind: "metal", decimals: 2, yahoo: "GC=F", futuresYahoo: "GC=F", binance: "XAUUSDT", bybit: "XAUUSDT", optionsYahoo: "GLD", spread: 0.35, pip: 0.1 },
  { id: "XAGUSD", label: "Серебро", kind: "metal", decimals: 3, yahoo: "SI=F", futuresYahoo: "SI=F", binance: "XAGUSDT", bybit: "XAGUSDT", optionsYahoo: "SLV", spread: 0.03, pip: 0.01 },
  { id: "EURUSD", label: "EUR/USD", kind: "fx", decimals: 5, yahoo: "EURUSD=X", futuresYahoo: "6E=F", optionsYahoo: "FXE", spread: 0.0001, pip: 0.0001 },
  { id: "GBPUSD", label: "GBP/USD", kind: "fx", decimals: 5, yahoo: "GBPUSD=X", futuresYahoo: "6B=F", optionsYahoo: "FXB", spread: 0.00014, pip: 0.0001 },
  { id: "USDJPY", label: "USD/JPY", kind: "fx", decimals: 3, yahoo: "USDJPY=X", futuresYahoo: "6J=F", optionsYahoo: "FXY", spread: 0.012, pip: 0.01 },
  { id: "USDCHF", label: "USD/CHF", kind: "fx", decimals: 5, yahoo: "USDCHF=X", futuresYahoo: "6S=F", spread: 0.00012, pip: 0.0001 },
  { id: "AUDUSD", label: "AUD/USD", kind: "fx", decimals: 5, yahoo: "AUDUSD=X", futuresYahoo: "6A=F", optionsYahoo: "FXA", spread: 0.00014, pip: 0.0001 },
  { id: "USDCAD", label: "USD/CAD", kind: "fx", decimals: 5, yahoo: "USDCAD=X", futuresYahoo: "6C=F", optionsYahoo: "FXC", spread: 0.00016, pip: 0.0001 },
  { id: "NZDUSD", label: "NZD/USD", kind: "fx", decimals: 5, yahoo: "NZDUSD=X", futuresYahoo: "6N=F", spread: 0.00016, pip: 0.0001 },
  { id: "EURGBP", label: "EUR/GBP", kind: "fx", decimals: 5, yahoo: "EURGBP=X", spread: 0.00014, pip: 0.0001 },
  { id: "EURJPY", label: "EUR/JPY", kind: "fx", decimals: 3, yahoo: "EURJPY=X", spread: 0.02, pip: 0.01 },
  { id: "GBPJPY", label: "GBP/JPY", kind: "fx", decimals: 3, yahoo: "GBPJPY=X", spread: 0.025, pip: 0.01 },
  { id: "XTIUSD", label: "Нефть WTI", kind: "energy", decimals: 2, yahoo: "CL=F", futuresYahoo: "CL=F", optionsYahoo: "USO", spread: 0.04, pip: 0.01 },
  { id: "XBRUSD", label: "Нефть Brent", kind: "energy", decimals: 2, yahoo: "BZ=F", futuresYahoo: "BZ=F", optionsYahoo: "BNO", spread: 0.04, pip: 0.01 },
  { id: "XNGUSD", label: "Газ Henry Hub", kind: "energy", decimals: 3, yahoo: "NG=F", futuresYahoo: "NG=F", spread: 0.02, pip: 0.001 },
  { id: "SPY", label: "S&P 500", kind: "index", decimals: 2, yahoo: "SPY", futuresYahoo: "ES=F", optionsYahoo: "SPY", spread: 0.02, pip: 0.01 },
  { id: "QQQ", label: "Nasdaq 100", kind: "index", decimals: 2, yahoo: "QQQ", futuresYahoo: "NQ=F", optionsYahoo: "QQQ", spread: 0.03, pip: 0.01 },
  { id: "IWM", label: "Russell 2000", kind: "index", decimals: 2, yahoo: "IWM", optionsYahoo: "IWM", spread: 0.04, pip: 0.01 },
  { id: "DIA", label: "Dow", kind: "index", decimals: 2, yahoo: "DIA", futuresYahoo: "YM=F", optionsYahoo: "DIA", spread: 0.03, pip: 0.01 },
  { id: "ETHUSD", label: "Ethereum", kind: "crypto", decimals: 2, yahoo: "ETH-USD", binance: "ETHUSDT", bybit: "ETHUSDT", spread: 1.2, pip: 0.01 },
  { id: "LTCUSD", label: "Litecoin", kind: "crypto", decimals: 2, yahoo: "LTC-USD", binance: "LTCUSDT", bybit: "LTCUSDT", spread: 0.15, pip: 0.01 },
  { id: "BCHUSD", label: "Bitcoin Cash", kind: "crypto", decimals: 2, yahoo: "BCH-USD", binance: "BCHUSDT", bybit: "BCHUSDT", spread: 0.4, pip: 0.01 },
  { id: "BTCUSD", label: "Bitcoin", kind: "crypto", decimals: 2, yahoo: "BTC-USD", binance: "BTCUSDT", bybit: "BTCUSDT", spread: 12, pip: 0.01 },
  { id: "XRPUSD", label: "Ripple", kind: "crypto", decimals: 4, yahoo: "XRP-USD", binance: "XRPUSDT", bybit: "XRPUSDT", spread: 0.002, pip: 0.0001 },
  { id: "TONUSD", label: "Toncoin", kind: "crypto", decimals: 4, yahoo: "TON-USD", binance: "TONUSDT", bybit: "TONUSDT", spread: 0.008, pip: 0.0001 },
];

export const DIGEST_IDS = [
  "XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD",
  "EURJPY", "GBPJPY", "XTIUSD", "XBRUSD", "XNGUSD", "SPY", "QQQ", "ETHUSD", "BTCUSD", "XRPUSD", "TONUSD",
];

export const KIND_LABEL: Record<SymbolSpec["kind"], string> = {
  metal: "Металлы",
  fx: "Форекс",
  energy: "Энергия",
  index: "Индексы",
  crypto: "Крипта 24/7",
};

export const TIMEFRAMES: { id: Timeframe; label: string }[] = [
  { id: "5m", label: "5м" },
  { id: "15m", label: "15м" },
  { id: "1h", label: "1ч" },
  { id: "4h", label: "4ч" },
  { id: "1d", label: "1д" },
];

export function getSymbol(id: string): SymbolSpec {
  return SYMBOLS.find((s) => s.id === id) ?? SYMBOLS[0]!;
}

export function formatSpread(spec: SymbolSpec, spread = spec.spread): string {
  const pips = spread / spec.pip;
  if (spec.kind === "fx") return `${pips.toFixed(1)} п.`;
  return `${spread.toFixed(spec.decimals)}`;
}
