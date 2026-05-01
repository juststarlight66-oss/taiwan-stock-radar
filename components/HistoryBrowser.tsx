'use client';
import { useState, useEffect } from 'react';
import { useDateScan } from '@/lib/useScanData';
import Top10Table from './Top10Table';
import SummaryCards from './SummaryCards';
import { demoScanResult } from '@/lib/demoScanData';
import { Calendar, ChevronLeft, ChevronRight, Search, Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react';

const BASE = '/taiwan-stock-radar';

interface BacktestStock {
  stock_id: string;
  name: string;
  entry: number;
  close: number;
  return_pct: number;
  hit_target: boolean;
  hit_stoploss: boolean;
}

interface BacktestRecord {
  scan_date: string;
  backtest_date: string;
  period: string;
  win_rate: number;
  avg_return: number;
  stocks: BacktestStock[];
}

interface BacktestData {
  version: number;
  records: BacktestRecord[];
}

interface Props {
  initialDates?: string[];
}

function formatDate(d: string) {
  const s = d.replace(/-/g, '');
  if (s.length !== 8) return d;
  return `${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(6, 8)}`;
}

function toISO(d: string) {
  const s = d.replace(/-/g, '');
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

// normalise to YYYY-MM-DD for comparison
function normDate(d: string) {
  return toISO(d.replace(/\//g, '').replace(/-/g, ''));
}

export default function HistoryBrowser({ initialDates }: Props) {
  const [dates, setDates] = useState<string[]>(initialDates ?? []);
  const [loadingIndex, setLoadingIndex] = useState(!initialDates);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [backtest, setBacktest] = useState<BacktestData | null>(null);

  // Load index.json
  useEffect(() => {
    if (initialDates) return;
    fetch(`${BASE}/data/index.json`)
      .then((r) => r.json())
      .then((d) => {
        const list: string[] = d.dates ?? [];
        setDates(list.sort().reverse());
        if (list.length > 0) setSelectedDate(list[0]);
      })
      .catch(() => {
        setDates(['2026-04-28']);
        setSelectedDate('2026-04-28');
      })
      .finally(() => setLoadingIndex(false));
  }, [initialDates]);

  useEffect(() => {
    if (initialDates && initialDates.length > 0 && !selectedDate) {
      setSelectedDate(initialDates[0]);
    }
  }, [initialDates, selectedDate]);

  // Load backtest.json once
  useEffect(() => {
    fetch(`${BASE}/data/backtest.json`)
      .then((r) => r.json())
      .then((d: BacktestData) => setBacktest(d))
      .catch(() => {});
  }, []);

  const { data: scanData, isLoading, error } = useDateScan(selectedDate);

  const filteredDates = searchQuery
    ? dates.filter((d) => d.replace(/-/g, '').includes(searchQuery.replace(/\D/g, '')))
    : dates;

  const currentIdx = selectedDate ? filteredDates.indexOf(selectedDate) : -1;
  const displayData = scanData ?? (error || !selectedDate ? demoScanResult : null);
  const isDemo = !scanData && (!!error || !selectedDate);

  // Find backtest record for selected date
  const btRecord = backtest?.records.find(
    (r) => selectedDate && normDate(r.scan_date) === normDate(selectedDate)
  ) ?? null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

        {/* ── 左側日期列 ── */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-gray-700/50 bg-gray-900 overflow-hidden shadow-lg">

            {/* header */}
            <div className="px-4 py-3 border-b border-gray-700/50 bg-gray-800/60 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-gray-100">歷史掃描記錄</h3>
            </div>

            {/* search */}
            <div className="px-3 py-2.5 border-b border-gray-700/40 bg-gray-850">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜尋日期…"
                  className="w-full bg-gray-700/50 border border-gray-600/50 rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-sky-500/60 focus:bg-gray-700"
                />
              </div>
            </div>

            {/* nav arrows */}
            {selectedDate && filteredDates.length > 1 && (
              <div className="px-3 py-2 border-b border-gray-700/40 bg-gray-800/30 flex items-center justify-between">
                <button
                  onClick={() => currentIdx > 0 && setSelectedDate(filteredDates[currentIdx - 1])}
                  disabled={currentIdx <= 0}
                  className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-300 hover:text-white transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[11px] text-gray-400 font-mono">
                  {currentIdx + 1} / {filteredDates.length}
                </span>
                <button
                  onClick={() => currentIdx < filteredDates.length - 1 && setSelectedDate(filteredDates[currentIdx + 1])}
                  disabled={currentIdx >= filteredDates.length - 1}
                  className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-300 hover:text-white transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* date list */}
            <div className="max-h-80 lg:max-h-[560px] overflow-y-auto divide-y divide-gray-700/20">
              {loadingIndex ? (
                <div className="p-4 text-center text-xs text-gray-400">載入中...</div>
              ) : filteredDates.length === 0 ? (
                <div className="p-6 text-center">
                  <Clock className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">尚無歷史記錄</p>
                  <p className="text-[10px] text-gray-500 mt-1">每日 22:55 掃描後自動更新</p>
                </div>
              ) : (
                filteredDates.map((d) => {
                  const isSelected = d === selectedDate;
                  const bt = backtest?.records.find((r) => normDate(r.scan_date) === normDate(d));
                  return (
                    <button
                      key={d}
                      onClick={() => setSelectedDate(d)}
                      className={`w-full text-left px-4 py-3 transition-all flex items-start justify-between gap-2 ${
                        isSelected
                          ? 'bg-sky-500/15 border-l-2 border-sky-400'
                          : 'bg-gray-900 hover:bg-gray-800/70 border-l-2 border-transparent'
                      }`}
                    >
                      <div>
                        <div className={`text-xs font-medium ${isSelected ? 'text-sky-300' : 'text-gray-200'}`}>
                          {formatDate(d)}
                        </div>
                        {bt && (
                          <div className={`text-[10px] mt-0.5 font-mono ${bt.win_rate >= 60 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            勝率 {bt.win_rate}% · 均 {bt.avg_return > 0 ? '+' : ''}{bt.avg_return}%
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
            <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-12 text-center">
              <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-400">載入 {selectedDate} 資料中...</p>
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
            <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-12 text-center">
              <Calendar className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-400">請從左側選擇查詢日期</p>
            </div>
          )}

          {/* ── T+1 回測結果 ── */}
          {btRecord && (
            <div className="rounded-xl border border-gray-700/50 bg-gray-900 overflow-hidden">
              {/* header */}
              <div className="px-5 py-3.5 border-b border-gray-700/50 bg-gray-800/50 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-gray-100">
                    {btRecord.period} 回測驗證
                    <span className="ml-2 text-[11px] text-gray-400 font-normal">
                      {formatDate(btRecord.scan_date)} 推薦 → {formatDate(btRecord.backtest_date)} 收盤
                    </span>
                  </h3>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className={`px-2.5 py-1 rounded-full font-semibold ${btRecord.win_rate >= 70 ? 'bg-emerald-500/20 text-emerald-300' : btRecord.win_rate >= 50 ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}`}>
                    勝率 {btRecord.win_rate}%
                  </span>
                  <span className={`px-2.5 py-1 rounded-full font-semibold ${btRecord.avg_return >= 0 ? 'bg-sky-500/20 text-sky-300' : 'bg-red-500/20 text-red-300'}`}>
                    均報酬 {btRecord.avg_return > 0 ? '+' : ''}{btRecord.avg_return}%
                  </span>
                </div>
              </div>

              {/* table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-700/50 bg-gray-800/30">
                      <th className="text-left px-4 py-2.5 text-gray-400 font-medium">代號</th>
                      <th className="text-left px-3 py-2.5 text-gray-400 font-medium">名稱</th>
                      <th className="text-right px-3 py-2.5 text-gray-400 font-medium">推薦進場</th>
                      <th className="text-right px-3 py-2.5 text-gray-400 font-medium">驗證收盤</th>
                      <th className="text-right px-4 py-2.5 text-gray-400 font-medium">報酬</th>
                      <th className="text-center px-4 py-2.5 text-gray-400 font-medium">結果</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/20">
                    {btRecord.stocks.map((s) => {
                      const pos = s.return_pct > 0;
                      const neg = s.return_pct < 0;
                      return (
                        <tr key={s.stock_id} className="hover:bg-gray-800/30 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-gray-300">{s.stock_id}</td>
                          <td className="px-3 py-2.5 text-gray-200 font-medium">{s.name}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-gray-300">{s.entry.toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-gray-300">{s.close.toFixed(2)}</td>
                          <td className={`px-4 py-2.5 text-right font-mono font-semibold ${pos ? 'text-emerald-400' : neg ? 'text-red-400' : 'text-gray-400'}`}>
                            {pos ? '+' : ''}{s.return_pct.toFixed(2)}%
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {s.hit_target ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-medium">
                                <TrendingUp className="w-3 h-3" /> 達標
                              </span>
                            ) : s.hit_stoploss ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 text-[10px] font-medium">
                                <TrendingDown className="w-3 h-3" /> 停損
                              </span>
                            ) : pos ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 text-[10px] font-medium">
                                ✅ 獲利
                              </span>
                            ) : neg ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-medium">
                                ❌ 虧損
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-700/50 text-gray-400 text-[10px]">
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

              {/* footer summary */}
              <div className="px-5 py-3 border-t border-gray-700/40 bg-gray-800/20 flex items-center gap-4 text-[11px] text-gray-400 flex-wrap">
                <span>共 <strong className="text-gray-200">{btRecord.stocks.length}</strong> 檔</span>
                <span className="text-emerald-400">獲利 {btRecord.stocks.filter(s => s.return_pct > 0).length} 檔</span>
                <span className="text-red-400">虧損 {btRecord.stocks.filter(s => s.return_pct < 0).length} 檔</span>
                <span className="text-amber-400">達目標 {btRecord.stocks.filter(s => s.hit_target).length} 檔</span>
                <span className="text-rose-400">觸停損 {btRecord.stocks.filter(s => s.hit_stoploss).length} 檔</span>
                <span className="ml-auto text-gray-500">資料來源：TWSE 收盤價</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
