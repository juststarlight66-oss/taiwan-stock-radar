'use client';
import { useState, useEffect } from 'react';
import { PerformanceData, StockPerf } from './scanTypes';

// ── 日期工具 ──────────────────────────────────────────────
// scanDate 格式: "2025-04-30" (西元)
// TWSE STOCK_DAY API 需要: date=YYYYMMDD (西元)，月初第1日即可取得當月所有交易日

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function monthStart(dateStr: string): string {
  // dateStr: "2025-04-30" → "20250401"
  return dateStr.replace(/-/g, '').slice(0, 6) + '01';
}

function nextMonthStart(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  return toYMD(d);
}

interface TwseDayRow {
  Date: string;          // ROC e.g. "114/04/30"
  Code?: string;
  StockNo?: string;
  ClosingPrice: string;
  OpeningPrice?: string;
}

// 把民國日期 "114/04/30" → 西元 "2025-04-30"
function rocToAD(roc: string): string {
  const parts = roc.split('/');
  if (parts.length !== 3) return roc;
  const year = parseInt(parts[0], 10) + 1911;
  return `${year}-${parts[1]}-${parts[2]}`;
}

async function fetchTradingDays(
  stockId: string,
  yyyymm01: string   // e.g. "20250401"
): Promise<{ date: string; close: number }[]> {
  try {
    const url = `https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY?date=${yyyymm01}&stockNo=${stockId}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const rows: TwseDayRow[] = await r.json();
    if (!Array.isArray(rows)) return [];
    return rows
      .map(row => {
        const close = parseFloat(row.ClosingPrice.replace(/,/g, ''));
        const adDate = rocToAD(row.Date);
        return { date: adDate, close };
      })
      .filter(r => r.close > 0);
  } catch {
    return [];
  }
}

// 取得 scanDate 當月 + 次月交易日序列，找出 T+1/T+3/T+5
async function calcPerf(
  stockId: string,
  scanDate: string,    // "2025-04-30"
  entryPrice: number
): Promise<{ t1: StockPerf; t3: StockPerf; t5: StockPerf }> {
  const null_perf: StockPerf = { pct: null, win: null };

  try {
    const [thisMon, nextMon] = await Promise.all([
      fetchTradingDays(stockId, monthStart(scanDate)),
      fetchTradingDays(stockId, nextMonthStart(scanDate)),
    ]);
    const allDays = [...thisMon, ...nextMon].sort((a, b) => a.date.localeCompare(b.date));

    // 找 scanDate 在交易日序列中的位置
    const idx = allDays.findIndex(d => d.date === scanDate);
    // 若 scanDate 非交易日（例如週末），找第一個 >= scanDate 的日
    const baseIdx = idx >= 0 ? idx : allDays.findIndex(d => d.date > scanDate) - 1;
    if (baseIdx < 0) return { t1: null_perf, t3: null_perf, t5: null_perf };

    const today = new Date().toISOString().slice(0, 10);

    function perfAt(offset: number): StockPerf {
      const targetIdx = baseIdx + offset;
      if (targetIdx >= allDays.length) return null_perf;
      const target = allDays[targetIdx];
      // 若目標日還沒到，不顯示
      if (target.date > today) return { pct: null, win: null };
      const pct = ((target.close - entryPrice) / entryPrice) * 100;
      return { pct: Math.round(pct * 100) / 100, win: pct >= 0 };
    }

    return { t1: perfAt(1), t3: perfAt(3), t5: perfAt(5) };
  } catch {
    return { t1: null_perf, t3: null_perf, t5: null_perf };
  }
}

// ── Hook ──────────────────────────────────────────────────
// 傳入一個 top10 股票列表 + 掃描日，回傳每支股的 PerformanceData
export interface StockInput {
  stock_id: string;
  close: number;
}

export function useStockPerformance(
  stocks: StockInput[],
  scanDate: string | null
): {
  perfMap: Record<string, PerformanceData>;
  loading: boolean;
} {
  const [perfMap, setPerfMap] = useState<Record<string, PerformanceData>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!scanDate || stocks.length === 0) {
      setPerfMap({});
      return;
    }

    let cancelled = false;
    setLoading(true);
    setPerfMap({});

    async function run() {
      const results = await Promise.all(
        stocks.map(async s => {
          const { t1, t3, t5 } = await calcPerf(s.stock_id, scanDate!, s.close);
          const pd: PerformanceData = {
            stock_id: s.stock_id,
            entry_date: scanDate!,
            entry_price: s.close,
            t1, t3, t5,
          };
          return pd;
        })
      );
      if (!cancelled) {
        const map: Record<string, PerformanceData> = {};
        results.forEach(pd => { map[pd.stock_id] = pd; });
        setPerfMap(map);
        setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [scanDate, stocks.map(s => s.stock_id).join(',')]);

  return { perfMap, loading };
}
