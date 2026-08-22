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

function rangeSince(candles: Candle[] | undefined, fromMs: number) {
  if (!candles?.length) return null;
  const from = fromMs / 1000 - 3600;
  const slice = candles.filter((c) => c.time >= from);
  const use = slice.length ? slice : candles.slice(-8);
  return {
    high: Math.max(...use.map((c) => c.high)),
    low: Math.min(...use.map((c) => c.low)),
    close: use.at(-1)!.close,
  };
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
    return `Цель ${hit.target != null ? fmt(hit.target) : "—"} взята по ${fmt(px)}. ${market?.story.leadsTo ?? ""} Сценарий отработал: выход там, где крупняк мог отдавать.`.replace(/\s+/g, " ").trim();
  }
  if (status === "stop") {
    return `Стоп ${hit.stop != null ? fmt(hit.stop) : "—"} снёс по ${fmt(px)}. ${market?.story.waiting ?? ""} Край не удержал — либо ликвидность забрали дальше, либо это был вынос, а не набор.`.replace(/\s+/g, " ").trim();
  }
  if (status === "halt") {
    return `Сделку сняли из-за крупной новости. ${halt?.line ?? "Календарь ударил в окно."} Такой исход не плюс и не минус — в эти минуты стоп и цель врут.`;
  }
  if (status === "reverse") {
    return `Пока сигнал висел, характер стал против. ${market?.advice.title ?? ""} Держать дальше — спорить с новым сломом.`;
  }
  return `Больше суток без стопа и цели. Цена ушла от края. Это не победа и не поражение — сценарий не состоялся.`;
}

export function settleHit(
  hit: SignalHit,
  market: DigestMarket | undefined,
  halt: NewsHalt | undefined,
  candles?: Candle[],
): SignalHit {
  if (hit.status && hit.status !== "open") return hit;
  const path = rangeSince(candles, hit.at);
  const high = path?.high ?? market?.lastHigh ?? market?.lastClose;
  const low = path?.low ?? market?.lastLow ?? market?.lastClose;
  const px = path?.close ?? market?.lastClose;
  if (px == null || high == null || low == null) return { ...hit, status: hit.status ?? "open" };

  const mark = (status: SignalStatus, exit: number): SignalHit => ({
    ...hit,
    status,
    closedAt: Date.now(),
    exit,
    resultR: rMultiple(hit, exit),
    why: explain(status, hit, exit, market, halt),
  });

  if (hit.action === "long") {
    if (hit.target != null && high >= hit.target) return mark("target", hit.target);
    if (hit.stop != null && low <= hit.stop) return mark("stop", hit.stop);
  } else {
    if (hit.target != null && low <= hit.target) return mark("target", hit.target);
    if (hit.stop != null && high >= hit.stop) return mark("stop", hit.stop);
  }
  if (halt?.active) return mark("halt", px);
  const opposite =
    market &&
    ((hit.action === "long" && market.advice.action === "short") ||
      (hit.action === "short" && market.advice.action === "long"));
  if (opposite) return mark("reverse", px);
  if (Date.now() - hit.at > DAY && market && market.advice.action !== hit.action) return mark("expired", px);
  return { ...hit, status: "open" };
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

export function statusLabel(status: SignalStatus | undefined) {
  if (status === "target") return "цель";
  if (status === "stop") return "стоп";
  if (status === "halt") return "новость";
  if (status === "reverse") return "разворот";
  if (status === "expired") return "не состоялся";
  return "открыт";
}
