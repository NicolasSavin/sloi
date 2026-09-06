import { createFileRoute } from "@tanstack/react-router";
import { exportBrokerTape, hydrateAccount, ingestBrokerTape } from "@/lib/broker-tape";
import { dbSource } from "@/lib/db";
import { LEGACY_TENANT, PUBLIC_TENANT, hostPublicBody, loadLatestTape, loadTape, resolveDesk, saveTape } from "@/lib/desk-tenant";

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
        const pub = await loadTape(PUBLIC_TENANT);
        const latest = pub?.body ? pub : await loadLatestTape();
        if (latest?.body) ingestBrokerTape(latest.body, PUBLIC_TENANT);
        const live = exportBrokerTape(tenant);
        const pubBody = (latest?.body ?? pub?.body ?? "").replace(/^#.*\n/, "");
        const core = storedBody
          ? storedBody.replace(/^#.*\n/, "")
          : live.split("\n").slice(1).join("\n");
        const out = `# SLOI broker ${new Date().toISOString()} db=${dbSource}\n${pubBody}\n${core}\n`;
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
        if (desk && desk.id !== LEGACY_TENANT) {
          const stored = await loadTape(desk.id);
          if (stored?.body) ingestBrokerTape(stored.body, tenant);
        }
        const account = ingestBrokerTape(text, tenant);
        if (/\bHOST\s+1\b/.test(text)) {
          const pub = hostPublicBody(text);
          ingestBrokerTape(pub, PUBLIC_TENANT);
          await saveTape(PUBLIC_TENANT, pub, null);
        }
        const merged = `${text.trim()}\n${exportBrokerTape(tenant)
          .split("\n")
          .filter((l) => l.startsWith("CDBAR "))
          .join("\n")}\n`;
        const rec = await saveTape(tenant, merged, account);
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
