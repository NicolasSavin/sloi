import { useEffect, useState } from "react";
import { ChannelLogo } from "@/components/tv/logo";
import { Reel } from "@/components/tv/reel";
import { YoutubePlayer, videoIdFromSrc } from "@/components/tv/youtube-player";
import { marketArt } from "@/lib/art";
import type { TvChannel } from "@/lib/tv-channels";
import { reelFor } from "@/lib/tv-reels";

function Bumper({ onEnded }: { onEnded?: () => void }) {
  const [clip, setClip] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => onEnded?.(), 8000);
    return () => window.clearTimeout(t);
  }, [onEnded]);

  return (
    <div className="absolute inset-0 bg-[#120f0c]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#3a2f22_0%,_#0c0a08_70%)]" />
      <img
        src="/art/tv/ident.jpg"
        alt=""
        className="absolute inset-0 size-full object-cover opacity-90"
        onError={(e) => {
          (e.target as HTMLImageElement).src = "/art/tv/ident-alt.jpg";
        }}
      />
      {clip ? (
        <video
          src="/reels/ident.mp4"
          autoPlay
          muted
          playsInline
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <video
          src="/reels/ident.mp4"
          muted
          playsInline
          preload="auto"
          onCanPlay={() => setClip(true)}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0c0a08]/50 via-transparent to-[#0c0a08]/30" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
        <ChannelLogo />
        <p className="font-mono text-xs tracking-[0.32em] text-[#d4b88c]">СЛОИ РЫНКА</p>
        <span className="on-air-dot size-2 rounded-full bg-bear" />
      </div>
    </div>
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
