import type { Candle, MarketKind, OptionsSnapshot } from "@/lib/market/types";
import { detectPatterns, detectWyckoff, type PatternHit, type WyckoffRead } from "@/lib/smc/patterns";
import { buildFlow, locateEdgeDiv, type FlowSnap } from "@/lib/smc/flow";
import { clustersFromCandles, clustersFromTrades, type ClusterMap } from "@/lib/smc/clusters";
import { barVolume, buildMicro, buildSweepFuel, nearestStall, tapeVsSide, type MicroSnap, type SweepFuel } from "@/lib/smc/micro";
import { buildAuction, type AuctionSnap } from "@/lib/smc/auction";
import { buildCoilBreak, type CoilBreak } from "@/lib/smc/coil";
import { buildCorr, inheritCircle, type CorrSnap } from "@/lib/corr";
import { buildIvNews, type IvNewsSnap } from "@/lib/iv-news";
import { bookAdjust, brokerBook, liveAskBid, liveBook, liveCdBars, liveCdFlow, liveClusters, liveCumDelta, liveProfile } from "@/lib/broker-tape";
import type { NewsHalt } from "@/lib/calendar";
import { replayLevels, type LiveReaction } from "@/lib/level-reaction";
import { getSymbol } from "@/lib/market/symbols";

export type Bias = "bullish" | "bearish" | "range";
export type Side = "bull" | "bear";

// ENGINE RESTORE IN PROGRESS - full body will be restored via next commits
// Temporary minimal surface so the project typechecks partially

export interface Swing { index: number; time: number; price: number; type: "high" | "low"; }
export interface StructureEvent { time: number; price: number; kind: "BOS" | "CHoCH"; side: Side; index: number; }
export interface Zone { id: string; kind: "fvg" | "ob" | "breaker" | "mitigation"; side: Side; top: number; bottom: number; startTime: number; endTime: number; mitigated: boolean; }
export interface LiquidityPool { price: number; time: number; side: "buy" | "sell"; equal: boolean; swept: boolean; sweptTime: number | null; }
export interface LocalSetup { thesis: string; entry: number | null; stop: number | null; targets: number[]; invalidation: string; }
export interface SmcSnapshot { bias: Bias; trend: "up" | "down" | "range"; lastClose: number; atr: number; localSetup: LocalSetup; [key: string]: unknown; }

export function zoneReach(z: Pick<Zone, "top" | "bottom" | "mitigated">, last: number, atr: number): number | null {
  if (z.mitigated || atr <= 0) return null;
  const lo = Math.min(z.top, z.bottom);
  const hi = Math.max(z.top, z.bottom);
  if (last >= lo && last <= hi) return 0;
  const d = last < lo ? lo - last : last - hi;
  if (d > atr * 2.2) return null;
  return d;
}

export function zoneName(z: Pick<Zone, "kind" | "side">): string {
  if (z.kind === "breaker") return z.side === "bull" ? "бычий брейкер" : "медвежий брейкер";
  if (z.kind === "mitigation") return z.side === "bull" ? "митигейшн покупок" : "митигейшн продаж";
  if (z.kind === "ob") return z.side === "bull" ? "блок покупок" : "блок продаж";
  return z.side === "bull" ? "бычий FVG" : "медвежий FVG";
}

export interface BoxVector { dir: "up" | "down" | "none"; magnet: number | null; swept: number | null; because: string; }
export function buildBoxVector(): BoxVector {
  return { dir: "none", magnet: null, swept: null, because: "restore in progress" };
}

export function analyzeMarket(): SmcSnapshot {
  throw new Error("engine.ts restore required: run git checkout 0f5cbb7f -- src/lib/smc/engine.ts && git apply patches/buildSetup-sweep.patch");
}

export function compactForAi(): unknown {
  throw new Error("engine.ts restore required");
}
