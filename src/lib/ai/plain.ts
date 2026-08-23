function asGroq(raw?: string) {
  if (!raw) return undefined;
  if (raw.startsWith("xai-") || raw.startsWith("AIza")) return undefined;
  return raw;
}

const CHAIN = [
  {
    id: "groq",
    label: "Llama",
    key: asGroq(process.env.GROQ_API_KEY) || asGroq(process.env.GROK_API_KEY),
    url: "https://api.groq.com/openai/v1/chat/completions",
    models: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"],
  },
  {
    id: "gemini",
    label: "Gemini",
    key: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    models: ["gemini-2.0-flash", "gemini-2.5-flash"],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    key: process.env.OPENROUTER_API_KEY,
    url: "https://openrouter.ai/api/v1/chat/completions",
    models: [process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free"],
  },
  {
    id: "openai",
    label: "GPT",
    key: process.env.OPENAI_API_KEY,
    url: "https://api.openai.com/v1/chat/completions",
    models: ["gpt-4o-mini"],
  },
  {
    id: "grok",
    label: "Grok",
    key: [process.env.XAI_API_KEY, process.env.GROK_API_KEY].find((k) => k?.startsWith("xai-")),
    url: "https://api.x.ai/v1/chat/completions",
    models: ["grok-3", "grok-4"],
  },
];

export async function askPlain(system: string, user: string): Promise<{ text: string; model: string } | null> {
  for (const p of CHAIN.filter((x) => x.key)) {
    for (const model of p.models) {
      try {
        const res = await fetch(p.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
        });
        if (!res.ok) continue;
        const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = json.choices?.[0]?.message?.content?.trim();
        if (text && text.length > 40) return { text, model: p.label };
      } catch {
        continue;
      }
    }
  }
  return null;
}
