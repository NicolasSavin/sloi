//+------------------------------------------------------------------+
//| SLOI_Note.mq4                                                    |
//| Только приказы из заметок и с графика сайта. Сам рынок не считает.|
//+------------------------------------------------------------------+
#property copyright "SLOI"
#property link      ""
#property version   "1.00"
#property strict
#property description "SLOI Note 1.00: заметка и график сайта. Один график, любая пара из приказа."

input string SignalsUrl = "https://sloi-kohl.vercel.app/api/signals.txt";
input string DeskKey    = "";
input string Suffix     = ".cs";
input double Lots       = 0.10;
input int    Slippage   = 30;
input int    MagicNote  = 88046;

string   g_done = "";
string   g_note = "жду ключ";
datetime g_poll = 0;

int OnInit()
  {
   EventSetTimer(2);
   LoadDone();
   Paint();
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   ObjectDelete(0, "SLOIN_bg");
   ObjectDelete(0, "SLOIN_tx");
  }

void OnTimer()
  {
   Poll();
   Paint();
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
   ObjectSetInteger(0, "SLOIN_bg", OBJPROP_XSIZE, 420);
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
  }
//+------------------------------------------------------------------+
