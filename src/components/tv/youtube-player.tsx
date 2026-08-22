import { useEffect } from "react";

export function YoutubePlayer({
  src,
  videoId,
  onEnded,
}: {
  src?: string;
  videoId?: string;
  muted?: boolean;
  onBlocked?: () => void;
  onEnded?: () => void;
}) {
  useEffect(() => {
    const cap = window.setTimeout(() => onEnded?.(), 3_600_000);
    return () => window.clearTimeout(cap);
  }, [src, videoId, onEnded]);

  const url =
    src ??
    (videoId
      ? `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&rel=0&playsinline=1&controls=1`
      : "");
  if (!url) return null;

  return (
    <iframe
      title="Эфир"
      src={url}
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
      className="absolute inset-0 z-[2] size-full border-0"
    />
  );
}

export function videoIdFromSrc(src?: string) {
  return src?.match(/embed\/([a-zA-Z0-9_-]{11})/)?.[1] ?? "";
}
