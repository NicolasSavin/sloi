import type { SignalHit } from "@/lib/dispatch-store";
import { formatPrice } from "@/lib/utils";
import { SITE_URL } from "@/lib/brand";

function cfg() {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.TG_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHANNEL || process.env.TG_CHANNEL || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return null;
  return { token, chat };
}

export function telegramReady() {
  return Boolean(cfg());
}

const g = globalThis as typeof globalThis & { __sloiTgSent__?: Set<string> };
function sent() {
  if (!g.__sloiTgSent__) g.__sloiTgSent__ = new Set();
  return g.__sloiTgSent__;
}

async function send(text: string) {
  const c = cfg();
  if (!c) return { ok: false as const, skip: true as const };
  try {
    const res = await fetch(`https://api.telegram.org/bot${c.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: c.chat,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { ok: false as const, skip: false as const, error: `${res.status} ${err.slice(0, 180)}` };
    }
    return { ok: true as const };
  } catch {
    return { ok: false as const, skip: false as const, error: "сеть" };
  }
}

function px(h: SignalHit, n: number | null | undefined) {
  if (n == null) return "—";
  return formatPrice(n, h.decimals);
}

function side(h: SignalHit) {
  return h.action === "long" ? "ЛОНГ" : "ШОРТ";
}

export function signalTelegramText(h: SignalHit) {
  return [
    `<b>SLOI · сигнал</b> ${h.label} · ${side(h)}`,
    `вход ${px(h, h.entry)} · стоп ${px(h, h.stop)} · цель ${px(h, h.target)}`,
    h.title ? h.title : "",
    `<a href="${SITE_URL}/dispatch">${SITE_URL.replace("https://", "")}/dispatch</a>`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function outcomeTelegramText(h: SignalHit) {
  const st =
    h.status === "target"
      ? "ИТОГ · тейк"
      : h.status === "stop"
        ? "ИТОГ · стоп"
        : h.status === "halt"
          ? "ИТОГ · новость, сняли"
          : h.status === "reverse"
            ? "ИТОГ · сценарий сняли"
            : "ИТОГ · не состоялся";
  const r = h.resultR != null ? ` · ${h.resultR >= 0 ? "+" : ""}${h.resultR.toFixed(2)}R` : "";
  return [
    `<b>SLOI · ${st}</b>${r}`,
    `${h.label} · ${side(h)}`,
    `вход ${px(h, h.entry)} → выход ${px(h, h.exit)}`,
    h.filled ? "ордер был в MT4" : "в терминале ордера не было — не плюс и не минус по счёту",
    h.why ? h.why.slice(0, 280) : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function fanoutTelegram(before: SignalHit[], after: SignalHit[]) {
  if (!cfg()) return { posted: 0, skip: true };
  const prev = new Map(before.map((h) => [h.id, h]));
  const bag = sent();
  let posted = 0;
  for (const h of after) {
    if (posted >= 4) break;
    const was = prev.get(h.id);
    const open = (h.status ?? "open") === "open";
    if (open && !was) {
      const key = `${h.id}:open`;
      if (bag.has(key)) continue;
      const r = await send(signalTelegramText(h));
      if (r.ok) {
        bag.add(key);
        posted++;
      }
      continue;
    }
    const nextSt = h.status ?? "open";
    if (was && (was.status ?? "open") === "open" && nextSt !== "open") {
      const key = `${h.id}:${nextSt}`;
      if (bag.has(key)) continue;
      const r = await send(outcomeTelegramText(h));
      if (r.ok) {
        bag.add(key);
        posted++;
      }
    }
  }
  if (bag.size > 400) {
    const keep = [...bag].slice(-200);
    g.__sloiTgSent__ = new Set(keep);
  }
  return { posted, skip: false };
}

export async function telegramTest() {
  const c = cfg();
  if (!c) return { ok: false as const, error: "Нет TELEGRAM_BOT_TOKEN или TELEGRAM_CHANNEL в Vercel." };
  const r = await send(`<b>SLOI</b>\nТест канала. Если видите это — сигналы и итоги пойдут сюда.`);
  if (!r.ok) return { ok: false as const, error: r.error ?? "не ушло" };
  return { ok: true as const, chat: c.chat };
}
