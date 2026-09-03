import type { DigestMarket } from "@/lib/digest";
import type { NewsHalt } from "@/lib/calendar";
import type { Candle } from "@/lib/market/types";
import { formatPrice } from "@/lib/utils";
import type { SignalHit, SignalStatus } from "@/lib/dispatch-store";

const DAY = 24 * 60 * 60 * 1000;

function rMultiple(hit: SignalHit, exit: number) {
  if (hit.entry == null || hit.stop == null) return null;
  const risk = Math.abs(hit.entry - hit.stop);
  if (risk <= 0) return null;
  const dir = hit.action === "long" ? 1 : -1;
  return (dir * (exit - hit.entry)) / risk;
}

function explain(
  status: SignalStatus,
  hit: SignalHit,
  px: number,
  market: DigestMarket | undefined,
  halt: NewsHalt | undefined,
) {
  const fmt = (n: number) => formatPrice(n, hit.decimals);
  if (status === "target") {
    return `Цель ${hit.target != null ? fmt(hit.target) : "—"} взята по ${fmt(px)}. ${market?.story.leadsTo ?? ""} Сценарий отработал после касания входа.`
      .replace(/\s+/g, " ")
      .trim();
  }
  if (status === "stop") {
    return `Стоп ${hit.stop != null ? fmt(hit.stop) : "—"} снёс по ${fmt(px)}. ${market?.story.waiting ?? ""} После входа край не удержал.`
      .replace(/\s+/g, " ")
      .trim();
  }
  if (status === "halt") {
    return `Сигнал сняли из-за крупной новости. ${halt?.line ?? "Календарь."} Не плюс и не минус.`;
  }
  if (status === "reverse") {
    return `Пока ждали вход, характер стал против. ${market?.advice.title ?? ""} Лимит/сценарий отменён.`
      .replace(/\s+/g, " ")
      .trim();
  }
  return `Вход ${hit.entry != null ? fmt(hit.entry) : "—"} так и не коснули (или сутки без TP/SL). Это не сделка — сценарий не состоялся.`
    .replace(/\s+/g, " ")
    .trim();
}

function fillTol(hit: SignalHit) {
  if (hit.entry == null) return 0;
  return Math.abs((hit.entry - (hit.stop ?? hit.entry)) * 0.05) || Math.abs(hit.entry) * 0.0002;
}

/** Walk H1 bars in time: fill first, then first of SL/TP. Same-bar fill+stop without close = wick, not a trade. */
function walkPath(hit: SignalHit, candles: Candle[]): { filled: boolean; status?: SignalStatus; exit?: number } {
  if (!candles.length || hit.entry == null) {
    return { filled: Boolean(hit.filled) };
  }
  const from = hit.at / 1000 - 1800;
  const slice = candles.filter((c) => c.time >= from);
  const use = slice.length ? slice : candles.slice(-12);
  const tol = fillTol(hit);
  let filled = Boolean(hit.filled);

  for (const c of use) {
    if (!filled) {
      const touch =
        hit.action === "long" ? c.low <= hit.entry + tol : c.high >= hit.entry - tol;
      if (!touch) continue;
      const stopHit =
        hit.stop != null &&
        (hit.action === "long" ? c.low <= hit.stop : c.high >= hit.stop);
      const closedAgainst =
        hit.action === "long" ? c.close <= hit.entry : c.close >= hit.entry;
      if (stopHit && closedAgainst) {
        // wick through the zone — not a fill
        continue;
      }
      filled = true;
      const tpHit =
        hit.target != null &&
        (hit.action === "long" ? c.high >= hit.target : c.low <= hit.target);
      if (stopHit && tpHit) {
        const toStop = Math.abs(c.open - hit.stop!);
        const toTp = Math.abs(c.open - hit.target!);
        if (toStop <= toTp) return { filled, status: "stop", exit: hit.stop! };
        return { filled, status: "target", exit: hit.target! };
      }
      if (stopHit) return { filled, status: "stop", exit: hit.stop! };
      if (tpHit && (hit.action === "long" ? c.close > hit.entry : c.close < hit.entry)) {
        return { filled, status: "target", exit: hit.target! };
      }
      continue;
    }

    const stopHit =
      hit.stop != null && (hit.action === "long" ? c.low <= hit.stop : c.high >= hit.stop);
    const tpHit =
      hit.target != null && (hit.action === "long" ? c.high >= hit.target : c.low <= hit.target);
    if (stopHit && tpHit) {
      const toStop = Math.abs(c.open - (hit.stop ?? c.open));
      const toTp = Math.abs(c.open - (hit.target ?? c.open));
      if (toStop <= toTp) return { filled, status: "stop", exit: hit.stop! };
      return { filled, status: "target", exit: hit.target! };
    }
    if (tpHit) return { filled, status: "target", exit: hit.target! };
    if (stopHit) return { filled, status: "stop", exit: hit.stop! };
  }
  return { filled };
}

export function settleHit(
  hit: SignalHit,
  market: DigestMarket | undefined,
  halt: NewsHalt | undefined,
  candles?: Candle[],
): SignalHit {
  if (hit.status && hit.status !== "open") return hit;
  const px = candles?.at(-1)?.close ?? market?.lastClose;
  if (px == null) return { ...hit, status: hit.status ?? "open" };

  const walked = candles?.length ? walkPath(hit, candles) : null;
  const filled = walked ? walked.filled : hit.filled === true;
  const base: SignalHit = filled
    ? { ...hit, filled: true, filledAt: hit.filledAt ?? Date.now(), status: "open" }
    : {
        ...hit,
        filled: false,
        status: "open",
        why:
          hit.entry != null
            ? `Ждёт касания входа ${formatPrice(hit.entry, hit.decimals)} — это ещё не сделка`
            : hit.why,
      };

  const mark = (status: SignalStatus, exit: number): SignalHit => ({
    ...base,
    status,
    closedAt: Date.now(),
    exit,
    resultR: status === "target" || status === "stop" ? rMultiple(base, exit) : null,
    why: explain(status, base, exit, market, halt),
  });

  if (walked?.status === "target" && walked.exit != null) return mark("target", walked.exit);
  if (walked?.status === "stop" && walked.exit != null) return mark("stop", walked.exit);

  if (!filled) {
    if (halt?.active) return mark("halt", px);
    const opposite =
      market &&
      ((hit.action === "long" && market.advice.action === "short") ||
        (hit.action === "short" && market.advice.action === "long"));
    if (opposite) return mark("reverse", px);
    if (Date.now() - hit.at > DAY * 2) return mark("expired", px);
    return base;
  }

  if (halt?.active) return mark("halt", px);
  const opposite =
    market &&
    ((hit.action === "long" && market.advice.action === "short") ||
      (hit.action === "short" && market.advice.action === "long"));
  if (opposite) return mark("reverse", px);
  if (Date.now() - hit.at > DAY * 3) return mark("expired", px);
  return { ...base, why: `В сделке с ${formatPrice(hit.entry!, hit.decimals)}. Ждёт TP/SL.` };
}

export interface SignalStats {
  total: number;
  open: number;
  wins: number;
  losses: number;
  halted: number;
  other: number;
  winRate: number | null;
  avgR: number | null;
  bySymbol: { id: string; label: string; wins: number; losses: number; open: number }[];
  byReason: { id: string; n: number }[];
}

export function bookStats(log: SignalHit[]): SignalStats {
  const open = log.filter((h) => (h.status ?? "open") === "open").length;
  const wins = log.filter((h) => h.status === "target").length;
  const losses = log.filter((h) => h.status === "stop").length;
  const halted = log.filter((h) => h.status === "halt").length;
  const other = log.filter((h) => h.status === "expired" || h.status === "reverse").length;
  const decided = wins + losses;
  const rs = log.map((h) => h.resultR).filter((n): n is number => typeof n === "number");
  const by = new Map<string, { id: string; label: string; wins: number; losses: number; open: number }>();
  for (const h of log) {
    const row = by.get(h.symbol) ?? { id: h.symbol, label: h.label, wins: 0, losses: 0, open: 0 };
    if ((h.status ?? "open") === "open") row.open += 1;
    if (h.status === "target") row.wins += 1;
    if (h.status === "stop") row.losses += 1;
    by.set(h.symbol, row);
  }
  return {
    total: log.length,
    open,
    wins,
    losses,
    halted,
    other,
    winRate: decided ? wins / decided : null,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    bySymbol: [...by.values()].sort((a, b) => b.wins + b.losses + b.open - (a.wins + a.losses + a.open)),
    byReason: [
      { id: "цель", n: wins },
      { id: "стоп", n: losses },
      { id: "новость", n: halted },
      { id: "разворот / не состоялся", n: other },
      { id: "открыт", n: open },
    ],
  };
}

export function statusLabel(status: SignalStatus | undefined, filled?: boolean) {
  if (status === "target") return "цель";
  if (status === "stop") return "стоп";
  if (status === "halt") return "новость";
  if (status === "reverse") return "разворот";
  if (status === "expired") return "не состоялся";
  if (filled) return "в сделке";
  return "ждёт вход";
}
