//+------------------------------------------------------------------+
//|                                              SLOI_Desk.mq4    |
//|  Берёт ТОЛЬКО команды сайта /api/signals.txt. Сам рынок не считает.
//|  Спред = Ask-Bid каждого символа в терминале.                    |
//+------------------------------------------------------------------+
#property copyright "SLOI"
#property link      ""
#property version   "4.06"
#property strict
#property description "Сделки сайта. Спред и сверка котировок с брокером."

input string  SignalsUrl      = "https://sloi-kohl.vercel.app/api/signals.txt";
input string  WatchList       = "EURUSD,GBPUSD,USDJPY,USDCHF,AUDUSD,USDCAD,NZDUSD,EURJPY,GBPJPY,XAUUSD,XAGUSD,USOIL";
input string  BrokerSuffix    = ".cs";
input int     WorkTF          = 240;
input bool    AutoTrade       = false;
input double  Lots            = 0.10;
input int     Magic           = 220826;
input int     SlippagePoints  = 20;
input int     MaxSpreadPoints = 30;
input double  MaxSkewPct      = 0.12;
input double  MinCover        = 2.2;
input double  MinNetRR        = 1.0;
input int     OneTradeOnly    = 1;
input bool    AlertsOn        = true;
input int     PanelX          = 8;
input int     PanelY          = 18;

#define P "SLOI_"
#define MAXSYM 16

string   g_sym[];
int      g_n;
string   g_lastKey[MAXSYM];
datetime g_lastBar[MAXSYM];

string g_watch;
string g_suffix;
string g_url;
int    g_tf;
bool   g_auto;
double g_lots;
int    g_maxSp;
double g_skew;
bool   g_alerts;
bool   g_seeded = false;
bool   g_ready = false;
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
   Print("SLOI 4.06: Yahoo vs брокер. Приказ только если котировки близки (MaxSkewPct).");
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
   if(sparam == P+"b_ok")
     {
      ApplyEdits();
      g_seeded = false;
      DrawDesk();
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
   if(l > 0) g_lots = l;
   if(s > 0) g_maxSp = s;
   if(t == 15 || t == 30 || t == 60 || t == 240 || t == 1440) g_tf = t;
   g_suffix = suf;
   if(StringLen(wl) > 2) g_watch = wl;
   if(StringLen(url) > 12) g_url = url;
   g_feed = "";
   g_feedAt = 0;
   ParseWatch();
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
      if(StringLen(g_suffix) > 0 && StringFind(s, g_suffix) < 0)
        {
         string a = s + g_suffix;
         string b = (StringFind(g_suffix, ".") == 0 ? a : s + "." + g_suffix);
         SymbolSelect(a, true);
         SymbolSelect(b, true);
         if(BidOf(b) > 0) s = b;
         else if(BidOf(a) > 0) s = a;
         else s = b;
        }
      if(StringLen(s) == 0) continue;
      SymbolSelect(s, true);
      if(g_n >= MAXSYM) break;
      ArrayResize(g_sym, g_n + 1);
      g_sym[g_n] = s;
      g_lastKey[g_n] = "";
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

int CountMine(string s)
  {
   int n = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() == s && OrderMagicNumber() == Magic) n++;
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
   if(StringFind(u, "USO") >= 0 || StringFind(u, "WTI") >= 0 || StringFind(u, "XTI") >= 0) return("USOIL");
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
   PushTape();
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

void ReadSite(string naked, int &dir, double &entry, double &stop, double &target, double &siteLast, string &verdict, string &why)
  {
   dir = 0; entry = 0; stop = 0; target = 0; siteLast = 0;
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
      if(side == "BUY") { dir = 1; verdict = "ЛОНГ"; why = "сайт"; return; }
      if(side == "SELL") { dir = -1; verdict = "ШОРТ"; why = "сайт"; return; }
      dir = 0; verdict = "ЖДАТЬ"; why = "сайт ждёт";
      return;
     }
   why = "нет в ленте";
  }

void Scan(int idx, string &bias, string &verdict, string &why,
          int &dir, double &entry, double &stop, double &target, int &spPts)
  {
   string s = g_sym[idx];
   spPts = SpreadPt(s);
   double spread = SpreadPr(s);
   dir = 0; entry = 0; stop = 0; target = 0;
   double siteLast = 0;
   bias = "сайт";
   ReadSite(Naked(s), dir, entry, stop, target, siteLast, verdict, why);
   double mid = (BidOf(s) + AskOf(s)) * 0.5;
   if(siteLast > 0 && mid > 0)
     {
      double skew = MathAbs(mid - siteLast) / siteLast * 100.0;
      bias = DoubleToStr(skew, 2) + "%";
      double lim = g_skew;
      if(DigitsOf(s) <= 3) lim = g_skew * 1.4;
      if(dir != 0 && skew > lim)
        {
         dir = 0;
         verdict = "КОТИР";
         why = "Yahoo "+Px(s, siteLast);
         return;
        }
     }
   if(dir == 0) return;
   if(spPts > g_maxSp) { dir = 0; verdict = "СПРЕД"; why = IntegerToString(spPts)+"п"; return; }
   double px = (dir > 0 ? AskOf(s) : BidOf(s));
   if(entry <= 0) entry = px;
   if(stop <= 0 || target <= 0) { dir = 0; verdict = "ЖДАТЬ"; why = "нет SL/TP"; return; }
   double grossR = MathAbs(target - px);
   double grossK = MathAbs(px - stop);
   double roundT = 2.0 * spread;
   double netR = grossR - spread;
   double netK = grossK + spread;
   double covers = (roundT > 0 ? grossR / roundT : 0);
   double rr = (netK > 0 ? netR / netK : 0);
   if(netR <= 0 || covers < MinCover || rr < MinNetRR)
     { dir = 0; verdict = "СПРЕД"; why = "круг"; return; }
   why = "сверка ок RR "+DoubleToStr(rr, 1);
  }

void MaybeTrade(int idx, int dir, double stop, double target, string verdict, int spPts)
  {
   string s = g_sym[idx];
   datetime bar = iTime(s, g_tf, 0);
   string key = s + verdict + TimeToStr(bar, TIME_DATE|TIME_MINUTES);
   if(key == g_lastKey[idx]) return;
   g_lastKey[idx] = key;
   if(dir == 0) return;
   if(g_alerts) {
     Alert("SLOI ", s, " ", verdict, " ", IntegerToString(spPts), "pt");
     PlaySound("alert.wav");
   }
   if(!g_auto) return;
   if(OneTradeOnly > 0 && CountMine(s) >= OneTradeOnly) return;
   RefreshRates();
   int digits = DigitsOf(s);
   double px = (dir > 0 ? AskOf(s) : BidOf(s));
   int ticket = OrderSend(s, dir > 0 ? OP_BUY : OP_SELL, g_lots, px, SlippagePoints,
                          NormalizeDouble(stop, digits), NormalizeDouble(target, digits),
                          "SLOI", Magic, 0, dir > 0 ? C_BUY : C_SEL);
   if(ticket < 0) Print("SLOI ", s, " err ", GetLastError());
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
   int w = 720;
   int setH = 114;
   int rowH = 22;
   int head = 24;
   int h = setH + head + rowH * g_n + 20;

   Rect("bg", x, y, w, h, C_BG);
   Lab("title", x + 14, y + 8, "SLOI DESK", C_GOLD, 12);
   Lab("hint", x + 150, y + 12, g_feedNote+"   Yahoo vs брокер   приказ если котировки близки", C_DIM, 8);

   Btn("b_auto", x + 500, y + 8, 100, 22, g_auto ? "АВТО ВКЛ" : "АВТО ВЫКЛ", g_auto ? C_SEL : C_GOLD);
   Btn("b_alrt", x + 606, y + 8, 100, 22, g_alerts ? "АЛЕРТ ВКЛ" : "АЛЕРТ ВЫКЛ", C_GOLD);

   bool seed = !g_seeded;
   g_seeded = true;
   Lab("l_lots", x + 14, y + 38, "лот", C_DIM, 8);
   Edit("e_lots", x + 40, y + 36, 50, 20, DoubleToStr(g_lots, 2), seed);

   Lab("l_sp", x + 100, y + 38, "макс спред", C_DIM, 8);
   Edit("e_spread", x + 170, y + 36, 44, 20, IntegerToString(g_maxSp), seed);

   Lab("l_tf", x + 224, y + 38, "TF мин", C_DIM, 8);
   Edit("e_tf", x + 270, y + 36, 50, 20, IntegerToString(g_tf), seed);

   Lab("l_suf", x + 330, y + 38, "суффикс", C_DIM, 8);
   Edit("e_suf", x + 384, y + 36, 70, 20, g_suffix, seed);

   Btn("b_ok", x + 470, y + 36, 90, 22, "ПРИМЕНИТЬ", C_GOLD);

   Lab("l_list", x + 14, y + 64, "пары", C_DIM, 8);
   Edit("e_list", x + 50, y + 62, 654, 20, g_watch, seed);
   Lab("l_url", x + 14, y + 86, "лента", C_DIM, 8);
   Edit("e_url", x + 50, y + 84, 654, 20, g_url, seed);

   int hx = x + 14;
   int hy = y + setH + 2;
   Lab("h1", hx,     hy, "СИМВОЛ",  C_DIM, 8);
   Lab("h2", hx+110, hy, "СПРЕД",   C_DIM, 8);
   Lab("h3", hx+170, hy, "Δ YAHOO", C_DIM, 8);
   Lab("h4", hx+250, hy, "ВХОД",    C_DIM, 8);
   Lab("h5", hx+350, hy, "СТОП",    C_DIM, 8);
   Lab("h6", hx+450, hy, "ЦЕЛЬ",    C_DIM, 8);
   Lab("h7", hx+550, hy, "ВЕРДИКТ", C_DIM, 8);

   PullFeed();
   string cmt = "SLOI DESK | лента "+g_feedNote+" | авто "+(g_auto?"ВКЛ":"ВЫКЛ")+" | макс спред "+IntegerToString(g_maxSp)+"п\n";
   cmt += "СИМВОЛ     СПРЕД  СТРУКТ   ВХОД        СТОП        ЦЕЛЬ        ВЕРДИКТ\n";

   for(int i = 0; i < g_n; i++)
     {
      string bias, verdict, why;
      int dir = 0, spPts = 0;
      double entry = 0, stop = 0, target = 0;
      Scan(i, bias, verdict, why, dir, entry, stop, target, spPts);
      MaybeTrade(i, dir, stop, target, verdict, spPts);

      int ry = y + setH + head + i * rowH;
      Rect("r"+IntegerToString(i), x + 8, ry - 2, w - 16, rowH - 2, C_BOX);
      string s = g_sym[i];
      Lab("s"+IntegerToString(i), hx,     ry, s, C_FG, 9);
      Lab("p"+IntegerToString(i), hx+110, ry, IntegerToString(spPts)+" п", C_GOLD, 9);
      Lab("b"+IntegerToString(i), hx+170, ry, bias, C_DIM, 9);
      Lab("e"+IntegerToString(i), hx+250, ry, entry > 0 ? Px(s, entry) : "—", C_FG, 9);
      Lab("k"+IntegerToString(i), hx+350, ry, stop > 0 ? Px(s, stop) : "—", C_SEL, 9);
      Lab("t"+IntegerToString(i), hx+450, ry, target > 0 ? Px(s, target) : "—", C_BUY, 9);
      Lab("v"+IntegerToString(i), hx+550, ry, verdict+"  "+why, VClr(verdict), 9);

      cmt += s;
      while(StringLen(s) < 10) { s = s + " "; }
      cmt += "  " + IntegerToString(spPts) + "п  " + bias + "  " + verdict + "  " + why + "\n";
     }
   ChartRedraw();
  }
