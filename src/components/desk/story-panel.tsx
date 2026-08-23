import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { briefToStory, type AiBrief } from "@/lib/ai/analyze";
import type { MarketStory, SmcSnapshot } from "@/lib/smc/engine";
import { formatPrice } from "@/lib/utils";
import type { OptionsSnapshot } from "@/lib/market/types";
import { readConstruction } from "@/lib/options";

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

export function StoryPanel({
  story,
  bias,
  confidence,
  headline,
  setup,
  risks,
  watch,
}: {
  story: MarketStory;
  bias: string;
  confidence?: number;
  headline?: string;
  setup?: AiBrief["setup"];
  risks?: string[];
  watch?: string[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge tone={biasTone(bias)}>{biasLabel(bias)}</Badge>
        {confidence != null ? (
          <span className="font-mono text-xs tabular-nums text-muted">{confidence}%</span>
        ) : (
          <span className="text-xs text-dim">движок</span>
        )}
      </div>
      <div>
        <p className="text-xs font-medium tracking-wide text-accent">Что делает крупняк</p>
        {headline ? <h2 className="mt-1 text-base font-medium leading-snug">{headline}</h2> : null}
        <article className="mt-2 space-y-3 text-sm leading-relaxed">
          <p>{story.doing || story.now}</p>
          {story.waiting ? <p>{story.waiting}</p> : null}
          {story.leadsTo ? <p>{story.leadsTo}</p> : null}
        </article>
      </div>
      {setup ? (
        <div className="rounded-lg panel-volume p-3">
          <p className="text-xs font-medium tracking-wide text-dim">Уровни</p>
          {setup.type ? <p className="mt-1 text-sm">{setup.type}</p> : null}
          <dl className="mt-2 space-y-1 text-sm text-muted">
            <div>
              <span className="text-dim">вход </span>
              {setup.entry}
            </div>
            <div>
              <span className="text-dim">стоп </span>
              {setup.stop}
            </div>
            <div>
              <span className="text-dim">цели </span>
              {setup.targets.join(" · ") || "—"}
            </div>
          </dl>
        </div>
      ) : null}
      {risks?.length ? (
        <div>
          <p className="text-xs font-medium tracking-wide text-dim">Почему может не сработать</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-muted">
            {risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {watch?.length ? (
        <div>
          <p className="text-xs font-medium tracking-wide text-dim">Что смотреть дальше</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-muted">
            {watch.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ConstructionCard({ options }: { options: OptionsSnapshot | null | undefined }) {
  const c = readConstruction(options);
  if (!c) {
    return (
      <div className="rounded-lg panel-volume p-3">
        <p className="text-[10px] font-mono tracking-[0.16em] text-accent">КОНСТРУКЦИЯ</p>
        <p className="mt-2 text-sm text-muted">Биржевой цепочки нет. Внебиржевые блоки в стол не подставляем.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg panel-volume p-3">
      <p className="text-[10px] font-mono tracking-[0.16em] text-accent">КОНСТРУКЦИЯ</p>
      <p className="mt-2 text-sm font-medium">{c.type}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs text-muted">
        <div>
          <span className="text-dim">страйк </span>
          {c.strike}
        </div>
        <div>
          <span className="text-dim">эксп. </span>
          {c.expiry}
        </div>
        <div className="col-span-2">
          <span className="text-dim">доска </span>
          {c.source}
        </div>
      </dl>
      <p className="mt-2 text-sm leading-relaxed text-muted">{c.why}</p>
    </div>
  );
}

export function StoryBody({
  brief,
  snap,
  aiLoading,
  aiError,
  decimals,
  options,
}: {
  brief: AiBrief | null;
  snap: SmcSnapshot | null;
  aiLoading: boolean;
  aiError: string | null;
  decimals: number;
  options?: OptionsSnapshot | null;
}) {
  return (
    <div className="space-y-4">
      {aiLoading && !brief ? (
        <div className="space-y-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}
      {aiError ? <div className="rounded-md bg-elevated p-3 text-sm text-warn">{aiError}</div> : null}
      {brief ? (
        <StoryPanel
          story={briefToStory(brief)}
          bias={brief.bias}
          confidence={brief.confidence}
          headline={brief.headline}
          setup={brief.setup}
          risks={brief.risks}
          watch={brief.watch}
        />
      ) : snap ? (
        <StoryPanel
          story={snap.story}
          bias={snap.bias}
          setup={{
            type: "",
            entry: snap.localSetup.entry != null ? formatPrice(snap.localSetup.entry, decimals) : "ждать реакцию у края",
            stop: snap.localSetup.stop != null ? formatPrice(snap.localSetup.stop, decimals) : snap.localSetup.invalidation,
            targets: snap.localSetup.targets.map((n) => formatPrice(n, decimals)),
            invalidation: snap.localSetup.invalidation,
          }}
        />
      ) : null}
      <ConstructionCard options={options} />
      <p className="text-xs text-dim">Разбор — цепочка причина → следствие, не сигнал. Конструкция — OI биржи, не OTC.</p>
    </div>
  );
}
