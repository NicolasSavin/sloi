//+------------------------------------------------------------------+
//| SLOI_TickFvg.mqh — тиковый имбаланс с bid брокера                |
//+------------------------------------------------------------------+
#ifndef SLOI_TICKFVG_MQH
#define SLOI_TICKFVG_MQH

#define TICKFVG_MAX 12

double   g_lastBid_tf[32];
double   g_tf_lo[32][TICKFVG_MAX];
double   g_tf_hi[32][TICKFVG_MAX];
int      g_tf_dir[32][TICKFVG_MAX];
datetime g_tf_t[32][TICKFVG_MAX];
int      g_tf_n[32];
int      g_tf_w[32];

void TickFvgInit()
  {
   ArrayInitialize(g_lastBid_tf, 0);
   for(int zi = 0; zi < 32; zi++) { g_tf_n[zi] = 0; g_tf_w[zi] = 0; }
  }

void PushTickFvgZone(int i, int dir, double lo, double hi, string sym)
  {
   if(i < 0 || i >= 32) return;
   if(hi <= lo) return;
   double pt = MarketInfo(sym, MODE_POINT);
   if(pt <= 0) pt = 0.00001;
   for(int k = 0; k < g_tf_n[i] && k < TICKFVG_MAX; k++)
     {
      if(g_tf_dir[i][k] != dir) continue;
      double mid = 0.5 * (lo + hi);
      double mid2 = 0.5 * (g_tf_lo[i][k] + g_tf_hi[i][k]);
      if(MathAbs(mid - mid2) < 8.0 * pt) return;
     }
   int w = g_tf_w[i] % TICKFVG_MAX;
   g_tf_lo[i][w] = lo;
   g_tf_hi[i][w] = hi;
   g_tf_dir[i][w] = dir;
   g_tf_t[i][w] = TimeCurrent();
   g_tf_w[i]++;
   if(g_tf_n[i] < TICKFVG_MAX) g_tf_n[i]++;
  }

void MarkTickFvgFill(int i, double bid)
  {
   for(int k = 0; k < g_tf_n[i] && k < TICKFVG_MAX; k++)
     {
      if(g_tf_dir[i][k] == 0) continue;
      if(bid >= g_tf_lo[i][k] && bid <= g_tf_hi[i][k])
         g_tf_dir[i][k] = 0;
     }
  }

void SampleTickImbalance(int nSym, string &syms[], bool enabled, double mult, int minPts)
  {
   if(!enabled) return;
   for(int i = 0; i < nSym; i++)
     {
      string s = syms[i];
      double b = MarketInfo(s, MODE_BID);
      if(b <= 0) continue;
      if(g_lastBid_tf[i] > 0)
        {
         double gap = b - g_lastBid_tf[i];
         double pt = MarketInfo(s, MODE_POINT);
         if(pt <= 0) pt = 0.00001;
         double spr = MarketInfo(s, MODE_SPREAD) * pt;
         if(spr <= 0) spr = pt * 10.0;
         double need = MathMax(spr * mult, minPts * pt);
         if(MathAbs(gap) >= need)
           {
            if(gap > 0) PushTickFvgZone(i, 1, g_lastBid_tf[i], b, s);
            else        PushTickFvgZone(i, -1, b, g_lastBid_tf[i], s);
           }
         MarkTickFvgFill(i, b);
        }
      g_lastBid_tf[i] = b;
     }
  }

void AppendTickFvgBody(string &body, int nSym, string &syms[])
  {
   for(int i = 0; i < nSym; i++)
     {
      for(int k = 0; k < g_tf_n[i] && k < TICKFVG_MAX; k++)
        {
         if(g_tf_dir[i][k] == 0) continue;
         string side = (g_tf_dir[i][k] > 0 ? "DEMAND" : "SUPPLY");
         int dig = (int)MarketInfo(syms[i], MODE_DIGITS);
         body += "TICKFVG " + syms[i] + " " + side + " "
              + DoubleToStr(g_tf_lo[i][k], dig) + " "
              + DoubleToStr(g_tf_hi[i][k], dig) + " "
              + IntegerToString((int)g_tf_t[i][k]) + "\n";
        }
     }
  }

#endif
