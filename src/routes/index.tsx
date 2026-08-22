import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/components/home/landing";
import { fetchHome } from "@/lib/market/fetch";

export const Route = createFileRoute("/")({
  loader: () => fetchHome(),
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
