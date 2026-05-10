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

  // Load date index
  useEffect(() => {
    if (initialDates) return;
    fetch(`${BASE}/data/index.json`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.dates) setDates(d.dates);
      })
      .catch(() => {})
      .finally(() => setLoadingIndex(false));
  }, [initialDates]);

  // Auto-select newest date
  useEffect(() => {
    if (!selectedDate && dates.length > 0) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  // Load backtest.json
  useEffect(() => {
    fetch(`${BASE}/data/backtest.json`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setBacktest(d ? normalizeBacktest(d) : null))
      .catch(() => setBacktest(null));
  }, []);

  // ── Derived state ────────────────────────────────────────────────
  const sortedDates = [...dates].sort((a, b) => normDate(b).localeCompare(normDate(a)));
  const filteredDates = searchQuery
    ? sortedDates.filter(d => d.includes(searchQuery))
    : sortedDates;

  const record = backtest?.grouped_records.find(r => normDate(r.scan_date) === normDate(selectedDate ?? ''));
  const period = record?.periods?.[activePeriod];

  // ── Render helpers ────────────────────────────────────────────────
  const ReturnBadge = ({ pct }: { pct: number | null }) => {
    if (pct === null) return <span className="text-gray-400 text-xs">待驗證</span>;
    const color = pct > 0 ? 'text-red-500' : pct < 0 ? 'text-green-600' : 'text-gray-500';
    const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
    return (
      <span className={`flex items-center gap-0.5 font-mono text-sm font-semibold ${color}`}>
        <Icon size={12} />
        {pct > 0 ? '+' : ''}{pct.toFixed(2)}%
      </span>
    );
  };

  // ── useDateScan hook for top10 display ────────────────────────────
  const { data: scanData } = useDateScan(selectedDate ?? '');

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="flex gap-4 h-full min-h-0">
      {/* Left sidebar: date list */}
      <aside className="w-52 shrink-0 flex flex-col gap-2">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="搜尋日期…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Date list */}
        <div className="flex-1 overflow-y-auto space-y-1">
          {loadingIndex ? (
            <p className="text-xs text-gray-400 text-center py-4">載入中…</p>
          ) : filteredDates.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">無資料</p>
          ) : filteredDates.map(d => {
            const norm = normDate(d);
            const isSelected = selectedDate ? normDate(selectedDate) === norm : false;
            const rec = backtest?.grouped_records.find(r => normDate(r.scan_date) === norm);
            const t1 = rec?.periods?.T1;
            const wr = t1?.win_rate;
            return (
              <button
                key={d}
                onClick={() => setSelectedDate(d)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-100'
                }`}
              >
                <div className="font-medium">{formatDate(d)}</div>
                {wr !== null && wr !== undefined ? (
                  <div className={`text-[11px] mt-0.5 ${isSelected ? 'text-blue-100' : wr >= 60 ? 'text-red-500' : 'text-gray-400'}`}>
                    T+1勝率 {wr.toFixed(0)}%
                  </div>
                ) : (
                  <div className={`text-[11px] mt-0.5 ${isSelected ? 'text-blue-200' : 'text-gray-300'}`}>待驗證</div>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col gap-4 overflow-y-auto">
        {!selectedDate ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Calendar size={40} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">選擇左側日期查看歷史推薦</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <Calendar size={16} className="text-blue-500" />
                {formatDate(selectedDate)} 推薦回測
              </h2>
              {/* Period tabs */}
              <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                {(['T1','T3','T5'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setActivePeriod(p)}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
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

            {/* Period summary cards */}
            {period ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
                  <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <BarChart2 size={11} /> 勝率
                  </div>
                  <div className={`text-xl font-bold ${
                    period.win_rate === null ? 'text-gray-300' :
                    period.win_rate >= 70 ? 'text-red-500' :
                    period.win_rate >= 50 ? 'text-orange-500' : 'text-gray-500'
                  }`}>
                    {period.win_rate === null ? '—' : `${period.win_rate.toFixed(0)}%`}
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
                  <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <TrendingUp size={11} /> 平均報酬
                  </div>
                  <div className={`text-xl font-bold ${
                    period.avg_return === null ? 'text-gray-300' :
                    period.avg_return > 0 ? 'text-red-500' :
                    period.avg_return < 0 ? 'text-green-600' : 'text-gray-500'
                  }`}>
                    {period.avg_return === null ? '—' : `${period.avg_return > 0 ? '+' : ''}${period.avg_return.toFixed(2)}%`}
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
                  <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <Clock size={11} /> 回測日期
                  </div>
                  <div className="text-sm font-semibold text-gray-700">
                    {period.backtest_date ? formatDate(period.backtest_date) : (period.pending ? '待驗證' : '—')}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 text-center">
                尚無回測資料
              </div>
            )}

            {/* Stocks table */}
            {period?.stocks && period.stocks.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-left">
                      <th className="px-3 py-2 font-medium">股票</th>
                      <th className="px-3 py-2 font-medium text-right">進場價</th>
                      <th className="px-3 py-2 font-medium text-right">收盤價</th>
                      <th className="px-3 py-2 font-medium text-right">報酬率</th>
                      <th className="px-3 py-2 font-medium text-center">結果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {period.stocks.map((s, i) => (
                      <tr key={s.stock_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-800">{s.stock_id}</div>
                          <div className="text-gray-400">{s.name}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-gray-600">
                          {s.entry ? s.entry.toFixed(2) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-gray-600">
                          {s.close !== null ? s.close.toFixed(2) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <ReturnBadge pct={s.return_pct} />
                        </td>
                        <td className="px-3 py-2 text-center">
                          {s.pending ? (
                            <span className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded text-[10px]">待驗</span>
                          ) : s.hit_target ? (
                            <span className="inline-block px-1.5 py-0.5 bg-red-50 text-red-500 rounded text-[10px]">獲利</span>
                          ) : (
                            <span className="inline-block px-1.5 py-0.5 bg-green-50 text-green-600 rounded text-[10px]">虧損</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-gray-100 pt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">當日推薦明細</h3>
              {scanData ? (
                <>
                  <SummaryCards data={scanData} />
                  <Top10Table stocks={scanData.top10 ?? []} />
                </>
              ) : (
                <p className="text-xs text-gray-400 text-center py-6">載入中…</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
