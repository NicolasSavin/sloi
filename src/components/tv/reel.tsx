import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function Reel({
  src,
  poster,
  className,
}: {
  src: string;
  poster?: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    const el = ref.current;
    if (!el) return;
    el.muted = true;
    const play = () => void el.play().catch(() => undefined);
    el.addEventListener("canplay", play);
    play();
    return () => el.removeEventListener("canplay", play);
  }, [src]);

  return (
    <>
      {poster ? (
        <img src={poster} alt="" className="absolute inset-0 size-full object-cover" />
      ) : null}
      {failed ? null : (
        <video
          ref={ref}
          key={src}
          src={src}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onError={() => setFailed(true)}
          className={cn("absolute inset-0 size-full object-cover", className)}
        />
      )}
    </>
  );
}
