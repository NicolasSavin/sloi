import { createFileRoute } from "@tanstack/react-router";
import { renderSignalFeed } from "@/lib/market/fetch";
import { pendingCommandLines, resolveDesk } from "@/lib/desk-tenant";

export const Route = createFileRoute("/api/signals.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const key = url.searchParams.get("k") ?? "";
        const desk = await resolveDesk(key);
        const body = await renderSignalFeed(desk?.id);
        const cmds = desk && desk.id !== "legacy" ? await pendingCommandLines(desk.id) : [];
        const extra = cmds.length ? `${cmds.join("\n")}\n` : "";
        return new Response(`${body}${extra}`, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
