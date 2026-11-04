/**
 * Confluence scoring for SLOI SMC engine.
 * Goal: reduce discretionary noise, emit only high-expectancy setups to EA.
 *
 * Layers (max ~13):
 * - HTF bias alignment: +3
 * - Structure (valid CHoCH/BOS on close): +2
 * - Fresh zone (OB/FVG/margin with displacement): +2
 * - Liquidity sweep before break: +2
 * - Volume/delta confirmation (absorption, cluster, positive delta): +2
 * - Killzone / session: +1
 * - Premium/Discount location: +1
 *
 * Recommended threshold for signals.txt / EA: >= 7
 */

export type ScoreLayer =
  | "htf"
  | "structure"
  | "zone"
  | "sweep"
  | "volume"
  | "session"
  | "location";

export interface ScoreBreakdown {
  layer: ScoreLayer;
  points: number;
  reason: string;
  active: boolean;
}

export interface ConfluenceScore {
  total: number;
  max: number;
  grade: "A" | "B" | "C" | "D" | "skip";
  layers: ScoreBreakdown[];
  summary: string;
  tradeable: boolean;
}

export interface ScoreInput {
  /** Higher timeframe bias matches proposed side */
  htfAligned: boolean;
  /** Valid structure break (CHoCH preferred) on closed bar */
  structureValid: boolean;
  /** Fresh unmitigated zone with displacement */
  zoneValid: boolean;
  /** Liquidity was swept before the structure break */
  sweepPresent: boolean;
  /** Delta / cluster / absorption confirms direction */
  volumeConfirms: boolean;
  /** Inside London or New York killzone */
  inKillzone: boolean;
  /** Price is in discount for longs / premium for shorts */
  goodLocation: boolean;
  /** Optional ATR-based size filter already applied */
  zoneSizeOk?: boolean;
}

const THRESHOLD = 7;

export function buildConfluenceScore(input: ScoreInput): ConfluenceScore {
  const layers: ScoreBreakdown[] = [
    {
      layer: "htf",
      points: input.htfAligned ? 3 : 0,
      reason: input.htfAligned ? "HTF bias aligned" : "HTF bias against or neutral",
      active: input.htfAligned,
    },
    {
      layer: "structure",
      points: input.structureValid ? 2 : 0,
      reason: input.structureValid ? "Valid CHoCH/BOS on close" : "No valid structure break",
      active: input.structureValid,
    },
    {
      layer: "zone",
      points: input.zoneValid && (input.zoneSizeOk !== false) ? 2 : 0,
      reason: input.zoneValid
        ? "Fresh zone + displacement"
        : "Zone missing, mitigated or too small",
      active: input.zoneValid && input.zoneSizeOk !== false,
    },
    {
      layer: "sweep",
      points: input.sweepPresent ? 2 : 0,
      reason: input.sweepPresent ? "Liquidity swept before break" : "No sweep",
      active: input.sweepPresent,
    },
    {
      layer: "volume",
      points: input.volumeConfirms ? 2 : 0,
      reason: input.volumeConfirms ? "Delta/cluster confirms" : "Volume neutral or against",
      active: input.volumeConfirms,
    },
    {
      layer: "session",
      points: input.inKillzone ? 1 : 0,
      reason: input.inKillzone ? "Inside killzone" : "Outside session",
      active: input.inKillzone,
    },
    {
      layer: "location",
      points: input.goodLocation ? 1 : 0,
      reason: input.goodLocation ? "Good premium/discount" : "Equilibrium or wrong half",
      active: input.goodLocation,
    },
  ];

  const total = layers.reduce((s, l) => s + l.points, 0);
  const max = 13;

  let grade: ConfluenceScore["grade"] = "skip";
  if (total >= 10) grade = "A";
  else if (total >= 8) grade = "B";
  else if (total >= THRESHOLD) grade = "C";
  else if (total >= 5) grade = "D";

  const active = layers.filter((l) => l.active).map((l) => l.layer);
  const summary =
    active.length > 0
      ? `Score ${total}/${max} (${grade}) · ${active.join(" + ")}`
      : `Score ${total}/${max} · no confluence`;

  return {
    total,
    max,
    grade,
    layers,
    summary,
    tradeable: total >= THRESHOLD,
  };
}

/** Minimal signal shape for /api/signals.txt or JSON endpoint */
export interface ScoredSignal {
  symbol: string;
  side: "buy" | "sell";
  score: number;
  grade: string;
  entryZone: string;
  stop: number | null;
  targets: number[];
  reasons: string[];
  htfOk: boolean;
  sessionOk: boolean;
  timestamp: number;
}

export function toSignalLine(s: ScoredSignal): string {
  const reasons = s.reasons.join(";");
  return [
    s.symbol,
    s.side,
    s.entryZone,
    s.stop ?? "",
    s.targets.join("/"),
    s.score,
    s.grade,
    reasons,
    s.htfOk ? "1" : "0",
    s.sessionOk ? "1" : "0",
    s.timestamp,
  ].join("|");
}
