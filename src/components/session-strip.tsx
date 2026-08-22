import { sessionNow, type SessionSnap } from "@/lib/sessions";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export function SessionStrip({ initial }: { initial?: SessionSnap }) {
  const [snap, setSnap] = useState(initial ?? sessionNow());
  useEffect(() => {
    const t = window.setInterval(() => setSnap(sessionNow()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <section className="panel-volume rounded-xl p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] text-accent">СЕССИИ · ЛОНДОН {snap.londonHour}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">{snap.line}</p>
        </div>
        <p className="font-mono text-xs text-dim">Рига {snap.rigaHour}</p>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {snap.bands.map((b) => (
          <div
            key={b.id}
            className={cn(
              "rounded-lg px-3 py-2 text-center",
              b.active ? "jewel-amber" : "bg-elevated",
              snap.overlap && b.id !== "tokyo" && b.active && "jewel-emerald",
            )}
          >
            <p className="font-mono text-[10px] tracking-[0.16em] text-dim">{b.active ? "ИДЁТ" : "тихо"}</p>
            <p className="mt-1 text-sm font-medium">{b.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
