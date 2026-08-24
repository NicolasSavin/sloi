import { createFileRoute } from "@tanstack/react-router";
import { TvRelay } from "@/components/tv/relay";

export const Route = createFileRoute("/ideas")({
  validateSearch: (s: Record<string, unknown>) => ({
    pair: typeof s.pair === "string" ? s.pair : undefined,
  }),
  component: IdeasPage,
});

function IdeasPage() {
  const { pair } = Route.useSearch();
  return <TvRelay initialId={pair} />;
}
