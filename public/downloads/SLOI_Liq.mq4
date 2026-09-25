//+------------------------------------------------------------------+
//| SLOI_Liq.mq4                                                     |
//| От ликвидности к ликвидности. Стопа нет.                         |
//| Если хвост выбивает — зеркало в обратную сторону,                |
//| тейк на следующей ликвидности. Магия 220829.                     |
//+------------------------------------------------------------------+
#property copyright "SLOI"
#property version   "1.03"
#property strict
#property description "SLOI Liq 1.03: съём — это хвост за уровень и закрытие обратно. Цвет свечи не важен"

input string WatchList       = "EURUSD,GBPUSD,USDJPY,USDCHF,AUDUSD,USDCAD,NZDUSD,EURGBP,EURJPY,GBPJPY,EURAUD,GBPCAD,GBPAUD,XAUUSD,XAGUSD";
input string BrokerSuffix    = ".cs";
input int    WorkTF          = 60;
input double Lots            = 0.01;
input double LotGold         = 0.01;
input double LotSilver       = 0.01;
input int    Magic           = 220829;
input int    SlippagePoints  = 30;
input int    MaxSpreadPoints = 80;
input int    Wing            = 3;
input bool   AutoTrade       = true;
input int    PanelX          = 8;
input int    PanelY          = 250;

#define Q "LIQ_"
string   g_sym[];
string   g_naked[];
datetime g_bar[];
int      g_n = 0;
bool     g_auto;
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

string Gv(string kind, string s)
  {
   return(kind + Naked(s));
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
   ParseWatch();
   EventSetTimer(2);
   ChartSetInteger(0, CHART_EVENT_MOUSE_MOVE, true);
   ChartSetInteger(0, CHART_FOREGROUND, false);
   Draw();
   Paint();
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   ObjectsDeleteAll(0, Q);
   Comment("");
  }

double LotOf(string s)
  {
   string n = Naked(s);
   if(StringFind(n, "XAU") >= 0) return(LotGold);
   if(StringFind(n, "XAG") >= 0) return(LotSilver);
   return(Lots);
  }

double MinMove(string s)
  {
   double m = 2.0 * PipOf(s);
   string n = Naked(s);
   if(StringFind(n, "XAU") >= 0 || StringFind(n, "XAG") >= 0) m = 15.0 * PipOf(s);
   int stop = (int)MarketInfo(s, MODE_STOPLEVEL);
   double floor = stop * MarketInfo(s, MODE_POINT);
   if(floor > m) m = floor;
   return(m);
  }

bool IsSwingHigh(string s, int tf, int p)
  {
   double v = iHigh(s, tf, p);
   if(v <= 0) return(false);
   for(int j = 1; j <= Wing; j++)
     {
      if(iHigh(s, tf, p - j) >= v) return(false);
      if(iHigh(s, tf, p + j) > v) return(false);
     }
   return(true);
  }

bool IsSwingLow(string s, int tf, int p)
  {
   double v = iLow(s, tf, p);
   if(v <= 0) return(false);
   for(int j = 1; j <= Wing; j++)
     {
      if(iLow(s, tf, p - j) <= v) return(false);
      if(iLow(s, tf, p + j) < v) return(false);
     }
   return(true);
  }

double NearestHigh(string s, int tf, double px)
  {
   double best = 0;
   for(int p = Wing + 1; p <= 60; p++)
     {
      if(!IsSwingHigh(s, tf, p)) continue;
      double v = iHigh(s, tf, p);
      if(v <= px) continue;
      if(best == 0 || v < best) best = v;
     }
   return(best);
  }

double NearestLow(string s, int tf, double px)
  {
   double best = 0;
   for(int p = Wing + 1; p <= 60; p++)
     {
      if(!IsSwingLow(s, tf, p)) continue;
      double v = iLow(s, tf, p);
      if(v >= px) continue;
      if(best == 0 || v > best) best = v;
     }
   return(best);
  }

int HaveDir(string s, int dir)
  {
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderMagicNumber() != Magic || OrderSymbol() != s) continue;
      if(dir == 0) return(OrderTicket());
      if(dir > 0 && OrderType() == OP_BUY) return(OrderTicket());
      if(dir < 0 && OrderType() == OP_SELL) return(OrderTicket());
     }
   return(-1);
  }

bool Here(string s)
  {
   return(Naked(s) == Naked(Symbol()));
  }

void Say(string s, string text)
  {
   if(Here(s)) g_note = Naked(Symbol()) + " " + text;
  }

bool Send(string s, int dir, double tp, string comment)
  {
   int dg = (int)MarketInfo(s, MODE_DIGITS);
   tp = NormalizeDouble(tp, dg);
   double px = (dir > 0 ? MarketInfo(s, MODE_ASK) : MarketInfo(s, MODE_BID));
   if(MathAbs(tp - px) < MinMove(s)) return(false);
   int cmd = (dir > 0 ? OP_BUY : OP_SELL);
   int ticket = OrderSend(s, cmd, LotOf(s), px, SlippagePoints, 0, tp, comment, Magic, 0, clrNONE);
   return(ticket >= 0);
  }

void OpenFirst(int i)
  {
   string s = g_sym[i];
   int tf = Tf();
   datetime bar = iTime(s, tf, 0);
   if(bar == 0 || bar == g_bar[i]) return;
   g_bar[i] = bar;
   if(HaveDir(s, 0) >= 0) return;
   GlobalVariableDel(Gv("LIQINV", s));
   GlobalVariableDel(Gv("LIQDIR", s));
   if(MarketInfo(s, MODE_SPREAD) > MaxSpreadPoints)
     {
      Say(s, "спред шире лимита");
      return;
     }
   double prev = iClose(s, tf, 2);
   double cl = iClose(s, tf, 1);
   double hi = iHigh(s, tf, 1);
   double lo = iLow(s, tf, 1);
   double sweptLo = 0;
   double sweptHi = 0;
   for(int p = Wing + 1; p <= 60; p++)
     {
      if(IsSwingLow(s, tf, p))
        {
         double v = iLow(s, tf, p);
         if(lo < v && cl > v && v < prev && (sweptLo == 0 || v > sweptLo)) sweptLo = v;
        }
      if(IsSwingHigh(s, tf, p))
        {
         double v = iHigh(s, tf, p);
         if(hi > v && cl < v && v > prev && (sweptHi == 0 || v < sweptHi)) sweptHi = v;
        }
     }
   int dir = 0;
   double target = 0;
   double invalid = 0;
   if(sweptLo > 0 && sweptHi == 0)
     {
      dir = 1;
      target = NearestHigh(s, tf, cl);
      invalid = lo;
     }
   else if(sweptHi > 0 && sweptLo == 0)
     {
      dir = -1;
      target = NearestLow(s, tf, cl);
      invalid = hi;
     }
   else
     {
      Say(s, "снятия ликвидности нет");
      return;
     }
   if(target <= 0 || MathAbs(target - cl) < MinMove(s))
     {
      Say(s, "ближайшая ликвидность слишком близко");
      return;
     }
   if(!g_auto)
     {
      Say(s, dir > 0 ? "покупка к ликвидности, авто выкл" : "продажа к ликвидности, авто выкл");
      return;
     }
   if(!Send(s, dir, target, "sloi liq"))
     {
      Say(s, "ордер не встал");
      return;
     }
   GlobalVariableSet(Gv("LIQINV", s), invalid);
   GlobalVariableSet(Gv("LIQDIR", s), dir);
   Say(s, dir > 0 ? "покупка к ликвидности" : "продажа к ликвидности");
  }

void OpenMirror(string s)
  {
   if(!GlobalVariableCheck(Gv("LIQINV", s))) return;
   if(HaveDir(s, 0) < 0) return;
   int dir = (int)GlobalVariableGet(Gv("LIQDIR", s));
   if(dir == 0) return;
   int opp = -dir;
   if(HaveDir(s, opp) >= 0) return;
   if(HaveDir(s, dir) < 0) return;
   double inv = GlobalVariableGet(Gv("LIQINV", s));
   double bid = MarketInfo(s, MODE_BID);
   double ask = MarketInfo(s, MODE_ASK);
   bool hit = (dir > 0 && bid <= inv) || (dir < 0 && ask >= inv);
   if(!hit) return;
   int tf = Tf();
   double target = (opp > 0 ? NearestHigh(s, tf, ask) : NearestLow(s, tf, bid));
   if(target <= 0)
     {
      Say(s, "хвост выбит, следующей ликвидности нет");
      return;
     }
   if(!g_auto) return;
   if(!Send(s, opp, target, "sloi liq m"))
     {
      Say(s, "зеркало не встало");
      return;
     }
   Say(s, opp > 0 ? "зеркало покупка" : "зеркало продажа");
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

void Line(string id, double price, color c, string text)
  {
   string n = Q + id;
   string lab = Q + id + "t";
   if(price <= 0)
     {
      ObjectDelete(0, n);
      ObjectDelete(0, lab);
      return;
     }
   if(ObjectFind(0, n) < 0)
     {
      if(!ObjectCreate(0, n, OBJ_HLINE, 0, 0, price))
         ObjectCreate(n, OBJ_HLINE, 0, 0, price);
     }
   ObjectSet(n, OBJPROP_PRICE1, price);
   ObjectSet(n, OBJPROP_COLOR, c);
   ObjectSet(n, OBJPROP_WIDTH, 2);
   ObjectSet(n, OBJPROP_BACK, false);
   datetime t = iTime(Symbol(), Tf(), 6);
   if(ObjectFind(0, lab) < 0)
     {
      if(!ObjectCreate(0, lab, OBJ_TEXT, 0, t, price))
         ObjectCreate(lab, OBJ_TEXT, 0, t, price);
     }
   ObjectSet(lab, OBJPROP_TIME1, t);
   ObjectSet(lab, OBJPROP_PRICE1, price);
   ObjectSetText(lab, text, 11, "Arial", c);
   ObjectSet(lab, OBJPROP_BACK, false);
  }

void Draw()
  {
   string s = Symbol();
   int tf = Tf();
   int dg = (int)MarketInfo(s, MODE_DIGITS);
   double px = iClose(s, tf, 1);
   double hi = NearestHigh(s, tf, px);
   double lo = NearestLow(s, tf, px);
   double bh = iHigh(s, tf, 1);
   double bl = iLow(s, tf, 1);
   double bc = iClose(s, tf, 1);
   string why = "съёма не было";
   if(hi > 0 && bh > hi && bc < hi) why = "максимум снят и закрылись обратно";
   else if(hi > 0 && bh > hi) why = "максимум пробили и закрылись выше";
   else if(lo > 0 && bl < lo && bc > lo) why = "минимум снят и закрылись обратно";
   else if(lo > 0 && bl < lo) why = "минимум пробили и закрылись ниже";
   Line("up", hi, clrGold, " ликвидность сверху");
   Line("dn", lo, clrDeepSkyBlue, " ликвидность снизу");
   double tp = 0;
   double mtp = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderMagicNumber() != Magic || OrderSymbol() != s) continue;
      if(StringFind(OrderComment(), "liq m") >= 0) mtp = OrderTakeProfit();
      else tp = OrderTakeProfit();
     }
   Line("tp", tp, clrLime, " тейк");
   Line("mtp", mtp, clrOrange, " зеркало");
   double inv = 0;
   if(GlobalVariableCheck(Gv("LIQINV", s)) && HaveDir(s, 0) >= 0)
      inv = GlobalVariableGet(Gv("LIQINV", s));
   Line("inv", inv, clrTomato, " хвост");
   g_note = Naked(s) + " сверху " + (hi > 0 ? DoubleToStr(hi, dg) : "нет")
          + ", снизу " + (lo > 0 ? DoubleToStr(lo, dg) : "нет")
          + ". " + why;
   ChartSetInteger(0, CHART_FOREGROUND, false);
   ChartRedraw(0);
  }

void Paint()
  {
   Btn("auto", PanelX, PanelY, 120, 22, g_auto ? "АВТО ВКЛ" : "АВТО ВЫКЛ", g_auto ? C'1d6b45' : C'8a3a3a');
   Comment("SLOI LIQ  ", g_note);
  }

void Click(string id)
  {
   if(GetTickCount() - g_clickMs < 350) return;
   g_clickMs = GetTickCount();
   if(id == Q + "auto") g_auto = !g_auto;
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
         if(lparam >= PanelX && lparam < PanelX + 120 && dparam >= PanelY && dparam < PanelY + 22)
            Click(Q + "auto");
        }
      if(!down) g_mouse = false;
     }
  }

void OnTimer()
  {
   for(int i = 0; i < g_n; i++)
     {
      OpenFirst(i);
      OpenMirror(g_sym[i]);
     }
   Draw();
   Paint();
  }
