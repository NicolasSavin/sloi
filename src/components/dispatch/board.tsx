import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SignalBook, StatsLink, StatsStrip } from "@/components/dispatch/book";
import { FundStrip } from "@/components/fund-strip";
import { SessionStrip } from "@/components/session-strip";
import { LiveShot } from "@/components/live-shot";
import { AppNav } from "@/components/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { actionLabel, actionTone } from "@/lib/advisor";
import { useDeskStore } from "@/lib/desk-store";
import { isOpenAction, useDispatchStore } from "@/lib/dispatch-store";
import { ChatDock } from "@/components/desk/chat-dock";
import { AccountBanner } from "@/components/desk/desk-banners";
import { fetchBroker, fetchDigest } from "@/lib/market/fetch";
import { marketArt } from "@/lib/art";
import { playDispatch, testVoice, unlockSound } from "@/lib/sound";
import { deskToast, enableDeskPush } from "@/lib/notify";
import { readDeskKey } from "@/lib/desk-key";
import { cn, formatPct, formatPrice } from "@/lib/utils";

export function DispatchBoard() {
  const onDuty = useDispatchStore((s) => s.onDuty);
  const setOnDuty = useDispatchStore((s) => s.setOnDuty);
  const log = useDispatchStore((s) => s.log);
  const soundOn = useDeskStore((s) => s.soundOn);
  const setSoundOn = useDeskStore((s) => s.setSoundOn);
  const voiceOn = useDeskStore((s) => s.voiceOn);
  const setVoiceOn = useDeskStore((s) => s.setVoiceOn);
  const [studio, setStudio] = useState<boolean | null>(null);
  const [deskKey, setDeskKey] = useState("");
  useEffect(() => { setDeskKey(readDeskKey()); }, []);
  const q = useQuery({
    queryKey: ["dispatch-digest"],
    queryFn: () => fetchDigest(),
    refetchInterval: onDuty ? 45_000 : 120_000,
    staleTime: 20_000,
  });
  const brokerQ = useQuery({
    queryKey: ["broker-book", deskKey],
    queryFn: () => fetchBroker({ data: { key: deskKey } }),
    refetchInterval: 20_000,
    staleTime: 8_000,
  });
  const markets = q.data?.digest.markets ?? [];
  const fund = q.data?.digest.fund;
  const live = markets.filter((m) => isOpenAction(m.advice.action));

  useEffect(() => {
    fetch("/api/voice")
      .then((r) => r.json())
      .then((d: { studio?: boolean }) => setStudio(Boolean(d.studio)))
      .catch(() => setStudio(false));
  }, []);

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
          сверху всплывает карточка. Чтобы видеть свой счёт и закрывать ордера с сайта —{" "}
          <Link to="/cabinet" className="text-fg underline-offset-4 hover:underline">
            кабинет и ключ
          </Link>
          , инструкция там же.
        </p>

        <div className="mt-8">
          <SessionStrip />
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              unlockSound();
              setSoundOn(true);
              setVoiceOn(true);
              void enableDeskPush();
              setOnDuty(!onDuty);
              if (!onDuty) void testVoice();
            }}
          >
            {onDuty ? <span className="emoji-live">🔔</span> : <span className="emoji-live">😴</span>}
            {onDuty ? "Сойти со смены" : "На смену"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              unlockSound();
              setVoiceOn(true);
              void enableDeskPush().then((p) => {
                if (p === "granted") {
                  void deskToast("SLOI стол", "Плашка на мониторе включена. Даже если вкладка не спереди.", {
                    tag: "sloi-test",
                  });
                }
              });
              void testVoice();
            }}
          >
            Проба голоса
          </Button>
          <Button
            variant={voiceOn ? "outline" : "ghost"}
            onClick={() => setVoiceOn(!voiceOn)}
          >
            {voiceOn ? "Голос вкл" : "Голос выкл"}
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
          {studio
            ? "Студия Алёна на связи. Нажмите «Проба голоса» — браузер должен разрешить звук."
            : studio === false
              ? "Ключ Яндекса на этом деплое не виден. Говорит браузер."
              : "Проверяю студию…"}{" "}
          {onDuty
            ? "Смена открыта: сигнал, зона, отмена, стоп и тейк озвучиваются."
            : "Пока смена закрыта, голос событий молчит."}{" "}
          Плашка на мониторе: разрешите уведомления при «На смену» / «Проба голоса». Вкладку сайта не закрывайте.
        </p>
        {fund ? (
          <div className="mt-6">
            <FundStrip fund={fund} />
          </div>
        ) : null}
        <div className="mt-6">
          <AccountBanner account={brokerQ.data?.account} className="mx-0" />
        </div>

        <div className="mt-8">
          <ChatDock />
        </div>

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
                  {m.construction ? (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{m.construction.why}</p>
                  ) : null}
                  <a
                    href={`/ideas?pair=${m.spec.id}`}
                    className="relative mt-3 inline-flex text-xs text-accent"
                    onClick={(e) => e.stopPropagation()}
                  >
                    TradingView →
                  </a>
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
