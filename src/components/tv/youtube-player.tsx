import { useEffect } from "react";

export function YoutubePlayer({
  videoId,
  muted = true,
  onEnded,
}: {
  videoId: string;
  muted?: boolean;
  onBlocked?: () => void;
  onEnded?: () => void;
}) {
  useEffect(() => {
    const cap = window.setTimeout(() => onEnded?.(), 170000);
    return () => window.clearTimeout(cap);
  }, [videoId, onEnded]);

  const src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&rel=0&modestbranding=1&playsinline=1&controls=1`;

  return (
    <>
      <img
        src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
        alt=""
        className="absolute inset-0 z-[1] size-full object-cover"
      />
      <iframe
        title="Эфир"
        src={src}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 z-[2] size-full border-0"
      />
    </>
  );
}

export function videoIdFromSrc(src?: string) {
  return src?.match(/embed\/([a-zA-Z0-9_-]{11})/)?.[1] ?? "";
}
