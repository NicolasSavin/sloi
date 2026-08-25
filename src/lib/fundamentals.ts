import { refineAdvice } from "@/lib/execution";
import type { SessionSnap } from "@/lib/sessions";
import type { Candle } from "@/lib/market/types";
import type { CotSnap } from "@/lib/cot";
import { EMPTY_COT, cotFor } from "@/lib/cot";
import type { Advice } from "@/lib/advisor";
import type { NewsHalt } from "@/lib/calendar";
import { EMPTY_HALT } from "@/lib/calendar";
import type { OptionConstruction, OptionsSnapshot } from "@/lib/market/types";

type Move = { price: number; changePct: number } | null;

export type FundWindKind = "tail" | "head" | "cross";

export interface FundWind {
  kind: FundWindKind;
  wanted: "up" | "down" | "flat";
  note: string;
}

export interface FundPlain {
  now: string;
  why: string;
  so: string;
  simple: string;
}

export interface FundamentalSnap {
  yield10: number | null;
  yieldChange: number | null;
  rates: "hawkish" | "dovish" | "quiet";
  dollar: "bid" | "offered" | "flat";
  risk: "risk-on" | "risk-off" | "mixed";
  driver: string;
  line: string;
  plain: FundPlain;
  themes: string[];
  halt: NewsHalt;
  oil: number | null;
  oilChange: number | null;
  esChange: number | null;
  spyPc: number | null;
  cot: CotSnap;
}

const THEME_RULES: [RegExp, string][] = [
  [/фрс|fomc|пауэл|powell|ставк/i, "ФРС"],
  [/cpi|инфляц|pce/i, "инфляция"],
  [/nfp|занятост|payroll|безработиц/i, "занятость"],
  [/ецб|ecb|лагард|lagarde/i, "ЕЦБ"],
  [/boj|банк японии|иен/i, "Банк Японии"],
  [/доходност|treasury|yield|облигац/i, "доходности"],
  [/геополит|войн|санкц/i, "геополитика"],
];

export function themesFromHeadlines(titles: string[]): string[] {
  const found: string[] = [];
  for (const [re, name] of THEME_RULES) {
    if (titles.some((t) => re.test(t)) && !found.includes(name)) found.push(name);
  }
  return found.slice(0, 4);
}

export function buildFundamentals(input: {
  tnx: Move;
  dxy: Move;
  vix: Move;
  headlines?: string[];
  halt?: NewsHalt;
  oil?: Move;
  es?: Move;
  nq?: Move;
  zn?: Move;
  spyOpt?: OptionsSnapshot | null;
  cot?: CotSnap;
}): FundamentalSnap {
  const yield10 = input.tnx?.price ?? null;
  const yieldChange = input.tnx?.changePct ?? null;
  let rates: FundamentalSnap["rates"] = "quiet";
  if (yieldChange != null) {
    if (yieldChange > 1.2) rates = "hawkish";
    else if (yieldChange < -1.2) rates = "dovish";
  }
  const dxyCh = input.dxy?.changePct ?? null;
  let dollar: FundamentalSnap["dollar"] = "flat";
  if (dxyCh != null) {
    if (dxyCh > 0.15) dollar = "bid";
    else if (dxyCh < -0.15) dollar = "offered";
  }
  const vix = input.vix?.price ?? null;
  const vixCh = input.vix?.changePct ?? null;
  let risk: FundamentalSnap["risk"] = "mixed";
  if (vix != null) {
    if (vix >= 22 || (vixCh != null && vixCh > 6)) risk = "risk-off";
    else if (vix <= 14 && (vixCh == null || vixCh < 3)) risk = "risk-on";
  }
  const themes = themesFromHeadlines(input.headlines ?? []);
  const ratesBit =
    rates === "hawkish"
      ? "доходности растут — тон жёсткий, деньги дорожают"
      : rates === "dovish"
        ? "доходности падают — тон мягче, риск и металл получают воздух"
        : "ставки без явного импульса";
  const dollarBit =
    dollar === "bid"
      ? "доллар в спросе — давление на золото, евро и фунт"
      : dollar === "offered"
        ? "доллар отдают — попутный фон золоту и евро"
        : "доллар без импульса";
  const riskBit =
    risk === "risk-off"
      ? "риск выключают"
      : risk === "risk-on"
        ? "аппетит к риску жив"
        : "риск смешанный";
  const yBit = yield10 != null ? `10Y ${yield10.toFixed(2)}%` : "10Y нет";
  const oil = input.oil?.price ?? null;
  const oilChange = input.oil?.changePct ?? null;
  const esChange = input.es?.changePct ?? null;
  const spyPc = input.spyOpt?.putCall ?? null;
  const oilBit =
    oilChange != null
      ? oilChange > 1.2
        ? "нефть растёт — попутный фон CAD и риску"
        : oilChange < -1.2
          ? "нефть падает — давление на товарные валюты"
          : "нефть без импульса"
      : "";
  const futBit =
    esChange != null
      ? esChange > 0.6
        ? "фьючерс S&P в плюсе"
        : esChange < -0.6
          ? "фьючерс S&P в минусе — риск выключают"
          : ""
      : "";
  const optBit =
    spyPc != null
      ? spyPc > 1.15
        ? `опционы SPY: P/C ${spyPc.toFixed(2)} — рынок страхуется`
        : spyPc < 0.7
          ? `опционы SPY: P/C ${spyPc.toFixed(2)} — гонка за коллами`
          : `опционы SPY: P/C ${spyPc.toFixed(2)}`
      : input.spyOpt?.note ?? "";
  const extra = [oilBit, futBit, optBit, input.cot?.line ?? ""].filter(Boolean).join(". ");
  const halt = input.halt ?? EMPTY_HALT;
  const driver = halt.active
    ? halt.line
    : rates !== "quiet"
      ? `драйвер — ${yBit}, ${ratesBit}`
      : dollar !== "flat"
        ? `драйвер — доллар, ${dollarBit}`
        : themes[0]
          ? `в ленте сегодня: ${themes.join(", ")}`
          : "явного макро-драйвера нет";
  const themeBit = themes.length ? ` Темы ленты: ${themes.join(", ")}.` : "";
  const haltBit = halt.active ? ` ${halt.line}` : halt.next ? ` ${halt.line}` : "";
  const now =
    halt.active
      ? halt.line
      : dollar === "bid" && rates === "hawkish"
        ? "Доллар дорожает, и деньги в США становятся выгоднее."
        : dollar === "offered" && rates === "dovish"
          ? "Доллар слабеет, деньги дешевеют."
          : dollar === "bid"
            ? "Сегодня доллар покупают."
            : dollar === "offered"
              ? "Сегодня доллар продают."
              : risk === "risk-off"
                ? "Рынок боится: рисковые активы продают, в доллар и кэш."
                : risk === "risk-on"
                  ? "Страха мало: рынок спокойно сидит в риске."
                  : "Явного макро-удара сейчас нет.";
  const why =
    halt.active
      ? "В минуты публикации цифры все сразу двигают стопы. Спред взрывается, уровни врут."
      : rates === "hawkish"
        ? `Американские облигации (доходность ${yield10?.toFixed(2) ?? "—"}%) растут. Когда они платят больше, доллар нужен, золото и евро мешают.`
        : rates === "dovish"
          ? `Доходность облигаций падает (${yield10?.toFixed(2) ?? "—"}%). Доллар держать менее выгодно — золото и евро получают воздух.`
          : dollar === "bid"
            ? "Индекс доллара растёт. Это просто спрос на доллар против корзины валют."
            : dollar === "offered"
              ? "Индекс доллара падает. Валюты против доллара и металл обычно легче идут вверх."
              : risk === "risk-off"
                ? "Индекс страха (VIX) высокий. Фонды режут риск, покупают доллар и иногда золото."
                : "Ставки, доллар и страх не спорят друг с другом — фона почти нет.";
  const soParts = [
    dollar === "bid" ? "Для золота, евро, фунта, аусси — встречный ветер." : "",
    dollar === "offered" ? "Для золота, евро, фунта, аусси — попутный ветер." : "",
    rates === "hawkish" ? "Дорогие деньги бьют по металлу и риску." : "",
    rates === "dovish" ? "Дешёвые деньги помогают металлу и акциям." : "",
    oilChange != null && oilChange > 1.2 ? "Нефть растёт — канадский доллар обычно крепче (USD/CAD легче вниз)." : "",
    oilChange != null && oilChange < -1.2 ? "Нефть падает — товарные валюты слабее." : "",
    esChange != null && esChange < -0.6 ? "Фьючерс на американские акции в минусе — риск выключают." : "",
    spyPc != null && spyPc > 1.15 ? "В опционах больше путов: рынок страхуется от падения." : "",
  ].filter(Boolean);
  const so = soParts.join(" ") || "Фон нейтральный: смотрим структуру пары, не макро.";
  const simple =
    halt.active
      ? "Сейчас не торгуем: выходит важная цифра. Как пробка на дороге — лучше подождать."
      : dollar === "bid"
        ? "Доллар сегодня сильный. Что против доллара (евро, золото) — тяжелее растёт."
        : dollar === "offered"
          ? "Доллар сегодня слабый. Что против доллара — легче растёт."
          : risk === "risk-off"
            ? "Все нервничают и продают риск. Сначала не ловить падающий нож."
            : "Большой картины нет. Смотри, что делает цена у края диапазона.";
  return {
    yield10,
    yieldChange,
    rates,
    dollar,
    risk,
    driver,
    themes,
    halt,
    oil,
    oilChange,
    esChange,
    spyPc,
    cot: input.cot ?? EMPTY_COT,
    line: `Фундамент: ${yBit}, ${ratesBit}. ${dollarBit}. ${riskBit}.${themeBit}${extra ? ` ${extra}.` : ""}${haltBit}`,
    plain: { now, why, so, simple },
  };
}

function wantedFor(id: string, fund: FundamentalSnap): "up" | "down" | "flat" {
  let s = 0;
  const cot = cotFor(id, fund.cot);
  if (cot) {
    const specNet = cot.invert ? -cot.net : cot.net;
    if (specNet > 20000) s += 1;
    else if (specNet < -20000) s -= 1;
  }
  if (id === "XAUUSD" || id === "XAGUSD") {
    if (fund.dollar === "offered") s += 1;
    if (fund.dollar === "bid") s -= 1;
    if (fund.rates === "dovish") s += 1;
    if (fund.rates === "hawkish") s -= 1;
    if (fund.risk === "risk-off" && id === "XAUUSD") s += 1;
  } else if (id === "EURUSD" || id === "GBPUSD" || id === "AUDUSD" || id === "NZDUSD") {
    if (fund.dollar === "offered") s += 1;
    if (fund.dollar === "bid") s -= 1;
    if (fund.rates === "dovish") s += 1;
    if (fund.rates === "hawkish") s -= 1;
    if ((id === "AUDUSD" || id === "NZDUSD") && fund.risk === "risk-on") s += 1;
    if ((id === "AUDUSD" || id === "NZDUSD") && fund.risk === "risk-off") s -= 1;
  } else if (id === "USDJPY") {
    if (fund.rates === "hawkish") s += 1;
    if (fund.rates === "dovish") s -= 1;
    if (fund.dollar === "bid") s += 1;
    if (fund.dollar === "offered") s -= 1;
  } else if (id === "USDCHF") {
    if (fund.risk === "risk-off") s -= 1;
    if (fund.risk === "risk-on") s += 1;
    if (fund.dollar === "bid") s += 1;
    if (fund.dollar === "offered") s -= 1;
  } else if (id === "USDCAD") {
    if ((fund.oilChange ?? 0) > 1) s -= 1;
    if ((fund.oilChange ?? 0) < -1) s += 1;
    if (fund.dollar === "bid") s += 1;
    if (fund.dollar === "offered") s -= 1;
  } else if (id === "USOIL" || id === "XTIUSD" || id === "XBRUSD" || id === "XNGUSD") {
    if (fund.risk === "risk-on") s += 1;
    if (fund.risk === "risk-off") s -= 1;
    if ((fund.esChange ?? 0) > 0.5) s += 1;
    if ((fund.esChange ?? 0) < -0.5) s -= 1;
  } else if (id === "EURJPY" || id === "GBPJPY" || id === "AUDJPY" || id === "CADJPY" || id === "NZDJPY") {
    if (fund.risk === "risk-on") s += 1;
    if (fund.risk === "risk-off") s -= 1;
  } else if (id === "EURGBP") {
    return "flat";
  } else if (id === "EURCHF") {
    if (fund.risk === "risk-off") s -= 1;
    if (fund.risk === "risk-on") s += 1;
  } else if (id === "EURAUD" || id === "GBPAUD") {
    if (fund.risk === "risk-off") s += 1;
    if (fund.risk === "risk-on") s -= 1;
  } else {
    if (fund.risk === "risk-on") s += 1;
    if (fund.risk === "risk-off") s -= 1;
    if (fund.rates === "dovish") s += 1;
    if (fund.rates === "hawkish") s -= 1;
    if ((fund.spyPc ?? 1) > 1.2) s -= 1;
    if ((fund.spyPc ?? 1) < 0.7) s += 1;
  }
  if (s > 0) return "up";
  if (s < 0) return "down";
  return "flat";
}

export function windFor(symbolId: string, fund: FundamentalSnap): FundWind {
  const wanted = wantedFor(symbolId, fund);
  const kind: FundWindKind = wanted === "flat" ? "cross" : wanted === "up" ? "tail" : "head";
  const note =
    wanted === "up"
      ? "Фундамент хочет вверх: не спорить с макро на лонге от зоны."
      : wanted === "down"
        ? "Фундамент давит вниз: лонг только из дисконта, шорт не против ветра."
        : "Фундамент нейтрален — решают структура и спред.";
  return { kind: wanted === "flat" ? "cross" : kind, wanted, note };
}

export function gateAdvice(
  advice: Advice,
  wind: FundWind,
  halt?: NewsHalt,
  ctx?: {
    id: string;
    session?: SessionSnap | null;
    h1?: Candle[];
    entry?: number;
    stop?: number;
    last?: number;
    construction?: OptionConstruction | null;
    htfBias?: "bullish" | "bearish" | "range";
    d1Bias?: "bullish" | "bearish" | "range";
    choch?: boolean;
    target?: number;
    score?: number;
    hasZone?: boolean;
  },
): Advice {
  const base = ctx?.id
    ? refineAdvice(advice, {
        id: ctx.id,
        halt,
        session: ctx.session,
        h1: ctx.h1,
        entry: ctx.entry,
        stop: ctx.stop,
        last: ctx.last,
        htfBias: ctx.htfBias,
        d1Bias: ctx.d1Bias,
        choch: ctx.choch,
        target: ctx.target,
        score: ctx.score,
        hasZone: ctx.hasZone,
      })
    : advice;
  if (halt?.active && !ctx?.id) {
    return {
      ...base,
      action: "wait",
      title: "Стоп: крупная новость",
      therefore: halt.line,
    };
  }
  if (base.action !== "long" && base.action !== "short") {
    return { ...base, therefore: `${base.therefore} ${wind.note}` };
  }
  const wall = ctx?.construction;
  const againstWall =
    wall &&
    wall.type !== "mixed" &&
    ((base.action === "long" && wall.wanted === "down") ||
      (base.action === "short" && wall.wanted === "up"));
  const against =
    (base.action === "long" && wind.wanted === "down") ||
    (base.action === "short" && wind.wanted === "up");
  const withWind =
    (base.action === "long" && wind.wanted === "up") ||
    (base.action === "short" && wind.wanted === "down");
  const wallBit = wall
    ? ` Конструкция ${wall.ticker}: ${wall.type === "call-wall" ? "стена коллов" : wall.type === "put-wall" ? "стена путов" : "смешанный OI"} ${wall.strike ?? ""}.`
    : "";
  const caution = againstWall
    ? ` Опцион против — лимитка есть, размер не раздуваем.`
    : against
      ? ` Макро встречный — лимит в зоне, рынок не догоняем.`
      : withWind
        ? ` Макро попутный.`
        : ` ${wind.note}`;
  return { ...base, therefore: `${base.therefore}${caution}${wallBit}` };
}

export function windLabel(kind: FundWindKind) {
  if (kind === "tail") return "попутный";
  if (kind === "head") return "встречный";
  return "нейтральный";
}
