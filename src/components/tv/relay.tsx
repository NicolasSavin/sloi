import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { AppNav } from "@/components/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { actionLabel, actionTone } from "@/lib/advisor";
import { isOpenAction } from "@/lib/dispatch-store";
import { fetchDigest } from "@/lib/market/fetch";
import { ideaFromMarket, pineFromMarket, pineInputs, tvChartUrl, tvSymbol, tvWidgetSrc } from "@/lib/tradingview";
import { cn, formatPrice } from "@/lib/utils";

async function copyText(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.message(`${label} скопирован`);
  } catch {
    toast.error("Не удалось скопировать — выделите текст вручную");
  }
}

export function TvRelay({ initialId }: { initialId?: string }) {
  const q = useQuery({
    queryKey: ["dispatch-digest"],
    queryFn: () => fetchDigest(),
    staleTime: 30_000,
  });
  const markets = q.data?.digest.markets ?? [];
  const live = markets.filter((m) => isOpenAction(m.advice.action));
  const [id, setId] = useState(initialId || live[0]?.spec.id || markets[0]?.spec.id || "XAUUSD");
  const m = markets.find((x) => x.spec.id === id) ?? markets[0] ?? null;
  const pine = useMemo(() => (m ? pineFromMarket(m) : ""), [m]);
  const levels = useMemo(() => (m ? pineInputs(m) : ""), [m]);
  const idea = useMemo(() => (m ? ideaFromMarket(m) : ""), [m]);

  return (
    <div className="min-h-dvh">
      <AppNav />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="font-mono text-xs tracking-[0.22em] text-accent">TRADINGVIEW</p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight sm:text-5xl">Идея на график TV</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Идею на TradingView выкладываете бесплатно: график → камера → Share idea. Платят за публикацию Pine в каталог
          индикаторов, не за пост идеи. Текст и уровни копируете со стола.
        </p>

        <div className="mt-8 flex flex-wrap gap-2">
          {markets.map((row) => (
            <button
              key={row.spec.id}
              type="button"
              onClick={() => setId(row.spec.id)}
              className={cn(
                "h-11 rounded-full px-3 text-xs",
                row.spec.id === id ? "bg-subtle text-fg" : "text-muted shadow-[var(--shadow-border)]",
              )}
            >
              {isOpenAction(row.advice.action) ? (row.advice.action === "long" ? "🟢 " : "🔴 ") : ""}
              {row.spec.id}
            </button>
          ))}
        </div>

        {m ? (
          <section className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="panel-volume overflow-hidden rounded-xl">
              <iframe
                title={`TradingView ${m.spec.id}`}
                src={tvWidgetSrc(m.spec.id)}
                className="h-[420px] w-full border-0 bg-bg sm:h-[520px]"
                allow="clipboard-write"
              />
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{m.spec.label}</p>
                <Badge tone={actionTone(m.advice.action)}>{actionLabel(m.advice.action)}</Badge>
              </div>
              <p className="font-display text-3xl tabular-nums">{formatPrice(m.lastClose, m.spec.decimals)}</p>
              <p className="text-sm leading-relaxed text-muted">{m.advice.title}</p>
              <p className="font-mono text-xs text-dim">
                {tvSymbol(m.spec.id)}
                {m.setup.entry != null ? ` · вход ${formatPrice(m.setup.entry, m.spec.decimals)}` : ""}
                {m.setup.stop != null ? ` · стоп ${formatPrice(m.setup.stop, m.spec.decimals)}` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <a href={tvChartUrl(m.spec.id)} target="_blank" rel="noreferrer">
                  <Button>
                    <ExternalLink className="size-3.5" />
                    Открыть график
                  </Button>
                </a>
                <Button variant="outline" onClick={() => void copyText("Pine с уровнями", pine)}>
                  Копировать Pine
                </Button>
                <Button variant="outline" onClick={() => void copyText("Текст идеи", idea)}>
                  Копировать идею
                </Button>
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
                <li>«Открыть график» — бесплатный аккаунт.</li>
                <li>«Копировать идею» — заголовок, лонг/шорт, вход, стоп, цель.</li>
                <li>На TV: кнопка камеры / Share idea / Опубликовать идею. Вставить текст. Это бесплатно.</li>
                <li>Линии на графике: либо руками, либо Pine Editor → вставить Pine → Add to chart. Publish script не нужен.</li>
              </ol>
            </div>
          </section>
        ) : (
          <p className="mt-10 text-sm text-muted">Стол ещё собирает пары…</p>
        )}

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div>
            <p className="font-mono text-xs tracking-[0.18em] text-accent">ВХОДЫ СЕЙЧАС</p>
            <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-elevated p-4 text-[11px] leading-relaxed text-muted">
              {levels || "—"}
            </pre>
          </div>
          <div>
            <p className="font-mono text-xs tracking-[0.18em] text-accent">PINE · ВСТАВИТЬ КАК ЕСТЬ</p>
            <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-elevated p-4 text-[11px] leading-relaxed text-muted">
              {pine}
            </pre>
          </div>
        </section>
      </main>
    </div>
  );
}
