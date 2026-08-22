import { createFileRoute } from "@tanstack/react-router";
import { renderSignalFeed } from "@/lib/market/fetch";

export const Route = createFileRoute("/api/signals.txt")({
  server: {
    handlers: {
      GET: async () =>
        new Response(await renderSignalFeed(), {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=20",
            "Access-Control-Allow-Origin": "*",
          },
        }),
    },
  },
});
