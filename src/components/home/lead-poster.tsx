import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { DailyInfographic } from "@/components/daily/infographic";
import { fetchDigest } from "@/lib/market/fetch";

export function HomeLeadPoster() {
  const q = useQuery({
    queryKey: ["home-digest"],
    queryFn: () => fetchDigest(),
    staleTime: 45_000,
    refetchInterval: 60_000,
  });
  const digest = q.data?.digest;
  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.22em] text-accent">СЕГОДНЯ · АКТУАЛЬНЫЙ РАЗБОР</p>
          <h2 className="mt-1 text-2xl font-medium">Пара дня — самая вероятная по столу</h2>
          <p className="mt-1 text-sm text-muted">
            Берём живой приказ (лонг/шорт), близость к зоне и чистый RR. Не случайная карточка.
          </p>
        </div>
        <Link to="/daily" className="font-mono text-xs text-accent underline-offset-4 hover:underline">
          полный выпуск →
        </Link>
      </div>
      {digest ? (
        <DailyInfographic digest={digest} selectedId={digest.lead.spec.id} />
      ) : (
        <p className="rounded-2xl border border-border px-4 py-16 text-center text-sm text-muted">
          Собираю инфографику лида…
        </p>
      )}
    </section>
  );
}
