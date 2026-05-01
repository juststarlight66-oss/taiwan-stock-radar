// Scan result types matching the 2255 daily scan output

export interface ScanDimensions {
  technical:   number;  // 0-40
  fundamental: number;  // 0-40
  news:        number;  // 0-10
  sentiment:   number;  // 0-10
  chips:       number;  // 0-10
}

export interface ScanSignals {
  technical:   string[];
  fundamental: string[];
  news:        string[];
  sentiment:   string[];
  chips:       string[];
}

export interface ScanStrategy {
  entry:        number;
  target:       number;    // 相容舊欄位，同 target1
  target1?:     number;    // 第一關：60日前高 or 布林上軌
  target2?:     number;    // 第二關：target1 × 1.15
  target3?:     number;    // 第三關：target1 × 1.35
  target_note?: string;    // 基準說明（60日前高 / 布林上軌 / 動態基準）
  stop_loss:    number;
  upside:       number;    // target1 vs entry 漲幅%
  upside2?:     number;    // target2 vs entry 漲幅%
  upside3?:     number;    // target3 vs entry 漲幅%
  downside:     number;
  atr?:         number;    // 14日 ATR 絕對值
  recommendation: string;
}

export interface ScanStock {
  stock_id:    string;
  name:        string;
  sector:      string;
  close:       number;
  change_pct?: number;
  total_score: number;
  rsi?:        number;
  vol_ratio?:  number;
  dimensions?: ScanDimensions;
  signals?:    ScanSignals;
  details?:    Record<string, unknown>;
  strategy?:   ScanStrategy;
}

export interface ScanResult {
  scan_date:     string;
  scanned_count?: number;
  top10:         ScanStock[];
}

export const DIMENSION_CONFIG: Record<
  keyof ScanDimensions,
  { label: string; max: number; color: string }
> = {
  technical:   { label: '技術面', max: 40, color: 'sky' },
  fundamental: { label: '基本面', max: 40, color: 'emerald' },
  news:        { label: '消息面', max: 10, color: 'violet' },
  sentiment:   { label: '市場情緒', max: 10, color: 'amber' },
  chips:       { label: '籌碼面', max: 10, color: 'rose' },
};
