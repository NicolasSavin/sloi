//+------------------------------------------------------------------+
//| SLOI_Lead.mq4                                                    |
//| Отдельный сов. M15. TradingView уже развернулся, брокер ещё нет. |
//| Один график, все пары. Магия другая, стол SLOI_Desk не трогает.  |
//+------------------------------------------------------------------+
#property copyright "SLOI"
#property version   "1.02"
#property strict

input string TvUrl            = "https://sloi-kohl.vercel.app/api/tv15.txt";
input string WatchList        = "EURUSD,GBPUSD,USDJPY,USDCHF,AUDUSD,USDCAD,NZDUSD,EURGBP,EURJPY,GBPJPY,AUDJPY,CADJPY,NZDJPY,EURCHF,EURAUD,GBPAUD,XAUUSD,XAGUSD,XTIUSD,XBRUSD";
input string BrokerSuffix     = ".cs";
input int    WorkTF            = 15;
input double Lots              = 0.01;
input int    Magic             = 220827;
input int    SlippagePoints    = 30;
input int    MaxSpreadPoints   = 80;
input bool   AutoTrade         = true;

string   g_feed = "";
datetime g_feedAt = 0;
string   g_note = "старт";
string   g_sym[];
string   g_naked[];
datetime g_bar[];
double   g_tvO[];
double   g_tvC[];
int      g_n = 0;

int PeriodOf()
  {
   if(WorkTF <= 5) return(PERIOD_M5);
   if(WorkTF <= 15) return(PERIOD_M15);
   if(WorkTF <= 30) return(PERIOD_M30);
   if(WorkTF <= 60) return(PERIOD_H1);
   return(PERIOD_M15);
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
   ArrayResize(g_tvO, n);
   ArrayResize(g_tvC, n);
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
      g_tvO[g_n] = 0;
      g_tvC[g_n] = 0;
      g_n++;
     }
  }

int OnInit()
  {
   EventSetTimer(2);
   ParseWatch();
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   Comment("");
  }

double PipOf(string s)
  {
   double pt = MarketInfo(s, MODE_POINT);
   int d = (int)MarketInfo(s, MODE_DIGITS);
   if(d == 3 || d == 5) return(pt * 10.0);
   return(pt);
  }

int SpreadPt(string s)
  {
   return((int)MarketInfo(s, MODE_SPREAD));
  }

bool TvOf(string naked, double &op, double &cl)
  {
   op = 0;
   cl = 0;
   string lines[];
   int n = StringSplit(g_feed, '\n', lines);
   for(int i = 0; i < n; i++)
     {
      string line = lines[i];
      StringTrimLeft(line);
      StringTrimRight(line);
      if(StringLen(line) < 5 || StringGetCharacter(line, 0) == '#') continue;
      string p[];
      if(StringSplit(line, ' ', p) < 3) continue;
      if(p[0] != naked) continue;
      op = StringToDouble(p[1]);
      cl = StringToDouble(p[2]);
      return(op > 0 && cl > 0);
     }
   return(false);
  }

int CountMine(string s)
  {
   int n = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderMagicNumber() != Magic) continue;
      if(OrderSymbol() != s) continue;
      n++;
     }
   return(n);
  }

void Pull()
  {
   if(TimeCurrent() - g_feedAt < 20) return;
   g_feedAt = TimeCurrent();
   char data[];
   char result[];
   string hdr = "User-Agent: Mozilla/5.0\r\nAccept: text/plain,*/*\r\n";
   string rh = "";
   ArrayResize(data, 0);
   ResetLastError();
   int res = WebRequest("GET", TvUrl, hdr, 12000, data, result, rh);
   if(res != 200)
     {
      g_note = "нет TV " + IntegerToString(GetLastError());
      return;
     }
   g_feed = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   g_note = (StringFind(g_feed, "EURUSD") >= 0 ? "TV 15 ок" : "пустая лента");
  }

double AvgVol(string s, int tf, int from)
  {
   double sum = 0;
   int k = 0;
   for(int b = from; b < from + 12; b++)
     {
      double v = iVolume(s, tf, b);
      if(v <= 0) continue;
      sum += v;
      k++;
     }
   if(k == 0) return(0);
   return(sum / k);
  }

void CloseMine(string s)
  {
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderMagicNumber() != Magic || OrderSymbol() != s) continue;
      if(OrderType() != OP_BUY && OrderType() != OP_SELL) continue;
      double px = (OrderType() == OP_BUY) ? MarketInfo(s, MODE_BID) : MarketInfo(s, MODE_ASK);
      if(!OrderClose(OrderTicket(), OrderLots(), px, SlippagePoints, clrYellow))
         Print("SLOI lead close ", s, " ", GetLastError());
     }
  }

void Guard(int i)
  {
   string s = g_sym[i];
   if(CountMine(s) == 0) return;
   int tf = PeriodOf();
   double avg = AvgVol(s, tf, 1);
   if(avg <= 0 || iVolume(s, tf, 0) < avg) return;
   double o = iOpen(s, tf, 0);
   double bid = MarketInfo(s, MODE_BID);
   double ask = MarketInfo(s, MODE_ASK);
   if(o <= 0 || bid <= 0 || ask <= 0) return;
   for(int k = OrdersTotal() - 1; k >= 0; k--)
     {
      if(!OrderSelect(k, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderMagicNumber() != Magic || OrderSymbol() != s) continue;
      bool against = (OrderType() == OP_SELL && bid > o) || (OrderType() == OP_BUY && ask < o);
      if(!against) continue;
      CloseMine(s);
      Alert("SLOI lead объём против ", s);
      return;
     }
  }

void Remember(int i)
  {
   double op, cl;
   if(!TvOf(g_naked[i], op, cl)) return;
   g_tvO[i] = op;
   g_tvC[i] = cl;
  }

void AtBirth(int i)
  {
   string s = g_sym[i];
   if(CountMine(s) > 0) return;
   int sp = SpreadPt(s);
   if(sp <= 0 || sp > MaxSpreadPoints) return;
   double op = g_tvO[i];
   double cl = g_tvC[i];
   if(op <= 0 || cl <= 0) return;
   int tf = PeriodOf();
   double brO = iOpen(s, tf, 1);
   double brC = iClose(s, tf, 1);
   if(brO <= 0 || brC <= 0) return;
   double bid = MarketInfo(s, MODE_BID);
   double ask = MarketInfo(s, MODE_ASK);
   if(bid <= 0 || ask <= 0) return;
   double spread = ask - bid;
   double pip = PipOf(s);
   double room = MathAbs(op - cl);
   if(room < spread + pip) return;
   bool tvDown = (cl < op);
   bool tvUp = (cl > op);
   bool siteUp = (brC > brO);
   bool siteDown = (brC < brO);
   double avg = AvgVol(s, tf, 2);
   if(avg <= 0 || iVolume(s, tf, 1) < avg * 1.2) return;
   int dir = 0;
   if(tvDown && siteUp) dir = -1;
   else if(tvUp && siteDown) dir = 1;
   else return;
   double take = MathMin(room, spread + pip * 8.0);
   if(take < spread + pip) return;
   double px = (dir > 0 ? ask : bid);
   int digits = (int)MarketInfo(s, MODE_DIGITS);
   double pt = MarketInfo(s, MODE_POINT);
   double need = MathMax(MarketInfo(s, MODE_STOPLEVEL) * pt, spread * 1.15);
   if(take < need) return;
   double sl = NormalizeDouble(dir > 0 ? px - take : px + take, digits);
   double tp = NormalizeDouble(dir > 0 ? px + take : px - take, digits);
   int cmd = (dir > 0 ? OP_BUY : OP_SELL);
   int ticket = OrderSend(s, cmd, Lots, px, SlippagePoints, sl, tp, "SLOI lead", Magic, 0, dir > 0 ? clrLime : clrTomato);
   if(ticket > 0) Alert("SLOI lead ", (dir > 0 ? "BUY " : "SELL "), s);
   else Print("SLOI lead ", s, " err ", GetLastError());
  }

void Trade()
  {
   if(!AutoTrade) return;
   int tf = PeriodOf();
   for(int i = 0; i < g_n; i++)
     {
      datetime bar = iTime(g_sym[i], tf, 0);
      if(bar <= 0) continue;
      Guard(i);
      if(g_bar[i] == 0)
        {
         g_bar[i] = bar;
         Remember(i);
         continue;
        }
      if(bar != g_bar[i])
        {
         AtBirth(i);
         g_bar[i] = bar;
        }
      Remember(i);
     }
  }

void OnTimer()
  {
   Pull();
   Trade();
   Comment("SLOI Lead 1.02  M", WorkTF, "  ", g_note, "  пар ", g_n, "\n",
           "Вход на новой свече, только если закрытая была с объёмом. Сильный объём против — выход.");
  }
