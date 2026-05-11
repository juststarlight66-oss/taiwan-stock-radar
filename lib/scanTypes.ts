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
  entry?:       number;
  entry_low?:   number;
  entry_high?:  number;
  target?:      number;    // 相容舊欄位，同 target1
  target1?:     number;
  target2?:     number;
  target3?:     number;
  target_note?: string;
  stop_loss?:   number;
  upside?:      number;
  upside2?:     number;
  upside3?:     number;
  downside?:    number;
  atr?:         number;
  recommendation?: string;
}

export interface StockNarrative {
  technical:   string;
  chips:       string;
  fundamental: string;
  risk:        string;
  action:      string;
}

export interface ScanStock {
  // ── 主要欄位（latest.json 平坦格式）──
  stock_id:    string;
  stock_name?: string;   // latest.json 用 stock_name
  name?:       string;   // 舊格式相容
  sector_name?: string;  // latest.json 用 sector_name
  sector?:     string;   // 舊格式相容
  close?:      number;
  change_pct?: number;
  total_score: number;
  technical_score?:   number;
  chips_score?:       number;
  fundamental_score?: number;
  news_score?:        number;
  sentiment_score?:   number;
  sector_boost?:      number;
  power_combo?:       boolean;
  recommendation?:    string;  // 頂層直接有（不在 strategy 巢狀內）
  reason?:            string;  // AI 分析文字（頂層）
  entry_low?:         number;  // 頂層進場低點
  entry_high?:        number;  // 頂層進場高點
  stop_loss?:         number;  // 頂層停損
  target1?:           number;
  target2?:           number;
  target3?:           number;
  hold_days?:         string;
  position?:          string;
  max_loss_per_lot?:  number;
  volume?:            number;
  rsi?:               number;
  vol_ratio?:         number;
  // ── 巢狀結構（舊格式相容）──
  dimensions?: ScanDimensions;
  signals?:    ScanSignals;
  details?:    { rsi?: number; vol_ratio?: number; pe?: number; [key: string]: unknown };
  strategy?:   ScanStrategy;
  narrative?:  StockNarrative;
}

// ── ScanResult：每日掃描主結果格式 ──
export interface ScanResult {
  scan_date:     string;
  scanned_count: number;
  top10:         ScanStock[];
  total_stocks?: number;
  market_trend?: string;
  trend_label?:  string;
  bull_ratio?:   number;
}

// ── 輔助函式：統一取值（相容平坦 & 巢狀兩種格式）──
export function getStockName(s: ScanStock): string {
  return s.stock_name ?? s.name ?? s.stock_id;
}
export function getStockSector(s: ScanStock): string {
  return s.sector_name ?? s.sector ?? '—';
}
export function getStockClose(s: ScanStock): number | undefined {
  return s.close;
}
export function getStockChangePct(s: ScanStock): number | undefined {
  return s.change_pct;
}
export function getStockRecommendation(s: ScanStock): string | undefined {
  return s.recommendation ?? s.strategy?.recommendation;
}
export function getStockReason(s: ScanStock): string | undefined {
  return s.reason ?? undefined;
}
export function getStockEntryLow(s: ScanStock): number | undefined {
  return s.entry_low ?? s.strategy?.entry_low ?? s.strategy?.entry;
}
export function getStockEntryHigh(s: ScanStock): number | undefined {
  return s.entry_high ?? s.strategy?.entry_high ?? s.strategy?.entry;
}
export function getStockStopLoss(s: ScanStock): number | undefined {
  return s.stop_loss ?? s.strategy?.stop_loss;
}
export function getStockTarget1(s: ScanStock): number | undefined {
  return s.target1 ?? s.strategy?.target1 ?? s.strategy?.target;
}
export function getStockTarget2(s: ScanStock): number | undefined {
  return s.target2 ?? s.strategy?.target2;
}
export function getStockTarget3(s: ScanStock): number | undefined {
  return s.target3 ?? s.strategy?.target3;
}
export function getStockDimensions(s: ScanStock): ScanDimensions {
  if (s.dimensions) return s.dimensions;
  return {
    technical:   s.technical_score   ?? 0,
    fundamental: s.fundamental_score ?? 0,
    news:        s.news_score        ?? 0,
    sentiment:   s.sentiment_score   ?? 0,
    chips:       s.chips_score       ?? 0,
  };
}
export function getStockSignals(s: ScanStock): ScanSignals {
  return s.signals ?? { technical: [], fundamental: [], news: [], sentiment: [], chips: [] };
}
