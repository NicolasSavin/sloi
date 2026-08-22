import { useEffect, useRef } from "react";

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

  useEffect(() => {
    let player: YtPlayer | null = null;
    let gone = false;
    let playing = false;
    const fail = window.setTimeout(() => {
      if (!playing && !gone) blocked.current();
    }, 8000);

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
          mute: muted ? 1 : 0,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          controls: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (e: { target: YtPlayer }) => {
            if (muted) e.target.mute();
            else e.target.unMute();
            e.target.playVideo();
          },
          onStateChange: (e: { data: number }) => {
            if (e.data === 1) playing = true;
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

  return <div ref={host} className="absolute inset-0 z-[1] size-full" />;
}

export function videoIdFromSrc(src?: string) {
  return src?.match(/embed\/([a-zA-Z0-9_-]{11})/)?.[1] ?? "";
}
