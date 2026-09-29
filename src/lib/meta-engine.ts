import type { SmcSnapshot, Zone } from "@/lib/smc/engine";
import type { LiveReaction } from "@/lib/level-reaction";

export type Dir = "LONG" | "SHORT" | "NEUTRAL";
export type Role = "CONTEXT" | "SETUP" | "CONFIRMATION" | "WARNING" | "HARD_GATE";
export type Call = "LONG" | "SHORT" | "WAIT" | "PASS";

export interface Factor {
  name: string;
  direction: Dir;
  confidence: number;
  role: Role;
  evidence: string;
  strategy: string;
}

export interface Scenario {
  strategy: string;
  direction: Exclude<Dir, "NEUTRAL">;
  score: number;
  confirmations: string[];
  warnings: string[];
  missing: string[];
  entryCondition: string;
  invalidation: string;
  ready: boolean;
  inZone: boolean;
}

export interface MetaDecision {
  regime: string;
  strategy: string;
  score: number;
  valid: boolean;
  decision: Call;
  primary: Scenario | null;
  secondary: Scenario | null;
  conflicts: string[];
  factors: Factor[];
  because: string;
  therefore: string;
  fors: string[];
  against: string[];
  plan: { entry: number; stop: number; target: number } | null;
}

type Side = "long" | "short";

function dirOf(side: Side): Exclude<Dir, "NEUTRAL"> {
  return side === "long" ? "LONG" : "SHORT";
}

function inBand(price: number, z: Zone | null, pad: number): boolean {
  if (!z || !Number.isFinite(price)) return false;
  const lo = Math.min(z.top, z.bottom) - pad;
  const hi = Math.max(z.top, z.bottom) + pad;
  return price >= lo && price <= hi;
}

function nearest(zones: Zone[], side: "bull" | "bear", price: number): Zone | null {
  const open = zones.filter((z) => !z.mitigated && z.side === side);
  if (!open.length || !Number.isFinite(price)) return null;
  return open.sort((a, b) => {
    const da = Math.min(Math.abs(price - a.top), Math.abs(price - a.bottom));
    const db = Math.min(Math.abs(price - b.top), Math.abs(price - b.bottom));
    return da - db;
  })[0]!;
}

interface Book {
  price: number;
  atr: number;
  bullOb: Zone | null;
  bearOb: Zone | null;
  bullFvg: Zone | null;
  bearFvg: Zone | null;
  inBullOb: boolean;
  inBearOb: boolean;
  inBullFvg: boolean;
  inBearFvg: boolean;
  sellSwept: boolean;
  buySwept: boolean;
  delta: number;
  splashBuy: boolean;
  splashSell: boolean;
  volumeSpike: boolean;
  cvd: "bull" | "bear" | null;
  div: "bull" | "bear" | null;
  where: "above" | "below" | "inside";
  structure: "bull" | "bear" | "range";
  momentum: "up" | "down" | "flat";
}

function readBook(snap: Pick<SmcSnapshot, "lastClose" | "atr" | "bias" | "trend" | "lastChangePct" | "orderBlocks" | "fvgs" | "liquidity" | "flow" | "micro" | "divergences">): Book {
  const price = snap.lastClose;
  const atr = snap.atr > 0 ? snap.atr : Math.abs(price) * 0.001;
  const pad = atr * 0.12;
  const obs = snap.orderBlocks ?? [];
  const fvgs = (snap.fvgs ?? []).filter((z) => z.kind === "fvg");
  const bullOb = nearest(obs.filter((z) => z.kind === "ob" || z.kind === "mitigation" || z.kind === "breaker"), "bull", price);
  const bearOb = nearest(obs.filter((z) => z.kind === "ob" || z.kind === "mitigation" || z.kind === "breaker"), "bear", price);
  const bullFvg = nearest(fvgs, "bull", price);
  const bearFvg = nearest(fvgs, "bear", price);
  const splash = snap.micro?.splash;
  const cont = snap.micro?.splashDelta?.verdict === "continue";
  const delta = snap.micro?.footprint.delta ?? snap.flow?.lastDelta ?? 0;
  const div = (snap.divergences ?? []).find((d) => !d.played && d.kind === "regular");
  const structure: Book["structure"] =
    snap.bias === "bullish" || snap.trend === "up" ? "bull" : snap.bias === "bearish" || snap.trend === "down" ? "bear" : "range";
  const ch = snap.lastChangePct ?? 0;
  return {
    price,
    atr,
    bullOb,
    bearOb,
    bullFvg,
    bearFvg,
    inBullOb: inBand(price, bullOb, pad),
    inBearOb: inBand(price, bearOb, pad),
    inBullFvg: inBand(price, bullFvg, pad),
    inBearFvg: inBand(price, bearFvg, pad),
    sellSwept: Boolean(snap.liquidity?.some((l) => l.side === "sell" && l.swept)),
    buySwept: Boolean(snap.liquidity?.some((l) => l.side === "buy" && l.swept)),
    delta,
    splashBuy: Boolean(cont && splash?.side === "buy"),
    splashSell: Boolean(cont && splash?.side === "sell"),
    volumeSpike: Boolean(snap.micro?.splash),
    cvd: snap.flow?.cvdDiv && !snap.flow.cvdDiv.played ? snap.flow.cvdDiv.side : null,
    div: div ? div.side : null,
    where: snap.micro?.where ?? "inside",
    structure,
    momentum: ch > 0.02 ? "up" : ch < -0.02 ? "down" : "flat",
  };
}

function finish(
  strategy: string,
  side: Side,
  score: number,
  confirmations: string[],
  warnings: string[],
  blockers: string[],
  soft: string[],
  inZone: boolean,
  entryCondition: string,
  invalidation: string,
  need: number,
): Scenario {
  const ready = score >= need && blockers.length === 0;
  return {
    strategy,
    direction: dirOf(side),
    score: Math.max(0, Math.min(100, Math.round(score))),
    confirmations,
    warnings,
    missing: [...blockers, ...soft],
    entryCondition,
    invalidation,
    ready,
    inZone,
  };
}

function impulse(b: Book, side: Side): Scenario {
  const long = side === "long";
  const ob = long ? b.bullOb : b.bearOb;
  const fvg = long ? b.bullFvg : b.bearFvg;
  const swept = long ? b.sellSwept : b.buySwept;
  const deltaOk = long ? b.delta > 0 || b.splashBuy : b.delta < 0 || b.splashSell;
  const cvdOk = long ? b.cvd === "bull" : b.cvd === "bear";
  const structOk = long ? b.structure === "bull" : b.structure === "bear";
  const volOk = (long ? b.splashBuy : b.splashSell) || (b.volumeSpike && deltaOk);
  let score = 0;
  const confirmations: string[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];
  const soft: string[] = [];
  if (ob) {
    score += 25;
    confirmations.push("ордерблок");
  } else blockers.push("ордерблок");
  if (swept) {
    score += 20;
    confirmations.push("съём ликвидности");
  }
  if (volOk) {
    score += 15;
    confirmations.push("всплеск объёма");
  }
  if (deltaOk) {
    score += 15;
    confirmations.push("дельта");
  } else soft.push("дельта в сторону импульса");
  if (fvg) {
    score += 15;
    confirmations.push("имбаланс");
  } else soft.push("имбаланс");
  if (cvdOk) {
    score += 5;
    confirmations.push("CVD");
  }
  if (structOk) {
    score += 5;
    confirmations.push("структура");
  }
  const divAgainst = long ? b.div === "bear" || b.cvd === "bear" : b.div === "bull" || b.cvd === "bull";
  if (divAgainst && !cvdOk) {
    score -= 6;
    warnings.push(long ? "медвежий дивер — не отмена" : "бычий дивер — не отмена");
  }
  const vwapAgainst = long ? b.where === "below" : b.where === "above";
  if (vwapAgainst) {
    score -= 3;
    warnings.push(long ? "цена ниже VWAP — не отмена" : "цена выше VWAP — не отмена");
  }
  const inZone = long ? b.inBullOb || b.inBullFvg : b.inBearOb || b.inBearFvg;
  if (!inZone) soft.push("возврат в блок или имбаланс");
  const own = [Boolean(ob), Boolean(fvg) || swept, deltaOk || volOk || structOk].filter(Boolean).length;
  if (own < 3) blockers.push("мало своих подтверждений импульса");
  return finish(
    "Order Flow Impulse",
    side,
    score,
    confirmations,
    warnings,
    blockers,
    soft,
    inZone,
    long ? "цена заходит в бычий блок или имбаланс" : "цена заходит в медвежий блок или имбаланс",
    long ? "бычий блок пробит закрытием" : "медвежий блок пробит закрытием",
    60,
  );
}

function reversal(b: Book, side: Side): Scenario {
  const long = side === "long";
  const swept = long ? b.sellSwept : b.buySwept;
  const divOk = long ? b.div === "bull" || b.cvd === "bull" : b.div === "bear" || b.cvd === "bear";
  const ob = long ? b.bullOb : b.bearOb;
  const fvg = long ? b.bullFvg : b.bearFvg;
  const structTurn = long ? b.structure !== "bull" : b.structure !== "bear";
  let score = 0;
  const confirmations: string[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];
  const soft: string[] = [];
  if (swept) {
    score += 25;
    confirmations.push("съём ликвидности");
  } else blockers.push("съём ликвидности");
  if (divOk) {
    score += 20;
    confirmations.push("дивергенция");
  } else blockers.push("дивергенция разворота");
  if (ob) {
    score += 15;
    confirmations.push("ордерблок");
  }
  if (fvg) {
    score += 10;
    confirmations.push("имбаланс");
  }
  if (long ? b.cvd === "bull" : b.cvd === "bear") {
    score += 10;
    confirmations.push("CVD");
  }
  if (structTurn) {
    score += 5;
    confirmations.push("структура ещё старая — разворот уместен");
  }
  if ((long && b.momentum === "down") || (!long && b.momentum === "up")) {
    score -= 4;
    warnings.push("импульс ещё против разворота — не отмена");
  }
  const inZone = long ? b.inBullOb || b.inBullFvg : b.inBearOb || b.inBearFvg;
  if (!inZone) soft.push("возврат в блок или имбаланс");
  return finish(
    "Liquidity Reversal",
    side,
    score,
    confirmations,
    warnings,
    blockers,
    soft,
    inZone,
    long ? "после снятия низов цена в бычьей зоне" : "после снятия верхов цена в медвежьей зоне",
    long ? "новый минимум ниже снятой ликвидности" : "новый максимум выше снятой ликвидности",
    58,
  );
}

function trend(b: Book, side: Side): Scenario {
  const long = side === "long";
  const structOk = long ? b.structure === "bull" : b.structure === "bear";
  const vwapOk = long ? b.where !== "below" : b.where !== "above";
  const momOk = long ? b.momentum === "up" : b.momentum === "down";
  const volOk = long ? b.delta > 0 || b.splashBuy : b.delta < 0 || b.splashSell;
  const fvg = long ? b.bullFvg : b.bearFvg;
  const swept = long ? b.sellSwept : b.buySwept;
  let score = 0;
  const confirmations: string[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];
  const soft: string[] = [];
  if (structOk) {
    score += 25;
    confirmations.push("структура");
  } else blockers.push("структура по стороне");
  if (vwapOk) {
    score += 15;
    confirmations.push("VWAP");
  } else {
    score -= 4;
    warnings.push("VWAP против хода — не отмена");
  }
  if (momOk) {
    score += 15;
    confirmations.push("момент");
  }
  if (volOk || b.volumeSpike) {
    score += 15;
    confirmations.push("объём");
  }
  if (fvg) {
    score += 10;
    confirmations.push("имбаланс");
  }
  if (swept) {
    score += 10;
    confirmations.push("ликвидность снята по пути");
  }
  const divAgainst = long ? b.div === "bear" : b.div === "bull";
  if (divAgainst) {
    score -= 5;
    warnings.push("дивер против тренда — предупреждение, не запрет");
  }
  const inZone = long ? b.inBullFvg || b.inBullOb : b.inBearFvg || b.inBearOb;
  if (!inZone) soft.push("откат в имбаланс или блок");
  if (!structOk || (!momOk && !volOk)) blockers.push("мало своих подтверждений тренда");
  return finish(
    "Trend Continuation",
    side,
    score,
    confirmations,
    warnings,
    blockers,
    soft,
    inZone,
    long ? "откат в бычий имбаланс по тренду" : "откат в медвежий имбаланс по тренду",
    long ? "структура ломается вниз" : "структура ломается вверх",
    58,
  );
}

function meanRev(b: Book, side: Side): Scenario {
  const long = side === "long";
  const stretched = long ? b.where === "below" : b.where === "above";
  const divOk = long ? b.div === "bull" || b.cvd === "bull" : b.div === "bear" || b.cvd === "bear";
  const swept = long ? b.sellSwept : b.buySwept;
  const volOk = b.volumeSpike || (long ? b.delta > 0 : b.delta < 0);
  const range = b.structure === "range";
  let score = 0;
  const confirmations: string[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];
  const soft: string[] = [];
  if (stretched) {
    score += 25;
    confirmations.push("отклонение от VWAP");
  } else blockers.push("отклонение от VWAP");
  if (swept) {
    score += 15;
    confirmations.push("ликвидность");
  }
  if (divOk) {
    score += 20;
    confirmations.push("дивергенция");
  } else blockers.push("дивергенция к возврату");
  if (volOk) {
    score += 10;
    confirmations.push("объём");
  }
  if (range) {
    score += 10;
    confirmations.push("структура диапазона");
  } else {
    score -= 4;
    warnings.push("это не диапазон — возврат слабее");
  }
  const inZone = stretched;
  if (!inZone) soft.push("возврат ещё не у края VWAP");
  return finish(
    "Mean Reversion",
    side,
    score,
    confirmations,
    warnings,
    blockers,
    soft,
    inZone,
    long ? "цена ниже VWAP и есть дивер" : "цена выше VWAP и есть дивер",
    long ? "уход ещё ниже без дивера" : "уход ещё выше без дивера",
    55,
  );
}

function scenarioText(s: Scenario): string {
  const head = `${s.direction} — ${s.strategy}, ${s.score}/100`;
  const ok = s.confirmations.length ? `Подтверждения: ${s.confirmations.join(", ")}.` : "";
  const warn = s.warnings.length ? `Предупреждения: ${s.warnings.join("; ")}.` : "";
  const miss = s.missing.length ? `Не хватает: ${s.missing.join("; ")}.` : "";
  return [head, ok, warn, miss, `Вход: ${s.entryCondition}.`, `Снятие: ${s.invalidation}.`].filter(Boolean).join(" ");
}

function levelScenario(r: LiveReaction | undefined): Scenario | null {
  if (!r || r.kind !== "retest" || !r.side) return null;
  let score = 40;
  const confirmations = ["повторный тест уровня"];
  const warnings: string[] = [];
  if (r.origin === "impulse") {
    score += 12;
    confirmations.push("уровень родился после импульса");
  }
  if (r.tests > 0) {
    score += 10;
    confirmations.push(`память: ${r.tests} касаний`);
  } else warnings.push("первое касание, своей памяти ещё нет");
  if (r.slowing) {
    score += 8;
    confirmations.push("свеча короче предыдущей");
  }
  if (r.volumeUp) {
    score += 8;
    confirmations.push("объём выше обычного");
  }
  if (r.sweep) {
    score += 10;
    confirmations.push("хвост снял уровень и закрылись обратно");
  }
  return finish(
    "Level Reaction",
    r.side,
    score,
    confirmations,
    warnings,
    score >= 55 ? [] : ["мало признаков реакции"],
    r.expectedPips != null ? [`прошлые реакции около ${r.expectedPips.toFixed(0)} п.`] : [],
    true,
    r.side === "long" ? "короткий откат вверх от уровня, не разворот рынка" : "короткий откат вниз от уровня, не разворот рынка",
    "уровень пробит примерно на четверть хода свечи",
    55,
  );
}

/** Strategies first. A warning lowers confidence. Only a hard gate or a real conflict blocks. */
export function decideMeta(
  snap: Pick<
    SmcSnapshot,
    | "bias"
    | "trend"
    | "lastClose"
    | "lastChangePct"
    | "atr"
    | "orderBlocks"
    | "fvgs"
    | "liquidity"
    | "flow"
    | "micro"
    | "wyckoff"
    | "divergences"
    | "auction"
    | "coil"
    | "margin"
    | "reaction"
  >,
  hard?: { noData?: boolean; spreadEats?: boolean; marketClosed?: boolean },
): MetaDecision {
  const empty = (decision: Call, because: string, therefore: string): MetaDecision => ({
    regime: "нет режима",
    strategy: "нет сценария",
    score: 0,
    valid: false,
    decision,
    primary: null,
    secondary: null,
    conflicts: [],
    factors: [],
    because,
    therefore,
    fors: [],
    against: [],
    plan: null,
  });
  if (hard?.noData || !Number.isFinite(snap.lastClose)) {
    return empty("PASS", "Нет цены.", "Жёсткий запрет: нет данных. Это не спор модулей.");
  }
  if (hard?.marketClosed) {
    return empty("PASS", "Рынок закрыт.", "Жёсткий запрет: рынок закрыт.");
  }
  if (hard?.spreadEats) {
    return empty("PASS", "Спред съедает ход.", "Жёсткий запрет: после спреда цели нет.");
  }

  const book = readBook(snap);
  const sides: Side[] = ["long", "short"];
  const reaction = levelScenario(snap.reaction);
  const all = [
    ...sides.flatMap((side) => [impulse(book, side), reversal(book, side), trend(book, side), meanRev(book, side)]),
    ...(reaction ? [reaction] : []),
  ];
  const ready = all.filter((s) => s.ready).sort((a, b) => b.score - a.score);
  const regime =
    book.structure === "bull" ? "бычий контекст" : book.structure === "bear" ? "медвежий контекст" : "диапазон";
  const where = book.where === "above" ? ", выше VWAP" : book.where === "below" ? ", ниже VWAP" : ", у VWAP";
  const factors: Factor[] = all.flatMap((s) =>
    s.confirmations.map((name) => ({
      name,
      direction: s.direction,
      confidence: s.score,
      role: "CONFIRMATION" as Role,
      evidence: name,
      strategy: s.strategy,
    })),
  );

  if (!ready.length) {
    const best = [...all].sort((a, b) => b.score - a.score)[0]!;
    return {
      regime: regime + where,
      strategy: best.strategy,
      score: best.score,
      valid: false,
      decision: "WAIT",
      primary: best,
      secondary: null,
      conflicts: [],
      factors,
      because: `Режим: ${regime}${where}. Ни одна стратегия не собрала свои подтверждения.`,
      therefore: `${scenarioText(best)} Решение: ждать. Один чужой модуль сценарий не отменяет и сам по себе вход не даёт.`,
      fors: best.confirmations,
      against: best.warnings,
      plan: null,
    };
  }

  const primary = ready[0]!;
  const secondary = ready.find((s) => s.strategy !== primary.strategy) ?? null;
  const conflicts: string[] = [];
  const opposed = secondary && secondary.direction !== primary.direction && secondary.score >= primary.score - 12;
  if (opposed && secondary) {
    conflicts.push(`${primary.strategy} ${primary.direction} против ${secondary.strategy} ${secondary.direction}`);
  }

  const reactionNote =
    snap.reaction?.kind === "empty-impulse"
      ? ` ${snap.reaction.note}`
      : snap.reaction?.kind === "retest"
        ? ` Уровень: ${snap.reaction.note}`
        : "";
  let decision: Call = primary.direction;
  let therefore = "";
  if (opposed) {
    decision = "WAIT";
    therefore = `Конфликт сценариев, не индикаторов. ${scenarioText(primary)} Второй: ${secondary ? scenarioText(secondary) : ""}. Решение: ждать, пока один сценарий не оторвётся.${reactionNote}`;
  } else if (!primary.inZone) {
    decision = "WAIT";
    therefore = `${scenarioText(primary)} Решение: ждать. Сценарий жив, но условия входа ещё нет. Рыночный ордер не отправляем.${reactionNote}`;
  } else if (primary.score < 62) {
    decision = "WAIT";
    therefore = `${scenarioText(primary)} Решение: ждать. Предупреждения снизили уверенность, сетап не стёрт.${reactionNote}`;
  } else {
    decision = primary.direction;
    therefore = `${scenarioText(primary)}${secondary ? ` Второй сценарий: ${secondary.direction} ${secondary.strategy} ${secondary.score}/100.` : ""} Решение: ${primary.direction}. Предупреждения учтены и вход не отменили.${reactionNote}`;
  }
  const armed =
    (decision === "LONG" || decision === "SHORT") &&
    primary.strategy === "Level Reaction" &&
    snap.reaction?.entry != null &&
    snap.reaction.stop != null &&
    snap.reaction.target != null
      ? { entry: snap.reaction.entry, stop: snap.reaction.stop, target: snap.reaction.target }
      : null;

  return {
    regime: regime + where,
    strategy: primary.strategy,
    score: primary.score,
    valid: decision === "LONG" || decision === "SHORT",
    decision,
    primary,
    secondary,
    conflicts,
    factors,
    because: `Режим: ${regime}${where}. Главный сценарий: ${primary.direction} — ${primary.strategy}.`,
    therefore,
    fors: primary.confirmations,
    against: [...primary.warnings, ...conflicts],
    plan: armed,
  };
}
