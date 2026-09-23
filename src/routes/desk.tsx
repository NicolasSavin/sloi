import { createFileRoute } from "@tanstack/react-router";
import { DeskApp } from "@/components/desk/desk-app";
import { fetchMarket } from "@/lib/market/fetch";
import { SYMBOLS } from "@/lib/market/symbols";

const KNOWN = new Set(SYMBOLS.map((s) => s.id));

export const Route = createFileRoute("/desk")({
  validateSearch: (s: Record<string, unknown>): { pair: string } => {
    const raw = typeof s.pair === "string" ? s.pair.toUpperCase() : "";
    return { pair: KNOWN.has(raw) ? raw : "" };
  },
  loaderDeps: ({ search }) => ({ pair: search.pair }),
  loader: ({ deps }) => fetchMarket({ data: { symbol: deps.pair || "EURUSD", timeframe: "1h" } }),
  component: DeskPage,
});

function DeskPage() {
  const { pair } = Route.useSearch();
  const initialMarket = Route.useLoaderData();
  return <DeskApp initialMarket={initialMarket} forcedSymbol={pair || undefined} />;
}
