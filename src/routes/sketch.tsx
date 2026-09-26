import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/app-nav";
import { retellSketch, type SketchPiece } from "@/lib/sketch";

export const Route = createFileRoute("/sketch")({
  component: SketchPage,
});

const STORE = "sloi-sketch-v1";

function SketchPage() {
  const [instrument, setInstrument] = useState("");
  const [notes, setNotes] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [piece, setPiece] = useState<SketchPiece | null>(null);
  const [miss, setMiss] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE);
      if (!saved) return;
      const data = JSON.parse(saved) as { instrument?: string; notes?: string };
      if (data.instrument) setInstrument(data.instrument);
      if (data.notes) setNotes(data.notes);
    } catch {
      /* ignore a broken draft */
    }
  }, []);

  function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMiss("Нужна картинка графика.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImage(typeof reader.result === "string" ? reader.result : null);
      setMiss("");
    };
    reader.readAsDataURL(file);
  }

  function publish() {
    const next = retellSketch(notes, instrument);
    if (!next) {
      setPiece(null);
      setMiss("Напишите своими словами, что видите. Пары фраз хватит.");
      return;
    }
    if (!image) {
      setPiece(null);
      setMiss("Сначала скиньте график.");
      return;
    }
    setMiss("");
    setPiece(next);
    try {
      localStorage.setItem(STORE, JSON.stringify({ instrument, notes }));
    } catch {
      /* quota */
    }
  }

  return (
    <div className="min-h-dvh">
      <AppNav />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <p className="text-xs tracking-[0.22em] text-accent">ЗАМЕТКА</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Свой график, своими словами</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Скиньте картинку и набросайте, что к чему. Стол перескажет это колонкой и поставит график в рамку. Новых цен и чужого сценария не добавит.
        </p>

        <div className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2">
          <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-amber-200/30 bg-black/30 px-4 text-center text-sm text-muted">
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            {image ? "График выбран. Нажмите, чтобы заменить." : "Скинуть график"}
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
              placeholder="Своими словами: что за фигура, куда дивер, куда цена, чего ждать."
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-amber-200/40"
            />
            <button type="button" onClick={publish} className="btn-metal h-11 rounded-sm text-sm font-medium text-accent-fg">
              Оформить
            </button>
            {miss ? <p className="text-sm text-rose-300">{miss}</p> : null}
          </div>
        </div>

        {piece && image ? <Spread image={image} piece={piece} instrument={instrument} /> : null}
      </main>
    </div>
  );
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

function Spread({ image, piece, instrument }: { image: string; piece: SketchPiece; instrument: string }) {
  const when = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
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
          <div className="mt-6 rounded-2xl border border-amber-200/25 bg-black/40 p-4">
            <p className="text-[11px] tracking-[0.22em] text-accent">КРУПНЫЙ ИГРОК</p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-100">
              <span className="text-amber-100/80">Что делает. </span>
              {piece.whale.does}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-100">
              <span className="text-amber-100/80">К чему стремится. </span>
              {piece.whale.wants}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">
              <span className="text-amber-100/80">Почему. </span>
              {piece.whale.because}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">
              <span className="text-amber-100/80">Что из этого следует. </span>
              {piece.whale.therefore}
            </p>
          </div>
          <blockquote className="mt-6 border-l-2 border-amber-200/40 pl-3 text-sm italic text-zinc-400">
            {piece.original}
          </blockquote>
          <p className="mt-4 text-xs text-zinc-500">Пересказ только ваших слов. Это не приказ диспетчера.</p>
        </div>
      </div>
    </article>
  );
}
