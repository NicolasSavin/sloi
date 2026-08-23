import { useState } from "react";
import { askDeskChat } from "@/lib/ai/chat";
import { useDeskStore } from "@/lib/desk-store";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "bot"; text: string; model?: string };

export function ChatDock() {
  const symbol = useDeskStore((s) => s.symbol);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "bot",
      text: "Диспетчерская. Спросите про пару или новость — отвечу по снимку стола.",
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
        { role: "bot", text: "Чат не ответил. Смотрите табло пар слева — там тот же снимок.", model: "стол" },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel-volume overflow-hidden rounded-xl">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <p className="font-mono text-xs tracking-[0.18em] text-accent">ЧАТ ДИСПЕТЧЕРА · {symbol}</p>
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto px-4 py-3 text-sm leading-relaxed">
        {msgs.map((m, i) => (
          <div key={i} className={cn(m.role === "user" ? "text-fg" : "text-muted")}>
            <p className="font-mono text-[10px] tracking-wide text-dim">{m.role === "user" ? "вы" : m.model ?? "стол"}</p>
            <p className="mt-0.5">{m.text}</p>
          </div>
        ))}
        {busy ? <p className="font-mono text-[10px] text-dim">думаю…</p> : null}
      </div>
      <form
        className="flex gap-2 border-t border-border/70 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Что с евро? Можно ли золото перед новостью?"
          className="h-11 flex-1 rounded-sm bg-subtle px-3 text-sm outline-none"
        />
        <button type="submit" disabled={busy} className="btn-metal h-11 rounded-sm px-4 text-xs text-accent-fg">
          Спросить
        </button>
      </form>
    </section>
  );
}
