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
  const { data, error, isLoading } = useSWR<{ available_dates: string[] }>(
    `${BASE}/data/index.json`,
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
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
    signals: s.signals ?? [],
    score_components: s.score_components ?? {},
    backtest: s.backtest ?? {},
    performance: s.performance ?? {},
  };
}

function normalizeScanResult(raw: Record<string, unknown> | null): ScanResult | null {
  if (!raw) return null;

  const stocks = ('stocks' in raw ? (raw as Record<string, unknown>).stocks : undefined)
    ?? ('all_stock_scores' in raw ? (raw as Record<string, unknown>).all_stock_scores : undefined)
    ?? ('top10' in raw ? (raw as Record<string, unknown>).top10 : undefined)
    ?? ('top_10' in raw ? (raw as Record<string, unknown>).top_10 : undefined)
    ?? [];
  const arr = (Array.isArray(stocks) ? stocks : []) as Array<Record<string, unknown>>;

  const marketSnapshot = ('market_snapshot' in raw ? (raw as Record<string, unknown>).market_snapshot : undefined)
    ?? ('market' in raw ? (raw as Record<string, unknown>).market : undefined)
    ?? undefined;

  const market = marketSnapshot && typeof marketSnapshot === 'object'
    ? {
        taiex: (marketSnapshot as Record<string, unknown>).taiex as number | undefined ?? 0,
        change: (marketSnapshot as Record<string, unknown>).change as number | undefined ?? 0,
        change_pct: (marketSnapshot as Record<string, unknown>).change_pct as number | undefined ?? 0,
        volume_billion: (marketSnapshot as Record<string, unknown>).volume_billion as number | undefined ?? 0,
        advancing: (marketSnapshot as Record<string, unknown>).advancing as number | undefined ?? 0,
        declining: (marketSnapshot as Record<string, unknown>).declining as number | undefined ?? 0,
        limit_up: (marketSnapshot as Record<string, unknown>).limit_up as number | undefined ?? 0,
        limit_down: (marketSnapshot as Record<string, unknown>).limit_down as number | undefined ?? 0,
      }
    : undefined;

  return {
    scan_date: (raw.scan_date as string) ?? (raw.date as string) ?? '',
    scanned_count: (raw.scanned_count as number) ?? arr.length,
    stocks: arr.map(normalizeStock),
    market,
    sector_ranking: (raw.sector_ranking as ScanResult['sector_ranking']) ?? [],
    catalysts: (raw.catalysts as ScanResult['catalysts']) ?? [],
  };
}

export function useDateScanParsed(date: string | null) {
  const { data, error, isLoading } = useDateScan(date);
  return { data: normalizeScanResult(data), error, isLoading };
}

export function useLatestScanParsed() {
  const { data, error, isLoading } = useLatestScan();
  return { data: normalizeScanResult(data), error, isLoading };
}

export function useAllScoresHistory() {
  const { data, error, isLoading } = useSWR<AllScoresData>(
    `${BASE}/data/all_scores.json`,
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const dates = (data?.history ?? []).map((e) => e.date);

  const selectedEntry = selectedDate
    ? data?.history?.find((e) => e.date === selectedDate) ?? null
    : null;

  const selectDate = useCallback((date: string) => setSelectedDate(date), []);

  return { data, dates, selectedDate, selectedEntry, selectDate, error, isLoading };
}

export function useDateStockSearch(date: string | null, stockId: string | null) {
  const { data: scanData } = useDateScanParsed(date);

  if (!scanData || !stockId) return null;

  return scanData.stocks.find(
    (s) => s.stock_id === stockId || s.stock_id.padStart(4, '0') === stockId.padStart(4, '0')
  ) ?? null;
}

// Restored for backward compatibility with SelfCheck.tsx
export function useOnDemandScan() {
  const [result, setResult] = useState<{ stock: ScanStock | null; error?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const scan = useCallback(async (stockId: string) => {
    if (!stockId) return;
    setIsLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${BASE}/data/all_scores.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: AllScoresData = await res.json();
      const found = (json.all_stock_scores ?? []).find(
        (s) => s.stock_id === stockId || s.stock_id === stockId.padStart(4, '0')
      );
      setResult({ stock: found ? normalizeStock(found) : null });
    } catch (e) {
      setResult({ stock: null, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { scan, result, isLoading };
}
