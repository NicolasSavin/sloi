import { actionLabel } from "@/lib/advisor";
import { BRAND, SITE_URL } from "@/lib/brand";
import type { DigestMarket } from "@/lib/digest";
import { formatPrice } from "@/lib/utils";

const TV_SYMBOL: Record<string, string> = {
  XAUUSD: "OANDA:XAUUSD",
  XAGUSD: "OANDA:XAGUSD",
  EURUSD: "FX_IDC:EURUSD",
  GBPUSD: "FX_IDC:GBPUSD",
  USDJPY: "FX_IDC:USDJPY",
  USDCHF: "FX_IDC:USDCHF",
  AUDUSD: "FX_IDC:AUDUSD",
  USDCAD: "FX_IDC:USDCAD",
  NZDUSD: "FX_IDC:NZDUSD",
  EURGBP: "FX_IDC:EURGBP",
  EURJPY: "FX_IDC:EURJPY",
  GBPJPY: "FX_IDC:GBPJPY",
  AUDJPY: "FX_IDC:AUDJPY",
  CADJPY: "FX_IDC:CADJPY",
  NZDJPY: "FX_IDC:NZDJPY",
  EURCHF: "FX_IDC:EURCHF",
  EURAUD: "FX_IDC:EURAUD",
  GBPAUD: "FX_IDC:GBPAUD",
  XTIUSD: "TVC:USOIL",
  XBRUSD: "TVC:UKOIL",
  XNGUSD: "NYMEX:NG1!",
  ETHUSD: "BINANCE:ETHUSDT",
  BTCUSD: "BINANCE:BTCUSDT",
  LTCUSD: "BINANCE:LTCUSDT",
  BCHUSD: "BINANCE:BCHUSDT",
  XRPUSD: "BINANCE:XRPUSDT",
  TONUSD: "BINANCE:TONUSDT",
  SPY: "AMEX:SPY",
  QQQ: "NASDAQ:QQQ",
  IWM: "AMEX:IWM",
  DIA: "AMEX:DIA",
};

export function tvSymbol(id: string) {
  return TV_SYMBOL[id] ?? `FX_IDC:${id}`;
}

export function tvChartUrl(id: string, interval = "60") {
  const s = encodeURIComponent(tvSymbol(id));
  return `https://www.tradingview.com/chart/?symbol=${s}&interval=${interval}`;
}

export function tvWidgetSrc(id: string, interval = "60") {
  const s = encodeURIComponent(tvSymbol(id));
  const host = encodeURIComponent(typeof window !== "undefined" ? window.location.host : "sloi-kohl.vercel.app");
  return `https://www.tradingview.com/widgetembed/?symbol=${s}&interval=${interval}&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=0f0e0c&studies=[]&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&hideideas=0&locale=ru&utm_source=${host}`;
}

function n(v: number | null | undefined, d: number) {
  if (v == null || !Number.isFinite(v)) return "0";
  return v.toFixed(d);
}

/** Один и тот же скрипт. Публикуете в TV один раз, дальше только крутите входы. */
export const PINE_STABLE = `//@version=5
indicator("SLOI Desk", overlay=true, max_labels_count=8)
side = input.string("wait", "Сторона", options=["wait","long","short"])
entry = input.float(0.0, "Вход")
stop = input.float(0.0, "Стоп")
tp1 = input.float(0.0, "Цель 1")
tp2 = input.float(0.0, "Цель 2")
hi = input.float(0.0, "Верх диапазона")
lo = input.float(0.0, "Низ диапазона")
eq = input.float(0.0, "EQ 0.5")
note = input.string("SLOI", "Подпись")
colE = side == "long" ? color.new(#6e9e86, 0) : side == "short" ? color.new(#b57a7a, 0) : color.new(#c4a86e, 0)
pEntry = plot(entry == 0 ? na : entry, "SLOI вход", color=colE, linewidth=2)
pStop = plot(stop == 0 ? na : stop, "SLOI стоп", color=color.new(#b57a7a, 0), linewidth=2)
plot(tp1 == 0 ? na : tp1, "SLOI цель 1", color=color.new(#6e9e86, 20))
plot(tp2 == 0 ? na : tp2, "SLOI цель 2", color=color.new(#6e9e86, 50))
plot(hi == 0 ? na : hi, "верх", color=color.new(#8a8276, 50))
plot(lo == 0 ? na : lo, "низ", color=color.new(#8a8276, 50))
plot(eq == 0 ? na : eq, "EQ", color=color.new(#d4b88c, 40), style=plot.style_circles)
fill(pEntry, pStop, color=side == "wait" ? na : color.new(colE, 88), title="зона")
if barstate.islast and entry != 0
    label.new(bar_index, entry, note, style=label.style_label_left, textcolor=color.white, color=color.new(#1c1814, 15), size=size.small)
`;

export function pineInputs(m: DigestMarket) {
  const d = m.spec.decimals;
  const side = m.advice.action === "long" ? "long" : m.advice.action === "short" ? "short" : "wait";
  return [
    `Сторона: ${side}`,
    `Вход: ${n(m.setup.entry, d)}`,
    `Стоп: ${n(m.setup.stop, d)}`,
    `Цель 1: ${n(m.setup.targets[0], d)}`,
    `Цель 2: ${n(m.setup.targets[1], d)}`,
    `Верх диапазона: ${n(m.range.high, d)}`,
    `Низ диапазона: ${n(m.range.low, d)}`,
    `EQ 0.5: ${n(m.range.eq, d)}`,
  ].join("\n");
}

export function pineFromMarket(m: DigestMarket) {
  return PINE_STABLE;
}

export function ideaFromMarket(m: DigestMarket) {
  const d = m.spec.decimals;
  const side =
    m.advice.action === "long" ? "ЛОНГ" : m.advice.action === "short" ? "ШОРТ" : "НАБЛЮДЕНИЕ";
  const px = (v: number | null | undefined) => (v != null ? formatPrice(v, d) : "—");
  const lines = [
    `${BRAND} · ${m.spec.label} (${m.spec.id}) · ${side}`,
    `Цена ${px(m.lastClose)}. ${m.advice.title}.`,
    "",
    m.story.doing,
    m.story.waiting,
    m.story.leadsTo,
    "",
    `Вход ${px(m.setup.entry)} · стоп ${px(m.setup.stop)} · цель ${px(m.setup.targets[0])}${m.setup.targets[1] != null ? ` / ${px(m.setup.targets[1])}` : ""}`,
    m.wind ? `Макро: ${m.wind.note}` : "",
    m.construction ? `Опционы: ${m.construction.why}` : "",
    "",
    `Разбор: ${SITE_URL}/desk`,
    "Не инвестиционная рекомендация. Уровни со стола SLOI, не приказ брокеру.",
  ];
  return lines.filter(Boolean).join("\n");
}
