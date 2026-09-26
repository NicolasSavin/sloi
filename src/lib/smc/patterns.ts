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

/** Break of a narrowing wedge or a two-touch slope. Entry is the line, stop the far edge, target the base. */
function wedge(swings: Swing[], atr: number): PatternHit | null {
  if (swings.length < 4 || !(atr > 0)) return null;
  const highs = swings.filter((s) => s.type === "high").slice(-2);
  const lows = swings.filter((s) => s.type === "low").slice(-2);
  if (highs.length < 2 || lows.length < 2) return null;
  const h1 = highs[0]!;
  const h2 = highs[1]!;
  const l1 = lows[0]!;
  const l2 = lows[1]!;
  const width1 = Math.abs(h1.price - l1.price);
  const width2 = Math.abs(h2.price - l2.price);
  const narrow = width2 < width1 * 0.92 && width2 > atr * 0.25;
  const rising = l2.price > l1.price + atr * 0.05 && h2.price > h1.price - atr * 0.2;
  const falling = h2.price < h1.price - atr * 0.05 && l2.price < l1.price + atr * 0.2;
  if (!narrow || (!rising && !falling)) return null;
  const bear = rising;
  return {
    id: "wedge",
    family: "graphic",
    name: bear ? "восходящий клин" : "нисходящий клин",
    side: bear ? "bear" : "bull",
    points: [
      { time: h1.time, price: h1.price, label: "верх" },
      { time: h2.time, price: h2.price, label: "верх" },
      { time: l1.time, price: l1.price, label: "низ" },
      { time: l2.time, price: l2.price, label: "низ" },
    ],
    because: bear
      ? "Обе границы вверх, коридор уже — покупатель выдыхается"
      : "Обе границы вниз, коридор уже — продавец выдыхается",
    therefore: bear
      ? "Ждать пробой нижней границы. Пока цена внутри клина, это не шорт."
      : "Ждать пробой верхней границы. Пока цена внутри клина, это не лонг.",
  };
}

export function graphicBreak(
  candles: Candle[],
  swings: Swing[],
  atr: number,
): { name: string; side: "buy" | "sell"; entry: number; stop: number; target: number } | null {
  if (candles.length < 12 || swings.length < 4 || !(atr > 0)) return null;
  const last = candles.at(-1)!;
  const highs = swings.filter((s) => s.type === "high").slice(-2);
  const lows = swings.filter((s) => s.type === "low").slice(-2);
  if (highs.length < 2 || lows.length < 2) return null;
  const h1 = highs[0]!;
  const h2 = highs[1]!;
  const l1 = lows[0]!;
  const l2 = lows[1]!;
  const width1 = Math.abs(h1.price - l1.price);
  const width2 = Math.abs(h2.price - l2.price);
  const narrow = width2 < width1 * 0.92 && width2 > atr * 0.25;
  const rising = l2.price > l1.price + atr * 0.05 && h2.price > h1.price - atr * 0.2;
  const falling = h2.price < h1.price - atr * 0.05 && l2.price < l1.price + atr * 0.2;
  if (narrow && rising) {
    if (last.close >= l2.price - atr * 0.35) {
      const entry = l2.price;
      const stop = Math.max(h1.price, h2.price) + atr * 0.2;
      const target = Math.min(l1.price, l2.price);
      if (stop > entry && entry > target + atr * 0.25) return { name: "клин", side: "sell", entry, stop, target };
    }
  }
  if (narrow && falling) {
    if (last.close <= h2.price + atr * 0.35) {
      const entry = h2.price;
      const stop = Math.min(l1.price, l2.price) - atr * 0.2;
      const target = Math.max(h1.price, h2.price);
      if (target > entry && entry > stop + atr * 0.25) return { name: "клин", side: "buy", entry, stop, target };
    }
  }
  if (h2.price < h1.price - atr * 0.15 && last.close >= h2.price - atr * 0.35) {
    const entry = h2.price;
    const stop = h1.price + atr * 0.15;
    const target = entry - Math.max(h1.price - h2.price, atr);
    if (stop > entry && entry > target) return { name: "наклонная", side: "sell", entry, stop, target };
  }
  if (l2.price > l1.price + atr * 0.15 && last.close <= l2.price + atr * 0.35) {
    const entry = l2.price;
    const stop = l1.price - atr * 0.15;
    const target = entry + Math.max(l2.price - l1.price, atr);
    if (target > entry && entry > stop) return { name: "наклонная", side: "buy", entry, stop, target };
  }
  return null;
}

function wolfeWave(swings: Swing[], atr: number): PatternHit | null {
  const seq = lastAlt(swings, 5);
  if (!seq) return null;
  const [a, b, c, d, e] = seq;
  const span13 = Math.abs(c.time - a.time) || 1;
  const span35 = Math.abs(e.time - c.time) || 1;
  if (span35 > span13 * 2.4 || span35 < span13 * 0.35) return null;

  if (a.type === "low") {
    if (!(c.price < a.price && d.price < b.price && e.price <= c.price + atr * 0.2)) return null;
    const proj = c.price + ((c.price - a.price) * span35) / span13;
    if (e.price > proj + atr * 0.8) return null;
    const epa = a.price + (d.price - a.price) * (1 + span35 / Math.abs(d.time - a.time || 1));
    return {
      id: "wolfe-bull",
      family: "graphic",
      name: "волна Вульфа (бычья)",
      side: "bull",
      points: [
        { time: a.time, price: a.price, label: "1" },
        { time: b.time, price: b.price, label: "2" },
        { time: c.time, price: c.price, label: "3" },
        { time: d.time, price: d.price, label: "4" },
        { time: e.time, price: e.price, label: "5" },
      ],
      because: `Пять волн клином вниз: 1-3-5 всё ниже, 2-4 не обновляют максимум. Точка 5 — вынос за линию 1-3.`,
      therefore: `Вход не в середине клина, а от 5. Цель — линия 1-4 (EPA), грубо ${epa.toFixed(atr > 5 ? 1 : 5)}. Стоп за 5. Если 5 не удержали — фигура мертва.`,
    };
  }

  if (!(c.price > a.price && d.price > b.price && e.price >= c.price - atr * 0.2)) return null;
  const proj = c.price + ((c.price - a.price) * span35) / span13;
  if (e.price < proj - atr * 0.8) return null;
  const epa = a.price + (d.price - a.price) * (1 + span35 / Math.abs(d.time - a.time || 1));
  return {
    id: "wolfe-bear",
    family: "graphic",
    name: "волна Вульфа (медвежья)",
    side: "bear",
    points: [
      { time: a.time, price: a.price, label: "1" },
      { time: b.time, price: b.price, label: "2" },
      { time: c.time, price: c.price, label: "3" },
      { time: d.time, price: d.price, label: "4" },
      { time: e.time, price: e.price, label: "5" },
    ],
    because: `Пять волн клином вверх: 1-3-5 всё выше, 2-4 не обновляют минимум. Точка 5 — вынос за 1-3.`,
    therefore: `Шорт от 5, не от 3. Цель — линия 1-4 (EPA), грубо ${epa.toFixed(atr > 5 ? 1 : 5)}. Если закрытие выше 5 — Вульф снят.`,
  };
}

function cupHandle(swings: Swing[], atr: number): PatternHit | null {
  if (!(atr > 0)) return null;
  const highs = swings.filter((s) => s.type === "high");
  const lows = swings.filter((s) => s.type === "low");
  if (highs.length >= 2 && lows.length >= 2) {
    const right = highs.at(-1)!;
    const left = highs.at(-2)!;
    const bottom = lows.filter((s) => s.time > left.time && s.time < right.time).sort((a, b) => a.price - b.price)[0];
    const handle = lows.filter((s) => s.time > right.time).at(-1);
    if (bottom && handle && Math.abs(left.price - right.price) <= atr * 0.9) {
      const depth = Math.min(left.price, right.price) - bottom.price;
      const pull = right.price - handle.price;
      if (depth > atr * 1.4 && handle.price > bottom.price + depth * 0.35 && pull > atr * 0.15 && pull < depth * 0.62) {
        return {
          id: "cup",
          family: "graphic",
          name: "чаша с ручкой",
          side: "bull",
          points: [
            { time: left.time, price: left.price, label: "край" },
            { time: bottom.time, price: bottom.price, label: "дно" },
            { time: right.time, price: right.price, label: "край" },
            { time: handle.time, price: handle.price, label: "ручка" },
          ],
          because: "Дно круглое, правый край рядом с левым, ручка мелкая и дно не обновляет",
          therefore: "Лонг только после выхода выше края. Пока ручка не пробита вверх, чаша не работает.",
        };
      }
    }
  }
  if (lows.length >= 2 && highs.length >= 2) {
    const right = lows.at(-1)!;
    const left = lows.at(-2)!;
    const top = highs.filter((s) => s.time > left.time && s.time < right.time).sort((a, b) => b.price - a.price)[0];
    const handle = highs.filter((s) => s.time > right.time).at(-1);
    if (top && handle && Math.abs(left.price - right.price) <= atr * 0.9) {
      const depth = top.price - Math.max(left.price, right.price);
      const pull = handle.price - right.price;
      if (depth > atr * 1.4 && handle.price < top.price - depth * 0.35 && pull > atr * 0.15 && pull < depth * 0.62) {
        return {
          id: "icup",
          family: "graphic",
          name: "перевёрнутая чаша с ручкой",
          side: "bear",
          points: [
            { time: left.time, price: left.price, label: "край" },
            { time: top.time, price: top.price, label: "верх" },
            { time: right.time, price: right.price, label: "край" },
            { time: handle.time, price: handle.price, label: "ручка" },
          ],
          because: "Верх круглый, края рядом, ручка короткая и верх не обновляет",
          therefore: "Шорт только после ухода ниже края. Пока ручка не пробита вниз, фигура не работает.",
        };
      }
    }
  }
  return null;
}

function dragon(swings: Swing[], atr: number): PatternHit | null {
  if (!(atr > 0)) return null;
  const lows = swings.filter((s) => s.type === "low");
  const highs = swings.filter((s) => s.type === "high");
  if (lows.length >= 2) {
    const foot1 = lows.at(-2)!;
    const foot2 = lows.at(-1)!;
    const hump = highs.filter((s) => s.time > foot1.time && s.time < foot2.time).sort((a, b) => b.price - a.price)[0];
    const lift = foot2.price - foot1.price;
    if (hump && lift >= -atr * 0.2 && lift <= atr * 1.1 && hump.price > Math.max(foot1.price, foot2.price) + atr * 0.7) {
      return {
        id: "dragon",
        family: "graphic",
        name: "дракон",
        side: "bull",
        points: [
          { time: foot1.time, price: foot1.price, label: "лапа" },
          { time: hump.time, price: hump.price, label: "горб" },
          { time: foot2.time, price: foot2.price, label: "лапа" },
        ],
        because: "Две лапы, вторая не ниже первой, между ними горб",
        therefore: "Лонг после пробоя горба. Стоп за вторую лапу. Пока горб цел, дракон не полетел.",
      };
    }
  }
  if (highs.length >= 2) {
    const head1 = highs.at(-2)!;
    const head2 = highs.at(-1)!;
    const belly = lows.filter((s) => s.time > head1.time && s.time < head2.time).sort((a, b) => a.price - b.price)[0];
    const drop = head1.price - head2.price;
    if (belly && drop >= -atr * 0.2 && drop <= atr * 1.1 && belly.price < Math.min(head1.price, head2.price) - atr * 0.7) {
      return {
        id: "idragon",
        family: "graphic",
        name: "медвежий дракон",
        side: "bear",
        points: [
          { time: head1.time, price: head1.price, label: "голова" },
          { time: belly.time, price: belly.price, label: "брюхо" },
          { time: head2.time, price: head2.price, label: "голова" },
        ],
        because: "Две головы, вторая не выше первой, между ними впадина",
        therefore: "Шорт после пробоя впадины. Стоп за вторую голову. Пока впадина цела, фигуры нет.",
      };
    }
  }
  return null;
}

export function detectPatterns(swings: Swing[], atr: number, candles: Candle[]): PatternHit[] {
  const found = [
    wedge(swings, atr),
    cupHandle(swings, atr),
    dragon(swings, atr),
    wolfeWave(swings, atr),
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

type FigOrder = { name: string; side: "buy" | "sell"; entry: number; stop: number; target: number };

function lowBetween(swings: Swing[], a: number, b: number) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return swings.filter((s) => s.type === "low" && s.time >= lo && s.time <= hi).sort((x, y) => x.price - y.price)[0] ?? null;
}

function highBetween(swings: Swing[], a: number, b: number) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return swings.filter((s) => s.type === "high" && s.time >= lo && s.time <= hi).sort((x, y) => y.price - x.price)[0] ?? null;
}

function atPrice(last: number, line: number, side: "buy" | "sell", atr: number): number | null {
  if (side === "sell") {
    if (last < line - atr * 0.35) return null;
    return line;
  }
  if (last > line + atr * 0.35) return null;
  return line;
}

/** Neckline break, flag, triangle or harmonic D. Entry on the trigger, stop beyond the figure, target its height. */
export function patternOrder(candles: Candle[], swings: Swing[], atr: number): FigOrder | null {
  if (candles.length < 16 || !(atr > 0)) return null;
  const last = candles.at(-1)!.close;
  const hits = detectPatterns(swings, atr, candles);
  for (const p of hits) {
    const pt = (label: string) => p.points.find((x) => x.label === label);
    if (p.id === "hs") {
      const head = pt("голова");
      const right = pt("ПП");
      if (!head || !right) continue;
      const neck = lowBetween(swings, head.time, right.time)?.price;
      if (neck == null || !(head.price > neck)) continue;
      const entry = atPrice(last, neck, "sell", atr);
      const stop = head.price + atr * 0.15;
      const target = neck - (head.price - neck);
      if (entry != null && stop > entry && entry > target) return { name: p.name, side: "sell", entry, stop, target };
    }
    if (p.id === "ihs") {
      const head = pt("голова");
      const right = pt("ПП");
      if (!head || !right) continue;
      const neck = highBetween(swings, head.time, right.time)?.price;
      if (neck == null || !(neck > head.price)) continue;
      const entry = atPrice(last, neck, "buy", atr);
      const stop = head.price - atr * 0.15;
      const target = neck + (neck - head.price);
      if (entry != null && target > entry && entry > stop) return { name: p.name, side: "buy", entry, stop, target };
    }
    if (p.id === "dt") {
      const [a, b] = p.points;
      if (!a || !b) continue;
      const neck = lowBetween(swings, a.time, b.time)?.price;
      const top = Math.max(a.price, b.price);
      if (neck == null || !(top > neck)) continue;
      const entry = atPrice(last, neck, "sell", atr);
      const stop = top + atr * 0.15;
      const target = neck - (top - neck);
      if (entry != null && stop > entry && entry > target) return { name: p.name, side: "sell", entry, stop, target };
    }
    if (p.id === "db") {
      const [a, b] = p.points;
      if (!a || !b) continue;
      const neck = highBetween(swings, a.time, b.time)?.price;
      const bot = Math.min(a.price, b.price);
      if (neck == null || !(neck > bot)) continue;
      const entry = atPrice(last, neck, "buy", atr);
      const stop = bot - atr * 0.15;
      const target = neck + (neck - bot);
      if (entry != null && target > entry && entry > stop) return { name: p.name, side: "buy", entry, stop, target };
    }
    if (p.id === "cup" || p.id === "icup") {
      const rim = p.points.filter((x) => x.label === "край");
      const handle = pt("ручка");
      const deep = pt("дно") ?? pt("верх");
      const edge = rim[1] ?? rim[0];
      if (!handle || !deep || !edge) continue;
      if (p.id === "cup") {
        const entry = atPrice(last, edge.price, "buy", atr);
        const stop = handle.price - atr * 0.15;
        const target = edge.price + Math.max(edge.price - deep.price, atr);
        if (entry != null && target > entry && entry > stop) return { name: p.name, side: "buy", entry, stop, target };
      } else {
        const entry = atPrice(last, edge.price, "sell", atr);
        const stop = handle.price + atr * 0.15;
        const target = edge.price - Math.max(deep.price - edge.price, atr);
        if (entry != null && stop > entry && entry > target) return { name: p.name, side: "sell", entry, stop, target };
      }
    }
    if (p.id === "dragon" || p.id === "idragon") {
      const hump = pt("горб") ?? pt("брюхо");
      const feet = p.points.filter((x) => x.label === "лапа" || x.label === "голова");
      const lastFoot = feet.at(-1);
      if (!hump || !lastFoot) continue;
      if (p.id === "dragon") {
        const entry = atPrice(last, hump.price, "buy", atr);
        const stop = lastFoot.price - atr * 0.15;
        const target = hump.price + Math.max(hump.price - lastFoot.price, atr);
        if (entry != null && target > entry && entry > stop) return { name: p.name, side: "buy", entry, stop, target };
      } else {
        const entry = atPrice(last, hump.price, "sell", atr);
        const stop = lastFoot.price + atr * 0.15;
        const target = hump.price - Math.max(lastFoot.price - hump.price, atr);
        if (entry != null && stop > entry && entry > target) return { name: p.name, side: "sell", entry, stop, target };
      }
    }
    if (p.id === "flag" || p.id === "pennant") {
      const pole = pt("шест");
      if (!pole) continue;
      const cons = candles.slice(-7, -1);
      if (cons.length < 4) continue;
      const hi = Math.max(...cons.map((c) => c.high));
      const lo = Math.min(...cons.map((c) => c.low));
      const height = Math.abs(last - pole.price);
      if (p.side === "bull") {
        const entry = atPrice(last, hi, "buy", atr);
        const stop = lo - atr * 0.1;
        const target = (entry ?? hi) + Math.max(height, atr);
        if (entry != null && target > entry && entry > stop) return { name: p.name, side: "buy", entry, stop, target };
      } else {
        const entry = atPrice(last, lo, "sell", atr);
        const stop = hi + atr * 0.1;
        const target = (entry ?? lo) - Math.max(height, atr);
        if (entry != null && stop > entry && entry > target) return { name: p.name, side: "sell", entry, stop, target };
      }
    }
    if (p.id === "tri") {
      const h = pt("H");
      const l = pt("L");
      if (!h || !l || !(h.price > l.price)) continue;
      if (last > h.price) {
        const entry = atPrice(last, h.price, "buy", atr);
        const stop = l.price - atr * 0.1;
        const target = (entry ?? h.price) + (h.price - l.price);
        if (entry != null && target > entry && entry > stop) return { name: p.name, side: "buy", entry, stop, target };
      }
      if (last < l.price) {
        const entry = atPrice(last, l.price, "sell", atr);
        const stop = h.price + atr * 0.1;
        const target = (entry ?? l.price) - (h.price - l.price);
        if (entry != null && stop > entry && entry > target) return { name: p.name, side: "sell", entry, stop, target };
      }
    }
    if (p.family === "harmonic") {
      const d = pt("D") ?? p.points.at(-1);
      const c = pt("C");
      const x = pt("X") ?? pt("A");
      if (!d || !c || !x) continue;
      if (Math.abs(last - d.price) > atr * 1.1) continue;
      if (p.side === "bull" && c.price > d.price) {
        const entry = d.price;
        const stop = Math.min(x.price, d.price) - atr * 0.2;
        if (c.price > entry && entry > stop) return { name: p.name, side: "buy", entry, stop, target: c.price };
      }
      if (p.side === "bear" && c.price < d.price) {
        const entry = d.price;
        const stop = Math.max(x.price, d.price) + atr * 0.2;
        if (stop > entry && entry > c.price) return { name: p.name, side: "sell", entry, stop, target: c.price };
      }
    }
  }
  return null;
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
