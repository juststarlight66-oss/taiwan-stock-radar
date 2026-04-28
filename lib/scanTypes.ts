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
  ma_spread?: number;
  pe?: number;
  gross_margin?: number;
  turnover?: number;
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
  rsi: number;
  vol_ratio: number;
  dimensions: ScanDimensions;
  signals: ScanSignals;
  details: ScanDetails;
  strategy: ScanStrategy;
  price?: number;
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

// Dimension labels & max scores (v2 model)
export const DIMENSION_CONFIG = {
  technical:   { label: '技術面', labelEn: 'Technical',   max: 25, color: '#38bdf8' },
  chips:       { label: '籌碼面', labelEn: 'Chips',       max: 10, color: '#a78bfa' },
  fundamental: { label: '基本面', labelEn: 'Fundamental', max: 40, color: '#34d399' },
  news:        { label: '消息面', labelEn: 'News',        max: 32, color: '#fbbf24' },
  sentiment:   { label: '情緒面', labelEn: 'Sentiment',   max: 12, color: '#f87171' },
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
