export interface IndexData {
  index: string;
  name: string;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  updatedAt: string;
}

export interface StockData {
  stockId: string;
  name: string;
  close: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  pe?: number;
  pb?: number;
  yield?: number;
  recommendation: 'strong_buy' | 'buy' | 'hold' | 'sell';
  score: number;
  sector: string;
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  time: string;
  category: string;
  sentiment: 'positive' | 'neutral' | 'negative';
}

export interface SectorData {
  name: string;
  change: number;
  topStock: string;
  volume: number;
  momentum: 'hot' | 'warm' | 'cool';
}
