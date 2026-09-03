import { createFileRoute } from "@tanstack/react-router";
import { exportBrokerTape, hydrateAccount, ingestBrokerTape } from "@/lib/broker-tape";
import { LEGACY_TENANT, loadTape, resolveDesk, saveTape } from "@/lib/desk-tenant";

function keyOf(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get("k") ?? url.searchParams.get("key") ?? "";
}

export const Route = createFileRoute("/api/broker")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const desk = await resolveDesk(keyOf(request));
        const tenant = desk?.id ?? LEGACY_TENANT;
        if (desk && desk.id !== LEGACY_TENANT) {
          const stored = await loadTape(desk.id);
          if (stored?.body) ingestBrokerTape(stored.body, desk.id);
          else if (stored?.account) hydrateAccount(desk.id, stored.account);
        }
        return new Response(exportBrokerTape(tenant), {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
      POST: async ({ request }) => {
        const text = await request.text();
        const desk = await resolveDesk(keyOf(request));
        const tenant = desk?.id ?? LEGACY_TENANT;
        const account = ingestBrokerTape(text, tenant);
        await saveTape(tenant, text, account);
        return new Response("ok\n", {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
