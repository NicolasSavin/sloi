import type { NewsArticle } from "@/lib/news";

export interface HomeQuote {
  id: string;
  label: string;
  price: number;
  changePct: number;
  spark: number[];
  decimals: number;
  art: string;
}

export interface HomePayload {
  quotes: HomeQuote[];
  news: NewsArticle[];
  source: string;
}
