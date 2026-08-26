//+------------------------------------------------------------------+
//|                                              SLOI_Desk.mq4    |
//|  Берёт ТОЛЬКО команды сайта /api/signals.txt. Сам рынок не считает.
//|  Спред = Ask-Bid каждого символа в терминале.                    |
//+------------------------------------------------------------------+
#property copyright "SLOI"
#property link      ""
#property version   "4.35"
#property strict
#property description "На графике: VWAP, профиль, футпринт бара, infusion/splash, Bid/Ask."

input string  SignalsUrl      = "https://sloi-kohl.vercel.app/api/signals.txt";
input string  WatchList       = "EURUSD,GBPUSD,USDJPY,USDCHF,AUDUSD,USDCAD,NZDUSD,EURGBP,EURJPY,GBPJPY,AUDJPY,CADJPY,NZDJPY,EURCHF,EURAUD,GBPAUD,XAUUSD,XAGUSD,XTIUSD,XBRUSD,XNGUSD,ETHUSD,LTCUSD,BCHUSD,BTCUSD,XRPUSD,TONUSD";
input string  BrokerSuffix    = ".cs";
input int     WorkTF          = 60;
input bool    AutoTrade       = true;
input double  Lots            = 0.03;
input double  LotGold         = 0.01;
input double  LotSilver       = 0.01;
input double  LotGas          = 0.10;
input double  LotOil          = 0.03;
input double  LotCrypto       = 0.01;
input bool    RiskOn          = false;
input double  RiskPercent     = 1.0;
input bool    Martingale      = false;
input double  MartMult        = 2.0;
input int     MartMax         = 2;
input int     Magic           = 220826;
input int     SlippagePoints  = 20;
input int     MaxSpreadPoints = 80;
input double  MaxSkewPct      = 0.12;
input double  MinCover        = 1.0;
input double  MinNetRR        = 0.8;
input int     OneTradeOnly    = 1;
input int     CoolMinutes     = 0;
input bool    FixForeign      = true;
input string  ForeignTag      = "WS";
input bool    AlertsOn        = true;
input int     PanelX          = 8;
input int     PanelY          = 18;

#define P "SLOI_"
#define MAXSYM 32

string   g_sym[];
int      g_n;
string   g_lastKey[MAXSYM];
datetime g_lastBar[MAXSYM];
string   g_prevV[MAXSYM];
int      g_lim[MAXSYM];

string g_watch;
string g_suffix;
string g_url;
int    g_tf;
bool   g_auto;
double g_lots;
double g_lotXau;
double g_lotXag;
double g_lotGas;
double g_lotOil;
double g_lotCry;
bool   g_riskOn;
double g_riskPct;
bool   g_mart;
double g_martMult;
int    g_martMax;
int    g_maxSp;
double g_skew;
bool   g_alerts;
bool   g_seeded = false;
bool   g_ready = false;
bool   g_min = false;
string g_feed = "";
datetime g_feedAt = 0;
string g_feedNote = "нет ленты";

color C_BG   = C'16,14,12';
color C_BOX  = C'32,28,24';
color C_LINE = C'72,64,52';
color C_GOLD = C'212,184,140';
color C_DIM  = C'150,140,126';
color C_FG   = C'236,228,214';
color C_BUY  = C'110,158,134';
color C_SEL  = C'181,122,122';
color C_WAIT = C'196,168,110';
color C_OFF  = C'90,84,76';

int OnInit()
  {
   g_watch  = WatchList;
   g_suffix = BrokerSuffix;
   g_url    = SignalsUrl;
   g_tf     = WorkTF;
   g_auto   = AutoTrade;
   g_lots   = Lots;
   g_lotXau = LotGold;
   g_lotXag = LotSilver;
   g_lotGas = LotGas;
   g_lotOil = LotOil;
   g_lotCry = LotCrypto;
   g_riskOn = RiskOn;
   g_riskPct = RiskPercent;
   g_mart = Martingale;
   g_martMult = MartMult;
   g_martMax = MartMax;
   g_maxSp  = MaxSpreadPoints;
   g_skew   = MaxSkewPct;
   g_alerts = AlertsOn;
   Wipe();
   ParseWatch();
   EventSetTimer(2);
   ChartSetInteger(0, CHART_FOREGROUND, false);
   g_ready = true;
   g_seeded = false;
   DrawDesk();
   Print("SLOI 4.35: чужие WS подтягиваю под стол или закрываю, если WAIT.");
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   Wipe();
   Comment("");
  }

void OnTick()   { if(g_ready) DrawDesk(); }
void OnTimer()  { if(g_ready) DrawDesk(); }

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
  {
   if(id != CHARTEVENT_OBJECT_CLICK) return;
   ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
   if(sparam == P+"b_min")
     {
      g_min = !g_min;
      Wipe();
      g_seeded = false;
      DrawDesk();
      return;
     }
   if(sparam == P+"b_auto")
     {
      g_auto = !g_auto;
      DrawDesk();
      return;
     }
   if(sparam == P+"b_alrt")
     {
      g_alerts = !g_alerts;
      DrawDesk();
      return;
     }
   if(sparam == P+"b_risk")
     {
      g_riskOn = !g_riskOn;
      g_seeded = false;
      DrawDesk();
      return;
     }
   if(sparam == P+"b_mart")
     {
      g_mart = !g_mart;
      DrawDesk();
      return;
     }
   if(sparam == P+"b_ok")
     {
      ApplyEdits();
      g_seeded = false;
      DrawDesk();
      return;
     }
   if(sparam == P+"b_ws")
     {
      CloseForeignAll();
      DrawDesk();
      return;
     }
   if(sparam == P+"b_buy")  { ManualTrade(1);  DrawDesk(); return; }
   if(sparam == P+"b_sell") { ManualTrade(-1); DrawDesk(); return; }
   if(sparam == P+"b_cp")   { CloseMine(false); DrawDesk(); return; }
   if(sparam == P+"b_ca")   { CloseMine(true);  DrawDesk(); return; }
   if(StringFind(sparam, P+"g") == 0)
     {
      int idx = (int)StringToInteger(StringSubstr(sparam, StringLen(P+"g")));
      if(idx >= 0 && idx < g_n) OpenPair(g_sym[idx]);
     }
  }

void ApplyEdits()
  {
   string lots = ObjectGetString(0, P+"e_lots", OBJPROP_TEXT);
   string sp   = ObjectGetString(0, P+"e_spread", OBJPROP_TEXT);
   string tf   = ObjectGetString(0, P+"e_tf", OBJPROP_TEXT);
   string suf  = ObjectGetString(0, P+"e_suf", OBJPROP_TEXT);
   string wl   = ObjectGetString(0, P+"e_list", OBJPROP_TEXT);
   string url  = ObjectGetString(0, P+"e_url", OBJPROP_TEXT);
   double l = StringToDouble(lots);
   int    s = (int)StringToInteger(sp);
   int    t = (int)StringToInteger(tf);
   if(g_riskOn) { if(l > 0 && l <= 10) g_riskPct = l; }
   else if(l > 0) g_lots = l;
   double fx = StringToDouble(ObjectGetString(0, P+"e_fx", OBJPROP_TEXT));
   if(fx > 0) g_lots = fx;
   double xa = StringToDouble(ObjectGetString(0, P+"e_xau", OBJPROP_TEXT));
   double xg = StringToDouble(ObjectGetString(0, P+"e_xag", OBJPROP_TEXT));
   double gs = StringToDouble(ObjectGetString(0, P+"e_gas", OBJPROP_TEXT));
   double ol = StringToDouble(ObjectGetString(0, P+"e_oil", OBJPROP_TEXT));
   double cr = StringToDouble(ObjectGetString(0, P+"e_cry", OBJPROP_TEXT));
   if(xa > 0) g_lotXau = xa;
   if(xg > 0) g_lotXag = xg;
   if(gs > 0) g_lotGas = gs;
   if(ol > 0) g_lotOil = ol;
   if(cr > 0) g_lotCry = cr;
   if(s > 0) g_maxSp = s;
   if(t == 15 || t == 30 || t == 60 || t == 240 || t == 1440) g_tf = t;
   g_suffix = suf;
   if(StringLen(wl) > 2) g_watch = wl;
   if(StringLen(url) > 12) g_url = url;
   g_feed = "";
   g_feedAt = 0;
   ParseWatch();
  }

int PeriodOf(int mins)
  {
   if(mins <= 1) return(PERIOD_M1);
   if(mins <= 5) return(PERIOD_M5);
   if(mins <= 15) return(PERIOD_M15);
   if(mins <= 30) return(PERIOD_M30);
   if(mins <= 60) return(PERIOD_H1);
   if(mins <= 240) return(PERIOD_H4);
   return(PERIOD_D1);
  }

void OpenPair(string s)
  {
   SymbolSelect(s, true);
   ChartSetSymbolPeriod(0, s, PeriodOf(g_tf));
  }

void Box(string id, datetime t1, double p1, datetime t2, double p2, color clr)
  {
   string n = P + id;
   if(ObjectFind(0, n) < 0)
     {
      if(!ObjectCreate(0, n, OBJ_RECTANGLE, 0, t1, p1, t2, p2))
         ObjectCreate(n, OBJ_RECTANGLE, 0, t1, p1, t2, p2);
     }
   ObjectSet(n, OBJPROP_TIME1, t1);
   ObjectSet(n, OBJPROP_PRICE1, p1);
   ObjectSet(n, OBJPROP_TIME2, t2);
   ObjectSet(n, OBJPROP_PRICE2, p2);
   ObjectSet(n, OBJPROP_COLOR, clr);
   ObjectSet(n, OBJPROP_BACK, true);
   ObjectSet(n, OBJPROP_WIDTH, 1);
   ObjectSet(n, OBJPROP_SELECTABLE, false);
  }

void Hln(string id, double px, color clr)
  {
   if(px <= 0) return;
   string n = P + id;
   if(ObjectFind(0, n) < 0)
     {
      if(!ObjectCreate(0, n, OBJ_HLINE, 0, 0, px))
         ObjectCreate(n, OBJ_HLINE, 0, 0, px);
     }
   ObjectSet(n, OBJPROP_PRICE1, px);
   ObjectSet(n, OBJPROP_COLOR, clr);
   ObjectSet(n, OBJPROP_STYLE, STYLE_DASH);
   ObjectSet(n, OBJPROP_WIDTH, 1);
   ObjectSet(n, OBJPROP_SELECTABLE, false);
  }

void Txt(string id, int x, int y, string t, color clr)
  {
   string n = P + id;
   if(ObjectFind(0, n) < 0) ObjectCreate(n, OBJ_LABEL, 0, 0, 0);
   ObjectSet(n, OBJPROP_CORNER, 0);
   ObjectSet(n, OBJPROP_XDISTANCE, x);
   ObjectSet(n, OBJPROP_YDISTANCE, y);
   ObjectSet(n, OBJPROP_COLOR, clr);
   ObjectSetText(n, t, 9, "Arial", clr);
  }

void DrawTape()
  {
   string s = Symbol();
   int tf = Period();
   int n = 48;
   double pv = 0, vv = 0, varS = 0;
   double vols[];
   ArrayResize(vols, n);
   int i;
   for(i = 0; i < n; i++)
     {
      double hi = iHigh(s, tf, i);
      double lo = iLow(s, tf, i);
      double cl = iClose(s, tf, i);
      double v = (double)iVolume(s, tf, i);
      if(v <= 0) v = 1;
      double tp = (hi + lo + cl) / 3.0;
      pv += tp * v;
      vv += v;
      vols[i] = v;
     }
   double vwap = (vv > 0 ? pv / vv : iClose(s, tf, 0));
   for(i = 0; i < n; i++)
     {
      double hi = iHigh(s, tf, i);
      double lo = iLow(s, tf, i);
      double cl = iClose(s, tf, i);
      double tp = (hi + lo + cl) / 3.0;
      varS += vols[i] * (tp - vwap) * (tp - vwap);
     }
   double sd = MathSqrt(varS / MathMax(vv, 1));
   Hln("vwap", vwap, C_GOLD);
   Hln("vw_up", vwap + sd, C_DIM);
   Hln("vw_dn", vwap - sd, C_DIM);

   double avg = vv / n;
   double lastV = vols[0];
   double span = iHigh(s, tf, 0) - iLow(s, tf, 0);
   double avgSpan = 0;
   for(i = 0; i < n; i++) avgSpan += (iHigh(s, tf, i) - iLow(s, tf, i));
   avgSpan /= n;
   if(lastV > avg * 2.0 && span < avgSpan * 0.7)
     {
      Box("inf", iTime(s, tf, 0), iHigh(s, tf, 0), iTime(s, tf, 0) + tf * 60, iLow(s, tf, 0), C_GOLD);
      Txt("inf_t", 12, 36, "INFUSION  лимит впитал объём", C_GOLD);
     }
   if(lastV > avg * 2.2 && span > avgSpan * 1.4)
     {
      Txt("spl_t", 12, 52, "SPLASH  агрессивный вынос", C_SEL);
     }

   double hiR = iHigh(s, tf, iHighest(s, tf, MODE_HIGH, n, 0));
   double loR = iLow(s, tf, iLowest(s, tf, MODE_LOW, n, 0));
   int bins = 16;
   double step = (hiR - loR) / MathMax(bins, 1);
   double maxB = 1;
   double acc[];
   ArrayResize(acc, bins);
   ArrayInitialize(acc, 0);
   for(i = 0; i < n; i++)
     {
      int b = (int)MathFloor((iClose(s, tf, i) - loR) / MathMax(step, 0.0000001));
      if(b < 0) b = 0;
      if(b >= bins) b = bins - 1;
      acc[b] += vols[i];
      if(acc[b] > maxB) maxB = acc[b];
     }
   datetime t0 = iTime(s, tf, 0);
   datetime t1 = t0 + tf * 60 * 6;
   for(i = 0; i < bins; i++)
     {
      if(acc[i] <= 0) continue;
      double p1 = loR + i * step;
      double p2 = p1 + step;
      datetime tw = t0 + (datetime)(tf * 60 * 6.0 * acc[i] / maxB);
      Box("pr"+IntegerToString(i), t0, p1, tw, p2, C_DIM);
     }

   for(i = 0; i < 12; i++)
     {
      double hi = iHigh(s, tf, i);
      double lo = iLow(s, tf, i);
      double cl = iClose(s, tf, i);
      double mid = (hi + lo) * 0.5;
      datetime t = iTime(s, tf, i);
      datetime te = t + tf * 60 / 3;
      color buyC = C_BUY;
      color selC = C_SEL;
      if(cl >= mid) Box("fb"+IntegerToString(i), t, mid, te, hi, buyC);
      else Box("fs"+IntegerToString(i), t, lo, te, mid, selC);
     }

   Txt("ab", 12, 18,
       "Bid "+DoubleToStr(Bid, Digits)+"  Ask "+DoubleToStr(Ask, Digits)+"  spr "+IntegerToString((int)MarketInfo(s, MODE_SPREAD))+
       "  VWAP "+DoubleToStr(vwap, Digits),
       C_GOLD);
  }

void DrawSmcOnChart()
  {
   string s = Symbol();
   int idx = -1;
   int i;
   for(i = 0; i < g_n; i++) if(g_sym[i] == s) { idx = i; break; }
   if(idx < 0) return;

   string bias, verdict, why;
   int dir = 0, spPts = 0;
   double entry = 0, stop = 0, target = 0;
   Scan(idx, bias, verdict, why, dir, entry, stop, target, spPts);

   Hln("lv_en", entry, C_GOLD);
   Hln("lv_sl", stop, C_SEL);
   Hln("lv_tp", target, C_BUY);

   int tf = PeriodOf(g_tf);
   int drawn = 0;
   datetime tNow = iTime(s, tf, 0);
   for(i = 3; i < 70 && drawn < 3; i++)
     {
      double hi = iHigh(s, tf, i);
      double lo = iLow(s, tf, i);
      double hi2 = iHigh(s, tf, i - 2);
      double lo2 = iLow(s, tf, i - 2);
      datetime t1 = iTime(s, tf, i);
      if(lo2 > hi)
        {
         Box("fvg"+IntegerToString(drawn), t1, hi, tNow, lo2, C_BUY);
         drawn++;
        }
      else if(hi2 < lo)
        {
         Box("fvg"+IntegerToString(drawn), t1, lo, tNow, hi2, C_SEL);
         drawn++;
        }
     }

   int sh = iHighest(s, tf, MODE_HIGH, 48, 1);
   int sl = iLowest(s, tf, MODE_LOW, 48, 1);
   if(sh > 0) Hln("sw_h", iHigh(s, tf, sh), C_SEL);
   if(sl > 0) Hln("sw_l", iLow(s, tf, sl), C_BUY);
   DrawTape();
  }

void ParseWatch()
  {
   ArrayResize(g_sym, 0);
   g_n = 0;
   string raw = g_watch;
   StringReplace(raw, " ", "");
   string parts[];
   int n = StringSplit(raw, ',', parts);
   for(int i = 0; i < n; i++)
     {
      string s = parts[i];
      if(StringLen(s) < 3) continue;
      if(StringLen(g_suffix) > 0 && StringFind(s, g_suffix) < 0)
        {
         string a = s + g_suffix;
         string b = (StringFind(g_suffix, ".") == 0 ? a : s + "." + g_suffix);
         SymbolSelect(s, true);
         SymbolSelect(a, true);
         SymbolSelect(b, true);
         if(BidOf(s) > 0 || AskOf(s) > 0) { }
         else if(BidOf(b) > 0 || AskOf(b) > 0) s = b;
         else if(BidOf(a) > 0 || AskOf(a) > 0) s = a;
        }
      if(StringLen(s) == 0) continue;
      SymbolSelect(s, true);
      if(g_n >= MAXSYM) break;
      ArrayResize(g_sym, g_n + 1);
      g_sym[g_n] = s;
      g_lastKey[g_n] = "";
      g_prevV[g_n] = "";
      g_lastBar[g_n] = 0;
      g_n++;
     }
   if(g_n == 0)
     {
      ArrayResize(g_sym, 1);
      g_sym[0] = Symbol();
      g_n = 1;
     }
  }

int    DigitsOf(string s) { return((int)MarketInfo(s, MODE_DIGITS)); }
double PointOf(string s)  { return(MarketInfo(s, MODE_POINT)); }
double BidOf(string s)    { return(MarketInfo(s, MODE_BID)); }
double AskOf(string s)    { return(MarketInfo(s, MODE_ASK)); }
double SpreadPr(string s) { return(AskOf(s) - BidOf(s)); }
int    SpreadPt(string s)
  {
   double pt = PointOf(s);
   if(pt <= 0) return(0);
   return((int)MathRound(SpreadPr(s) / pt));
  }
string Px(string s, double v) { return(DoubleToStr(v, DigitsOf(s))); }

int SlipFor(string s)
  {
   int sp = SpreadPt(s);
   return(MathMax(SlippagePoints, sp + 20));
  }

double StopAway(string s, int dir, double px, double sl)
  {
   double pt = PointOf(s);
   double lvl = MarketInfo(s, MODE_STOPLEVEL) * pt;
   double spr = SpreadPr(s);
   double need = MathMax(lvl, spr * 1.15);
   if(need <= 0) return(sl);
   if(dir > 0 && (sl <= 0 || px - sl < need)) return(NormalizeDouble(px - need, DigitsOf(s)));
   if(dir < 0 && (sl <= 0 || sl - px < need)) return(NormalizeDouble(px + need, DigitsOf(s)));
   return(NormalizeDouble(sl, DigitsOf(s)));
  }

double TakeAway(string s, int dir, double px, double tp)
  {
   double pt = PointOf(s);
   double lvl = MarketInfo(s, MODE_STOPLEVEL) * pt;
   double spr = SpreadPr(s);
   double need = MathMax(lvl, spr) * 1.2;
   if(need <= 0) return(tp);
   if(dir > 0 && (tp <= 0 || tp - px < need)) return(NormalizeDouble(px + need * 2.0, DigitsOf(s)));
   if(dir < 0 && (tp <= 0 || px - tp < need)) return(NormalizeDouble(px - need * 2.0, DigitsOf(s)));
   return(NormalizeDouble(tp, DigitsOf(s)));
  }

int SendOrder(string s, int cmd, double lots, double px, double sl, double tp, string cmt, color clr)
  {
   int dir = (cmd == OP_BUY || cmd == OP_BUYLIMIT || cmd == OP_BUYSTOP) ? 1 : -1;
   sl = StopAway(s, dir, px, sl);
   tp = TakeAway(s, dir, px, tp);
   int slip = SlipFor(s);
   int ticket = OrderSend(s, cmd, lots, px, slip, sl, tp, cmt, Magic, 0, clr);
   if(ticket < 0)
     {
      int err = GetLastError();
      if((cmd == OP_BUYLIMIT || cmd == OP_SELLLIMIT) && (err == 130 || err == 148 || err == 4110))
        {
         cmd = (dir > 0 ? OP_BUY : OP_SELL);
         px = dir > 0 ? AskOf(s) : BidOf(s);
         ticket = OrderSend(s, cmd, lots, px, slip, sl, tp, cmt, Magic, 0, clr);
         err = ticket < 0 ? GetLastError() : 0;
        }
      if(ticket < 0 && err == 130)
        {
         ticket = OrderSend(s, cmd, lots, px, slip, 0, 0, cmt, Magic, 0, clr);
         if(ticket > 0)
           {
            if(!OrderModify(ticket, px, sl, tp, 0, clr))
               Print("SLOI modify ", s, " ", GetLastError());
           }
         else err = GetLastError();
        }
      if(ticket < 0)
        {
         Print("SLOI ", s, " err ", err);
         Alert("SLOI ", s, " ошибка ", err, " спред ", SpreadPt(s), "п  slip ", slip);
        }
     }
   return(ticket);
  }

int CountMine(string s)
  {
   int n = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != s || OrderMagicNumber() != Magic) continue;
      int ty = OrderType();
      if(ty==OP_BUY || ty==OP_SELL || ty==OP_BUYLIMIT || ty==OP_SELLLIMIT || ty==OP_BUYSTOP || ty==OP_SELLSTOP) n++;
     }
   return(n);
  }

string Naked(string s)
  {
   string u = s;
   if(StringLen(g_suffix) > 0) StringReplace(u, g_suffix, "");
   StringToUpper(u);
   if(StringFind(u, "XAU") >= 0 || StringFind(u, "GOLD") >= 0) return("XAUUSD");
   if(StringFind(u, "XAG") >= 0 || StringFind(u, "SILVER") >= 0) return("XAGUSD");
   if(StringFind(u, "XBR") >= 0 || StringFind(u, "BRENT") >= 0) return("XBRUSD");
   if(StringFind(u, "XNG") >= 0) return("XNGUSD");
   if(StringFind(u, "USO") >= 0 || StringFind(u, "WTI") >= 0 || StringFind(u, "XTI") >= 0) return("XTIUSD");
   return(u);
  }

void PullFeed()
  {
   if(TimeCurrent() - g_feedAt < 20) return;
   g_feedAt = TimeCurrent();
   char data[];
   char result[];
   string hdr = "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\nAccept: text/plain,*/*\r\n";
   string rh = "";
   ArrayResize(data, 0);
   ResetLastError();
   if(StringLen(g_url) < 12)
     {
      g_feedNote = "вставьте адрес ленты";
      return;
     }
   int res = WebRequest("GET", g_url, hdr, 25000, data, result, rh);
   if(res == -1)
     {
      int err = GetLastError();
      if(err == 4060) g_feedNote = "этот адрес в WebRequest";
      else if(err == 5200) g_feedNote = "домена нет";
      else if(err == 5203) g_feedNote = "таймаут Vercel, повтор";
      else g_feedNote = "сеть "+IntegerToString(err);
      Print("SLOI WebRequest fail ", err, " url=", g_url);
      g_feed = "";
      return;
     }
   if(res != 200)
     {
      g_feedNote = "HTTP "+IntegerToString(res);
      g_feed = "";
      return;
     }
   g_feed = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   g_feedNote = (StringFind(g_feed, "SLOI") >= 0 || StringLen(g_feed) > 8 ? "сайт ок" : "пустая лента");
   SeedFromFeed();
   PushTape();
  }

void AddSym(string s)
  {
   if(StringLen(s) < 3) return;
   for(int i = 0; i < g_n; i++)
      if(g_sym[i] == s || Naked(g_sym[i]) == Naked(s)) return;
   if(g_n >= MAXSYM) return;
   SymbolSelect(s, true);
   ArrayResize(g_sym, g_n + 1);
   g_sym[g_n] = s;
   g_lastKey[g_n] = "";
   g_prevV[g_n] = "";
   g_lastBar[g_n] = 0;
   g_n++;
  }

void SeedFromFeed()
  {
   string lines[];
   int n = StringSplit(g_feed, '\n', lines);
   for(int i = 0; i < n; i++)
     {
      string line = lines[i];
      if(StringLen(line) < 6) continue;
      if(StringGetCharacter(line, 0) == '#') continue;
      string parts[];
      if(StringSplit(line, ' ', parts) < 1) continue;
      string id = parts[0];
      if(StringLen(id) < 5) continue;
      string s = id;
      if(StringLen(g_suffix) > 0)
        {
         string a = id + g_suffix;
         string b = (StringFind(g_suffix, ".") == 0 ? a : id + "." + g_suffix);
         SymbolSelect(id, true);
         SymbolSelect(a, true);
         SymbolSelect(b, true);
         if(BidOf(a) > 0 || AskOf(a) > 0) s = a;
         else if(BidOf(b) > 0 || AskOf(b) > 0) s = b;
         else if(BidOf(id) > 0 || AskOf(id) > 0) s = id;
         else s = a;
        }
      else SymbolSelect(id, true);
      AddSym(s);
     }
  }

void PushTape()
  {
   string url = g_url;
   StringReplace(url, "signals.txt", "broker");
   if(StringFind(url, "broker") < 0)
     {
      if(StringGetCharacter(url, StringLen(url) - 1) == '/') url = url + "api/broker";
      else url = url + "/api/broker";
     }
   string body = "# SLOI broker\n";
   for(int i = 0; i < g_n; i++)
     {
      string s = g_sym[i];
      double bid = BidOf(s);
      double ask = AskOf(s);
      if(bid <= 0 || ask <= 0) continue;
      body += Naked(s) + " " + DoubleToStr(bid, DigitsOf(s)) + " " + DoubleToStr(ask, DigitsOf(s)) + "\n";
     }
   char data[];
   char result[];
   string rh = "";
   int n = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(n > 0) ArrayResize(data, n - 1);
   string hdr = "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\nContent-Type: text/plain\r\n";
   ResetLastError();
   WebRequest("POST", url, hdr, 8000, data, result, rh);
  }

void ReadSite(string naked, int &dir, double &entry, double &stop, double &target, double &siteLast, string &verdict, string &why, double &skewCap, int &lim)
  {
   dir = 0; entry = 0; stop = 0; target = 0; siteLast = 0; skewCap = 0; lim = 0;
   verdict = "ЖДАТЬ";
   why = g_feedNote;
   if(StringLen(g_feed) < 4) { why = "нет сайта"; return; }
   string lines[];
   int n = StringSplit(g_feed, '\n', lines);
   for(int i = 0; i < n; i++)
     {
      string line = lines[i];
      StringTrimLeft(line);
      StringTrimRight(line);
      if(StringLen(line) < 3 || StringGetCharacter(line, 0) == '#') continue;
      string p[];
      int k = StringSplit(line, ' ', p);
      if(k < 2) continue;
      if(Naked(p[0]) != naked) continue;
      string side = p[1];
      if(k >= 5)
        {
         entry = StringToDouble(p[2]);
         stop = StringToDouble(p[3]);
         target = StringToDouble(p[4]);
        }
      if(k >= 6) siteLast = StringToDouble(p[5]);
      for(int t = 6; t < k - 1; t++)
        {
         if(p[t] == "SKEW") skewCap = StringToDouble(p[t + 1]);
         if(p[t] == "MODE" && p[t + 1] == "LIMIT") lim = 1;
        }
      if(side == "BUY") { dir = 1; verdict = "ЛОНГ"; why = "сайт"; return; }
      if(side == "SELL") { dir = -1; verdict = "ШОРТ"; why = "сайт"; return; }
      dir = 0; verdict = "ЖДАТЬ"; why = "сайт ждёт";
      return;
     }
   why = "нет в ленте";
  }

double SkewCap(string n, double fromFeed)
  {
   if(fromFeed > 0) return(fromFeed);
   if(n == "XAUUSD") return(1.00);
   if(n == "XAGUSD") return(1.20);
   if(n == "USOIL" || n == "XTIUSD" || n == "XBRUSD") return(0.40);
   if(n == "XNGUSD") return(0.80);
   if(StringFind(n, "BTC") >= 0 || StringFind(n, "ETH") >= 0) return(1.50);
   if(StringFind(n, "LTC") >= 0 || StringFind(n, "XRP") >= 0 || StringFind(n, "TON") >= 0 || StringFind(n, "BCH") >= 0) return(2.20);
   if(StringFind(n, "JPY") >= 0) return(0.15);
   if(n == "EURUSD" || n == "GBPUSD" || n == "USDCHF" || n == "AUDUSD" || n == "USDCAD" || n == "NZDUSD") return(0.08);
   return(g_skew);
  }

void Scan(int idx, string &bias, string &verdict, string &why,
          int &dir, double &entry, double &stop, double &target, int &spPts)
  {
   string s = g_sym[idx];
   spPts = SpreadPt(s);
   double spread = SpreadPr(s);
   dir = 0; entry = 0; stop = 0; target = 0;
   double siteLast = 0;
   double skewFeed = 0;
   int lim = 0;
   bias = "сайт";
   ReadSite(Naked(s), dir, entry, stop, target, siteLast, verdict, why, skewFeed, lim);
   g_lim[idx] = lim;
   double mid = (BidOf(s) + AskOf(s)) * 0.5;
   if(siteLast <= 0 && entry > 0) siteLast = entry;
   if(siteLast > 0 && mid > 0)
     {
      double skew = MathAbs(mid - siteLast) / siteLast * 100.0;
      bias = DoubleToStr(skew, 2) + "%";
      double limSkew = SkewCap(Naked(s), skewFeed);
      if(dir != 0 && skew > limSkew)
        {
         if(lim == 0)
           {
            dir = 0;
            verdict = "КОТИР";
            why = bias+" > "+DoubleToStr(limSkew, 2)+"%";
            return;
           }
         why = "лимит, сверка "+bias;
        }
      if(dir == 0)
        {
         why = "ждет "+bias;
         return;
        }
     }
   else
     {
      bias = "нет last";
      if(dir == 0) { why = why+" · нет Yahoo"; return; }
     }
   if(dir == 0) return;
   int capSp = g_maxSp;
   string naked = Naked(s);
   if(naked == "XAUUSD") capSp = MathMax(capSp, 80);
   if(naked == "XAGUSD") capSp = MathMax(capSp, 60);
   bool crypto = (StringFind(naked, "BTC") >= 0 || StringFind(naked, "ETH") >= 0 || StringFind(naked, "LTC") >= 0
      || StringFind(naked, "BCH") >= 0 || StringFind(naked, "XRP") >= 0 || StringFind(naked, "TON") >= 0);
   if(crypto) capSp = MathMax(capSp, 2500);
   if(lim == 0 && spPts > capSp) { dir = 0; verdict = "СПРЕД"; why = IntegerToString(spPts)+"п"; return; }
   if(crypto && mid > 0 && spread / mid * 100.0 > 1.2)
     { dir = 0; verdict = "СПРЕД"; why = DoubleToStr(spread / mid * 100.0, 2)+"%"; return; }
   double px = (dir > 0 ? AskOf(s) : BidOf(s));
   if(entry <= 0) entry = px;
   if(stop <= 0 || target <= 0) { dir = 0; verdict = "ЖДАТЬ"; why = "нет SL/TP"; return; }
   double pxRef = (lim > 0 && entry > 0) ? entry : px;
   if(lim > 0 && mid > 0 && spread / mid * 100.0 > 1.5)
     { dir = 0; verdict = "СПРЕД"; why = "лимит широкий"; return; }
   double grossR = MathAbs(target - pxRef);
   double grossK = MathAbs(pxRef - stop);
   double roundT = 2.0 * spread;
   double netR = grossR - spread;
   double netK = grossK + spread;
   double covers = (roundT > 0 ? grossR / roundT : 0);
   double rr = (netK > 0 ? netR / netK : 0);
   if(netR <= 0 || covers < MinCover || rr < MinNetRR)
     { dir = 0; verdict = "СПРЕД"; why = "круг"; return; }
   why = (lim > 0 ? "лимит " : "рынок ") + bias + " RR " + DoubleToStr(rr, 1);
  }

void MaybeTrade(int idx, int dir, double entry, double stop, double target, string verdict, int spPts)
  {
   string s = g_sym[idx];
   bool nowGo = (verdict == "ЛОНГ" || verdict == "ШОРТ");
   bool wasWait = (g_prevV[idx] != "" && g_prevV[idx] != "ЛОНГ" && g_prevV[idx] != "ШОРТ");
   if(g_alerts && wasWait && nowGo)
     {
      Alert("SLOI WAIT снят ", s, " ", verdict);
      PlaySound("alert.wav");
     }
   g_prevV[idx] = verdict;
   datetime bar = iTime(s, g_tf, 0);
   string key = s + verdict + TimeToStr(bar, TIME_DATE|TIME_MINUTES);
   if(dir == 0)
     {
      DeletePending(s);
      g_lastKey[idx] = key;
      return;
     }
   if(g_alerts && !wasWait && key != g_lastKey[idx]) {
     Alert("SLOI ", s, " ", verdict, " ", IntegerToString(spPts), "pt");
     PlaySound("alert.wav");
   }
   if(!g_auto)
     {
      if(g_alerts && key != g_lastKey[idx])
        {
         Alert("SLOI ", s, " ", verdict, " — АВТО ВЫКЛ, ордер не шлём. Нажмите АВТО ВКЛ.");
         PlaySound("alert.wav");
        }
      g_lastKey[idx] = key;
      return;
     }
   if(CountMarket(s) > 0 && OneTradeOnly > 0) { g_lastKey[idx] = key; return; }
   if(CoolMinutes > 0 && RecentLoss(s, CoolMinutes)) { g_lastKey[idx] = key; return; }
   RefreshRates();
   int digits = DigitsOf(s);
   int cmd = dir > 0 ? OP_BUY : OP_SELL;
   double px = dir > 0 ? AskOf(s) : BidOf(s);
   double risk = MathAbs(entry - stop);
   if(g_lim[idx] > 0 && entry > 0 && risk > 0)
     {
      double near = MathMax(SpreadPr(s) * 2.0, MarketInfo(s, MODE_STOPLEVEL) * PointOf(s));
      near = MathMax(near, risk * 0.3);
      if(dir > 0 && AskOf(s) > entry + near) { cmd = OP_BUYLIMIT; px = NormalizeDouble(entry, digits); }
      if(dir < 0 && BidOf(s) < entry - near) { cmd = OP_SELLLIMIT; px = NormalizeDouble(entry, digits); }
     }
   DeleteWrongPending(s, dir);
   if((cmd == OP_BUYLIMIT || cmd == OP_SELLLIMIT) && SamePending(s, dir, px))
     {
      g_lastKey[idx] = key;
      return;
     }
   if(cmd == OP_BUYLIMIT || cmd == OP_SELLLIMIT) DeletePending(s);
   double lots = LotFor(s, entry, stop);
   int ticket = SendOrder(s, cmd, lots, px,
                          NormalizeDouble(stop, digits), NormalizeDouble(target, digits),
                          "SLOI", dir > 0 ? C_BUY : C_SEL);
   if(ticket > 0) g_lastKey[idx] = key;
  }

int CountMarket(string s)
  {
   int n = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != s) continue;
      int ty = OrderType();
      if(ty != OP_BUY && ty != OP_SELL) continue;
      if(OrderMagicNumber() == Magic) { n++; continue; }
      if(FixForeign && IsForeign()) n++;
     }
   return(n);
  }

void DeleteWrongPending(string s, int dir)
  {
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderMagicNumber() != Magic || OrderSymbol() != s) continue;
      int ty = OrderType();
      bool buyP = (ty == OP_BUYLIMIT || ty == OP_BUYSTOP);
      bool selP = (ty == OP_SELLLIMIT || ty == OP_SELLSTOP);
      if(dir > 0 && selP) OrderDelete(OrderTicket());
      if(dir < 0 && buyP) OrderDelete(OrderTicket());
     }
  }

bool SamePending(string s, int dir, double px)
  {
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderMagicNumber() != Magic || OrderSymbol() != s) continue;
      int ty = OrderType();
      if(dir > 0 && ty != OP_BUYLIMIT && ty != OP_BUYSTOP) continue;
      if(dir < 0 && ty != OP_SELLLIMIT && ty != OP_SELLSTOP) continue;
      if(MathAbs(OrderOpenPrice() - px) <= MathMax(PointOf(s) * 10.0, MathAbs(px) * 0.0008)) return(true);
     }
   return(false);
  }

int CountPending(string s)
  {
   int n = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != s || OrderMagicNumber() != Magic) continue;
      int ty = OrderType();
      if(ty == OP_BUYLIMIT || ty == OP_SELLLIMIT || ty == OP_BUYSTOP || ty == OP_SELLSTOP) n++;
     }
   return(n);
  }

bool RecentLoss(string s, int minutes)
  {
   datetime since = TimeCurrent() - minutes * 60;
   int n = OrdersHistoryTotal();
   int from = MathMax(0, n - 80);
   for(int i = n - 1; i >= from; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY)) continue;
      if(OrderMagicNumber() != Magic || OrderSymbol() != s) continue;
      int ty = OrderType();
      if(ty != OP_BUY && ty != OP_SELL) continue;
      if(OrderCloseTime() < since) continue;
      if(OrderProfit() + OrderSwap() + OrderCommission() < 0) return(true);
     }
   return(false);
  }

double NormalizeLot(string s, double lots)
  {
   double minl = MarketInfo(s, MODE_MINLOT);
   double maxl = MarketInfo(s, MODE_MAXLOT);
   double step = MarketInfo(s, MODE_LOTSTEP);
   if(minl <= 0) minl = 0.01;
   if(maxl <= 0) maxl = 100;
   if(step <= 0) step = 0.01;
   lots = MathFloor(lots / step + 1e-8) * step;
   if(lots < minl) lots = minl;
   if(lots > maxl) lots = maxl;
   return(NormalizeDouble(lots, 2));
  }

int LossStreak(string s)
  {
   if(!g_mart) return(0);
   datetime before = TimeCurrent() + 1;
   int streak = 0;
   int cap = MathMax(1, g_martMax);
   for(int k = 0; k < cap; k++)
     {
      datetime best = 0;
      double prof = 0;
      bool found = false;
      int n = OrdersHistoryTotal();
      for(int i = 0; i < n; i++)
        {
         if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY)) continue;
         if(OrderMagicNumber() != Magic || OrderSymbol() != s) continue;
         int ty = OrderType();
         if(ty != OP_BUY && ty != OP_SELL) continue;
         datetime ct = OrderCloseTime();
         if(ct <= 0 || ct >= before) continue;
         if(ct >= best)
           {
            best = ct;
            prof = OrderProfit() + OrderSwap() + OrderCommission();
            found = true;
           }
        }
      if(!found) break;
      if(prof >= 0) break;
      streak++;
      before = best;
     }
   return(streak);
  }

double LotOf(string s)
  {
   string n = Naked(s);
   if(StringFind(n, "XAU") >= 0) return(g_lotXau);
   if(StringFind(n, "XAG") >= 0) return(g_lotXag);
   if(StringFind(n, "XNG") >= 0) return(g_lotGas);
   if(StringFind(n, "XTI") >= 0 || StringFind(n, "XBR") >= 0 || StringFind(n, "USOIL") >= 0) return(g_lotOil);
   if(StringFind(n, "BTC") >= 0 || StringFind(n, "ETH") >= 0 || StringFind(n, "LTC") >= 0
      || StringFind(n, "BCH") >= 0 || StringFind(n, "XRP") >= 0 || StringFind(n, "TON") >= 0)
      return(g_lotCry);
   return(g_lots);
  }

double LotFor(string s, double entry, double stop)
  {
   double cap = LotOf(s);
   double lots = cap;
   if(g_riskOn && entry > 0 && stop > 0)
     {
      double dist = MathAbs(entry - stop);
      double tickv = MarketInfo(s, MODE_TICKVALUE);
      double ticks = MarketInfo(s, MODE_TICKSIZE);
      double money = AccountEquity() * g_riskPct / 100.0;
      if(dist > 0 && tickv > 0 && ticks > 0 && money > 0)
         lots = money / (dist / ticks * tickv);
      if(cap > 0 && lots > cap) lots = cap;
     }
   int st = LossStreak(s);
   if(st > 0 && g_martMult > 1)
     {
      for(int i = 0; i < st; i++) lots *= g_martMult;
     }
   return(NormalizeLot(s, lots));
  }

void ManageBE()
  {
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderMagicNumber() != Magic) continue;
      int type = OrderType();
      if(type != OP_BUY && type != OP_SELL) continue;
      double open = OrderOpenPrice();
      double sl = OrderStopLoss();
      double tp = OrderTakeProfit();
      double risk = MathAbs(open - sl);
      if(risk <= 0) continue;
      string s = OrderSymbol();
      int digits = DigitsOf(s);
      if(type == OP_BUY && BidOf(s) - open >= risk * 1.25)
        {
         double be = NormalizeDouble(open + SpreadPr(s), digits);
         if(sl < be)
           {
            if(!OrderModify(OrderTicket(), open, be, tp, 0, C_GOLD))
               Print("SLOI BE buy ", GetLastError());
           }
        }
      if(type == OP_SELL && open - AskOf(s) >= risk * 1.25)
        {
         double be = NormalizeDouble(open - SpreadPr(s), digits);
         if(sl == 0 || sl > be)
           {
            if(!OrderModify(OrderTicket(), open, be, tp, 0, C_GOLD))
               Print("SLOI BE sell ", GetLastError());
           }
        }
     }
  }

void ManualTrade(int dir)
  {
   string s = Symbol();
   SymbolSelect(s, true);
   RefreshRates();
   int digits = DigitsOf(s);
   int cmd = dir > 0 ? OP_BUY : OP_SELL;
   double px = dir > 0 ? AskOf(s) : BidOf(s);
   if(px <= 0) { Print("SLOI ручной: нет котировки ", s); return; }
   int d = 0;
   double entry = 0, stop = 0, target = 0, siteLast = 0, skewCap = 0;
   string verdict, why;
   int lim = 0;
   ReadSite(Naked(s), d, entry, stop, target, siteLast, verdict, why, skewCap, lim);
   double lots = LotFor(s, entry, stop);
   double sl = (stop > 0 ? NormalizeDouble(stop, digits) : 0);
   double tp = (target > 0 ? NormalizeDouble(target, digits) : 0);
   int ticket = SendOrder(s, cmd, lots, px, sl, tp, "SLOI manual", dir > 0 ? C_BUY : C_SEL);
   if(ticket > 0) Alert("SLOI ", (dir > 0 ? "КУПИТЬ " : "ПРОДАТЬ "), s, " #", ticket);
  }

void CloseOne()
  {
   int type = OrderType();
   int ticket = OrderTicket();
   string s = OrderSymbol();
   double lots = OrderLots();
   RefreshRates();
   bool ok = false;
   if(type == OP_BUY) ok = OrderClose(ticket, lots, BidOf(s), SlippagePoints, C_SEL);
   else if(type == OP_SELL) ok = OrderClose(ticket, lots, AskOf(s), SlippagePoints, C_BUY);
   else ok = OrderDelete(ticket);
   if(!ok) Print("SLOI close err ", GetLastError(), " #", ticket);
  }

void DeletePending(string s)
  {
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderMagicNumber() != Magic) continue;
      if(OrderSymbol() != s) continue;
      int type = OrderType();
      if(type != OP_BUYLIMIT && type != OP_SELLLIMIT && type != OP_BUYSTOP && type != OP_SELLSTOP) continue;
      if(!OrderDelete(OrderTicket())) Print("SLOI снять отложку ", s, " ", GetLastError());
     }
  }

void CloseMine(bool all)
  {
   int n = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderMagicNumber() != Magic) continue;
      int type = OrderType();
      if(type != OP_BUY && type != OP_SELL && type != OP_BUYLIMIT && type != OP_SELLLIMIT && type != OP_BUYSTOP && type != OP_SELLSTOP) continue;
      if(!all)
        {
         if(type != OP_BUY && type != OP_SELL) continue;
         if(OrderProfit() + OrderSwap() + OrderCommission() <= 0) continue;
        }
      CloseOne();
      n++;
     }
   Alert("SLOI ", (all ? "закрыть всё: " : "закрыть прибыль: "), n);
  }

bool IsForeign()
  {
   if(OrderMagicNumber() == Magic) return(false);
   string c = OrderComment();
   if(StringLen(ForeignTag) <= 0) return(true);
   if(StringFind(c, ForeignTag) >= 0) return(true);
   if(StringFind(c, "WS") >= 0) return(true);
   if(StringFind(c, "world") >= 0 || StringFind(c, "World") >= 0) return(true);
   return(false);
  }

void AlignForeign(string s, int dir, double stop, double target)
  {
   if(!FixForeign) return;
   int digits = DigitsOf(s);
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != s) continue;
      if(!IsForeign()) continue;
      int ty = OrderType();
      bool buy = (ty == OP_BUY || ty == OP_BUYLIMIT || ty == OP_BUYSTOP);
      bool sel = (ty == OP_SELL || ty == OP_SELLLIMIT || ty == OP_SELLSTOP);
      if(dir == 0)
        {
         CloseOne();
         continue;
        }
      if((dir > 0 && sel) || (dir < 0 && buy))
        {
         CloseOne();
         continue;
        }
      if(ty != OP_BUY && ty != OP_SELL) continue;
      double sl = (stop > 0 ? NormalizeDouble(stop, digits) : OrderStopLoss());
      double tp = (target > 0 ? NormalizeDouble(target, digits) : OrderTakeProfit());
      if(MathAbs(OrderStopLoss() - sl) < PointOf(s) * 2 && MathAbs(OrderTakeProfit() - tp) < PointOf(s) * 2) continue;
      if(!OrderModify(OrderTicket(), OrderOpenPrice(), sl, tp, 0, C_GOLD))
         Print("SLOI WS modify ", s, " ", GetLastError());
     }
  }

void CloseForeignAll()
  {
   int n = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(!IsForeign()) continue;
      CloseOne();
      n++;
     }
   if(n > 0) Alert("SLOI снял чужие WS: ", n);
  }

void Wipe()
  {
   for(int i = ObjectsTotal() - 1; i >= 0; i--)
     {
      string n = ObjectName(i);
      if(StringFind(n, "SLOI_") == 0 || StringFind(n, "STRATUM_") == 0) ObjectDelete(n);
     }
   Comment("");
  }

void Rect(string id, int x, int y, int w, int h, color bg)
  {
   string n = P + id;
   if(ObjectFind(0, n) < 0)
     {
      if(!ObjectCreate(0, n, OBJ_RECTANGLE_LABEL, 0, 0, 0))
         ObjectCreate(n, OBJ_RECTANGLE_LABEL, 0, 0, 0);
     }
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_COLOR, C_LINE);
   ObjectSetInteger(0, n, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, n, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, n, OBJPROP_BACK, false);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
  }

void Lab(string id, int x, int y, string text, color clr, int size)
  {
   string n = P + id;
   if(ObjectFind(0, n) < 0)
     {
      if(!ObjectCreate(0, n, OBJ_LABEL, 0, 0, 0))
         ObjectCreate(n, OBJ_LABEL, 0, 0, 0);
     }
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, size);
   ObjectSetString(0, n, OBJPROP_FONT, "Arial");
   ObjectSetString(0, n, OBJPROP_TEXT, text);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
  }

void Btn(string id, int x, int y, int w, int h, string text, color bg)
  {
   string n = P + id;
   if(ObjectFind(0, n) < 0)
     {
      if(!ObjectCreate(0, n, OBJ_BUTTON, 0, 0, 0))
         ObjectCreate(n, OBJ_BUTTON, 0, 0, 0);
     }
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_COLOR, C_BG);
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, 8);
   ObjectSetString(0, n, OBJPROP_FONT, "Arial");
   ObjectSetString(0, n, OBJPROP_TEXT, text);
   ObjectSetInteger(0, n, OBJPROP_STATE, false);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, false);
  }

void Edit(string id, int x, int y, int w, int h, string text, bool force)
  {
   string n = P + id;
   if(ObjectFind(0, n) < 0)
     {
      if(!ObjectCreate(0, n, OBJ_EDIT, 0, 0, 0))
         ObjectCreate(n, OBJ_EDIT, 0, 0, 0);
      force = true;
     }
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, C_BOX);
   ObjectSetInteger(0, n, OBJPROP_COLOR, C_FG);
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, 8);
   ObjectSetString(0, n, OBJPROP_FONT, "Arial");
   if(force) ObjectSetString(0, n, OBJPROP_TEXT, text);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, false);
  }

color VClr(string v)
  {
   if(v == "ЛОНГ") return(C_BUY);
   if(v == "ШОРТ") return(C_SEL);
   if(v == "СПРЕД" || v == "КОТИР" || v == "НЕТ ДАННЫХ") return(C_OFF);
   return(C_WAIT);
  }

void DrawDesk()
  {
   int x = PanelX;
   int y = PanelY;
   PullFeed();
   if(g_min)
     {
      Rect("bg", x, y, 300, 34, C_BG);
      Lab("title", x + 12, y + 8, "SLOI  "+g_feedNote+"  "+TimeToStr(TimeLocal(), TIME_MINUTES)+" лок", C_GOLD, 10);
      Btn("b_min", x + 260, y + 6, 32, 22, "+", C_GOLD);
      for(int i = 0; i < g_n; i++)
        {
         string bias, verdict, why;
         int dir = 0, spPts = 0;
         double entry = 0, stop = 0, target = 0;
         Scan(i, bias, verdict, why, dir, entry, stop, target, spPts);
         if(!g_auto && dir != 0) why = "АВТО ВЫКЛ";
         AlignForeign(g_sym[i], dir, stop, target);
         MaybeTrade(i, dir, entry, stop, target, verdict, spPts);
        }
      ManageBE();
      DrawSmcOnChart();
      ChartRedraw();
      return;
     }
   int w = 840;
   int setH = 164;
   int rowH = 20;
   int head = 22;
   int h = setH + head + rowH * g_n + 16;

   Rect("bg", x, y, w, h, C_BG);
   Lab("title", x + 14, y + 8, "SLOI DESK", C_GOLD, 12);
   Lab("hint", x + 150, y + 12, g_feedNote+"  "+IntegerToString(g_n)+"/"+IntegerToString(MAXSYM)+" пар  >> график  — свернуть", C_DIM, 8);

   Btn("b_auto", x + 470, y + 8, 96, 22, g_auto ? "АВТО ВКЛ" : "АВТО ВЫКЛ", g_auto ? C_BUY : C_SEL);
   Btn("b_alrt", x + 572, y + 8, 96, 22, g_alerts ? "АЛЕРТ ВКЛ" : "АЛЕРТ ВЫКЛ", C_GOLD);
   Btn("b_min", x + 674, y + 8, 32, 22, "—", C_GOLD);

   bool seed = !g_seeded;
   g_seeded = true;
   Btn("b_risk", x + 14, y + 36, 58, 20, g_riskOn ? "РИСК%" : "ЛОТ", C_GOLD);
   Edit("e_lots", x + 76, y + 36, 50, 20, g_riskOn ? DoubleToStr(g_riskPct, 2) : DoubleToStr(g_lots, 2), seed);

   Lab("l_sp", x + 132, y + 38, "макс спред", C_DIM, 8);
   Edit("e_spread", x + 200, y + 36, 44, 20, IntegerToString(g_maxSp), seed);

   Lab("l_tf", x + 250, y + 38, "TF", C_DIM, 8);
   Edit("e_tf", x + 272, y + 36, 44, 20, IntegerToString(g_tf), seed);

   Lab("l_suf", x + 322, y + 38, "суф", C_DIM, 8);
   Edit("e_suf", x + 348, y + 36, 56, 20, g_suffix, seed);

   Btn("b_mart", x + 410, y + 36, 90, 22, g_mart ? "МАРТ ВКЛ" : "МАРТ ВЫКЛ", g_mart ? C_WAIT : C_OFF);
   Btn("b_ok", x + 506, y + 36, 90, 22, "ПРИМЕНИТЬ", C_GOLD);

   Lab("l_fx", x + 14, y + 62, "FX", C_DIM, 8);
   Edit("e_fx", x + 36, y + 60, 44, 20, DoubleToStr(g_lots, 2), seed);
   Lab("l_xau", x + 86, y + 62, "AU", C_DIM, 8);
   Edit("e_xau", x + 110, y + 60, 44, 20, DoubleToStr(g_lotXau, 2), seed);
   Lab("l_xag", x + 160, y + 62, "AG", C_DIM, 8);
   Edit("e_xag", x + 184, y + 60, 44, 20, DoubleToStr(g_lotXag, 2), seed);
   Lab("l_gas", x + 234, y + 62, "ГАЗ", C_DIM, 8);
   Edit("e_gas", x + 262, y + 60, 44, 20, DoubleToStr(g_lotGas, 2), seed);
   Lab("l_oil", x + 312, y + 62, "НЕФТЬ", C_DIM, 8);
   Edit("e_oil", x + 354, y + 60, 44, 20, DoubleToStr(g_lotOil, 2), seed);
   Lab("l_cry", x + 404, y + 62, "КРИП", C_DIM, 8);
   Edit("e_cry", x + 444, y + 60, 44, 20, DoubleToStr(g_lotCry, 2), seed);

   Lab("l_list", x + 14, y + 86, "пары", C_DIM, 8);
   Edit("e_list", x + 50, y + 84, 720, 20, g_watch, seed);
   Lab("l_url", x + 14, y + 108, "лента", C_DIM, 8);
   Edit("e_url", x + 50, y + 106, 720, 20, g_url, seed);

   Btn("b_buy",  x + 50,  y + 132, 100, 24, "КУПИТЬ", C_BUY);
   Btn("b_sell", x + 158, y + 132, 100, 24, "ПРОДАТЬ", C_SEL);
   Btn("b_cp",   x + 266, y + 132, 150, 24, "ЗАКРЫТЬ ПРИБЫЛЬ", C_GOLD);
   Btn("b_ca",   x + 424, y + 132, 110, 24, "ЗАКРЫТЬ ВСЁ", C_SEL);
   Btn("b_ws",   x + 540, y + 132, 100, 24, "СНЯТЬ WS", C_WAIT);
   Lab("l_man", x + 648, y + 136, "WS→стол", C_DIM, 8);

   int hx = x + 14;
   int hy = y + setH + 2;
   Lab("h1", hx,     hy, "СИМВОЛ",  C_DIM, 8);
   Lab("h2", hx+110, hy, "СПРЕД",   C_DIM, 8);
   Lab("h3", hx+170, hy, "% YAHOO", C_DIM, 8);
   Lab("h4", hx+250, hy, "ВХОД",    C_DIM, 8);
   Lab("h5", hx+350, hy, "СТОП",    C_DIM, 8);
   Lab("h6", hx+450, hy, "ЦЕЛЬ",    C_DIM, 8);
   Lab("h7", hx+530, hy, "ВЕРДИКТ", C_DIM, 8);
   Lab("h8", hx+700, hy, "ЛОТ", C_DIM, 8);

   string cmt = "SLOI DESK | лента "+g_feedNote+" | авто "+(g_auto?"ВКЛ":"ВЫКЛ")+" | макс спред "+IntegerToString(g_maxSp)+"п\n";
   cmt += "СИМВОЛ     СПРЕД  СТРУКТ   ВХОД        СТОП        ЦЕЛЬ        ВЕРДИКТ\n";

   for(int i = 0; i < g_n; i++)
     {
      string bias, verdict, why;
      int dir = 0, spPts = 0;
      double entry = 0, stop = 0, target = 0;
      Scan(i, bias, verdict, why, dir, entry, stop, target, spPts);
      if(!g_auto && dir != 0) why = "АВТО ВЫКЛ";
      AlignForeign(g_sym[i], dir, stop, target);
      MaybeTrade(i, dir, entry, stop, target, verdict, spPts);

      int ry = y + setH + head + i * rowH;
      Rect("r"+IntegerToString(i), x + 8, ry - 2, w - 16, rowH - 2, C_BOX);
      string s = g_sym[i];
      Lab("s"+IntegerToString(i), hx,     ry, s, C_FG, 9);
      Lab("p"+IntegerToString(i), hx+110, ry, IntegerToString(spPts)+" п", C_GOLD, 9);
      Lab("b"+IntegerToString(i), hx+170, ry, bias, C_DIM, 9);
      Lab("e"+IntegerToString(i), hx+250, ry, entry > 0 ? Px(s, entry) : "—", C_FG, 9);
      Lab("k"+IntegerToString(i), hx+350, ry, stop > 0 ? Px(s, stop) : "—", C_SEL, 9);
      Lab("t"+IntegerToString(i), hx+450, ry, target > 0 ? Px(s, target) : "—", C_BUY, 9);
      int st = LossStreak(s);
      double showLot = (dir != 0 || st > 0) ? LotFor(s, entry, stop) : LotOf(s);
      string martBit = "";
      if(g_mart && st > 0) martBit = " МАРТ x"+IntegerToString((int)MathRound(MathPow(g_martMult, st)));
      Lab("v"+IntegerToString(i), hx+530, ry, verdict+"  "+why+martBit, VClr(verdict), 9);
      Lab("o"+IntegerToString(i), hx+700, ry, DoubleToStr(showLot, 2), st > 0 ? C_WAIT : C_FG, 9);
      Btn("g"+IntegerToString(i), x + w - 72, ry - 1, 58, 18, ">>", C_GOLD);

      cmt += s;
      while(StringLen(s) < 10) { s = s + " "; }
      cmt += "  " + IntegerToString(spPts) + "п  " + bias + "  " + verdict + "  " + why + "\n";
     }
   ManageBE();
   DrawSmcOnChart();
   ChartRedraw();
  }
