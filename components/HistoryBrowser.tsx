'use client';
import { useState, useEffect } from 'react';
import { useDateScan } from '@/lib/useScanData';
import Top10Table from './Top10Table';
import SummaryCards from './SummaryCards';
import { demoScanResult } from '@/lib/demoScanData';
import { Calendar, ChevronLeft, ChevronRight, Search, Clock, TrendingUp, TrendingDown, Minus, BarChart2 } from 'lucide-react';

const BASE = '/taiwan-stock-radar';

// ── Types ────────────────────────────────────────────────────────
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
  label: string;          // 'T+1' | 'T+3' | 'T+5'
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
function toISO(d: string) {
  const s = d.replace(/[-/]/g, '');
  return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
}
function normDate(d: string) { return toISO(d.replace(/\//g,'').replace(/-/g,'')); }

// ── Schema normalization (old → new field mapping) ────────────────
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

// ── Component ────────────────────────────────────────────────────
export default function HistoryBrowser({ initialDates }: Props) {
  const [dates, setDates]             = useState<string[]>(initialDates ?? []);
  const [loadingIndex, setLoadingIndex] = useState(!initialDates);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [backtest, setBacktest]       = useState<BacktestData | null>(null);
  const [activePeriod, setActivePeriod] = useState<'T1'|'T3'|'T5'>('T1');
  const [currentPage, setCurrentPage] = useState(0);

  const PAGE_SIZE = 20;

  // Load index.json to get available dates
  useEffect(() => {
    if (initialDates) return;
    setLoadingIndex(true);
    fetch(`${BASE}/data/index.json`)
      .then(r => r.json())
      .then(d => {
        setDates((d.available_dates ?? []).slice().reverse());
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

  const filteredDates = searchQuery
    ? dates.filter(d => d.includes(searchQuery.replace(/\//g,'').replace(/-/g,'')))
    : dates;

  const totalPages = Math.ceil(filteredDates.length / PAGE_SIZE);
  const pagedDates = filteredDates.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  if (loadingIndex) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-500">載入歷史資料中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">歷史記錄</h1>
          </div>
          <p className="text-gray-500 ml-11">查看過去每日掃描結果與回測績效</p>
        </div>

        {selectedDate ? (
          /* ── Detail view ── */
          <div>
            <button
              onClick={() => setSelectedDate(null)}
              className="mb-6 flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
            >
              <ChevronLeft className="w-4 h-4" /> 返回列表
            </button>
            <HistoryDetail date={selectedDate} backtest={backtest} activePeriod={activePeriod} setActivePeriod={setActivePeriod} />
          </div>
        ) : (
          /* ── List view ── */
          <div>

            {/* search bar */}
            <div className="mb-6 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜尋日期 (e.g. 20260501)"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* pagination controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mb-4 text-sm text-gray-600">
                <span>{filteredDates.length} 筆記錄，第 {currentPage + 1} / {totalPages} 頁</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={currentPage === totalPages - 1}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* date list */}
            {pagedDates.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>找不到符合的記錄</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {pagedDates.map(date => {
                  const btRec = backtest?.grouped_records.find(r => normDate(r.scan_date) === normDate(date));
                  return (
                    <button
                      key={date}
                      onClick={() => setSelectedDate(date)}
                      className="w-full text-left p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900">{formatDate(date)}</div>
                            <div className="text-xs text-gray-500 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> 收盤後掃描
                            </div>
                          </div>
                        </div>
                        {btRec ? (
                          <BacktestSummary rec={btRec} />
                        ) : (
                          <div className="text-xs text-gray-400">回測待驗證</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
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
        勝率 {wr.toFixed(0)}%
      </div>
      <div className={`flex items-center gap-1 ${avg >= 0 ? 'text-green-600' : 'text-red-500'}`}>
        <Icon className="w-3 h-3" />
        {avg >= 0 ? '+' : ''}{avg.toFixed(1)}%
      </div>
      <div className="text-gray-400">{best.label}</div>
    </div>
  );
}

// ── HistoryDetail ─────────────────────────────────────────────────
function HistoryDetail({
  date,
  backtest,
  activePeriod,
  setActivePeriod,
}: {
  date: string;
  backtest: BacktestData | null;
  activePeriod: 'T1'|'T3'|'T5';
  setActivePeriod: (p: 'T1'|'T3'|'T5') => void;
}) {
  const { data, loading, error } = useDateScan(date);
  const scanResult = data ?? demoScanResult;

  const btRec = backtest?.grouped_records.find(r => normDate(r.scan_date) === normDate(date));
  const period = btRec?.periods[activePeriod];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-center py-16 text-red-400">
        <p>無法載入 {formatDate(date)} 的資料</p>
      </div>
    );
  }

  return (
    <div>
      {/* Date heading */}
      <div className="mb-6 flex items-center gap-3">
        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
          <Calendar className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{formatDate(date)}</h2>
          <p className="text-sm text-gray-500">歷史掃描結果</p>
        </div>
      </div>

      {/* Summary cards */}
      <SummaryCards data={scanResult} />

      {/* Top 10 table */}
      <div className="mt-8">
        <Top10Table data={scanResult} />
      </div>

      {/* Backtest section */}
      {btRec && (
        <div className="mt-8">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-blue-600" /> 回測績效
          </h3>

          {/* Period tabs */}
          <div className="flex gap-2 mb-4">
            {(['T1','T3','T5'] as const).map(k => {
              const p = btRec.periods[k];
              if (!p) return null;
              return (
                <button
                  key={k}
                  onClick={() => setActivePeriod(k)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activePeriod === k
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {p.label}
                  {!p.pending && p.win_rate != null && (
                    <span className="ml-1 opacity-80">{p.win_rate.toFixed(0)}%</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Period detail */}
          {period && (
            <div className="bg-gray-50 rounded-xl p-4">
              {period.pending ? (
                <p className="text-gray-400 text-sm text-center py-4">驗證中，尚未到期</p>
              ) : (
                <>
                  <div className="flex gap-6 mb-4 text-sm">
                    <div>
                      <span className="text-gray-500">勝率</span>
                      <span className={`ml-2 font-bold ${(period.win_rate ?? 0) >= 60 ? 'text-green-600' : (period.win_rate ?? 0) >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>
                        {period.win_rate?.toFixed(1) ?? '-'}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">平均報酬</span>
                      <span className={`ml-2 font-bold ${(period.avg_return ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {(period.avg_return ?? 0) >= 0 ? '+' : ''}{period.avg_return?.toFixed(2) ?? '-'}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">驗證日</span>
                      <span className="ml-2 text-gray-700">{period.backtest_date}</span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-200">
                          <th className="pb-2 pr-4">股票</th>
                          <th className="pb-2 pr-4">進場價</th>
                          <th className="pb-2 pr-4">停損</th>
                          <th className="pb-2 pr-4">收盤</th>
                          <th className="pb-2 pr-4">報酬</th>
                          <th className="pb-2">結果</th>
                        </tr>
                      </thead>
                      <tbody>
                        {period.stocks.map(s => (
                          <tr key={s.stock_id} className="border-b border-gray-100 last:border-0">
                            <td className="py-2 pr-4">
                              <span className="font-medium text-gray-900">{s.stock_id}</span>
                              <span className="text-gray-500 ml-1 text-xs">{s.name}</span>
                            </td>
                            <td className="py-2 pr-4 text-gray-700">{s.entry?.toFixed(2) ?? '-'}</td>
                            <td className="py-2 pr-4 text-gray-500">{s.stop_loss?.toFixed(2) ?? '-'}</td>
                            <td className="py-2 pr-4 text-gray-700">{s.close?.toFixed(2) ?? '-'}</td>
                            <td className={`py-2 pr-4 font-medium ${s.pending ? 'text-gray-400' : (s.return_pct ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {s.pending ? '待驗證' : `${(s.return_pct ?? 0) >= 0 ? '+' : ''}${s.return_pct?.toFixed(2) ?? '-'}%`}
                            </td>
                            <td className="py-2">
                              {s.pending ? (
                                <span className="text-xs text-gray-400">待驗證</span>
                              ) : s.hit_target ? (
                                <span className="text-xs text-green-600 font-medium">達標</span>
                              ) : s.hit_stoploss ? (
                                <span className="text-xs text-red-500 font-medium">停損</span>
                              ) : (
                                <span className="text-xs text-gray-500">持有中</span>
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
