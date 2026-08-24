import { Link, useRouterState } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { BRAND, DOMAIN, EA_FILE } from "@/lib/brand";
import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/", label: "Главная" },
  { to: "/news", label: "Новости" },
  { to: "/calendar", label: "Календарь" },
  { to: "/dispatch", label: "Диспетчер" },
  { to: "/ideas", label: "TradingView" },
  { to: "/stats", label: "Статистика" },
  { to: "/tv", label: "ТВ" },
  { to: "/desk", label: "График" },
  { to: "/daily", label: "Сегодня" },
  { to: "/advisor", label: "Эксперт MT4" },
  { to: "/about", label: "О сайте" },
] as const;

export function AppNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-bg/70 backdrop-blur-md">
      <div className="flex items-center gap-3 overflow-x-auto px-3 py-3 sm:px-5">
        <Link to="/" className="flex shrink-0 items-baseline gap-2">
          <span className="font-mono text-sm tracking-[0.22em] text-accent">{BRAND}</span>
          <span className="text-xs text-dim">{DOMAIN}</span>
        </Link>
        <div className="hidden h-4 w-px bg-border sm:block" />
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => {
            const active = l.to === "/" ? pathname === "/" : pathname.startsWith(l.to);
            return (
              <Link
                key={l.to}
                to={l.to}
                className={cn(
                  "inline-flex h-11 shrink-0 items-center rounded-sm px-3 text-xs font-medium transition-colors",
                  active ? "bg-subtle text-fg" : "text-muted hover:text-fg",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <a
          href="/api/ea.mq4"
          download={EA_FILE}
          className="btn-metal ml-auto inline-flex h-11 shrink-0 items-center gap-2 rounded-sm px-3 text-xs font-medium text-accent-fg"
        >
          <Download className="size-3.5" />
          Скачать .mq4
        </a>
      </div>
    </header>
  );
}
