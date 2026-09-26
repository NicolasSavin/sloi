export type SketchMood = "bull" | "bear" | "mixed" | "calm";

export interface WhaleRead {
  does: string;
  wants: string;
  because: string;
  therefore: string;
}

export interface ChartPlan {
  symbol: string;
  side: "buy" | "sell";
  entry: number;
  stop: number;
  target: number;
  own: boolean;
}

export interface SketchPiece {
  kicker: string;
  title: string;
  lead: string;
  paragraphs: string[];
  levels: string[];
  original: string;
  mood: SketchMood;
  whale: WhaleRead;
  plan: ChartPlan | null;
}

function tidy(raw: string): string {
  return raw.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

function sentencesOf(raw: string): string[] {
  const text = tidy(raw);
  if (!text) return [];
  const parts = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [text];
}

function cap(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function polish(s: string): string {
  let t = s.trim();
  t = t.replace(/\bFVG\b/gi, "имбаланс");
  t = t.replace(/\bфвг\b/gi, "имбаланс");
  t = t.replace(/\s{2,}/g, " ");
  if (!/[.!?]$/.test(t)) t += ".";
  return cap(t);
}

function moodOf(text: string): SketchMood {
  const up = /вверх|наверх|лонг|рост|покуп/i.test(text);
  const down = /вниз|шорт|спуск|паден|продаж|стоп/i.test(text);
  if (up && down) return "mixed";
  if (up) return "bull";
  if (down) return "bear";
  return "calm";
}

function headline(instrument: string, text: string): string {
  const name = instrument.trim() || "График";
  const up = /вверх|наверх|лонг|рост|покуп/i.test(text);
  const down = /вниз|шорт|спуск|паден|продаж/i.test(text);
  const way = up && down ? "сначала вниз, потом вверх" : up ? "ход вверх" : down ? "ход вниз" : "что видно на графике";
  const fig = /флаг/i.test(text)
    ? "флаг"
    : /перевёрнут|пгип/i.test(text)
      ? "перевёрнутая голова и плечи"
      : /голов/i.test(text)
        ? "голова и плечи"
        : /имбаланс|fvg|дыр/i.test(text)
          ? "имбаланс"
          : /дивер/i.test(text)
            ? "дивер"
            : "";
  return fig ? `${name}: ${fig}, ${way}` : `${name}: ${way}`;
}

function whaleOf(text: string, mood: SketchMood): WhaleRead {
  const has = (re: RegExp) => re.test(text);
  const does: string[] = [];
  if (has(/стоп/i)) does.push("снимает стопы, потому что без них набирать некого");
  if (has(/флаг/i)) does.push("держит паузу во флаге и не отдаёт направление шеста");
  if (has(/перевёрнут|пгип/i)) does.push("собирает перевёрнутую голову и плечи у дна");
  else if (has(/голов/i)) does.push("раздаёт через голову и плечи");
  if (has(/имбаланс|дыр|fvg/i) && has(/заполн|перекры|частичн/i)) {
    does.push("дыры уже закрыл хотя бы частично и обратно в них не целится");
  } else if (has(/имбаланс|дыр|fvg/i)) {
    does.push("ведёт цену к имбалансу, а не мимо него");
  }
  if (has(/дивер/i) && has(/отработ/i)) does.push("старый дивер уже отработал, живым оставляет тот, чей ход ещё не был");
  else if (has(/дивер/i)) does.push("смотрит на дивер, который ещё не сходил");
  if (!does.length) {
    does.push(
      mood === "bull"
        ? "не продаёт этот откат и оставляет дорогу вверх"
        : mood === "bear"
          ? "не покупает отскок и оставляет дорогу вниз"
          : mood === "mixed"
            ? "сначала забирает топливо с одной стороны, потом разворачивает"
            : "сторону ещё не выбрал и цену не ведёт",
    );
  }
  const wants = has(/стоп/i) && (mood === "bull" || mood === "mixed")
    ? "Сначала снять стопы, и только потом идти в ту сторону, которая названа в заметке."
    : has(/имбаланс|дыр|fvg/i) && has(/заполн|перекры|частичн/i)
      ? "Не возвращаться в уже закрытую дыру, а идти дальше по названной стороне."
      : has(/имбаланс|дыр|fvg/i)
        ? "Довести цену до ближнего края имбаланса, а не пропускать его."
        : has(/дивер/i)
          ? "Дождаться хода в сторону дивера, который ещё не отработал."
          : mood === "bull"
            ? "Не отдавать направление вверх, пока час не выйдет из фигуры."
            : mood === "bear"
              ? "Не отдавать направление вниз, пока час не выйдет из фигуры."
              : "Не выбирать сторону, которой в словах нет.";
  const because = has(/стоп/i)
    ? "Стопы под уровнем для него топливо. Пока их не сняли, настоящего набора нет."
    : has(/дивер/i)
      ? "Дивер отделяет ход от шума. Тот, после которого цена уже сходила, больше её не двигает."
      : has(/имбаланс|дыр|fvg/i)
        ? "Открытая дыра тянет цену к ближнему краю. Частично закрытая уже не магнит."
        : "Фигура сама по себе его не двигает, пока час не закроется за её границей.";
  const therefore = has(/стоп/i) || (has(/имбаланс|дыр|fvg/i) && !has(/заполн|перекры|частичн/i))
    ? "Пока эта цель снизу не взята, направление из заметки ещё рано. После касания уже можно смотреть, куда смотрели слова."
    : "Пока час внутри фигуры, это чтение графика, не его сделка.";
  return {
    does: polish(does.join(", ")),
    wants,
    because,
    therefore,
  };
}

function levelsOf(text: string): string[] {
  const found = text.match(/\d+[.,]\d+|\d{2,}/g) ?? [];
  const uniq: string[] = [];
  for (const n of found) {
    const v = n.replace(",", ".");
    if (uniq.includes(v)) continue;
    if (Number(v) < 0.2 && !n.includes(".") && !n.includes(",")) continue;
    uniq.push(v);
    if (uniq.length >= 6) break;
  }
  return uniq;
}

function gloss(bit: string): string {
  const b = bit.toLowerCase();
  if (/дивер/.test(b) && /вверх|ввысь|лонг|рост/.test(b)) {
    return "Дивер здесь не против роста. Он как раз смотрит вверх, и этот ход ещё не отработан.";
  }
  if (/дивер/.test(b) && /вниз|шорт|паден/.test(b)) {
    return "Дивер здесь подтверждает спуск, а не отскок против него.";
  }
  if (/дивер/.test(b) && /отработ/.test(b)) {
    return "Отработанный дивер уже сделал своё. В зачёт идёт только тот, после которого цена ещё не сходила.";
  }
  if (/дивер/.test(b)) return "Дивер в этом разборе отделяет ход от шума. Без него фигура ещё пустая.";
  if (/стоп/.test(b)) return "Стопы здесь не помеха, а топливо. Пока их не сняли, крупняку не на чем набирать.";
  if (/частичн|заполн|перекры/.test(b)) return "Дыру не нужно закрывать целиком. Хватит края, и после этого она уже не магнит.";
  if (/флаг/.test(b)) return "Флаг сам по себе ещё не вход. Это пауза, сторона появится после выхода из него.";
  if (/голов/.test(b)) return "Фигура задаёт сторону, но жива она, только пока не снята голова.";
  if (/вверх|наверх|ввысь|лонг/.test(b)) return "Рост назван вероятным, но он стоит после условия, а не вместо него.";
  if (/вниз|спуск|шорт|паден/.test(b)) return "Спуск здесь — дорога к месту, а не обещание, что цена упадёт без остановки.";
  return "Это не новая идея сбоку, а часть того же разбора.";
}

function narrate(bits: string[], name: string, raw: string, mood: SketchMood): { lead: string; paragraphs: string[] } {
  const place = name ? `по ${name}` : "с этого графика";
  const clean = bits.map((b) => b.replace(/[.!?]+$/, ""));
  const lead = polish(
    `Заметка ${place} состоит из двух частей: графика, как он нарисован, со стрелками, зонами и подписями, и слов рядом с ним. ${clean.join(". ")}`,
  );
  const paragraphs = clean.map((b, i) => {
    const step = clean.length === 1 ? "Если разложить эту фразу" : i === 0 ? "Сначала так" : i === clean.length - 1 ? "И в конце так" : "Дальше так";
    return polish(`${step}: ${b.charAt(0).toLowerCase()}${b.slice(1)}. ${gloss(b)}`);
  });
  const aboutPlayer = /стоп|флаг|голов|имбаланс|дыр|fvg|дивер|ликвид/i.test(raw);
  if (aboutPlayer) {
    const player = whaleOf(raw, mood);
    paragraphs.push(polish(`Для крупного игрока это значит вот что. ${player.does} ${player.wants} ${player.because} ${player.therefore}`));
  } else if (mood === "calm") {
    paragraphs.push("Сторона в словах не названа, поэтому додумывать за крупного здесь нечего. Из заметки ордера не следует.");
  } else {
    paragraphs.push(
      mood === "bull"
        ? "В словах назван рост, но нет фигуры, стопов или дивера, за которые крупный обычно держится. Пока это наблюдение, не его ход."
        : "В словах назван спуск, но нет фигуры, стопов или дивера. Пока это наблюдение, не его ход.",
    );
  }
  return { lead, paragraphs };
}

export function parsePlan(text: string): ChartPlan | null {
  const m = text.match(/ПРИКАЗ\s+([A-Za-z]{6,10})\s+(BUY|SELL)\s+ENTRY\s+([0-9]+(?:[.,][0-9]+)?)\s+STOP\s+([0-9]+(?:[.,][0-9]+)?)\s+TP\s+([0-9]+(?:[.,][0-9]+)?)(?:\s+СТОЛ)?/i);
  if (!m) return null;
  const num = (s: string) => Number(s.replace(",", "."));
  const plan: ChartPlan = {
    symbol: m[1]!.toUpperCase(),
    side: m[2]!.toLowerCase() === "sell" ? "sell" : "buy",
    entry: num(m[3]!),
    stop: num(m[4]!),
    target: num(m[5]!),
    own: /ПРИКАЗ\s+[A-Za-z]{6,10}\s+(?:BUY|SELL)\s+ENTRY\s+\S+\s+STOP\s+\S+\s+TP\s+\S+\s+СТОЛ/i.test(text),
  };
  if (![plan.entry, plan.stop, plan.target].every((n) => Number.isFinite(n) && n > 0)) return null;
  if (plan.side === "buy" && !(plan.stop < plan.entry && plan.entry < plan.target)) return null;
  if (plan.side === "sell" && !(plan.target < plan.entry && plan.entry < plan.stop)) return null;
  return plan;
}

export function stripPlan(text: string) {
  return text.replace(/\n?ПРИКАЗ\s+[A-Za-z]{6,10}\s+(?:BUY|SELL)\s+ENTRY\s+\S+\s+STOP\s+\S+\s+TP\s+\S+(?:\s+СТОЛ)?\s*/gi, "\n").trim();
}
export function retellSketch(raw: string, instrument: string): SketchPiece | null {
  const original = tidy(raw);
  if (original.length < 8) return null;
  const plan = parsePlan(original);
  const clean = stripPlan(original);
  if (clean.length < 8 && !plan) return null;
  const spoken = clean.length >= 8 ? clean : `На графике ${plan!.symbol} подписан ${plan!.side === "buy" ? "лонг" : "шорт"}.`;
  const name = instrument.trim() || plan?.symbol || "";
  const mood = moodOf(spoken);
  const told = narrate(sentencesOf(spoken), name, spoken, mood);
  return {
    kicker: name ? name.toUpperCase() : "ЗАМЕТКА С ГРАФИКА",
    title: headline(name, spoken),
    lead: told.lead,
    paragraphs: told.paragraphs,
    levels: levelsOf(spoken),
    original: clean.length >= 8 ? clean : spoken,
    mood,
    whale: whaleOf(spoken, mood),
    plan,
  };
}
