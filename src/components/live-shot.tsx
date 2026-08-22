import { cn } from "@/lib/utils";

export function LiveShot({
  src,
  className,
  alt = "",
  beat = 0,
}: {
  src: string;
  className?: string;
  alt?: string;
  beat?: number;
}) {
  return (
    <span className={cn("shot-frame", className)}>
      <img src={src} alt={alt} className={cn("img-live", beat % 2 === 1 && "img-live-alt")} />
    </span>
  );
}
