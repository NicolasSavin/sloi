import { createFileRoute } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { SessionStrip } from "@/components/session-strip";
import { fetchCalendar } from "@/lib/market/fetch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  loader: () => fetchCalendar(),
  component: CalendarPage,
});

function when(at: number) {
  return new Date(at).toLocaleString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Riga",
  });
}

function CalendarPage() {
  const { events, halt, session } = Route.useLoaderData();
  return (
    <div className="min-h-dvh">
      <AppNav />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="font-mono text-xs tracking-[0.22em] text-accent">КАЛЕНДАРЬ</p>
        <h1 className="mt-2 text-4xl sm:text-6xl">Когда не торгуем</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Крупные релизы из Forex Factory. За N минут до и после High-impact стол тормозит приказы. Сессии — по Лондону.
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
                <p className="mt-1 text-sm text-muted">{when(e.at)}</p>
              </div>
            </li>
          ))}
        </ul>
        {!events.length ? <p className="mt-8 text-sm text-muted">Календарь не подтянулся. Обновите страницу.</p> : null}
      </main>
    </div>
  );
}
