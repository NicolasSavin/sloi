import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { askDeskChat } from "@/lib/ai/chat";
import { useDeskStore } from "@/lib/desk-store";
import { getSymbol } from "@/lib/market/symbols";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "bot"; text: string; model?: string; thumb?: string };

function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 960;
      let w = img.width;
      let h = img.height;
      if (w > max || h > max) {
        const s = max / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("img"));
    };
    img.src = url;
  });
}

export function ChatDock() {
  const symbol = useDeskStore((s) => s.symbol);
  const [focus, setFocus] = useState(symbol);
  const pair = getSymbol(focus).label;
  const [q, setQ] = useState("");
  const [pic, setPic] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "bot",
      text: "Можно спросить любую пару или приложить снимок графика (скрепка / Ctrl+V).",
      model: "стол",
    },
  ]);

  async function takeFile(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      setPic(await shrink(file));
    } catch {
      setPic(null);
    }
  }

  async function send() {
    const question = q.trim();
    if ((!question && !pic) || busy) return;
    setQ("");
    const shot = pic;
    setPic(null);
    setMsgs((m) => [...m, { role: "user" as const, text: question || "снимок", thumb: shot ?? undefined }].slice(-10));
    setBusy(true);
    try {
      const res = await askDeskChat({ data: { question: question || "Что на графике?", symbol, image: shot ?? undefined } });
      if (res.symbol) setFocus(res.symbol);
      setMsgs((m) => [...m, { role: "bot" as const, text: res.text, model: res.model }].slice(-10));
    } catch {
      setMsgs((m) => [
        ...m,
        { role: "bot" as const, text: "Чат не ответил. Смотрите табло пар слева — там тот же снимок.", model: "стол" },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel-volume overflow-hidden rounded-xl">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <p className="font-mono text-xs tracking-[0.18em] text-accent">ЧАТ · смотрю {pair}</p>
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto px-4 py-3 text-sm leading-relaxed">
        {msgs.map((m, i) => (
          <div key={i} className={cn(m.role === "user" ? "text-fg" : "text-muted")}>
            <p className="font-mono text-[10px] tracking-wide text-dim">{m.role === "user" ? "вы" : m.model ?? "стол"}</p>
            {m.thumb ? <img src={m.thumb} alt="" className="mt-1 max-h-28 rounded-md ring-1 ring-border/60" /> : null}
            <p className="mt-0.5">{m.text}</p>
          </div>
        ))}
        {busy ? <p className="font-mono text-[10px] text-dim">думаю…</p> : null}
      </div>
      <form
        className="border-t border-border/70 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        onPaste={(e) => {
          const f = [...e.clipboardData.items].find((x) => x.type.startsWith("image/"))?.getAsFile();
          if (f) {
            e.preventDefault();
            void takeFile(f);
          }
        }}
      >
        {pic ? (
          <div className="mb-2 flex items-center gap-2">
            <img src={pic} alt="" className="h-12 rounded-sm ring-1 ring-border" />
            <button type="button" onClick={() => setPic(null)} className="text-muted hover:text-fg" aria-label="убрать фото">
              <X className="size-4" />
            </button>
          </div>
        ) : null}
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void takeFile(e.target.files?.[0])} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-11 w-11 items-center justify-center rounded-sm bg-subtle text-muted hover:text-fg"
            title="Снимок графика"
          >
            <ImagePlus className="size-4" />
          </button>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Вопрос или снимок графика"
            className="h-11 flex-1 rounded-sm bg-subtle px-3 text-sm outline-none"
          />
          <button type="submit" disabled={busy} className="btn-metal h-11 rounded-sm px-4 text-xs text-accent-fg">
            Спросить
          </button>
        </div>
      </form>
    </section>
  );
}
