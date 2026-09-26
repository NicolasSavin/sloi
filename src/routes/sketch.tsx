import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { deskCommandFn } from "@/lib/desk-api";
import { readDeskKey } from "@/lib/desk-key";
import { retellSketch, type ChartPlan, type SketchPiece } from "@/lib/sketch";

export const Route = createFileRoute("/sketch")({
  component: SketchPage,
});

const STORE = "sloi-sketch-feed-v2";
const TOKENS = "sloi-sketch-tokens";

interface SavedNote {
  id: string;
  instrument: string;
  image: string;
  piece: SketchPiece;
  at: number;
}

interface RemoteNote {
  id: string;
  instrument: string;
  notes: string;
  image: string;
  at: number;
}

function readTokens(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TOKENS);
    const data = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function toNote(row: RemoteNote): SavedNote | null {
  const piece = retellSketch(row.notes, row.instrument);
  if (!piece || !row.image) return null;
  return { id: row.id, instrument: row.instrument, image: row.image, piece, at: row.at };
}

async function publishLocalDrafts(): Promise<SavedNote[]> {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return [];
    const data = JSON.parse(raw) as SavedNote[];
    if (!Array.isArray(data)) return [];
    const tokens = readTokens();
    const out: SavedNote[] = [];
    for (const note of data) {
      const text = note.piece?.original;
      if (!note.image || !text) continue;
      const res = await fetch("/api/sketches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument: note.instrument, notes: text, image: note.image }),
      });
      const saved = (await res.json()) as { id?: string; token?: string; at?: number };
      if (!res.ok || !saved.id || !saved.token) continue;
      tokens[saved.id] = saved.token;
      const piece = retellSketch(text, note.instrument);
      if (!piece) continue;
      out.push({ id: saved.id, instrument: note.instrument, image: note.image, piece, at: saved.at ?? note.at });
    }
    localStorage.setItem(TOKENS, JSON.stringify(tokens));
    if (out.length) localStorage.removeItem(STORE);
    return out;
  } catch {
    return [];
  }
}

function SketchPage() {
  const [instrument, setInstrument] = useState("");
  const [notes, setNotes] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [feed, setFeed] = useState<SavedNote[]>([]);
  const [own, setOwn] = useState<Record<string, string>>({});
  const [miss, setMiss] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mine = readTokens();
    setOwn(mine);
    void (async () => {
      try {
        const res = await fetch("/api/sketches");
        const body = (await res.json()) as { notes?: RemoteNote[] };
        const remote = (Array.isArray(body.notes) ? body.notes : []).map(toNote).filter((n): n is SavedNote => Boolean(n));
        if (remote.length) {
          setFeed(remote);
        } else {
          const pushed = await publishLocalDrafts();
          if (pushed.length) {
            setFeed(pushed);
            setOwn(readTokens());
          }
        }
      } catch {
        setMiss("Лента сайта сейчас не открылась.");
      }
      setReady(true);
    })();
  }, []);

  function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMiss("Нужна картинка графика.");
      return;
    }
    void shrinkImage(file).then((url) => {
      setImage(url);
      setMiss("");
    });
  }

  async function publish() {
    if (!image) {
      setMiss("Сначала скиньте график. Статья может собраться с самой картинки.");
      return;
    }
    setBusy(true);
    setMiss(notes.trim() ? "Смотрю, что нарисовано на графике…" : "Текста нет. Собираю статью с фото…");
    const res = await fetch("/api/sketches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instrument, notes, image }),
    });
    const saved = (await res.json()) as {
      id?: string;
      token?: string;
      at?: number;
      notes?: string;
      instrument?: string;
      error?: string;
    };
    setBusy(false);
    if (!res.ok || !saved.id || !saved.token || !saved.notes) {
      setMiss(saved.error || "График не разобрался. Напишите пару слов или проверьте ключ модели.");
      return;
    }
    const piece = retellSketch(saved.notes, saved.instrument || instrument);
    if (!piece) {
      setMiss("С картинки не вышло текста.");
      return;
    }
    const nextOwn = { ...own, [saved.id]: saved.token };
    localStorage.setItem(TOKENS, JSON.stringify(nextOwn));
    setOwn(nextOwn);
    setFeed((prev) => [
      {
        id: saved.id!,
        instrument: (saved.instrument || instrument).trim(),
        image,
        piece,
        at: saved.at ?? Date.now(),
      },
      ...prev,
    ]);
    setNotes("");
    setImage(null);
    setMiss("");
  }

  async function remove(id: string) {
    const token = own[id];
    if (!token) {
      setMiss("Чужую заметку убрать нельзя.");
      return;
    }
    const res = await fetch("/api/sketches", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, token }),
    });
    if (!res.ok) {
      setMiss("Не удалось убрать.");
      return;
    }
    setFeed((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div className="min-h-dvh">
      <AppNav />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <p className="text-xs tracking-[0.22em] text-accent">ЗАМЕТКА</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Свой график, своими словами</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Смотреть ленту может любой. Текст можно не писать: статья соберётся с фото, с того, что на графике нарисовано и подписано. Если напишете сами, это встанет рядом.
        </p>

        <div className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2">
          <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-amber-200/30 bg-black/30 px-4 text-center text-sm text-muted">
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            {image ? <img src={image} alt="" className="max-h-36 w-full object-contain" /> : "Скинуть график"}
          </label>
          <div className="flex flex-col gap-3">
            <input
              value={instrument}
              onChange={(e) => setInstrument(e.target.value)}
              placeholder="Инструмент, например нефть или EURCHF"
              className="h-11 rounded-lg border border-white/10 bg-black/40 px-3 text-sm outline-none focus:border-amber-200/40"
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={6}
              placeholder="Можно оставить пустым. Тогда статья будет только с графика."
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-amber-200/40"
            />
            <button type="button" disabled={busy} onClick={() => void publish()} className="btn-metal h-11 rounded-sm text-sm font-medium text-accent-fg disabled:opacity-60">
              Добавить заметку
            </button>
            <p className="text-xs text-muted">
              {ready && feed.length
                ? `На сайте уже ${feed.length}. Их видит каждый, кто открыл эту страницу.`
                : "После кнопки заметка появится здесь и у всех остальных."}
            </p>
            {miss ? <p className="text-sm text-rose-300">{miss}</p> : null}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-8">
          {feed.map((note) => (
            <Spread key={note.id} note={note} onRemove={own[note.id] ? () => void remove(note.id) : undefined} />
          ))}
        </div>
      </main>
    </div>
  );
}

function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 960;
      const scale = Math.min(1, max / Math.max(img.width, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(url);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.62));
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}

function SketchMascots({ mood }: { mood: SketchPiece["mood"] }) {
  const cast =
    mood === "bull"
      ? ["🐂", "💰"]
      : mood === "bear"
        ? ["🐻", "📉"]
        : mood === "mixed"
          ? ["🐻", "🚀"]
          : ["👀", "🪙"];
  return (
    <>
      <span className="sketch-mascot pointer-events-none absolute bottom-14 left-3" aria-hidden>
        {cast[0]}
      </span>
      <span className="sketch-mascot sketch-mascot-wave pointer-events-none absolute right-3 top-3" aria-hidden>
        {cast[1]}
      </span>
    </>
  );
}

function ChartOrder({ plan }: { plan: ChartPlan }) {
  const [key, setKey] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setKey(readDeskKey());
  }, []);
  async function send() {
    const deskKey = readDeskKey();
    if (!deskKey) return;
    setBusy(true);
    setNote("Отдаю советнику…");
    const res = await deskCommandFn({
      data: {
        key: deskKey,
        kind: plan.side === "buy" ? "BUY" : "SELL",
        symbol: plan.symbol,
        entry: plan.entry,
        stop: plan.stop,
        tp: plan.target,
      },
    });
    setBusy(false);
    setNote(res.ok ? "Приказ ушёл в ваш стол. Чужой браузер его отправить не может." : res.error);
  }
  const px = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 5 });
  return (
    <div className="mt-6 rounded-2xl border border-amber-200/30 bg-black/40 p-4">
      <p className="text-[11px] tracking-[0.22em] text-accent">ПРИКАЗ С ГРАФИКА</p>
      <p className="mt-2 text-sm text-zinc-100">
        {plan.symbol} {plan.side === "buy" ? "покупка" : "продажа"}. Вход {px(plan.entry)}, стоп {px(plan.stop)}, тейк {px(plan.target)}.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">
        Это подписи с картинки. Советник чуть поправит их на спред. Кнопку видит только браузер, где уже открыт ваш кабинет. Поле для чужого ключа нет.
      </p>
      {key ? (
        <button type="button" disabled={busy} onClick={() => void send()} className="btn-metal mt-3 h-10 rounded-sm px-4 text-sm font-medium text-accent-fg disabled:opacity-60">
          Отдать советнику
        </button>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">Отдать приказ может только хозяин стола.</p>
      )}
      {note ? <p className="mt-2 text-xs text-amber-100/80">{note}</p> : null}
    </div>
  );
}

function Spread({ note, onRemove }: { note: SavedNote; onRemove?: () => void }) {
  const { image, instrument } = note;
  const fresh = retellSketch(note.piece.original, instrument);
  const piece = fresh ? { ...fresh, plan: fresh.plan ?? note.piece.plan ?? null } : note.piece;
  const when = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(note.at);
  return (
    <article className="mt-8 overflow-hidden rounded-3xl border border-amber-200/25 bg-gradient-to-b from-zinc-900 via-[#120e09] to-black shadow-[0_40px_90px_rgba(0,0,0,0.45)]">
      <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
        <figure className="relative m-4 overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[inset_0_0_0_1px_rgba(240,215,168,0.18),0_18px_40px_rgba(0,0,0,0.45)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(240,215,168,0.18),transparent_46%)]" />
          <img src={image} alt={piece.title} className="sketch-photo relative max-h-[720px] w-full object-contain" />
          <SketchMascots mood={piece.mood} />
          <div className="sketch-shimmer pointer-events-none absolute inset-x-0 top-0 h-px" />
          <figcaption className="relative flex items-center justify-between gap-3 border-t border-white/10 bg-black/70 px-4 py-3 text-xs text-amber-100/80">
            <span>{instrument.trim() || "График"}</span>
            <span>{when}</span>
          </figcaption>
        </figure>
        <div className="px-5 py-6 sm:px-7">
          <p className="text-[11px] tracking-[0.28em] text-accent">{piece.kicker}</p>
          <h2 className="mt-3 text-2xl font-semibold leading-tight">{piece.title}</h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-100 first-letter:float-left first-letter:mr-2 first-letter:text-5xl first-letter:font-semibold first-letter:text-amber-100">
            {piece.lead}
          </p>
          {piece.paragraphs.map((p) => (
            <p key={p} className="mt-3 text-sm leading-relaxed text-zinc-300">
              {p}
            </p>
          ))}
          {piece.levels.length ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {piece.levels.map((n) => (
                <span key={n} className="rounded-full border border-amber-200/30 bg-amber-200/10 px-3 py-1 font-mono text-xs text-amber-100">
                  {n}
                </span>
              ))}
            </div>
          ) : null}
          {piece.plan ? <ChartOrder plan={piece.plan} /> : null}
          <blockquote className="mt-6 border-l-2 border-amber-200/40 pl-3 text-sm italic text-zinc-400">
            {piece.original}
          </blockquote>
          <p className="mt-4 text-xs text-zinc-500">Пересказ только ваших слов. Это не приказ диспетчера.</p>
          {onRemove ? (
            <button type="button" onClick={onRemove} className="mt-3 text-xs text-zinc-500 underline-offset-2 hover:text-rose-300 hover:underline">
              Убрать эту заметку
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
