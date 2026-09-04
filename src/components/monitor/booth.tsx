import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Volume2, VolumeX } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { Spark } from "@/components/home/spark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchDigest, fetchTape } from "@/lib/market/fetch";
import { linesFromTick, type MonitorLine } from "@/lib/monitor-call";
import { speakRu, unlockSound } from "@/lib/sound";
import { cn, formatPrice } from "@/lib/utils";

export function MonitorBooth() {
  const q = useQuery({
    queryKey: ["monitor-digest"],
    queryFn: () => fetchDigest(),
    refetchInterval: 20_000,
    staleTime: 8_000,
  });
  const tape = useQuery({
    queryKey: ["monitor-tape"],
    queryFn: () => fetchTape(),
    refetchInterval: 12_000,
    staleTime: 4_000,
  });
  const markets = q.data?.digest.markets ?? [];
  const fund = q.data?.digest.fund;
  const tapeRows = tape.data?.rows ?? [];
  const [voice, setVoice] = useState(true);
  const [log, setLog] = useState<MonitorLine[]>([]);
  const prev = useRef(new Map<string, string>());
  const first = useRef(true);

  useEffect(() => {
    if (!markets.length && !tapeRows.length) return;
    const fresh = linesFromTick(markets, fund, tapeRows, prev.current, first.current);
    first.current = false;
    if (!fresh.length) return;
    setLog((old) => [...fresh, ...old].slice(0, 40));
    if (voice) {
      const top = fresh.find((l) => l.tone === "alert") ?? fresh[0];
      if (top) void speakRu(top.speak);
    }
  }, [q.dataUpdatedAt, tape.dataUpdatedAt, voice]);

  const tapeMap = new Map(tapeRows.map((r) => [r.id, r]));
  const gridIds = ["XAUUSD", ...tapeRows.map((r) => r.id), ...markets.map((m) => m.spec.id)].filter(
    (id, i, a) => a.indexOf(id) === i,
  ).slice(0, 12);

  return (
    <div className="min-h-dvh">
      <AppNav />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs tracking-[0.22em] text-accent">ЭФИР</p>
            <h1 className="mt-2 text-4xl font-medium tracking-tight">Монитор</h1>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Это не диспетчер. Эфир хода цены: мини-графики и комментарий, как на матче. Приказы — на странице Диспетчер.
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
          {gridIds.map((id) => {
            const m = markets.find((x) => x.spec.id === id);
            const t = tapeMap.get(id);
            const spark = t?.spark ?? m?.spark ?? [];
            const last = t?.last ?? m?.lastClose ?? 0;
            const prevPx = t?.prev ?? last;
            const chg = prevPx ? ((last - prevPx) / prevPx) * 100 : m?.changePct ?? 0;
            const up = chg >= 0;
            const decimals = t?.decimals ?? m?.spec.decimals ?? 2;
            const label = t?.label ?? m?.spec.label ?? id;
            return (
              <a key={id} href={`/desk?pair=${id}`} className="panel-volume rounded-xl p-4 no-underline">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{label}</p>
                  <Badge tone={chg >= 0 ? "bull" : "bear"}>{chg >= 0 ? "рост" : "спад"}</Badge>
                </div>
                <p className="mt-1 font-display text-2xl tabular-nums">{formatPrice(last, decimals)}</p>
                <p className={cn("text-xs", up ? "text-bull" : "text-bear")}>
                  {up ? "+" : ""}
                  {chg.toFixed(2)}% · 15м
                </p>
                <Spark values={spark} up={up} className="mt-2 h-14 w-full" />
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
