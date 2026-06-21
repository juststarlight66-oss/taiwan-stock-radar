'use client';
import { useState, useEffect } from 'react';
import { useDateScan, ScanResult } from '@/lib/useScanData';
import Top10Table from './Top10Table';
import SummaryCards from './SummaryCards';
import { demoScanResult } from '@/lib/demoScanData';
import {
  ChevronLeft, ChevronRight, Search, Clock, TrendingUp,
  TrendingDown, Minus, BarChart2, Calendar, Database, ArrowRight,
} from 'lucide-react';

const BASE = '/taiwan-stock-radar';

// ── Types ────────────────────────────────────────────────────────
interface ScanEntry {
  date: string;
  file: string;
  scan_time: string;
  scanned_count?: number;
}

interface BacktestStock {
  stock_id: string;
  name: string;
  entry: number;
  stop_loss: number | null;
  close: number | null;
  return_pct: number | null;
  hit_target: boolean;
  hit_stoploss: boolean;
  pending?: boolean;
}

interface PeriodData {
  label: string;
  backtest_date: string;
  win_rate: number | null;
  avg_return: number | null;
  pending: boolean;
  stocks: BacktestStock[];
}

interface BacktestRecord {
  scan_date: string;
  periods: { T1: PeriodData; T3: PeriodData; T5: PeriodData };
}

interface BacktestData {
  version: number;
  grouped_records: BacktestRecord[];
}

interface Props { initialDates?: string[] }

// ── Helpers ──────────────────────────────────────────────────────
function formatDate(d: string) {
  const s = d.replace(/[-/]/g, '');
  if (s.length !== 8) return d;
  return `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)}`;
}
function normDate(d: string) {
  const s = d.replace(/[-\/]/g, '');
  if (s.length !== 8) return d;
  return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
}

// ── Schema normalization ─────────────────────────────────────────
function normalizeBacktest(raw: unknown): BacktestData {
  const data = raw as Record<string, unknown> | null;
  const grouped: BacktestRecord[] = ((data?.grouped_records as any[]) || []).map((rec: any) => {
    const periods: Record<string, PeriodData> = {} as any;
    for (const key of ['T1','T3','T5'] as const) {
      const p = rec.periods?.[key] as any;
      if (!p) continue;
      periods[key] = {
        label: p.label ?? ({ T1: 'T+1', T3: 'T+3', T5: 'T+5' } as any)[key],
        backtest_date: p.backtest_date ?? '',
        win_rate: (p.win_rate ?? null) as number | null,
        avg_return: (p.avg_return ?? p.avg_pct ?? null) as number | null,
        pending: (p.pending ?? (p.verified === null || p.verified === 0)) as boolean,
        stocks: ((p.stocks ?? []) as any[]).map((s: any): BacktestStock => {
          const entry: number = s.entry ?? s.entry_price ?? (s as any).entry_low ?? 0;
          const rpct: number | null = s.return_pct ?? s.pct ?? null;
          const closeFallback = entry && rpct != null
            ? Math.round(entry * (1 + rpct / 100) * 100) / 100
            : null;
          return {
            stock_id: s.stock_id ?? '',
            name:     s.name ?? '',
            entry,
            stop_loss:       (s.stop_loss ?? s.stoploss ?? null) as number | null,
            close:           (s.close ?? closeFallback) as number | null,
            return_pct:      rpct,
            hit_target:      (s.hit_target ?? s.win ?? false) as boolean,
            hit_stoploss:    (s.hit_stoploss ?? false) as boolean,
            pending:         (s.pending ?? (rpct === null)) as boolean,
          };
        }),
      };
    }
    return { scan_date: rec.scan_date ?? '', periods: periods as BacktestRecord['periods'] };
  });
  return { version: (data?.version ?? 2) as number, grouped_records: grouped };
}

// ── Skeleton Cards for loading ───────────────────────────────────
function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 bg-white border border-gray-200 rounded-xl animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 rounded-lg" />
              <div className="space-y-2">
                <div className="h-4 w-28 bg-gray-200 rounded" />
                <div className="h-3 w-20 bg-gray-100 rounded" />
              </div>
            </div>
            <div className="flex gap-4">
              <div className="h-3 w-14 bg-gray-200 rounded" />
              <div className="h-3 w-14 bg-gray-200 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────
export default function HistoryBrowser({ initialDates }: Props) {
  const [scanEntries, setScanEntries] = useState<ScanEntry[]>([]);
  const [loadingIndex, setLoadingIndex] = useState(!initialDates);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [backtest, setBacktest] = useState<BacktestData | null>(null);
  const [activePeriod, setActivePeriod] = useState<'T1'|'T3'|'T5'>('T1');
  const [currentPage, setCurrentPage] = useState(0);
  const [showChart, setShowChart]           = useState(true);

  const PAGE_SIZE = 20;

  // Load index.json to get available dates with scan count
  useEffect(() => {
    if (initialDates) return;
    setLoadingIndex(true);
    fetch(`${BASE}/data/index.json`)
      .then(r => r.json())
      .then(d => {
        // Prefer 'scans' array (richer: has scanned_count), fallback to available_dates
        if (d.scans && Array.isArray(d.scans) && d.scans.length > 0) {
          setScanEntries(d.scans.slice().reverse());
        } else if (d.available_dates && Array.isArray(d.available_dates)) {
          setScanEntries(d.available_dates.map((date: string) => ({ date, file: '', scan_time: '' })).reverse());
        } else {
          setScanEntries([]);
        }
        setLoadingIndex(false);
      })
      .catch(() => setLoadingIndex(false));
  }, [initialDates]);

  // Load backtest.json once
  useEffect(() => {
    fetch(`${BASE}/data/backtest.json`)
      .then(r => r.json())
      .then(d => setBacktest(normalizeBacktest(d)))
      .catch(() => {});
  }, []);

  // reset page when search changes
  useEffect(() => { setCurrentPage(0); }, [searchQuery]);

  const filteredEntries = searchQuery
    ? scanEntries.filter(e => e.date.includes(searchQuery.replace(/[-\/]/g, '')))
    : scanEntries;

  const totalPages = Math.ceil(filteredEntries.length / PAGE_SIZE);
  const pagedEntries = filteredEntries.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const selectedEntry = scanEntries.find(e => e.date === selectedDate);

  if (loadingIndex) {
    return <SkeletonList count={5} />;
  }

  return (
    <div>
      {selectedDate ? (
        /* ── Detail view ── */
        <div>
          <button
            onClick={() => setSelectedDate(null)}
            className="mb-5 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> 返回列表
          </button>
          <HistoryDetail
            date={selectedDate}
            backtest={backtest}
            activePeriod={activePeriod}
            setActivePeriod={setActivePeriod}
            entry={selectedEntry}
            showChart={showChart}
            setShowChart={setShowChart}
          />
        </div>
      ) : (
        /* ── List view ── */
        <div>
          {/* Search bar */}
          <div className="mb-5 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜尋日期 (YYYYMMDD)"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
            />
          </div>

          {/* Overall backtest stats */}
          {backtest && backtest.grouped_records.length > 0 && (
            <div className="mb-5 bg-white border border-gray-200 rounded-xl p-4">
              <OverallBacktestStats records={backtest.grouped_records} />
            </div>
          )}

          {/* Pagination info */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mb-4 text-xs text-gray-500">
              <span>
                {filteredEntries.length} 筆記錄
                {searchQuery && `（符合 ${filteredEntries.length} 筆）`}
                ，第 {currentPage + 1} / {totalPages} 頁
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-opacity"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPage === totalPages - 1}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-opacity"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Date list */}
          {pagedEntries.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">找不到符合條件記錄</p>
            </div>
          ) : (
            <div className="grid gap-2.5">
              {pagedEntries.map(entry => {
                const date = entry.date;
                const btRec = backtest?.grouped_records.find(r => normDate(r.scan_date) === normDate(date));
                return (
                  <button
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    className="w-full text-left p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-sm transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                          <Calendar className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900">{formatDate(date)}</div>
                          <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                            <Clock className="w-3 h-3 shrink-0" />
                            <span>{entry.scan_time || '收盤後'}</span>
                            {entry.scanned_count != null && (
                              <>
                                <span className="text-gray-300">|</span>
                                <Database className="w-3 h-3 shrink-0" />
                                <span>{entry.scanned_count.toLocaleString()} 檔</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {btRec ? (
                          <BacktestSummary rec={btRec} />
                        ) : (
                          <div className="text-xs text-gray-400 px-2 py-1 bg-gray-50 rounded-lg">
                            回測待驗證
                          </div>
                        )}
                        <ArrowRight className="w-4 h-4 text-gray-300" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── BacktestSummary mini-widget ───────────────────────────────────
function BacktestSummary({ rec }: { rec: BacktestRecord }) {
  const periods = (['T1','T3','T5'] as const).map(k => rec.periods[k]).filter(Boolean);
  const verified = periods.filter(p => !p.pending);
  if (verified.length === 0) return <div className="text-xs text-gray-400">回測待驗證</div>;
  const best = verified.reduce((a, b) => (b.win_rate ?? 0) > (a.win_rate ?? 0) ? b : a);
  const wr = best.win_rate ?? 0;
  const avg = best.avg_return ?? 0;
  const color = wr >= 60 ? 'text-green-600' : wr >= 40 ? 'text-yellow-600' : 'text-red-500';
  const Icon = avg > 0 ? TrendingUp : avg < 0 ? TrendingDown : Minus;
  return (
    <div className="flex items-center gap-3 text-xs">
      <div className={`flex items-center gap-1 font-semibold ${color}`}>
        <BarChart2 className="w-3 h-3" />
        勝率{wr.toFixed(0)}%
      </div>
      <div className={`flex items-center gap-1 ${avg >= 0 ? 'text-green-600' : 'text-red-500'}`}>
        <Icon className="w-3 h-3" />
        {avg >= 0 ? '+' : ''}{avg.toFixed(1)}%
      </div>
      <div className="text-gray-400 font-mono text-[10px]">{best.label}</div>
    </div>
  );
}

// ── PeriodComparisonChart ────────────────────────────────────────
function PeriodComparisonChart({ periods }: { periods: BacktestRecord['periods'] }) {
  const entries = (['T1','T3','T5'] as const)
    .map(k => ({ key: k, label: periods[k]?.label ?? ({T1:'T+1',T3:'T+3',T5:'T+5'}[k]), p: periods[k] }))
    .filter(e => e.p);
  const verified = entries.filter(e => !e.p!.pending);
  if (verified.length === 0) return <p className="text-sm text-gray-400 text-center py-4">尚無已完成驗證的週期</p>;
  const maxWR = Math.max(...verified.map(e => e.p!.win_rate ?? 0), 100);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      {/* Win rate bars */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 mb-3 tracking-wide">勝率</h4>
        <div className="space-y-2.5">
          {entries.map(e => {
            const wr = e.p?.win_rate ?? 0;
            const pending = e.p?.pending ?? true;
            const w = pending ? 0 : Math.max(4, (wr / maxWR) * 100);
            const color = pending ? 'bg-gray-200'
              : wr >= 60 ? 'bg-green-500' : wr >= 40 ? 'bg-yellow-500' : 'bg-red-500';
            return (
              <div key={e.key} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-10 text-right font-mono shrink-0">{e.label}</span>
                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${color} transition-all duration-500 ease-out`}
                    style={{ width: `${w}%` }}
                  />
                </div>
                <span className={`text-xs font-semibold w-12 shrink-0 ${pending ? 'text-gray-400' : 'text-gray-900'}`}>
                  {pending ? '待驗證' : `${wr.toFixed(0)}%`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {/* Avg return bars */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 mb-3 tracking-wide">平均報酬</h4>
        <div className="space-y-2.5">
          {entries.map(e => {
            const ar = e.p?.avg_return ?? 0;
            const pending = e.p?.pending ?? true;
            const absMax = Math.max(...verified.map(v => Math.abs(v.p!.avg_return ?? 0)), 1);
            const w = pending ? 0 : Math.max(4, (Math.abs(ar) / absMax) * 100);
            const isPositive = ar >= 0;
            const color = pending ? 'bg-gray-200' : isPositive ? 'bg-green-500' : 'bg-red-500';
            return (
              <div key={e.key} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-10 text-right font-mono shrink-0">{e.label}</span>
                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${color} transition-all duration-500 ease-out ${!isPositive && !pending ? 'ml-auto' : ''}`}
                    style={{ width: `${w}%` }}
                  />
                </div>
                <span className={`text-xs font-semibold w-14 shrink-0 ${pending ? 'text-gray-400' : isPositive ? 'text-green-600' : 'text-red-500'}`}>
                  {pending ? '待驗證' : `${isPositive ? '+' : ''}${ar.toFixed(2)}%`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── OverallBacktestStats ─────────────────────────────────────────
function OverallBacktestStats({ records }: { records: BacktestRecord[] }) {
  const allPeriods: { label: string; wr: number; ar: number }[] = [];
  for (const rec of records) {
    for (const k of (['T1','T3','T5'] as const)) {
      const p = rec.periods[k];
      if (p && !p.pending && p.win_rate != null) {
        allPeriods.push({ label: p.label, wr: p.win_rate, ar: p.avg_return ?? 0 });
      }
    }
  }
  if (allPeriods.length === 0) return <p className="text-sm text-gray-400 text-center">尚無已完成驗證的記錄</p>;
  const avgWR = allPeriods.reduce((s, v) => s + v.wr, 0) / allPeriods.length;
  const avgAR = allPeriods.reduce((s, v) => s + v.ar, 0) / allPeriods.length;
  const bestWR = allPeriods.reduce((a, b) => b.wr > a.wr ? b : a);
  const bestAR = allPeriods.reduce((a, b) => b.ar > a.ar ? b : a);
  const wrColor = avgWR >= 60 ? 'text-green-600' : avgWR >= 40 ? 'text-yellow-600' : 'text-red-500';
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 mb-3 tracking-wide flex items-center gap-1.5">
        <BarChart2 className="w-3.5 h-3.5" />
        累計回測 ({records.length} 日 · {allPeriods.length} 筆已驗證週期)
      </h4>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div>
          <span className="text-gray-500">平均勝率</span>
          <span className={`ml-2 font-bold ${wrColor}`}>{avgWR.toFixed(1)}%</span>
        </div>
        <div>
          <span className="text-gray-500">平均報酬</span>
          <span className={`ml-2 font-bold ${avgAR >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {avgAR >= 0 ? '+' : ''}{avgAR.toFixed(2)}%
          </span>
        </div>
        <div>
          <span className="text-gray-500">最佳勝率</span>
          <span className="ml-2 font-bold text-green-600">
            {bestWR.label} {bestWR.wr.toFixed(0)}%
          </span>
        </div>
        <div>
          <span className="text-gray-500">最佳報酬</span>
          <span className="ml-2 font-bold text-green-600">
            {bestAR.label} {bestAR.ar >= 0 ? '+' : ''}{bestAR.ar.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ── HistoryDetail ─────────────────────────────────────────────────
function HistoryDetail({
  date,
  backtest,
  activePeriod,
  setActivePeriod,
  entry,
  showChart,
  setShowChart,
}: {
  date: string;
  backtest: BacktestData | null;
  activePeriod: 'T1'|'T3'|'T5';
  setActivePeriod: (p: 'T1'|'T3'|'T5') => void;
  entry?: ScanEntry;
  showChart: boolean;
  setShowChart: (v: boolean) => void;
}) {
  const { data, isLoading, error } = useDateScan(date);
  const btRec = backtest?.grouped_records.find(r => normDate(r.scan_date) === normDate(date));
  const period = btRec?.periods[activePeriod];
  const hasError = !!error;

  const resolvedData = !hasError && data ? data : (btRec ? {
    scan_date: btRec.scan_date,
    scanned_count: 0,
    top10: btRec.periods.T1?.stocks.map(s => ({
      stock_id: s.stock_id,
      stock_name: s.name,
      name: s.name,
      sector: '',
      close: s.entry,
      change_pct: 0,
      total_score: 0,
      technical_score: 0,
      chips_score: 0,
      fundamental_score: 0,
      news_score: 0,
      sentiment_score: 0,
      rsi: 50,
      vol_ratio: 1,
      volume: 0,
      recommendation: '',
      reason: '',
      entry_low: s.entry,
      entry_high: s.entry,
      stop_loss: s.stop_loss ?? 0,
      target1: s.stop_loss ? s.entry + (s.entry - s.stop_loss) * 2 : s.entry * 1.05,
      target2: 0,
      target3: 0,
      hold_days: '',
      position: '',
      max_loss_per_lot: 0,
      sector_boost: 0,
      power_combo: false,
      signals: {},
      strategy: { entry: s.entry, stop_loss: s.stop_loss, target: s.stop_loss ? s.entry + (s.entry - s.stop_loss) * 2 : s.entry * 1.05 },
    })) || [],
    all_stock_scores: [],
  } as unknown as ScanResult : demoScanResult);

  const scanResult = resolvedData;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-7 w-7 border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-red-400 mb-3">無法載入 {formatDate(date)} 的資料</p>
        <div className="max-w-md mx-auto bg-red-50 border border-red-100 rounded-xl p-4">
          <p className="text-xs text-red-600/70">
            此日期的掃描結果可能尚未保存或已被清除。<br />
            點擊上方「返回列表」瀏覽其他日期。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Date heading */}
      <div className="mb-6 flex items-center gap-3">
        <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
          <Calendar className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">{formatDate(date)}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            歷史掃描結果
            {entry?.scanned_count != null && ` · ${entry.scanned_count.toLocaleString()} 檔`}
            {entry?.scan_time && ` · ${entry.scan_time}`}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <SummaryCards data={scanResult} />

      {/* Top 10 table */}
      <div className="mt-6">
        <Top10Table
          stocks={scanResult.top10 ?? scanResult.top_stocks ?? []}
          scanDate={scanResult.scan_date}
          scannedCount={scanResult.scanned_count}
        />
      </div>

      {/* Backtest section */}
      {btRec && (
        <div className="mt-8">
          <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-blue-600" />
            回測績效
          </h3>

          {/* Period trend chart */}
          <button
            onClick={() => setShowChart(!showChart)}
            className="mb-3 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            <BarChart2 className="w-3.5 h-3.5" />
            三週期趨勢比較
            <span className="text-gray-300 ml-0.5">{showChart ? '▼' : '▶'}</span>
          </button>
          {showChart && (
            <div className="mb-5 bg-white border border-gray-100 rounded-xl p-4">
              <PeriodComparisonChart periods={btRec.periods} />
            </div>
          )}

          {/* Period tabs */}
          <div className="flex gap-2 mb-4">
            {(['T1','T3','T5'] as const).map(k => {
              const p = btRec.periods[k];
              if (!p) return null;
              return (
                <button
                  key={k}
                  onClick={() => setActivePeriod(k)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activePeriod === k
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {p.label}
                  {!p.pending && p.win_rate != null && (
                    <span className={`ml-1.5 ${activePeriod === k ? 'opacity-80' : 'text-blue-600'}`}>
                      {p.win_rate.toFixed(0)}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Period detail */}
          {period && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {period.pending ? (
                <p className="text-gray-400 text-sm text-center py-8">
                  驗證中，尚未到期
                </p>
              ) : (
                <>
                  {/* Summary stats */}
                  <div className="flex flex-wrap gap-6 p-4 border-b border-gray-100 text-sm">
                    <div>
                      <span className="text-gray-500">勝率</span>
                      <span className={`ml-2 font-bold ${
                        (period.win_rate ?? 0) >= 60 ? 'text-green-600'
                        : (period.win_rate ?? 0) >= 40 ? 'text-yellow-600'
                        : 'text-red-500'
                      }`}>
                        {period.win_rate?.toFixed(1) ?? '-'}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">平均報酬</span>
                      <span className={`ml-2 font-bold ${
                        (period.avg_return ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'
                      }`}>
                        {(period.avg_return ?? 0) >= 0 ? '+' : ''}{period.avg_return?.toFixed(2) ?? '-'}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">驗證日</span>
                      <span className="ml-2 text-gray-700">
                        {period.backtest_date ? formatDate(period.backtest_date) : '-'}
                      </span>
                    </div>
                  </div>

                  {/* Stocks table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-400 border-b border-gray-100 text-xs">
                          <th className="py-3 px-4 font-medium">股票</th>
                          <th className="py-3 px-4 font-medium">進場價</th>
                          <th className="py-3 px-4 font-medium">停損</th>
                          <th className="py-3 px-4 font-medium">收盤</th>
                          <th className="py-3 px-4 font-medium">報酬</th>
                          <th className="py-3 px-4 font-medium">結果</th>
                        </tr>
                      </thead>
                      <tbody>
                        {period.stocks.map(s => (
                          <tr key={s.stock_id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                            <td className="py-2.5 px-4">
                              <span className="font-medium text-gray-900 mr-1.5">{s.stock_id}</span>
                              <span className="text-gray-400 text-xs">{s.name}</span>
                            </td>
                            <td className="py-2.5 px-4 text-gray-700 font-mono text-xs">{s.entry?.toFixed(2) ?? '-'}</td>
                            <td className="py-2.5 px-4 text-gray-500 font-mono text-xs">{s.stop_loss?.toFixed(2) ?? '-'}</td>
                            <td className="py-2.5 px-4 text-gray-700 font-mono text-xs">{s.close?.toFixed(2) ?? '-'}</td>
                            <td className={`py-2.5 px-4 font-mono text-xs font-medium ${
                              s.pending ? 'text-gray-400'
                              : (s.return_pct ?? 0) >= 0 ? 'text-green-600'
                              : 'text-red-500'
                            }`}>
                              {s.pending
                                ? '待驗證'
                                : `${(s.return_pct ?? 0) >= 0 ? '+' : ''}${s.return_pct?.toFixed(2) ?? '-'}%`
                              }
                            </td>
                            <td className="py-2.5 px-4">
                              {s.pending ? (
                                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">待驗證</span>
                              ) : s.hit_target ? (
                                <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-md font-medium">達標</span>
                              ) : s.hit_stoploss ? (
                                <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-md font-medium">停損</span>
                              ) : (
                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">持有中</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
