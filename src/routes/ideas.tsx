import { useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppNav } from "@/components/app-nav";
import { tvSymbol } from "@/lib/tradingview";

export const Route = createFileRoute("/ideas")({
  validateSearch: (s: Record<string, unknown>) => ({
    pair: typeof s.pair === "string" ? s.pair : "EURUSD",
  }),
  component: IdeasPage,
});

function IdeasPage() {
  const { pair } = Route.useSearch();
  const symbol = tvSymbol(pair);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = host.current;
    if (!root) return;
    root.replaceChildren();
    const box = document.createElement("div");
    box.className = "tradingview-widget-container";
    box.style.height = "100%";
    box.style.width = "100%";
    const pane = document.createElement("div");
    pane.className = "tradingview-widget-container__widget";
    pane.style.height = "calc(100% - 32px)";
    pane.style.width = "100%";
    const copy = document.createElement("div");
    copy.className = "tradingview-widget-container__copyright";
    copy.innerHTML =
      '<a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank"><span class="blue-text">График TradingView</span></a>';
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: "60",
      timezone: "Asia/Dubai",
      theme: "dark",
      style: "1",
      locale: "ru",
      backgroundColor: "#131722",
      gridColor: "rgba(242, 242, 242, 0.06)",
      allow_symbol_change: true,
      hide_top_toolbar: false,
      hide_side_toolbar: false,
      hide_legend: false,
      withdateranges: true,
      details: true,
      save_image: true,
      studies: ["STD;RSI", "STD;MACD"],
      support_host: "https://www.tradingview.com",
    });
    box.append(pane, copy, script);
    root.append(box);
    return () => root.replaceChildren();
  }, [symbol]);

  return (
    <div className="flex h-screen flex-col bg-[#131722] text-zinc-100">
      <AppNav />
      <div ref={host} className="min-h-0 flex-1" />
    </div>
  );
}
