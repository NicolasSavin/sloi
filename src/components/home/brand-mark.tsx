import { BRAND } from "@/lib/brand";

export function BrandMark({ className }: { className?: string }) {
  return (
    <h1 className={className ? `brand-mark ${className}` : "brand-mark"} aria-label={BRAND}>
      <span className="brand-extrude" aria-hidden>
        {BRAND}
      </span>
      <span className="brand-shine">{BRAND}</span>
    </h1>
  );
}
