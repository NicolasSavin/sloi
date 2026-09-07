export function WalkingMascot({ kind }: { kind: "bull" | "bear" }) {
  const src = kind === "bull" ? "/mascot/walk-bull.gif" : "/mascot/walk-bear.gif";
  return (
    <img
      src={src}
      alt=""
      width={176}
      height={176}
      className="h-44 w-44 object-contain"
      style={{ background: "transparent" }}
    />
  );
}
