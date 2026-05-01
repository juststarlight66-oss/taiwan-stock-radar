'use client';
import { useState, useEffect } from 'react';
import { useDateScan } from '@/lib/useScanData';
import Top10Table from './Top10Table';
import SummaryCards from './SummaryCards';
import { demoScanResult } from '@/lib/demoScanData';
import { Calendar, ChevronLeft, ChevronRight, Search, Clock } from 'lucide-react';

const BASE = '/taiwan-stock-radar';

interface Props {
  initialDates?: string[];
}

function formatDate(d: string) {
  // accepts YYYYMMDD or YYYY-MM-DD
  const s = d.replace(/-/g, '');
  if (s.length !== 8) return d;
  return `${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(6, 8)}`;
}

function toISO(d: string) {
  const s = d.replace(/-/g, '');
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export default function HistoryBrowser({ initialDates }: Props) {
  const [dates, setDates] = useState<string[]>(initialDates ?? []);
  const [loadingIndex, setLoadingIndex] = useState(!initialDates);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Load index.json client-side
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
        // fallback to demo date
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

  const { data: scanData, isLoading, error } = useDateScan(selectedDate);

  const filteredDates = searchQuery
    ? dates.filter((d) => d.replace(/-/g, '').includes(searchQuery.replace(/\D/g, '')))
    : dates;

  const currentIdx = selectedDate ? filteredDates.indexOf(selectedDate) : -1;

  const displayData = scanData ?? (error || !selectedDate ? demoScanResult : null);
  const isDemo = !scanData && (!!error || !selectedDate);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Date selector sidebar */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700/60 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-gray-200">歷史記錄</h3>
            </div>

            {/* Search */}
            <div className="px-3 py-2 border-b border-gray-700/40">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜尋日期 (e.g. 20260428)"
                  className="w-full bg-gray-800 border border-gray-600/40 rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-sky-500/60"
                />
              </div>
            </div>

            {/* Navigation arrows */}
            {selectedDate && filteredDates.length > 1 && (
              <div className="px-3 py-2 border-b border-gray-700/40 flex items-center justify-between">
                <button
                  onClick={() => currentIdx > 0 && setSelectedDate(filteredDates[currentIdx - 1])}
                  disabled={currentIdx <= 0}
                  className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-400 hover:text-gray-200 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[11px] text-gray-400">
                  {currentIdx + 1} / {filteredDates.length}
                </span>
                <button
                  onClick={() => currentIdx < filteredDates.length - 1 && setSelectedDate(filteredDates[currentIdx + 1])}
                  disabled={currentIdx >= filteredDates.length - 1}
                  className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-400 hover:text-gray-200 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Date list */}
            <div className="max-h-80 lg:max-h-[600px] overflow-y-auto">
              {loadingIndex ? (
                <div className="p-4 text-center text-xs text-gray-500">載入日期索引中...</div>
              ) : filteredDates.length === 0 ? (
                <div className="p-4 text-center">
                  <Clock className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">尚無歷史記錄</p>
                  <p className="text-[10px] text-gray-600 mt-1">每日 22:55 掃錨後自動更新</p>
                </div>
              ) : (
                filteredDates.map((d) => {
                  const isSelected = d === selectedDate;
                  return (
                    <button
                      key={d}
                      onClick={() => setSelectedDate(d)}
                      className={`w-full text-left px-4 py-2.5 text-xs border-b border-gray-700/20 transition-colors flex items-center justify-between ${
                        isSelected
                          ? 'bg-sky-500/15 text-sky-300 border-sky-500/20'
                          : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
                      }`}
                    >
                      <span>{formatDate(d)}</span>
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Result panel */}
        <div className="lg:col-span-3 space-y-4">
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
        </div>
      </div>
    </div>
  );
}
