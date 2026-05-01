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
  records: BacktestRecord[];
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

// ── Component ────────────────────────────────────────────────────
export default function HistoryBrowser({ initialDates }: Props) {
  const [dates, setDates]             = useState<string[]>(initialDates ?? []);
  const [loadingIndex, setLoadingIndex] = useState(!initialDates);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [backtest, setBacktest]       = useState<BacktestData | null>(null);
  const [activePeriod, setActivePeriod] = useState<'T1'|'T3'|'T5'>('T1');

  // Load index.json
  useEffect(() => {
    if (initialDates) return;
    fetch(`${BASE}/data/index.json`)
      .then(r => r.json())
      .then(d => {
        const list: string[] = d.dates ?? [];
        setDates(list.sort().reverse());
        if (list.length > 0) setSelectedDate(list[0]);
      })
      .catch(() => { setDates(['2026-04-28']); setSelectedDate('2026-04-28'); })
      .finally(() => setLoadingIndex(false));
  }, [initialDates]);

  useEffect(() => {
    if (initialDates && initialDates.length > 0 && !selectedDate)
      setSelectedDate(initialDates[0]);
  }, [initialDates, selectedDate]);

  // Load backtest.json
  useEffect(() => {
    fetch(`${BASE}/data/backtest.json`)
      .then(r => r.json())
      .then((d: BacktestData) => setBacktest(d))
      .catch(() => {});
  }, []);

  const { data: scanData, isLoading, error } = useDateScan(selectedDate);

  const filteredDates = searchQuery
    ? dates.filter(d => d.replace(/-/g,'').includes(searchQuery.replace(/\D/g,'')))
    : dates;

  const currentIdx  = selectedDate ? filteredDates.indexOf(selectedDate) : -1;
  const displayData = scanData ?? (error || !selectedDate ? demoScanResult : null);
  const isDemo      = !scanData && (!!error || !selectedDate);

  const btRecord = backtest?.records.find(
    r => selectedDate && normDate(r.scan_date) === normDate(selectedDate)
  ) ?? null;

  const periodData = btRecord?.periods[activePeriod] ?? null;
  const PERIODS: { key: 'T1'|'T3'|'T5'; label: string }[] = [
    { key: 'T1', label: 'T+1' },
    { key: 'T3', label: 'T+3' },
    { key: 'T5', label: 'T+5' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

        {/* ── 左側日期列 (白底) ── */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">

            {/* header */}
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-sky-500" />
              <h3 className="text-sm font-semibold text-gray-700">歷史掃描記錄</h3>
            </div>

            {/* search */}
            <div className="px-3 py-2.5 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="搜尋日期…"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:border-sky-400 focus:bg-white transition-colors"
                />
              </div>
            </div>

            {/* nav arrows */}
            {selectedDate && filteredDates.length > 1 && (
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                <button
                  onClick={() => currentIdx > 0 && setSelectedDate(filteredDates[currentIdx - 1])}
                  disabled={currentIdx <= 0}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-500 hover:text-gray-800 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[11px] text-gray-400 font-mono">
                  {currentIdx + 1} / {filteredDates.length}
                </span>
                <button
                  onClick={() => currentIdx < filteredDates.length - 1 && setSelectedDate(filteredDates[currentIdx + 1])}
                  disabled={currentIdx >= filteredDates.length - 1}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-500 hover:text-gray-800 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* date list */}
            <div className="max-h-80 lg:max-h-[560px] overflow-y-auto divide-y divide-gray-100">
              {loadingIndex ? (
                <div className="p-4 text-center text-xs text-gray-400">載入中...</div>
              ) : filteredDates.length === 0 ? (
                <div className="p-6 text-center">
                  <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">尚無歷史記錄</p>
                  <p className="text-[10px] text-gray-400 mt-1">每日 22:55 掃描後自動更新</p>
                </div>
              ) : (
                filteredDates.map(d => {
                  const isSelected = d === selectedDate;
                  const bt = backtest?.records.find(r => normDate(r.scan_date) === normDate(d));
                  const t1 = bt?.periods?.T1;
                  return (
                    <button
                      key={d}
                      onClick={() => setSelectedDate(d)}
                      className={`w-full text-left px-4 py-3 transition-all flex items-start justify-between gap-2 ${
                        isSelected
                          ? 'bg-sky-50 border-l-2 border-sky-400'
                          : 'bg-white hover:bg-gray-50 border-l-2 border-transparent'
                      }`}
                    >
                      <div>
                        <div className={`text-xs font-semibold ${isSelected ? 'text-sky-600' : 'text-gray-700'}`}>
                          {formatDate(d)}
                        </div>
                        {t1 && !t1.pending && t1.win_rate !== null && (
                          <div className={`text-[10px] mt-0.5 font-mono ${(t1.win_rate ?? 0) >= 60 ? 'text-emerald-600' : 'text-amber-600'}`}>
                            T+1 勝率 {t1.win_rate}% · 均 {(t1.avg_return ?? 0) > 0 ? '+' : ''}{t1.avg_return}%
                          </div>
                        )}
                      </div>
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mt-1.5 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── 右側結果區 ── */}
        <div className="lg:col-span-3 space-y-5">
          {isLoading ? (
            <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
              <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-500">載入 {selectedDate} 資料中...</p>
            </div>
          ) : displayData ? (
            <>
              <SummaryCards data={displayData} />
              <Top10Table
                stocks={displayData.top10}
                scanDate={displayData.scan_date}
                scannedCount={displayData.scanned_count}
                isDemo={isDemo}
              />
            </>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
              <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-400">請從左側選擇查詢日期</p>
            </div>
          )}

          {/* ── 回測驗證區塊 (白底 + T+1/T+3/T+5 tab) ── */}
          {btRecord && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">

              {/* header */}
              <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-sky-500" />
                  <h3 className="text-sm font-semibold text-gray-700">回測驗證</h3>
                  <span className="text-[11px] text-gray-400">
                    {formatDate(btRecord.scan_date)} 推薦
                  </span>
                </div>

                {/* T+1 / T+3 / T+5 tabs */}
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                  {PERIODS.map(({ key, label }) => {
                    const pd = btRecord.periods[key];
                    const isActive = activePeriod === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setActivePeriod(key)}
                        className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                          isActive
                            ? 'bg-white text-sky-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {label}
                        {pd.pending && (
                          <span className="ml-1 text-[9px] text-amber-500 font-normal">待更新</span>
                        )}
                        {!pd.pending && pd.win_rate !== null && (
                          <span className={`ml-1 text-[9px] font-normal ${pd.win_rate >= 60 ? 'text-emerald-500' : 'text-amber-500'}`}>
                            {pd.win_rate}%
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* period summary badges */}
              {periodData && (
                <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
                  {periodData.pending ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-600 text-xs font-medium">
                      <Clock className="w-3.5 h-3.5" />
                      {periodData.label} 驗證日 {formatDate(periodData.backtest_date)} — 尚未到期，待收盤後更新
                    </span>
                  ) : (
                    <>
                      <span className="text-xs text-gray-400">
                        驗證日：<strong className="text-gray-600">{formatDate(periodData.backtest_date)}</strong>
                      </span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        (periodData.win_rate ?? 0) >= 70
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : (periodData.win_rate ?? 0) >= 50
                          ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : 'bg-red-50 border-red-200 text-red-700'
                      }`}>
                        勝率 {periodData.win_rate}%
                      </span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        (periodData.avg_return ?? 0) >= 0
                          ? 'bg-sky-50 border-sky-200 text-sky-700'
                          : 'bg-red-50 border-red-200 text-red-700'
                      }`}>
                        均報酬 {(periodData.avg_return ?? 0) > 0 ? '+' : ''}{periodData.avg_return}%
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* table */}
              {periodData && !periodData.pending && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-4 py-2.5 text-gray-500 font-medium">代號</th>
                        <th className="text-left px-3 py-2.5 text-gray-500 font-medium">名稱</th>
                        <th className="text-right px-3 py-2.5 text-gray-500 font-medium">推薦進場</th>
                        <th className="text-right px-3 py-2.5 text-gray-500 font-medium">驗證收盤</th>
                        <th className="text-right px-4 py-2.5 text-gray-500 font-medium">報酬</th>
                        <th className="text-center px-4 py-2.5 text-gray-500 font-medium">結果</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {periodData.stocks.map(s => {
                        const pos = (s.return_pct ?? 0) > 0;
                        const neg = (s.return_pct ?? 0) < 0;
                        return (
                          <tr key={s.stock_id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-2.5 font-mono text-gray-600 font-medium">{s.stock_id}</td>
                            <td className="px-3 py-2.5 text-gray-800 font-medium">{s.name}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-gray-600">{s.entry.toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-gray-600">
                              {s.close !== null ? s.close.toFixed(2) : '—'}
                            </td>
                            <td className={`px-4 py-2.5 text-right font-mono font-bold ${pos ? 'text-emerald-600' : neg ? 'text-red-500' : 'text-gray-400'}`}>
                              {s.return_pct !== null ? `${pos ? '+' : ''}${s.return_pct.toFixed(2)}%` : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {s.hit_target ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold">
                                  <TrendingUp className="w-3 h-3" /> 達標
                                </span>
                              ) : s.hit_stoploss ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-semibold">
                                  <TrendingDown className="w-3 h-3" /> 停損
                                </span>
                              ) : pos ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-semibold">
                                  ✅ 獲利
                                </span>
                              ) : neg ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-500 text-[10px] font-semibold">
                                  ❌ 虧損
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px]">
                                  <Minus className="w-3 h-3" /> 持平
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* footer */}
              {periodData && !periodData.pending && (
                <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center gap-4 text-[11px] text-gray-500 flex-wrap">
                  <span>共 <strong className="text-gray-700">{periodData.stocks.length}</strong> 檔</span>
                  <span className="text-emerald-600">獲利 {periodData.stocks.filter(s => (s.return_pct ?? 0) > 0).length} 檔</span>
                  <span className="text-red-500">虧損 {periodData.stocks.filter(s => (s.return_pct ?? 0) < 0).length} 檔</span>
                  <span className="text-amber-600">達目標 {periodData.stocks.filter(s => s.hit_target).length} 檔</span>
                  <span className="text-rose-500">觸停損 {periodData.stocks.filter(s => s.hit_stoploss).length} 檔</span>
                  <span className="ml-auto text-gray-400">資料來源：TWSE 收盤價</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
