import { createFileRoute } from "@tanstack/react-router";
import { exportBrokerTape, ingestBrokerTape } from "@/lib/broker-tape";

export const Route = createFileRoute("/api/broker")({
  server: {
    handlers: {
      GET: async () =>
        new Response(exportBrokerTape(), {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
          },
        }),
      POST: async ({ request }) => {
        const text = await request.text();
        ingestBrokerTape(text);
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
