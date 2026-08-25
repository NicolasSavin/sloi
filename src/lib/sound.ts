import { fillMode } from "@/lib/execution";

export type SignalTone = "long" | "short";

const PAIR_RU: Record<string, string> = {
  XAUUSD: "золото",
  XAGUSD: "серебро",
  EURUSD: "евро доллар",
  GBPUSD: "фунт доллар",
  USDJPY: "доллар иена",
  USDCHF: "доллар франк",
  AUDUSD: "австралиец",
  USDCAD: "канадец",
  NZDUSD: "киви",
  EURGBP: "евро фунт",
  EURJPY: "евро иена",
  GBPJPY: "фунт иена",
  AUDJPY: "австралиец иена",
  CADJPY: "канадец иена",
  NZDJPY: "киви иена",
  EURCHF: "евро франк",
  EURAUD: "евро австралиец",
  GBPAUD: "фунт австралиец",
  XTIUSD: "нефть ВТИ",
  XBRUSD: "brent",
  XNGUSD: "газ",
  ETHUSD: "эфир",
  BTCUSD: "биткоин",
  LTCUSD: "лайткоин",
  BCHUSD: "биткоин кэш",
  XRPUSD: "рипл",
  TONUSD: "тон",
  SPY: "эс энд пи",
  QQQ: "наздак",
};

function pairRu(id: string, label: string) {
  return PAIR_RU[id] ?? label.replace("/", " ");
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
  advice: { action: "long" | "short" | "wait" | "skip" };
  setup: { entry: number | null; stop: number | null; targets: number[] };
}): string {
  const name = pairRu(m.spec.id, m.spec.label);
  if (m.advice.action !== "long" && m.advice.action !== "short") {
    return `${name}. Сейчас ждём. Ордер не открываем.`;
  }
  const side = m.advice.action === "long" ? "покупка" : "продажа";
  const entry = m.setup.entry;
  const stop = m.setup.stop ?? entry ?? m.lastClose;
  if (entry == null) return `${name}. ${side}. Зону ещё считаем.`;
  const mode = fillMode(m.advice.action, m.lastClose, entry, stop, m.setup.targets[0]);
  const dist = Math.abs(m.lastClose - entry);
  const pips = m.spec.pip > 0 ? Math.round(dist / m.spec.pip) : 0;
  if (mode === "MARKET") {
    return `Сигнал по ${name}. ${side} по рынку. Вход сейчас.`;
  }
  if (mode === "LATE") {
    return `По ${name} поздно. ${side} не догоняем.`;
  }
  const when =
    pips <= 4
      ? "зона рядом, лимитка может исполниться сразу"
      : pips <= 25
        ? `до входа примерно ${pips} пунктов`
        : `до зоны ещё ${pips} пунктов, ордер подождёт`;
  return `Сигнал по ${name}. ${side} лимитным ордером. ${when}.`;
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

export function stopSpeech() {
  if (typeof window === "undefined") return;
  talkGen += 1;
  identAudio?.pause();
  window.speechSynthesis?.cancel();
}

let talkGen = 0;
let identAudio: HTMLAudioElement | null = null;
let voicesCache: SpeechSynthesisVoice[] = [];

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

export async function speakRu(text: string, opts?: { ident?: boolean }): Promise<void> {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const gen = ++talkGen;
  window.speechSynthesis.cancel();
  if (opts?.ident) await playIdent();
  if (gen !== talkGen) return;
  await waitVoices();
  if (gen !== talkGen) return;
  const voice = pickRu();
  const parts = splitSentences(forVoice(text));
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
