// Scan result types matching the 2255 daily scan output

export interface ScanDimensions {
  technical:   number;  // 0-100 (v7+ 五維評分 scale)
  fundamental: number;  // 0-100
  news:        number;  // 0-100
  sentiment:   number;  // 0-100
  chips:       number;  // 0-100
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
  // ── 巢狀 scores（scan_market.py v7+ 格式：{technical, chips, fundamental, news, sentiment, total}）──
  scores?:       ScanDimensions;
  sector_boost?:      number;
  power_combo?:       boolean;
  recommendation?:    string;
  reason?:            string;
  entry_low?:         number;
  entry_high?:        number;
  stop_loss?:         number;
  target1?:           number;
  target2?:           number;
  target3?:           number;
  hold_days?:         string;
  position?:          string;
  max_loss_per_lot?:  number;
  targets?:           { t1?: number; t2?: number; t3?: number; stop_loss?: number };
  volume?:            number;
  rsi?:               number;
  vol_ratio?:         number;
  market?:            string;
  // ── 巢狀結構（舊格式相容）──
  dimensions?: ScanDimensions;
  signals?:    ScanSignals;
  details?:    { rsi?: number; vol_ratio?: number; pe?: number; [key: string]: unknown };
  strategy?:   ScanStrategy;
  narrative?:  StockNarrative;
}

// ML 爆漲預測項目
export interface ExplodePredictStock {
  stock_id: string;
  name?: string;
  stock_name?: string;
  explode_prob: number;  // 0-1, 爆漲機率
  total_score?: number;
  recommendation?: string;
  close?: number;
  change_pct?: number;
}

// ── ScanResult：每日掃描主結果格式 ──
export interface ScanResult {
  scan_date:     string;
  scanned_count: number;
  top10?:        ScanStock[];
  top_stocks?:   ScanStock[];
  explode_top5?: ExplodePredictStock[];
  total_stocks?: number;
  market_trend?: string;
  trend_label?:  string;
  bull_ratio?:   number;
}

// ── DIMENSION_CONFIG：各維度設定（SelfCheck 等元件使用）──
export const DIMENSION_CONFIG: Record<string, { label: string; max: number; color: string }> = {
  technical:   { label: '技術面',  max: 100, color: '#38bdf8' },
  fundamental: { label: '基本面',  max: 100, color: '#34d399' },
  chips:       { label: '籌碼面',  max: 100, color: '#f87171' },
  news:        { label: '消息面',  max: 100, color: '#f59e0b' },
  sentiment:   { label: '市場情緒', max: 100, color: '#a78bfa' },
};

// ── 輔助函式：統一取值（相容平坦 & 巢狀兩種格式）──
export function getStockName(s: ScanStock): string {
  return s.stock_name ?? s.name ?? s.stock_id;
}

export function getStockSector(s: ScanStock): string {
  const sector = s.sector_name ?? s.sector;
  if (sector) return sector;
  if (s.market === 'TSE') return '上市';
  if (s.market === 'OTC') return '上櫃';
  if (s.market === 'ESB') return '興櫃';
  return '—';
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
  return s.target1 ?? s.strategy?.target1 ?? s.strategy?.target ?? s.targets?.t1;
}

export function getStockTarget2(s: ScanStock): number | undefined {
  return s.target2 ?? s.strategy?.target2 ?? s.targets?.t2;
}

export function getStockTarget3(s: ScanStock): number | undefined {
  return s.target3 ?? s.strategy?.target3 ?? s.targets?.t3;
}

export function getStockDimensions(s: ScanStock): ScanDimensions {
  const extract = (val: unknown): number => {
    if (typeof val === 'number') return val;
    if (val && typeof val === 'object' && 'score' in val) return Number((val as { score: unknown }).score) || 0;
    return 0;
  };
  // v7+ 格式：scores 巢狀物件 (scan_market.py 輸出)
  if (s.scores) {
    return {
      technical:   s.scores.technical   ?? 0,
      fundamental: s.scores.fundamental ?? 0,
      news:        s.scores.news        ?? 0,
      sentiment:   s.scores.sentiment   ?? 0,
      chips:       s.scores.chips       ?? 0,
    };
  }
  // dimensions: may be flat numbers, or {score,signal} nested objects (old format)
  if (s.dimensions) {
    return {
      technical:   extract(s.dimensions.technical),
      fundamental: extract(s.dimensions.fundamental),
      news:        extract(s.dimensions.news),
      sentiment:   extract(s.dimensions.sentiment),
      chips:       extract(s.dimensions.chips),
    };
  }
  return {
    technical:   s.technical_score   ?? 0,
    fundamental: s.fundamental_score ?? 0,
    news:        s.news_score        ?? 0,
    sentiment:   s.sentiment_score   ?? 0,
    chips:       s.chips_score       ?? 0,
  };
}

export function getStockUpside(s: ScanStock): number | undefined {
  return s.strategy?.upside;
}

export function getStockDownside(s: ScanStock): number | undefined {
  return s.strategy?.downside;
}
