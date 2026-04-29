'use client';
import useSWR from 'swr';
import { ScanResult, ScanStock } from './scanTypes';

export interface AllScoresData {
  scan_date: string;
  scanned_count: number;
  stocks: ScanStock[];
}

// basePath is /taiwan-stock-radar — fetches must use absolute paths from that base
const BASE = '/taiwan-stock-radar';

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

/** Fetch the latest scan result */
export function useLatestScan() {
  const { data, error, isLoading } = useSWR<ScanResult>(
    `${BASE}/data/latest.json`,
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );
  return { data, error, isLoading };
}

/** Fetch a specific date's scan result */
export function useDateScan(date: string | null) {
  const key = date ? `${BASE}/data/scan_result_${date.replace(/-/g, '')}.json` : null;
  const { data, error, isLoading } = useSWR<ScanResult>(key, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
  });
  return { data, error, isLoading };
}

/** Fetch the index of available historical scan dates */
export function useHistoryIndex() {
  const { data, error, isLoading } = useSWR<{ dates: string[] }>(
    `${BASE}/data/index.json`,
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );
  return { dates: data?.dates ?? [], error, isLoading };
}

/** Fetch all_scores.json — every scanned stock's 5-dimension breakdown for the self-check tab */
export function useAllScores() {
  const { data, error, isLoading } = useSWR<AllScoresData>(
    `${BASE}/data/all_scores.json`,
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );
  return { data, error, isLoading };
}
