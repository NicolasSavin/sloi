import { createFileRoute } from "@tanstack/react-router";
import { EA_FILE } from "@/lib/brand";
import { EA_SOURCE } from "@/lib/ea-source";

export const Route = createFileRoute("/api/ea.mq4")({
  server: {
    handlers: {
      GET: async () =>
        new Response(EA_SOURCE, {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="${EA_FILE}"`,
            "Cache-Control": "no-store",
          },
        }),
    },
  },
});
