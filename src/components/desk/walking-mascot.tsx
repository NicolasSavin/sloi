export function WalkingMascot({ kind }: { kind: "bull" | "bear" }) {
  const src = kind === "bull" ? "/mascot/walk-bull.gif?v=192" : "/mascot/walk-bear.gif?v=192";
  return (
    <img
      src={src}
      alt={kind === "bull" ? "бык-трейдер" : "медведь-трейдер"}
      width={176}
      height={176}
      className="h-44 w-44 object-contain"
      style={{ background: "transparent" }}
    />
  );
}
