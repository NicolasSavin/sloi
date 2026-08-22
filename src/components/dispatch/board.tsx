import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { SignalBook, StatsLink, StatsStrip } from "@/components/dispatch/book";
import { FundStrip } from "@/components/fund-strip";
import { LiveShot } from "@/components/live-shot";
import { AppNav } from "@/components/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { actionLabel, actionTone } from "@/lib/advisor";
import { useDeskStore } from "@/lib/desk-store";
import { isOpenAction, useDispatchStore } from "@/lib/dispatch-store";
import { fetchDigest } from "@/lib/market/fetch";
import { marketArt } from "@/lib/art";
import { playDispatch, unlockSound } from "@/lib/sound";
import { cn, formatPct, formatPrice } from "@/lib/utils";

export function DispatchBoard() {
  const onDuty = useDispatchStore((s) => s.onDuty);
  const setOnDuty = useDispatchStore((s) => s.setOnDuty);
  const log = useDispatchStore((s) => s.log);
  const soundOn = useDeskStore((s) => s.soundOn);
  const setSoundOn = useDeskStore((s) => s.setSoundOn);
  const q = useQuery({
    queryKey: ["dispatch-digest"],
    queryFn: () => fetchDigest(),
    refetchInterval: onDuty ? 45_000 : 120_000,
    staleTime: 20_000,
  });
  const markets = q.data?.digest.markets ?? [];
  const fund = q.data?.digest.fund;
  const live = markets.filter((m) => isOpenAction(m.advice.action));

  return (
    <div className="min-h-dvh">
      <AppNav />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="font-mono text-xs tracking-[0.22em] text-accent">
          <span className="emoji-live">{onDuty ? "📡" : "🛋"}</span> ДИСПЕТЧЕРСКАЯ
        </p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight sm:text-5xl">Сигнал приходит сюда</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Сайт сам слушает все пары. Вы нажимаете «На смену» — и когда появляется лонг или шорт, звучит двойной тон и
          сверху всплывает карточка. Терминал MT4 не нужен: диспетчер работает в браузере.
        </p>

        <div className="mt-8 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              unlockSound();
              setSoundOn(true);
              setOnDuty(!onDuty);
            }}
          >
            {onDuty ? <span className="emoji-live">🔔</span> : <span className="emoji-live">😴</span>}
            {onDuty ? "Сойти со смены" : "На смену"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              unlockSound();
              setSoundOn(true);
              playDispatch("long");
            }}
          >
            Проба лонга
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              unlockSound();
              playDispatch("short");
            }}
          >
            Проба шорта
          </Button>
        </div>
        <p className="mt-3 text-sm text-dim">
          {onDuty
            ? "Смена открыта. Сигнал только если структура и фундамент не спорят. Звук + карточка, даже на другой странице."
            : "Пока смена закрыта, звук не играет. Нажмите «На смену», браузер разрешит звук."}
        </p>
        {fund ? (
          <div className="mt-6">
            <FundStrip fund={fund} />
          </div>
        ) : null}

        <section className="mt-10">
          <p className="font-mono text-xs tracking-[0.18em] text-accent">ТАБЛО ПАР</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {markets.map((m) => {
              const open = isOpenAction(m.advice.action);
              return (
                <Link
                  key={m.spec.id}
                  to="/desk"
                  className={cn(
                    "panel-volume group relative overflow-hidden rounded-xl p-4",
                    open && (m.advice.action === "long" ? "border-bull/35" : "border-bear/35"),
                  )}
                >
                  <LiveShot src={marketArt(m.spec.id)} beat={m.spec.id.length} />
                  <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/75 to-bg/25" />
                  <div className="relative">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">
                      <span className="emoji-live mr-1">
                        {open ? (m.advice.action === "long" ? "🟢" : "🔴") : m.advice.action === "wait" ? "⏳" : "⏸"}
                      </span>
                      {m.spec.label}
                    </p>
                    <Badge tone={actionTone(m.advice.action)}>{actionLabel(m.advice.action)}</Badge>
                  </div>
                  <p className="mt-2 font-display text-3xl tabular-nums">
                    {formatPrice(m.lastClose, m.spec.decimals)}
                    <span className="ml-2 font-sans text-sm text-muted">{formatPct(m.changePct)}</span>
                  </p>
                  {open && m.setup.entry != null ? (
                    <p className="mt-2 font-mono text-xs text-dim">
                      вход {formatPrice(m.setup.entry, m.spec.decimals)}
                      {m.setup.stop != null ? ` · стоп ${formatPrice(m.setup.stop, m.spec.decimals)}` : ""}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-muted">{m.advice.title}</p>
                  )}
                  {m.wind ? (
                    <p className="mt-2 font-mono text-xs text-dim">
                      макро {m.wind.kind === "tail" ? "попутный" : m.wind.kind === "head" ? "встречный" : "нейтральный"}
                    </p>
                  ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-end justify-between gap-3">
            <p className="font-mono text-xs tracking-[0.18em] text-accent">КНИГА СДЕЛОК</p>
            <StatsLink />
          </div>
          <div className="mt-4">
            <StatsStrip log={log} />
          </div>
          <SignalBook log={log} />
        </section>
      </main>
    </div>
  );
}
