import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Volume2, VolumeX } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { Spark } from "@/components/home/spark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { actionLabel, actionTone } from "@/lib/advisor";
import { fetchDigest } from "@/lib/market/fetch";
import { linesFromTick, type MonitorLine } from "@/lib/monitor-call";
import { speakRu, unlockSound } from "@/lib/sound";
import { cn, formatPrice } from "@/lib/utils";

export function MonitorBooth() {
  const q = useQuery({
    queryKey: ["monitor-digest"],
    queryFn: () => fetchDigest(),
    refetchInterval: 15_000,
    staleTime: 8_000,
  });
  const markets = q.data?.digest.markets ?? [];
  const fund = q.data?.digest.fund;
  const [voice, setVoice] = useState(true);
  const [log, setLog] = useState<MonitorLine[]>([]);
  const prev = useRef(new Map<string, string>());
  const first = useRef(true);

  useEffect(() => {
    if (!markets.length) return;
    const fresh = linesFromTick(markets, fund, prev.current, first.current);
    first.current = false;
    if (!fresh.length) return;
    setLog((old) => [...fresh, ...old].slice(0, 40));
    if (voice) {
      const top = fresh.find((l) => l.tone === "alert") ?? fresh[0];
      if (top) void speakRu(top.speak);
    }
  }, [q.dataUpdatedAt, voice]);

  const live = markets.filter((m) => m.advice.action === "long" || m.advice.action === "short");
  const grid = [...live, ...markets.filter((m) => m.advice.action !== "long" && m.advice.action !== "short")].slice(0, 12);

  return (
    <div className="min-h-dvh">
      <AppNav />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs tracking-[0.22em] text-accent">ЭФИР</p>
            <h1 className="mt-2 text-4xl font-medium tracking-tight">Монитор</h1>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Мини-графики со стола и комментарий как на спортивной трансляции. Обновление каждые 15 секунд.
            </p>
          </div>
          <Button
            variant={voice ? "default" : "outline"}
            onClick={() => {
              unlockSound();
              setVoice((v) => !v);
            }}
          >
            {voice ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            {voice ? "Голос включён" : "Голос выкл"}
          </Button>
        </div>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {grid.map((m) => {
            const spark = m.spark ?? [];
            const up = m.changePct >= 0;
            return (
              <a
                key={m.spec.id}
                href={`/desk?pair=${m.spec.id}`}
                className="panel-volume rounded-xl p-4 no-underline"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{m.spec.label}</p>
                  <Badge tone={actionTone(m.advice.action)}>{actionLabel(m.advice.action)}</Badge>
                </div>
                <p className="mt-1 font-display text-2xl tabular-nums">{formatPrice(m.lastClose, m.spec.decimals)}</p>
                <p className={cn("text-xs", up ? "text-bull" : "text-bear")}>
                  {up ? "+" : ""}
                  {m.changePct.toFixed(2)}%
                </p>
                <Spark values={spark} up={up} className="mt-2 h-14 w-full" />
                <p className="mt-2 line-clamp-2 text-xs text-muted">{m.advice.title}</p>
              </a>
            );
          })}
        </section>

        <section className="mt-8 panel-volume rounded-xl p-5">
          <p className="font-mono text-xs tracking-[0.18em] text-accent">КОММЕНТАРИЙ</p>
          <div className="mt-4 max-h-[420px] space-y-3 overflow-auto">
            {log.length === 0 ? (
              <p className="text-sm text-muted">Ждём первый кадр стола…</p>
            ) : (
              log.map((line) => (
                <p
                  key={line.id}
                  className={cn(
                    "text-sm leading-relaxed",
                    line.tone === "bull" && "text-bull",
                    line.tone === "bear" && "text-bear",
                    line.tone === "alert" && "text-accent",
                    line.tone === "neutral" && "text-muted",
                  )}
                >
                  {line.text}
                </p>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
