import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PAIR_OPTIONS } from "@/lib/ea-settings";

const KeyIn = z.object({ key: z.string().min(8).max(120) });
const CmdIn = z.object({
  key: z.string().min(8).max(120),
  kind: z.enum(["PAUSE", "RESUME", "CLOSE_ALL", "CLOSE_PROFIT", "CLOSE", "BUY", "SELL"]),
  symbol: z.string().max(16).optional(),
});

export const createDeskFn = createServerFn({ method: "POST" }).handler(async () => {
  const { createDesk } = await import("@/lib/desk-tenant");
  return createDesk();
});

export const openDeskFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => KeyIn.parse(input))
  .handler(async ({ data }) => {
    const { resolveDesk, validKeyShape, loadTape } = await import("@/lib/desk-tenant");
    if (!validKeyShape(data.key)) return { ok: false as const, error: "Ключ не похож на стол SLOI." };
    const desk = await resolveDesk(data.key);
    if (!desk || desk.id === "legacy") return { ok: false as const, error: "Стол не найден. Создайте новый или проверьте ключ." };
    const tape = await loadTape(desk.id);
    return {
      ok: true as const,
      id: desk.id,
      prefix: desk.prefix,
      auto: desk.auto,
      account: tape?.account ?? null,
    };
  });

export const deskCommandFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => CmdIn.parse(input))
  .handler(async ({ data }) => {
    const { resolveDesk, enqueueCommand, validKeyShape } = await import("@/lib/desk-tenant");
    if (!validKeyShape(data.key)) return { ok: false as const, error: "Нет ключа." };
    const desk = await resolveDesk(data.key);
    if (!desk || desk.id === "legacy") return { ok: false as const, error: "Стол не найден." };
    let payload = "";
    if (data.kind === "CLOSE" || data.kind === "BUY" || data.kind === "SELL") {
      const sym = (data.symbol ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
      if (!PAIR_OPTIONS.includes(sym as (typeof PAIR_OPTIONS)[number])) {
        return { ok: false as const, error: "Нет такой пары." };
      }
      payload = sym;
    }
    const id = await enqueueCommand(desk.id, data.kind, payload);
    return { ok: true as const, id };
  });
