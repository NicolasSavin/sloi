import { createFileRoute } from "@tanstack/react-router";
import { EA_FILE } from "@/lib/brand";
import { EA_SOURCE } from "@/lib/ea-source";
import { DEFAULT_EA, patchEaSource } from "@/lib/ea-settings";

function readyEa() {
  let src = EA_SOURCE.replace("#define MAXSYM 16", "#define MAXSYM 24");
  src = src.replace(
    "      string s = parts[i];\n      if(StringLen(g_suffix) > 0 && StringFind(s, g_suffix) < 0)",
    "      string s = parts[i];\n      if(StringLen(s) < 3) continue;\n      if(StringLen(g_suffix) > 0 && StringFind(s, g_suffix) < 0)",
  );
  src = src.replace(
    "         if(BidOf(b) > 0) s = b;\n         else if(BidOf(a) > 0) s = a;\n         else s = b;",
    "         SymbolSelect(s, true);\n         if(BidOf(s) > 0 || AskOf(s) > 0) { }\n         else if(BidOf(b) > 0 || AskOf(b) > 0) s = b;\n         else if(BidOf(a) > 0 || AskOf(a) > 0) s = a;",
  );
  return patchEaSource(src, {
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
