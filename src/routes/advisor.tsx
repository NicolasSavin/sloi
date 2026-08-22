import { createFileRoute } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { DeskConsole } from "@/components/advisor/desk-console";
import { fetchDigest } from "@/lib/market/fetch";
import type { DailyDigest } from "@/lib/digest";

export const Route = createFileRoute("/advisor")({
  loader: async () => {
    try {
      return await fetchDigest();
    } catch {
      return null;
    }
  },
  pendingComponent: function AdvisorPending() {
    return (
      <div className="min-h-dvh">
        <AppNav />
        <p className="px-5 py-16 text-sm text-muted">Готовлю стол…</p>
      </div>
    );
  },
  component: AdvisorPage,
});

function AdvisorPage() {
  const data = Route.useLoaderData();
  const digest = data?.digest as DailyDigest | undefined;

  return (
    <div className="min-h-dvh">
      <AppNav />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="font-mono text-xs tracking-[0.22em] text-accent">ЭКСПЕРТ MT4 · ПАНЕЛЬ И НАСТРОЙКИ</p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight sm:text-5xl">Стол на графике</h1>
        <p className="mt-4 max-w-prose text-base leading-relaxed text-muted">
          Настройки здесь и те же поля в MT4. Спред каждой пары — Ask − Bid терминала. Если «Скачать» молчит — код
          копируется, вставляете в MetaEditor.
        </p>
        <div className="mt-8">
          <DeskConsole digest={digest} />
        </div>
        <ol className="mt-12 space-y-3">
          {[
            { n: "01", t: "Сохранить", d: "Скачать .mq4. Если файл не пришёл — код уже в буфере, вставьте в MetaEditor." },
            { n: "02", t: "MetaEditor", d: "Новый Expert Advisor → вставить → сохранить SLOI_Desk.mq4 в MQL4/Experts → F7." },
            { n: "03", t: "WebRequest", d: "Сервис → Настройки → Советники → разрешить WebRequest: https://sloi-kohl.vercel.app  и  https://sloi-kohl.vercel.app/api/signals.txt" },
            { n: "04", t: "Лента", d: "В панели поле «лента» уже стоит этот адрес. Суффикс брокера у вас cs — не стирайте. АВТО пока выкл." },
            { n: "05", t: "Авто", d: "По умолчанию выкл: только алерт. АВТО ВКЛ — исполнит вход/стоп/цель с сайта, если спред брокера не съел ход." },
          ].map((row) => (
            <li key={row.n} className="panel-volume flex gap-4 rounded-lg p-4">
              <span className="font-mono text-xs text-accent">{row.n}</span>
              <div>
                <p className="text-sm font-medium">{row.t}</p>
                <p className="mt-1 text-sm text-muted">{row.d}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-10 text-xs text-dim">Не инвестиционная рекомендация. Сначала демо.</p>
      </main>
    </div>
  );
}
