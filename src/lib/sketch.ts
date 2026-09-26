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

function narrate(bits: string[], name: string, mood: SketchMood): { lead: string; paragraphs: string[] } {
  const place = name ? `по ${name}` : "с этого графика";
  const clean = bits.map((b) => b.replace(/[.!?]+$/, ""));
  const lead = polish(
    `Заметка ${place} собрана не из подписи индикатора, а из слов рядом с графиком. ${clean.join(". ")}`,
  );
  const paragraphs = clean.map((b, i) => {
    const step = clean.length === 1 ? "Если разложить эту фразу" : i === 0 ? "Сначала так" : i === clean.length - 1 ? "И в конце так" : "Дальше так";
    return polish(`${step}: ${b.charAt(0).toLowerCase()}${b.slice(1)}. ${gloss(b)}`);
  });
  const order =
    mood === "mixed"
      ? "Порядок из этих слов такой. Сначала крупный забирает то, что лежит снизу: стопы или край дыры. Потом уже ход в сторону дивера, который ещё не отработал. Покупать до этого касания значит перепутать дорогу и цель."
      : mood === "bull"
        ? "Из этих слов следует рост, но не с любого места. Крупный не отдаёт направление, пока час не выйдет из фигуры в его сторону. До закрытия это чтение, не приказ."
        : mood === "bear"
          ? "Из этих слов следует спуск, но не из середины. Крупный ведёт цену к ликвидности, и час должен закрыться за границей. Пока свеча внутри, шорт был бы догадкой."
          : "Сторона в словах ещё не названа. Крупный в таком месте ничего не показывает, и ордера из заметки не следует.";
  paragraphs.push(order);
  return { lead, paragraphs };
}

/** Journalistic retelling. Uses only the author's words. Adds no prices and no new scenario. */
export function retellSketch(raw: string, instrument: string): SketchPiece | null {
  const original = tidy(raw);
  if (original.length < 8) return null;
  const name = instrument.trim();
  const mood = moodOf(original);
  const told = narrate(sentencesOf(original), name, mood);
  return {
    kicker: name ? name.toUpperCase() : "ЗАМЕТКА С ГРАФИКА",
    title: headline(name, original),
    lead: told.lead,
    paragraphs: told.paragraphs,
    levels: levelsOf(original),
    original,
    mood,
    whale: whaleOf(original, mood),
  };
}
