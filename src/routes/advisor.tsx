import { createFileRoute, Link } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { DeskConsole } from "@/components/advisor/desk-console";
import { HowToDesk } from "@/components/howto-desk";
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
          Сначала ключ в{" "}
          <Link to="/cabinet" className="text-fg underline-offset-4 hover:underline">
            кабинете
          </Link>
          , затем скачайте сов оттуда — ключ уже внутри. Настройки лота и пар ниже попадут в файл, если качаете с этой
          страницы (поле DeskKey тогда пропишите вручную).
        </p>
        <div className="mt-8">
          <DeskConsole digest={digest} />
        </div>
        <HowToDesk />
        <p className="mt-10 text-xs text-dim">Не инвестиционная рекомендация. Сначала демо.</p>
      </main>
    </div>
  );
}
