// Scan result types matching the 2255 daily scan output

export interface ScanDimensions {
  technical: number;
  chips: number;
  fundamental: number;
  news: number;
  sentiment: number;
}

export interface ScanSignals {
  technical: string[];
  chips: string[];
  fundamental: string[];
  news: string[];
  sentiment: string[];
}

export interface ScanDetails {
  rsi: number;
  vol_ratio: number;
  vol_ratio_5?: number;
  ma_spread?: number;
  ma_arrangement?: number;
  pe?: number;
  pb?: number;
  dy?: number;
  gross_margin?: number;
  turnover?: number;
  sector?: string;
  industry_score?: number;
  earnings_score?: number;
  us_linkage_score?: number;
  sub_scores?: Record<string, number>;
  price_volume?: string;
  main_force?: string;
  near_60d_high?: number;
}

export interface ScanStrategy {
  entry: number;
  target: number;
  stop_loss: number;
  upside: number;
  downside: number;
  recommendation: string;
}

export interface ScanStock {
  stock_id: string;
  name: string;
  sector: string;
  close: number;
  change_pct: number;
  total_score: number;
  /** rsi at top-level is present on on-demand scans; for daily scans use details.rsi */
  rsi?: number;
  /** vol_ratio at top-level is present on on-demand scans; for daily scans use details.vol_ratio */
  vol_ratio?: number;
  dimensions: ScanDimensions;
  signals: ScanSignals;
  details: ScanDetails;
  strategy: ScanStrategy;
  price?: number;
  grade?: string;
  grade_reason?: string;
  watchlist_note?: string;
  is_explosive?: boolean;
  explosive_note?: string;
  surge_probability?: number;
  features?: Record<string, unknown>;
  ml_signals?: string[];
  backtest_summary?: {
    best_strategy?: string;
    win_rate?: number;
    profit_factor?: number;
    sharpe?: number;
    max_drawdown?: number;
    best_entry_signal?: string;
    stop_loss_pct?: number;
    take_profit_pct?: number;
  };
}

export interface ScanResult {
  scan_date: string;
  scan_start?: string;
  scan_elapsed_sec?: number;
  scanned_count: number;
  total_stocks?: number;
  top10: ScanStock[];
  all_results?: ScanStock[];
  explosive_top5?: ScanStock[];
}

// Dimension labels & max scores (v2 model — matched to actual scan engine output)
// technical: raw score 0-40 (5 sub-components x 8pts each)
// chips:     raw score 0-10
// fundamental: raw score 0-40 (5 sub-components x 8pts each)
// news:      raw score 0-10 (normalised weighted composite)
// sentiment: raw score 0-10
export const DIMENSION_CONFIG = {
  technical:   { label: '技術面', labelEn: 'Technical',   max: 40, color: '#38bdf8' },
  chips:       { label: '籌碼面', labelEn: 'Chips',       max: 10, color: '#a78bfa' },
  fundamental: { label: '基本面', labelEn: 'Fundamental', max: 40, color: '#34d399' },
  news:        { label: '消息面', labelEn: 'News',        max: 10, color: '#fbbf24' },
  sentiment:   { label: '情緒面', labelEn: 'Sentiment',   max: 10, color: '#f87171' },
} as const;

export type DimensionKey = keyof typeof DIMENSION_CONFIG;

export function getScoreColor(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.8) return 'text-emerald-400';
  if (pct >= 0.6) return 'text-sky-400';
  if (pct >= 0.4) return 'text-amber-400';
  return 'text-red-400';
}

export function getActionColor(action: string): string {
  if (action.includes('強力') || action.includes('積極')) return 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40';
  if (action.includes('買進') || action.includes('買入')) return 'text-sky-300 bg-sky-500/15 border-sky-500/40';
  if (action.includes('觀望') || action.includes('持有')) return 'text-amber-300 bg-amber-500/15 border-amber-500/40';
  return 'text-red-300 bg-red-500/15 border-red-500/40';
}
