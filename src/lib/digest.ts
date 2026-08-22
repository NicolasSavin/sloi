import { advise, type Advice } from "@/lib/advisor";
import type { Candle, SymbolSpec } from "@/lib/market/types";
import type { FundWind, FundamentalSnap } from "@/lib/fundamentals";
import type { SentimentSnap } from "@/lib/sentiment";
import type { LocalSetup, MarketStory, SmcSnapshot, Zone } from "@/lib/smc/engine";
import { formatPrice } from "@/lib/utils";

export interface DigestMarket {
  spec: SymbolSpec;
  lastClose: number;
  lastHigh: number;
  lastLow: number;
  changePct: number;
  bias: SmcSnapshot["bias"];
  score: number;
  story: MarketStory;
  setup: LocalSetup;
  range: { high: number; low: number; eq: number };
  advice: Advice;
  premiumDiscount: SmcSnapshot["premiumDiscount"];
  wind?: FundWind;
}

export interface ChartNote {
  time: number;
  price: number;
  name: string;
  priceLabel: string;
  hint: string;
  tone: "bull" | "bear" | "neutral";
}

export interface ChartLevel {
  id: string;
  name: string;
  price: number;
  priceLabel: string;
  hint: string;
  tone: "bull" | "bear" | "neutral";
}

export interface LeadChart {
  candles: Candle[];
  notes: ChartNote[];
  levels: ChartLevel[];
  zones: Zone[];
  decimals: number;
  margin: {
    upper: { top: number; bottom: number; active: boolean };
    lower: { top: number; bottom: number; active: boolean };
  };
}

export interface PosterRow {
  icon: string;
  label: string;
  value: string;
}

export interface PosterCard {
  kicker: string;
  title: string;
  tone: "cyan" | "violet" | "amber" | "emerald";
  rows: PosterRow[];
  footer: string;
}

export interface PosterSetup {
  side: "short" | "long";
  priority: boolean;
  entry: string;
  sl: string;
  tp1: string;
  tp2: string;
}

export interface DailyPoster {
  pair: string;
  price: string;
  dateLabel: string;
  atr: string;
  atrNote: string;
  bias: string;
  biasTone: "bull" | "bear" | "warn";
  cards: PosterCard[];
  setups: PosterSetup[];
  levels: { name: string; price: string; hint: string; tone: "bull" | "bear" | "neutral" }[];
  patternPills: { title: string; text: string }[];
  risk: string;
}

export interface DailyDigest {
  date: string;
  dateLabel: string;
  lead: DigestMarket;
  markets: DigestMarket[];
  sentiment: SentimentSnap;
  fund: FundamentalSnap;
  chart: LeadChart;
  poster: DailyPoster;
  tgOptions: { text: string; at: string }[];
  article: {
    kicker: string;
    title: string;
    dek: string;
    body: string;
  };
}

export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function dateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  return dt.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function toDigestMarket(spec: SymbolSpec, snap: SmcSnapshot, spread?: number, last?: Candle): DigestMarket {
  return {
    spec,
    lastClose: snap.lastClose,
    lastHigh: last?.high ?? snap.lastClose,
    lastLow: last?.low ?? snap.lastClose,
    changePct: snap.lastChangePct,
    bias: snap.bias,
    score: snap.score,
    story: snap.story,
    setup: snap.localSetup,
    range: snap.dealingRange,
    advice: advise(snap, spec, spread ?? spec.spread),
    premiumDiscount: snap.premiumDiscount,
  };
}

export function pickLead(markets: DigestMarket[]): DigestMarket {
  const ranked = [...markets].sort((a, b) => {
    const dir = (m: DigestMarket) => (m.bias === "range" ? 0 : 1);
    return dir(b) - dir(a) || b.score - a.score;
  });
  return ranked[0]!;
}

export function notesFromSnap(snap: SmcSnapshot, decimals: number): ChartNote[] {
  const px = (n: number) => formatPrice(n, decimals);
  const notes: ChartNote[] = [];
  const lastEv = snap.events.at(-1);
  if (lastEv) {
    notes.push({
      time: lastEv.time,
      price: lastEv.price,
      name: lastEv.kind === "CHoCH" ? "CHoCH" : "BOS",
      priceLabel: px(lastEv.price),
      hint: lastEv.side === "bull" ? "слом вверх" : "слом вниз",
      tone: lastEv.side === "bull" ? "bull" : "bear",
    });
  }
  const swept = snap.liquidity.find((l) => l.swept);
  if (swept) {
    notes.push({
      time: swept.time,
      price: swept.price,
      name: "свип",
      priceLabel: px(swept.price),
      hint: "сняли стопы",
      tone: "bear",
    });
  }
  const zone = snap.orderBlocks.at(-1) ?? snap.fvgs.at(-1);
  if (zone) {
    notes.push({
      time: zone.startTime,
      price: (zone.top + zone.bottom) / 2,
      name: zone.kind === "ob" ? "блок" : "FVG",
      priceLabel: `${px(zone.bottom)}–${px(zone.top)}`,
      hint: zone.kind === "ob" ? "зона возврата" : "разрыв",
      tone: zone.side === "bull" ? "bull" : "bear",
    });
  }
  if (snap.localSetup.entry != null) {
    notes.push({
      time: snap.events.at(-1)?.time ?? snap.swings.at(-1)?.time ?? 0,
      price: snap.localSetup.entry,
      name: "вход",
      priceLabel: px(snap.localSetup.entry),
      hint: "ждёт цену здесь",
      tone: "neutral",
    });
  }
  return notes.slice(0, 4);
}

export function levelsFromSnap(snap: SmcSnapshot, decimals: number): ChartLevel[] {
  const px = (n: number) => formatPrice(n, decimals);
  const rows: ChartLevel[] = [
    { id: "high", name: "верх", price: snap.dealingRange.high, priceLabel: px(snap.dealingRange.high), hint: "край диапазона", tone: "bear" },
    { id: "eq", name: "EQ", price: snap.dealingRange.eq, priceLabel: px(snap.dealingRange.eq), hint: "середина / Fib 0.5", tone: "neutral" },
    {
      id: "fib62",
      name: "0.62",
      price: snap.dealingRange.high - (snap.dealingRange.high - snap.dealingRange.low) * 0.618,
      priceLabel: px(snap.dealingRange.high - (snap.dealingRange.high - snap.dealingRange.low) * 0.618),
      hint: "Fib 0.618 — начало OTE, линейка свинга",
      tone: "bull",
    },
    {
      id: "fib79",
      name: "0.79",
      price: snap.dealingRange.high - (snap.dealingRange.high - snap.dealingRange.low) * 0.786,
      priceLabel: px(snap.dealingRange.high - (snap.dealingRange.high - snap.dealingRange.low) * 0.786),
      hint: "Fib 0.786 — глубокий OTE",
      tone: "bull",
    },
    {
      id: "m-up",
      name: "маржа верх",
      price: snap.margin.upper.bottom,
      priceLabel: px(snap.margin.upper.bottom),
      hint: "начало верхней маржи (79%)",
      tone: "bear",
    },
    {
      id: "m-dn",
      name: "маржа низ",
      price: snap.margin.lower.top,
      priceLabel: px(snap.margin.lower.top),
      hint: "начало нижней маржи (21%)",
      tone: "bull",
    },
    { id: "low", name: "низ", price: snap.dealingRange.low, priceLabel: px(snap.dealingRange.low), hint: "край диапазона", tone: "bull" },
    { id: "price", name: "цена", price: snap.lastClose, priceLabel: px(snap.lastClose), hint: "сейчас", tone: "neutral" },
  ];
  if (snap.localSetup.entry != null) {
    rows.push({
      id: "entry",
      name: "вход",
      price: snap.localSetup.entry,
      priceLabel: px(snap.localSetup.entry),
      hint: "куда ждут цену",
      tone: "neutral",
    });
  }
  if (snap.localSetup.stop != null) {
    rows.push({
      id: "stop",
      name: "стоп",
      price: snap.localSetup.stop,
      priceLabel: px(snap.localSetup.stop),
      hint: "здесь тезис мёртв",
      tone: "bear",
    });
  }
  snap.localSetup.targets.slice(0, 2).forEach((t, i) => {
    rows.push({
      id: `tp${i + 1}`,
      name: `цель ${i + 1}`,
      price: t,
      priceLabel: px(t),
      hint: i === 0 ? "первая цель" : "растяжение",
      tone: "bull",
    });
  });
  const zone = snap.orderBlocks.at(-1) ?? snap.fvgs.at(-1);
  if (zone) {
    rows.push({
      id: "zone-top",
      name: zone.kind === "ob" ? "блок верх" : "FVG верх",
      price: zone.top,
      priceLabel: px(zone.top),
      hint: "верх зоны",
      tone: zone.side === "bull" ? "bull" : "bear",
    });
    rows.push({
      id: "zone-bot",
      name: zone.kind === "ob" ? "блок низ" : "FVG низ",
      price: zone.bottom,
      priceLabel: px(zone.bottom),
      hint: "низ зоны",
      tone: zone.side === "bull" ? "bull" : "bear",
    });
  }
  const lastEv = snap.events.at(-1);
  if (lastEv) {
    rows.push({
      id: "bos",
      name: lastEv.kind === "CHoCH" ? "CHoCH" : "BOS",
      price: lastEv.price,
      priceLabel: px(lastEv.price),
      hint: "уровень слома",
      tone: lastEv.side === "bull" ? "bull" : "bear",
    });
  }
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = r.priceLabel;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function writeArticle(
  lead: DigestMarket,
  others: DigestMarket[],
  date: string,
  sentiment: SentimentSnap,
  fund: FundamentalSnap,
  leadSnap: SmcSnapshot,
) {
  const name = lead.spec.label;
  const othersBit = others
    .slice(0, 4)
    .map((m) => m.spec.label)
    .join(", ");

  const body = [
    fund.halt.active ? fund.halt.line : "",
    fund.plain.simple,
    fund.plain.why,
    fund.plain.so,
    lead.story.doing,
    lead.story.waiting,
    leadSnap.wyckoff ? `${leadSnap.wyckoff.name}. ${leadSnap.wyckoff.therefore}` : "",
    leadSnap.patterns[0] ? `${leadSnap.patterns[0].name}: ${leadSnap.patterns[0].therefore}` : "",
    leadSnap.flow.cvdDiv ? leadSnap.flow.cvdDiv.therefore : leadSnap.flow.events[0]?.therefore ?? "",
    leadSnap.margin.where === "upper"
      ? `Сейчас верхняя маржа ${formatPrice(leadSnap.margin.upper.bottom, lead.spec.decimals)}–${formatPrice(leadSnap.margin.upper.top, lead.spec.decimals)}: ${leadSnap.margin.upper.hint}`
      : leadSnap.margin.where === "lower"
        ? `Сейчас нижняя маржа ${formatPrice(leadSnap.margin.lower.bottom, lead.spec.decimals)}–${formatPrice(leadSnap.margin.lower.top, lead.spec.decimals)}: ${leadSnap.margin.lower.hint}`
        : "",
    sentiment.line,
    lead.story.leadsTo,
    lead.wind?.note ?? "",
    othersBit
      ? `На остальных рынках дня (${othersBit}) тот же принцип: не середина, а край, где крупняк либо набирает, либо раздаёт.`
      : "",
    "Это карта снимка, не приказ открыть сделку. Живой спред — только в эксперте MT4 на вашем счёте.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    kicker: `Крупняк · ${dateLabel(date)}`,
    title: `${name}. Что делает крупный игрок`,
    dek: "Одна история: структура, фундамент и сентимент — что он сделал, чего ждёт, к чему это приведёт.",
    body,
  };
}

export function buildPoster(lead: DigestMarket, snap: SmcSnapshot, date: string): DailyPoster {
  const spec = lead.spec;
  const px = (n: number) => formatPrice(n, spec.decimals);
  const atrPips = Math.max(1, Math.round(snap.atr / spec.pip));
  const demand = [...snap.orderBlocks, ...snap.fvgs].filter((z) => z.side === "bull").at(-1);
  const supply = [...snap.orderBlocks, ...snap.fvgs].filter((z) => z.side === "bear").at(-1);
  const bsl = snap.liquidity.filter((l) => l.side === "buy").at(-1);
  const ssl = snap.liquidity.filter((l) => l.side === "sell").at(-1);
  const lastEv = snap.events.at(-1);
  const pat = snap.patterns;
  const shortOn = lead.advice.action === "short" || (lead.bias === "bearish" && lead.advice.action !== "long");
  const entry = snap.localSetup.entry;
  const stop = snap.localSetup.stop;
  const tps = snap.localSetup.targets;
  const short: PosterSetup = {
    side: "short",
    priority: shortOn,
    entry: supply ? `${px(supply.bottom)}–${px(supply.top)}` : entry != null ? px(entry) : "—",
    sl: stop != null && shortOn ? px(stop) : px(snap.dealingRange.high),
    tp1: tps[0] != null ? px(tps[0]) : px(snap.dealingRange.eq),
    tp2: tps[1] != null ? px(tps[1]) : px(snap.dealingRange.low),
  };
  const long: PosterSetup = {
    side: "long",
    priority: !shortOn,
    entry: demand ? `${px(demand.bottom)}–${px(demand.top)}` : px(snap.ote.low),
    sl: px(snap.dealingRange.low),
    tp1: px(snap.dealingRange.eq),
    tp2: px(snap.dealingRange.high),
  };
  const wave5 = snap.trend === "down" ? snap.dealingRange.low : snap.dealingRange.high;
  const invalid = snap.trend === "down" ? snap.dealingRange.high : snap.dealingRange.low;
  return {
    pair: spec.label,
    price: px(lead.lastClose),
    dateLabel: dateLabel(date),
    atr: `≈ ${atrPips} ${spec.kind === "fx" ? "pips" : "пунктов"}`,
    atrNote: `ATR ${px(snap.atr)} на снимке 4ч`,
    bias:
      lead.bias === "bearish"
        ? "медвежий · приоритет продаж"
        : lead.bias === "bullish"
          ? "бычий · приоритет покупок"
          : "внутри range · ждать край",
    biasTone: lead.bias === "bearish" ? "bear" : lead.bias === "bullish" ? "bull" : "warn",
    cards: [
      {
        kicker: "1",
        title: "SMC SMART MONEY",
        tone: "cyan",
        rows: [
          {
            icon: "💧",
            label: "Структура",
            value:
              snap.trend === "up"
                ? "Рост после набора"
                : snap.trend === "down"
                  ? "Коррекция / раздача"
                  : "Диапазон, нет смещения",
          },
          {
            icon: "🟢",
            label: "Demand / OB",
            value: demand ? `${px(demand.bottom)}–${px(demand.top)}` : "чистого блока покупок нет",
          },
          {
            icon: "🔴",
            label: "Supply",
            value: supply ? `${px(supply.bottom)}–${px(supply.top)}` : "чистой зоны продаж нет",
          },
          {
            icon: "▢",
            label: "FVG",
            value: snap.fvgs.length ? `${snap.fvgs.length} незакрытых` : "открытых разрывов нет",
          },
          {
            icon: "⬆️",
            label: "Buy-side",
            value: bsl ? `ликвидность ${px(bsl.price)}` : "равных максимумов нет",
          },
          {
            icon: "⬇️",
            label: "Sell-side",
            value: ssl ? `ликвидность ${px(ssl.price)}` : "равных минимумов нет",
          },
          {
            icon: "⚡",
            label: "BOS / CHoCH",
            value: lastEv ? `${lastEv.kind} ${px(lastEv.price)}` : "чёткого смещения нет",
          },
        ],
        footer:
          lead.bias === "bearish"
            ? `Приоритет продаж от supply до ${px(snap.dealingRange.eq)}`
            : lead.bias === "bullish"
              ? `Приоритет покупок от demand до ${px(snap.dealingRange.eq)}`
              : "Пока нет смещения — не середина",
      },
      {
        kicker: "2",
        title: "ВОЛНЫ ЭЛЛИОТТА",
        tone: "violet",
        rows: [
          {
            icon: "①",
            label: "Счёт",
            value: snap.waves.length ? snap.waves.map((w) => w.label).join(" → ") : "импульс не размечен",
          },
          { icon: "④", label: "Сейчас", value: snap.wyckoff.name },
          { icon: "⑤", label: "Цель 5", value: px(wave5) },
          { icon: "✖", label: "Инвалидация", value: `закрытие за ${px(invalid)}` },
        ],
        footer: snap.wyckoff.therefore,
      },
      {
        kicker: "3",
        title: "ГРАФИКА + ГАРМОНИКА",
        tone: "amber",
        rows: [
          {
            icon: "📉",
            label: snap.trend === "down" ? "Нисходящий канал" : snap.trend === "up" ? "Восходящий канал" : "Диапазон",
            value: `края ${px(snap.dealingRange.low)}–${px(snap.dealingRange.high)}`,
          },
          ...(pat.length
            ? pat.slice(0, 2).map((item) => ({
                icon: item.family === "harmonic" ? "🦋" : "📐",
                label: item.name,
                value: item.because,
              }))
            : [
                {
                  icon: "📐",
                  label: "Графическая фигура",
                  value: "идеального Gartley/Bat нет — смотрим канал и края",
                },
              ]),
        ],
        footer: pat.find((p) => p.family === "harmonic")?.therefore ?? "Идеального Gartley/Bat может не быть — это тоже вывод.",
      },
      {
        kicker: "4",
        title: "СЕТАПЫ + УРОВНИ",
        tone: "emerald",
        rows: [
          { icon: "🐻", label: short.priority ? "SHORT приоритет" : "SHORT", value: `вход ${short.entry}` },
          { icon: "🛡", label: "SL / TP", value: `${short.sl} → ${short.tp1} / ${short.tp2}` },
          { icon: "🐂", label: long.priority ? "LONG приоритет" : "LONG контртренд", value: `вход ${long.entry}` },
          { icon: "📌", label: "EQ / края", value: `${px(snap.dealingRange.low)} · ${px(snap.dealingRange.eq)} · ${px(snap.dealingRange.high)}` },
          {
            icon: "📏",
            label: "Fib 0.62 / 0.79",
            value: `${px(snap.dealingRange.high - (snap.dealingRange.high - snap.dealingRange.low) * 0.618)} · ${px(snap.dealingRange.high - (snap.dealingRange.high - snap.dealingRange.low) * 0.786)}`,
          },
        ],
        footer: lead.advice.therefore,
      },
    ],
    setups: [short, long],
    levels: [
      { name: "Resistance", price: px(snap.dealingRange.high), hint: "край / supply", tone: "bear" },
      { name: "Supply", price: supply ? `${px(supply.bottom)}–${px(supply.top)}` : px(snap.margin.upper.bottom), hint: "зона продаж", tone: "bear" },
      { name: "Current", price: px(lead.lastClose), hint: "сейчас", tone: "neutral" },
      { name: "Demand", price: demand ? `${px(demand.bottom)}–${px(demand.top)}` : px(snap.margin.lower.top), hint: "зона покупок", tone: "bull" },
      { name: "Major", price: px(wave5), hint: "цель волны / край", tone: "bull" },
    ],
    patternPills: (pat.length ? pat : []).slice(0, 4).map((p) => ({ title: p.name, text: p.therefore })),
    risk: "Риск 0.5–1% на сделку. Объём подтверждает пробой. Это карта снимка, не рекомендация.",
  };
}

export function buildDigest(input: {
  markets: DigestMarket[];
  leadSnap: SmcSnapshot;
  leadCandles: Candle[];
  sentiment: SentimentSnap;
  fund: FundamentalSnap;
  date?: string;
  tgOptions?: { text: string; at: string }[];
}): DailyDigest {
  const date = input.date ?? todayKey();
  const lead = pickLead(input.markets);
  const others = input.markets.filter((m) => m.spec.id !== lead.spec.id);
  return {
    date,
    dateLabel: dateLabel(date),
    lead,
    markets: input.markets,
    sentiment: input.sentiment,
    fund: input.fund,
    poster: buildPoster(lead, input.leadSnap, date),
    tgOptions: input.tgOptions ?? [],
    chart: {
      candles: input.leadCandles.slice(-120),
      notes: notesFromSnap(input.leadSnap, lead.spec.decimals),
      levels: levelsFromSnap(input.leadSnap, lead.spec.decimals),
      zones: [...input.leadSnap.fvgs.slice(-4), ...input.leadSnap.orderBlocks.slice(-3)],
      decimals: lead.spec.decimals,
      margin: {
        upper: {
          top: input.leadSnap.margin.upper.top,
          bottom: input.leadSnap.margin.upper.bottom,
          active: input.leadSnap.margin.upper.active,
        },
        lower: {
          top: input.leadSnap.margin.lower.top,
          bottom: input.leadSnap.margin.lower.bottom,
          active: input.leadSnap.margin.lower.active,
        },
      },
    },
    article: writeArticle(lead, others, date, input.sentiment, input.fund, input.leadSnap),
  };
}
