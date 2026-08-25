import type { DigestMarket } from "@/lib/digest";
import { marketArt } from "@/lib/art";
import type { HomeQuote } from "@/lib/home";
import type { NewsArticle, NewsImpact, NewsItem } from "@/lib/news";
import { formatPct, formatPrice } from "@/lib/utils";

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

function buildImpact(item: NewsItem, q: HomeQuote | undefined): NewsImpact {
  const t = `${item.title} ${item.snippet}`.toLowerCase();
  const pair = q?.id ?? "EURUSD";
  const pairLabel = q?.label ?? "EUR/USD";
  const hawk =
    /повыш\w* ставк|ужесточ|жёстк|жестк|hawkish|rate hike|inflation (hot|high|surge)|инфляц\w* (выш|рост|разгон)|пауэлл.*не.*спеш|holds rates/.test(
      t,
    );
  const dove =
    /сниж\w* ставк|смягч|мягк|dovish|rate cut|pause|инфляц\w* (слаб|замед|пад)|пик инфляц/.test(t);
  const goldish = /золот|gold|серебр|silver/.test(t);
  const riskOn = /ралли|surge|record high|акци\w* рост|nasdaq.*рост/.test(t);
  const riskOff = /страх|safe haven|обвал|slump|recess|риск.*off/.test(t);
  const oil = /нефть|oil|opec|brent|wti/.test(t);

  let tone: NewsImpact["tone"] = "neutral";
  let weight: NewsImpact["weight"] = "умеренно";
  let line = `Факт ленты касается ${pairLabel}. Пока это заголовок: смотрим реакцию цены, не открываем с тикера.`;

  if (hawk) {
    tone = pair === "XAUUSD" || pair === "EURUSD" || pair === "GBPUSD" ? "bear" : "bull";
    weight = "сильно";
    line = `Жёсткий тон по ставке. Доллар и доходности обычно в плюс, ${pairLabel} — под давлением, если это евро/золото. Вес: сильно.`;
    if (pair === "USDJPY") line = `Жёсткая ставка. Доллар часто сильнее иены — ${pairLabel} может тянуть вверх. Вес: сильно.`;
  } else if (dove) {
    tone = pair === "XAUUSD" || pair === "EURUSD" || pair === "GBPUSD" ? "bull" : "bear";
    weight = "сильно";
    line = `Мягче по ставке. Металл и евро чаще в плюсе, доллар слабее. Для ${pairLabel} — поддержка риска. Вес: сильно.`;
  } else if (goldish) {
    tone = /рост|рекорд|выше|rally|surge/.test(t) ? "bull" : /пад|сниж|slump|drop/.test(t) ? "bear" : "neutral";
    weight = "умеренно";
    line = `Новость по металлу. На стол: ${pairLabel}. Это спрос на защиту или выход из доллара — не «покупай золото с заголовка». Вес: умеренно.`;
  } else if (oil) {
    tone = /рост|дорож|surge/.test(t) ? "bull" : "neutral";
    weight = "умеренно";
    line = `Нефть в ленте. Тянет инфляционные ожидания и рублёвые/канадские истории. Для ${pairLabel} — фон, не триггер. Вес: умеренно.`;
  } else if (riskOn) {
    tone = "bull";
    weight = "умеренно";
    line = `Риск в заголовках включён. Акции и йена-кэри чувствительны. ${pairLabel} может ехать вместе с аппетитом, пока не выбьют край. Вес: умеренно.`;
  } else if (riskOff) {
    tone = "bear";
    weight = "сильно";
    line = `Страх в ленте. Обычно доллар и йена, золото как убежище. ${pairLabel}: смотрим, не вытряхнули ли стопы. Вес: сильно.`;
  }

  return { pair, pairLabel, tone, weight, line };
}

export function buildArticle(item: NewsItem, quotes: HomeQuote[]): NewsArticle {
  const ru = rusTitle(item);
  const q = relatedQuote(item, quotes);
  const foreign = item.foreign;
  const impact = buildImpact(item, q);
  const factTitle = item.originTitle || item.title;
  const snippet = (item.snippet || "").trim();
  const snippetIsTitle = !snippet || snippet === factTitle || snippet === item.title;

  const dek = snippetIsTitle
    ? `${item.source}${foreign ? " · оригинал на иностранном" : ""}`
    : snippet.slice(0, 280);

  const body: string[] = [];
  if (!snippetIsTitle) body.push(snippet.slice(0, 900));
  else if (foreign && ru) body.push(`Смысл заголовка: ${ru}`);

  const take = {
    doing: `Лента дала факт. По ${impact.pairLabel} тон ${impact.tone === "bull" ? "в пользу роста" : impact.tone === "bear" ? "в пользу снижения" : "нейтральный"}, вес — ${impact.weight}.`,
    waiting: "Ждём, как цена примет заголовок: удержат уровень или вытряхнут край и вернут.",
    leadsTo: impact.line,
  };

  return {
    ...item,
    title: ru || factTitle,
    originTitle: factTitle,
    dek,
    body,
    take,
    impact,
    relatedId: q?.id ?? null,
    image: item.image,
  };
}

function deskHeadline(m: DigestMarket): string {
  if (m.advice.action === "long") return `${m.spec.label}: крупняк набирает с дисконта`;
  if (m.advice.action === "short") return `${m.spec.label}: премия, крупняк раздаёт`;
  return `${m.spec.label}: пауза у края диапазона`;
}

export function buildDeskArticles(
  markets: DigestMarket[],
  quotes: HomeQuote[],
  fundLine: string,
): NewsArticle[] {
  const ranked = [...markets].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  const picks: DigestMarket[] = [];
  for (const id of ["XAUUSD", "EURUSD", "USDJPY", "USOIL", "SPY"]) {
    const hit = ranked.find((m) => m.spec.id === id);
    if (hit) picks.push(hit);
  }
  for (const m of ranked) {
    if (picks.length >= 6) break;
    if (!picks.some((p) => p.spec.id === m.spec.id)) picks.push(m);
  }
  const now = new Date().toUTCString();
  return picks.map((m) => {
    const q = quotes.find((x) => x.id === m.spec.id);
    const px = formatPrice(m.lastClose, m.spec.decimals);
    const dir = m.changePct >= 0 ? "плюс" : "минус";
    const title = deskHeadline(m);
    const tape = q
      ? `${q.label} сейчас ${formatPrice(q.price, q.decimals)}, за час ${dir} ${formatPct(Math.abs(q.changePct))}.`
      : `${m.spec.label} на ${px}.`;
    const doing = m.story.doing || m.story.now;
    const waiting = m.story.waiting;
    const leadsTo = m.story.leadsTo || m.story.means;
    return {
      id: `stol-${m.spec.id}`,
      slug: `stol-${m.spec.id.toLowerCase()}`,
      title,
      source: "SLOI",
      published: now,
      originHref: "",
      originTitle: title,
      snippet: doing,
      image: marketArt(m.spec.id),
      tag: "Стол",
      foreign: false,
      dek: `Собственный разбор. Цена ${px}. ${fundLine}`,
      body: [
        doing,
        tape,
        waiting,
        leadsTo,
        fundLine ? `Фундамент дня: ${fundLine}` : "",
        m.setup.entry && m.setup.stop
          ? `Рабочие уровни: вход ${formatPrice(m.setup.entry, m.spec.decimals)}, стоп ${formatPrice(m.setup.stop, m.spec.decimals)}.`
          : "Чистого входа нет — смотрим край диапазона, не тикер.",
      ].filter(Boolean),
      take: { doing, waiting, leadsTo },
      impact: {
        pair: m.spec.id,
        pairLabel: m.spec.label,
        tone: m.advice.action === "long" ? "bull" : m.advice.action === "short" ? "bear" : "neutral",
        weight: "слабо",
        line: "Это разбор графика, не новость ленты.",
      },
      relatedId: m.spec.id,
    };
  });
}

