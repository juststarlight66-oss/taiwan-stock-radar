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
    signals: s.signals ?? {},
  };
}

export function useAllScores() {
  const { data, error, isLoading } = useSWR<AllScoresData>(
    `${BASE}/data/all_scores.json`,
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );

  const stocks: ScanStock[] = (data?.all_stock_scores ?? []).map(normalizeStock);

  return { data, stocks, error, isLoading };
}

export function useOnDemandScan() {
  const [stocks, setStocks] = useState<ScanStock[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const scan = useCallback(async (stockIds: string[]) => {
    if (!stockIds.length) return;
    setIsScanning(true);
    setError(null);
    try {
      // Try to fetch from all_scores.json and filter by requested stock IDs
      const res = await fetch(`${BASE}/data/all_scores.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: AllScoresData = await res.json();
      const all = (json.all_stock_scores ?? []).map(normalizeStock);
      const filtered = all.filter((s) => stockIds.includes(s.stock_id));
      setStocks(filtered);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setStocks([]);
    } finally {
      setIsScanning(false);
    }
  }, []);

  const reset = useCallback(() => {
    setStocks([]);
    setError(null);
  }, []);

  return { stocks, isScanning, error, scan, reset };
}
