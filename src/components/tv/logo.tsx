import { cn } from "@/lib/utils";

export function ChannelMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("shrink-0", className)} aria-hidden>
      <rect width="40" height="40" rx="4" fill="#0a0a0b" />
      <rect x="6" y="24" width="6" height="10" fill="#c9b896" />
      <rect x="14" y="16" width="6" height="18" fill="#e8dcc8" />
      <rect x="22" y="10" width="6" height="24" fill="#c9b896" />
      <rect x="30" y="19" width="5" height="15" fill="#8a7a62" />
    </svg>
  );
}

export function ChannelLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <ChannelMark className={compact ? "size-8" : "size-10"} />
      <span className="flex flex-col leading-none">
        <span className="font-mono text-[10px] tracking-[0.28em] text-accent">SLOI</span>
        <span className={cn("font-display tracking-tight", compact ? "text-xl" : "text-2xl")}>24</span>
      </span>
    </span>
  );
}

export function OnAirBug() {
  return (
    <div className="pointer-events-none inline-flex items-center gap-2 rounded-sm bg-bg/80 px-2 py-1 shadow-[var(--shadow-volume)] backdrop-blur-sm">
      <ChannelMark className="size-7" />
      <span className="flex flex-col leading-none">
        <span className="font-mono text-[9px] tracking-[0.22em] text-accent">SLOI</span>
        <span className="font-display text-lg leading-none">24</span>
      </span>
    </div>
  );
}
