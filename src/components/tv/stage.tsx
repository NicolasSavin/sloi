import { useEffect, useState } from "react";
import { ChannelLogo } from "@/components/tv/logo";
import { Reel } from "@/components/tv/reel";
import { YoutubePlayer, videoIdFromSrc } from "@/components/tv/youtube-player";
import { marketArt } from "@/lib/art";
import type { TvChannel } from "@/lib/tv-channels";
import { reelFor } from "@/lib/tv-reels";

function Bumper({ onEnded }: { onEnded?: () => void }) {
  return (
    <>
      <img src="/art/tv/ident.jpg" alt="" className="absolute inset-0 size-full object-cover" />
      <video
        src="/reels/ident.mp4"
        poster="/art/tv/ident-alt.jpg"
        autoPlay
        muted
        playsInline
        onEnded={() => onEnded?.()}
        className="absolute inset-0 size-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-bg/70 via-transparent to-bg/30" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
        <ChannelLogo />
        <p className="font-mono text-xs tracking-[0.28em] text-accent">СЛОИ РЫНКА</p>
      </div>
    </>
  );
}

export function Stage({
  channel,
  symbolId,
  muted = true,
  onBlocked,
  onEnded,
}: {
  channel: TvChannel;
  symbolId: string;
  muted?: boolean;
  onBlocked?: () => void;
  onEnded?: () => void;
}) {
  const poster = marketArt(symbolId);
  const reel = <Reel src={reelFor(symbolId)} poster={poster} />;
  const [dead, setDead] = useState(false);
  useEffect(() => setDead(false), [channel.id]);

  if (channel.kind === "bumper") return <Bumper onEnded={onEnded} />;
  if (channel.kind !== "youtube" || dead) return reel;

  const id = videoIdFromSrc(channel.src) || channel.fallback || "";
  if (!id) return reel;

  return (
    <>
      {reel}
      <YoutubePlayer
        videoId={id}
        muted={muted}
        onBlocked={() => {
          setDead(true);
          onBlocked?.();
        }}
        onEnded={onEnded}
      />
    </>
  );
}
