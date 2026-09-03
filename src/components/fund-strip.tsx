import type { FundamentalSnap } from "@/lib/fundamentals";
import { MacroPlayCard } from "@/components/macro-play";
import { cn } from "@/lib/utils";

export function FundStrip({ fund }: { fund: FundamentalSnap }) {
  const halt = fund.halt;
  const p = fund.plain;
  return (
    <div className={cn("panel-volume rounded-xl p-4", halt.active && "border-bear/40")}>
      <p className="font-mono text-xs tracking-[0.18em] text-accent">
        {halt.active ? "ФУНДАМЕНТ · ТОРМОЖУ ТОРГОВЛЮ" : "ФУНДАМЕНТ ПРОСТЫМИ СЛОВАМИ"}
      </p>
      <p className="mt-3 text-base leading-relaxed">{p.now}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        <span className="text-accent">Почему. </span>
        {p.why}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        <span className="text-accent">Значит. </span>
        {p.so}
      </p>
      <p className="mt-3 rounded-md bg-elevated/80 px-3 py-2 text-sm leading-relaxed">{p.simple}</p>
      {fund.cot?.line ? (
        <p className="mt-3 text-sm leading-relaxed text-muted">
          <span className="text-accent">COT. </span>
          {fund.cot.line}
        </p>
      ) : null}
      {fund.play?.kind && fund.play.kind !== "none" ? <MacroPlayCard play={fund.play} /> : null}
    </div>
  );
}
