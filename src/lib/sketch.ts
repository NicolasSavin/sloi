export type SketchMood = "bull" | "bear" | "mixed" | "calm";

export interface SketchPiece {
  kicker: string;
  title: string;
  lead: string;
  paragraphs: string[];
  levels: string[];
  original: string;
  mood: SketchMood;
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
  };
}
