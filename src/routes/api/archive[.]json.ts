import { createFileRoute } from "@tanstack/react-router";
import { archivePayload, syncArchiveFromDigest } from "@/lib/archive-store";

export const Route = createFileRoute("/api/archive.json")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { assembleDigestPublic } = await import("@/lib/market/fetch");
          const { digest } = await assembleDigestPublic();
          syncArchiveFromDigest(digest.markets, digest.fund?.halt);
        } catch {
          /* keep last archive */
        }
        return new Response(JSON.stringify(archivePayload()), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=30",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
