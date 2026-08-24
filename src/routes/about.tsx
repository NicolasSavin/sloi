import { createFileRoute, Link } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { BRAND, DOMAIN, SITE_URL, VERSION, VERSION_DATE, TAGLINE } from "@/lib/brand";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

const UPDATES = [
  {
    v: "1.5.0",
    d: "2026-08-24",
    items: [
      "Архив сигналов: цель/стоп/новость с пояснением; при Neon — не обнуляется",
      "Бумажный исход отдельно от реального ордера в MT4",
      "Сов: лимит + рынок; спред/сверка по инструменту",
      "Нефть XTI/XBR, газ XNG, крипта в ленте",
    ],
  },
  {
    v: "1.4.0",
    d: "2026-08-23",
    items: [
      "ТВ, новости, диспетчер, чат по парам",
      "Эксперт только по командам сайта, не считает SMC сам",
    ],
  },
];

function AboutPage() {
  return (
    <div className="min-h-dvh">
      <AppNav />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="panel-volume relative overflow-hidden rounded-xl">
          <img src="/art/strata.jpg" alt="" className="h-56 w-full object-cover sm:h-72" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6">
            <p className="font-mono text-xs tracking-[0.22em] text-accent">
              {BRAND} · v{VERSION} · {VERSION_DATE}
            </p>
            <h1 className="mt-2 text-4xl font-medium tracking-tight">Слои, а не тикер</h1>
            <p className="mt-2 text-sm text-muted">{TAGLINE}</p>
          </div>
        </div>

        <p className="mt-8 text-base leading-relaxed text-muted">
          {BRAND} — рабочий стол Smart Money: структура, премия/дисконт, ликвидность, фундамент, опционы и
          спред <span className="text-fg">вашего</span> терминала. Сайт считает сценарий и пишет ленту; эксперт MT4
          только исполняет команду, если спред и сверка цен позволяют. Это не сигнал «купи прямо сейчас» и не
          инвестсовет.
        </p>

        <h2 className="mt-12 text-2xl">Для чего</h2>
        <ol className="mt-4 space-y-3">
          {[
            { n: "01", t: "Структура", d: "BOS/CHoCH, зоны, FVG — кто задаёт ход." },
            { n: "02", t: "Диапазон", d: "Премия или дисконт, OTE, края дня." },
            { n: "03", t: "Ликвидность и объём", d: "Где стопы, delta, профиль." },
            { n: "04", t: "Фундамент", d: "Календарь, новости, COT — без гадания." },
            { n: "05", t: "Исполнение", d: "Спред Ask−Bid с вашего счёта. Круг съел цель — ордер не шлём." },
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

        <h2 className="mt-14 text-2xl">Версии и апдейты</h2>
        <p className="mt-2 font-mono text-xs text-dim">
          Текущая сборка <span className="text-accent">v{VERSION}</span> от {VERSION_DATE}. Домен {DOMAIN}.
        </p>
        <ul className="mt-6 space-y-6">
          {UPDATES.map((u) => (
            <li key={u.v} className="panel-volume rounded-xl p-5">
              <p className="font-mono text-xs tracking-wide text-accent">
                v{u.v} · {u.d}
              </p>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted">
                {u.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <h2 className="mt-14 text-2xl">Ссылки</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-base text-muted">
          <li>
            <Link to="/desk" className="text-fg underline-offset-4 hover:underline">
              График
            </Link>{" "}
            — разбор пары.
          </li>
          <li>
            <Link to="/dispatch" className="text-fg underline-offset-4 hover:underline">
              Диспетчер
            </Link>{" "}
            — табло сигналов.
          </li>
          <li>
            <Link to="/stats" className="text-fg underline-offset-4 hover:underline">
              Статистика
            </Link>{" "}
            — архив и исходы.
          </li>
          <li>
            <Link to="/advisor" className="text-fg underline-offset-4 hover:underline">
              Эксперт MT4
            </Link>{" "}
            — скачать .mq4.
          </li>
          <li>
            <a href={SITE_URL} className="text-accent">
              {DOMAIN}
            </a>
          </li>
        </ul>
        <p className="mt-10 text-xs text-dim">Не инвестиционная рекомендация. Рынок может сделать иначе, чем сценарий.</p>
      </main>
    </div>
  );
}
