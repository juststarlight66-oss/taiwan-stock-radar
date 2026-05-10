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
  const [loadingBacktest, setLoadingBacktest] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const PAGE_SIZE = 10;

  // Load date index
  useEffect(() => {
    if (initialDates) return;
    fetch(`${BASE}/data/index.json`)
      .then(r => r.json())
      .then(d => {
        const list: string[] = (d.dates ?? []).slice().reverse();
        setDates(list);
        if (list.length > 0) setSelectedDate(list[0]);
      })
      .catch(() => setDates([]))
      .finally(() => setLoadingIndex(false));
  }, [initialDates]);

  // Set initial selected date
  useEffect(() => {
    if (!selectedDate && dates.length > 0) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  // Load backtest data when date changes
  useEffect(() => {
    if (!selectedDate) return;
    setLoadingBacktest(true);
    const ds = selectedDate.replace(/-/g,'');
    fetch(`${BASE}/data/backtest.json`)
      .then(r => r.json())
      .then(raw => {
        const bt = normalizeBacktest(raw);
        setBacktest(bt);
      })
      .catch(() => setBacktest(null))
      .finally(() => setLoadingBacktest(false));
  }, [selectedDate]);

  const { data: scanData, isLoading: scanLoading } = useDateScan(selectedDate);
  const displayData = scanData ?? (selectedDate ? null : demoScanResult);

  const currentIndex = dates.findIndex(d => normDate(d) === normDate(selectedDate ?? ''));
  const canPrev = currentIndex > 0;
  const canNext = currentIndex < dates.length - 1 && currentIndex !== -1;

  function goDate(delta: number) {
    const ni = currentIndex + delta;
    if (ni >= 0 && ni < dates.length) {
      setSelectedDate(dates[ni]);
      setCurrentPage(0);
    }
  }

  // Find backtest record for selected date
  const btRecord = backtest?.grouped_records.find(
    r => normDate(r.scan_date) === normDate(selectedDate ?? '')
  ) ?? null;

  const periodData = btRecord?.periods?.[activePeriod] ?? null;

  // Filter stocks by search
  const filteredStocks = (periodData?.stocks ?? []).filter(s =>
    !searchQuery ||
    s.stock_id.includes(searchQuery) ||
    s.name.includes(searchQuery)
  );

  const pageStocks = filteredStocks.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filteredStocks.length / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Date Navigation */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium text-gray-700">歷史回測</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => goDate(1)}
              disabled={!canNext}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>

            <select
              value={selectedDate ?? ''}
              onChange={e => { setSelectedDate(e.target.value); setCurrentPage(0); }}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {loadingIndex ? (
                <option>載入中…</option>
              ) : dates.length === 0 ? (
                <option value="">無資料</option>
              ) : (
                dates.map(d => (
                  <option key={d} value={d}>{formatDate(d)}</option>
                ))
              )}
            </select>

            <button
              onClick={() => goDate(-1)}
              disabled={!canPrev}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          {/* Period tabs */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {(['T1','T3','T5'] as const).map(p => (
              <button
                key={p}
                onClick={() => { setActivePeriod(p); setCurrentPage(0); }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activePeriod === p
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p === 'T1' ? 'T+1' : p === 'T3' ? 'T+3' : 'T+5'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scan result for selected date */}
      {scanLoading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-6 text-center text-gray-400 text-sm">
          <Clock className="w-5 h-5 mx-auto mb-2 animate-spin" />
          載入掃描資料…
        </div>
      ) : displayData ? (
        <div className="space-y-3">
          <SummaryCards data={displayData} />
          <Top10Table stocks={displayData.top10} scanDate={displayData.scan_date} />
        </div>
      ) : selectedDate ? (
        <div className="bg-white rounded-xl border border-gray-100 p-6 text-center text-gray-400 text-sm">
          {formatDate(selectedDate)} 無掃描資料
        </div>
      ) : null}

      {/* Backtest panel */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-violet-500" />
            <span className="text-sm font-semibold text-gray-700">
              {selectedDate ? formatDate(selectedDate) : '—'} 回測結果
              {periodData && !periodData.pending && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  勝率 {periodData.win_rate != null ? `${(periodData.win_rate * 100).toFixed(0)}%` : '—'}
                  ／均報酬 {periodData.avg_return != null ? `${periodData.avg_return > 0 ? '+' : ''}${periodData.avg_return.toFixed(1)}%` : '—'}
                </span>
              )}
              {periodData?.pending && (
                <span className="ml-2 text-xs font-normal text-amber-500">持倉驗證中</span>
              )}
            </span>
          </div>

          {filteredStocks.length > 0 && (
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="搜尋股票…"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(0); }}
                className="pl-7 pr-3 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 w-36"
              />
            </div>
          )}
        </div>

        {loadingBacktest ? (
          <div className="p-6 text-center text-gray-400 text-sm">
            <Clock className="w-4 h-4 mx-auto mb-1 animate-spin" />
            載入回測資料…
          </div>
        ) : !periodData ? (
          <div className="p-6 text-center text-gray-400 text-sm">
            {selectedDate ? `${formatDate(selectedDate)} 尚無回測資料` : '請選擇日期'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-3 py-2 text-left text-gray-500 font-medium">股票</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-medium">進場價</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-medium">停損價</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-medium">結算價</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-medium">報酬</th>
                        <th className="px-3 py-2 text-center text-gray-500 font-medium">結果</th>
                      </tr>
                    </thead>
              <tbody className="divide-y divide-gray-50">
                {pageStocks.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">無資料</td></tr>
                ) : pageStocks.map(s => {
                  const pct = s.return_pct;
                  const isPos = pct != null && pct > 0;
                  const isNeg = pct != null && pct < 0;
                  return (
                    <tr key={s.stock_id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-3 py-2 font-medium text-gray-800">
                            {s.stock_id} <span className="text-gray-500 font-normal">{s.name}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-gray-700">
                            {s.entry ? s.entry.toLocaleString() : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-red-500">
                            {s.stop_loss != null ? s.stop_loss.toLocaleString() : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-gray-700">
                            {s.pending ? (
                              <span className="text-amber-500 text-[10px]">持倉中</span>
                            ) : s.close != null ? s.close.toLocaleString() : '—'}
                          </td>
                      <td className={`px-3 py-2 text-right font-mono font-semibold ${isPos ? 'text-red-500' : isNeg ? 'text-green-600' : 'text-gray-400'}`}>
                        {pct != null ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {s.pending ? (
                          <span className="inline-flex items-center gap-1 text-amber-500">
                            <Clock className="w-3 h-3" /><span>持倉中</span>
                          </span>
                        ) : s.hit_target ? (
                          <span className="inline-flex items-center gap-1 text-red-500">
                            <TrendingUp className="w-3 h-3" /><span>達標</span>
                          </span>
                        ) : s.hit_stoploss ? (
                          <span className="inline-flex items-center gap-1 text-green-600">
                            <TrendingDown className="w-3 h-3" /><span>停損</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-400">
                            <Minus className="w-3 h-3" /><span>出場</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-3 py-2 border-t border-gray-50 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  第 {currentPage + 1} / {totalPages} 頁，共 {filteredStocks.length} 筆
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                    className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40"
                  >
                    上一頁
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={currentPage >= totalPages - 1}
                    className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40"
                  >
                    下一頁
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
