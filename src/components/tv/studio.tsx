import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { FundStrip } from "@/components/fund-strip";
import { NewsCrawl, NewsRail } from "@/components/tv/news-feed";
import { ChannelLogo, OnAirBug } from "@/components/tv/logo";
import { Stage } from "@/components/tv/stage";
import { Badge } from "@/components/ui/badge";
import { actionLabel } from "@/lib/advisor";
import { analyzeWithGrok } from "@/lib/ai/analyze";
import { useDeskStore } from "@/lib/desk-store";
import type { DailyDigest, DigestMarket } from "@/lib/digest";
import { fetchMarket } from "@/lib/market/fetch";
import type { NewsArticle } from "@/lib/news";
import { compactForAi, analyzeMarket } from "@/lib/smc/engine";
import { playSignal, scriptFor, speakRu, stopSpeech, unlockSound } from "@/lib/sound";
import { tradingViewSrc, tvPlaylist, type TvChannel } from "@/lib/tv-channels";
import { cn, formatPct, formatPrice } from "@/lib/utils";

const SLOT_MS = 28000;
const CHANNEL_MS = 160000;

function clockNow() {
  return new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function Studio({
  digest,
  news,
  channels = tvPlaylist(),
}: {
  digest: DailyDigest;
  news: NewsArticle[];
  channels?: TvChannel[];
}) {
  const soundOn = useDeskStore((s) => s.soundOn);
  const voiceOn = useDeskStore((s) => s.voiceOn);
  const setSoundOn = useDeskStore((s) => s.setSoundOn);
  const setVoiceOn = useDeskStore((s) => s.setVoiceOn);
  const [armed, setArmed] = useState(false);
  const [idx, setIdx] = useState(0);
  const [clock, setClock] = useState("");
  const [neural, setNeural] = useState(false);
  const [line, setLine] = useState("");
  const [shown, setShown] = useState("");
  const mix = channels.length ? channels : tvPlaylist();
  const liveStart = (() => {
    const live = mix.findIndex((c) => c.live);
    if (live >= 0) return live;
    const yt = mix.findIndex((c) => c.kind === "youtube");
    return yt >= 0 ? yt : 0;
  })();
  const [channelIdx, setChannelIdx] = useState(liveStart);
  const lockRef = useRef(0);
  const blockedRef = useRef(new Set<string>());
  const [skipNote, setSkipNote] = useState("");
  const channel = mix[channelIdx % mix.length] ?? mix[0]!;
  const nextOpen = (from: number) => {
    for (let n = 1; n <= mix.length; n++) {
      const j = (from + n) % mix.length;
      const c = mix[j]!;
      if (!blockedRef.current.has(c.id)) return j;
    }
    return Math.max(0, mix.findIndex((c) => c.kind === "reel"));
  };
  const nextChannel = mix[nextOpen(channelIdx)]!;
  const playlist = digest.markets;
  const current = playlist[idx % Math.max(playlist.length, 1)] as DigestMarket | undefined;
  const heard = useRef("");
  const armedRef = useRef(armed);
  const speakingRef = useRef(false);
  const channelRef = useRef(channel);
  armedRef.current = armed;
  channelRef.current = channel;

  useEffect(() => {
    setClock(clockNow());
    const clockT = window.setInterval(() => setClock(clockNow()), 1000);
    const mixT = window.setInterval(() => {
      if (speakingRef.current) return;
      if (Date.now() < lockRef.current) return;
      setChannelIdx((i) => nextOpen(i));
    }, CHANNEL_MS);
    return () => {
      window.clearInterval(clockT);
      window.clearInterval(mixT);
    };
  }, [mix.length]);

  useEffect(() => () => stopSpeech(), []);

  const tape = useQuery({
    queryKey: ["tv-tape", current?.spec.id],
    queryFn: () => fetchMarket({ data: { symbol: current!.spec.id, timeframe: "1h" } }),
    enabled: Boolean(current),
    staleTime: 20_000,
  });
  const snap = useMemo(() => {
    if (!tape.data?.candles?.length) return null;
    return analyzeMarket(tape.data.candles, tape.data.options, tape.data.trades);
  }, [tape.data]);
  const snapRef = useRef(snap);
  snapRef.current = snap;

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    const run = async () => {
      const story = current.story;
      const action = current.advice.action;
      let doing = story.doing;
      let waiting = story.waiting;
      let leadsTo = story.leadsTo;
      if (neural && snapRef.current) {
        try {
          const res = await analyzeWithGrok({
            data: {
              payload: {
                ...compactForAi(current.spec.id, "1h", snapRef.current),
                fundamentals: digest.fund.line,
              },
            },
          });
          if (res.ok && !cancelled) {
            doing = res.brief.doing || doing;
            waiting = res.brief.waiting || waiting;
            leadsTo = res.brief.leadsTo || leadsTo;
          }
        } catch {
          /* engine copy */
        }
      }
      const onAir = channelRef.current;
      const text = scriptFor({
        label: current.spec.label,
        action,
        doing,
        waiting,
        leadsTo,
        fund: digest.fund.line,
        channel: onAir.label,
        foreign: onAir.lang === "en",
      });
      if (cancelled) return;
      setLine(text);
      setShown(text);
      if (armedRef.current && soundOn && (action === "long" || action === "short")) {
        const key = `${current.spec.id}|${action}`;
        if (heard.current !== key) {
          heard.current = key;
          playSignal(action);
        }
      }
      speakingRef.current = onAir.kind !== "youtube";
      if (onAir.kind !== "youtube") lockRef.current = Date.now() + 90_000;
      if (armedRef.current && voiceOn && onAir.kind !== "youtube") await speakRu(text, { ident: onAir.lang === "en" });
      else await new Promise((r) => setTimeout(r, SLOT_MS));
      speakingRef.current = false;
      if (!cancelled) setIdx((i) => i + 1);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [idx, current?.spec.id, neural, voiceOn, soundOn]);

  useEffect(() => {
    setShown(line);
  }, [line]);

  if (!current) return null;
  const action = current.advice.action;
  const next = playlist[(idx + 1) % playlist.length];
  const tapeQuotes = playlist.map((m) => ({
    id: m.spec.id,
    label: m.spec.label,
    price: m.lastClose,
    changePct: m.changePct,
    decimals: m.spec.decimals,
  }));
  const ticker = [...tapeQuotes, ...tapeQuotes];

  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg">
      <img src="/art/strata.jpg" alt="" className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/55 to-bg/30" />

      <div className="pointer-events-none relative flex min-h-dvh flex-col">
        <header className="pointer-events-auto flex flex-wrap items-center gap-3 bg-bg/80 px-3 py-2 backdrop-blur-md sm:px-5">
          <Link to="/" className="shrink-0">
            <ChannelLogo compact />
            <span className="sr-only">SLOI 24</span>
          </Link>
          <span className="inline-flex items-center gap-2 rounded-sm bg-bear px-2 py-1 font-mono text-xs tracking-[0.16em] text-fg">
            <span className="on-air-dot size-1.5 rounded-full bg-fg" />
            ЭФИР
          </span>
          <span className="font-mono text-xs text-dim">{clock}</span>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {mix.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setChannelIdx(i);
                  lockRef.current = Date.now() + 60_000;
                }}
                className={cn(
                  "inline-flex h-11 shrink-0 items-center gap-1 rounded-sm px-3 font-mono text-xs",
                  c.id === channel.id ? "bg-subtle text-fg" : "text-muted hover:text-fg",
                )}
              >
                {c.live ? <span className="on-air-dot size-1.5 rounded-full bg-bear" /> : null}
                {c.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                unlockSound();
                setSoundOn(!soundOn);
              }}
              className="inline-flex size-11 items-center justify-center text-muted hover:text-fg"
              aria-label="Сигнал"
            >
              {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                unlockSound();
                setVoiceOn(!voiceOn);
                if (voiceOn) stopSpeech();
              }}
              className="inline-flex size-11 items-center justify-center text-muted hover:text-fg"
              aria-label="Голос"
            >
              {voiceOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
            </button>
            <button
              type="button"
              onClick={() => setNeural((v) => !v)}
              className={cn(
                "inline-flex h-11 items-center px-3 font-mono text-xs",
                neural ? "text-accent" : "text-muted",
              )}
            >
              Grok
            </button>
            <Link to="/desk" className="inline-flex h-11 items-center px-3 text-xs text-muted hover:text-fg">
              График
            </Link>
          </div>
        </header>

        <div className="relative min-h-0 flex-1 px-3 py-3 sm:px-5">
          <div className="grid h-full min-h-[28rem] gap-3 lg:grid-cols-[minmax(0,1.4fr)_280px]">
            <div className="flex min-h-0 flex-col gap-3">
              <div className="pointer-events-auto studio-bezel min-h-[22rem] flex-1 rounded-xl sm:min-h-[28rem]">
                <Stage
                  channel={channel}
                  symbolId={current.spec.id}
                  muted={!armed || !soundOn}
                  onEnded={() => {
                    lockRef.current = 0;
                    setChannelIdx((i) => nextOpen(i));
                  }}
                  onBlocked={() => {
                    blockedRef.current.add(channel.id);
                    setSkipNote(`${channel.label} недоступен · следующий`);
                    window.setTimeout(() => setSkipNote(""), 2500);
                    setChannelIdx((i) => nextOpen(i));
                  }}
                />
                <div className="absolute top-3 left-3 z-10 inline-flex max-w-[70%] items-center gap-2 rounded-sm bg-bg/70 px-2 py-1 font-mono text-[10px] tracking-[0.16em] backdrop-blur-sm">
                  <span className="on-air-dot size-1.5 rounded-full bg-bear" />
                  {channel.live ? "LIVE · " : ""}
                  {channel.label}
                  {channel.title ? ` · ${channel.title}` : ""} · далее {nextChannel.label}
                </div>
                <div className="absolute top-3 right-3 z-10 text-right">
                  <p className="font-mono text-xs tracking-[0.18em] text-accent">{current.spec.label}</p>
                  <p className="font-display text-3xl tabular-nums">
                    {formatPrice(current.lastClose, current.spec.decimals)}
                  </p>
                </div>
                <div className="absolute right-3 bottom-3 z-10 flex flex-col items-end gap-2">
                  {channel.kind === "youtube" && channel.lang === "ru" ? (
                    <span className="rounded-sm bg-accent px-2 py-1 font-mono text-[10px] tracking-[0.16em] text-accent-fg">
                      РУС · ЭФИР
                    </span>
                  ) : channel.foreign ? (
                    <span className="rounded-sm bg-accent px-2 py-1 font-mono text-[10px] tracking-[0.16em] text-accent-fg">
                      ЧУЖОЙ ЭФИР · НЕ СИГНАЛ
                    </span>
                  ) : channel.lang === "en" ? (
                    <span className="rounded-sm bg-accent px-2 py-1 font-mono text-[10px] tracking-[0.16em] text-accent-fg">
                      ПЕРЕВОД
                    </span>
                  ) : null}
                  <OnAirBug />
                </div>
                {skipNote ? (
                  <p className="absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 px-6 text-center font-mono text-sm text-muted">
                    {skipNote} · переключаю
                  </p>
                ) : null}
              </div>
              <div className="pointer-events-auto panel-volume rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs tracking-[0.18em] text-accent">ДИКТОР</span>
                  <span className="text-sm">{current.spec.label}</span>
                  <Badge tone={action === "long" ? "bull" : action === "short" ? "bear" : "warn"}>
                    {actionLabel(action)}
                  </Badge>
                  {digest.fund.halt.active ? (
                    <Badge tone="bear">стоп новость</Badge>
                  ) : null}
                  {current.wind ? (
                    <span className="font-mono text-xs text-dim">
                      макро {current.wind.kind === "tail" ? "попутный" : current.wind.kind === "head" ? "встречный" : "нейтральный"}
                    </span>
                  ) : null}
                  <span className="ml-auto font-mono text-xs text-dim">далее {next?.spec.label ?? "—"}</span>
                </div>
                <p className="mt-2 min-h-16 text-base leading-relaxed">
                  {shown || `${digest.fund.driver}. ${current.story.doing}`}
                  <span className="on-air-dot ml-0.5 inline-block h-4 w-px bg-accent align-[-2px]" />
                </p>
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-3">
              <div className="pointer-events-auto studio-bezel hidden h-44 rounded-xl lg:block">
                <iframe
                  key={current.spec.id}
                  src={tradingViewSrc(current.spec.id)}
                  title="TradingView"
                  className="absolute inset-0 size-full border-0"
                  allowFullScreen
                />
                <p className="absolute bottom-2 left-2 z-10 font-mono text-[10px] tracking-[0.14em] text-dim">
                  МОНИТОР · TRADINGVIEW
                </p>
              </div>
              <NewsRail news={news} />
              <FundStrip fund={digest.fund} />
            </div>
          </div>
        </div>

        <NewsCrawl news={news} />
        <div className="overflow-hidden border-t border-border bg-elevated/90">
          <div className="ticker-track flex w-max gap-8 py-2 pr-8 [animation:stratum-ticker_32s_linear_infinite]">
            {ticker.map((q, i) => (
              <div key={`${q.id}-${i}`} className="flex shrink-0 items-baseline gap-2 font-mono text-xs">
                <span className="text-dim">{q.label}</span>
                <span className="tabular-nums">{formatPrice(q.price, q.decimals)}</span>
                <span className={q.changePct >= 0 ? "text-bull" : "text-bear"}>{formatPct(q.changePct)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!armed ? (
        <button
          type="button"
          onClick={() => {
            unlockSound();
            setArmed(true);
            setSoundOn(true);
            setVoiceOn(true);
          }}
          className="btn-metal absolute bottom-28 left-1/2 z-20 inline-flex h-12 -translate-x-1/2 items-center rounded-sm px-6 text-sm font-medium text-accent-fg"
        >
          Включить звук диктора
        </button>
      ) : null}
    </div>
  );
}
