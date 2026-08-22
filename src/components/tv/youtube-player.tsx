import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement, opts: Record<string, unknown>) => YtPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YtPlayer {
  mute: () => void;
  unMute: () => void;
  playVideo: () => void;
  destroy: () => void;
}

let api: Promise<void> | null = null;

function loadApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (!api) {
    api = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
      window.setTimeout(() => resolve(), 4000);
    });
  }
  return api;
}

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
  const host = useRef<HTMLDivElement>(null);
  const blocked = useRef(onBlocked);
  const ended = useRef(onEnded);
  blocked.current = onBlocked;
  ended.current = onEnded;
  const [on, setOn] = useState(false);

  useEffect(() => {
    let player: YtPlayer | null = null;
    let gone = false;
    let playing = false;
    setOn(false);
    const fail = window.setTimeout(() => {
      if (!playing && !gone) blocked.current();
    }, 10000);

    void loadApi().then(() => {
      if (gone || !host.current || !window.YT?.Player) {
        if (!gone) blocked.current();
        return;
      }
      player = new window.YT.Player(host.current, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          mute: 1,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          controls: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (e: { target: YtPlayer }) => {
            e.target.mute();
            e.target.playVideo();
            if (!muted) window.setTimeout(() => e.target.unMute(), 400);
          },
          onStateChange: (e: { data: number }) => {
            if (e.data === 1) {
              playing = true;
              setOn(true);
            }
            if (e.data === 0 && !gone) ended.current?.();
          },
          onError: () => {
            if (!gone) blocked.current();
          },
        },
      });
    });

    return () => {
      gone = true;
      window.clearTimeout(fail);
      try {
        player?.destroy();
      } catch {
        /* */
      }
    };
  }, [videoId, muted]);

  return (
    <div
      ref={host}
      className={cn("absolute inset-0 z-[1] size-full transition-opacity duration-500", on ? "opacity-100" : "opacity-0")}
    />
  );
}

export function videoIdFromSrc(src?: string) {
  return src?.match(/embed\/([a-zA-Z0-9_-]{11})/)?.[1] ?? "";
}
