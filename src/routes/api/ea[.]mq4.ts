import { createFileRoute } from "@tanstack/react-router";
import { EA_FILE } from "@/lib/brand";
import { EA_SOURCE } from "@/lib/ea-source";
import { DEFAULT_EA, patchEaSource } from "@/lib/ea-settings";

function readyEa() {
  let src = EA_SOURCE.replace("#define MAXSYM 16", "#define MAXSYM 32");
  src = src.replace("#define MAXSYM 24", "#define MAXSYM 32");
  src = src.replace('#property version   "4.16"', '#property version   "4.20"');
  src = src.replace('#property version   "4.18"', '#property version   "4.20"');
  src = src.replace('#property version   "4.34"', '#property version   "4.37"');
  src = src.replace('#property version   "4.35"', '#property version   "4.37"');
  src = src.replace('#property version   "4.36"', '#property version   "4.41"');
  src = src.replace('#property version   "4.37"', '#property version   "4.41"');
  src = src.replace('#property version   "4.40"', '#property version   "4.42"');
  src = src.replace('#property version   "4.41"', '#property version   "4.42"');
  src = src.replace(
    "      string s = parts[i];\n      if(StringLen(g_suffix) > 0 && StringFind(s, g_suffix) < 0)",
    "      string s = parts[i];\n      if(StringLen(s) < 3) continue;\n      if(StringLen(g_suffix) > 0 && StringFind(s, g_suffix) < 0)",
  );
  src = src.replace(
    "         if(BidOf(b) > 0) s = b;\n         else if(BidOf(a) > 0) s = a;\n         else s = b;",
    "         SymbolSelect(s, true);\n         if(BidOf(s) > 0 || AskOf(s) > 0) { }\n         else if(BidOf(b) > 0 || AskOf(b) > 0) s = b;\n         else if(BidOf(a) > 0 || AskOf(a) > 0) s = a;",
  );
  src = src.replace(
    'if(StringFind(u, "USO") >= 0 || StringFind(u, "WTI") >= 0 || StringFind(u, "XTI") >= 0) return("USOIL");',
    'if(StringFind(u, "XBR") >= 0 || StringFind(u, "BRENT") >= 0) return("XBRUSD");\n   if(StringFind(u, "XNG") >= 0) return("XNGUSD");\n   if(StringFind(u, "USO") >= 0 || StringFind(u, "WTI") >= 0 || StringFind(u, "XTI") >= 0) return("XTIUSD");',
  );
  src = src.replace(
    'if(n == "USOIL") return(0.30);',
    'if(n == "USOIL" || n == "XTIUSD" || n == "XBRUSD") return(0.40);\n   if(n == "XNGUSD") return(0.80);\n   if(StringFind(n, "BTC") >= 0 || StringFind(n, "ETH") >= 0) return(1.50);\n   if(StringFind(n, "LTC") >= 0 || StringFind(n, "XRP") >= 0 || StringFind(n, "TON") >= 0 || StringFind(n, "BCH") >= 0) return(2.20);',
  );
  src = src.replace(
    'if(OrderSymbol() == s && OrderMagicNumber() == Magic) n++;',
    'if(OrderSymbol() != s || OrderMagicNumber() != Magic) continue;\n      int ty = OrderType();\n      if(ty==OP_BUY || ty==OP_SELL || ty==OP_BUYLIMIT || ty==OP_SELLLIMIT || ty==OP_BUYSTOP || ty==OP_SELLSTOP) n++;',
  );
  src = src.replace(
    '   if(dir == 0) return;\n   if(spPts > g_maxSp) { dir = 0; verdict = "СПРЕД"; why = IntegerToString(spPts)+"п"; return; }\n   double px = (dir > 0 ? AskOf(s) : BidOf(s));\n   if(entry <= 0) entry = px;\n   if(stop <= 0 || target <= 0) { dir = 0; verdict = "ЖДАТЬ"; why = "нет SL/TP"; return; }\n   double grossR = MathAbs(target - px);\n   double grossK = MathAbs(px - stop);',
    '   if(dir == 0) return;\n   double px = (dir > 0 ? AskOf(s) : BidOf(s));\n   if(entry <= 0) entry = px;\n   if(stop <= 0 || target <= 0) { dir = 0; verdict = "ЖДАТЬ"; why = "нет SL/TP"; return; }\n   if(lim == 0 && spPts > g_maxSp) { dir = 0; verdict = "СПРЕД"; why = IntegerToString(spPts)+"п"; return; }\n   if(lim > 0 && mid > 0 && spread / mid * 100.0 > 1.5)\n     { dir = 0; verdict = "СПРЕД"; why = "дыра "+DoubleToStr(spread/mid*100.0, 2)+"%"; return; }\n   double pxRef = (lim > 0 ? entry : px);\n   double grossR = MathAbs(target - pxRef);\n   double grossK = MathAbs(pxRef - stop);',
  );
  src = src.replace(
    '   why = "сверка "+bias+" RR "+DoubleToStr(rr, 1);',
    '   if(lim > 0) why = "лимит "+Px(s, entry)+" RR "+DoubleToStr(rr, 1);\n   else why = "сверка "+bias+" RR "+DoubleToStr(rr, 1);',
  );
  return patchEaSource(src, {
    ...DEFAULT_EA,
    suffix: DEFAULT_EA.suffix || ".cs",
  });
}

export const Route = createFileRoute("/api/ea.mq4")({
  server: {
    handlers: {
      GET: async () =>
        new Response(readyEa(), {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="${EA_FILE}"`,
            "Cache-Control": "no-store",
          },
        }),
    },
  },
});
