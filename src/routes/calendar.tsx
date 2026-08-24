import { createFileRoute } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { SessionStrip } from "@/components/session-strip";
import { TzPick } from "@/components/tz-pick";
import { fetchCalendar } from "@/lib/market/fetch";
import { formatInTz } from "@/lib/tz";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  loader: () => fetchCalendar(),
  pendingComponent: function CalPending() {
    return (
      <div className="min-h-dvh">
        <AppNav />
        <p className="px-5 py-16 text-sm text-muted">Календарь…</p>
      </div>
    );
  },
  component: CalendarPage,
});

function CalendarPage() {
  const { events, halt, session } = Route.useLoaderData();
  return (
    <div className="min-h-dvh">
      <AppNav />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="font-mono text-xs tracking-[0.22em] text-accent">КАЛЕНДАРЬ</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-4xl sm:text-6xl">Когда не торгуем</h1>
          <TzPick />
        </div>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Время событий — в выбранном поясе. VPN меняет IP, не часы компьютера: если расхождение — поставьте Берлин
          GMT+1 вручную. Сессии рынка считаются по Лондону, это не ваш пояс.
        </p>
        <div className="mt-8">
          <SessionStrip initial={session} />
        </div>
        <section className={cn("mt-6 rounded-xl p-5", halt.active ? "jewel-amber" : "panel-volume")}>
          <p className="font-mono text-[10px] tracking-[0.2em] text-accent">
            {halt.active ? "ТОРМОЗ" : "ФОН"}
          </p>
          <p className="mt-2 text-lg">{halt.line}</p>
        </section>
        <ul className="mt-8 space-y-2">
          {events.map((e) => (
            <li
              key={`${e.at}-${e.title}`}
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3",
                e.impact === "High" ? "jewel-amber" : "panel-volume",
              )}
            >
              <div>
                <p className="text-sm font-medium">{e.label}</p>
                <p className="mt-1 font-mono text-[10px] text-dim">
                  {e.country} · {e.title}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-xs text-accent">{e.impact}</p>
                <p className="mt-1 text-sm text-muted">{formatInTz(e.at)}</p>
              </div>
            </li>
          ))}
        </ul>
        {!events.length ? <p className="mt-8 text-sm text-muted">Календарь не подтянулся. Обновите страницу.</p> : null}
      </main>
    </div>
  );
}
