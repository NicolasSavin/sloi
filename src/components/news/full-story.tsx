import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchFullStory } from "@/lib/market/fetch";

export function FullStory({
  href,
  foreign,
  title,
  source,
}: {
  href: string;
  foreign: boolean;
  title: string;
  source: string;
}) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["full-story", href],
    queryFn: () => fetchFullStory({ data: { href, foreign, title } }),
    enabled: open,
    staleTime: 30 * 60_000,
  });
  return (
    <div className="mt-6">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-11 items-center rounded-sm bg-accent px-4 text-sm font-medium text-accent-fg"
        >
          Читать полностью на этой странице
        </button>
      ) : null}
      {open && q.isLoading ? <p className="mt-4 text-sm text-muted">Тяну полный текст, картинки и перевод…</p> : null}
      {open && q.data?.error ? (
        <p className="mt-4 text-sm text-muted">
          {q.data.error}{" "}
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent">
            Открыть {source}
          </a>
        </p>
      ) : null}
      {open && q.data?.html ? (
        <div className="mt-5">
          {q.data.translated ? (
            <p className="mb-3 font-mono text-[10px] tracking-[0.16em] text-accent">ПЕРЕВОД НА РУССКИЙ · КАРТИНКИ С ОРИГИНАЛА</p>
          ) : (
            <p className="mb-3 font-mono text-[10px] tracking-[0.16em] text-accent">ПОЛНЫЙ ТЕКСТ ИСТОЧНИКА</p>
          )}
          {q.data.title ? <h2 className="mb-4 text-2xl font-medium">{q.data.title}</h2> : null}
          <div
            className="space-y-4 text-base leading-relaxed [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-medium [&_img]:my-4 [&_img]:max-h-[28rem] [&_img]:w-full [&_img]:rounded-xl [&_img]:object-cover [&_p]:text-base [&_p]:leading-relaxed"
            dangerouslySetInnerHTML={{ __html: q.data.html }}
          />
        </div>
      ) : null}
    </div>
  );
}
