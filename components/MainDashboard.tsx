'use client';
import { useState, useEffect, useMemo } from 'react';
import { useLatestScan, useAllScores } from '@/lib/useScanData';
import { demoScanResult } from '@/lib/demoScanData';
import SummaryCards from './SummaryCards';
import Top10Table from './Top10Table';
import HistoryBrowser from './HistoryBrowser';
import SelfCheck from './SelfCheck';
import AllResultsTable from './AllResultsTable';
import WatchlistPanel from './WatchlistPanel';
import { Activity, RefreshCw, Clock, History, Radar, Search, List, Star } from 'lucide-react';

type Tab = 'dashboard' | 'all' | 'history' | 'selfcheck' | 'watchlist';

export default function MainDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [now, setNow] = useState('');

  const { data, isLoading, error } = useLatestScan();
  const { data: allScores, isLoading: allLoading } = useAllScores();

  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString('zh-TW', {
          timeZone: 'Asia/Taipei',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
  }

  const scanData = data ?? (error ? demoScanResult : null);
  const isDemo = !data && !!error;

  const allResultsCount = allScores?.scanned_count ?? scanData?.top10?.length ?? 0;
  const allResultsDate = allScores?.scan_date ?? scanData?.scan_date;

  const allResults = allScores?.all_stock_scores ?? null;

  // trendMap: stockId -> [{date, score}, ...] (oldest first)
  const trendMap = useMemo(() => {
    const history = allScores?.history;
    if (!history) return undefined;
    const map: Record<string, { date: string; score: number }[]> = {};
    for (const day of history) {
      for (const s of day.stocks ?? []) {
        if (!map[s.stock_id]) map[s.stock_id] = [];
        map[s.stock_id].push({ date: day.date, score: s.total_score });
      }
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.date.localeCompare(b.date));
    }
    return map;
  }, [allScores]);

  // Combined stock pool for WatchlistPanel (top10 + all_results, deduped)
  const allStocksPool = useMemo(() => {
    const map = new Map();
    for (const s of scanData?.top10 ?? []) map.set(s.stock_id, s);
    for (const s of allResults ?? []) map.set(s.stock_id, s);
    return [...map.values()];
  }, [scanData, allResults]);

  return (
    <div className="min-h-dvh bg-gray-950 text-gray-100 font-sans flex flex-col">
      <header className="sticky top-0 z-20 border-b border-gray-800 bg-gray-950/90 backdrop-blur">
        <div className="max-w-screen-xl mx-auto px-4">
          <div className="flex items-center h-13 gap-4 py-2">
            <div className="flex items-center gap-2 shrink-0">
              <Radar className="w-5 h-5 text-sky-400" />
              <span className="font-bold text-white text-sm tracking-wide">台股雷達</span>
              <span className="text-gray-600 text-xs hidden sm:inline">Taiwan Stock Radar</span>
            </div>
            <nav className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => handleTabChange('dashboard')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === 'dashboard'
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                今日覆盤
              </button>
              <button
                onClick={() => handleTabChange('all')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === 'all'
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                全部結果
                {allResultsCount > 0 && (
                  <span className="bg-gray-700 text-gray-300 text-[10px] font-mono px-1.5 py-0.5 rounded-full">
                    {allResultsCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => handleTabChange('history')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === 'history'
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                歷史記錄
              </button>
              <button
                onClick={() => handleTabChange('selfcheck')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === 'selfcheck'
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                自主檢查
              </button>
              <button
                onClick={() => handleTabChange('watchlist')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === 'watchlist'
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60'
                }`}
              >
                <Star className="w-3.5 h-3.5" />
                自選股
              </button>
            </nav>
            <div className="flex items-center gap-3 shrink-0">
              {now && (
                <div className="flex items-center gap-1 text-gray-600 text-xs">
                  <Clock className="w-3 h-3" />
                  <span className="font-mono">{now}</span>
                </div>
              )}
              {isLoading && (
                <RefreshCw className="w-3.5 h-3.5 text-sky-500 animate-spin" />
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-5">
        {isDemo && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">
              尚無今日掃描資料，目前顯示示範資料。每日 22:55 自動更新。
            </p>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-5">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : scanData ? (
              <>
                <SummaryCards data={scanData} />
                <Top10Table stocks={scanData.top10} trendMap={trendMap} />
              </>
            ) : null}
          </div>
        )}

        {activeTab === 'all' && (
          <div className="space-y-5">
            {allLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <AllResultsTable
                stocks={allResults ?? scanData?.top10 ?? []}
                scanDate={allResultsDate ?? ''}
              />
            )}
          </div>
        )}

        {activeTab === 'history' && <HistoryBrowser />}
        {activeTab === 'selfcheck' && <SelfCheck />}
        {activeTab === 'watchlist' && (
          <WatchlistPanel allStocksPool={allStocksPool} />
        )}
      </main>
    </div>
  );
}
