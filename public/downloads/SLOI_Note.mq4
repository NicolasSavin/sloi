//+------------------------------------------------------------------+
//| SLOI_Note.mq4                                                    |
//| Только приказы из заметок и с графика сайта. Сам рынок не считает.|
//+------------------------------------------------------------------+
#property copyright "SLOI"
#property link      ""
#property version   "1.10"
#property strict
#property description "SLOI Note 1.10: пары с панели, фигуры, вход, стоп, тейк и всплеск объёма"

input string SignalsUrl = "https://sloi-kohl.vercel.app/api/signals.txt";
input string DeskKey    = "";
input string Suffix     = ".cs";
input double Lots       = 0.10;
input int    Slippage   = 30;
input int    MagicNote  = 88046;

string   g_done = "";
string   g_note = "жду ключ";
datetime g_poll = 0;
bool     g_fig = false;
bool     g_force = false;
datetime g_bar = 0;
string   g_pairs[28];
int      g_np = 0;
int      g_figN = 0;

int OnInit()
  {
   EventSetTimer(2);
   LoadDone();
   FillPairs();
   Paint();
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   ObjectDelete(0, "SLOIN_bg");
   ObjectDelete(0, "SLOIN_tx");
   ObjectDelete(0, "SLOIN_fig");
   WipeFigs();
   WipePairs();
  }

void OnTimer()
  {
   Poll();
   Paint();
   if(!g_fig) return;
   datetime b = iTime(NULL, 0, 0);
   if(b != g_bar || g_force)
     {
      g_bar = b;
      g_force = false;
      DrawFigs();
     }
  }

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
  {
   if(id != CHARTEVENT_OBJECT_CLICK) return;
   if(sparam == "SLOIN_fig")
     {
      g_fig = !g_fig;
      ObjectSetInteger(0, sparam, OBJPROP_STATE, g_fig);
      if(!g_fig) WipeFigs();
      else g_force = true;
      Paint();
      return;
     }
   if(StringFind(sparam, "SLOIN_p_") != 0) return;
   ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
   string naked = StringSubstr(sparam, 8);
   string sym = Resolve(naked);
   if(sym == "")
     {
      g_note = "нет пары " + naked;
      return;
     }
   ChartSetSymbolPeriod(0, sym, Period());
   g_force = true;
   g_note = naked;
  }

void LoadDone()
  {
   int h = FileOpen("SLOI_Note_done.txt", FILE_READ|FILE_TXT|FILE_ANSI);
   if(h < 0) return;
   g_done = FileReadString(h);
   FileClose(h);
  }

void Remember(string id)
  {
   if(StringFind(g_done, id) >= 0) return;
   g_done = g_done + id + ",";
   if(StringLen(g_done) > 800) g_done = StringSubstr(g_done, StringLen(g_done) - 500);
   int h = FileOpen("SLOI_Note_done.txt", FILE_WRITE|FILE_TXT|FILE_ANSI);
   if(h < 0) return;
   FileWriteString(h, g_done);
   FileClose(h);
  }

string FeedUrl()
  {
   if(StringLen(DeskKey) < 8) return("");
   if(StringFind(SignalsUrl, "k=") >= 0) return(SignalsUrl);
   if(StringFind(SignalsUrl, "?") >= 0) return(SignalsUrl + "&k=" + DeskKey);
   return(SignalsUrl + "?k=" + DeskKey);
  }

string Resolve(string naked)
  {
   string trySym[4];
   trySym[0] = naked + Suffix;
   trySym[1] = naked;
   trySym[2] = naked + ".";
   trySym[3] = naked + "m";
   int i;
   for(i = 0; i < 4; i++)
     {
      if(StringLen(trySym[i]) < 3) continue;
      SymbolSelect(trySym[i], true);
      if(MarketInfo(trySym[i], MODE_BID) > 0) return(trySym[i]);
     }
   return("");
  }

double NormLot(string s)
  {
   double step = MarketInfo(s, MODE_LOTSTEP);
   double mn = MarketInfo(s, MODE_MINLOT);
   double mx = MarketInfo(s, MODE_MAXLOT);
   if(step <= 0) step = 0.01;
   double lots = MathFloor(Lots / step) * step;
   if(lots < mn) lots = mn;
   if(mx > 0 && lots > mx) lots = mx;
   return(NormalizeDouble(lots, 2));
  }

int Place(string s, int cmd, double px, double sl, double tp, string id)
  {
   int dir = (cmd == OP_BUY || cmd == OP_BUYLIMIT || cmd == OP_BUYSTOP) ? 1 : -1;
   double lots = NormLot(s);
   string cmt = "N" + id;
   bool bare = false;
   int err = 0;
   int ticket = OrderSend(s, cmd, lots, px, Slippage, sl, tp, cmt, MagicNote, 0, clrNONE);
   if(ticket < 0) err = GetLastError();
   if(ticket < 0 && err == 130)
     {
      bare = true;
      ticket = OrderSend(s, cmd, lots, px, Slippage, 0, 0, cmt, MagicNote, 0, clrNONE);
      err = (ticket < 0 ? GetLastError() : 0);
     }
   if(ticket > 0 && bare && sl > 0 && tp > 0)
     {
      if(OrderSelect(ticket, SELECT_BY_TICKET, MODE_TRADES))
         OrderModify(ticket, OrderOpenPrice(), sl, tp, 0, clrNONE);
     }
   if(ticket < 0)
     {
      g_note = s + " ошибка " + IntegerToString(err);
      Alert("SLOI Note ", s, " ошибка ", err);
      if(err == 132 || err == 146 || err == 0) return(0);
      return(-1);
     }
   g_note = (dir > 0 ? "покупка " : "продажа ") + s + " #" + IntegerToString(ticket);
   Alert("SLOI Note ", g_note);
   return(ticket);
  }

int DoOrder(string naked, int dir, double entry, double stop, double tp, int how, string id)
  {
   string s = Resolve(naked);
   if(s == "")
     {
      g_note = "нет котировки " + naked;
      return(0);
     }
   RefreshRates();
   int digits = (int)MarketInfo(s, MODE_DIGITS);
   double ask = MarketInfo(s, MODE_ASK);
   double bid = MarketInfo(s, MODE_BID);
   double spr = ask - bid;
   if(spr < 0) spr = 0;
   double point = MarketInfo(s, MODE_POINT);
   int cmd = (dir > 0 ? OP_BUY : OP_SELL);
   double px = (dir > 0 ? ask : bid);
   double sl = stop;
   double target = tp;
   bool inside = (dir > 0 ? (ask > stop && ask < tp) : (bid < stop && bid > tp));
   if(how == 1 && inside && MarketInfo(s, MODE_TRADEALLOWED) != 0)
     {
      cmd = (dir > 0 ? OP_BUY : OP_SELL);
      px = (dir > 0 ? ask : bid);
      sl = (dir > 0 ? stop + (ask - entry) : stop - (entry - bid));
      target = (dir > 0 ? tp + (ask - entry) : tp - (entry - bid));
     }
   else
     {
      if(dir > 0) cmd = (ask > entry ? OP_BUYLIMIT : OP_BUYSTOP);
      else cmd = (bid < entry ? OP_SELLLIMIT : OP_SELLSTOP);
      px = entry;
      if(MathAbs((dir > 0 ? ask : bid) - entry) <= MathMax(spr * 2.0, point * 5))
        {
         cmd = (dir > 0 ? OP_BUY : OP_SELL);
         px = (dir > 0 ? ask : bid);
        }
     }
   px = NormalizeDouble(px, digits);
   sl = NormalizeDouble(sl, digits);
   target = NormalizeDouble(target, digits);
   return(Place(s, cmd, px, sl, target, id));
  }

void Poll()
  {
   if(TimeCurrent() - g_poll < 3) return;
   g_poll = TimeCurrent();
   string url = FeedUrl();
   if(url == "")
     {
      g_note = "впишите ключ стола";
      return;
     }
   char data[];
   char result[];
   string rh = "";
   ArrayResize(data, 0);
   ResetLastError();
   int res = WebRequest("GET", url, "User-Agent: SLOI-Note\r\n", 8000, data, result, rh);
   if(res != 200)
     {
      int err = GetLastError();
      if(res == -1 && err == 4060) g_note = "добавьте адрес в WebRequest";
      else g_note = "лента " + IntegerToString(res) + " / " + IntegerToString(err);
      return;
     }
   string feed = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   if(StringFind(feed, "#CMD ") < 0)
     {
      if(StringFind(g_note, "#") < 0) g_note = "лента есть, приказа нет";
      return;
     }
   string lines[];
   int n = StringSplit(feed, '\n', lines);
   int i;
   for(i = 0; i < n; i++)
     {
      string line = lines[i];
      if(StringFind(line, "#CMD ") != 0) continue;
      string p[];
      int k = StringSplit(line, ' ', p);
      if(k < 4) continue;
      string id = p[1];
      string kind = p[2];
      if(kind != "BUY" && kind != "SELL") continue;
      if(StringFind(g_done, id) >= 0) continue;
      string naked = p[3];
      double entry = 0;
      double stop = 0;
      double target = 0;
      int how = 1;
      int t;
      for(t = 4; t < k - 1; t++)
        {
         if(p[t] == "ENTRY") entry = StringToDouble(p[t + 1]);
         else if(p[t] == "STOP") stop = StringToDouble(p[t + 1]);
         else if(p[t] == "TP") target = StringToDouble(p[t + 1]);
         else if(p[t] == "HOW" && p[t + 1] == "LIMIT") how = 0;
         else if(p[t] == "HOW" && p[t + 1] == "NOW") how = 1;
        }
      int dir = (kind == "BUY" ? 1 : -1);
      int ticket = 0;
      if(entry > 0 && stop > 0 && target > 0) ticket = DoOrder(naked, dir, entry, stop, target, how, id);
      else
        {
         string s = Resolve(naked);
         if(s == "") { g_note = "нет котировки " + naked; continue; }
         RefreshRates();
         double px = (dir > 0 ? MarketInfo(s, MODE_ASK) : MarketInfo(s, MODE_BID));
         ticket = Place(s, dir > 0 ? OP_BUY : OP_SELL, px, 0, 0, id);
        }
      if(ticket > 0) Remember(id);
      else if(ticket < 0) Remember(id);
     }
  }

void Paint()
  {
   if(ObjectFind(0, "SLOIN_bg") < 0)
      ObjectCreate(0, "SLOIN_bg", OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, "SLOIN_bg", OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, "SLOIN_bg", OBJPROP_XDISTANCE, 8);
   ObjectSetInteger(0, "SLOIN_bg", OBJPROP_YDISTANCE, 18);
   ObjectSetInteger(0, "SLOIN_bg", OBJPROP_XSIZE, 580);
   ObjectSetInteger(0, "SLOIN_bg", OBJPROP_YSIZE, 36);
   ObjectSetInteger(0, "SLOIN_bg", OBJPROP_BGCOLOR, C'18,22,28');
   ObjectSetInteger(0, "SLOIN_bg", OBJPROP_COLOR, clrGoldenrod);
   ObjectSetInteger(0, "SLOIN_bg", OBJPROP_BACK, false);
   if(ObjectFind(0, "SLOIN_tx") < 0)
      ObjectCreate(0, "SLOIN_tx", OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, "SLOIN_tx", OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, "SLOIN_tx", OBJPROP_XDISTANCE, 16);
   ObjectSetInteger(0, "SLOIN_tx", OBJPROP_YDISTANCE, 28);
   ObjectSetInteger(0, "SLOIN_tx", OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, "SLOIN_tx", OBJPROP_FONTSIZE, 10);
   ObjectSetString(0, "SLOIN_tx", OBJPROP_FONT, "Arial");
   ObjectSetString(0, "SLOIN_tx", OBJPROP_TEXT, "SLOI NOTE  " + g_note);
   ObjectSetInteger(0, "SLOIN_tx", OBJPROP_BACK, false);
   Btn("SLOIN_fig", 440, 22, 130, 26, g_fig ? "ФИГУРЫ ВКЛ" : "ФИГУРЫ ВЫКЛ", g_fig ? clrSeaGreen : clrDimGray);
   ObjectSetInteger(0, "SLOIN_fig", OBJPROP_STATE, g_fig);
   string now = NakedNow();
   int i;
   for(i = 0; i < g_np; i++)
     {
      int col = i % 10;
      int row = i / 10;
      string id = "SLOIN_p_" + g_pairs[i];
      Btn(id, 8 + col * 82, 60 + row * 22, 78, 18, g_pairs[i], g_pairs[i] == now ? clrGoldenrod : C'28,32,40');
      ObjectSetInteger(0, id, OBJPROP_STATE, false);
     }
  }

void FillPairs()
  {
   string raw = "EURUSD,GBPUSD,USDJPY,USDCHF,AUDUSD,USDCAD,NZDUSD,EURGBP,EURJPY,GBPJPY,AUDJPY,CADJPY,NZDJPY,EURCHF,EURAUD,GBPAUD,XAUUSD,XAGUSD,XTIUSD,XBRUSD,XNGUSD,BTCUSD,ETHUSD";
   string p[];
   int n = StringSplit(raw, ',', p);
   if(n > 28) n = 28;
   g_np = n;
   int i;
   for(i = 0; i < n; i++) g_pairs[i] = p[i];
  }

string NakedNow()
  {
   string s = Symbol();
   if(StringLen(Suffix) > 0) StringReplace(s, Suffix, "");
   StringToUpper(s);
   return(s);
  }

void Btn(string name, int x, int y, int w, int h, string text, color bg)
  {
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, h);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 8);
   ObjectSetString(0, name, OBJPROP_FONT, "Arial");
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, name, OBJPROP_ZORDER, 3000);
  }

void WipeFigs()
  {
   int i;
   for(i = ObjectsTotal(0, 0, -1) - 1; i >= 0; i--)
     {
      string n = ObjectName(0, i, 0, -1);
      if(StringFind(n, "SLOINP_") == 0) ObjectDelete(0, n);
     }
  }

void WipePairs()
  {
   int i;
   for(i = 0; i < g_np; i++) ObjectDelete(0, "SLOIN_p_" + g_pairs[i]);
  }

void Trend(string name, int s1, double p1, int s2, double p2, color clr)
  {
   datetime t1 = iTime(NULL, 0, s1);
   datetime t2 = iTime(NULL, 0, s2);
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_TREND, 0, t1, p1, t2, p2);
   else
     {
      ObjectMove(0, name, 0, t1, p1);
      ObjectMove(0, name, 1, t2, p2);
     }
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 2);
   ObjectSetInteger(0, name, OBJPROP_RAY, false);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
  }

void HLine(string name, double price, color clr, string text)
  {
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_HLINE, 0, 0, price);
   ObjectSet(name, OBJPROP_PRICE1, price);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_DASH);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
  }

void Txt(string name, datetime t, double price, string text, color clr)
  {
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_TEXT, 0, t, price);
   else ObjectMove(0, name, 0, t, price);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 9);
   ObjectSetString(0, name, OBJPROP_FONT, "Arial");
   ObjectSetInteger(0, name, OBJPROP_ANCHOR, ANCHOR_LEFT);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
  }

int SpikeBoost(int dir)
  {
   double avg = 0;
   int k;
   for(k = 2; k <= 21; k++) avg += (double)iVolume(NULL, 0, k);
   avg /= 20.0;
   if(avg <= 0) return(0);
   if((double)iVolume(NULL, 0, 1) < avg * 2.2) return(0);
   double c = iClose(NULL, 0, 1);
   double o = iOpen(NULL, 0, 1);
   if(dir > 0 && c > o) return(8);
   if(dir < 0 && c < o) return(8);
   return(0);
  }

int Chance(int base, int dir)
  {
   int p = base + SpikeBoost(dir);
   double c = iClose(NULL, 0, 1);
   double o = iOpen(NULL, 0, 1);
   if(dir > 0 && c > o) p += 6;
   if(dir < 0 && c < o) p += 6;
   if(p > 74) p = 74;
   if(p < 48) p = 48;
   return(p);
  }

void Fig(string title, int dir, int s1, double p1, int s2, double p2, double entry, double sl, double tp, int prob)
  {
   string id = IntegerToString(g_figN);
   g_figN++;
   color clr = (dir > 0 ? clrLime : clrTomato);
   if(s1 != s2) Trend("SLOINP_a" + id, s1, p1, s2, p2, clr);
   HLine("SLOINP_e" + id, entry, clrGold, title + " вход");
   HLine("SLOINP_s" + id, sl, clrTomato, "стоп");
   HLine("SLOINP_t" + id, tp, clrLime, "тейк");
   string way = (dir > 0 ? "Ждём вверх." : "Ждём вниз.");
   string txt = title + ". " + way + " Вход " + DoubleToStr(entry, Digits) + "  Стоп " + DoubleToStr(sl, Digits) + "  Тейк " + DoubleToStr(tp, Digits) + "  Вероятность " + IntegerToString(prob) + "%";
   int shift = s1;
   if(s2 < shift) shift = s2;
   if(shift < 1) shift = 1;
   Txt("SLOINP_x" + id, iTime(NULL, 0, shift), dir > 0 ? sl : tp, txt, clr);
  }

int g_hiS[16];
double g_hiP[16];
int g_loS[16];
double g_loP[16];
int g_nh = 0;
int g_nl = 0;

void Swings()
  {
   g_nh = 0;
   g_nl = 0;
   int i;
   for(i = 3; i < 90; i++)
     {
      bool hi = true;
      bool lo = true;
      double h = iHigh(NULL, 0, i);
      double l = iLow(NULL, 0, i);
      int k;
      for(k = 1; k <= 3; k++)
        {
         if(h <= iHigh(NULL, 0, i - k) || h < iHigh(NULL, 0, i + k)) hi = false;
         if(l >= iLow(NULL, 0, i - k) || l > iLow(NULL, 0, i + k)) lo = false;
        }
      if(hi && g_nh < 16) { g_hiS[g_nh] = i; g_hiP[g_nh] = h; g_nh++; }
      if(lo && g_nl < 16) { g_loS[g_nl] = i; g_loP[g_nl] = l; g_nl++; }
     }
  }

double LowBetween(int a, int b)
  {
   int from = a;
   int to = b;
   if(to < from) { int tmp = from; from = to; to = tmp; }
   double best = iLow(NULL, 0, from);
   int i;
   for(i = from; i <= to; i++)
     {
      double v = iLow(NULL, 0, i);
      if(v < best) best = v;
     }
   return(best);
  }

double HighBetween(int a, int b)
  {
   int from = a;
   int to = b;
   if(to < from) { int tmp = from; from = to; to = tmp; }
   double best = iHigh(NULL, 0, from);
   int i;
   for(i = from; i <= to; i++)
     {
      double v = iHigh(NULL, 0, i);
      if(v > best) best = v;
     }
   return(best);
  }

void DrawSpikes()
  {
   int n = 0;
   int i;
   for(i = 1; i <= 40 && n < 6; i++)
     {
      double avg = 0;
      int k;
      for(k = i + 1; k <= i + 20; k++) avg += (double)iVolume(NULL, 0, k);
      avg /= 20.0;
      double v = (double)iVolume(NULL, 0, i);
      if(avg <= 0 || v < avg * 2.2) continue;
      bool up = iClose(NULL, 0, i) >= iOpen(NULL, 0, i);
      string id = IntegerToString(n);
      string name = "SLOINP_v" + id;
      double price = up ? iLow(NULL, 0, i) : iHigh(NULL, 0, i);
      datetime t = iTime(NULL, 0, i);
      if(ObjectFind(0, name) < 0)
         ObjectCreate(0, name, OBJ_ARROW, 0, t, price);
      else ObjectMove(0, name, 0, t, price);
      ObjectSetInteger(0, name, OBJPROP_ARROWCODE, up ? 233 : 234);
      ObjectSetInteger(0, name, OBJPROP_COLOR, up ? clrAqua : clrOrange);
      ObjectSetInteger(0, name, OBJPROP_WIDTH, 2);
      ObjectSetInteger(0, name, OBJPROP_BACK, false);
      Txt("SLOINP_vt" + id, t, price, "всплеск", up ? clrAqua : clrOrange);
      n++;
     }
  }

void DrawFigs()
  {
   if(Bars < 50) return;
   WipeFigs();
   g_figN = 0;
   Swings();
   double pad = 8 * MarketInfo(Symbol(), MODE_POINT);
   if(g_nh >= 2)
     {
      double a = g_hiP[0];
      double b = g_hiP[1];
      double mid = (a + b) * 0.5;
      if(mid > 0 && MathAbs(a - b) / mid < 0.0025)
        {
         double neck = LowBetween(g_hiS[0], g_hiS[1]);
         double top = MathMax(a, b);
         double height = top - neck;
         if(height > pad)
           {
            Trend("SLOINP_dt", g_hiS[0], a, g_hiS[1], b, clrTomato);
            Fig("Двойная вершина", -1, g_hiS[0], a, g_hiS[0], a, neck, top + pad, neck - height, Chance(58, -1));
           }
        }
     }
   if(g_nl >= 2 && g_figN < 3)
     {
      double a = g_loP[0];
      double b = g_loP[1];
      double mid = (a + b) * 0.5;
      if(mid > 0 && MathAbs(a - b) / mid < 0.0025)
        {
         double neck = HighBetween(g_loS[0], g_loS[1]);
         double bot = MathMin(a, b);
         double height = neck - bot;
         if(height > pad)
           {
            Trend("SLOINP_db", g_loS[0], a, g_loS[1], b, clrLime);
            Fig("Двойное дно", 1, g_loS[0], a, g_loS[0], a, neck, bot - pad, neck + height, Chance(58, 1));
           }
        }
     }
   if(g_nh >= 2 && g_nl >= 2 && g_figN < 3)
     {
      double spanNow = MathAbs(g_hiP[0] - g_loP[0]);
      double spanOld = MathAbs(g_hiP[1] - g_loP[1]);
      bool tight = (spanOld > 0 && spanNow < spanOld * 0.92);
      if(tight && g_hiP[0] > g_hiP[1] && g_loP[0] > g_loP[1])
        {
         Trend("SLOINP_wu", g_hiS[1], g_hiP[1], g_hiS[0], g_hiP[0], clrOrange);
         Trend("SLOINP_wd", g_loS[1], g_loP[1], g_loS[0], g_loP[0], clrOrange);
         Fig("Восходящий клин", -1, g_hiS[0], g_hiP[0], g_loS[0], g_loP[0], g_loP[0], g_hiP[0] + pad, g_loP[0] - spanOld, Chance(56, -1));
        }
      else if(tight && g_hiP[0] < g_hiP[1] && g_loP[0] < g_loP[1])
        {
         Trend("SLOINP_wu", g_hiS[1], g_hiP[1], g_hiS[0], g_hiP[0], clrAqua);
         Trend("SLOINP_wd", g_loS[1], g_loP[1], g_loS[0], g_loP[0], clrAqua);
         Fig("Нисходящий клин", 1, g_hiS[0], g_hiP[0], g_loS[0], g_loP[0], g_hiP[0], g_loP[0] - pad, g_hiP[0] + spanOld, Chance(56, 1));
        }
     }
   if(g_figN < 3)
     {
      double begin = iClose(NULL, 0, 24);
      double end = iClose(NULL, 0, 8);
      double move = end - begin;
      double atr = 0;
      int k;
      for(k = 1; k <= 14; k++) atr += iHigh(NULL, 0, k) - iLow(NULL, 0, k);
      atr /= 14.0;
      double flagH = iHigh(NULL, 0, iHighest(NULL, 0, MODE_HIGH, 7, 1));
      double flagL = iLow(NULL, 0, iLowest(NULL, 0, MODE_LOW, 7, 1));
      if(atr > 0 && MathAbs(move) > atr * 2.0 && (flagH - flagL) < MathAbs(move) * 0.45)
        {
         int dir = (move > 0 ? 1 : -1);
         double entry = (dir > 0 ? flagH : flagL);
         double sl = (dir > 0 ? flagL - pad : flagH + pad);
         double tp = entry + move;
         Fig(dir > 0 ? "Флаг вверх" : "Флаг вниз", dir, 8, end, 1, entry, entry, sl, tp, Chance(54, dir));
        }
     }
   DrawSpikes();
  }
//+------------------------------------------------------------------+
