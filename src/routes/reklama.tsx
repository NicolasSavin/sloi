import { createFileRoute } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";

export const Route = createFileRoute("/reklama")({
  component: ReklamaPage,
});

function ReklamaPage() {
  return (
    <div className="min-h-dvh">
      <AppNav />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <p className="font-mono text-xs tracking-[0.22em] text-accent">ДЛЯ ПОСТА</p>
        <h1 className="mt-3 text-4xl">Картинка и видео</h1>
        <p className="mt-3 text-sm text-muted">Скачайте или скопируйте ссылку. Видео — в Telegram как ролик.</p>
        <video
          className="mt-6 w-full rounded-xl panel-volume"
          src="/art/sloi-reklama.mp4"
          poster="/art/sloi-reklama.jpg"
          controls
          autoPlay
          muted
          loop
          playsInline
        />
        <img src="/art/sloi-reklama.jpg" alt="SLOI" className="mt-6 w-full rounded-xl panel-volume" />
        <p className="mt-4 break-all font-mono text-xs text-dim">
          https://sloi-kohl.vercel.app/art/sloi-reklama.mp4
          <br />
          https://sloi-kohl.vercel.app/art/sloi-reklama.jpg
        </p>
      </main>
    </div>
  );
}
