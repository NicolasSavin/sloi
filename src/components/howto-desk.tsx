import { Link } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/brand";

const STEPS = [
  {
    n: "01",
    t: "Кабинет и ключ",
    d: "Меню → Кабинет → «Создать мой стол». Ключ начинается с sloi_ — это вход на сайт и пароль советника. Покажут один раз: скопируйте в записную книжку. На телефоне или другом ПК: вставьте ключ и «Войти». Не публикуйте.",
  },
  {
    n: "02",
    t: "Скачать советник",
    d: "В кабинете нажмите скачать SLOI_Desk.mq4 (версия 4.44). Ключ уже прописан в поле DeskKey. Если браузер не качает — код копируется, в MetaEditor: Файл → Создать → Expert Advisor → вставить всё → сохранить как SLOI_Desk.",
  },
  {
    n: "03",
    t: "Положить в MT4",
    d: "Файл → Открыть каталог данных → MQL4 → Experts. Положите .mq4 туда. MetaEditor: F7 (компиляция). В навигаторе терминала обновите Experts, перетащите SLOI_Desk на любой график (EURUSD достаточно — он сам подтянет список пар).",
  },
  {
    n: "04",
    t: "Разрешить интернет",
    d: `Сервис → Настройки → Советники: галки «Разрешить советнику торговать» и «Разрешить WebRequest». В список адресов добавьте ровно ${SITE_URL} (без слэша в конце). ОК. Перезапустите советник на графике.`,
  },
  {
    n: "05",
    t: "Проверить связь",
    d: "На панели сов: «сайт ок ключ». В кабинете через минуту появятся эквити и ордера. Если «советник молчит» — ключ в DeskKey пустой или адрес не в WebRequest. Если HTTP 403/4060 — домен не добавлен в список.",
  },
  {
    n: "06",
    t: "Как торгует",
    d: "Диспетчер считает разбор для всех одинаково и пишет BUY/SELL/WAIT. Ваш сов читает только свою ленту (?k=ключ), сверяет спред Ask−Bid вашего брокера и ставит лимит или рынок. Кнопки в кабинете (купить, продать, закрыть, авто стоп) — отдельные приказы, сов заберёт их с ленты за 10–20 секунд, пока он на графике и автоторговля включена.",
  },
];

const FAQ = [
  {
    q: "Чужой увидит мой счёт?",
    a: "Нет, если у него нет вашего ключа. Без ключа сайт счёт не показывает. Не кладите ключ в общий чат.",
  },
  {
    q: "Можно несколько терминалов?",
    a: "Один ключ — один стол. Второй компьютер: тот же ключ в кабинете и тот же DeskKey в сове. Два разных счёта — два кабинета (два ключа).",
  },
  {
    q: "Сигналы чужие или мои?",
    a: "Сценарий пары общий (один рынок). Исполнение, лот, спред и закрытие — только ваш счёт.",
  },
  {
    q: "Сов не открыл, хотя диспетчер купить?",
    a: "Смотрите строку на панели: спред, сверка, авто выкл, ждать лимит. Сайт не шлёт ордер в обход этих фильтров, кроме кнопок кабинета.",
  },
];

export function HowToDesk({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "" : "mt-12"}>
      <h2 className="text-2xl font-medium tracking-tight">Как подключить стол</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        Разбор на сайте общий. Счёт и ордера — только после ключа. Демо сначала.
      </p>
      <ol className="mt-6 space-y-3">
        {STEPS.map((row) => (
          <li key={row.n} className="panel-volume flex gap-4 rounded-lg p-4">
            <span className="font-mono text-xs text-accent">{row.n}</span>
            <div>
              <p className="text-sm font-medium">{row.t}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{row.d}</p>
            </div>
          </li>
        ))}
      </ol>
      <h3 className="mt-10 text-lg font-medium">Частые вопросы</h3>
      <ul className="mt-4 space-y-3">
        {FAQ.map((f) => (
          <li key={f.q} className="panel-volume rounded-lg p-4">
            <p className="text-sm font-medium">{f.q}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{f.a}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-muted">
        Подробности ещё на{" "}
        <Link to="/cabinet" className="text-fg underline-offset-4 hover:underline">
          Кабинете
        </Link>{" "}
        и{" "}
        <Link to="/advisor" className="text-fg underline-offset-4 hover:underline">
          Эксперте MT4
        </Link>
        .
      </p>
    </div>
  );
}
