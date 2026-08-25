const TTS = "https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize";

export function yandexConfigured() {
  return Boolean(process.env.YANDEX_API_KEY?.trim());
}

export async function synthesizeRu(text: string): Promise<ArrayBuffer | null> {
  const key = process.env.YANDEX_API_KEY?.trim();
  if (!key || !text.trim()) return null;
  const voice = process.env.YANDEX_VOICE?.trim() || "alena";
  const folder = process.env.YANDEX_FOLDER_ID?.trim();
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