import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useDeskStore } from "@/lib/desk-store";
import { TIMEFRAMES } from "@/lib/market/symbols";
import { actionLabel } from "@/lib/advisor";
import type { Advice } from "@/lib/advisor";
import type { LocalSetup } from "@/lib/smc/engine";
import { cn, formatPrice } from "@/lib/utils";

export function ChartHud({ boxRef }: { boxRef: RefObject<HTMLDivElement | null> }) {
  const timeframe = useDeskStore((s) => s.timeframe);
  const setTimeframe = useDeskStore((s) => s.setTimeframe);
  const [wide, setWide] = useState(false);

  const sync = useCallback(() => {
    const el = boxRef.current;
    setWide(Boolean(el && document.fullscreenElement === el));
  }, [boxRef]);

  useEffect(() => {
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [sync]);

  async function toggle() {
    const el = boxRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      /* браузер запретил */
    }
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-2">
      <div className="pointer-events-auto flex flex-wrap items-center gap-0.5 rounded-md bg-bg/80 p-1 backdrop-blur-sm">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.id}
            type="button"
            onClick={() => setTimeframe(tf.id)}
            className={cn(
              "h-8 min-w-9 rounded-sm px-2 font-mono text-[11px]",
              tf.id === timeframe ? "bg-subtle text-fg" : "text-muted hover:text-fg",
            )}
          >
            {tf.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => void toggle()}
        className="pointer-events-auto inline-flex h-8 items-center gap-1 rounded-md bg-bg/80 px-2 font-mono text-[11px] text-muted backdrop-blur-sm hover:text-fg"
        aria-label={wide ? "Свернуть график" : "Полный экран"}
      >
        {wide ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        {wide ? "свернуть" : "экран"}
      </button>
    </div>
  );
}

export function OrderHud({
  order,
  setup,
  decimals,
  loading,
}: {
  order?: Advice | null;
  setup?: LocalSetup | null;
  decimals: number;
  loading?: boolean;
}) {
  const side = order ? actionLabel(order.action) : loading ? "гружу стол…" : "нет ленты";
  const entry = setup?.entry != null ? formatPrice(setup.entry, decimals) : "—";
  const stop = setup?.stop != null ? formatPrice(setup.stop, decimals) : "—";
  const tp = setup?.targets[0] != null ? formatPrice(setup.targets[0], decimals) : "—";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-12 z-30 px-2">
      <div className="max-w-xl rounded-md border border-accent/40 bg-bg px-3 py-2 shadow-[var(--shadow-volume)]">
        <p className="font-mono text-[10px] tracking-[0.16em] text-accent">ПРИКАЗ ДИСПЕТЧЕРА · ДЕРЖИМ, ПОКА НЕ СМЕНИТ</p>
        <p className="mt-1 text-sm font-medium">
          {side} · вход {entry} · стоп {stop} · цель {tp}
        </p>
      </div>
    </div>
  );
}

export function ChartStage({ children, className }: { children: ReactNode; className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={boxRef} className={cn("relative min-h-[220px] bg-bg", className)}>
      {children}
      <ChartHud boxRef={boxRef} />
    </div>
  );
}
