import { createFileRoute } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { CabinetGate } from "@/components/cabinet/gate";
import { HowToDesk } from "@/components/howto-desk";

export const Route = createFileRoute("/cabinet")({
  component: CabinetPage,
});

function CabinetPage() {
  return (
    <div className="min-h-dvh">
      <AppNav />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="font-mono text-xs tracking-[0.22em] text-accent">КАБИНЕТ</p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight sm:text-5xl">Ваш стол, не общий</h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
          Разбор пар один на всех. Счёт MT4, котировки брокера и кнопки купить/закрыть — только у того, чей ключ стоит в
          советнике. Чужой ключ чужой счёт не увидит.
        </p>
        <div className="mt-8">
          <CabinetGate />
        </div>
        <HowToDesk />
      </main>
    </div>
  );
}