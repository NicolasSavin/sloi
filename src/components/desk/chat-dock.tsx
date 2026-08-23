import { useState } from "react";
import { askDeskChat } from "@/lib/ai/chat";
import { useDeskStore } from "@/lib/desk-store";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "bot"; text: string; model?: string };

export function ChatDock() {
  const symbol = useDeskStore((s) => s.symbol);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "bot",
      text: "Спросите про пару или новость. Например: что с евро? или можно ли золото перед NFP?",
      model: "стол",
    },
  ]);

  async function send() {
    const question = q.trim();
    if (!question || busy) return;
    setQ("");
    setMsgs((m) => [...m, { role: "user", text: question }].slice(-10));
    setBusy(true);
    try {
      const res = await askDeskChat({ data: { question, symbol } });
      setMsgs((m) => [...m, { role: "bot", text: res.text, model: res.model }].slice(-10));
    } catch {
      setMsgs((m) => [
        ...m,
        {
          role: "bot",
          text: "Чат сейчас не ответил. Откройте график пары — разбор слева без чата.",
          model: "стол",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(100%-2rem,22rem)]">
      {open ? (
        <div className="panel-volume overflow-hidden rounded-xl">
          <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
            <p className="font-mono text-[10px] tracking-[0.18em] text-accent">ЧАТ СТОЛА · {symbol}</p>
            <button type="button" className="text-xs text-muted" onClick={() => setOpen(false)}>
              свернуть
            </button>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto px-3 py-3 text-sm leading-relaxed">
            {msgs.map((m, i) => (
              <div key={i} className={cn(m.role === "user" ? "text-fg" : "text-muted")}>
                <p className="font-mono text-[10px] tracking-wide text-dim">{m.role === "user" ? "вы" : m.model ?? "стол"}</p>
                <p className="mt-0.5">{m.text}</p>
              </div>
            ))}
            {busy ? <p className="font-mono text-[10px] text-dim">думаю…</p> : null}
          </div>
          <form
            className="flex gap-2 border-t border-border/70 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Вопрос по паре или новости"
              className="h-10 flex-1 rounded-sm bg-subtle px-2 text-sm outline-none"
            />
            <button type="submit" disabled={busy} className="btn-metal h-10 rounded-sm px-3 text-xs text-accent-fg">
              Спросить
            </button>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-metal ml-auto flex h-11 items-center rounded-sm px-4 text-xs font-medium text-accent-fg shadow-[var(--shadow-volume)]"
        >
          Спросить стол
        </button>
      )}
    </div>
  );
}
