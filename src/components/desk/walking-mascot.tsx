import { useEffect, useRef } from "react";

export function WalkingMascot({ kind }: { kind: "bull" | "bear" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const w = 220;
    const h = 140;
    const tick = (now: number) => {
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(110, 78);
      ctx.scale(kind === "bull" ? 1.15 : 1.05, 1.15);
      const step = Math.sin(t * 7);
      const bob = Math.abs(Math.sin(t * 7)) * 3;
      ctx.translate(0, -bob);
      if (kind === "bull") drawBull(ctx, t, step);
      else drawBear(ctx, t, step);
      ctx.restore();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [kind]);
  return (
    <canvas
      ref={ref}
      width={220}
      height={140}
      className="pointer-events-none h-[140px] w-[220px]"
      aria-hidden
    />
  );
}

function leg(ctx: CanvasRenderingContext2D, x: number, y: number, ph: number, color: string) {
  const a = Math.sin(ph) * 0.55;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.sin(a) * 2, 18);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(Math.sin(a) * 2, 18);
  ctx.lineTo(Math.sin(a) * 8, 32);
  ctx.stroke();
  ctx.fillStyle = "#d8c8a8";
  ctx.beginPath();
  ctx.ellipse(Math.sin(a) * 8 + 3, 34, 7, 3.2, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBull(ctx: CanvasRenderingContext2D, t: number, step: number) {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(4, 40 + Math.abs(step) * 2, 38, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  const coat = ctx.createLinearGradient(-30, -20, 20, 30);
  coat.addColorStop(0, "#6a3a18");
  coat.addColorStop(0.45, "#3d220e");
  coat.addColorStop(1, "#1a0e06");
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.ellipse(0, 4, 34, 20, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-8, -10, 16, 12, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(28, -6, 16, 13, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e8d8b0";
  ctx.beginPath();
  ctx.ellipse(36, -2, 8, 6, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#f4ead0";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(22, -16);
  ctx.quadraticCurveTo(14, -38, 26, -18);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(32, -16);
  ctx.quadraticCurveTo(44, -40, 38, -14);
  ctx.stroke();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(34, -8, 2, 0, Math.PI * 2);
  ctx.fill();
  const tail = Math.sin(t * 9) * 0.5;
  ctx.save();
  ctx.translate(-32, -2);
  ctx.rotate(-0.6 + tail);
  ctx.strokeStyle = "#3d220e";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-12, 10, -8, 22);
  ctx.stroke();
  ctx.restore();
  const dark = "#2a1608";
  leg(ctx, -14, 16, t * 7, dark);
  leg(ctx, -2, 16, t * 7 + Math.PI, dark);
  leg(ctx, 10, 16, t * 7 + 0.4, dark);
  leg(ctx, 20, 16, t * 7 + Math.PI + 0.4, dark);
}

function drawBear(ctx: CanvasRenderingContext2D, t: number, step: number) {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(2, 40 + Math.abs(step) * 2, 36, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  const fur = ctx.createLinearGradient(-24, -16, 18, 28);
  fur.addColorStop(0, "#8a5a32");
  fur.addColorStop(0.5, "#5a3418");
  fur.addColorStop(1, "#2a1608");
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(0, 6, 30, 22, -0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(26, -4, 16, 14, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(18, -16, 7, 8, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(32, -16, 7, 8, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c8a070";
  ctx.beginPath();
  ctx.ellipse(34, 0, 7, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(32, -6, 2.1, 0, Math.PI * 2);
  ctx.fill();
  const dark = "#3a2010";
  leg(ctx, -12, 20, t * 6.2, dark);
  leg(ctx, 0, 20, t * 6.2 + Math.PI, dark);
  leg(ctx, 12, 20, t * 6.2 + 0.5, dark);
  leg(ctx, 22, 20, t * 6.2 + Math.PI + 0.5, dark);
}