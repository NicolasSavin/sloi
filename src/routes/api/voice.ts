import { createFileRoute } from "@tanstack/react-router";
import { synthesizeRu, yandexConfigured, yandexDebug } from "@/lib/yandex-tts";

export const Route = createFileRoute("/api/voice")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          ...yandexDebug(),
        }),
      POST: async ({ request }) => {
        if (!yandexConfigured()) {
          return Response.json({ error: "no-studio", ...yandexDebug() }, { status: 503 });
        }
        let text = "";
        try {
          const body = (await request.json()) as { text?: string };
          text = String(body.text ?? "").trim();
        } catch {
          return Response.json({ error: "bad-json" }, { status: 400 });
        }
        if (text.length < 2) return Response.json({ error: "empty" }, { status: 400 });
        const buf = await synthesizeRu(text);
        if (!buf) return Response.json({ error: "tts" }, { status: 502 });
        return new Response(buf, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
