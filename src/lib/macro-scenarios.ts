import type { NewsHalt } from "@/lib/calendar";

export type MacroKind = "fomc" | "powell" | "ecb" | "boe" | "boj" | "nfp" | "cpi" | "us" | "none";
export type MacroPhase = "before" | "live" | "after" | "quiet";

export interface MacroPath {
  name: string;
  p: number;
  usd: "up" | "down" | "chop";
  when: string;
  move: string;
  therefore: string;
}

export interface MacroPlay {
  kind: MacroKind;
  event: string;
  phase: MacroPhase;
  headline: string;
  history: string;
  paths: MacroPath[];
  base: MacroPath;
  soon: string;
  trade: string;
}

const EMPTY: MacroPlay = {
  kind: "none",
  event: "",
  phase: "quiet",
  headline: "Крупного макро-события рядом нет — сценарии по ФРС не открываем.",
  history: "",
  paths: [],
  base: {
    name: "тишина",
    p: 0,
    usd: "chop",
    when: "",
    move: "",
    therefore: "",
  },
  soon: "",
  trade: "Смотрим структуру пары, не календарь.",
};

export function kindOfEvent(title: string): MacroKind {
  const t = title || "";
  if (/пауэл|powell|chair|выступлен/i.test(t) && !/англии|лагард|boj|ецб/i.test(t)) return "powell";
  if (/boe|банк англии|mpc |Англии/i.test(t)) return "boe";
  if (/ецб|ecb|лагард|lagarde/i.test(t)) return "ecb";
  if (/boj|банк японии/i.test(t)) return "boj";
  if (/fomc|фрс|federal funds|powell|rate statement/i.test(t) && !/окно|window|англии|ецб|япони/i.test(t)) return "fomc";
  if (/nfp|занятост|payroll|non-farm/i.test(t) && !/окно|window/i.test(t)) return "nfp";
  if (/\bcpi\b|инфляц|pce/i.test(t) && !/окно|window/i.test(t)) return "cpi";
  if (/us data|окно сша|cpi\/nfp\/fomc|data window/i.test(t)) return "us";
  return "none";
}

function phaseOf(minutes: number, active: boolean): MacroPhase {
  if (active && minutes > 0 && minutes <= 90) return "before";
  if (active && minutes <= 0 && minutes >= -40) return "live";
  if (minutes < 0 && minutes >= -240) return "after";
  if (minutes > 0 && minutes <= 24 * 60) return "before";
  return "quiet";
}

function norm(paths: MacroPath[]): MacroPath[] {
  const s = paths.reduce((a, x) => a + x.p, 0) || 1;
  return paths
    .map((x) => ({ ...x, p: Math.round((x.p / s) * 100) }))
    .sort((a, b) => b.p - a.p);
}

function tiltHawk(rates: "hawkish" | "dovish" | "quiet", hawk: number, dove: number, mid: number) {
  if (rates === "hawkish") return [hawk + 12, dove - 8, mid - 4];
  if (rates === "dovish") return [hawk - 8, dove + 12, mid - 4];
  return [hawk, dove, mid];
}

function pack(
  kind: MacroKind,
  event: string,
  phase: MacroPhase,
  rates: "hawkish" | "dovish" | "quiet",
): MacroPlay {
  if (kind === "none") return EMPTY;

  if (kind === "fomc") {
    const [h, d, m] = tiltHawk(rates, 28, 22, 50);
    const paths = norm([
      {
        name: "как ждали",
        p: m,
        usd: "chop",
        when: "1–5 мин всплеск, 30–90 мин возврат",
        move: "EUR ~20–40 п., золото $8–15, если нет сюрприза",
        therefore: "Первый импульс часто ложный. Крупняк не покупает заголовок, ждёт пресс-конференцию и закрытие часа.",
      },
      {
        name: "ястреб (жёстче)",
        p: h,
        usd: "up",
        when: "15 мин → 2–4 часа, если пресс-конф. подтвердит",
        move: "EUR 50–90 п. вниз, золото $20–40 вниз, USDJPY вверх",
        therefore: "Доходности вверх, доллар нужен. Не ловить дно евро/золота в первые минуты.",
      },
      {
        name: "голубь (мягче)",
        p: d,
        usd: "down",
        when: "то же окно: сначала шип, потом ход 1–4 ч",
        move: "EUR 50–90 п. вверх, золото $20–40 вверх",
        therefore: "Деньги дешевеют. Не шортить золото/евро на первом зелёном баре.",
      },
    ]);
    return {
      kind,
      event,
      phase,
      headline: "ФРС: три дороги. Вероятности — шаблон истории, не угадайка.",
      history:
        "После решения 2 минуты — роботы по заголовку. 20–40 мин — текст. Час+ — Пауэлл. Сюрприз даёт тренд на сессию, «как ждали» чаще затухает к Нью-Йорку.",
      paths,
      base: paths[0]!,
      soon: phase === "before" ? "До цифры ход тонкий. Спред убьёт лимитку." : phase === "live" ? "Сейчас окно хаоса: 5–15 мин не торговать направление." : "Импульс уже был. Смотрим, удержали ли первый час.",
      trade: phase === "live" || phase === "before" ? "Стоп новых входов до закрытия первого часа после ФРС." : "Если сюрприз удержался — тренд. Если вернули диапазон — «как ждали», лимит на край.",
    };
  }

  if (kind === "powell") {
    const [h, d, m] = tiltHawk(rates, 30, 30, 40);
    const paths = norm([
      {
        name: "тон как рынок уже заложил",
        p: m,
        usd: "chop",
        when: "пока говорит (20–40 мин), потом 1–2 ч затухание",
        move: "EUR 15–30 п. туда-сюда",
        therefore: "Речь без новой цифры чаще шумит, чем даёт день. Крупняк слушает слова «устойчиво / готовы резать».",
      },
      {
        name: "жёстче рынка",
        p: h,
        usd: "up",
        when: "в моменте + час после",
        move: "доллар и доходности вверх, золото вниз",
        therefore: "Если сказал «инфляция липкая / ставки выше дольше» — не ловить отскок евро сразу.",
      },
      {
        name: "мягче рынка",
        p: d,
        usd: "down",
        when: "в моменте + час после",
        move: "доллар вниз, золото вверх",
        therefore: "Слова про замедление и готовность снизить — попутный фон металлу. Первые минуты всё равно шип.",
      },
    ]);
    return {
      kind,
      event,
      phase,
      headline: "Пауэлл: рынок торгует тон, не ставку.",
      history: "Речь главы ФРС двигает меньше, чем FOMC, но быстрее, чем обычный день. Часто возвращают 50–70% шипа в тот же день.",
      paths,
      base: paths[0]!,
      soon: phase === "live" ? "Пока микрофон открыт — спред широкий, направление врёт." : "После речи смотрим, остался ли доллар с той стороны, куда дёрнули.",
      trade: "Не рынок в спич. Лимит после закрытия 15–60м бара в сторону удержанного шипа, иначе ждать.",
    };
  }

  if (kind === "ecb") {
    const paths = norm([
      { name: "как ждали", p: 50, usd: "chop", when: "5–40 мин", move: "EUR 20–40 п. шум", therefore: "Евро часто возвращает заголовок к пресс-конференции Лагард." },
      { name: "жёстче", p: 25, usd: "down", when: "1–4 ч", move: "EURUSD вверх 50–80 п.", therefore: "ЕЦБ ястреб — евро, не доллар. USDJPY может не слушаться." },
      { name: "мягче", p: 25, usd: "up", when: "1–4 ч", move: "EURUSD вниз", therefore: "Голубь ЕЦБ бьёт евро. Не ловить дно в первую минуту." },
    ]);
    return { kind, event, phase, headline: "ЕЦБ бьёт евро, не весь доллар.", history: "Как FOMC, но пара EUR*. Йена и золото реагируют слабее.", paths, base: paths[0]!, soon: "Окно как у ФРС: сначала шип, потом текст.", trade: "До часа после — не новые входы по EUR." };
  }

  if (kind === "boe") {
    const paths = norm([
      { name: "как ждали", p: 48, usd: "chop", when: "5–40 мин", move: "GBP 20–40 п. шум", therefore: "Банк Англии часто «как ждали». Первый шип по фунту часто возвращают." },
      { name: "жёстче", p: 28, usd: "down", when: "1–4 ч", move: "GBPUSD вверх, EURGBP вниз", therefore: "Ястреб BOE — фунт в спросе. EUR/GBP логичнее шорт, не лонг евро против фунта." },
      { name: "мягче", p: 24, usd: "up", when: "1–4 ч", move: "GBPUSD вниз, EURGBP вверх", therefore: "Голубь BOE — фунт отдают. Лонг EUR/GBP только если цена уже пошла вверх, не в шип." },
    ]);
    return {
      kind,
      event,
      phase,
      headline: "Банк Англии бьёт фунт, не ФРС.",
      history: "Как ставка, но GBP*. Евро и золото слушаются слабее, чем на FOMC.",
      paths,
      base: paths[0]!,
      soon: phase === "live" ? "Пока решение — спред на фунте врёт." : "Смотрим фунт и EUR/GBP, не долларовый сценарий ФРС.",
      trade: "До часа после — не рынок по GBP. Если одна сторона вероятнее и цена уже пошла туда — лимит можно.",
    };
  }

  if (kind === "boj") {
    const paths = norm([
      { name: "без сюрприза", p: 55, usd: "chop", when: "15–60 мин", move: "USDJPY 40–80 п. шум", therefore: "Банк Японии часто «ничего», йена всё равно дёргается — потом возвращают." },
      { name: "ястреб / интервенция", p: 25, usd: "down", when: "минуты–часы", move: "USDJPY резко вниз", therefore: "Редкие удары сильные. Не ловить нож йены." },
      { name: "ещё мягче", p: 20, usd: "up", when: "1–4 ч", move: "USDJPY вверх", therefore: "Расхождение со ФРС — йена слабее дольше." },
    ]);
    return { kind, event, phase, headline: "Банк Японии: окно для йены, не для евро.", history: "Сюрпризы редкие, но ход USDJPY больше, чем у евро на FOMC.", paths, base: paths[0]!, soon: "Первые минуты — спред на йене взрывной.", trade: "Кроссы с JPY не открывать до закрытия часа." };
  }

  if (kind === "nfp") {
    const paths = norm([
      { name: "близко к прогнозу", p: 45, usd: "chop", when: "1–15 мин шип, 30–90 мин затухание", move: "EUR 30–50 п. туда-сюда", therefore: "NFP без сюрприза — классика ложного выноса стопов. Не торговать первый принт." },
      { name: "сильно выше", p: 28, usd: "up", when: "час–сессия", move: "доллар вверх, золото вниз", therefore: "Сильный рынок труда = ФРС может не резать. Тренд, если не переписали через 30 мин." },
      { name: "сильно ниже", p: 27, usd: "down", when: "час–сессия", move: "доллар вниз, золото вверх", therefore: "Слабые payrolls — голубиный шип. Смотри безработицу и ревизии." },
    ]);
    return { kind, event, phase, headline: "NFP: сначала роботы, потом ревизия.", history: "Первые 60 секунд часто против итога дня. Через полчаса цифра «устаканивается».", paths, base: paths[0]!, soon: phase === "live" ? "Сейчас нельзя оценивать направление." : "После 30–60 мин видно, чей это день.", trade: "До 30 мин после NFP — halt. Потом только если час закрылся в сторону сюрприза." };
  }

  if (kind === "us") {
    const paths = norm([
      { name: "цифра «как ждали»", p: 48, usd: "chop", when: "1–5 мин шип, 30–90 мин возврат", move: "EUR 20–40 п. шум", therefore: "В этом слоте обычно CPI, NFP или FOMC. Без сюрприза крупняк не даёт день — снимает стопы и возвращает." },
      { name: "жёстче / сильнее США", p: 27, usd: "up", when: "15 мин → 2–4 часа", move: "доллар вверх, золото и евро вниз", therefore: "Горячий CPI, сильный NFP или ястреб ФРС. Не ловить дно евро в первую минуту." },
      { name: "мягче / слабее США", p: 25, usd: "down", when: "15 мин → 2–4 часа", move: "доллар вниз, золото вверх", therefore: "Холодный CPI, слабый NFP или голубь ФРС. Не шортить золото на первом баре." },
    ]);
    return {
      kind,
      event,
      phase,
      headline: "Окно США 12:30 GMT. Лента не уточнила, что именно — три дороги одни и те же.",
      history: "Пока XML календаря молчит, стол ставит типичное окно. Сюрприз даёт сессию, «как ждали» затухает за час.",
      paths,
      base: paths[0]!,
      soon: phase === "live" ? "Окно открыто: первые минуты не направление." : "К 12:30 GMT смотрите ленту: CPI, NFP или ставка.",
      trade: "Не открывать рынок за 15 мин до окна и 15 мин после. Лимит — после закрытия часа.",
    };
  }

  const paths = norm([
    { name: "как ждали", p: 42, usd: "chop", when: "5–40 мин", move: "EUR 20–40 п.", therefore: "CPI в прогнозе — шип и возврат. Core важнее headline." },
    { name: "горячее", p: 30, usd: "up", when: "1–4 ч", move: "доллар и доходности вверх", therefore: "Выше инфляции = ФРС жёстче. Золото часто падает сразу, потом может ожить как хедж." },
    { name: "холоднее", p: 28, usd: "down", when: "1–4 ч", move: "доллар вниз, золото вверх", therefore: "Ниже инфляции — самый чистый голубиный день для металла." },
  ]);
  return { kind, event, phase, headline: "Инфляция: core, не заголовок.", history: "CPI/PCE двигают как мини-FOMC без пресс-конференции. Ход короче, чем ставка.", paths, base: paths[0]!, soon: "Первые минуты — не направление.", trade: "Halt до 15–30 мин. Затем час в сторону сюрприза или ждать край." };
}

export function pairLine(id: string, path: MacroPath): string {
  const usdUp = path.usd === "up";
  const usdDn = path.usd === "down";
  if (path.usd === "chop") return `${id}: шум, не тренд.`;
  if (id === "XAUUSD" || id === "XAGUSD") return usdUp ? `${id}: давление, не ловить дно.` : `${id}: попутный фон вверх после шипа.`;
  if (id === "USDJPY") return usdUp ? `${id}: легче вверх.` : `${id}: йена может окрепнуть.`;
  if (id === "USDCAD") return usdUp ? `${id}: доллар сильнее, CAD тяжелее.` : `${id}: доллар слабее.`;
  if (/USD$/.test(id) && id !== "USDJPY" && id !== "USDCHF" && id !== "USDCAD") {
    return usdUp ? `${id}: против доллара тяжелее.` : `${id}: против доллара легче вверх.`;
  }
  if (id.startsWith("USD")) return usdUp ? `${id}: доллар в числителе — легче вверх.` : `${id}: доллар слабее.`;
  if (usdDn) return `${id}: если риск включится — легче.`;
  return `${id}: если риск выключат — тяжелее.`;
}

export function buildMacroPlay(
  halt: NewsHalt,
  rates: "hawkish" | "dovish" | "quiet",
  themes: string[],
): MacroPlay {
  const title = halt.active ? halt.event : halt.next?.event || halt.event || themes.join(" ");
  const kind = kindOfEvent(title) || kindOfEvent(themes.join(" "));
  if (kind === "none") return EMPTY;
  const minutes = halt.active ? halt.minutes : halt.next ? Math.round((halt.next.at - Date.now()) / 60000) : halt.minutes;
  const phase = phaseOf(minutes, halt.active);
  if (phase === "quiet" && !themes.some((t) => kindOfEvent(t) !== "none")) return EMPTY;
  return pack(kind, title || kind, phase, rates);
}

export function playForEvent(
  title: string,
  at: number,
  rates: "hawkish" | "dovish" | "quiet" = "quiet",
): MacroPlay {
  const minutes = Math.round((at - Date.now()) / 60_000);
  const halt: NewsHalt = {
    active: minutes <= 45 && minutes >= -40,
    event: title,
    country: "",
    at,
    minutes,
    line: title,
    impact: "High",
    next: minutes > 45 ? { event: title, at, label: title } : null,
  };
  return buildMacroPlay(halt, rates, [title]);
}

export function playWanted(id: string, play: MacroPlay | null | undefined): "up" | "down" | "flat" {
  if (!play || play.kind === "none" || play.base.p < 35) return "flat";
  if (play.phase === "quiet") return "flat";
  return wantedFromUsd(id, play.kind, play.base.usd);
}

function wantedFromUsd(id: string, kind: MacroKind, usd: MacroPath["usd"]): "up" | "down" | "flat" {
  if (usd === "chop") return "flat";
  const usdUp = usd === "up";
  if (id === "EURGBP") {
    if (kind === "boe") return usdUp ? "up" : "down";
    if (kind === "ecb") return usdUp ? "down" : "up";
    return "flat";
  }
  if (id === "GBPUSD" && kind === "boe") return usdUp ? "down" : "up";
  if (id === "XAUUSD" || id === "XAGUSD") return usdUp ? "down" : "up";
  if (id === "USDJPY" || id === "USDCHF" || id === "USDCAD") return usdUp ? "up" : "down";
  if (/USD$/.test(id)) return usdUp ? "down" : "up";
  if (id.startsWith("USD")) return usdUp ? "up" : "down";
  if (/JPY/.test(id) && kind === "boj") return usdUp ? "down" : "up";
  if (/GBP/.test(id) && kind === "boe") return usdUp ? "down" : "up";
  return "flat";
}

export function sideOdds(id: string, play: MacroPlay | null | undefined): { long: number; short: number } {
  if (!play || play.kind === "none") return { long: 0, short: 0 };
  let long = 0;
  let short = 0;
  for (const x of play.paths) {
    const w = wantedFromUsd(id, play.kind, x.usd);
    if (w === "up") long += x.p;
    if (w === "down") short += x.p;
  }
  return { long, short };
}

export function playAligned(
  id: string,
  play: MacroPlay | null | undefined,
  action: "long" | "short",
  last?: number,
  prev?: number,
): { ok: boolean; boost: number; note: string } {
  if (!play || play.kind === "none") {
    return { ok: false, boost: 0, note: "" };
  }
  const odds = sideOdds(id, play);
  const forUs = action === "long" ? odds.long : odds.short;
  const vs = action === "long" ? odds.short : odds.long;
  const moved =
    last == null || prev == null || prev === last
      ? false
      : action === "long"
        ? last > prev
        : last < prev;
  if (forUs > vs && forUs >= 22 && moved) {
    const boost = forUs >= 40 ? 12 : forUs >= 30 ? 8 : 6;
    return {
      ok: true,
      boost,
      note: `${action === "long" ? "Лонг" : "Шорт"} ${forUs}% vs ${vs}%, цена уже пошла сюда — вход разрешаю.`,
    };
  }
  if (play.base.usd === "chop" || play.base.p < 35) {
    return { ok: false, boost: 0, note: "" };
  }
  const w = playWanted(id, play);
  const want = action === "long" ? "up" : "down";
  if (w !== want) return { ok: false, boost: 0, note: "" };
  const boost = play.base.p >= 50 ? 12 : play.base.p >= 40 ? 8 : 5;
  return {
    ok: true,
    boost,
    note: `Прогноз ${play.base.p}% «${play.base.name}» в нашу сторону — вход усиливаю, не режу.`,
  };
}

export function playCuts(
  id: string,
  play: MacroPlay | null | undefined,
  action: "long" | "short",
): { cut: boolean; note: string } {
  if (!play || play.kind === "none") return { cut: false, note: "" };
  const odds = sideOdds(id, play);
  if (odds.long + odds.short < 20) return { cut: false, note: "" };
  const forUs = action === "long" ? odds.long : odds.short;
  const vs = action === "long" ? odds.short : odds.long;
  if (vs > forUs + 2) {
    return {
      cut: true,
      note: `${action === "long" ? "Лонг" : "Шорт"} ${forUs}% слабее, чем ${vs}% в другую сторону. Этот вход режу.`,
    };
  }
  return { cut: false, note: "" };
}

export function playText(play: MacroPlay): string {
  if (play.kind === "none") return "";
  const rows = play.paths.map((x) => `${x.p}% ${x.name}: ${x.when}. ${x.move}`).join(" ");
  return `${play.headline} ${play.soon} База: ${play.base.name} (${play.base.p}%). ${rows} ${play.trade}`;
}
