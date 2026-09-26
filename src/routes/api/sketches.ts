import { createFileRoute } from "@tanstack/react-router";
import { askVision } from "@/lib/ai/plain";
import { addSketch, eraseSketch, listSketches } from "@/lib/sketch-store";

const CHART_EYE = `Ты смотришь скриншот рыночного графика. Пиши по-русски и только то, что видно на картинке.
Назови инструмент и таймфрейм, если они подписаны.
Перечисли фигуры, стрелки, зоны, имбаланс, дивер, подписи и куда они смотрят.
Скажи, что из этого следует для цены: сначала куда, потом куда.
Не выдумывай цены и фигуры, которых на графике нет. Пять-восемь предложений.`;

async function notesFromChart(typed: string, image: string, instrument: string) {
  const hint = instrument
    ? `Если инструмент не подписан, считай его так: ${instrument}. Опиши, что нарисовано и написано на графике.`
    : "Опиши, что нарисовано и написано на графике.";
  const seen = await askVision(CHART_EYE, hint, image);
  if ("text" in seen) return typed.length >= 8 ? `${typed}\n${seen.text}` : seen.text;
  if (typed.length >= 8) return typed;
  throw new Error(seen.miss);
}

export const Route = createFileRoute("/api/sketches")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const notes = await listSketches();
          return Response.json({ notes });
        } catch {
          return Response.json({ notes: [], error: "db" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        let body: { instrument?: string; notes?: string; image?: string };
        try {
          body = (await request.json()) as { instrument?: string; notes?: string; image?: string };
        } catch {
          return Response.json({ error: "bad-json" }, { status: 400 });
        }
        try {
          const typed = String(body.notes ?? "").trim();
          const image = String(body.image ?? "");
          const instrument = String(body.instrument ?? "");
          const notes = await notesFromChart(typed, image, instrument);
          const saved = await addSketch({ instrument, notes, image });
          return Response.json(saved);
        } catch (err) {
          const code = err instanceof Error ? err.message : "save";
          return Response.json({ error: code }, { status: 400 });
        }
      },
      DELETE: async ({ request }) => {
        let body: { id?: string; token?: string };
        try {
          body = (await request.json()) as { id?: string; token?: string };
        } catch {
          return Response.json({ error: "bad-json" }, { status: 400 });
        }
        const ok = await eraseSketch(String(body.id ?? ""), String(body.token ?? ""));
        return Response.json({ ok }, { status: ok ? 200 : 403 });
      },
    },
  },
});
