import { createFileRoute } from "@tanstack/react-router";
import { DeskApp } from "@/components/desk/desk-app";
import { fetchMarket } from "@/lib/market/fetch";

export const Route = createFileRoute("/desk")({
  loader: () => fetchMarket({ data: { symbol: "EURUSD", timeframe: "1h" } }),
  component: DeskPage,
});

function DeskPage() {
  const initialMarket = Route.useLoaderData();
  return <DeskApp initialMarket={initialMarket} />;
}
