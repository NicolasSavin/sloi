import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { AppNav } from "@/components/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { actionLabel, actionTone } from "@/lib/advisor";
import { isOpenAction } from "@/lib/dispatch-store";
import { fetchDigest } from "@/lib/market/fetch";
import { ideaMeta, pineFromMarket, tvChartUrl, tvSymbol, tvWidgetSrc } from "@/lib/tradingview";
import { cn, formatPrice } from "@/lib/utils";

async function copyText(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.message(`${label} в буфере`);
    return true;
  } catch {
    toast.error("Скопируйте текст вручную — выделите блок ниже");
    return false;
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
  const pack = useMemo(() => (m ? ideaMeta(m) : null), [m]);

  async function postIdea() {
    if (!m || !pack) return;
    await copyText("Идея", pack.paste);
    const url = tvChartUrl(m.spec.id, "60");
    window.open(url, "_blank", "noopener,noreferrer");
    toast.message(`${tvSymbol(m.spec.id)} · H1. Камера → Share idea → ${pack.tvSide}. Ctrl+V в описание.`);
  }

  return (
    <div className="min-h-dvh">
      <AppNav />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="font-mono text-xs tracking-[0.22em] text-accent">TRADINGVIEW</p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight sm:text-5xl">Идея на график TV</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Одна кнопка: текст в буфер и график TradingView. Дальше камера → Share idea → вставить. Бесплатно. Pine в каталог
          не публикуем.
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

        {m && pack ? (
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
              <p className="text-sm leading-relaxed text-muted">{pack.title}</p>
              <p className="font-mono text-xs text-dim">
                {tvSymbol(m.spec.id)} · TV сторона {pack.tvSide}
                {pack.entry !== "—" ? ` · вход ${pack.entry}` : ""} · стоп {pack.stop} · цель {pack.target}
              </p>
              <Button className="h-12 w-full text-base" onClick={() => void postIdea()}>
                <Camera className="size-4" />
                Выложить идею
              </Button>
              <p className="text-xs leading-relaxed text-muted">
                1) Текст уже скопирован, график открылся. 2) На TV нажмите камеру → Share idea. 3) Заголовок и описание —
                Ctrl+V. Сторона: <span className="text-fg">{pack.tvSide}</span>.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void copyText("Заголовок", pack.title)}>
                  <Copy className="size-3.5" />
                  Только заголовок
                </Button>
                <Button variant="outline" onClick={() => void copyText("Pine", pine)}>
                  Линии Pine
                </Button>
                <a href={tvChartUrl(m.spec.id)} target="_blank" rel="noreferrer">
                  <Button variant="outline">
                    <ExternalLink className="size-3.5" />
                    Только график
                  </Button>
                </a>
              </div>
              <button
                type="button"
                onClick={() => void copyText("Идея", pack.paste)}
                className="max-h-56 w-full overflow-auto rounded-xl bg-elevated p-4 text-left font-mono text-[11px] leading-relaxed text-muted"
              >
                {pack.paste}
              </button>
            </div>
          </section>
        ) : (
          <p className="mt-10 text-sm text-muted">Стол ещё собирает пары…</p>
        )}
      </main>
    </div>
  );
}