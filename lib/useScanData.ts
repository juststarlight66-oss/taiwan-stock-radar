'use client';
import useSWR from 'swr';
import { useState, useEffect } from 'react';
import { ScanResult, ScanStock, ScanDimensions, ScanSignals } from './scanTypes';

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
    recommendation: s.recommendation ?? s.strategy?.recommendation ?? s.rec ?? '',
    rec: s.rec ?? s.recommendation ?? '',
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
      recommendation: s.recommendation ?? s.rec ?? '',
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function allScoresFetcher(url: string): Promise<AllScoresData> {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }).then((raw) => {
    // all_scores.json may be a bare array instead of the expected object
    if (Array.isArray(raw)) {
      const stocks: ScanStock[] = (raw as any[]).map(normalizeStock);
      return {
        scan_date: '',
        scanned_count: stocks.length,
        all_stock_scores: stocks,
      };
    }
    // Already an object — normalize every stock to fill in missing fields
    if (raw && Array.isArray(raw.all_stock_scores)) {
      raw.all_stock_scores = (raw.all_stock_scores as any[]).map(normalizeStock);
    }
    return {
      scan_date: raw.scan_date ?? raw.data_date ?? '',
      scanned_count: raw.scanned_count ?? raw.total_scanned ?? (raw.all_stock_scores?.length ?? 0),
      history: raw.history,
      all_stock_scores: raw.all_stock_scores ?? [],
    };
  });
}

function inferSector(stockId: string): string {
  const id = parseInt(stockId, 10);
  if (id >= 1000 && id <= 1999) return '水泥/建材';
  if (id >= 2000 && id <= 2099) return '鋼鐵/金屬';
  if (id >= 2100 && id <= 2199) return '塑膠化工';
  if (id >= 2200 && id <= 2399) return '電子';
  if (id >= 2400 && id <= 2599) return '半導體';
  if (id >= 2600 && id <= 2699) return '航運';
  if (id >= 2800 && id <= 2999) return '金融';
  if (id >= 3000 && id <= 3999) return 'IC設計';
  if (id >= 4000 && id <= 4999) return '生技醫療';
  if (id >= 5000 && id <= 5999) return '其他電子';
  if (id >= 6000 && id <= 6999) return '通信網路';
  if (id >= 8000 && id <= 8999) return '電子零組件';
  return '其他';
}

export function useAllScores() {
  const { data, error, isLoading } = useSWR<AllScoresData>(
    `${BASE}/data/all_scores.json`,
    allScoresFetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );
  return { data, error, isLoading };
}

// ── 監控清單 (Watchlist) ──
export type WatchlistEntry = {
  stock_id: string;
  added_at: string;
  note?: string;
};

export function useWatchlist() {
  const KEY = 'watchlist_v1';
  const [list, setList] = useState<WatchlistEntry[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setList(JSON.parse(raw));
    } catch {}
  }, []);

  function save(next: WatchlistEntry[]) {
    setList(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  }

  function addStock(stock_id: string, note?: string) {
    if (list.some((e) => e.stock_id === stock_id)) return;
    save([...list, { stock_id, added_at: new Date().toISOString(), note }]);
  }

  function removeStock(stock_id: string) {
    save(list.filter((e) => e.stock_id !== stock_id));
  }

  function isInWatchlist(stock_id: string) {
    return list.some((e) => e.stock_id === stock_id);
  }

  return { list, addStock, removeStock, isInWatchlist };
}
