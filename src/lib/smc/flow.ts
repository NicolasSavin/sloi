import type { Candle } from "@/lib/market/types";
import type { Swing } from "@/lib/smc/engine";

export interface FlowBar {
  time: number;
  delta: number;
  cvd: number;
  volume: number;
}

export interface FlowEvent {
  kind: "absorption" | "exhaustion" | "hft-burst" | "climax";
  side: "bull" | "bear";
  time: number;
  price: number;
  because: string;
  therefore: string;
}

export interface FlowSnap {
  lastDelta: number;
  cvd: number;
  cvdSlope: "up" | "down" | "flat";
  source: "tape" | "proxy";
  bars: FlowBar[];
  events: FlowEvent[];
  cvdDiv: {
    side: "bull" | "bear";
    because: string;
    therefore: string;
  } | null;
}

export function buyVolumeOf(c: Candle) {
  if (c.buyVolume != null && Number.isFinite(c.buyVolume)) return c.buyVolume;
  const span = c.high - c.low;
  if (span <= 0 || c.volume <= 0) return c.volume * 0.5;
  return c.volume * ((c.close - c.low) / span);
}

export function deltaOf(c: Candle) {
  const buy = buyVolumeOf(c);
  return buy - (c.volume - buy);
}

export function buildFlow(candles: Candle[], swings: Swing[], atr: number): FlowSnap {
  const tape = candles.some((c) => c.buyVolume != null);
  const bars: FlowBar[] = [];
  let cvd = 0;
  for (const c of candles) {
    const delta = deltaOf(c);
    cvd += delta;
    bars.push({ time: c.time, delta, cvd, volume: c.volume });
  }
  const last = candles.at(-1)!;
  const lastBar = bars.at(-1)!;
  const prev = bars.at(-6);
  const cvdSlope: FlowSnap["cvdSlope"] =
    prev && lastBar.cvd > prev.cvd * 1.02 ? "up" : prev && lastBar.cvd < prev.cvd * 0.98 ? "down" : "flat";

  const avgVol = candles.slice(-24).reduce((s, c) => s + c.volume, 0) / 24 || 1;
  const events: FlowEvent[] = [];
  const tail = candles.slice(-8);
  for (const c of tail) {
    const range = c.high - c.low;
    const body = Math.abs(c.close - c.open);
    const d = deltaOf(c);
    const effort = c.volume / avgVol;
    if (effort > 1.8 && range < atr * 0.4 && Math.abs(d) < c.volume * 0.22) {
      events.push({
        kind: "absorption",
        side: d >= 0 ? "bull" : "bear",
        time: c.time,
        price: c.close,
        because: "Большой объём, маленький ход, дельта почти ноль — заявки снимают, цену не пускают",
        therefore:
          "Это похоже на HFT/айсберг: кто-то поглощает ленту. Ждём, в какую сторону вытолкнут после абсорбции, не торгуем внутрь бара.",
      });
    } else if (effort > 2.4 && range > atr * 1.2 && body < range * 0.35) {
      events.push({
        kind: "exhaustion",
        side: c.close >= c.open ? "bear" : "bull",
        time: c.time,
        price: c.close,
        because: "Всплеск объёма и длинная тень: рынок сходил за стопами и закрылся обратно",
        therefore: "Кульминация. Часто конец импульса. Не догонять хвост — ждать закрытие обратно в диапазон.",
      });
    }
  }
  const burst = tail.slice(-4);
  if (
    burst.length === 4 &&
    burst.every((c) => c.high - c.low < atr * 0.35 && c.volume > avgVol * 1.3) &&
    burst.every((c, i) => i === 0 || (c.close >= c.open) === (burst[0]!.close >= burst[0]!.open))
  ) {
    const up = burst[0]!.close >= burst[0]!.open;
    events.push({
      kind: "hft-burst",
      side: up ? "bull" : "bear",
      time: last.time,
      price: last.close,
      because: "Четыре узких бара подряд с повышенным объёмом — типичный след алго/HFT, который толкает ленту",
      therefore: up
        ? "Не ловить этот микро-разгон. Часто после всплеска цена стоит или отдают. Ждём нормальный бар."
        : "Алго продавили ленту узкими барами. Шорт вдогонку — кормить скорость, не структуру.",
    });
  }
  const climax = candles.slice(-40).reduce((m, c) => (c.volume > m.volume ? c : m), candles[0]!);
  if (climax.volume > avgVol * 2.8 && climax === last) {
    events.push({
      kind: "climax",
      side: last.close >= last.open ? "bull" : "bear",
      time: last.time,
      price: last.close,
      because: "Самый большой объём за десятки баров — кульминация участия",
      therefore: "Либо разворот после выноса, либо старт настоящего хода. Смотрим закрытие: внутри диапазона — разворот, за краем — продолжение.",
    });
  }

  let cvdDiv: FlowSnap["cvdDiv"] = null;
  const highs = swings.filter((s) => s.type === "high").slice(-2);
  const lows = swings.filter((s) => s.type === "low").slice(-2);
  const cvdAt = (t: number) => bars.find((b) => b.time >= t)?.cvd ?? lastBar.cvd;
  if (highs.length === 2) {
    const a = highs[0]!;
    const b = highs[1]!;
    if (b.price > a.price && cvdAt(b.time) < cvdAt(a.time)) {
      cvdDiv = {
        side: "bear",
        because: "Цена сделала выше максимум, а кумулятивная дельта — нет. Покупки не подтверждают хай",
        therefore: "Медвежья дивергенция потока. Ход вверх на слабеющей агрессии — часто отдают после этого.",
      };
    }
  }
  if (!cvdDiv && lows.length === 2) {
    const a = lows[0]!;
    const b = lows[1]!;
    if (b.price < a.price && cvdAt(b.time) > cvdAt(a.time)) {
      cvdDiv = {
        side: "bull",
        because: "Цена сделала ниже минимум, кумулятивная дельта растёт. Продажи не подтверждают лой",
        therefore: "Бычья дивергенция потока. Вынос вниз без новых продавцов — классика набора.",
      };
    }
  }

  return {
    lastDelta: lastBar.delta,
    cvd: lastBar.cvd,
    cvdSlope,
    source: tape ? "tape" : "proxy",
    bars: bars.slice(-120),
    events: events.slice(-4),
    cvdDiv,
  };
}
