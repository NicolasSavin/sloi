export type SketchMood = "bull" | "bear" | "mixed" | "calm";

export interface WhaleRead {
  does: string;
  wants: string;
  because: string;
  therefore: string;
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
  const wants =
    mood === "mixed"
      ? "Сначала добрать стопы или край дыры снизу, и уже оттуда развернуть ход в сторону живого дивера."
      : mood === "bull"
        ? "Продолжить ход вверх. Старая закрытая дыра ему больше не нужна."
        : mood === "bear"
          ? "Продолжить ход вниз, к ближайшей ликвидности, а не обратно в фигуру."
          : "Дождаться закрытия часа. Без стороны ему некуда вести цену.";
  const because = has(/стоп/i)
    ? "Стопы под уровнем для него топливо. Пока их не сняли, настоящего набора нет."
    : has(/дивер/i)
      ? "Дивер отделяет ход от шума. Тот, после которого цена уже сходила, больше её не двигает."
      : has(/имбаланс|дыр|fvg/i)
        ? "Открытая дыра тянет цену к ближнему краю. Частично закрытая уже не магнит."
        : "Он идёт туда, где стоит чужая ликвидность. Красивая фигура сама по себе его не двигает.";
  const therefore =
    mood === "mixed"
      ? "Пока площадка снизу не взята, ход вверх рано. После съёма стопов или частичного закрытия дыры вероятнее разворот туда, куда смотрит дивер."
      : mood === "bull" || mood === "bear"
        ? "Следствие не раньше закрытия часа за границей фигуры. Пока свеча внутри, это ещё не его ход."
        : "Следствия пока нет: крупняк ничего не показал.";
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

/** Journalistic retelling. Uses only the author's words. Adds no prices and no new scenario. */
export function retellSketch(raw: string, instrument: string): SketchPiece | null {
  const original = tidy(raw);
  if (original.length < 8) return null;
  const sentences = sentencesOf(original).map(polish);
  const name = instrument.trim();
  const leadBits = sentences.slice(0, 2);
  const rest = sentences.slice(2);
  const named = name && leadBits.join(" ").toLowerCase().includes(name.toLowerCase());
  const where = name && !named ? `На графике ${name} ` : "На графике ";
  const body = leadBits.join(" ");
  const lead = named ? body : `${where}${body.charAt(0).toLowerCase()}${body.slice(1)}`;
  return {
    kicker: name ? name.toUpperCase() : "ЗАМЕТКА С ГРАФИКА",
    title: headline(name, original),
    lead: polish(lead),
    paragraphs: rest,
    levels: levelsOf(original),
    original,
    mood: moodOf(original),
    whale: whaleOf(original, moodOf(original)),
  };
}
