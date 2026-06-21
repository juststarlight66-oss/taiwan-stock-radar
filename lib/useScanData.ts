'use client';
import useSWR from 'swr';
import { useState, useCallback } from 'react';
import { ScanResult, ScanStock, ScanDimensions, ScanSignals } from './scanTypes';

export type { ScanResult, ScanStock, ScanDimensions, ScanSignals };

export interface AllScoreHistoryEntry {
  date: string;
  stocks: Array<{ stock_id: string; total_score: number }>;
}

export interface AllScoresData {
  scan_date: string;
  scanned_count: number;
  history?: AllScoreHistoryEntry[];
  all_stock_scores?: ScanStock[]; stocks?: ScanStock[];
}

const BASE = '/taiwan-stock-radar';

const fetcher = async (url: string) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
  
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Fetch timeout for ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const swrConfig = {
  refreshInterval: 0,
  revalidateOnFocus: false,
  errorRetryCount: 2,
};

export function useLatestScan() {
  const { data, error, isLoading } = useSWR<ScanResult>(
    `${BASE}/data/latest.json`,
    fetcher,
    swrConfig
  );
  // Normalize stocks so downstream components always get clean ScanStock objects
  if (data) {
    const topStocks = (data.top10 ?? data.top_stocks ?? []).map(normalizeStock);
    return {
      data: {
        ...data,
        top10: topStocks,
        top_stocks: topStocks,
        explode_top5: (data.explode_top5 ?? []).map(normalizeStock),
      } as ScanResult,
      error,
      isLoading,
    };
  }
  return { data, error, isLoading };
}

export function useDateScan(date: string | null) {
  const key = date ? `${BASE}/data/scan_result_${date.replace(/-/g, '')}.json` : null;
  const { data, error, isLoading } = useSWR<ScanResult>(key, fetcher, swrConfig);
  return { data, error, isLoading };
}

export function useHistoryIndex() {
  const { data, error, isLoading } = useSWR<{ available_dates: string[] }>(
    `${BASE}/data/index.json`,
    fetcher,
    swrConfig
  );
  return { dates: data?.available_dates ?? [], error, isLoading };
}

function inferSector(stockId: string): string {
  const id = parseInt(stockId, 10);
  if (id >= 1000 && id <= 1999) return '\u6c34\u6ce5';
  if (id >= 2000 && id <= 2099) return '\u98df\u54c1';
  if (id >= 2100 && id <= 2199) return '\u5869\u819a';
  if (id >= 2300 && id <= 2399) return '\u96fb\u5b50';
  if (id >= 2400 && id <= 2499) return '\u534a\u5c0e\u9ad4';
  if (id >= 2500 && id <= 2599) return '\u96fb\u8166\u5468\u908a';
  if (id >= 2600 && id <= 2699) return '\u901a\u4fe1\u7db2\u8def';
  if (id >= 2800 && id <= 2899) return '\u91d1\u878d';
  if (id >= 3000 && id <= 3999) return '\u5176\u4ed6\u96fb\u5b50';
  if (id >= 4000 && id <= 4999) return '\u5efa\u6750\u71df\u9020';
  if (id >= 5000 && id <= 5999) return '\u822a\u904b';
  if (id >= 6000 && id <= 6999) return '\u96fb\u5b50\u96f6\u7d44\u4ef6';
  if (id >= 8000 && id <= 8999) return '\u751f\u6280\u91ab\u7642';
  return '\u5176\u4ed6';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractDimValue(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'object' && 'score' in val) return Number(val.score) || 0;
  return 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeStock(s: any): ScanStock {
  const rawEntryLow = s.entry_low ?? s.strategy?.entry_low ?? (s.strategy?.entry ?? undefined) ?? (s.targets?.entry_low ?? undefined);
  const rawEntryHigh = s.entry_high ?? s.strategy?.entry_high ?? (s.strategy?.entry ?? undefined) ?? (s.targets?.entry_high ?? undefined);
  const rawStopLoss = s.stop_loss ?? s.strategy?.stop_loss ?? (s.targets?.stop_loss ?? undefined);
  
  // Derive targets: prefer flat > strategy > targets > target_price old format
  const t1 = s.target1 ?? s.strategy?.target1 ?? s.strategy?.target ?? s.targets?.t1;
  const t2 = s.target2 ?? s.strategy?.target2 ?? s.targets?.t2;
  const t3 = s.target3 ?? s.strategy?.target3 ?? s.targets?.t3;
  // Old format has single target_price — derive t1/t2/t3 from it
  const tp = (t1 == null) ? (s.target_price ?? 0) : null;
  const target1 = t1 ?? (tp ? tp : 0);
  const target2 = t2 ?? (tp ? Math.round(tp * 1.04 * 100) / 100 : 0);
  const target3 = t3 ?? (tp ? Math.round(tp * 1.08 * 100) / 100 : 0);
  
  // Entry prices: derive from close if missing
  const close = s.close ?? 0;
  const entryLow = rawEntryLow ?? (close > 0 ? Math.round(close * 0.97 * 100) / 100 : 0);
  const entryHigh = rawEntryHigh ?? (close > 0 ? Math.round(close * 1.02 * 100) / 100 : 0);
  const stopLoss = rawStopLoss ?? (close > 0 ? Math.round(close * 0.93 * 100) / 100 : 0);
  
  // Recommendation: generate from total_score if missing
  const totalScore = s.total_score ?? 0;
  const rawRec = s.recommendation ?? s.strategy?.recommendation;
  const recommendation = rawRec
    ? rawRec
    : totalScore >= 90 ? '強烈推薦'
    : totalScore >= 80 ? '強力買進'
    : totalScore >= 70 ? '買進'
    : totalScore >= 60 ? '逢低佈局'
    : totalScore >= 50 ? '觀望'
    : '偏弱';
  
  // Dimensions: handle both flat numbers and {score,signal} nested objects
  const rawDimTech = s.dimensions?.technical ?? 0;
  const rawDimChips = s.dimensions?.chips ?? 0;
  const rawDimFund = s.dimensions?.fundamental ?? 0;
  const rawDimNews = s.dimensions?.news ?? 0;
  const rawDimSent = s.dimensions?.sentiment ?? 0;
  
  return {
    stock_id: s.stock_id,
    stock_name: s.stock_name ?? s.name ?? s.stock_id,
    name: s.stock_name ?? s.name ?? s.stock_id,
    sector_name: s.sector_name ?? s.sector ?? inferSector(s.stock_id ?? ''),
    sector: s.sector_name ?? s.sector ?? inferSector(s.stock_id ?? ''),
    close,
    change_pct: s.change_pct ?? 0,
    total_score: totalScore,
    technical_score: s.technical_score ?? extractDimValue(rawDimTech) ?? (s.scores?.technical != null ? Math.round(s.scores.technical * 40 / 100) : 0),
    chips_score: s.chips_score ?? extractDimValue(rawDimChips) ?? (s.scores?.chips != null ? Math.round(s.scores.chips * 10 / 100) : 0),
    fundamental_score: s.fundamental_score ?? extractDimValue(rawDimFund) ?? (s.scores?.fundamental != null ? Math.round(s.scores.fundamental * 40 / 100) : 0),
    news_score: s.news_score ?? extractDimValue(rawDimNews) ?? (s.scores?.news != null ? Math.round(s.scores.news * 10 / 100) : 0),
    sentiment_score: s.sentiment_score ?? extractDimValue(rawDimSent) ?? (s.scores?.sentiment != null ? Math.round(s.scores.sentiment * 10 / 100) : 0),
    rsi: s.rsi ?? (s.details?.rsi ?? s.signals?.rsi ?? 50),
    vol_ratio: s.vol_ratio ?? (s.details?.vol_ratio ?? s.signals?.vol_ratio ?? 1),
    volume: s.volume ?? 0,
    recommendation,
    reason: s.reason ?? '',
    entry_low: entryLow,
    entry_high: entryHigh,
    stop_loss: stopLoss,
    target1,
    target2,
    target3,
    hold_days: s.hold_days ?? s.strategy?.hold_days ?? (s.holding_days != null ? String(s.holding_days) : ''),
    position: s.position ?? '',
    max_loss_per_lot: s.max_loss_per_lot ?? 0,
    sector_boost: s.sector_boost ?? 0,
    power_combo: s.power_combo ?? false,
    signals: s.signals ?? {},
    // Normalize dimensions to flat numbers for downstream consumers
    dimensions: {
      technical: extractDimValue(rawDimTech) || (s.technical_score ?? 0),
      chips: extractDimValue(rawDimChips) || (s.chips_score ?? 0),
      fundamental: extractDimValue(rawDimFund) || (s.fundamental_score ?? 0),
      news: extractDimValue(rawDimNews) || (s.news_score ?? 0),
      sentiment: extractDimValue(rawDimSent) || (s.sentiment_score ?? 0),
    } as ScanDimensions,
    strategy: {
      ...(s.strategy ?? {}),
      entry_low: entryLow,
      entry_high: entryHigh,
      stop_loss: stopLoss,
      target1,
      target2,
      target3,
      recommendation,
    },
    // Preserve targets for getStockTarget* getters
    targets: s.targets ?? { t1: target1, t2: target2, t3: target3 },
  };
}

export function useAllScores() {
  const { data, error, isLoading } = useSWR<AllScoresData>(
    `${BASE}/data/all_scores.json`,
    fetcher,
    swrConfig
  );
  const stocks: ScanStock[] = (data?.all_stock_scores ?? data?.stocks ?? []).map(normalizeStock);
  return { data, stocks, error, isLoading };
}

export function useDateStockSearch(date: string | null, stockId: string | null) {
  const { data } = useDateScan(date);
  if (!data || !stockId) return null;
  return (
    (data.top_stocks ?? []).find(
      (s: any) => s.stock_id === stockId || s.stock_id.padStart(4, '0') === stockId.padStart(4, '0')
    ) ?? null
  );
}

// Restored for backward compatibility with SelfCheck.tsx
export function useOnDemandScan() {
  const [result, setResult] = useState<{ stock: ScanStock | null; error?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const scan = useCallback(async (stockId: string) => {
    if (!stockId) return;
    setIsLoading(true);
    setResult(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${BASE}/data/all_scores.json`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: AllScoresData = await res.json();
      const found = (json.all_stock_scores ?? json.stocks ?? []).find(
        (s: any) => s.stock_id === stockId || s.stock_id === stockId.padStart(4, '0')
      );
      setResult({ stock: found ? normalizeStock(found) : null });
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setResult({ stock: null, error: 'Fetch timeout' });
      } else {
        setResult({ stock: null, error: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  }, []);

  return { scan, result, isLoading };
}

// Required by SelfCheck.tsx — fetches all_scores.json via SWR
export function useAllScoresHistory() {
  const { data, error, isLoading } = useSWR<AllScoresData>(
    `${BASE}/data/all_scores.json`,
    fetcher,
    swrConfig
  );
  return { data: data ?? null, error, isLoading };
}
