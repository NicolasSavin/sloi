import { createFileRoute } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { Studio } from "@/components/tv/studio";
import { fetchDigest, fetchHome, fetchTvGuide } from "@/lib/market/fetch";
import { tvPlaylist } from "@/lib/tv-channels";

export const Route = createFileRoute("/tv")({
  loader: async () => {
    try {
      const [desk, home, guide] = await Promise.all([fetchDigest(), fetchHome(), fetchTvGuide().catch(() => tvPlaylist())]);
      return { digest: desk.digest, news: home.news, channels: guide.length ? guide : tvPlaylist() };
    } catch {
      return null;
    }
  },
  pendingComponent: function TvPending() {
    return (
      <div className="min-h-dvh">
        <AppNav />
        <p className="px-5 py-16 text-sm text-muted">Поднимаю эфир…</p>
      </div>
    );
  },
  component: TvPage,
});

function TvPage() {
  const data = Route.useLoaderData();
  if (!data) {
    return (
      <div className="min-h-dvh">
        <AppNav />
        <p className="px-5 py-16 text-sm text-muted">Эфир недоступен. Обновите страницу.</p>
      </div>
    );
  }
  return (
    <div className="flex min-h-dvh flex-col">
      <AppNav />
      <Studio digest={data.digest} news={data.news} channels={data.channels} />
    </div>
  );
}
