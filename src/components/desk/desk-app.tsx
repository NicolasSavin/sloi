import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Layers, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartPane } from "@/components/desk/chart-pane";
import { ChatDock } from "@/components/desk/chat-dock";
import { AnalyzeBar, BookBanner, ClusterBanner, ConfluenceList, FlowBanner, LevelsTable, MarginBanner, PatternBanner } from "@/components/desk/desk-banners";
import { EtherCard, StoryBody } from "@/components/desk/story-panel";
import { AppNav } from "@/components/app-nav";
import { analyzeWithGrok, type AiBrief } from "@/lib/ai/analyze";
import { advise, actionLabel } from "@/lib/advisor";
import { FundStrip } from "@/components/fund-strip";
import { gateAdvice, windFor } from "@/lib/fundamentals";
import { fetchBroker, fetchDigest, fetchMarket, fetchTvGuide } from "@/lib/market/fetch";
import { useDeskStore, type OverlayFlags } from "@/lib/desk-store";
import { loadJournal, saveJournal, type JournalEntry } from "@/lib/journal";
import type { MarketPayload } from "@/lib/market/types";
import { KIND_LABEL, SYMBOLS, TIMEFRAMES, getSymbol } from "@/lib/market/symbols";
import { sessionNow } from "@/lib/sessions";
import { playSignal, unlockSound } from "@/lib/sound";
import { analyzeMarket, compactForAi, type SmcSnapshot } from "@/lib/smc/engine";
import { makeTvBrief } from "@/lib/tv-brief";
import { cn, formatPct, formatPrice } from "@/lib/utils";

const OVERLAY_LABELS: { key: keyof OverlayFlags; label: string }[] = [
  { key: "fvg", label: "FVG" }, { key: "ob", label: "OB" }, { key: "liquidity", label: "Ликвидность" },
  { key: "margin", label: "Маржа" }, { key: "patterns", label: "Паттерны" }, { key: "flow", label: "Дельта / футпринт" },
  { key: "profile", label: "Профиль / VWAP" }, { key: "divergences", label: "Дивергенции" }, { key: "waves", label: "Волны" },
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
  const age = staleSec == null ? "" : staleSec < 90 ? " · сейчас" : staleSec < 3600 ? ` · ${Math.round(staleSec / 60)} мин` : ` · ${Math.round(staleSec / 3600)} ч`;
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
    initialData: initialMarket && symbol === initialMarket.symbol && timeframe === initialMarket.timeframe ? initialMarket : undefined,
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
  const digestQ = useQuery({ queryKey: ["dispatch-digest"], queryFn: fetchDigest, staleTime: 60_000 });
  const tvQ = useQuery({ queryKey: ["tv-guide"], queryFn: fetchTvGuide, staleTime: 120_000 });
  const bookQ = useQuery({ queryKey: ["broker-book"], queryFn: fetchBroker, refetchInterval: 20_000, staleTime: 8_000 });
  const book = bookQ.data?.books.find((b) => b.id === spec.id) ?? null;
  const fund = digestQ.data?.digest.fund;
  const ether = makeTvBrief(tvQ.data ?? [], [fund?.driver ?? "", fund?.line ?? "", ...(fund?.themes ?? [])].filter(Boolean));
  const advice = useMemo(() => {
    if (!snap) return null;
    const raw = advise(snap, spec, spreads[spec.id] ?? spec.spread);
    return fund ? gateAdvice(raw, windFor(spec.id, fund), fund.halt, { id: spec.id, session: sessionNow(), entry: snap.localSetup.entry ?? undefined }) : raw;
  }, [snap, spec, spreads, fund]);
  useEffect(() => {
    if (!advice || !soundOn) return;
    const key = `${spec.id}|${advice.action}|${advice.title}`;
    if (!lastSignal.current) { lastSignal.current = key; return; }
    if (lastSignal.current === key) return;
    lastSignal.current = key;
    if (advice.action === "long" || advice.action === "short") {
      playSignal(advice.action);
      toast.message(`${spec.label}: ${actionLabel(advice.action)}`, { description: advice.title });
    }
  }, [advice, spec.id, spec.label, soundOn]);
  useEffect(() => { setJournal(loadJournal()); }, []);
  async function runAi(force = false) {
    if (!snap) return;
    const cacheKey = `stratum-ai-v3:${lastKey}`;
    if (!force) {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) { setBrief(JSON.parse(cached) as AiBrief); setAiError(null); return; }
      } catch { /* ignore */ }
    }
    setAiLoading(true); setAiError(null);
    try {
      const res = await analyzeWithGrok({ data: { payload: { ...compactForAi(symbol, timeframe, snap), ether, etherNote: "справка эфира, не приказ" } } });
      if (res.ok) { setBrief(res.brief); setAiModel(res.model); sessionStorage.setItem(cacheKey, JSON.stringify(res.brief)); }
      else setAiError(res.error);
    } catch { setAiError("Не удалось связаться с нейросетью."); }
    finally { setAiLoading(false); }
  }
  useEffect(() => { setBrief(null); setAiError(null); setAiModel(null); }, [symbol, timeframe]);
  useEffect(() => {
    if (!autoAnalyze || !snap || aiLoading) return;
    const t = window.setTimeout(() => { void runAi(false); }, 500);
    return () => window.clearTimeout(t);
  }, [autoAnalyze, lastKey, snap]);
  function addToJournal() {
    if (!snap) return;
    const entry: JournalEntry = { id: `${Date.now()}`, at: Date.now(), symbol, timeframe, bias: brief?.bias ?? snap.bias, headline: brief?.headline ?? snap.story.now, note: brief?.means ?? snap.story.means };
    const next = [entry, ...journal].slice(0, 40);
    setJournal(next); saveJournal(next); toast.success("Сетап записан в журнал");
  }
  const last = market.data?.candles.at(-1);
  return (
    <div className="flex min-h-dvh flex-col text-fg">
      <AppNav />
      <div className="flex items-center gap-3 overflow-x-auto border-b border-border px-3 py-2 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
          {SYMBOLS.map((s) => (
            <button key={s.id} type="button" onClick={() => setSymbol(s.id)} className={cn("h-11 shrink-0 rounded-sm px-3 text-xs font-medium", s.id === symbol ? "bg-subtle text-fg" : "text-muted hover:text-fg")}>{s.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-md bg-subtle p-1">
          {TIMEFRAMES.map((tf) => (
            <button key={tf.id} type="button" onClick={() => setTimeframe(tf.id)} className={cn("h-9 min-w-11 rounded-sm px-2.5 font-mono text-xs", tf.id === timeframe ? "bg-elevated text-fg" : "text-muted")}>{tf.label}</button>
          ))}
        </div>
        <Button variant="outline" size="icon" onClick={() => { unlockSound(); setSoundOn(!soundOn); }} aria-label="Звук">{soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}</Button>
        <Button variant="outline" size="icon" onClick={() => market.refetch()} aria-label="Обновить"><RefreshCw className={cn("size-4", market.isFetching && "animate-spin")} /></Button>
      </div>
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)_340px]">
        <aside className="hidden border-r border-border lg:block">
          <div className="px-4 py-4"><p className="text-xs font-medium tracking-wide text-dim">Рынки</p></div>
          <nav className="px-2 pb-4">
            {(Object.keys(KIND_LABEL) as Array<keyof typeof KIND_LABEL>).map((kind) => {
              const rows = SYMBOLS.filter((s) => s.kind === kind);
              if (!rows.length) return null;
              return (
                <div key={kind} className="mb-3">
                  <p className="px-3 pb-1 font-mono text-[10px] tracking-[0.16em] text-dim">{KIND_LABEL[kind]}</p>
                  {rows.map((s) => (
                    <button key={s.id} type="button" onClick={() => setSymbol(s.id)} className={cn("flex h-11 w-full items-center justify-between rounded-sm px-3 text-left text-sm", s.id === symbol ? "bg-subtle" : "hover:bg-subtle/60")}>
                      <span>{s.label}</span>
                      <span className="font-mono text-[10px] text-dim">{s.optionsYahoo ? "OI" : s.kind}</span>
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
                <label key={o.key} className="flex h-11 items-center justify-between gap-3 text-sm">
                  <span>{o.label}</span>
                  <Switch checked={overlays[o.key]} onCheckedChange={() => toggleOverlay(o.key)} aria-label={o.label} />
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
                {snap ? <Badge tone={biasTone(snap.bias)}>{biasLabel(snap.bias)}</Badge> : null}
                {market.data ? <Badge tone={market.data.source === "demo" ? "bear" : "neutral"}>{sourceLabel(market.data.source, market.data.staleSec)}</Badge> : null}
              </div>
              <p className="mt-1 font-mono text-2xl tabular-nums tracking-tight">
                {last ? formatPrice(last.close, spec.decimals) : "—"}
                {snap ? <span className={cn("ml-3 text-sm", snap.lastChangePct >= 0 ? "text-bull" : "text-bear")}>{formatPct(snap.lastChangePct)}</span> : null}
              </p>
            </div>
          </div>
          {market.isLoading ? (
            <Skeleton className="m-4 min-h-[320px] flex-1 rounded-lg" />
          ) : market.error ? (
            <div className="m-4 rounded-lg bg-elevated p-6 text-sm text-muted">Не удалось загрузить рынок.</div>
          ) : (
            <>
              {snap ? <MarginBanner snap={snap} decimals={spec.decimals} /> : null}
              {snap?.wyckoff || snap?.patterns[0] ? <PatternBanner snap={snap} /> : null}
              {snap?.flow ? <FlowBanner snap={snap} /> : null}
              <BookBanner book={book} iceberg={snap?.flow.events.find((e) => e.kind === "absorption")?.therefore} />
              {snap?.clusters ? <ClusterBanner snap={snap} /> : null}
              <ChartPane candles={market.data?.candles ?? []} snap={snap} overlays={overlays} book={book} className="h-[220px] lg:h-auto lg:min-h-[420px] lg:flex-1" />
              <div className="px-4 pt-3"><EtherCard ether={ether} /></div>
              <div className="px-4 pb-4 pt-3"><ChatDock /></div>
            </>
          )}
          <div className="border-t border-border px-4 py-4 lg:hidden">
            <AnalyzeBar autoAnalyze={autoAnalyze} setAutoAnalyze={setAutoAnalyze} onRun={() => void runAi(true)} onJournal={addToJournal} snapReady={Boolean(snap)} aiLoading={aiLoading} aiModel={aiModel} />
            <div className="mt-4"><StoryBody brief={brief} snap={snap} aiLoading={aiLoading} aiError={aiError} decimals={spec.decimals} options={market.data?.options} ether={ether} /></div>
          </div>
          <Tabs defaultValue="levels" className="border-t border-border">
            <div className="overflow-x-auto px-3 pt-3">
              <TabsList>
                <TabsTrigger value="levels">Уровни</TabsTrigger>
                <TabsTrigger value="journal">Журнал</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="levels" className="px-4 py-4"><LevelsTable snap={snap} decimals={spec.decimals} /></TabsContent>
            <TabsContent value="journal" className="px-4 py-4">
              {journal.length === 0 ? <p className="text-sm text-muted">Пока пусто.</p> : (
                <ul className="space-y-3">{journal.map((j) => (
                  <li key={j.id} className="rounded-md bg-elevated p-3"><span className="text-sm font-medium">{j.symbol} · {j.timeframe}</span><p className="mt-1 text-sm text-muted">{j.headline}</p></li>
                ))}</ul>
              )}
            </TabsContent>
          </Tabs>
        </section>
        <aside className="hidden flex-col border-l border-border lg:flex">
          <AnalyzeBar autoAnalyze={autoAnalyze} setAutoAnalyze={setAutoAnalyze} onRun={() => void runAi(true)} onJournal={addToJournal} snapReady={Boolean(snap)} aiLoading={aiLoading} aiModel={aiModel} />
          <ScrollArea className="mt-3 min-h-[280px] flex-1">
            <div className="space-y-4 px-4 pb-8">
              {fund ? <FundStrip fund={fund} /> : null}
              <StoryBody brief={brief} snap={snap} aiLoading={aiLoading} aiError={aiError} decimals={spec.decimals} options={market.data?.options} ether={ether} />
              <Separator />
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Layers className="size-4 text-muted" /> Слои</div>
                <ConfluenceList snap={snap} />
              </div>
            </div>
          </ScrollArea>
        </aside>
      </div>
      <footer className="border-t border-border px-4 py-3 text-xs text-dim">
        <span className="inline-flex items-center gap-2"><Activity className="size-3.5" /> Не инвестиционная рекомендация.</span>
      </footer>
    </div>
  );
}
