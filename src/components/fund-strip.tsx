import type { FundamentalSnap } from "@/lib/fundamentals";
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
      {fund.play?.kind && fund.play.kind !== "none" ? (
        <div className="mt-4 space-y-2">
          <p className="font-mono text-[10px] tracking-[0.16em] text-accent">СЦЕНАРИИ · ИСТОРИЯ, НЕ ПРОРОЧЕСТВО</p>
          <p className="text-sm leading-relaxed">{fund.play.headline}</p>
          <p className="text-xs leading-relaxed text-muted">{fund.play.history}</p>
          {fund.play.paths.map((x) => (
            <div key={x.name}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {x.p}% · {x.name}
                </span>
                <span className="font-mono text-[10px] text-dim">{x.when}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-subtle">
                <div className="h-full rounded-full bg-accent/80" style={{ width: `${x.p}%` }} />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {x.move}. {x.therefore}
              </p>
            </div>
          ))}
          <p className="text-sm leading-relaxed">
            <span className="text-accent">Как скоро. </span>
            {fund.play.soon} {fund.play.trade}
          </p>
        </div>
      ) : null}
    </div>
  );
}
