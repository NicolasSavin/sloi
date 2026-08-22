import { useEffect, useState } from "react";
import { Reel } from "@/components/tv/reel";
import { YoutubePlayer, videoIdFromSrc } from "@/components/tv/youtube-player";
import { marketArt } from "@/lib/art";
import type { TvChannel } from "@/lib/tv-channels";
import { reelFor } from "@/lib/tv-reels";

export function Stage({
  channel,
  symbolId,
  onBlocked,
}: {
  channel: TvChannel;
  symbolId: string;
  onBlocked?: () => void;
}) {
  const poster = marketArt(symbolId);
  const reel = <Reel src={reelFor(symbolId)} poster={poster} />;
  const [dead, setDead] = useState(false);
  useEffect(() => setDead(false), [channel.id]);

  if (channel.kind !== "youtube" || dead) return reel;

  const id = videoIdFromSrc(channel.src) || channel.fallback || "";
  if (!id) return reel;

  return (
    <>
      {reel}
      <YoutubePlayer
        videoId={id}
        onBlocked={() => {
          setDead(true);
          onBlocked?.();
        }}
      />
    </>
  );
}
