//+------------------------------------------------------------------+
//| SLOI_Imb.mq4                                                     |
//| Только имбаланс. Тейк — ближний край дыры.                       |
//| Вход не сразу: сначала снятие ближайшей ликвидности по ту сторону.|
//| Магия 220828, стол и Lead не трогает.                            |
//+------------------------------------------------------------------+
#property copyright "SLOI"
#property version   "1.03"
#property strict
#property description "SLOI Imb 1.03: дыра на графике яркая, подпись слева, текст про эту пару"

input string WatchList      = "EURUSD,GBPUSD,USDJPY,USDCHF,AUDUSD,USDCAD,NZDUSD,EURGBP,EURJPY,GBPJPY,EURAUD,GBPCAD,GBPAUD,XAUUSD,XAGUSD";
input string BrokerSuffix   = ".cs";
input int    WorkTF         = 60;
input double Lots           = 0.01;
input double LotGold        = 0.01;
input double LotSilver      = 0.01;
input int    Magic          = 220828;
input int    SlippagePoints = 30;
input int    MaxSpreadPoints= 80;
input int    MinGapPips     = 8;
input int    SweepBars      = 12;
input bool   AutoTrade      = true;
input bool   NoStop         = false;
input bool   PackAsOne      = false; // true = несколько дыр подряд это одна
input int    PanelX         = 8;
input int    PanelY         = 220;

#define Q "IMB_"
string   g_sym[];
string   g_naked[];
datetime g_bar[];
int      g_n = 0;
bool     g_auto;
bool     g_noStop;
bool     g_pack;
bool     g_mouse = false;
uint     g_clickMs = 0;
string   g_note = "старт";

int Tf()
  {
   if(WorkTF <= 5) return(PERIOD_M5);
   if(WorkTF <= 15) return(PERIOD_M15);
   if(WorkTF <= 30) return(PERIOD_M30);
   if(WorkTF <= 60) return(PERIOD_H1);
   if(WorkTF <= 240) return(PERIOD_H4);
   return(PERIOD_H1);
  }

double PipOf(string s)
  {
   double pt = MarketInfo(s, MODE_POINT);
   int d = (int)MarketInfo(s, MODE_DIGITS);
   if(d == 3 || d == 5) return(pt * 10.0);
   return(pt);
  }

string Naked(string s)
  {
   if(StringLen(BrokerSuffix) > 0 && StringFind(s, BrokerSuffix) == StringLen(s) - StringLen(BrokerSuffix))
      return(StringSubstr(s, 0, StringLen(s) - StringLen(BrokerSuffix)));
   return(s);
  }

string Resolve(string naked)
  {
   string a = naked + BrokerSuffix;
   SymbolSelect(a, true);
   SymbolSelect(naked, true);
   if(MarketInfo(a, MODE_BID) > 0) return(a);
   if(MarketInfo(naked, MODE_BID) > 0) return(naked);
   return("");
  }

void ParseWatch()
  {
   string p[];
   int n = StringSplit(WatchList, ',', p);
   ArrayResize(g_sym, n);
   ArrayResize(g_naked, n);
   ArrayResize(g_bar, n);
   g_n = 0;
   for(int i = 0; i < n; i++)
     {
      StringTrimLeft(p[i]);
      StringTrimRight(p[i]);
      if(StringLen(p[i]) < 3) continue;
      string s = Resolve(p[i]);
      if(StringLen(s) < 3) continue;
      g_naked[g_n] = Naked(s);
      g_sym[g_n] = s;
      g_bar[g_n] = 0;
      g_n++;
     }
  }

int OnInit()
  {
   g_auto = AutoTrade;
   g_noStop = NoStop;
   g_pack = PackAsOne;
   ParseWatch();
   EventSetTimer(2);
   ChartSetInteger(0, CHART_EVENT_MOUSE_MOVE, true);
   ChartSetInteger(0, CHART_FOREGROUND, false);
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   ObjectsDeleteAll(0, Q);
   Comment("");
  }

int Have(string s)
  {
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderMagicNumber() != Magic) continue;
      if(OrderSymbol() != s) continue;
      return(OrderTicket());
     }
   return(-1);
  }

double LotOf(string s)
  {
   string n = Naked(s);
   if(StringFind(n, "XAU") >= 0) return(LotGold);
   if(StringFind(n, "XAG") >= 0) return(LotSilver);
   return(Lots);
  }

double MinGap(string s)
  {
   double g = MinGapPips * PipOf(s);
   string n = Naked(s);
   if(StringFind(n, "XAU") >= 0 || StringFind(n, "XAG") >= 0) g = 25.0 * PipOf(s);
   return(g);
  }

bool Untouched(string s, int tf, int born, int dir, double edge)
  {
   for(int k = born - 1; k >= 1; k--)
     {
      if(dir > 0 && iHigh(s, tf, k) >= edge) return(false);
      if(dir < 0 && iLow(s, tf, k) <= edge) return(false);
     }
   return(true);
  }

bool NearestEdge(string s, int tf, int &dir, double &edge, double &zLo, double &zHi, int &fromBar)
  {
   dir = 0;
   edge = 0;
   zLo = 0;
   zHi = 0;
   fromBar = 0;
   double px = iClose(s, tf, 1);
   double gapMin = MinGap(s);
   int born[40];
   int side[40];
   double bot[40];
   double top[40];
   int n = 0;
   for(int b = 1; b <= 40 && n < 40; b++)
     {
      double hC = iHigh(s, tf, b);
      double lC = iLow(s, tf, b);
      double hA = iHigh(s, tf, b + 2);
      double lA = iLow(s, tf, b + 2);
      if(lC > hA && (lC - hA) >= gapMin)
        {
         if(px <= lC) continue;
         born[n] = b;
         side[n] = -1;
         bot[n] = hA;
         top[n] = lC;
         n++;
        }
      else if(hC < lA && (lA - hC) >= gapMin)
        {
         if(px >= hC) continue;
         born[n] = b;
         side[n] = 1;
         bot[n] = hC;
         top[n] = lA;
         n++;
        }
     }
   bool used[40];
   for(int i = 0; i < n; i++) used[i] = false;
   double best = 0;
   for(int i = 0; i < n; i++)
     {
      if(used[i]) continue;
      int d = side[i];
      double lo = bot[i];
      double hi = top[i];
      int newest = born[i];
      int oldest = born[i] + 2;
      used[i] = true;
      if(g_pack)
        {
         bool grew = true;
         while(grew)
           {
            grew = false;
            for(int j = 0; j < n; j++)
              {
               if(used[j] || side[j] != d) continue;
               bool touch = !(top[j] < lo || bot[j] > hi);
               bool next = (MathAbs(born[j] - newest) <= 2);
               if(!touch && !next) continue;
               used[j] = true;
               if(bot[j] < lo) lo = bot[j];
               if(top[j] > hi) hi = top[j];
               if(born[j] < newest) newest = born[j];
               if(born[j] + 2 > oldest) oldest = born[j] + 2;
               grew = true;
              }
           }
        }
      double near = (d > 0 ? lo : hi);
      if(d > 0 && px >= near) continue;
      if(d < 0 && px <= near) continue;
      if(!Untouched(s, tf, newest, d, near)) continue;
      double dist = MathAbs(near - px);
      if(best == 0 || dist < best)
        {
         best = dist;
         dir = d;
         edge = near;
         zLo = lo;
         zHi = hi;
         fromBar = oldest;
        }
     }
   return(dir != 0);
  }

bool Sweep(string s, int tf, int dir, double &stop)
  {
   int look = SweepBars;
   if(look < 5) look = 5;
   if(dir > 0)
     {
      double swing = iLow(s, tf, 3);
      for(int k = 4; k <= look; k++)
        {
         double v = iLow(s, tf, k);
         if(v < swing) swing = v;
        }
      double lo = iLow(s, tf, 1);
      double cl = iClose(s, tf, 1);
      if(!(lo < swing && cl > swing)) return(false);
      stop = lo - PipOf(s);
      return(true);
     }
   double swingH = iHigh(s, tf, 3);
   for(int k = 4; k <= look; k++)
     {
      double v = iHigh(s, tf, k);
      if(v > swingH) swingH = v;
     }
   double hi = iHigh(s, tf, 1);
   double cl = iClose(s, tf, 1);
   if(!(hi > swingH && cl < swingH)) return(false);
   stop = hi + PipOf(s);
   return(true);
  }

bool Here(string s)
  {
   return(Naked(s) == Naked(Symbol()));
  }

void Say(string s, string text)
  {
   if(Here(s)) g_note = Naked(Symbol()) + " " + text;
  }

void Try(int i)
  {
   string s = g_sym[i];
   int tf = Tf();
   datetime bar = iTime(s, tf, 0);
   if(bar == 0 || bar == g_bar[i]) return;
   g_bar[i] = bar;
   if(MarketInfo(s, MODE_SPREAD) > MaxSpreadPoints)
     {
      Say(s, "спред шире лимита");
      return;
     }
   if(Have(s) >= 0) return;
   int dir = 0;
   double edge = 0;
   double zLo = 0;
   double zHi = 0;
   int fromBar = 0;
   if(!NearestEdge(s, tf, dir, edge, zLo, zHi, fromBar))
     {
      Say(s, "открытой дыры нет");
      return;
     }
   double stop = 0;
   if(!Sweep(s, tf, dir, stop))
     {
      Say(s, dir > 0 ? "дыра сверху, жду снятие минимума" : "дыра снизу, жду снятие максимума");
      return;
     }
   double px = (dir > 0 ? MarketInfo(s, MODE_ASK) : MarketInfo(s, MODE_BID));
   int dg = (int)MarketInfo(s, MODE_DIGITS);
   edge = NormalizeDouble(edge, dg);
   stop = NormalizeDouble(stop, dg);
   double reward = MathAbs(edge - px);
   double risk = MathAbs(px - stop);
   if(reward < PipOf(s) * 2.0)
     {
      Say(s, "край ближе спреда");
      return;
     }
   if(!g_noStop && risk > reward)
     {
      Say(s, "прокол шире пути до края, пропуск");
      return;
     }
   if(dir > 0 && edge <= px) return;
   if(dir < 0 && edge >= px) return;
   if(!g_auto)
     {
      Say(s, "сигнал есть, авто выкл");
      return;
     }
   double sl = g_noStop ? 0 : stop;
   int cmd = (dir > 0 ? OP_BUY : OP_SELL);
   int ticket = OrderSend(s, cmd, LotOf(s), px, SlippagePoints, sl, edge, "SLOI imb", Magic, 0, clrNONE);
   if(ticket < 0)
      Say(s, "ошибка " + IntegerToString(GetLastError()));
   else
      Say(s, (dir > 0 ? "покупка к краю " : "продажа к краю ") + DoubleToStr(edge, dg));
  }

bool Hit(int cx, int cy, int x, int y, int w, int h)
  {
   return(cx >= x && cx < x + w && cy >= y && cy < y + h);
  }

void Btn(string id, int x, int y, int w, int h, string t, color bg)
  {
   string n = Q + id;
   if(ObjectFind(0, n) < 0) ObjectCreate(0, n, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetString(0, n, OBJPROP_TEXT, t);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, 2000);
   ObjectSetInteger(0, n, OBJPROP_BACK, false);
  }

void Paint()
  {
   int x = PanelX;
   int y = PanelY;
   Btn("auto", x, y, 110, 22, g_auto ? "АВТО ВКЛ" : "АВТО ВЫКЛ", g_auto ? C'1d6b45' : C'8a3a3a');
   Btn("stop", x + 116, y, 120, 22, g_noStop ? "БЕЗ СТОПА" : "СТОП ЕСТЬ", g_noStop ? C'8a3a3a' : C'1d6b45');
   Btn("pack", x + 242, y, 130, 22, g_pack ? "ПАЧКА" : "ОДНА ДЫРА", g_pack ? C'8a6a2a' : C'2a4a6a');
   Comment("SLOI IMB  ", (g_pack ? "пачка как одна. " : "обычная дыра. "), g_note);
  }

void Click(string id)
  {
   if(GetTickCount() - g_clickMs < 350) return;
   g_clickMs = GetTickCount();
   if(id == Q + "auto") g_auto = !g_auto;
   if(id == Q + "stop") g_noStop = !g_noStop;
   if(id == Q + "pack") g_pack = !g_pack;
   Paint();
  }

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
  {
   if(id == CHARTEVENT_OBJECT_CLICK)
     {
      Click(sparam);
      ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
      return;
     }
   if(id == CHARTEVENT_MOUSE_MOVE)
     {
      int st = (int)StringToInteger(sparam);
      bool down = ((st & 1) != 0);
      if(down && !g_mouse)
        {
         g_mouse = true;
         int cx = (int)lparam;
         int cy = (int)dparam;
         if(Hit(cx, cy, PanelX, PanelY, 110, 22)) Click(Q + "auto");
         else if(Hit(cx, cy, PanelX + 116, PanelY, 120, 22)) Click(Q + "stop");
         else if(Hit(cx, cy, PanelX + 242, PanelY, 130, 22)) Click(Q + "pack");
        }
      if(!down) g_mouse = false;
     }
  }

void WipeZone()
  {
   ObjectDelete(0, Q + "zone");
   ObjectDelete(0, Q + "edge");
   ObjectDelete(0, Q + "lab");
  }

void DrawZone()
  {
   string s = Symbol();
   int tf = Tf();
   ChartSetInteger(0, CHART_FOREGROUND, false);
   int dir = 0;
   double edge = 0;
   double zLo = 0;
   double zHi = 0;
   int fromBar = 0;
   int dg = (int)MarketInfo(s, MODE_DIGITS);
   if(iClose(s, tf, 1) <= 0 || !NearestEdge(s, tf, dir, edge, zLo, zHi, fromBar))
     {
      WipeZone();
      g_note = Naked(s) + " открытой дыры на этом графике нет";
      return;
     }
   datetime t1 = iTime(s, tf, fromBar);
   int step = PeriodSeconds(tf);
   if(step <= 0) step = 3600;
   datetime t2 = iTime(s, tf, 0) + step * 6;
   if(t1 <= 0) t1 = iTime(s, tf, 0);
   color c = (dir > 0 ? clrTomato : clrDeepSkyBlue);
   string n = Q + "zone";
   if(ObjectFind(0, n) < 0)
     {
      if(!ObjectCreate(0, n, OBJ_RECTANGLE, 0, t1, zHi, t2, zLo))
         ObjectCreate(n, OBJ_RECTANGLE, 0, t1, zHi, t2, zLo);
     }
   ObjectSet(n, OBJPROP_TIME1, t1);
   ObjectSet(n, OBJPROP_PRICE1, zHi);
   ObjectSet(n, OBJPROP_TIME2, t2);
   ObjectSet(n, OBJPROP_PRICE2, zLo);
   ObjectSet(n, OBJPROP_COLOR, c);
   ObjectSet(n, OBJPROP_STYLE, STYLE_SOLID);
   ObjectSet(n, OBJPROP_WIDTH, 3);
   ObjectSet(n, OBJPROP_BACK, false);
   ObjectSetInteger(0, n, OBJPROP_FILL, false);
   ObjectSet(n, OBJPROP_SELECTABLE, false);
   string e = Q + "edge";
   if(ObjectFind(0, e) < 0)
     {
      if(!ObjectCreate(0, e, OBJ_HLINE, 0, 0, edge))
         ObjectCreate(e, OBJ_HLINE, 0, 0, edge);
     }
   ObjectSet(e, OBJPROP_PRICE1, edge);
   ObjectSet(e, OBJPROP_COLOR, clrGold);
   ObjectSet(e, OBJPROP_WIDTH, 3);
   ObjectSet(e, OBJPROP_STYLE, STYLE_SOLID);
   ObjectSet(e, OBJPROP_BACK, false);
   string lab = Q + "lab";
   double mid = (zLo + zHi) * 0.5;
   if(ObjectFind(0, lab) < 0)
     {
      if(!ObjectCreate(0, lab, OBJ_TEXT, 0, t1, mid))
         ObjectCreate(lab, OBJ_TEXT, 0, t1, mid);
     }
   ObjectSet(lab, OBJPROP_TIME1, t1);
   ObjectSet(lab, OBJPROP_PRICE1, mid);
   ObjectSetText(lab, "ИМБ  край " + DoubleToStr(edge, dg), 12, "Arial", clrGold);
   ObjectSet(lab, OBJPROP_BACK, false);
   ObjectSetInteger(0, lab, OBJPROP_ANCHOR, ANCHOR_LEFT);
   g_note = Naked(s) + " дыра " + DoubleToStr(zLo, dg) + " – " + DoubleToStr(zHi, dg);
   ChartRedraw(0);
  }

void OnTimer()
  {
   for(int i = 0; i < g_n; i++) Try(i);
   DrawZone();
   Paint();
  }
