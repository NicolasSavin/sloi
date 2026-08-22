import type { DailyDigest } from "@/lib/digest";
import { actionLabel } from "@/lib/advisor";
import { formatPrice } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function EaPanelPreview({ digest }: { digest?: DailyDigest }) {
  const rows = digest?.markets ?? [];
  return (
    <div className="overflow-x-auto rounded-xl bg-[#12100e] p-3 shadow-[var(--shadow-volume)]">
      <div className="flex items-baseline justify-between gap-3 px-2 pb-3">
        <p className="font-mono text-sm tracking-[0.18em] text-accent">SLOI DESK</p>
        <p className="font-mono text-xs text-dim">мультивалютный · спред Ask−Bid из терминала · только сигнал</p>
      </div>
      <table className="w-full min-w-[640px] border-collapse text-left font-mono text-xs">
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
                <td className="px-2 py-2 text-fg">{m.spec.id}</td>
                <td className="px-2 py-2 tabular-nums text-accent">с терминала</td>
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
        Так выглядит панель в MT4. Вешается на один график, читает весь WatchList. Цифры спреда здесь — заглушка
        сайта; живые пункты появятся в терминале.
      </p>
    </div>
  );
}
