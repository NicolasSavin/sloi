# SLOI

Слои рынка: SMC, объёмы, волны, опционы. Сайт считает, MT4-эксперт исполняет.

Живой адрес: [https://sloi-kohl.vercel.app](https://sloi-kohl.vercel.app)

Лента для советника: `https://sloi-kohl.vercel.app/api/signals.txt`

## Нейросеть (необязательно)

Движок SMC работает без ключей. Кнопка «разобрать нейросетью» берёт первую доступную:

| Переменная | Модель |
|---|---|
| `XAI_API_KEY` | Grok 4.5 |
| `GROQ_API_KEY` | Llama 3.3 70B (бесплатный ключ на groq.com) |
| `GEMINI_API_KEY` | Gemini 2.0 Flash |
| `OPENAI_API_KEY` | GPT-4o mini |
| `OPENROUTER_API_KEY` | любая, или `OPENROUTER_MODEL` |

Vercel → Project → Settings → Environment Variables → Redeploy. Ключ не коммитьте.
