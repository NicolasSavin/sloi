import { createFileRoute } from "@tanstack/react-router";
import { telegramReady, telegramTest } from "@/lib/telegram";

export const Route = createFileRoute("/api/telegram")({
  server: {
    handlers: {
      GET: async () => Response.json({ ready: telegramReady() }),
      POST: async () => {
        const r = await telegramTest();
        return Response.json(r, { status: r.ok ? 200 : 400 });
      },
    },
  },
});
