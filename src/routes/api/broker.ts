import { createFileRoute } from "@tanstack/react-router";
import { exportBrokerTape, hydrateAccount, ingestBrokerTape } from "@/lib/broker-tape";
import { dbSource } from "@/lib/db";
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
        let storedBody = "";
        if (desk && desk.id !== LEGACY_TENANT) {
          const stored = await loadTape(desk.id);
          storedBody = stored?.body ?? "";
          if (storedBody) ingestBrokerTape(storedBody, desk.id);
          else if (stored?.account) hydrateAccount(desk.id, stored.account);
        }
        const live = exportBrokerTape(tenant);
        const out = storedBody
          ? `# SLOI broker ${new Date().toISOString()} db=${dbSource}\n${storedBody.replace(/^#.*\n/, "")}`
          : `${live.split("\n")[0]} db=${dbSource}\n${live.split("\n").slice(1).join("\n")}`;
        return new Response(out, {
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
        const rec = await saveTape(tenant, text, account);
        return new Response(`ok saved=${rec.saved ? 1 : 0} db=${rec.db}${rec.err ? ` err=${rec.err}` : ""}\n`, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
