import { fillMode } from "@/lib/execution";
import { resolvedIana } from "@/lib/tz";

export type SignalTone = "long" | "short";

const PAIR_RU: Record<string, string> = {
  XAUUSD: "золото",
  XAGUSD: "серебро",
  EURUSD: "евро",
  GBPUSD: "фунт",
  USDJPY: "иена",
  USDCHF: "франк",
  AUDUSD: "австралийский доллар",
  USDCAD: "канадский доллар",
  NZDUSD: "новозеландский доллар",
  EURGBP: "евро к фунту",
  EURJPY: "евро к иене",
  GBPJPY: "фунт к иене",
  AUDJPY: "австралиец к иене",
  CADJPY: "канадец к иене",
  NZDJPY: "киви к иене",
  EURCHF: "евро к франку",
  EURAUD: "евро к австралийцу",
  GBPAUD: "фунт к австралийцу",
  XTIUSD: "нефть марки вити",
  XBRUSD: "нефть брент",
  XNGUSD: "природный газ",
  ETHUSD: "эфир",
  BTCUSD: "биткоин",
  LTCUSD: "лайткоин",
  BCHUSD: "биткоин кэш",
  XRPUSD: "рипл",
  TONUSD: "тонкоин",
  SPY: "индекс эс энд пи",
  QQQ: "индекс наздак",
  IWM: "расел",
  DIA: "индекс дау",
};

export function pairRu(id: string, label: string) {
  return PAIR_RU[id] ?? label.replace("/", " к ");
}

function speakClock(at = Date.now()) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: resolvedIana(),
    }).formatToParts(new Date(at));
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    const hs = h === 1 || h === 21 ? "час" : h % 10 >= 2 && h % 10 <= 4 && (h < 10 || h > 20) ? "часа" : "часов";
    const ms = m === 1 ? "минута" : m % 10 >= 2 && m % 10 <= 4 && (m < 10 || m > 20) ? "минуты" : "минут";
    if (m === 0) return `В ${h} ${hs}.`;
    return `В ${h} ${hs} ${m} ${ms}.`;
  } catch {
    return "";
  }
}

function toPips(dist: number, pip: number) {
  if (!(pip > 0) || !Number.isFinite(dist)) return 0;
  return Math.max(1, Math.round(Math.abs(dist) / pip));
}

function rrLine(entry?: number | null, stop?: number | null, target?: number | null, pip?: number) {
  if (entry == null || pip == null || !(pip > 0)) return "";
  const risk = stop != null ? toPips(entry - stop, pip) : 0;
  const gain = target != null ? toPips(target - entry, pip) : 0;
  if (risk && gain) return `Риск ${risk} пунктов, цель плюс ${gain} пунктов.`;
  if (gain) return `Цель плюс ${gain} пунктов.`;
  if (risk) return `Риск ${risk} пунктов.`;
  return "";
}

function shortWhy(raw?: string) {
  if (!raw) return "";
  const t = forVoice(raw)
    .replace(/\d+[.,]\d{3,}/g, "уровня")
    .split(/(?<=[.!?])\s+/)[0]
    ?.trim() ?? "";
  if (t.length < 12) return "";
  return t.length > 140 ? `${t.slice(0, 136)}.` : t;
}

export function forVoice(text: string) {
  return text
    .replace(/H1\s*\+\s*H4\s*\+\s*D1/gi, "час, четвёрка и дневка")
    .replace(/H1\s*\+\s*H4/gi, "час и четвёрка")
    .replace(/\bH1\b/g, "час")
    .replace(/\bH4\b/g, "четыре часа")
    .replace(/\bD1\b/g, "дневка")
    .replace(/CHoCH/gi, "смена характера")
    .replace(/\bBOS\b/g, "слом структуры")
    .replace(/\bFVG\b/g, "гэп")
    .replace(/\bOTE\b/g, "зона отката")
    .replace(/\bSL\b/g, "стоп")
    .replace(/\bTP\b/g, "цель")
    .replace(/\bRR\b/g, "риск к прибыли")
    .replace(/EUR\/USD|EURUSD/g, "евро доллар")
    .replace(/GBP\/USD|GBPUSD/g, "фунт")
    .replace(/XAUUSD|XAU\/USD/g, "золото")
    .replace(/\s+/g, " ")
    .trim();
}

export function scriptOrder(m: {
  spec: { id: string; label: string; pip: number };
  lastClose: number;
  advice: { action: "long" | "short" | "wait" | "skip"; therefore?: string };
  setup: { entry: number | null; stop: number | null; targets: number[] };
  story?: { doing?: string };
}): string {
  const at = speakClock();
  const name = pairRu(m.spec.id, m.spec.label);
  if (m.advice.action !== "long" && m.advice.action !== "short") {
    return `${at} По ${name} ждём. Ордер не открываем.`;
  }
  const side = m.advice.action === "long" ? "покупка" : "продажа";
  const entry = m.setup.entry;
  const stop = m.setup.stop ?? entry ?? m.lastClose;
  if (entry == null) return `${at} По ${name} ${side}. Зону ещё считаем.`;
  const mode = fillMode(m.advice.action, m.lastClose, entry, stop, m.setup.targets[0]);
  const dist = Math.abs(m.lastClose - entry);
  const pips = toPips(dist, m.spec.pip);
  const why = shortWhy(m.story?.doing || m.advice.therefore);
  const logic = why ? ` Логика: ${why}` : "";
  const rr = rrLine(entry, m.setup.stop, m.setup.targets[0], m.spec.pip);
  if (mode === "MARKET") {
    return `${at} Сигнал по ${name}. ${side} по рынку. Вход сейчас. ${rr}${logic}`;
  }
  if (mode === "LATE") {
    return `${at} По ${name} поздно. ${side} не догоняем.`;
  }
  const when =
    pips <= 4
      ? "зона рядом, лимитка может исполниться сразу"
      : pips <= 25
        ? `до входа примерно ${pips} пунктов`
        : `до зоны ещё ${pips} пунктов, ордер подождёт`;
  return `${at} Сигнал по ${name}. ${side} лимитным ордером. ${when}. ${rr}${logic}`;
}

export function scriptCancel(id: string, label: string, action: "long" | "short") {
  const name = pairRu(id, label);
  const side = action === "long" ? "покупку" : "продажу";
  return `${speakClock()} Отмена по ${name}. ${side} снимаем.`;
}

export function scriptReady(
  id: string,
  label: string,
  action: "long" | "short",
  pips: number,
  rr?: { entry?: number | null; stop?: number | null; target?: number | null; pip?: number },
) {
  const name = pairRu(id, label);
  const zone = action === "long" ? "зону покупки" : "зону продажи";
  const near = pips <= 3 ? "уже в зоне" : `ещё около ${pips} пунктов`;
  const line = rrLine(rr?.entry, rr?.stop, rr?.target, rr?.pip);
  return `${speakClock()} По ${name} заходи в ${zone}. Приготовиться. ${near}. ${line}`.trim();
}

export function scriptFill(
  id: string,
  label: string,
  action: "long" | "short",
  rr?: { entry?: number | null; stop?: number | null; target?: number | null; pip?: number },
) {
  const name = pairRu(id, label);
  const side = action === "long" ? "Покупка" : "Продажа";
  const line = rrLine(rr?.entry, rr?.stop, rr?.target, rr?.pip);
  return `${speakClock()} По ${name} лимитка сработала. ${side} в рынке. ${line}`.trim();
}

export function scriptExit(hit: {
  symbol: string;
  label: string;
  action: "long" | "short";
  status?: string;
  entry?: number | null;
  stop?: number | null;
  target?: number | null;
  exit?: number | null;
  closedAt?: number;
  pip?: number;
  decimals?: number;
}): string {
  const at = speakClock(hit.closedAt ?? Date.now());
  const name = pairRu(hit.symbol, hit.label);
  const side = hit.action === "long" ? "покупка" : "продажа";
  const pip =
    hit.pip && hit.pip > 0
      ? hit.pip
      : hit.decimals != null
        ? hit.decimals >= 4
          ? 0.0001
          : 0.01
        : 0;
  const moved =
    hit.entry != null && hit.exit != null && pip
      ? toPips(hit.exit - hit.entry, pip)
      : hit.entry != null && hit.stop != null && hit.status === "stop" && pip
        ? toPips(hit.entry - hit.stop, pip)
        : hit.entry != null && hit.target != null && hit.status === "target" && pip
          ? toPips(hit.target - hit.entry, pip)
          : 0;
  if (hit.status === "target") {
    return `${at} По ${name} сделка закрыта по тейку. Плюс около ${moved || "нескольких"} пунктов.`;
  }
  if (hit.status === "stop") {
    return `${at} По ${name} сделка закрыта по стопу. Минус около ${moved || "нескольких"} пунктов.`;
  }
  if (hit.status === "halt") return `${at} По ${name} ордер сняли из‑за новости. Это не стоп и не тейк.`;
  if (hit.status === "reverse") return `${at} По ${name} сценарий сняли: характер против. Лимитку убрали.`;
  if (hit.status === "expired") return `${at} По ${name} вход так и не дали. Сделка не состоялась.`;
  return `${at} По ${name} ордер закрыт. ${side}.`;
}

let ctx: AudioContext | null = null;

export function unlockSound() {
  if (typeof window === "undefined") return;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx ??= new AC();
  if (ctx.state === "suspended") void ctx.resume();
}

export function playSignal(tone: SignalTone) {
  unlockSound();
  if (!ctx) return;
  const now = ctx.currentTime;
  const freqs = tone === "long" ? [523.25, 659.25, 783.99] : [392, 329.63, 493.88];
  freqs.forEach((freq, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const t0 = now + i * 0.07;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.14, t0 + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
    osc.connect(gain);
    gain.connect(ctx!.destination);
    osc.start(t0);
    osc.stop(t0 + 0.6);
  });
}

export function playDispatch(tone: SignalTone) {
  playSignal(tone);
  window.setTimeout(() => playSignal(tone), 320);
}

let talkGen = 0;
let identAudio: HTMLAudioElement | null = null;
let studioAudio: HTMLAudioElement | null = null;
let voicesCache: SpeechSynthesisVoice[] = [];
let studioOk: boolean | null = null;

let studioSrc: AudioBufferSourceNode | null = null;

export function stopSpeech() {
  if (typeof window === "undefined") return;
  talkGen += 1;
  identAudio?.pause();
  try {
    studioSrc?.stop();
  } catch {
    /* already stopped */
  }
  studioSrc = null;
  if (studioAudio) {
    studioAudio.pause();
    studioAudio.src = "";
  }
  window.speechSynthesis?.cancel();
}

function scoreRu(v: SpeechSynthesisVoice) {
  const n = `${v.name} ${v.lang}`.toLowerCase();
  let s = 0;
  if (/^ru/.test(v.lang.toLowerCase())) s += 8;
  if (/russian|русский/.test(n)) s += 6;
  if (/natural|neural|online/.test(n)) s += 5;
  if (/google/.test(n)) s += 4;
  if (/pavel|dmitri|dmitry|irina|milena|ekaterina|мария/.test(n)) s += 3;
  if (!v.localService) s += 2;
  return s;
}

function waitVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !window.speechSynthesis) return Promise.resolve([]);
  const have = window.speechSynthesis.getVoices();
  if (have.length) {
    voicesCache = have;
    return Promise.resolve(have);
  }
  return new Promise((resolve) => {
    const finish = () => {
      voicesCache = window.speechSynthesis.getVoices();
      resolve(voicesCache);
    };
    window.speechSynthesis.addEventListener("voiceschanged", finish, { once: true });
    window.setTimeout(finish, 700);
  });
}

function pickRu(): SpeechSynthesisVoice | undefined {
  const list = (voicesCache.length ? voicesCache : window.speechSynthesis.getVoices()).slice();
  list.sort((a, b) => scoreRu(b) - scoreRu(a));
  return list.find((v) => scoreRu(v) >= 6) ?? list[0];
}

function playIdent(): Promise<void> {
  return new Promise((resolve) => {
    try {
      identAudio?.pause();
      identAudio = new Audio("/voice/ident.mp3");
      identAudio.volume = 0.9;
      identAudio.onended = () => resolve();
      identAudio.onerror = () => resolve();
      void identAudio.play().catch(() => resolve());
    } catch {
      resolve();
    }
  });
}

function splitSentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function playStudio(text: string, gen: number): Promise<boolean> {
  try {
    if (studioOk === false) return false;
    unlockSound();
    const res = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.status === 503) {
      studioOk = false;
      return false;
    }
    if (!res.ok) return false;
    const raw = await res.arrayBuffer();
    if (gen !== talkGen) return true;
    studioOk = true;
    unlockSound();
    if (!ctx) return false;
    if (ctx.state === "suspended") await ctx.resume();
    const buf = await ctx.decodeAudioData(raw.slice(0));
    if (gen !== talkGen) return true;
    try {
      studioSrc?.stop();
    } catch {
      /* */
    }
    await new Promise<void>((resolve) => {
      const src = ctx!.createBufferSource();
      studioSrc = src;
      src.buffer = buf;
      src.connect(ctx!.destination);
      src.onended = () => resolve();
      try {
        src.start();
      } catch {
        resolve();
      }
    });
    return true;
  } catch {
    return false;
  }
}

export async function testVoice() {
  unlockSound();
  await speakRu("Стол на связи. Голос Алёна. Сигнал, отмена и зона будут с этой озвучкой.");
}

export async function speakRu(text: string, opts?: { ident?: boolean }): Promise<void> {
  if (typeof window === "undefined") return;
  const gen = ++talkGen;
  window.speechSynthesis?.cancel();
  studioAudio?.pause();
  if (opts?.ident) await playIdent();
  if (gen !== talkGen) return;
  const said = forVoice(text);
  if (await playStudio(said, gen)) return;
  if (!window.speechSynthesis) return;
  await waitVoices();
  if (gen !== talkGen) return;
  const voice = pickRu();
  const parts = splitSentences(said);
  for (const part of parts) {
    if (gen !== talkGen) return;
    await new Promise<void>((resolve) => {
      const utter = new SpeechSynthesisUtterance(part);
      utter.lang = "ru-RU";
      utter.rate = 0.86;
      utter.pitch = 1;
      utter.volume = 1;
      if (voice) utter.voice = voice;
      utter.onend = () => window.setTimeout(() => resolve(), 220);
      utter.onerror = () => resolve();
      window.speechSynthesis.speak(utter);
    });
  }
}

export function scriptFor(input: {
  label: string;
  action: "long" | "short" | "wait" | "skip";
  doing: string;
  waiting: string;
  leadsTo: string;
  fund?: string;
  channel?: string;
  foreign?: boolean;
}): string {
  const open =
    input.action === "long"
      ? "Идея на покупку."
      : input.action === "short"
        ? "Идея на продажу."
        : input.action === "skip"
          ? "Вход не берём: спред съест ход."
          : "Ордер не открываем, ждём край.";
  const screen = input.foreign
    ? `На экране ${input.channel ?? "иностранный эфир"}. Говорю по-русски разбор стола.`
    : input.channel
      ? `На экране ${input.channel}.`
      : "";
  const fund = input.fund ? ` ${input.fund}` : "";
  return forVoice(`${screen} ${input.label}. ${open}${fund} ${input.doing} ${input.waiting} ${input.leadsTo}`);
}
