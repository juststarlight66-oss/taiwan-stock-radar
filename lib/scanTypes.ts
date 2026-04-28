export interface ScanResult {
  scan_date: string;
  scan_start: string;
  scanned_count: number;
  total_stocks: number;
  top10: ScanStock[];
  all_results: ScanStock[];
  explosive_top5: ScanStock[];
}

export interface ScanStock {
  stock_id: string;
  name: string;
  sector: string;
  close: number;
  change_pct: number;
  total_score: number;
  rsi: number;
  vol_ratio: number;
  dimensions: {
    technical: number;
    chips: number;
    fundamental: number;
    news: number;
    sentiment: number;
  };
  signals: {
    technical: string[];
    chips: string[];
    fundamental: string[];
    news: string[];
    sentiment: string[];
  };
  details: {
    rsi: number;
    vol_ratio: number;
    ma_spread?: number;
    pe?: number;
    gross_margin?: number;
    turnover?: number;
  };
  strategy: {
    entry: number;
    target: number;
    stop_loss: number;
    upside: number;
    downside: number;
    recommendation: string;
  };
}
