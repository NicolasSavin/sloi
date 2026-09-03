import type { MacroPlay } from "@/lib/macro-scenarios";

export function MacroPlayCard({ play, compact }: { play: MacroPlay; compact?: boolean }) {
  if (!play.kind || play.kind === "none") return null;
  return (
    <div className={compact ? "mt-3 space-y-2" : "space-y-2"}>
      {!compact ? (
        <>
          <p className="font-mono text-[10px] tracking-[0.16em] text-accent">СЦЕНАРИИ · ИСТОРИЯ, НЕ ПРОРОЧЕСТВО</p>
          <p className="text-sm leading-relaxed">{play.headline}</p>
          <p className="text-xs leading-relaxed text-muted">{play.history}</p>
        </>
      ) : (
        <p className="font-mono text-[10px] tracking-[0.14em] text-accent">КУДА ЧАЩЕ И КАК СКОРО</p>
      )}
      {play.paths.map((x) => (
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
          {!compact ? (
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {x.move}. {x.therefore}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted">{x.move}</p>
          )}
        </div>
      ))}
      {!compact ? (
        <p className="text-sm leading-relaxed">
          <span className="text-accent">Как скоро. </span>
          {play.soon} {play.trade}
        </p>
      ) : null}
    </div>
  );
}
