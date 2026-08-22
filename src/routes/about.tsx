import { createFileRoute, Link } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { BRAND, DOMAIN, SITE_URL } from "@/lib/brand";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="min-h-dvh">
      <AppNav />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="panel-volume relative overflow-hidden rounded-xl">
          <img src="/art/strata.jpg" alt="" className="h-56 w-full object-cover sm:h-72" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6">
            <p className="font-mono text-xs tracking-[0.22em] text-accent">ПОЧЕМУ {BRAND}</p>
            <h1 className="mt-2 text-4xl font-medium tracking-tight">Слои, а не тикер</h1>
          </div>
        </div>

        <p className="mt-8 text-base leading-relaxed text-muted">
          {BRAND} — слой. Рынок читается стопкой: структура, где цена в диапазоне, ликвидность,
          затем спред терминала. Домен {DOMAIN}: коротко, на русском корне, без крипты и без латиницы «stratum»,
          которую всё равно читают как бренд из другого языка.
        </p>

        <ol className="mt-8 space-y-3">
          {[
            { n: "01", t: "Структура", d: "Сломы и смена характера. Кто задаёт направление." },
            { n: "02", t: "Диапазон", d: "Премия или дисконт относительно хода." },
            { n: "03", t: "Ликвидность", d: "Где стоят стопы. Часто сначала вынос, потом ход." },
            { n: "04", t: "Спред MT4", d: "Ask − Bid с вашего счёта. Если круг съедает цель — эксперт молчит." },
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

        <h2 className="mt-14 text-2xl">Как открыть сайт в интернете</h2>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Сейчас это предпросмотр в Grok. Нажмите <span className="text-fg">Опубликовать</span> —
          появится ссылка. Постоянный адрес бренда —{" "}
          <a href={SITE_URL} className="text-accent">
            {DOMAIN}
          </a>
          : его вешаете на опубликованный сайт. Эксперта MT4 скачиваете с вкладки Советник
          и ставите в терминал отдельно: сайт не видит спред вашего брокера.
        </p>

        <h2 className="mt-14 text-2xl">Что внутри</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-base text-muted">
          <li>
            <Link to="/desk" className="text-fg underline-offset-4 hover:underline">
              График
            </Link>{" "}
            — стол структуры.
          </li>
          <li>
            <Link to="/daily" className="text-fg underline-offset-4 hover:underline">
              Сегодня
            </Link>{" "}
            — инфографика с картинкой и статья дня.
          </li>
          <li>
            <Link to="/advisor" className="text-fg underline-offset-4 hover:underline">
              Советник
            </Link>{" "}
            — эксперт MT4, спред из терминала.
          </li>
        </ul>
        <p className="mt-10 text-xs text-dim">Не инвестиционная рекомендация.</p>
      </main>
    </div>
  );
}
