import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, BookOpen, Cpu, Layers, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartPane } from "@/components/desk/chart-pane";
import { StoryBody } from "@/components/desk/story-panel";
import { AppNav } from "@/components/app-nav";
import { analyzeWithGrok, type AiBrief } from "@/lib/ai/analyze";
import { advise, actionLabel } from "@/lib/advisor";
import { FundStrip } from "@/components/fund-strip";
import { gateAdvice, windFor } from "@/lib/fundamentals";
import { fetchBroker, fetchDigest, fetchMarket } from "@/lib/market/fetch";
import { useDeskStore, type OverlayFlags } from "@/lib/desk-store";
import { loadJournal, saveJournal, type JournalEntry } from "@/lib/journal";
import type { MarketPayload } from "@/lib/market/types";
import { KIND_LABEL, SYMBOLS, TIMEFRAMES, getSymbol } from "@/lib/market/symbols";
import { sessionNow } from "@/lib/sessions";
import { playSignal, unlockSound } from "@/lib/sound";
import { analyzeMarket, compactForAi, type SmcSnapshot } from "@/lib/smc/engine";
import { cn, formatPct, formatPrice } from "@/lib/utils";

const OVERLAY_LABELS: { key: keyof OverlayFlags; label: string }[] = [
  { key: "fvg", label: "FVG" },
  { key: "ob", label: "OB" },
  { key: "liquidity", label: "Ликвидность" },
  { key: "margin", label: "Маржа" },
  { key: "patterns", label: "Паттерны" },
  { key: "flow", label: "Дельта" },
  { key: "profile", label: "Кластер" },
  { key: "divergences", label: "Дивергенции" },
  { key: "waves", label: "Волны" },
];

function biasTone(bias: string): "bull" | "bear" | "warn" {
  if (bias === "bullish") return "bull";
  if (bias === "bearish") return "bear";
  return "warn";
}

function biasLabel(bias: string) {
  if (bias === "bullish") return "Бычий";
  if (bias === "bearish") return "Медвежий";
  return "Диапазон";
}

function sourceLabel(source: string, staleSec?: number) {
  const age =
    staleSec == null
      ? ""
      : staleSec < 90
        ? " · сейчас"
        : staleSec < 3600
          ? ` · ${Math.round(staleSec / 60)} мин`
          : ` · ${Math.round(staleSec / 3600)} ч`;
  if (source === "demo") return "ДЕМО — биржа не ответила";
  if (source === "binance") return `Binance · живая лента${age}`;
  if (source === "bybit") return `Bybit · живые свечи${age}`;
  if (source === "yahoo") return `Yahoo · реальные котировки${age}`;
  return source;
}

export function DeskApp({ initialMarket }: { initialMarket?: MarketPayload }) {
  const symbol = useDeskStore((s) => s.symbol);
  const timeframe = useDeskStore((s) => s.timeframe);
  const autoAnalyze = useDeskStore((s) => s.autoAnalyze);
  const soundOn = useDeskStore((s) => s.soundOn);
  const overlays = useDeskStore((s) => s.overlays);
  const spreads = useDeskStore((s) => s.spreads);
  const setSymbol = useDeskStore((s) => s.setSymbol);
  const setTimeframe = useDeskStore((s) => s.setTimeframe);
  const setAutoAnalyze = useDeskStore((s) => s.setAutoAnalyze);
  const setSoundOn = useDeskStore((s) => s.setSoundOn);
  const toggleOverlay = useDeskStore((s) => s.toggleOverlay);

  const spec = getSymbol(symbol);
  const market = useQuery({
    queryKey: ["market", symbol, timeframe],
    queryFn: () => fetchMarket({ data: { symbol, timeframe } }),
    staleTime: 25_000,
    refetchInterval: 60_000,
    initialData:
      initialMarket &&
      symbol === initialMarket.symbol &&
      timeframe === initialMarket.timeframe
        ? initialMarket
        : undefined,
  });

  const snap = useMemo<SmcSnapshot | null>(() => {
    if (!market.data?.candles?.length) return null;
    return analyzeMarket(market.data.candles, market.data.options, market.data.trades);
  }, [market.data]);

  const [brief, setBrief] = useState<AiBrief | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const lastKey = `${symbol}|${timeframe}|${snap?.events.at(-1)?.time ?? 0}`;
  const lastSignal = useRef("");
  const digestQ = useQuery({
    queryKey: ["dispatch-digest"],
    queryFn: fetchDigest,
    staleTime: 60_000,
  });
  const bookQ = useQuery({
    queryKey: ["broker-book"],
    queryFn: fetchBroker,
    refetchInterval: 20_000,
    staleTime: 8_000,
  });
  const book = bookQ.data?.books.find((b) => b.id === spec.id) ?? null;
  const fund = digestQ.data?.digest.fund;
  const advice = useMemo(() => {
    if (!snap) return null;
    const raw = advise(snap, spec, spreads[spec.id] ?? spec.spread);
    return fund
      ? gateAdvice(raw, windFor(spec.id, fund), fund.halt, {
          id: spec.id,
          session: sessionNow(),
          entry: snap.localSetup.entry ?? undefined,
        })
      : raw;
  }, [snap, spec, spreads, fund]);

  useEffect(() => {
    if (!advice || !soundOn) return;
    const key = `${spec.id}|${advice.action}|${advice.title}`;
    if (!lastSignal.current) {
      lastSignal.current = key;
      return;
    }
    if (lastSignal.current === key) return;
    lastSignal.current = key;
    if (advice.action === "long" || advice.action === "short") {
      playSignal(advice.action);
      toast.message(`${spec.label}: ${actionLabel(advice.action)}`, { description: advice.title });
    }
  }, [advice, spec.id, spec.label, soundOn]);

  useEffect(() => {
    setJournal(loadJournal());
  }, []);

  async function runAi(force = false) {
    if (!snap) return;
    const cacheKey = `stratum-ai-v3:${lastKey}`;
    if (!force) {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          setBrief(JSON.parse(cached) as AiBrief);
          setAiError(null);
          return;
        }
      } catch {
        /* ignore */
      }
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await analyzeWithGrok({
        data: { payload: compactForAi(symbol, timeframe, snap) },
      });
      if (res.ok) {
        setBrief(res.brief);
        setAiModel(res.model);
        sessionStorage.setItem(cacheKey, JSON.stringify(res.brief));
      } else {
        setAiError(res.error);
      }
    } catch {
      setAiError("Не удалось связаться с нейросетью.");
    } finally {
      setAiLoading(false);
    }
  }

  useEffect(() => {
    setBrief(null);
    setAiError(null);
    setAiModel(null);
  }, [symbol, timeframe]);

  useEffect(() => {
    if (!autoAnalyze || !snap || aiLoading) return;
    const t = window.setTimeout(() => {
      void runAi(false);
    }, 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAnalyze, lastKey, snap]);

  function addToJournal() {
    if (!snap) return;
    const entry: JournalEntry = {
      id: `${Date.now()}`,
      at: Date.now(),
      symbol,
      timeframe,
      bias: brief?.bias ?? snap.bias,
      headline: brief?.headline ?? snap.story.now,
      note: brief?.means ?? snap.story.means,
    };
    const next = [entry, ...journal].slice(0, 40);
    setJournal(next);
    saveJournal(next);
    toast.success("Сетап записан в журнал");
  }

  const last = market.data?.candles.at(-1);

  return (
    <div className="flex min-h-dvh flex-col text-fg">
      <AppNav />
      <div className="flex items-center gap-3 overflow-x-auto border-b border-border px-3 py-2 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            {SYMBOLS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSymbol(s.id)}
                className={cn(
                  "h-11 shrink-0 rounded-sm px-3 text-xs font-medium transition-colors",
                  s.id === symbol ? "bg-subtle text-fg" : "text-muted hover:text-fg",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-md bg-subtle p-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.id}
                type="button"
                onClick={() => setTimeframe(tf.id)}
                className={cn(
                  "h-9 min-w-11 rounded-sm px-2.5 font-mono text-xs",
                  tf.id === timeframe ? "bg-elevated text-fg" : "text-muted",
                )}
              >
                {tf.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              unlockSound();
              setSoundOn(!soundOn);
            }}
            aria-label={soundOn ? "Звук сигналов выключить" : "Звук сигналов включить"}
          >
            {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => market.refetch()}
            aria-label="Обновить данные"
          >
            <RefreshCw className={cn("size-4", market.isFetching && "animate-spin")} />
          </Button>
      </div>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)_340px]">
        <aside className="hidden border-r border-border lg:block">
          <div className="px-4 py-4">
            <p className="text-xs font-medium tracking-wide text-dim">Рынки</p>
          </div>
          <nav className="px-2 pb-4">
            {(Object.keys(KIND_LABEL) as Array<keyof typeof KIND_LABEL>).map((kind) => {
              const rows = SYMBOLS.filter((s) => s.kind === kind);
              if (!rows.length) return null;
              return (
                <div key={kind} className="mb-3">
                  <p className="px-3 pb-1 font-mono text-[10px] tracking-[0.16em] text-dim">{KIND_LABEL[kind]}</p>
                  {rows.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSymbol(s.id)}
                      className={cn(
                        "flex h-11 w-full items-center justify-between rounded-sm px-3 text-left text-sm",
                        s.id === symbol ? "bg-subtle" : "hover:bg-subtle/60",
                      )}
                    >
                      <span>{s.label}</span>
                      {s.optionsYahoo ? (
                        <span className="font-mono text-[10px] text-accent">OI</span>
                      ) : (
                        <span className="font-mono text-[10px] uppercase text-dim">{s.kind}</span>
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>
          <Separator />
          <div className="px-4 py-4">
            <p className="mb-3 text-xs font-medium tracking-wide text-dim">Слои</p>
            <div className="space-y-2">
              {OVERLAY_LABELS.map((o) => (
                <label
                  key={o.key}
                  className="flex h-11 items-center justify-between gap-3 text-sm"
                >
                  <span>{o.label}</span>
                  <Switch
                    checked={overlays[o.key]}
                    onCheckedChange={() => toggleOverlay(o.key)}
                    aria-label={o.label}
                  />
                </label>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-medium tracking-tight">{spec.label}</h1>
                {snap ? (
                  <Badge tone={biasTone(snap.bias)}>{biasLabel(snap.bias)}</Badge>
                ) : null}
                {market.data ? (
                  <Badge tone={market.data.source === "demo" ? "bear" : "neutral"}>
                    {sourceLabel(market.data.source, market.data.staleSec)}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 font-mono text-2xl tabular-nums tracking-tight">
                {last ? formatPrice(last.close, spec.decimals) : "—"}
                {snap ? (
                  <span
                    className={cn(
                      "ml-3 text-sm",
                      snap.lastChangePct >= 0 ? "text-bull" : "text-bear",
                    )}
                  >
                    {formatPct(snap.lastChangePct)}
                  </span>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap gap-4 font-mono text-xs tabular-nums text-muted">
              {snap ? (
                <>
                  <span>EQ {formatPrice(snap.dealingRange.eq, spec.decimals)}</span>
                  <span>POC {formatPrice(snap.volumeProfile.poc, spec.decimals)}</span>
                  <span>ATR {formatPrice(snap.atr, spec.decimals)}</span>
                  <span>score {snap.score}</span>
                </>
              ) : null}
            </div>
          </div>

          {market.isLoading ? (
            <Skeleton className="m-4 min-h-[320px] flex-1 rounded-lg" />
          ) : market.error ? (
            <div className="m-4 rounded-lg bg-elevated p-6 text-sm text-muted">
              Не удалось загрузить рынок. Попробуйте обновить.
            </div>
          ) : (
            <>
              {snap ? <MarginBanner snap={snap} decimals={spec.decimals} /> : null}
              {snap?.wyckoff || snap?.patterns[0] ? <PatternBanner snap={snap} /> : null}
              {snap?.flow ? <FlowBanner snap={snap} /> : null}
              <BookBanner book={book} iceberg={snap?.flow.events.find((e) => e.kind === "absorption")?.therefore} />
              {snap?.clusters ? <ClusterBanner snap={snap} /> : null}
              <ChartPane
              candles={market.data?.candles ?? []}
              snap={snap}
              overlays={overlays}
              className="h-[220px] lg:h-auto lg:min-h-[420px] lg:flex-1"
            />
            </>
          )}

          <div className="border-t border-border px-4 py-4 lg:hidden">
            <AnalyzeBar
              autoAnalyze={autoAnalyze}
              setAutoAnalyze={setAutoAnalyze}
              onRun={() => void runAi(true)}
              onJournal={addToJournal}
              snapReady={Boolean(snap)}
              aiLoading={aiLoading}
              aiModel={aiModel}
            />
            <div className="mt-4">
              <StoryBody
                brief={brief}
                snap={snap}
                aiLoading={aiLoading}
                aiError={aiError}
                decimals={spec.decimals}
              />
            </div>
          </div>

          <div className="border-t border-border px-3 py-3 lg:hidden">
            <p className="mb-2 text-xs text-dim">Слои</p>
            <div className="flex flex-wrap gap-2">
              {OVERLAY_LABELS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => toggleOverlay(o.key)}
                  className={cn(
                    "h-11 rounded-full px-3 text-xs",
                    overlays[o.key] ? "bg-subtle text-fg" : "text-muted shadow-[var(--shadow-border)]",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <Tabs defaultValue="levels" className="border-t border-border">
            <div className="overflow-x-auto px-3 pt-3">
              <TabsList>
                <TabsTrigger value="levels">Уровни</TabsTrigger>
                <TabsTrigger value="journal">Журнал</TabsTrigger>
                <TabsTrigger value="layers" className="lg:hidden">
                  Слои
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="levels" className="px-4 py-4">
              <LevelsTable snap={snap} decimals={spec.decimals} />
            </TabsContent>
            <TabsContent value="journal" className="px-4 py-4">
              {journal.length === 0 ? (
                <p className="text-sm text-muted">Пока пусто. Сохраните сетап из панели анализа.</p>
              ) : (
                <ul className="space-y-3">
                  {journal.map((j) => (
                    <li key={j.id} className="rounded-md bg-elevated p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {j.symbol} · {j.timeframe}
                        </span>
                        <Badge tone={biasTone(j.bias)}>{biasLabel(j.bias)}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted">{j.headline}</p>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
            <TabsContent value="layers" className="px-4 py-4 lg:hidden">
              <ConfluenceList snap={snap} />
            </TabsContent>
          </Tabs>
        </section>

        <aside className="hidden flex-col border-l border-border lg:flex">
          <AnalyzeBar
            autoAnalyze={autoAnalyze}
            setAutoAnalyze={setAutoAnalyze}
            onRun={() => void runAi(true)}
            onJournal={addToJournal}
            snapReady={Boolean(snap)}
            aiLoading={aiLoading}
            aiModel={aiModel}
          />
          <ScrollArea className="mt-3 min-h-[280px] flex-1">
            <div className="space-y-4 px-4 pb-8">
              {fund ? <FundStrip fund={fund} /> : null}
              <StoryBody
                brief={brief}
                snap={snap}
                aiLoading={aiLoading}
                aiError={aiError}
                decimals={spec.decimals}
              />
              <Separator />
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Layers className="size-4 text-muted" />
                  Слои
                </div>
                <ConfluenceList snap={snap} />
              </div>
            </div>
          </ScrollArea>
        </aside>
      </div>

      <footer className="border-t border-border px-4 py-3 text-xs text-dim">
        <span className="inline-flex items-center gap-2">
          <Activity className="size-3.5" />
          Не инвестиционная рекомендация. Слои структуры, ежедневный разбор и советник со спредом.
        </span>
      </footer>
    </div>
  );
}

function ClusterBanner({ snap }: { snap: SmcSnapshot }) {
  const c = snap.clusters;
  const stack = c.stacked[0];
  return (
    <div className="mx-4 mt-2 rounded-lg bg-elevated/70 px-4 py-3">
      <p className="font-mono text-[10px] tracking-[0.18em] text-accent">
        КЛАСТЕР {c.source === "trades" ? "· ЛЕНТА СДЕЛОК" : "· ПРОФИЛЬ СВЕЧЕЙ"}
      </p>
      <p className="mt-1 text-sm font-medium">
        POC {c.poc.toFixed(2)}
        {stack ? ` · стек ${stack.side === "buy" ? "покупок" : "продаж"}` : ""}
        {c.unfinished ? ` · незакрытый ${c.unfinished === "high" ? "верх" : c.unfinished === "low" ? "низ" : "оба края"}` : ""}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{c.therefore}</p>
    </div>
  );
}

function BookBanner({
  book,
  iceberg,
}: {
  book: { bids: { price: number; volume: number }[]; asks: { price: number; volume: number }[]; iceberg: string | null } | null;
  iceberg?: string;
}) {
  return (
    <div className="mx-4 mt-2 rounded-lg bg-elevated/70 px-4 py-3">
      <p className="font-mono text-[10px] tracking-[0.18em] text-accent">СТАКАН · АЙСБЕРГ</p>
      {book && (book.bids.length || book.asks.length) ? (
        <>
          <div className="mt-2 grid grid-cols-2 gap-3 font-mono text-xs">
            <div>
              <p className="text-dim">ASK</p>
              {book.asks.slice(0, 5).map((l) => (
                <p key={`a${l.price}`} className="text-bear">
                  {l.price} · {l.volume}
                </p>
              ))}
            </div>
            <div>
              <p className="text-dim">BID</p>
              {book.bids.slice(0, 5).map((l) => (
                <p key={`b${l.price}`} className="text-bull">
                  {l.price} · {l.volume}
                </p>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            {book.iceberg ?? "Объёмы в стакане с вашего MT4. Толстый уровень — возможный айсберг."}
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Живой стакан MT4 не отдаёт (это MQL5). Айсберг — по свечам: {iceberg ?? "большой объём без хода, дельта около нуля."}
        </p>
      )}
    </div>
  );
}

function FlowBanner({ snap }: { snap: SmcSnapshot }) {
  const f = snap.flow;
  const ev = f.events[0];
  return (
    <div className="mx-4 mt-2 rounded-lg bg-elevated/70 px-4 py-3">
      <p className="font-mono text-[10px] tracking-[0.18em] text-accent">
        ОБЪЁМ · ДЕЛЬТА · CVD {f.source === "tape" ? "· ЛЕНТА" : "· ОЦЕНКА"}
      </p>
      <p className="mt-1 text-sm font-medium">
        дельта {f.lastDelta >= 0 ? "+" : ""}
        {Math.round(f.lastDelta)} · CVD {f.cvdSlope === "up" ? "растёт" : f.cvdSlope === "down" ? "падает" : "боковик"}
        {f.cvdDiv ? ` · дивергенция CVD ${f.cvdDiv.side === "bull" ? "бычья" : "медвежья"}` : ""}
        {ev ? ` · ${ev.kind === "hft-burst" ? "HFT" : ev.kind === "absorption" ? "поглощение" : ev.kind}` : ""}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {f.cvdDiv?.therefore ?? ev?.therefore ?? "Столбики объёма красятся дельтой. Линия снизу — кумулятивная дельта."}
      </p>
    </div>
  );
}

function PatternBanner({ snap }: { snap: SmcSnapshot }) {
  const p = snap.patterns[0];
  return (
    <div className="mx-4 mt-2 grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg bg-elevated/70 px-4 py-3">
        <p className="font-mono text-[10px] tracking-[0.18em] text-accent">ВАЙКОФФ</p>
        <p className="mt-1 text-sm font-medium">{snap.wyckoff.name}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">{snap.wyckoff.therefore}</p>
      </div>
      <div className="rounded-lg bg-elevated/70 px-4 py-3">
        <p className="font-mono text-[10px] tracking-[0.18em] text-accent">
          {p?.family === "harmonic" ? "ГАРМОНИКА" : "ПАТТЕРН"}
        </p>
        <p className="mt-1 text-sm font-medium">{p ? p.name : "чистой фигуры нет"}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">{p ? p.therefore : "Свинги не сложились в голову-плечи, двойную вершину или Gartley/Bat/ABCD."}</p>
      </div>
    </div>
  );
}

function MarginBanner({ snap, decimals }: { snap: SmcSnapshot; decimals: number }) {
  const band = snap.margin.where === "upper" ? snap.margin.upper : snap.margin.where === "lower" ? snap.margin.lower : null;
  return (
    <div
      className={cn(
        "mx-4 mt-3 rounded-lg px-4 py-3",
        band ? "panel-volume" : "bg-elevated/50",
      )}
    >
      <p className="font-mono text-[10px] tracking-[0.18em] text-accent">МАРЖИНАЛЬНЫЕ ЗОНЫ</p>
      {band ? (
        <>
          <p className="mt-1 text-sm font-medium">
            {band.name}: {formatPrice(band.bottom, decimals)}–{formatPrice(band.top, decimals)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{band.hint}</p>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted">
          Цена внутри диапазона. Верхняя маржа от {formatPrice(snap.margin.upper.bottom, decimals)}, нижняя до{" "}
          {formatPrice(snap.margin.lower.top, decimals)}.
        </p>
      )}
    </div>
  );
}

function AnalyzeBar({
  autoAnalyze,
  setAutoAnalyze,
  onRun,
  onJournal,
  snapReady,
  aiLoading,
  aiModel,
}: {
  autoAnalyze: boolean;
  setAutoAnalyze: (on: boolean) => void;
  onRun: () => void;
  onJournal: () => void;
  snapReady: boolean;
  aiLoading: boolean;
  aiModel: string | null;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Cpu className="size-4 text-muted" />
          <p className="text-sm font-medium">Разбор</p>
        </div>
        <div className="flex items-center gap-2" title="Если включено — Grok сам пишет разбор при смене пары или таймфрейма. Если выкл — только по кнопке.">
          <span className="text-xs text-dim">{autoAnalyze ? "нейросеть сама" : "по кнопке"}</span>
          <Switch
            checked={autoAnalyze}
            onCheckedChange={setAutoAnalyze}
            aria-label="Автоматический разбор нейросетью при смене пары"
          />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button className="flex-1" onClick={onRun} disabled={!snapReady || aiLoading}>
          {aiLoading ? "Считаю…" : "Разобрать нейросетью"}
        </Button>
        <Button variant="outline" onClick={onJournal} disabled={!snapReady} aria-label="В журнал">
          <BookOpen className="size-4" />
        </Button>
      </div>
      <p className="pt-3 text-xs text-dim">
        {aiModel
          ? `Ответ: ${aiModel}. Движок SMC считает уровни сам; модель только пересказывает.`
          : "Движок SMC считает уровни сам. Модель (Grok / Llama / Gemini) — по ключу в Vercel."}
        {autoAnalyze
          ? "Тумблер включён: при смене пары или таймфрейма Grok сам дописывает причину → следствие. Движок работает всегда."
          : "Тумблер выкл: слева всегда движок. Grok пишет текст только если нажать кнопку."}
      </p>
    </div>
  );
}

function ConfluenceList({ snap }: { snap: SmcSnapshot | null }) {
  if (!snap) return <p className="text-sm text-muted">Ждём данные.</p>;
  return (
    <ul className="space-y-2">
      {snap.confluence.map((c) => (
        <li key={c.id} className="rounded-md bg-elevated p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">{c.layer}</span>
            <Badge
              tone={c.status === "for" ? "bull" : c.status === "against" ? "bear" : "neutral"}
            >
              {c.status === "for" ? "за" : c.status === "against" ? "против" : "нейтр."}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted">{c.note}</p>
        </li>
      ))}
    </ul>
  );
}

function LevelsTable({ snap, decimals }: { snap: SmcSnapshot | null; decimals: number }) {
  if (!snap) return <p className="text-sm text-muted">Нет уровней.</p>;
  const rows = [
    { name: "Range high", price: snap.dealingRange.high },
    { name: "Маржа верх", price: snap.margin.upper.bottom },
    { name: "OTE high", price: snap.ote.high },
    { name: "Equilibrium", price: snap.dealingRange.eq },
    { name: "OTE low", price: snap.ote.low },
    { name: "Маржа низ", price: snap.margin.lower.top },
    { name: "Range low", price: snap.dealingRange.low },
    { name: "POC", price: snap.volumeProfile.poc },
    { name: "VAH", price: snap.volumeProfile.vah },
    { name: "VAL", price: snap.volumeProfile.val },
    ...snap.orderBlocks.slice(0, 4).map((z) => ({
      name: `OB ${z.side}`,
      price: (z.top + z.bottom) / 2,
    })),
    ...snap.fvgs.slice(0, 4).map((z) => ({
      name: `FVG ${z.side}`,
      price: (z.top + z.bottom) / 2,
    })),
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-dim">
          <tr>
            <th className="pb-2 font-medium">Уровень</th>
            <th className="pb-2 font-medium">Цена</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {rows.map((r) => (
            <tr key={r.name + r.price} className="border-t border-border">
              <td className="py-2 font-sans text-muted">{r.name}</td>
              <td className="py-2">{formatPrice(r.price, decimals)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
