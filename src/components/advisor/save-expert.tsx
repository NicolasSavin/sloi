import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { patchEaSource, type EaSettings } from "@/lib/ea-settings";
import { EA_SOURCE } from "@/lib/ea-source";
import { EA_FILE } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function SaveExpert({ settings, className }: { settings: EaSettings; className?: string }) {
  const source = useMemo(() => patchEaSource(EA_SOURCE, settings), [settings]);
  const dataUrl = useMemo(
    () => `data:application/octet-stream;charset=utf-8,${encodeURIComponent(source)}`,
    [source],
  );
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const onSave = () => {
    void copyNow();
    setOpen(true);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap gap-2">
        <a
          href={dataUrl}
          download={EA_FILE}
          className="btn-metal inline-flex h-11 items-center gap-2 rounded-sm px-4 text-sm font-medium text-accent-fg"
          onClick={onSave}
        >
          <Download className="size-4" />
          Скачать .mq4
        </a>
        <a
          href="/api/ea.mq4"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center rounded-sm px-4 text-sm font-medium shadow-[var(--shadow-border)]"
          onClick={onSave}
        >
          Открыть файл
        </a>
        <Button type="button" variant="ghost" onClick={() => { void copyNow(); setOpen(true); }}>
          Копировать код
        </Button>
      </div>
      <p className="text-xs text-dim">
        В превью браузер часто глушит загрузки. Нажмите «Скачать» — код копируется, ниже можно вставить в MetaEditor.
      </p>

      {open ? (
        <div className="rounded-xl border border-accent/40 bg-card p-4 shadow-[var(--shadow-volume)]">
          <p className="font-medium">{copied ? "Код уже в буфере" : "Выделите код и скопируйте"}</p>
          <p className="mt-1 text-sm text-muted">
            MetaEditor → создать Expert Advisor → вставить всё → сохранить как SLOI_Desk.mq4 → F7. Потом перетащить
            на график.
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
