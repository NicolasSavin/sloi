import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/components/home/landing";
import { weaveFlashes } from "@/lib/home";
import { fetchDigest, fetchHome } from "@/lib/market/fetch";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [home, desk] = await Promise.all([
      fetchHome(),
      fetchDigest().catch(() => null),
    ]);
    return { ...home, flashes: weaveFlashes(desk?.digest) };
  },
  pendingComponent: function HomePending() {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted">
        Собираю котировки и ленту…
      </div>
    );
  },
  component: Home,
});

function Home() {
  const data = Route.useLoaderData();
  return <Landing data={data} />;
}
