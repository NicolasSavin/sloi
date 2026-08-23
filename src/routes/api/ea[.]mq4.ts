import { createFileRoute } from "@tanstack/react-router";
import { EA_FILE } from "@/lib/brand";
import { EA_SOURCE } from "@/lib/ea-source";
import { DEFAULT_EA, patchEaSource } from "@/lib/ea-settings";

function readyEa() {
  return patchEaSource(EA_SOURCE.replace("#define MAXSYM 16", "#define MAXSYM 24"), {
    ...DEFAULT_EA,
    suffix: DEFAULT_EA.suffix || ".cs",
  });
}

export const Route = createFileRoute("/api/ea.mq4")({
  server: {
    handlers: {
      GET: async () =>
        new Response(readyEa(), {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="${EA_FILE}"`,
            "Cache-Control": "no-store",
          },
        }),
    },
  },
});
