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
    d: "В кабинете две кнопки. «Сов для клиентов» — без ClusterDelta, торгует сигналы сайта. «Сов хозяина» — ваш, с CD: лента объёмов на общий стол, счёт не публикуется.",
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
    d: "Диспетчер считает разбор и пишет BUY/SELL/WAIT. Сов читает ленту, сверяет спред вашего брокера. При ВИРТ ВКЛ отложка, стоп и тейк живут в советнике: у брокера рыночный ордер без SL/TP. Если стол сдвинул стоп или цель — сов переносит линии. Кнопки кабинета (купить, продать, закрыть) уходят в терминал за 10–20 секунд.",
  },
];

const FAQ = [
  {
    q: "ClusterDelta куда ставить?",
    a: "CD на сайт шлёт только хозяин (HostFeed=true, сов 4.82+). Гость CD не ставит и счёт хозяина не видит. Разбор объёмов общий.",
  },
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

const RULES = [
  {
    t: "График — карта, не ордер",
    d: "Зоны, стрелки, FVG, шарики CD показывают, что видит стол. Сделка только из плашки «приказ диспетчера»: лонг, шорт, ждать, пропуск.",
  },
  {
    t: "Не входим из середины",
    d: "Середина коробки — шум. Ищем край: вливание, VWAP, ордерблок, дисконт/премия. В середине дивер тоже не торгуем.",
  },
  {
    t: "Сплэш — не цель",
    d: "Оранжевый шарик: вынос стопов или старт. Не ставить тейк в середину такого бара и не догонять.",
  },
  {
    t: "Вливание — пол или цель",
    d: "Лаймовый шарик: объём остановил цену. От него вход или в него тейк. Не путать с FVG (зона-дыра).",
  },
  {
    t: "Спред съел ход — пропуск",
    d: "Даже красивая карта. Сов сверяет Ask−Bid вашего брокера с расстоянием до тейка.",
  },
  {
    t: "Новость рядом — тормоз",
    d: "До сильной новости стол запрещает. После — не ловить первый бар.",
  },
  {
    t: "Смена приказа — снять старое",
    d: "Диспетчер стал «ждать» — сов снимает виртуальную отложку и не держит зомби-сделку по старому лонгу.",
  },
];

const CHART = [
  { c: "Кирпич свечи", d: "Реальный OHLC (Yahoo / брокер). Тени не рисуем от себя." },
  { c: "FVG", d: "Жёлтая зона: дыра между 1-й и 3-й свечой. Магнит, слабее вливания." },
  { c: "Ордерблок / брейкер / митигейшн", d: "Подпись на зоне. Пробит телом и цена осталась — брейкер. Вернулись внутрь — митигейшн." },
  { c: "Ликвидность / съём", d: "Зелёная полоса: где стопы. Съём — уже сняли, часто откат." },
  { c: "VWAP", d: "Подпись на линии. Пол/магнит. Середина к VWAP — не вход." },
  { c: "Оранжевый шарик СПЛЭШ", d: "ClusterDelta Splash. Вынос." },
  { c: "Лаймовый шарик ВЛИВАНИЕ", d: "ClusterDelta Infusion. Остановка." },
  { c: "Синий шарик IMB CD", d: "ClusterDelta Imbalance: перекос Ask/Bid на цене. Точка, не зона FVG." },
  { c: "DIV / HID", d: "Кружок на свече: RSI-дивергенция (обычная / скрытая)." },
  { c: "Пунктир «Дивер CumDelta»", d: "Цена новый хай/лой, линия CVD нет. Рисуется, только если стол нашёл дивер." },
  { c: "CHoCH / BOS", d: "Смена характера / продолжение структуры." },
];

const TERMS = [
  { k: "CHoCH", v: "Смена характера: сломали предыдущий ход. Часто начало новой ноги." },
  { k: "BOS", v: "Пробой структуры по тренду." },
  { k: "FVG / разрыв", v: "Имбаланс смарт мани: цена прыгнула, дыра между свечами. Не путать с IMB CD." },
  { k: "IMB CD", v: "Перекос объёма Ask vs Bid на одном уровне с индюка Imbalance." },
  { k: "Сплэш", v: "Толчок объёма, стопы сняли или старт импульса." },
  { k: "Вливание / infusion", v: "Объём влили — цена встала. Пол или цель." },
  { k: "dPOC", v: "Цена дня, где торговали больше всего. Магнит." },
  { k: "Премия / дисконт", v: "Дорого / дёшево относительно диапазона. Лонг из дисконта, шорт из премии." },
  { k: "OTE", v: "Оптимальный вход: откат 62–79% внутри ноги." },
  { k: "SSL / BSL", v: "Ликвидность продавцов сверху / покупателей снизу (стопы)." },
  { k: "CVD / CumDelta", v: "Накопленная дельта (Ask−Bid). Линия внизу графика." },
  { k: "Дивер", v: "Цена одно, поток/RSI другое. См. раздел ниже." },
  { k: "Приказ / WAIT", v: "Что делать сов. WAIT = не открывать и снять отложку." },
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

export function SiteManual() {
  return (
    <div className="mt-14 space-y-12">
      <section>
        <h2 className="text-2xl font-medium tracking-tight">Как пользоваться сайтом</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted">
          <li>
            Главная — котировки и новости.{" "}
            <Link to="/daily" className="text-fg underline-offset-4 hover:underline">
              Сегодня
            </Link>{" "}
            — разбор одной пары человеческим языком.
          </li>
          <li>
            <Link to="/desk" className="text-fg underline-offset-4 hover:underline">Диспетчер</Link> — лента приказов по всем инструментам. Это закон для советника.
          </li>
          <li>
            <Link to="/desk" className="text-fg underline-offset-4 hover:underline">
              График
            </Link>{" "}
            — карта выбранной пары. Галочки сверху: FVG, блоки, ликвидность, дивергенции, профиль.
          </li>
          <li>Плашка «приказ диспетчера» сворачивается кликом. Бегущая строка — что делать сейчас, не локальный разбор.</li>
          <li>Чат под графиком — вопрос по любой паре. Ответ стола, не «нейросеть от балды».</li>
          <li>ТВ — эфир обзоров, не сигнал.</li>
        </ol>
      </section>

      <section>
        <h2 className="text-2xl font-medium tracking-tight">Правила стола</h2>
        <ul className="mt-4 space-y-3">
          {RULES.map((r) => (
            <li key={r.t} className="panel-volume rounded-lg p-4">
              <p className="text-sm font-medium">{r.t}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{r.d}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-medium tracking-tight">Что на графике</h2>
        <ul className="mt-4 space-y-2">
          {CHART.map((r) => (
            <li key={r.c} className="flex gap-3 text-sm leading-relaxed">
              <span className="w-44 shrink-0 font-medium text-fg">{r.c}</span>
              <span className="text-muted">{r.d}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-medium tracking-tight">Как подтверждается дивергенция</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Стол не рисует дивер «для красоты». Сначала считает, потом показывает.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted">
          <li>Берёт два последних хая (или лоя) на часовике.</li>
          <li>
            CVD: если есть линия ClusterDelta #CumDelta — сравнивает её на этих точках. Нет CD — прокси дельты со свечей.
          </li>
          <li>Новый хай, CVD ниже → медвежий. Новый лой, CVD выше → бычий. Тогда пунктир и пузырь «Дивер CumDelta».</li>
          <li>Параллельно RSI(14) на тех же свингах → кружок DIV (обычная) или HID (скрытая).</li>
          <li>
            Очки в приказ только на краю коробки (премия/дисконт, съём, блок). В середине дивер есть на графике как факт, в сделку не идёт.
          </li>
        </ol>
        <p className="mt-3 text-sm text-muted">
          Нет пунктира и нет DIV — стол дивер не нашёл. Линия CVD внизу сама по себе дивером не является.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-medium tracking-tight">Термины</h2>
        <dl className="mt-4 space-y-3">
          {TERMS.map((t) => (
            <div key={t.k} className="panel-volume rounded-lg p-4">
              <dt className="font-mono text-xs tracking-wide text-accent">{t.k}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted">{t.v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
