import { useEffect } from "react";

export function YoutubePlayer({
  src,
  videoId,
  muted = true,
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

  const id = videoId || "";
  const mute = muted ? 1 : 0;
  let url = src ?? "";
  if (!url && id) {
    url = `https://www.youtube.com/embed/${id}?autoplay=1&mute=${mute}&rel=0&playsinline=1&controls=1`;
  } else if (url) {
    url = url.replace(/mute=\d/, `mute=${mute}`);
    if (!url.includes("mute=")) url += (url.includes("?") ? "&" : "?") + `mute=${mute}`;
  }
  if (!url) return null;

  return (
    <iframe
      key={`${url}|${mute}`}
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
