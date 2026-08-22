import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function YoutubePlayer({
  videoId,
  muted = true,
  onBlocked,
  onEnded,
}: {
  videoId: string;
  muted?: boolean;
  onBlocked: () => void;
  onEnded?: () => void;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    const show = window.setTimeout(() => setReady(true), 900);
    const cap = window.setTimeout(() => onEnded?.(), 170000);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(cap);
    };
  }, [videoId, onEnded]);

  const src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=${muted ? 1 : 0}&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`;

  return (
    <>
      <img
        src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
        alt=""
        className="absolute inset-0 z-[1] size-full object-cover"
        onError={onBlocked}
      />
      <iframe
        title="Эфир"
        src={src}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        className={cn(
          "absolute inset-0 z-[2] size-full border-0 transition-opacity duration-700",
          ready ? "opacity-100" : "opacity-0",
        )}
      />
    </>
  );
}

export function videoIdFromSrc(src?: string) {
  return src?.match(/embed\/([a-zA-Z0-9_-]{11})/)?.[1] ?? "";
}
