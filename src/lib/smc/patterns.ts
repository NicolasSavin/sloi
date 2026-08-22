import type { Candle } from "@/lib/market/types";
import type { LiquidityPool, Swing } from "@/lib/smc/engine";

export interface PatternHit {
  id: string;
  family: "graphic" | "harmonic";
  name: string;
  side: "bull" | "bear";
  points: { time: number; price: number; label: string }[];
  because: string;
  therefore: string;
}

export interface WyckoffRead {
  phase: "accumulation" | "markup" | "distribution" | "markdown" | "range";
  event: "spring" | "utad" | "sos" | "sow" | "none";
  name: string;
  because: string;
  therefore: string;
}

function near(a: number, b: number, rel = 0.12) {
  if (b === 0) return false;
  return Math.abs(a - b) / Math.abs(b) <= rel;
}
function between(x: number, lo: number, hi: number) {
  return x >= lo * 0.88 && x <= hi * 1.12;
}
function retrace(from: number, to: number, now: number) {
  const leg = to - from;
  if (leg === 0) return 0;
  return (now - to) / -leg;
}

function lastAlt(swings: Swing[], n: number): Swing[] | null {
  const seq = swings.slice(-n);
  if (seq.length < n) return null;
  for (let i = 1; i < seq.length; i++) if (seq[i]!.type === seq[i - 1]!.type) return null;
  return seq;
}

function doubleTopBottom(swings: Swing[], atr: number): PatternHit | null {
  const highs = swings.filter((s) => s.type === "high").slice(-2);
  const lows = swings.filter((s) => s.type === "low").slice(-2);
  if (highs.length === 2 && Math.abs(highs[0]!.price - highs[1]!.price) <= atr * 0.45) {
    const valley = swings.filter((s) => s.time > highs[0]!.time && s.time < highs[1]!.time && s.type === "low").at(-1);
    return {
      id: "dt",
      family: "graphic",
      name: "двойная вершина",
      side: "bear",
      points: [
        { time: highs[0]!.time, price: highs[0]!.price, label: "T1" },
        { time: highs[1]!.time, price: highs[1]!.price, label: "T2" },
      ],
      because: `Два почти равных максимума — крупняк дважды не пустил выше`,
      therefore: valley
        ? `Если уйдёт под впадину между вершинами, цель — высота фигуры вниз. Пока шея жива — это ещё не слом.`
        : "Вторая вершина без прохода выше — типичная раздача в премии.",
    };
  }
  if (lows.length === 2 && Math.abs(lows[0]!.price - lows[1]!.price) <= atr * 0.45) {
    return {
      id: "db",
      family: "graphic",
      name: "двойное дно",
      side: "bull",
      points: [
        { time: lows[0]!.time, price: lows[0]!.price, label: "B1" },
        { time: lows[1]!.time, price: lows[1]!.price, label: "B2" },
      ],
      because: `Два почти равных минимума — стопы под ними уже снимали, ниже не отдали`,
      therefore: "Это часто набор. Подтверждение — закрытие выше шеи между минимумами, не сам второй низ.",
    };
  }
  return null;
}

function headShoulders(swings: Swing[]): PatternHit | null {
  const highs = swings.filter((s) => s.type === "high").slice(-3);
  const lows = swings.filter((s) => s.type === "low").slice(-3);
  if (highs.length === 3) {
    const [l, h, r] = highs;
    if (h!.price > l!.price && h!.price > r!.price && near(l!.price, r!.price, 0.018)) {
      return {
        id: "hs",
        family: "graphic",
        name: "голова и плечи",
        side: "bear",
        points: [
          { time: l!.time, price: l!.price, label: "ЛП" },
          { time: h!.time, price: h!.price, label: "голова" },
          { time: r!.time, price: r!.price, label: "ПП" },
        ],
        because: "Левое плечо, выше голова, правое плечо ниже — покупатели не смогли обновить максимум",
        therefore: "Классика раздачи. Слом шеи (впадина между головой и правым плечом) открывает ход вниз на высоту головы.",
      };
    }
  }
  if (lows.length === 3) {
    const [l, h, r] = lows;
    if (h!.price < l!.price && h!.price < r!.price && near(l!.price, r!.price, 0.018)) {
      return {
        id: "ihs",
        family: "graphic",
        name: "перевёрнутые голова и плечи",
        side: "bull",
        points: [
          { time: l!.time, price: l!.price, label: "ЛП" },
          { time: h!.time, price: h!.price, label: "голова" },
          { time: r!.time, price: r!.price, label: "ПП" },
        ],
        because: "Три минимума, средний самый глубокий — продавцы выдохлись",
        therefore: "Частый набор после выноса. Ждём закрытие выше шеи, не покупку в самой голове.",
      };
    }
  }
  return null;
}

function triangle(swings: Swing[]): PatternHit | null {
  const highs = swings.filter((s) => s.type === "high").slice(-3);
  const lows = swings.filter((s) => s.type === "low").slice(-3);
  if (highs.length < 3 || lows.length < 3) return null;
  const hiDown = highs[0]!.price > highs[1]!.price && highs[1]!.price > highs[2]!.price;
  const loUp = lows[0]!.price < lows[1]!.price && lows[1]!.price < lows[2]!.price;
  const hiUp = highs[0]!.price < highs[1]!.price && highs[1]!.price < highs[2]!.price;
  const loDown = lows[0]!.price > lows[1]!.price && lows[1]!.price > lows[2]!.price;
  if (hiDown && loUp) {
    return {
      id: "tri",
      family: "graphic",
      name: "сходящийся треугольник",
      side: "bull",
      points: [
        { time: highs[2]!.time, price: highs[2]!.price, label: "H" },
        { time: lows[2]!.time, price: lows[2]!.price, label: "L" },
      ],
      because: "Максимумы ниже, минимумы выше — диапазон сжимается, крупняк не отдаёт край",
      therefore: "Это пауза, не сигнал. Сторона появится после выхода из треугольника, не внутри.",
    };
  }
  if (hiUp && loDown) {
    return {
      id: "exp",
      family: "graphic",
      name: "расширяющаяся формация",
      side: "bear",
      points: [
        { time: highs[2]!.time, price: highs[2]!.price, label: "H" },
        { time: lows[2]!.time, price: lows[2]!.price, label: "L" },
      ],
      because: "Края разъезжаются — рынок нервный, стопы снимают в обе стороны",
      therefore: "Середину не торгуют. Ждут, какой край заберут последним.",
    };
  }
  return null;
}

function harmonic(swings: Swing[]): PatternHit | null {
  const seq = lastAlt(swings, 5);
  if (!seq) return null;
  const [x, a, b, c, d] = seq;
  const xa = a!.price - x!.price;
  const ab = b!.price - a!.price;
  const bc = c!.price - b!.price;
  const cd = d!.price - c!.price;
  const ad = d!.price - a!.price;
  if (xa === 0 || ab === 0) return null;
  const abxa = Math.abs(ab / xa);
  const bcab = Math.abs(bc / ab);
  const adxa = Math.abs(ad / xa);
  const cdbc = bc === 0 ? 0 : Math.abs(cd / bc);
  const bull = x!.type === "low";
  const side: "bull" | "bear" = bull ? "bull" : "bear";
  const pts = [
    { time: x!.time, price: x!.price, label: "X" },
    { time: a!.time, price: a!.price, label: "A" },
    { time: b!.time, price: b!.price, label: "B" },
    { time: c!.time, price: c!.price, label: "C" },
    { time: d!.time, price: d!.price, label: "D" },
  ];

  const hit = (name: string, because: string, therefore: string): PatternHit => ({
    id: name,
    family: "harmonic",
    name,
    side,
    points: pts,
    because,
    therefore,
  });

  if (near(abxa, 0.618) && between(bcab, 0.382, 0.886) && near(adxa, 0.786)) {
    return hit(
      "Gartley",
      `Точка D у 0.786 от XA — гармонический Gartley ${side === "bull" ? "на покупку" : "на продажу"}`,
      "D — зона реакции, не приказ. Нужен отказ от уровня и смена характера. Цель — B, потом A.",
    );
  }
  if (between(abxa, 0.382, 0.5) && near(adxa, 0.886)) {
    return hit(
      "Bat",
      `Точка D у 0.886 XA — паттерн Bat. Глубокий возврат к началу хода`,
      "Часто дают реакцию у D. Стоп — за X. Без реакции это просто ещё один откат.",
    );
  }
  if (between(abxa, 0.786, 0.886) && between(adxa, 1.27, 1.618)) {
    return hit(
      "Butterfly",
      `D вышла за X (1.27–1.618) — Butterfly. Вынос ликвидности за начало хода`,
      "Это гармоника на выносе стопов за X. Искать реакцию после свипа, не вход в самом выносе.",
    );
  }
  if (near(adxa, 1.618) && between(cdbc, 2.24, 3.618)) {
    return hit(
      "Crab",
      `D у 1.618 XA — Crab, самая растянутая гармоника`,
      "Реакция бывает резкой. Стоп короткий за D, цели — к C и B. Без отказа не торговать.",
    );
  }
  const abcd = lastAlt(swings, 4);
  if (abcd) {
    const [p, q, r, s] = abcd;
    const abLen = Math.abs(q!.price - p!.price);
    const cdLen = Math.abs(s!.price - r!.price);
    const bcRet = retrace(p!.price, q!.price, r!.price);
    if (abLen > 0 && near(cdLen, abLen, 0.18) && between(Math.abs(bcRet), 0.5, 0.886)) {
      const abcdSide: "bull" | "bear" = s!.type === "low" ? "bull" : "bear";
      return {
        id: "abcd",
        family: "harmonic",
        name: "ABCD",
        side: abcdSide,
        points: [
          { time: p!.time, price: p!.price, label: "A" },
          { time: q!.time, price: q!.price, label: "B" },
          { time: r!.time, price: r!.price, label: "C" },
          { time: s!.time, price: s!.price, label: "D" },
        ],
        because: "Нога CD повторила AB — симметрия хода в точку D",
        therefore: "D — зеркало B. Ждём реакцию, цель — возврат к C. Сама симметрия сделку не открывает.",
      };
    }
  }
  return null;
}

function flagPennant(candles: Candle[], swings: Swing[], atr: number): PatternHit | null {
  if (candles.length < 16) return null;
  const last = candles.at(-1)!;
  let impulseStart = candles.length - 12;
  let best = 0;
  for (let i = candles.length - 16; i < candles.length - 6; i++) {
    const move = Math.abs(candles[i]!.close - last.close);
    if (move > best) {
      best = move;
      impulseStart = i;
    }
  }
  const start = candles[impulseStart]!;
  const impulse = last.close - start.close;
  if (Math.abs(impulse) < atr * 2.2) return null;
  const cons = candles.slice(-7, -1);
  const consHigh = Math.max(...cons.map((c) => c.high));
  const consLow = Math.min(...cons.map((c) => c.low));
  if (consHigh - consLow > Math.abs(impulse) * 0.55) return null;
  const hi = cons.map((c) => c.high);
  const lo = cons.map((c) => c.low);
  const hiDown = hi[0]! > hi.at(-1)!;
  const loUp = lo[0]! < lo.at(-1)!;
  const hiUp = hi[0]! < hi.at(-1)!;
  const loDown = lo[0]! > lo.at(-1)!;
  const side: "bull" | "bear" = impulse > 0 ? "bull" : "bear";
  const pole = { time: start.time, price: start.close, label: "шест" };
  const tip = { time: last.time, price: last.close, label: "флаг" };
  if (hiDown && loUp) {
    return {
      id: "pennant",
      family: "graphic",
      name: "вымпел",
      side,
      points: [pole, tip],
      because: `После сильного хода диапазон сжался в треугольник — вымпел ${side === "bull" ? "вверх" : "вниз"}`,
      therefore:
        "Вымпел — пауза тренда. Сторона та же, что шест, но вход после выхода из сжатия, не внутри карандаша.",
    };
  }
  if ((impulse > 0 && hiDown && loDown) || (impulse < 0 && hiUp && loUp)) {
    return {
      id: "flag",
      family: "graphic",
      name: "флаг",
      side,
      points: [pole, { time: cons[0]!.time, price: consHigh, label: "канал" }, tip],
      because: `После импульса цена ползёт против него узким каналом — флаг ${side === "bull" ? "бычий" : "медвежий"}`,
      therefore:
        "Флаг чаще продолжают в сторону шеста. Ловят выход из канала, стоп за противоположный край флага.",
    };
  }
  return null;
}

export function detectPatterns(swings: Swing[], atr: number, candles: Candle[]): PatternHit[] {
  const found = [
    headShoulders(swings),
    doubleTopBottom(swings, atr),
    triangle(swings),
    flagPennant(candles, swings, atr),
    harmonic(swings),
  ].filter((p): p is PatternHit => Boolean(p));
  const seen = new Set<string>();
  return found.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

export function detectWyckoff(
  candles: Candle[],
  swings: Swing[],
  liq: LiquidityPool[],
  range: { high: number; low: number; eq: number },
  trend: "up" | "down" | "range",
): WyckoffRead {
  const last = candles.at(-1)!;
  const width = range.high - range.low || 1;
  const pos = (last.close - range.low) / width;
  const avgVol = candles.slice(-20).reduce((s, c) => s + c.volume, 0) / Math.max(candles.slice(-20).length, 1);
  const spring = liq.find((l) => l.swept && l.side === "sell");
  const utad = liq.find((l) => l.swept && l.side === "buy");
  const lastVol = last.volume;

  if (spring && pos < 0.4) {
    return {
      phase: "accumulation",
      event: "spring",
      name: "Вайкофф · спринг",
      because: `Вынесли минимумы и закрылись обратно внутрь диапазона — классический спринг (фаза C)`,
      therefore:
        lastVol > avgVol * 1.2
          ? "Объём на выносе большой: стопы забрали, крупняк набирает. Лонг ищут от возврата внутрь, не от самого лоя."
          : "Вынос был, объём скромный. Похоже на набор, но ждём знак силы — закрытие выше середины.",
    };
  }
  if (utad && pos > 0.6) {
    return {
      phase: "distribution",
      event: "utad",
      name: "Вайкофф · UTAD",
      because: `Вынесли максимумы и закрылись ниже — upthrust after distribution, раздача в премии`,
      therefore:
        lastVol > avgVol * 1.2
          ? "Объём на выносе большой: лонги сверху кормят выход. Шорт — после возврата под шею, не в самом хае."
          : "Ложный пробой верха. Пока нет знака слабости ниже EQ — это ещё может быть продолжение.",
    };
  }
  if (trend === "up" && pos < 0.45) {
    return {
      phase: "markup",
      event: "sos",
      name: "Вайкофф · рост (откат)",
      because: "Структура вверх, цена в дисконте диапазона — похоже на откат внутри markup / повторный набор",
      therefore: "Крупняк чаще доливает на откате, не на хае. Ищут реакцию от зоны, не догон.",
    };
  }
  if (trend === "down" && pos > 0.55) {
    return {
      phase: "markdown",
      event: "sow",
      name: "Вайкофф · падение (откат вверх)",
      because: "Структура вниз, цена в премии — откат внутри markdown, раздают в дорогом",
      therefore: "Покупка здесь — против фазы. Логичнее ждать реакцию вниз от премии.",
    };
  }
  if (trend === "up") {
    return {
      phase: "markup",
      event: "none",
      name: "Вайкофф · markup",
      because: "После набора цена идёт вверх. Это фаза роста, не новая история",
      therefore: "Тренд жив, пока не будет UTAD — ложного пробоя верха с закрытием вниз.",
    };
  }
  if (trend === "down") {
    return {
      phase: "markdown",
      event: "none",
      name: "Вайкофф · markdown",
      because: "После раздачи цена идёт вниз",
      therefore: "Тренд жив, пока не будет спринга — выноса низа с закрытием обратно.",
    };
  }
  return {
    phase: "range",
    event: "none",
    name: "Вайкофф · диапазон",
    because: "Нет чистой фазы: рынок строит базу или потолок",
    therefore: "Работа у краёв. Середина — зона, где крупняк не обязан ничего делать.",
  };
}
