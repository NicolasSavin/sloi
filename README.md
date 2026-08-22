# SLOI

Слои рынка: SMC, объёмы, волны, опционы. Сайт считает, MT4-эксперт исполняет.

## Адрес после публикации

Лента для советника:

`https://<ваш-хост>/api/signals.txt`

Скачать эксперт: `/api/ea.mq4`

## Vercel (рекомендуется)

1. Откройте [vercel.com/new](https://vercel.com/new) и импортируйте этот репозиторий.
2. Framework: Other. Build: `npm run build`. Node 22.
3. (Необязательно) переменная `XAI_API_KEY` — только для кнопки «разобрать нейросетью».
4. После деплоя скопируйте URL вида `https://sloi-….vercel.app`.

В MT4: Сервис → Настройки → Советники → WebRequest → этот URL.  
В панели эксперта поле **лента**: `https://sloi-….vercel.app/api/signals.txt`. Суффикс брокера `cs`.

## Render

New → Web Service → этот репозиторий. Build `npm install && npm run build`. Start: смотрите `render.yaml`.
