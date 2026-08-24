import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchCalendar } from "@/lib/market/fetch";
import { formatInTz } from "@/lib/tz";
import { cn } from "@/lib/utils";

export function HomeCalStrip() {
  const q = useQuery({
    queryKey: ["calendar"],
    queryFn: () => fetchCalendar(),
    staleTime: 120_000,
  });
  const events = q.data?.events?.filter((e) => e.impact === "High" || e.impact === "Medium").slice(0, 5) ?? [];
  const halt = q.data?.halt;
  return (
    <section className="panel-volume mt-4 rounded-xl p-4">
      <div className="flex items-end justify-between gap-3">
        <p className="font-mono text-[10px] tracking-[0.2em] text-accent">
          {halt?.active ? "КАЛЕНДАРЬ · ОКНО НОВОСТИ" : "КАЛЕНДАРЬ"}
        </p>
        <Link to="/calendar" className="text-xs text-accent">
          все события
        </Link>
      </div>
      <p className="mt-2 text-sm text-muted">{halt?.line ?? (q.isLoading ? "Гружу ForexFactory…" : "Нет ленты")}</p>
      <ul className="mt-3 space-y-1">
        {events.map((e) => (
          <li key={`${e.at}-${e.title}`} className="flex justify-between gap-3 text-sm">
            <span className={cn(e.impact === "High" && "text-bear")}>
              {e.label} · {e.country}
            </span>
            <span className="shrink-0 font-mono text-xs text-dim">{formatInTz(e.at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
