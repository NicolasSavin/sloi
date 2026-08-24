import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSymbol } from "./symbols";
import type { DailyDigest } from "@/lib/digest";
import type { NewsItem } from "@/lib/news";
import type { HomePayload } from "@/lib/home";
import type { Candle, MarketPayload, Timeframe } from "./types";

const Input = z.object({
  symbol: z.string(),
  timeframe: z.enum(["5m", "15m", "1h", "4h", "1d"]),
});

const BINANCE_TF: Record<Timeframe, string> = {
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
};

const YAHOO: Record<Timeframe, { interval: string; range: string }> = {
  "5m": { interval: "5m", range: "5d" },
  "15m": { interval: "15m", range: "15d" },
  "1h": { interval: "60m", range: "3mo" },
  "4h": { interval: "60m", range: "6mo" },
  "1d": { interval: "1d", range: "1y" },
};

async function getJson(url: string, timeoutMs = 7000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function getText(url: string, timeoutMs = 5000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function validCandles(rows: Candle[]) {
  const clean = rows.filter(
    (c) => Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close) && c.time > 0,
  );
  return clean.length >= 40 ? clean.slice(-360) : null;
}

function parseBinance(raw: unknown) {
  if (!Array.isArray(raw)) return null;
  return validCandles(
    raw.map((k) => {
      const row = k as number[];
      return {
        time: Math.floor(Number(row[0]) / 1000),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
        buyVolume: Number(row[9]) || undefined,
      };
    }),
  );
}

function parseYahoo(raw: any, timeframe: Timeframe) {
  const result = raw?.chart?.result?.[0];
  if (!result?.timestamp || !result.indicators?.quote?.[0]) return null;
  const q = result.indicators.quote[0];
  const rows: Candle[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const open = q.open?.[i];
    const high = q.high?.[i];
    const low = q.low?.[i];
    const close = q.close?.[i];
    if (![open, high, low, close].every((n) => Number.isFinite(n))) continue;
    rows.push({
      time: result.timestamp[i],
      open,
      high,
      low,
      close,
      volume: q.volume?.[i] || 0,
    });
  }
  if (timeframe === "4h") {
    const bucket = new Map<number, Candle[]>();
    for (const c of rows) {
      const key = Math.floor(c.time / 14400) * 14400;
      const arr = bucket.get(key) ?? [];
      arr.push(c);
      bucket.set(key, arr);
    }
    const merged: Candle[] = [];
    for (const [time, arr] of [...bucket.entries()].sort((a, b) => a[0] - b[0])) {
      merged.push({
        time,
        open: arr[0]!.open,
        high: Math.max(...arr.map((x) => x.high)),
        low: Math.min(...arr.map((x) => x.low)),
        close: arr[arr.length - 1]!.close,
        volume: arr.reduce((s, x) => s + x.volume, 0),
        buyVolume: arr.every((x) => x.buyVolume != null)
          ? arr.reduce((s, x) => s + (x.buyVolume ?? 0), 0)
          : undefined,
      });
    }
    return validCandles(merged);
  }
  return validCandles(rows);
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 1831565813) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function demoCandles(id: string, timeframe: Timeframe): Candle[] {
  const seeds: Record<string, number> = {
    XAUUSD: 3420,
    EURUSD: 1.0842,
    GBPUSD: 1.271,
    USDJPY: 154.8,
    SPY: 642,
    QQQ: 568,
  };
  const step: Record<Timeframe, number> = { "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 };
  const rnd = mulberry32(hash(id + timeframe + "stratum"));
  const n = 240;
  const dt = step[timeframe];
  const start = Math.floor(Date.now() / 1000) - n * dt;
  let price = seeds[id] ?? 100;
  const volBase = id === "EURUSD" ? 8000 : 4200;
  const rows: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const t = start + i * dt;
    const hour = new Date(t * 1000).getUTCHours();
    const session = (hour >= 7 && hour < 10) || (hour >= 12 && hour < 16) ? 1.35 : 0.85;
    const drift = Math.sin(i / 28) * 0.0012 + (rnd() - 0.48) * 0.004;
    const impulse = i % 37 === 0 ? (rnd() > 0.5 ? 1 : -1) * 0.012 : 0;
    const sweep = i % 51 === 0 ? (rnd() > 0.5 ? 1 : -1) * 0.008 : 0;
    const open = price;
    const close = Math.max(1e-4, open * (1 + drift + impulse));
    const wick = Math.abs(close - open) * (0.4 + rnd() * 1.8) + open * 8e-4;
    const high = Math.max(open, close) + wick * (sweep > 0 ? 2.4 : 1);
    const low = Math.min(open, close) - wick * (sweep < 0 ? 2.4 : 1);
    const volume = volBase * session * (0.5 + rnd()) * (impulse ? 3.2 : 1);
    rows.push({ time: t, open, high, low, close, volume });
    price = close;
  }
  return rows;
}

async function loadCandles(spec: ReturnType<typeof getSymbol>, timeframe: Timeframe) {
  if (spec.binance) {
    const parsed = parseBinance(
      await getJson(`https://data-api.binance.vision/api/v3/klines?symbol=${spec.binance}&interval=${BINANCE_TF[timeframe]}&limit=360`, 4000),
    );
    if (parsed) return { candles: parsed, source: "binance" as const };
  }
  if (spec.bybit) {
    const map: Record<Timeframe, string> = { "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "D" };
    const raw = await getJson(
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=${spec.bybit}&interval=${map[timeframe]}&limit=360`,
      4000,
    );
    const parsed = parseBybit(raw);
    if (parsed) return { candles: parsed, source: "bybit" as const };
  }
  if (spec.yahoo) {
    const y = YAHOO[timeframe];
    const parsed = parseYahoo(
      await getJson(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(spec.yahoo)}?interval=${y.interval}&range=${y.range}&includePrePost=false`,
        4000,
      ),
      timeframe,
    );
    if (parsed) return { candles: parsed, source: "yahoo" as const };
  }
  return { candles: demoCandles(spec.id, timeframe), source: "demo" as const };
}

function parseBybit(raw: any) {
  const list = raw?.result?.list;
  if (!Array.isArray(list) || list.length < 40) return null;
  const rows: Candle[] = [...list].reverse().map((row: string[]) => ({
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  }));
  return validCandles(rows);
}

async function loadTrades(binance?: string) {
  if (!binance) return undefined;
  const raw = await getJson(`https://data-api.binance.vision/api/v3/aggTrades?symbol=${binance}&limit=1000`, 3500);
  if (!Array.isArray(raw) || raw.length < 40) return undefined;
  return raw.map((t: { p: string; q: string; m: boolean }) => ({
    price: Number(t.p),
    qty: Number(t.q),
    buy: t.m === false,
  }));
}

let payloadCache = new Map<string, { at: number; data: MarketPayload }>();
let optCache = new Map<string, { at: number; data: MarketPayload["options"] }>();

async function loadOptions(ticker: string) {
  const hit = optCache.get(ticker);
  if (hit && Date.now() - hit.at < 300_000) return hit.data;
  const raw = await getJson(`https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}`, 4500);
  const { parseYahooOptions } = await import("@/lib/options");
  const data = parseYahooOptions(raw, ticker);
  optCache.set(ticker, { at: Date.now(), data });
  return data;
}

async function loadPayload(symbol: string, timeframe: Timeframe, withOpt = true): Promise<MarketPayload> {
  const key = `${symbol}|${timeframe}|${withOpt ? "o" : "c"}`;
  const hit = payloadCache.get(key);
  if (hit && Date.now() - hit.at < 40_000) return hit.data;
  const spec = getSymbol(symbol);
  const ohlc = await loadCandles(spec, timeframe);
  const options = withOpt && spec.optionsYahoo ? await loadOptions(spec.optionsYahoo) : null;
  const trades = spec.binance && ohlc.source !== "demo" ? await loadTrades(spec.binance) : undefined;
  const last = ohlc.candles.at(-1);
  const data: MarketPayload = {
    symbol: spec.id,
    timeframe,
    source: ohlc.source,
    candles: ohlc.candles,
    options,
    trades,
    staleSec: last ? Math.max(0, Math.floor(Date.now() / 1000 - last.time)) : undefined,
  };
  payloadCache.set(key, { at: Date.now(), data });
  return data;
}

export const fetchMarket = createServerFn({ method: "POST" })
  .validator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    return loadPayload(data.symbol, data.timeframe);
  });

async function lastMove(yahoo: string) {
  const closes =
    (await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?interval=1d&range=5d&includePrePost=false`, 3000))
      ?.chart?.result?.[0]
      ?.indicators?.quote?.[0]
      ?.close?.filter((n: number) => Number.isFinite(n)) ?? [];
  if (closes.length < 2) return null;
  const a = closes[closes.length - 1] as number;
  const b = closes[closes.length - 2] as number;
  if (!b) return { price: a, changePct: 0 };
  return { price: a, changePct: ((a - b) / b) * 100 };
}

function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  return (async () => {
    const out: R[] = [];
    for (let i = 0; i < items.length; i += size) {
      const part = await Promise.all(items.slice(i, i + size).map(fn));
      out.push(...part);
    }
    return out;
  })();
}

function wantOptions(id: string) {
  return ["XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY", "XTIUSD", "SPY", "QQQ"].includes(id);
}

const CAL_JSON = [
  "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
  "https://cdn-nfs.faireconomy.media/ff_calendar_thisweek.json",
];
const CAL_URLS = [
  "https://nfs.faireconomy.media/ff_calendar_thisweek.xml",
  "https://cdn-nfs.faireconomy.media/ff_calendar_thisweek.xml",
];

let calCache: { at: number; xml: string | null; json: unknown | null } | null = null;
async function loadCalendarXml() {
  if (calCache && Date.now() - calCache.at < 180_000) return calCache.xml;
  const jsons = await Promise.all(CAL_JSON.map((u) => getJson(`${u}?t=${Date.now()}`, 4000)));
  const json = jsons.find((x) => Array.isArray(x) && x.length > 0) ?? null;
  let xml: string | null = null;
  if (!json) {
    const xmls = await Promise.all(CAL_URLS.map((u) => getText(`${u}?t=${Date.now()}`, 4000)));
    xml = xmls.find((x) => x && x.includes("<event")) ?? null;
  }
  calCache = { at: Date.now(), xml, json };
  return xml;
}

async function loadCalendarEvents() {
  const { parseFfCalendar, parseFfJson, fallbackCalendar } = await import("@/lib/calendar");
  if (calCache && Date.now() - calCache.at < 180_000) {
    if (Array.isArray(calCache.json) && calCache.json.length) return parseFfJson(calCache.json);
    if (calCache.xml) {
      const p = parseFfCalendar(calCache.xml);
      if (p.length) return p;
    }
  }
  await loadCalendarXml();
  if (calCache?.json && Array.isArray(calCache.json) && calCache.json.length) return parseFfJson(calCache.json);
  if (calCache?.xml) {
    const p = parseFfCalendar(calCache.xml);
    if (p.length) return p;
  }
  return fallbackCalendar();
}

let digestCache: { at: number; data: { digest: DailyDigest; source: string } } | null = null;

export const fetchDigest = createServerFn({ method: "GET" }).handler(async () => {
  try {
    return await assembleDigest();
  } catch {
    if (digestCache) return digestCache.data;
    throw new Error("digest");
  }
});

/** Public alias for API routes (archive). */
export async function assembleDigestPublic() {
  return assembleDigest();
}

async function assembleDigest(): Promise<{ digest: DailyDigest; source: string }> {
  if (digestCache && Date.now() - digestCache.at < 45_000) return digestCache.data;
  const { analyzeMarket } = await import("@/lib/smc/engine");
  const { buildDigest, toDigestMarket, pickLead, todayKey } = await import("@/lib/digest");
  const { buildSentiment } = await import("@/lib/sentiment");
  const { buildFundamentals, windFor, gateAdvice } = await import("@/lib/fundamentals");
  const { buildHalt, EMPTY_HALT } = await import("@/lib/calendar");
  const { parseRss } = await import("@/lib/news");
  const { SYMBOLS, DIGEST_IDS } = await import("./symbols");
  const timeframe: Timeframe = "1h";
  const digestSpecs = SYMBOLS.filter((s) => DIGEST_IDS.includes(s.id));
  const [payloads, vix, dxy, tnx, fedXml, calEvents, cl, es, nq, zn, tgHtml, cot, h4s] = await Promise.all([
    mapPool(digestSpecs, 5, (s) => loadPayload(s.id, timeframe, wantOptions(s.id))),
    lastMove("^VIX"),
    lastMove("DX-Y.NYB"),
    lastMove("^TNX"),
    getText(
      "https://news.google.com/rss/search?q=%D0%A4%D0%A0%D0%A1+%D1%81%D1%82%D0%B0%D0%B2%D0%BA%D0%B0+%D0%B8%D0%BD%D1%84%D0%BB%D1%8F%D1%86%D0%B8%D1%8F&hl=ru&gl=RU&ceid=RU:ru",
      3500,
    ),
    loadCalendarEvents(),
    lastMove("CL=F"),
    lastMove("ES=F"),
    lastMove("NQ=F"),
    lastMove("ZN=F"),
    getText("https://t.me/s/Options_FX", 3500),
    import("@/lib/cot").then((m) => m.loadCot()),
    mapPool(digestSpecs, 5, (s) => loadPayload(s.id, "4h", false)),
  ]);
  const headlines = fedXml ? parseRss(fedXml).map((n) => n.title) : [];
  const halt = calEvents.length ? buildHalt(calEvents) : EMPTY_HALT;
  const rows = payloads.map((p) => {
    const spec = SYMBOLS.find((s) => s.id === p.symbol)!;
    const snap = analyzeMarket(p.candles, p.options, p.trades);
    return { spec, snap, candles: p.candles, market: toDigestMarket(spec, snap, spec.spread, p.candles.at(-1), p.options) };
  });
  const { sessionNow } = await import("@/lib/sessions");
  const session = sessionNow();
  const h4bias = new Map(
    h4s.map((p) => {
      const snap = analyzeMarket(p.candles, null);
      return [p.symbol, snap.bias] as const;
    }),
  );
  const dxySnap = dxy ?? (await lastMove("DX=F"));
  const sentiment = buildSentiment({
    vix,
    dxy: dxySnap,
    bias: pickLead(rows.map((r) => r.market)).bias,
    premiumDiscount: pickLead(rows.map((r) => r.market)).premiumDiscount,
  });
  const spyOpt = payloads.find((p) => p.symbol === "SPY")?.options ?? null;
  const fund = buildFundamentals({
    tnx,
    dxy: dxySnap,
    vix,
    headlines,
    halt,
    oil: cl,
    es,
    nq,
    zn,
    spyOpt,
    cot,
  });
  const markets = rows.map((r) => {
    const wind = windFor(r.spec.id, fund);
    const ctx = {
      id: r.spec.id,
      session,
      h1: undefined,
      entry: r.market.setup.entry ?? undefined,
      construction: r.market.construction,
      htfBias: h4bias.get(r.spec.id),
    };
    const advice = gateAdvice(r.market.advice, wind, fund.halt, ctx);
    return { ...r.market, wind, advice, htfBias: ctx.htfBias };
  });
  const leadMarket = pickLead(markets);
  const leadRow = rows.find((r) => r.spec.id === leadMarket.spec.id) ?? rows[0]!;
  const { parseTgChannel } = await import("@/lib/tg-options");
  const tgOptions = tgHtml ? parseTgChannel(tgHtml) : [];
  const packed = {
    digest: buildDigest({
      markets,
      leadSnap: leadRow.snap,
      leadCandles: leadRow.candles,
      sentiment,
      fund,
      date: todayKey(),
      tgOptions,
    }),
    source: payloads[0]?.source ?? "demo",
  };
  try {
    const { syncArchiveFromDigest } = await import("@/lib/archive-store");
    syncArchiveFromDigest(packed.digest.markets, packed.digest.fund?.halt);
  } catch {
    /* archive optional */
  }
  digestCache = { at: Date.now(), data: packed };
  return packed;
}

export async function renderSignalFeed() {
  const { digest } = await assembleDigest();
  const { brokerSkewPct } = await import("@/lib/broker-tape");
  const { skewLimit, fillMode } = await import("@/lib/execution");
  const lines = [`# SLOI v2 H1`, `# ${new Date().toISOString()}`, `# last=Yahoo  SKEW=макс%  MODE=LIMIT|MARKET  TF=60`];
  for (const m of digest.markets) {
    let side = m.advice.action === "long" ? "BUY" : m.advice.action === "short" ? "SELL" : "WAIT";
    const last = m.lastClose;
    const cap = skewLimit(m.spec.id);
    const skew = brokerSkewPct(m.spec.id, last);
    if (skew != null && skew > cap && side !== "WAIT") side = "WAIT";
    const e = m.setup.entry ?? 0;
    const s = m.setup.stop ?? 0;
    const t = m.setup.targets[0] ?? 0;
    const mode =
      side === "WAIT" ? "WAIT" : fillMode(side === "BUY" ? "long" : "short", last, e, s, t);
    if (mode === "LATE") side = "WAIT";
    lines.push(`${m.spec.id} ${side} ${e} ${s} ${t} ${last} SKEW ${cap} MODE ${mode === "LATE" ? "WAIT" : mode}`);
  }
  return `${lines.join("\n")}\n`;
}

export const fetchHome = createServerFn({ method: "GET" }).handler(async () => {
  return loadHome();
});

export const fetchCalendar = createServerFn({ method: "GET" }).handler(async () => {
  const { buildHalt, EMPTY_HALT } = await import("@/lib/calendar");
  const { sessionNow } = await import("@/lib/sessions");
  const events = await loadCalendarEvents();
  const halt = events.some((e) => e.impact === "High") ? buildHalt(events) : { ...EMPTY_HALT, line: events.length ? `Календарь: ${events.length} событий. Крупных рядом нет.` : EMPTY_HALT.line };
  const now = Date.now();
  const upcoming = events.filter((e) => e.at > now - 60 * 60_000).slice(0, 28);
  return { events: upcoming, halt, session: sessionNow() };
});

export const fetchBroker = createServerFn({ method: "GET" }).handler(async () => {
  const { snapshotBroker } = await import("@/lib/broker-tape");
  return snapshotBroker();
});

let tvGuideCache: { at: number; data: Awaited<ReturnType<typeof import("@/lib/tv-live").resolveTvChannels>> } | null =
  null;

export const fetchTvGuide = createServerFn({ method: "GET" }).handler(async () => {
  if (tvGuideCache && Date.now() - tvGuideCache.at < 120_000) return tvGuideCache.data;
  const { resolveTvChannels } = await import("@/lib/tv-live");
  const data = await resolveTvChannels();
  tvGuideCache = { at: Date.now(), data };
  return data;
});

export const fetchArticle = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ slug: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const home = await loadHome();
    const article = home.news.find((n) => n.slug === data.slug) ?? null;
    return { article, quotes: home.quotes };
  });

let homeCache: { at: number; data: HomePayload } | null = null;
const HOME_TTL = 45_000;

async function loadHome() {
  if (homeCache && Date.now() - homeCache.at < HOME_TTL) return homeCache.data;
  const data = await buildHome();
  homeCache = { at: Date.now(), data };
  return data;
}

async function buildHome(): Promise<HomePayload> {
  const { SYMBOLS } = await import("./symbols");
  const { marketArt } = await import("@/lib/art");
  const { parseRss, dedupeNews, newsImage, newsTag, slugOf } = await import("@/lib/news");
  const { buildArticle } = await import("@/lib/news-article");
  const timeframe: Timeframe = "1h";
  const queries = [
    "https://news.google.com/rss/search?q=%D0%B7%D0%BE%D0%BB%D0%BE%D1%82%D0%BE+%D1%86%D0%B5%D0%BD%D0%B0&hl=ru&gl=RU&ceid=RU:ru",
    "https://news.google.com/rss/search?q=%D0%B5%D0%B2%D1%80%D0%BE+%D0%B4%D0%BE%D0%BB%D0%BB%D0%B0%D1%80+%D0%BA%D1%83%D1%80%D1%81&hl=ru&gl=RU&ceid=RU:ru",
    "https://news.google.com/rss/search?q=%D0%A4%D0%A0%D0%A1+%D1%81%D1%82%D0%B0%D0%B2%D0%BA%D0%B0+%D0%B8%D0%BD%D1%84%D0%BB%D1%8F%D1%86%D0%B8%D1%8F&hl=ru&gl=RU&ceid=RU:ru",
    "https://news.google.com/rss/search?q=%D0%BD%D0%B5%D1%84%D1%82%D1%8C+WTI+%D0%B1%D1%80%D0%B5%D0%BD%D1%82&hl=ru&gl=RU&ceid=RU:ru",
    "https://news.google.com/rss/search?q=ECB+ECB+%D0%95%D0%A6%D0%91+%D1%81%D1%82%D0%B0%D0%B2%D0%BA%D0%B0&hl=ru&gl=RU&ceid=RU:ru",
    "https://feeds.bbci.co.uk/russian/business/rss.xml",
    "https://feeds.bbci.co.uk/news/business/rss.xml",
  ];
  const [payloads, ...feeds] = await Promise.all([
    mapPool(SYMBOLS, 5, (s) => loadPayload(s.id, timeframe, false)),
    ...queries.map((u) => getText(u, 3500)),
  ]);
  const quotes = payloads.map((p) => {
    const spec = SYMBOLS.find((s) => s.id === p.symbol)!;
    const last = p.candles.at(-1);
    const prev = p.candles.at(-2) ?? last;
    const spark = p.candles.slice(-48).map((c) => c.close);
    const price = last?.close ?? 0;
    const changePct = last && prev && prev.close ? ((last.close - prev.close) / prev.close) * 100 : 0;
    return {
      id: spec.id,
      label: spec.label,
      price,
      changePct,
      spark,
      decimals: spec.decimals,
      art: marketArt(spec.id),
    };
  });
  const parsedFeeds = feeds.map((xml) => (xml ? parseRss(xml) : []));
  const mixed: NewsItem[] = [];
  for (let i = 0; i < 6; i++) {
    for (const list of parsedFeeds) {
      if (list[i]) mixed.push(list[i]!);
    }
  }
  let raw = dedupeNews(mixed, 16);
  if (raw.length < 3) {
    raw = quotes.map((q) => {
      const title = `${q.label}: ${q.changePct >= 0 ? "плюс" : "минус"} ${Math.abs(q.changePct).toFixed(2)}% за час`;
      return {
        id: q.id,
        slug: slugOf(title),
        title,
        source: "SLOI",
        published: new Date().toUTCString(),
        originHref: "",
        originTitle: title,
        snippet: "",
        image: newsImage(q.label),
        tag: newsTag(q.label),
        foreign: false,
      };
    });
  }
  const news = raw.map((item) => buildArticle(item, quotes)).filter((a) => a.title.length > 2);
  return { quotes, news, source: payloads[0]?.source ?? "demo" };
}
