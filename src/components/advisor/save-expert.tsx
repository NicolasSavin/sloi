import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { patchEaSource, type EaSettings } from "@/lib/ea-settings";
import { EA_SOURCE } from "@/lib/ea-source";
import { EA_FILE } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function SaveExpert({ settings, className }: { settings: EaSettings; className?: string }) {
  const follow = useMemo(() => patchEaSource(EA_SOURCE, { ...settings, hostFeed: false }), [settings]);
  const host = useMemo(() => patchEaSource(EA_SOURCE, { ...settings, hostFeed: true }), [settings]);
  const followUrl = useMemo(() => `data:application/octet-stream;charset=utf-8,${encodeURIComponent(follow)}`, [follow]);
  const hostUrl = useMemo(() => `data:application/octet-stream;charset=utf-8,${encodeURIComponent(host)}`, [host]);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [which, setWhich] = useState<"follow" | "host">("follow");
  const source = which === "host" ? host : follow;

  const copyNow = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      return true;
    } catch {
      setCopied(false);
      return false;
    }
  };

  const onSave = (w: "follow" | "host") => {
    setWhich(w);
    const text = w === "host" ? host : follow;
    void navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => setCopied(false));
    setOpen(true);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap gap-2">
        <a
          href={followUrl}
          download="SLOI_Follow.mq4"
          className="btn-metal inline-flex h-11 items-center gap-2 rounded-sm px-4 text-sm font-medium text-accent-fg"
          onClick={() => onSave("follow")}
        >
          <Download className="size-4" />
          Сов для клиентов
        </a>
        <a
          href={hostUrl}
          download={EA_FILE}
          className="inline-flex h-11 items-center gap-2 rounded-sm px-4 text-sm font-medium shadow-[var(--shadow-border)]"
          onClick={() => onSave("host")}
        >
          Сов хозяина (CD)
        </a>
        <Button type="button" variant="ghost" onClick={() => { setWhich("follow"); void copyNow(); setOpen(true); }}>
          Копировать код
        </Button>
      </div>
      <p className="text-xs text-dim">
        Клиенту ClusterDelta не нужен: сов только читает сигналы сайта и торгует у своего брокера. Хозяин шлёт CD и свечи на общий стол — счёт при этом не светится.
      </p>

      {open ? (
        <div className="rounded-xl border border-accent/40 bg-card p-4 shadow-[var(--shadow-volume)]">
          <p className="font-medium">{copied ? "Код уже в буфере" : "Выделите код и скопируйте"}</p>
          <p className="mt-1 text-sm text-muted">
            MetaEditor → вставить всё → сохранить как {which === "host" ? "SLOI_Desk.mq4" : "SLOI_Follow.mq4"} → F7.
          </p>
          <textarea
            readOnly
            value={source}
            className="mt-3 h-64 w-full resize-y rounded-md bg-bg p-3 font-mono text-xs text-fg"
            spellCheck={false}
            onFocus={(e) => e.currentTarget.select()}
            ref={(el) => {
              if (el) {
                el.focus();
                el.select();
              }
            }}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void copyNow()}>
              Ещё раз копировать
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Закрыть
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
