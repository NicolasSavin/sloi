import { TZ_OPTS, browserTz, useTzStore, type TzId } from "@/lib/tz";

export function TzPick({ compact = false }: { compact?: boolean }) {
  const id = useTzStore((s) => s.id);
  const setId = useTzStore((s) => s.setId);
  return (
    <label className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.12em] text-dim">
      {compact ? null : <span>ПОЯС</span>}
      <select
        value={id}
        onChange={(e) => setId(e.target.value as TzId)}
        className="rounded-sm border border-line bg-elevated px-2 py-1 text-xs text-fg"
      >
        {TZ_OPTS.map((z) => (
          <option key={z.id} value={z.id}>
            {z.id === "auto" ? `Авто · ${browserTz()}` : z.label}
          </option>
        ))}
      </select>
    </label>
  );
}
