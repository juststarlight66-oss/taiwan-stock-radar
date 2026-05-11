'use client';
import useSWR from 'swr';
import { useState, useEffect } from 'react';
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
  all_stock_scores: ScanStock[];
}

const BASE = '/taiwan-stock-radar';

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

export function useLatestScan() {
  const { data, error, isLoading } = useSWR<ScanResult>(
    `${BASE}/data/latest.json`,
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );
  return { data, error, isLoading };
}

export function useDateScan(date: string | null) {
  const key = date ? `${BASE}/data/scan_result_${date.replace(/-/g, '')}.json` : null;
  const { data, error, isLoading } = useSWR<ScanResult>(key, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
  });
  return { data, error, isLoading };
}

export function useHistoryIndex() {
  const { data, error, isLoading } = useSWR<{ dates: string[] }>(
    `${BASE}/data/index.json`,
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );
  return { dates: data?.dates ?? [], error, isLoading };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inferSector(stockId: string): string {
  const id = parseInt(stockId, 10);
  if (id >= 1000 && id <= 1999) return '水泥';
  if (id >= 2000 && id <= 2099) return '食品';
  if (id >= 2100 && id <= 2199) return '塑膠';
  if (id >= 2300 && id <= 2399) return '電子';
  if (id >= 2400 && id <= 2499) return '半導體';
  if (id >= 2500 && id <= 2599) return '電腦周邊';
  if (id >= 2600 && id <= 2699) return '通信網路';
  if (id >= 2800 && id <= 2899) return '金融';
  if (id >= 3000 && id <= 3999) return '其他電子';
  if (id >= 4000 && id <= 4999) return '建材營造';
  if (id >= 5000 && id <= 5999) return '航運';
  if (id >= 6000 && id <= 6999) return '電子零組件';
  if (id >= 8000 && id <= 8999) return '生技醫療';
  return '其他';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeStock(s: any): ScanStock {
  return {
    stock_id: s.stock_id,
    stock_name: s.stock_name ?? s.name ?? s.stock_id,
    name: s.stock_name ?? s.name ?? s.stock_id,
    sector_name: s.sector_name ?? s.sector ?? inferSector(s.stock_id ?? ''),
    sector: s.sector_name ?? s.sector ?? inferSector(s.stock_id ?? ''),
    close: s.close ?? 0,
    change_pct: s.change_pct ?? 0,
    total_score: s.total_score ?? 0,
    technical_score: s.technical_score ?? s.dimensions?.technical ?? 0,
    chips_score: s.chips_score ?? s.dimensions?.chips ?? 0,
    fundamental_score: s.fundamental_score ?? s.dimensions?.fundamental ?? 0,
    news_score: s.news_score ?? s.dimensions?.news ?? 0,
    sentiment_score: s.sentiment_score ?? s.dimensions?.sentiment ?? 0,
    rsi: s.rsi ?? 50,
    vol_ratio: s.vol_ratio ?? 1,
    volume: s.volume ?? 0,
    recommendation: s.recommendation ?? s.strategy?.recommendation ?? '',
    reason: s.reason ?? '',
    entry_low: s.entry_low ?? s.strategy?.entry_low ?? 0,
    entry_high: s.entry_high ?? s.strategy?.entry_high ?? 0,
    stop_loss: s.stop_loss ?? s.strategy?.stop_loss ?? 0,
    target1: s.target1 ?? s.strategy?.target1 ?? 0,
    target2: s.target2 ?? s.strategy?.target2 ?? 0,
    target3: s.target3 ?? s.strategy?.target3 ?? 0,
    hold_days: s.hold_days ?? '',
    position: s.position ?? '',
    max_loss_per_lot: s.max_loss_per_lot ?? 0,
    sector_boost: s.sector_boost ?? 0,
    power_combo: s.power_combo ?? false,
    dimensions: s.dimensions ?? {
      technical:   s.technical_score   ?? 0,
      fundamental: s.fundamental_score ?? 0,
      news:        s.news_score        ?? 0,
      sentiment:   s.sentiment_score   ?? 0,
      chips:       s.chips_score       ?? 0,
    },
    signals: s.signals ?? { technical: [], fundamental: [], news: [], sentiment: [], chips: [] },
    details: s.details ?? { rsi: s.rsi ?? 50, vol_ratio: s.vol_ratio ?? 1 },
    strategy: s.strategy ?? {
      entry: s.entry_low ?? s.close ?? 0,
      entry_low: s.entry_low ?? 0,
      entry_high: s.entry_high ?? 0,
      target: s.target1 ?? 0,
      target1: s.target1 ?? 0,
      target2: s.target2 ?? 0,
      target3: s.target3 ?? 0,
      stop_loss: s.stop_loss ?? 0,
      recommendation: s.recommendation ?? '',
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function allScoresFetcher(url: string): Promise<AllScoresData> {
  return fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .then((raw: any) => {
      // Support both array format and object format
      if (Array.isArray(raw)) {
        return {
          scan_date: '',
          scanned_count: raw.length,
          all_stock_scores: raw.map(normalizeStock),
        } as AllScoresData;
      }
      // Object format
      const scores = raw.all_stock_scores ?? raw.stocks ?? [];
      return {
        scan_date: raw.scan_date ?? '',
        scanned_count: raw.scanned_count ?? scores.length,
        history: raw.history,
        all_stock_scores: scores.map(normalizeStock),
      } as AllScoresData;
    });
}

export function useAllScores() {
  const { data, error, isLoading } = useSWR<AllScoresData>(
    `${BASE}/data/all_scores.json`,
    allScoresFetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );
  return { data, error, isLoading };
}

export function useIntradayScan() {
  const { data, error, isLoading } = useSWR(
    `${BASE}/data/intraday.json`,
    fetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: true }
  );
  return { data, error, isLoading };
}

export function useBacktestData() {
  const { data, error, isLoading } = useSWR(
    `${BASE}/data/backtest.json`,
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );
  return { data, error, isLoading };
}

export function useTrackingData() {
  const [data, setData] = useState<ScanResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const idxRes = await fetch(`${BASE}/data/index.json`);
        if (!idxRes.ok) throw new Error(`index.json HTTP ${idxRes.status}`);
        const idx = await idxRes.json();
        const dates: string[] = idx.dates ?? [];
        const results = await Promise.all(
          dates.map(async (d) => {
            const r = await fetch(`${BASE}/data/scan_result_${d.replace(/-/g, '')}.json`);
            if (!r.ok) return null;
            return r.json() as Promise<ScanResult>;
          })
        );
        setData(results.filter(Boolean) as ScanResult[]);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  return { data, isLoading, error };
}
