import type { OptionConstruction, OptionsRow, OptionsSnapshot, SymbolSpec } from "@/lib/market/types";

interface YahooContract {
  strike?: number;
  openInterest?: number;
  volume?: number;
  impliedVolatility?: number;
}

function num(n: unknown) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function maxPain(calls: YahooContract[], puts: YahooContract[]) {
  const strikes = [...new Set([...calls, ...puts].map((c) => num(c.strike)).filter((n) => n > 0))].sort(
    (a, b) => a - b,
  );
  if (strikes.length === 0) return null;
  let best = strikes[0]!;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const k of strikes) {
    let cost = 0;
    for (const c of calls) {
      const s = num(c.strike);
      if (k > s) cost += (k - s) * num(c.openInterest);
    }
    for (const p of puts) {
      const s = num(p.strike);
      if (k < s) cost += (s - k) * num(p.openInterest);
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = k;
    }
  }
  return best;
}

export function parseYahooOptions(raw: unknown, ticker: string): OptionsSnapshot | null {
  const chain = (raw as { optionChain?: { result?: any[] } })?.optionChain?.result?.[0];
  if (!chain) return null;
  const spot = num(chain.quote?.regularMarketPrice);
  const pack = chain.options?.[0];
  const calls: YahooContract[] = pack?.calls ?? [];
  const puts: YahooContract[] = pack?.puts ?? [];
  if (!spot || (calls.length === 0 && puts.length === 0)) return null;
  const expiryUnix = num(pack?.expirationDate);
  const expiry = expiryUnix ? new Date(expiryUnix * 1000).toISOString().slice(0, 10) : "";
  const callOi = calls.reduce((s, c) => s + num(c.openInterest), 0);
  const putOi = puts.reduce((s, p) => s + num(p.openInterest), 0);
  const putCall = callOi > 0 ? putOi / callOi : null;
  const byStrike = new Map<number, OptionsRow>();
  for (const c of calls) {
    const strike = num(c.strike);
    if (!strike) continue;
    const row = byStrike.get(strike) ?? {
      strike,
      expiry,
      callOi: 0,
      putOi: 0,
      callVol: 0,
      putVol: 0,
      markIv: null,
    };
    row.callOi += num(c.openInterest);
    row.callVol += num(c.volume);
    row.markIv = num(c.impliedVolatility) || row.markIv;
    byStrike.set(strike, row);
  }
  for (const p of puts) {
    const strike = num(p.strike);
    if (!strike) continue;
    const row = byStrike.get(strike) ?? {
      strike,
      expiry,
      callOi: 0,
      putOi: 0,
      callVol: 0,
      putVol: 0,
      markIv: null,
    };
    row.putOi += num(p.openInterest);
    row.putVol += num(p.volume);
    byStrike.set(strike, row);
  }
  const rows = [...byStrike.values()].sort((a, b) => a.strike - b.strike);
  const magnets = [...rows].sort((a, b) => b.callOi + b.putOi - (a.callOi + a.putOi)).slice(0, 3).map((r) => r.strike);
  const pain = maxPain(calls, puts);
  const pcBit =
    putCall == null
      ? ""
      : putCall > 1.1
        ? "путы в перевесе — рынок страхуется"
        : putCall < 0.7
          ? "коллы в перевесе — ритейл гонится за ростом"
          : "P/C около нормы";
  const painBit = pain != null ? `макс. боль ${pain.toFixed(spot >= 50 ? 0 : 2)}` : "";
  return {
    currency: ticker,
    spot,
    maxPain: pain,
    callOi,
    putOi,
    putCall,
    magnetStrikes: magnets,
    rows: rows.filter((r) => r.callOi + r.putOi > 0).slice(0, 80),
    note: [`Опционы ${ticker}`, painBit, pcBit].filter(Boolean).join(". ") + ".",
  };
}

export interface ConstructionView {
  strike: number;
  expiry: string;
  type: string;
  why: string;
  source: string;
  putCall: string;
}

export function readConstruction(opt: OptionsSnapshot | null | undefined): ConstructionView | null {
  if (!opt || !opt.rows.length) return null;
  const top = [...opt.rows].sort((a, b) => b.callOi + b.putOi - (a.callOi + a.putOi))[0];
  if (!top) return null;
  const total = top.callOi + top.putOi;
  const putShare = total > 0 ? top.putOi / total : 0.5;
  const spot = opt.spot;
  const pain = opt.maxPain;
  const dist = spot > 0 ? Math.abs(top.strike - spot) / spot : 1;
  let type = "стена интереса";
  let why = `На страйке ${top.strike} сидит основной открытый интерес. Это якорь, не приказ по споту.`;
  if (putShare > 0.65) {
    type = "стена путов";
    why =
      dist < 0.02
        ? `Крупняк держит защиту под текущей ценой. Путы на ${top.strike} — пол на случай выноса. Спот ниже стены часто ускоряют, не «покупают потому что путы».`
        : `Путовый интерес на ${top.strike} ниже рынка. Типичный хедж лонга или пол: крупняк не хочет дешевле этого страйка без компенсации.`;
  } else if (putShare < 0.35) {
    type = "стена коллов";
    why =
      top.strike > spot
        ? `Коллы торчат выше спота на ${top.strike}. Часто потолок или покрытие шорта: к экспирации цену могут не пускать далеко за страйк без смены интереса.`
        : `Коллы сконцентрированы на ${top.strike}. Ритейл уже заплатил за рост — крупняк может кормить движение в страйк, а не через него.`;
  } else if (pain != null && Math.abs(pain - spot) / spot < 0.02) {
    type = "пин / бабочка около max pain";
    why = `Макс. боль ${pain} почти на споте. Конструкция ближе к кондору: выгодно, чтобы к экспирации цена стояла. Не путать с трендом.`;
  }
  const pc =
    opt.putCall == null
      ? "P/C нет"
      : opt.putCall > 1.1
        ? `P/C ${opt.putCall.toFixed(2)} — рынок платит за защиту вниз`
        : opt.putCall < 0.7
          ? `P/C ${opt.putCall.toFixed(2)} — рынок платит за рост`
          : `P/C ${opt.putCall.toFixed(2)} — без явного перекоса`;
  return {
    strike: top.strike,
    expiry: top.expiry || "ближайшая",
    type,
    why: `${why} ${pc}. Источник — биржевая цепочка ${opt.currency}, не внебиржевой блок.`,
    source: opt.currency,
    putCall: pc,
  };
}

const PAIR_HINT: Record<string, string> = {
  XAUUSD: "золото / GLD",
  XAGUSD: "серебро / SLV",
  EURUSD: "евро через ETF FXE (не страйк 1.16, а бумага на евро)",
  GBPUSD: "фунт / FXB",
  USDJPY: "иена / FXY — лонг FXY = слабее USDJPY",
  AUDUSD: "аусси / FXA",
  USDCAD: "канадец / FXC",
  USOIL: "нефть / USO",
  XTIUSD: "нефть / USO",
  SPY: "S&P / SPY",
  QQQ: "Nasdaq / QQQ",
};

export function buildConstruction(
  opt: OptionsSnapshot | null | undefined,
  spec: Pick<SymbolSpec, "id" | "label">,
): OptionConstruction | null {
  if (!opt || !opt.rows.length) return null;
  const wallCall = [...opt.rows].sort((a, b) => b.callOi - a.callOi)[0];
  const wallPut = [...opt.rows].sort((a, b) => b.putOi - a.putOi)[0];
  const callW = wallCall?.callOi ?? 0;
  const putW = wallPut?.putOi ?? 0;
  let type: OptionConstruction["type"] = "mixed";
  let strike: number | null = opt.maxPain ?? opt.magnetStrikes[0] ?? null;
  if (callW > putW * 1.25 && wallCall) {
    type = "call-wall";
    strike = wallCall.strike;
  } else if (putW > callW * 1.25 && wallPut) {
    type = "put-wall";
    strike = wallPut.strike;
  }
  const pc = opt.putCall;
  let wanted: OptionConstruction["wanted"] = "flat";
  if (type === "call-wall" || (pc != null && pc < 0.7)) wanted = "down";
  if (type === "put-wall" || (pc != null && pc > 1.15)) wanted = "up";
  if (spec.id === "USDJPY" && wanted !== "flat") {
    wanted = wanted === "up" ? "down" : "up";
  }
  const expiry = opt.rows[0]?.expiry ?? "";
  const strikeTxt = strike != null ? (strike >= 50 ? strike.toFixed(0) : strike.toFixed(2)) : "—";
  const typeTxt =
    type === "call-wall"
      ? `стена коллов ${strikeTxt} (OI ${Math.round(callW).toLocaleString("ru-RU")})`
      : type === "put-wall"
        ? `стена путов ${strikeTxt} (OI ${Math.round(putW).toLocaleString("ru-RU")})`
        : `смешанный OI, магнит ${strikeTxt}`;
  const whyFor =
    wanted === "down"
      ? "Крупняк скорее отдаёт рост выше стены коллов / max pain тянет вниз. Лонг спота в премии спорит с конструкцией."
      : wanted === "up"
        ? "Стена путов / страховка снизу: крупняк не даёт уронить без боя. Шорт в дисконте спорит с конструкцией."
        : "Нет явной стены. Конструкция не спорит со структурой.";
  const hint = PAIR_HINT[spec.id] ?? spec.label;
  return {
    ticker: opt.currency,
    expiry,
    putCall: pc,
    maxPain: opt.maxPain,
    strike,
    type,
    wanted,
    why: `${hint}. Yahoo ${opt.currency}${expiry ? `, экспирация ${expiry}` : ""}. ${typeTxt}. P/C ${pc?.toFixed(2) ?? "—"}${opt.maxPain != null ? `, max pain ${opt.maxPain >= 50 ? opt.maxPain.toFixed(0) : opt.maxPain.toFixed(2)}` : ""}. ${whyFor}`,
  };
}
