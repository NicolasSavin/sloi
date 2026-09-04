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
import { ChartStage, OrderHud } from "@/components/desk/chart-hud";
import { ChatDock } from "@/components/desk/chat-dock";
import { AccountBanner, AnalyzeBar, AuctionBanner, BookBanner, ClusterBanner, ChochBanner, ConfluenceList, FlowBanner, LevelsTable, MarginBanner, PatternBanner } from "@/components/desk/desk-banners";
import { EtherCard, StoryBody } from "@/components/desk/story-panel";
import { AppNav } from "@/components/app-nav";
import { analyzeWithGrok, type AiBrief } from "@/lib/ai/analyze";
import { actionLabel, actionTone } from "@/lib/advisor";
import { FundStrip } from "@/components/fund-strip";
import { fetchBroker, fetchDigest, fetchMarket, fetchTvGuide } from "@/lib/market/fetch";
import { useDeskStore, type OverlayFlags } from "@/lib/desk-store";
import { loadJournal, saveJournal, type JournalEntry } from "@/lib/journal";
import type { MarketPayload } from "@/lib/market/types";
import { KIND_LABEL, SYMBOLS, TIMEFRAMES, getSymbol } from "@/lib/market/symbols";
import { readDeskKey } from "@/lib/desk-key";
import { playSignal, unlockSound } from "@/lib/sound";
import { analyzeMarket, compactForAi, type SmcSnapshot } from "@/lib/smc/engine";
import { makeTvBrief } from "@/lib/tv-brief";
import { cn, formatPct, formatPrice } from "@/lib/utils";

const OVERLAY_LABELS: { key: keyof OverlayFlags; label: string }[] = [
  { key: "structure", label: "BOS / CHoCH" },
  { key: "fvg", label: "Имбаланс" },
  { key: "ob", label: "Ордерблок" },
  { key: "liquidity", label: "Ликвидность" },
  { key: "margin", label: "Маржа" },
  { key: "patterns", label: "Паттерны" },
  { key: "flow", label: "Дельта / футпринт" },
  { key: "profile", label: "Профиль / VWAP" },
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
  const chochLen = useDeskStore((s) => s.chochLen);
  const chochClose = useDeskStore((s) => s.chochClose);
  const spreads = useDeskStore((s) => s.spreads);
  const setSymbol = useDeskStore((s) => s.setSymbol);
  const setTimeframe = useDeskStore((s) => s.setTimeframe);
  const setAutoAnalyze = useDeskStore((s) => s.setAutoAnalyze);
  const setSoundOn = useDeskStore((s) => s.setSoundOn);
  const toggleOverlay = useDeskStore((s) => s.toggleOverlay);
  const setChochLen = useDeskStore((s) => s.setChochLen);
  const setChochClose = useDeskStore((s) => s.setChochClose);
  const [deskKey, setDeskKey] = useState("");
  useEffect(() => { setDeskKey(readDeskKey()); }, []);
  const spec = getSymbol(symbol);
  const market = useQuery({
    queryKey: ["market", symbol, timeframe],
    queryFn: () => fetchMarket({ data: { symbol, timeframe } }),
    staleTime: 25_000,
    refetchInterval: 60_000,
    initialData: initialMarket && symbol === initialMarket.symbol && timeframe === initialMarket.timeframe ? initialMarket : undefined,
  });
  const lastSignal = useRef("");
  const digestQ = useQuery({ queryKey: ["dispatch-digest"], queryFn: fetchDigest, staleTime: 60_000 });
  const fund = digestQ.data?.digest.fund;
  const snap = useMemo<SmcSnapshot | null>(() => {
    if (!market.data?.candles?.length) return null;
    return analyzeMarket(market.data.candles, market.data.options, market.data.trades, {
      swing: chochLen,
      chochClose,
      symbol: spec.id,
      kind: spec.kind,
      dxyChange: fund?.dollar === "bid" ? 0.4 : fund?.dollar === "offered" ? -0.4 : 0,
      yieldChange: fund?.yieldChange,
      oilChange: fund?.oilChange,
      halt: fund?.halt,
    });
  }, [market.data, chochLen, chochClose, spec.id, spec.kind, fund]);
  const [brief, setBrief] = useState<AiBrief | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const lastKey = `${symbol}|${timeframe}|${snap?.events.at(-1)?.time ?? 0}`;
  const tvQ = useQuery({ queryKey: ["tv-guide"], queryFn: fetchTvGuide, staleTime: 120_000 });
  const bookQ = useQuery({
    queryKey: ["broker-book", deskKey],
    queryFn: () => fetchBroker({ data: { key: deskKey } }),
    refetchInterval: 20_000,
    staleTime: 8_000,
  });
  const book = bookQ.data?.books.find((b) => b.id === spec.id) ?? null;
  const ether = makeTvBrief(tvQ.data ?? [], [fund?.driver ?? "", fund?.line ?? "", ...(fund?.themes ?? [])].filter(Boolean));
  const deskMarket = digestQ.data?.digest.markets.find((m) => m.spec.id === spec.id);
  const construction = deskMarket?.construction ?? null;
  const order = deskMarket?.advice ?? null;
  const advice = order;
  useEffect(() => {
    if (!advice || !soundOn) return;
    const key = `${spec.id}|${advice.action}|${advice.title}`;
    if (!lastSignal.current) { lastSignal.current = key; return; }
    if (lastSignal.current === key) return;
    lastSignal.current = key;
    if (advice.action === "long" || advice.action === "short") {
      playSignal(advice.action);
      toast.message(`Диспетчер · ${spec.label}: ${actionLabel(advice.action)}`, { description: advice.title });
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
        <a href={`/ideas?pair=${spec.id}`} className="hidden h-11 shrink-0 items-center rounded-sm px-3 text-xs text-accent sm:inline-flex">TradingView</a>
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
            <p className="mt-5 mb-2 text-xs font-medium tracking-wide text-dim">CHoCH</p>
            <p className="mb-2 text-[11px] leading-relaxed text-muted">
              Свинг: сколько баров слева и справа должно быть слабее точки. Закрытие — тень за экстремум не считается сменой.
            </p>
            <div className="mb-3 flex gap-1">
              {([2, 3, 4] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setChochLen(n)}
                  className={cn(
                    "h-9 flex-1 rounded-sm text-xs",
                    chochLen === n ? "bg-subtle text-fg" : "text-muted hover:bg-subtle/60",
                  )}
                >
                  {n === 2 ? "мягко" : n === 4 ? "жёстко" : "норма"}
                </button>
              ))}
            </div>
            <label className="flex h-11 items-center justify-between gap-3 text-sm">
              <span>Только закрытие</span>
              <Switch checked={chochClose} onCheckedChange={setChochClose} aria-label="CHoCH только закрытием" />
            </label>
          </div>
        </aside>
        <section className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-medium tracking-tight">{spec.label}</h1>
                {snap ? <Badge tone={biasTone(snap.bias)}>карта {biasLabel(snap.bias)}</Badge> : null}
                {order ? <Badge tone={actionTone(order.action)}>приказ {actionLabel(order.action)}</Badge> : null}
                {market.data ? <Badge tone={market.data.source === "demo" ? "bear" : "neutral"}>{sourceLabel(market.data.source, market.data.staleSec)}</Badge> : null}
              </div>
              <p className="mt-1 font-mono text-2xl tabular-nums tracking-tight">
                {last ? formatPrice(last.close, spec.decimals) : "—"}
                {snap ? <span className={cn("ml-3 text-sm", snap.lastChangePct >= 0 ? "text-bull" : "text-bear")}>{formatPct(snap.lastChangePct)}</span> : null}
              </p>
            </div>
          </div>
          <div className="mx-4 mt-2 rounded-lg bg-elevated px-4 py-3">
            <p className="font-mono text-[10px] tracking-[0.18em] text-accent">
              {order?.action === "long" || order?.action === "short"
                ? "ПРИКАЗ ДИСПЕТЧЕРА · ДЕРЖИМ, ПОКА НЕ СМЕНИТ"
                : "ПРИКАЗ ДИСПЕТЧЕРА"}
            </p>
            <p className="mt-1 text-sm font-medium">
              {digestQ.isLoading
                ? "гружу стол…"
                : order
                  ? actionLabel(order.action)
                  : "лента ещё не пришла"}
              {(order?.action === "long" || order?.action === "short") && deskMarket?.setup.entry != null
                ? ` · вход ${formatPrice(deskMarket.setup.entry, spec.decimals)}`
                : order && order.action !== "long" && order.action !== "short"
                  ? " · зоны на графике — карта, не ордер"
                  : ""}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {order?.therefore || order?.title || "Карта графика — не приказ. Ждём строку диспетчера."}
            </p>
          </div>
          {market.isLoading ? (
            <Skeleton className="m-4 h-[220px] rounded-lg lg:h-[320px]" />
          ) : market.error ? (
            <div className="m-4 rounded-lg bg-elevated p-6 text-sm text-muted">Не удалось загрузить рынок.</div>
          ) : (
            <>
              <AccountBanner account={bookQ.data?.account} focus={spec.id} />
              {snap ? <ChochBanner snap={snap} len={chochLen} closeOnly={chochClose} /> : null}
              {snap ? <MarginBanner snap={snap} decimals={spec.decimals} /> : null}
              {snap?.wyckoff || snap?.patterns[0] ? <PatternBanner snap={snap} /> : null}
              {snap ? <AuctionBanner snap={snap} /> : null}
              {snap?.flow ? <FlowBanner snap={snap} /> : null}
              <BookBanner book={book} iceberg={snap?.flow.events.find((e) => e.kind === "absorption")?.therefore} />
              {snap?.clusters ? <ClusterBanner snap={snap} /> : null}
              <ChartStage className="mx-4 mt-2 h-[220px] overflow-hidden rounded-lg border border-border lg:h-[320px]">
                <ChartPane candles={market.data?.candles ?? []} snap={snap} overlays={overlays} book={book} order={order} setup={deskMarket?.setup ?? null} className="absolute inset-0 h-full" />
                <OrderHud order={order} setup={deskMarket?.setup ?? null} decimals={spec.decimals} loading={digestQ.isLoading} />
              </ChartStage>
              <div className="px-4 pt-3"><EtherCard ether={ether} /></div>
              <div className="px-4 pb-4 pt-3"><ChatDock /></div>
            </>
          )}
          <div className="border-t border-border px-4 py-4 lg:hidden">
            <AnalyzeBar autoAnalyze={autoAnalyze} setAutoAnalyze={setAutoAnalyze} onRun={() => void runAi(true)} onJournal={addToJournal} snapReady={Boolean(snap)} aiLoading={aiLoading} aiModel={aiModel} />
            <div className="mt-4"><StoryBody brief={brief} snap={snap} aiLoading={aiLoading} aiError={aiError} decimals={spec.decimals} options={market.data?.options} ether={ether} construction={construction} /></div>
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
              <StoryBody brief={brief} snap={snap} aiLoading={aiLoading} aiError={aiError} decimals={spec.decimals} options={market.data?.options} ether={ether} construction={construction} />
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
