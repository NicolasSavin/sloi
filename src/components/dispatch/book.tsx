import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { actionLabel } from "@/lib/advisor";
import type { SignalHit } from "@/lib/dispatch-store";
import { bookStats, statusLabel } from "@/lib/signal-book";
import { cn, formatPrice } from "@/lib/utils";

function statusTone(status: SignalHit["status"]) {
  if (status === "target") return "bull" as const;
  if (status === "stop") return "bear" as const;
  if (status === "open" || !status) return "warn" as const;
  return "neutral" as const;
}

export function StatsStrip({ log }: { log: SignalHit[] }) {
  const s = bookStats(log);
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      {[
        { k: "закрыто в плюс", v: String(s.wins) },
        { k: "сняло стопом", v: String(s.losses) },
        { k: "винрейт", v: s.winRate == null ? "—" : `${Math.round(s.winRate * 100)}%` },
        { k: "средний R", v: s.avgR == null ? "—" : s.avgR.toFixed(2) },
      ].map((c) => (
        <div key={c.k} className="panel-volume rounded-xl p-4">
          <p className="font-mono text-[10px] tracking-[0.16em] text-dim">{c.k}</p>
          <p className="mt-2 font-display text-3xl tabular-nums">{c.v}</p>
        </div>
      ))}
    </div>
  );
}

export function SignalBook({ log }: { log: SignalHit[] }) {
  if (log.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted">
        Журнал пуст. Встаньте на смену в диспетчерской — сигналы останутся здесь и после закрытия: цель, стоп или почему
        сценарий не состоялся.
      </p>
    );
  }
  return (
    <ul className="mt-4 space-y-3">
      {log.map((h) => (
        <li key={h.id} className="panel-volume rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {h.label} · {actionLabel(h.action)}
            </p>
            <Badge tone={statusTone(h.status)}>{statusLabel(h.status)}</Badge>
          </div>
          <p className="mt-2 font-mono text-xs text-dim">
            {new Date(h.at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            {h.entry != null ? ` · вход ${formatPrice(h.entry, h.decimals)}` : ""}
            {h.stop != null ? ` · стоп ${formatPrice(h.stop, h.decimals)}` : ""}
            {h.target != null ? ` · цель ${formatPrice(h.target, h.decimals)}` : ""}
            {h.exit != null ? ` · выход ${formatPrice(h.exit, h.decimals)}` : ""}
            {h.resultR != null ? ` · ${h.resultR >= 0 ? "+" : ""}${h.resultR.toFixed(2)}R` : ""}
          </p>
          <p className={cn("mt-2 text-sm leading-relaxed", h.status === "open" ? "text-muted" : "text-fg")}>
            {h.why ?? h.title}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function StatsByPair({ log }: { log: SignalHit[] }) {
  const rows = bookStats(log).bySymbol;
  if (!rows.length) return null;
  return (
    <div className="mt-8">
      <p className="font-mono text-xs tracking-[0.18em] text-accent">ПО ПАРАМ</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.id} className="panel-volume flex items-center justify-between rounded-lg px-4 py-3 text-sm">
            <span>{r.label}</span>
            <span className="font-mono text-xs text-dim">
              +{r.wins} / −{r.losses}
              {r.open ? ` · ${r.open} открыт` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatsLink() {
  return (
    <Link to="/stats" className="text-sm text-accent">
      Вся статистика
    </Link>
  );
}
