const TTS = "https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize";

const KEY_NAMES = ["YANDEX_API_KEY", "YANDEX_TTS_KEY", "YC_API_KEY", "SPEECHKIT_API_KEY"] as const;

function envOf(name: string) {
  try {
    return String(process.env[name] ?? "").trim();
  } catch {
    return "";
  }
}

export function yandexKeyName() {
  return KEY_NAMES.find((n) => envOf(n).length > 8) ?? null;
}

export function yandexConfigured() {
  return Boolean(yandexKeyName());
}

export function yandexDebug() {
  const names = Object.keys(process.env ?? {}).filter((k) =>
    /yandex|speechkit|^YC_/i.test(k),
  );
  return {
    studio: yandexConfigured(),
    voice: envOf("YANDEX_VOICE") || "alena",
    keyName: yandexKeyName(),
    yandexNames: names,
    groq: Boolean(envOf("GROQ_API_KEY")),
  };
}

export async function synthesizeRu(text: string): Promise<ArrayBuffer | null> {
  const keyName = yandexKeyName();
  const key = keyName ? envOf(keyName) : "";
  if (!key || !text.trim()) return null;
  const voice = envOf("YANDEX_VOICE") || "alena";
  const folder = envOf("YANDEX_FOLDER_ID");
  const body = new URLSearchParams({
    text: text.slice(0, 4500),
    lang: "ru-RU",
    voice,
    emotion: "good",
    format: "mp3",
    speed: "1.05",
    sampleRateHertz: "48000",
  });
  if (folder) body.set("folderId", folder);
  const res = await fetch(TTS, {
    method: "POST",
    headers: { Authorization: `Api-Key ${key}` },
    body,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error("yandex tts", res.status, err.slice(0, 200));
    return null;
  }
  return res.arrayBuffer();
}