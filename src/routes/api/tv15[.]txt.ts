import { createFileRoute } from "@tanstack/react-router";
import { renderTv15 } from "@/lib/tv-lead";

export const Route = createFileRoute("/api/tv15.txt")({
  server: {
    handlers: {
      GET: async () => {
        const body = await renderTv15();
        return new Response(body, {
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
