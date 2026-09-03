import type { SmcSnapshot } from "@/lib/smc/engine";
import type { BrokerAccount } from "@/lib/broker-tape";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { BookOpen, Cpu } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";

export function AccountBanner({
  account,
  focus,
  className,
}: {
  account: BrokerAccount | null | undefined;
  focus?: string;
  className?: string;
}) {
  const money = (n: number) =>
    n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!account) {
    return (
      <div className={cn("mx-4 mt-2 rounded-lg bg-elevated/70 px-4 py-3", className)}>
        <p className="font-mono text-[10px] tracking-[0.18em] text-accent">СЧЁТ MT4</p>
        <p className="mt-1 text-sm font-medium">советник молчит</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Войдите в кабинет и повесьте SLOI_Desk 4.40 с вашим ключом. Иначе стол не знает, чей это счёт, и ничего не
          показывает. Сервис → Настройки → Советники → WebRequest: sloi-kohl.vercel.app
        </p>
      </div>
    );
  }
  const dd = account.balance > 0 ? ((account.equity - account.balance) / account.balance) * 100 : 0;
  return (
    <div className={cn("mx-4 mt-2 rounded-lg bg-elevated/70 px-4 py-3", className)}>
      <p className="font-mono text-[10px] tracking-[0.18em] text-accent">СЧЁТ MT4 · …{account.login}</p>
      <p className="mt-1 text-sm font-medium">
        {money(account.equity)} {account.currency} эквити
        <span className={cn("ml-2", account.profit >= 0 ? "text-bull" : "text-bear")}>
          {account.profit >= 0 ? "+" : ""}
          {money(account.profit)}
        </span>
      </p>
      <p className="mt-1 text-xs text-muted">
        баланс {money(account.balance)} · свободно {money(account.free)} · маржа {money(account.margin)} · 1:
        {account.leverage}
        {dd < -0.05 ? ` · просадка ${dd.toFixed(1)}%` : ""}
        {account.server ? ` · ${account.server}` : ""}
      </p>
      {account.positions.length === 0 ? (
        <p className="mt-2 text-xs text-dim">Открытых ордеров нет.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {account.positions.map((p) => (
            <li
              key={p.ticket}
              className={cn(
                "flex justify-between gap-2 font-mono text-xs",
                focus && p.id === focus ? "text-fg" : "text-muted",
              )}
            >
              <span>
                {p.id} {p.side === "buy" ? "BUY" : "SELL"} {p.lots}
                {p.magic === 220826 ? "" : " · чужой"}
              </span>
              <span className={p.profit >= 0 ? "text-bull" : "text-bear"}>
                {p.profit >= 0 ? "+" : ""}
                {money(p.profit)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ChochBanner({
  snap,
  len,
  closeOnly,
}: {
  snap: SmcSnapshot;
  len: 2 | 3 | 4;
  closeOnly: boolean;
}) {
  const ev = [...snap.events].reverse().find((e) => e.kind === "CHoCH") ?? snap.events.at(-1);
  const mode = len === 2 ? "мягко (2 бара)" : len === 4 ? "жёстко (4 бара)" : "норма (3 бара)";
  return (
    <div className="mx-4 mt-2 rounded-lg bg-elevated/70 px-4 py-3">
      <p className="font-mono text-[10px] tracking-[0.18em] text-accent">CHoCH · СТРУКТУРА</p>
      <p className="mt-1 text-sm font-medium">
        {ev
          ? `${ev.kind} ${ev.side === "bull" ? "вверх" : "вниз"}`
          : "пока нет слома"}
        {` · свинг ${mode}`}
        {closeOnly ? " · только закрытие" : " · тень тоже считается"}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {ev?.kind === "CHoCH"
          ? ev.side === "bull"
            ? "Смена характера вверх: предыдущий медвежий ход сломали. Лонг ищут от зоны, не вдогонку хаю."
            : "Смена характера вниз: предыдущий бычий ход сломали. Шорт ищут от зоны, не вдогонку лою."
          : ev?.kind === "BOS"
            ? "BOS — продолжение той же стороны, не разворот. CHoCH ещё не было."
            : "CHoCH = слом последнего противоположного экстремума. Без него стол не считает разворот подтверждённым."}
      </p>
    </div>
  );
}

export function ClusterBanner({ snap }: { snap: SmcSnapshot }) {
  const c = snap.clusters;
  const stack = c.stacked[0];
  return (
    <div className="mx-4 mt-2 rounded-lg bg-elevated/70 px-4 py-3">
      <p className="font-mono text-[10px] tracking-[0.18em] text-accent">
        КЛАСТЕР {c.source === "trades" ? "· ЛЕНТА СДЕЛОК" : c.source === "cme" ? "· CME DELAYED" : "· ПРОФИЛЬ СВЕЧЕЙ"}
      </p>
      <p className="mt-1 text-sm font-medium">
        POC {c.poc.toFixed(2)}
        {stack ? ` · стек ${stack.side === "buy" ? "покупок" : "продаж"}` : ""}
        {c.unfinished ? ` · незакрытый ${c.unfinished === "high" ? "верх" : c.unfinished === "low" ? "низ" : "оба края"}` : ""}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{c.therefore}</p>
    </div>
  );
}

export function BookBanner({
  book,
  iceberg,
}: {
  book: { bids: { price: number; volume: number }[]; asks: { price: number; volume: number }[]; iceberg: string | null } | null;
  iceberg?: string;
}) {
  return (
    <div className="mx-4 mt-2 rounded-lg bg-elevated/70 px-4 py-3">
      <p className="font-mono text-[10px] tracking-[0.18em] text-accent">СТАКАН · АЙСБЕРГ</p>
      {book && (book.bids.length || book.asks.length) ? (
        <>
          <div className="mt-2 grid grid-cols-2 gap-3 font-mono text-xs">
            <div>
              <p className="text-dim">ASK</p>
              {book.asks.slice(0, 5).map((l) => (
                <p key={`a${l.price}`} className="text-bear">
                  {l.price} · {l.volume}
                </p>
              ))}
            </div>
            <div>
              <p className="text-dim">BID</p>
              {book.bids.slice(0, 5).map((l) => (
                <p key={`b${l.price}`} className="text-bull">
                  {l.price} · {l.volume}
                </p>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            {book.iceberg ?? "Объёмы в стакане с вашего MT4. Толстый уровень — возможный айсберг."}
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Живой стакан MT4 не отдаёт (это MQL5). Айсберг — по свечам: {iceberg ?? "большой объём без хода, дельта около нуля."}
        </p>
      )}
    </div>
  );
}

export function AuctionBanner({ snap }: { snap: SmcSnapshot }) {
  const a = snap.auction;
  const iv = snap.ivNews;
  const orb =
    a.orb === "broke-high"
      ? "вышли вверх"
      : a.orb === "broke-low"
        ? "вышли вниз"
        : a.orb === "failed-high"
          ? "ложный верх"
          : a.orb === "failed-low"
            ? "ложный низ"
            : "внутри IB";
  return (
    <div className="mx-4 mt-2 grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg bg-elevated/70 px-4 py-3">
        <p className="font-mono text-[10px] tracking-[0.18em] text-accent">IB / ORB · НЕДЕЛЯ · ATR</p>
        <p className="mt-1 text-sm font-medium">
          {orb}
          {a.ib ? ` · ${a.ib.session}` : ""}
          {` · ${a.vol === "compressed" ? "сжатие" : a.vol === "expanded" ? "расширение" : "норма"}`}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">{a.therefore}</p>
      </div>
      <div className="rounded-lg bg-elevated/70 px-4 py-3">
        <p className="font-mono text-[10px] tracking-[0.18em] text-accent">КОРРЕЛЯЦИЯ · IV</p>
        <p className="mt-1 text-sm font-medium">{snap.corr.status === "for" ? "ветер попутный" : snap.corr.status === "against" ? "ветер встречный" : "ветер боком"}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {snap.corr.note} {iv.therefore}
        </p>
      </div>
    </div>
  );
}

export function FlowBanner({ snap }: { snap: SmcSnapshot }) {
  const f = snap.flow;
  const ev = f.events[0];
  return (
    <div className="mx-4 mt-2 rounded-lg bg-elevated/70 px-4 py-3">
      <p className="font-mono text-[10px] tracking-[0.18em] text-accent">
        ОБЪЁМ · ДЕЛЬТА · CVD {f.source === "tape" ? "· ЛЕНТА" : snap.micro.footprint.source === "cme-delayed" ? `· CME ${snap.micro.cmeTicker ?? ""}` : "· ОЦЕНКА"}
      </p>
      <p className="mt-1 text-sm font-medium">
        дельта {f.lastDelta >= 0 ? "+" : ""}
        {Math.round(f.lastDelta)} · CVD {f.cvdSlope === "up" ? "растёт" : f.cvdSlope === "down" ? "падает" : "боковик"}
        {f.cvdDiv ? ` · дивергенция CVD ${f.cvdDiv.side === "bull" ? "бычья" : "медвежья"}` : ""}
        {ev ? ` · ${ev.kind === "hft-burst" ? "HFT" : ev.kind === "absorption" ? "поглощение" : ev.kind}` : ""}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {snap.localSetup.thesis.includes("infusion")
          ? `${snap.localSetup.thesis} Сплэш — не цель.`
          : (f.cvdDiv?.therefore ?? ev?.therefore ?? "Столбики объёма красятся дельтой. Тейк — в чужой infusion (остановка), не через него.")}
      </p>
    </div>
  );
}

export function PatternBanner({ snap }: { snap: SmcSnapshot }) {
  const p = snap.patterns[0];
  return (
    <div className="mx-4 mt-2 grid gap-2 sm:grid-cols-2">
      <div className="rounded-lg bg-elevated/70 px-4 py-3">
        <p className="font-mono text-[10px] tracking-[0.18em] text-accent">ВАЙКОФФ</p>
        <p className="mt-1 text-sm font-medium">{snap.wyckoff.name}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">{snap.wyckoff.therefore}</p>
      </div>
      <div className="rounded-lg bg-elevated/70 px-4 py-3">
        <p className="font-mono text-[10px] tracking-[0.18em] text-accent">
          {p?.family === "harmonic" ? "ГАРМОНИКА" : "ПАТТЕРН"}
        </p>
        <p className="mt-1 text-sm font-medium">{p ? p.name : "чистой фигуры нет"}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">{p ? p.therefore : "Свинги не сложились в голову-плечи, двойную вершину или Gartley/Bat/ABCD."}</p>
      </div>
    </div>
  );
}

export function MarginBanner({ snap, decimals }: { snap: SmcSnapshot; decimals: number }) {
  const band = snap.margin.where === "upper" ? snap.margin.upper : snap.margin.where === "lower" ? snap.margin.lower : null;
  return (
    <div className={cn("mx-4 mt-3 rounded-lg px-4 py-3", band ? "panel-volume" : "bg-elevated/50")}>
      <p className="font-mono text-[10px] tracking-[0.18em] text-accent">МАРЖИНАЛЬНЫЕ ЗОНЫ</p>
      {band ? (
        <>
          <p className="mt-1 text-sm font-medium">
            {band.name}: {formatPrice(band.bottom, decimals)}–{formatPrice(band.top, decimals)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{band.hint}</p>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted">
          Цена внутри диапазона. Верхняя маржа от {formatPrice(snap.margin.upper.bottom, decimals)}, нижняя до{" "}
          {formatPrice(snap.margin.lower.top, decimals)}.
        </p>
      )}
    </div>
  );
}

export function AnalyzeBar({
  autoAnalyze,
  setAutoAnalyze,
  onRun,
  onJournal,
  snapReady,
  aiLoading,
  aiModel,
}: {
  autoAnalyze: boolean;
  setAutoAnalyze: (on: boolean) => void;
  onRun: () => void;
  onJournal: () => void;
  snapReady: boolean;
  aiLoading: boolean;
  aiModel: string | null;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Cpu className="size-4 text-muted" />
          <p className="text-sm font-medium">Разбор</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-dim">{autoAnalyze ? "нейросеть сама" : "по кнопке"}</span>
          <Switch checked={autoAnalyze} onCheckedChange={setAutoAnalyze} aria-label="Авторазбор" />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button className="flex-1" onClick={onRun} disabled={!snapReady || aiLoading}>
          {aiLoading ? "Считаю…" : "Разобрать нейросетью"}
        </Button>
        <Button variant="outline" onClick={onJournal} disabled={!snapReady} aria-label="В журнал">
          <BookOpen className="size-4" />
        </Button>
      </div>
      <p className="pt-3 text-xs text-dim">
        {aiModel
          ? `Ответ: ${aiModel}. Движок SMC считает уровни сам; модель только пересказывает.`
          : "Движок SMC считает уровни сам. Модель (Grok / Llama / Gemini) — по ключу в Vercel."}
      </p>
    </div>
  );
}

export function ConfluenceList({ snap }: { snap: SmcSnapshot | null }) {
  if (!snap) return <p className="text-sm text-muted">Ждём данные.</p>;
  return (
    <ul className="space-y-2">
      {snap.confluence.map((c) => (
        <li key={c.id} className="rounded-md bg-elevated p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">{c.layer}</span>
            <Badge tone={c.status === "for" ? "bull" : c.status === "against" ? "bear" : "neutral"}>
              {c.status === "for" ? "за" : c.status === "against" ? "против" : "нейтр."}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted">{c.note}</p>
        </li>
      ))}
    </ul>
  );
}

export function LevelsTable({ snap, decimals }: { snap: SmcSnapshot | null; decimals: number }) {
  if (!snap) return <p className="text-sm text-muted">Нет уровней.</p>;
  const rows = [
    { name: "Range high", price: snap.dealingRange.high },
    { name: "Маржа верх", price: snap.margin.upper.bottom },
    { name: "OTE high", price: snap.ote.high },
    { name: "Equilibrium", price: snap.dealingRange.eq },
    { name: "OTE low", price: snap.ote.low },
    { name: "Маржа низ", price: snap.margin.lower.top },
    { name: "Range low", price: snap.dealingRange.low },
    { name: "POC", price: snap.volumeProfile.poc },
    { name: "VAH", price: snap.volumeProfile.vah },
    { name: "VAL", price: snap.volumeProfile.val },
    ...snap.orderBlocks.slice(0, 4).map((z) => ({ name: `OB ${z.side}`, price: (z.top + z.bottom) / 2 })),
    ...snap.fvgs.slice(0, 4).map((z) => ({ name: `FVG ${z.side}`, price: (z.top + z.bottom) / 2 })),
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-dim">
          <tr>
            <th className="pb-2 font-medium">Уровень</th>
            <th className="pb-2 font-medium">Цена</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {rows.map((r) => (
            <tr key={r.name + r.price} className="border-t border-border">
              <td className="py-2 font-sans text-muted">{r.name}</td>
              <td className="py-2">{formatPrice(r.price, decimals)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
