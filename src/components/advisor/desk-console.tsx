import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { actionLabel } from "@/lib/advisor";
import { SaveExpert } from "@/components/advisor/save-expert";
import {
  DEFAULT_EA,
  PAIR_OPTIONS,
  TF_OPTIONS,
  watchListOf,
  type EaSettings,
} from "@/lib/ea-settings";
import type { DailyDigest } from "@/lib/digest";
import { cn, formatPrice } from "@/lib/utils";

export function DeskConsole({ digest }: { digest?: DailyDigest }) {
  const [set, setSet] = useState<EaSettings>(DEFAULT_EA);
  const patch = (p: Partial<EaSettings>) => setSet((s) => ({ ...s, ...p }));

  const rows = (digest?.markets ?? []).filter((m) => set.pairs.includes(m.spec.id));

  return (
    <div className="panel-volume overflow-hidden rounded-xl">
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <p className="font-mono text-xs tracking-[0.22em] text-accent">НАСТРОЙКИ И ПАНЕЛЬ</p>
        <p className="mt-1 text-sm text-muted">
          Здесь задаёте стол. Те же поля будут на графике MT4. Скачанный .mq4 уже с этими значениями.
        </p>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2">
        <div className="bg-card px-4 py-4 sm:px-5">
          <p className="text-xs text-dim">пары</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PAIR_OPTIONS.map((p) => {
              const on = set.pairs.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() =>
                    patch({
                      pairs: on ? set.pairs.filter((x) => x !== p) : [...set.pairs, p],
                    })
                  }
                  className={cn(
                    "h-9 rounded-sm px-3 font-mono text-xs",
                    on ? "bg-accent text-accent-fg" : "bg-subtle text-muted",
                  )}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <label className="mt-4 block">
            <span className="text-xs text-dim">суффикс брокера (m, .pro)</span>
            <input
              value={set.suffix}
              onChange={(e) => patch({ suffix: e.target.value.trim() })}
              className="mt-1 h-11 w-full rounded-sm bg-subtle px-3 font-mono text-sm"
              placeholder="пусто, если EURUSD как есть"
            />
          </label>

          <p className="mt-4 text-xs text-dim">таймфрейм</p>
          <div className="mt-2 flex gap-2">
            {TF_OPTIONS.map((tf) => (
              <button
                key={tf.id}
                type="button"
                onClick={() => patch({ workTF: tf.id })}
                className={cn(
                  "h-9 rounded-sm px-3 font-mono text-xs",
                  set.workTF === tf.id ? "bg-accent text-accent-fg" : "bg-subtle text-muted",
                )}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-card px-4 py-4 sm:px-5">
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="text-xs text-dim">лот</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={set.lots}
                onChange={(e) => patch({ lots: Number(e.target.value) || 0.01 })}
                className="mt-1 h-11 w-full rounded-sm bg-subtle px-3 font-mono text-sm"
              />
            </label>
            <label>
              <span className="text-xs text-dim">макс. спред, пункты</span>
              <input
                type="number"
                min="1"
                value={set.maxSpread}
                onChange={(e) => patch({ maxSpread: Number(e.target.value) || 1 })}
                className="mt-1 h-11 w-full rounded-sm bg-subtle px-3 font-mono text-sm"
              />
            </label>
            <label>
              <span className="text-xs text-dim">запас хода, круги</span>
              <input
                type="number"
                step="0.1"
                min="1"
                value={set.minCover}
                onChange={(e) => patch({ minCover: Number(e.target.value) || 1 })}
                className="mt-1 h-11 w-full rounded-sm bg-subtle px-3 font-mono text-sm"
              />
            </label>
            <div className="flex flex-col justify-end gap-3 pb-1">
              <label className="flex h-11 items-center justify-between rounded-sm bg-subtle px-3 text-sm">
                автоторговля
                <Switch checked={set.autoTrade} onCheckedChange={(v) => patch({ autoTrade: v })} />
              </label>
            </div>
          </div>
          <label className="mt-3 flex h-11 items-center justify-between rounded-sm bg-subtle px-3 text-sm">
            алерты
            <Switch checked={set.alerts} onCheckedChange={(v) => patch({ alerts: v })} />
          </label>
          <p className="mt-3 font-mono text-xs text-dim">WatchList: {watchListOf(set) || "—"}</p>
        </div>
      </div>

      <div className="overflow-x-auto bg-[#12100e] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-3">
          <p className="font-mono text-sm tracking-[0.18em] text-accent">SLOI DESK</p>
          <p className="font-mono text-xs text-dim">
            {set.autoTrade ? "АВТО ВКЛ" : "АВТО ВЫКЛ"} · лот {set.lots.toFixed(2)} · макс {set.maxSpread}п · TF{" "}
            {set.workTF}m
          </p>
        </div>
        <table className="w-full min-w-[720px] border-collapse text-left font-mono text-xs">
          <thead>
            <tr className="text-dim">
              <th className="px-2 py-2 font-medium">СИМВОЛ</th>
              <th className="px-2 py-2 font-medium">СПРЕД</th>
              <th className="px-2 py-2 font-medium">СТРУКТ.</th>
              <th className="px-2 py-2 font-medium">ВХОД</th>
              <th className="px-2 py-2 font-medium">СТОП</th>
              <th className="px-2 py-2 font-medium">ЦЕЛЬ</th>
              <th className="px-2 py-2 font-medium">ВЕРДИКТ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const v = actionLabel(m.advice.action);
              const tone =
                m.advice.action === "long" ? "text-bull" : m.advice.action === "short" ? "text-bear" : "text-muted";
              return (
                <tr key={m.spec.id} className="border-t border-white/5">
                  <td className="px-2 py-2 text-fg">
                    {m.spec.id}
                    {set.suffix}
                  </td>
                  <td className="px-2 py-2 text-accent">из MT4</td>
                  <td className="px-2 py-2 text-muted">
                    {m.bias === "bullish" ? "бычий" : m.bias === "bearish" ? "медвеж." : "флэт"}
                  </td>
                  <td className="px-2 py-2 tabular-nums">
                    {m.setup.entry != null ? formatPrice(m.setup.entry, m.spec.decimals) : "—"}
                  </td>
                  <td className="px-2 py-2 tabular-nums text-bear">
                    {m.setup.stop != null ? formatPrice(m.setup.stop, m.spec.decimals) : "—"}
                  </td>
                  <td className="px-2 py-2 tabular-nums text-bull">
                    {m.setup.targets[0] != null ? formatPrice(m.setup.targets[0], m.spec.decimals) : "—"}
                  </td>
                  <td className={cn("px-2 py-2", tone)}>{v}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 px-2 text-xs text-dim">
          В терминале эта таблица рисуется на графике. Спред, лот и авто — поля сверху и кнопки АВТО / ПРИМЕНИТЬ.
        </p>
      </div>

      <div className="border-t border-border px-4 py-4 sm:px-5">
        <SaveExpert settings={set} />
      </div>
    </div>
  );
}
