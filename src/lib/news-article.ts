import type { HomeQuote } from "@/lib/home";
import { formatPct, formatPrice } from "@/lib/utils";
import type { NewsArticle, NewsItem } from "@/lib/news";

const GLOSS: [RegExp, string][] = [
  [/Federal Reserve/gi, "ФРС"],
  [/\bFOMC\b/g, "ФРС"],
  [/\bthe Fed\b/gi, "ФРС"],
  [/\bFed\b/g, "ФРС"],
  [/\bPowell\b/g, "Пауэлл"],
  [/Wall Street/gi, "Уолл-стрит"],
  [/White House/gi, "Белый дом"],
  [/Treasury/gi, "казначейские облигации"],
  [/interest rates?/gi, "ставки"],
  [/rate cuts?/gi, "снижение ставки"],
  [/rate hike/gi, "повышение ставки"],
  [/\byields?\b/gi, "доходности"],
  [/\binflation\b/gi, "инфляция"],
  [/\brecession\b/gi, "рецессия"],
  [/\bdollar\b/gi, "доллар"],
  [/\beuro\b/gi, "евро"],
  [/\byen\b/gi, "иена"],
  [/sterling|pound/gi, "фунт"],
  [/\bgold\b/gi, "золото"],
  [/\bsilver\b/gi, "серебро"],
  [/\bstocks?\b/gi, "акции"],
  [/\bshares?\b/gi, "бумаги"],
  [/S&P 500/gi, "S&P 500"],
  [/Nasdaq/gi, "Nasdaq"],
  [/\brally\b/gi, "ралли"],
  [/\bsurge[sd]?\b/gi, "скачок"],
  [/\bslump[sd]?\b/gi, "просадка"],
  [/\bslide[sd]?\b/gi, "снижение"],
  [/\bdrops?\b/gi, "падение"],
  [/\brises?\b/gi, "рост"],
  [/\bhits?\b/gi, "достигает"],
  [/\brecord\b/gi, "рекорд"],
  [/\bforecast\b/gi, "прогноз"],
  [/\btraders?\b/gi, "игроки"],
  [/\binvestors?\b/gi, "инвесторы"],
  [/\bmarkets?\b/gi, "рынок"],
];

function rusTitle(item: NewsItem): string {
  if (!item.foreign) return item.title;
  let t = item.title;
  for (const [re, ru] of GLOSS) t = t.replace(re, ru);
  const stillLatin = (t.match(/[A-Za-z]/g) ?? []).length > 18;
  if (stillLatin) return "";
  t = t.replace(/\s+/g, " ").replace(/^[:\-\s]+/, "").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function relatedQuote(item: NewsItem, quotes: HomeQuote[]): HomeQuote | undefined {
  const t = `${item.title} ${item.snippet}`.toLowerCase();
  const pick =
    (/золот|gold|серебр|silver/.test(t) && "XAUUSD") ||
    (/иен|yen|япон/.test(t) && "USDJPY") ||
    (/фунт|sterling|gbp/.test(t) && "GBPUSD") ||
    (/евро|euro/.test(t) && "EURUSD") ||
    (/nasdaq/.test(t) && "QQQ") ||
    (/акци|s&p|индекс|stock|dow/.test(t) && "SPY") ||
    (/доллар|dollar|фрс|fed/.test(t) && "EURUSD") ||
    null;
  return quotes.find((q) => q.id === pick) ?? quotes[0];
}

function tapeLine(q: HomeQuote | undefined): string {
  if (!q) return "На нашем столе цена ещё подтягивается.";
  const dir = q.changePct >= 0 ? "в плюсе" : "в минусе";
  return `${q.label} сейчас ${formatPrice(q.price, q.decimals)}, за час ${dir} на ${formatPct(Math.abs(q.changePct))}.`;
}

export function buildArticle(item: NewsItem, quotes: HomeQuote[]): NewsArticle {
  const title = rusTitle(item);
  const q = relatedQuote(item, quotes);
  const tape = tapeLine(q);
  const foreign = item.foreign;

  const dek = foreign
    ? `Иностранная публикация (${item.source}). Ниже — смысл по-русски и интерпретация SLOI: что это даёт крупняку.`
    : `По мотивам ${item.source}. Коротко, что случилось и как это читает стол.`;

  const body: string[] = [];
  if (foreign) {
    body.push(
      `Оригинал вышел на ${item.source}. Смысл ленты — ${title.toLowerCase()}. Мы не копируем чужой текст: берём факт и перекладываем его на уровни, которые видим сами.`,
    );
  } else {
    body.push(
      `${item.source} пишет: «${item.title}». Это не сигнал «покупай/продавай», а повод. Дальше — что из этого следует для цены.`,
    );
  }
  body.push(tape);

  if (item.tag === "Металлы") {
    body.push(
      "Когда в заголовках золото, крупняк обычно не «верит в металл», а прячет долларовый риск. Растут либо страх по ставке, либо дыры в балансе. Розница бежит в folie, институционал — в объёме на дисконте.",
    );
  } else if (item.tag === "Политика") {
    body.push(
      "Ставка и ФРС двигают не «новость», а цену денег. Если тон жёстче — доллар и доходности давят риск; если мягче — премия возвращается в евро, фунт и металл. Крупняк ждёт не слово, а реакцию DXY.",
    );
  } else if (item.tag === "Акции") {
    body.push(
      "По акциям смотрим не заголовок индекса, а кто забирает ликвидность на выбросах. Если розница радуется ралли, а премия уже сверху — это часто раздача, не вход.",
    );
  } else {
    body.push(
      "По валютам заголовок почти всегда про доллар. Пара — следствие. Сначала смотрим, кого вытряхнули за край диапазона, потом — вернулась ли цена в зону, где крупному выгодно набирать.",
    );
  }

  const up = (q?.changePct ?? 0) >= 0;
  const take = {
    doing: up
      ? `На ${q?.label ?? "рынке"} цену уже тянут вверх. Крупняк, скорее, удерживает премию и смотрит, докупят ли за ним.`
      : `На ${q?.label ?? "рынке"} час слабый. Это либо набор с дисконта, либо сдача слабым рукам — смотрим, кто остаётся в зоне.`,
    waiting:
      "Ждёт не сам заголовок, а подтверждение объёмом: удержат ли уровень после новости или вытряхнут стопы и вернут цену.",
    leadsTo: up
      ? "Если зона жива — заголовок станет поводом дожать ход. Если выбивают обратно — новость уже в цене, дальше пауза."
      : "Если дисконт удерживают — новость дали, чтобы набрать. Если прокол без возврата — тезис ленты мёртв.",
  };

  return {
    ...item,
    title,
    dek,
    body,
    take,
    relatedId: q?.id ?? null,
    image: item.image,
  };
}
