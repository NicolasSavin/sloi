import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AccountBanner } from "@/components/desk/desk-banners";
import { SaveExpert } from "@/components/advisor/save-expert";
import { createDeskFn, deskCommandFn, openDeskFn } from "@/lib/desk-api";
import { clearDeskKey, readDeskKey, writeDeskKey } from "@/lib/desk-key";
import { DEFAULT_EA, PAIR_OPTIONS, type EaSettings } from "@/lib/ea-settings";
import { SITE_URL } from "@/lib/brand";
import { fetchBroker } from "@/lib/market/fetch";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { BrokerAccount } from "@/lib/broker-tape";

export function CabinetGate() {
  const [key, setKey] = useState("");
  const [paste, setPaste] = useState("");
  const [prefix, setPrefix] = useState("");
  const [fresh, setFresh] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sym, setSym] = useState("EURUSD");
  const [note, setNote] = useState("");

  useEffect(() => {
    const k = readDeskKey();
    if (!k) return;
    setKey(k);
    void openDeskFn({ data: { key: k } }).then((r) => {
      if (r.ok) setPrefix(r.prefix);
      else {
        clearDeskKey();
        setKey("");
      }
    });
  }, []);

  const brokerQ = useQuery({
    queryKey: ["broker-book", key],
    queryFn: () => fetchBroker({ data: { key } }),
    enabled: Boolean(key),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
  const account: BrokerAccount | null = brokerQ.data?.account ?? null;

  const enter = async (k: string) => {
    setBusy(true);
    setErr("");
    const r = await openDeskFn({ data: { key: k } });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    writeDeskKey(k);
    setKey(k);
    setPrefix(r.prefix);
    setFresh("");
  };

  const create = async () => {
    setBusy(true);
    setErr("");
    const r = await createDeskFn();
    setBusy(false);
    writeDeskKey(r.key);
    setKey(r.key);
    setPrefix(r.prefix);
    setFresh(r.key);
  };

  const cmd = async (kind: "PAUSE" | "RESUME" | "CLOSE_ALL" | "CLOSE_PROFIT" | "CLOSE" | "BUY" | "SELL") => {
    if (!key) return;
    setNote("шлю команду…");
    const r = await deskCommandFn({
      data: { key, kind, symbol: kind === "CLOSE" || kind === "BUY" || kind === "SELL" ? sym : undefined },
    });
    setNote(r.ok ? `Команда ${kind} в очереди. Советник заберёт с ленты за ~20 сек.` : r.error);
  };

  const settings: EaSettings = { ...DEFAULT_EA, deskKey: key };

  if (!key) {
    return (
      <div className="panel-volume rounded-xl p-5 sm:p-8">
        <p className="font-mono text-xs tracking-[0.2em] text-accent">ЛИЧНЫЙ СТОЛ</p>
        <h2 className="mt-3 text-2xl font-medium">Свой ключ — свои ордера</h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Разбор рынка общий. Счёт, котировки брокера и команды — только ваши. Создайте стол или вставьте ключ с другого
          устройства. Чужой советник без вашего ключа сюда не попадёт.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void create()}>
            Создать мой стол
          </Button>
        </div>
        <label className="mt-6 block">
          <span className="text-xs text-dim">уже есть ключ</span>
          <input
            value={paste}
            onChange={(e) => setPaste(e.target.value.trim())}
            placeholder="sloi_…"
            className="mt-1 h-11 w-full rounded-sm bg-subtle px-3 font-mono text-sm"
          />
        </label>
        <Button className="mt-3" variant="outline" disabled={busy || paste.length < 10} onClick={() => void enter(paste)}>
          Войти
        </Button>
        {err ? <p className="mt-3 text-sm text-bear">{err}</p> : null}
        <p className="mt-6 text-xs leading-relaxed text-dim">
          Ниже на странице — шаги: ключ, скачать 4.42, каталог Experts, WebRequest, как проверить «сайт ок ключ» и как
          жать купить/закрыть с сайта.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="panel-volume rounded-xl p-5">
        <p className="font-mono text-xs tracking-[0.2em] text-accent">КАБИНЕТ · {prefix}…</p>
        <p className="mt-2 text-sm text-muted">
          Лента советника: <span className="font-mono text-fg">{SITE_URL}/api/signals.txt?k=…</span>
        </p>
        {fresh ? (
          <div className="mt-4 rounded-lg bg-subtle p-4">
            <p className="text-sm font-medium">Сохраните ключ. Второй раз целиком не покажем.</p>
            <p className="mt-2 break-all font-mono text-sm text-accent">{fresh}</p>
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => void navigator.clipboard.writeText(fresh)}
            >
              Копировать ключ
            </Button>
          </div>
        ) : (
          <p className="mt-3 font-mono text-xs text-dim">{key.slice(0, 12)}…{key.slice(-4)}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              clearDeskKey();
              setKey("");
              setFresh("");
            }}
          >
            Выйти с этого браузера
          </Button>
        </div>
      </div>

      <AccountBanner account={account} className="mx-0" />

      <div className="panel-volume rounded-xl p-5">
        <p className="font-mono text-xs tracking-[0.2em] text-accent">УПРАВЛЕНИЕ С САЙТА</p>
        <p className="mt-2 text-sm text-muted">
          Кнопка кладёт приказ в вашу ленту. Исполняет только ваш SLOI_Desk 4.42 с этим ключом, не чужой терминал.
        </p>
        <label className="mt-4 block">
          <span className="text-xs text-dim">пара для купить / продать / закрыть</span>
          <select
            value={sym}
            onChange={(e) => setSym(e.target.value)}
            className="mt-1 h-11 w-full rounded-sm bg-subtle px-3 text-sm"
          >
            {PAIR_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void cmd("BUY")}>Купить</Button>
          <Button variant="outline" onClick={() => void cmd("SELL")}>
            Продать
          </Button>
          <Button variant="outline" onClick={() => void cmd("CLOSE")}>
            Закрыть пару
          </Button>
          <Button variant="outline" onClick={() => void cmd("CLOSE_PROFIT")}>
            Закрыть прибыль
          </Button>
          <Button variant="outline" onClick={() => void cmd("CLOSE_ALL")}>
            Закрыть всё
          </Button>
          <Button variant="ghost" onClick={() => void cmd("PAUSE")}>
            Авто стоп
          </Button>
          <Button variant="ghost" onClick={() => void cmd("RESUME")}>
            Авто вкл
          </Button>
        </div>
        {note ? <p className={cn("mt-3 text-sm", note.includes("очеред") ? "text-muted" : "text-bear")}>{note}</p> : null}
      </div>

      <div className="panel-volume rounded-xl p-5">
        <p className="font-mono text-xs tracking-[0.2em] text-accent">СОВЕТНИК С ВАШИМ КЛЮЧОМ</p>
        <p className="mt-2 mb-4 text-sm text-muted">
          Скачайте 4.42 — ключ уже внутри. В WebRequest тот же адрес сайта.
        </p>
        <SaveExpert settings={settings} />
      </div>
    </div>
  );
}
