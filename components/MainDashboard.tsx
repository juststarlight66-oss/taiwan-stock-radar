'use client';
import { useState, useEffect, useMemo } from 'react';
import { useLatestScan, useAllScores, useAllStocksIndex } from '@/lib/useScanData';
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
  const [allTabVisited, setAllTabVisited] = useState(false);
  const [now, setNow] = useState('');

  const { data, isLoading, error } = useLatestScan();
  // Lightweight index: always loaded (~120KB), used for badge count + SelfCheck search
  const { data: indexData } = useAllStocksIndex();
  // Full all_scores: only loaded after user visits the 'all' tab
  const { data: allScores, isLoading: allLoading } = useAllScores(allTabVisited);

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
    if (tab === 'all') setAllTabVisited(true);
  }

  const scanData = data ?? (error ? demoScanResult : null);
  const isDemo = !data && !!error;

  // Badge count from lightweight index (available immediately)
  const allResultsCount = indexData?.scanned_count ?? 0;
  const allResultsDate = allScores?.scan_date ?? indexData?.scan_date ?? scanData?.scan_date;

  // Full results for AllResultsTable
  const allResults = allScores?.all_stock_scores ?? null;

  // trendMap: stockId -> [{date, score}, ...] (oldest first)
  // Built from allScores history array if available
  const trendMap = useMemo(() => {
    const history = allScores?.history as Array<{ date: string; stocks: Array<{ stock_id: string; total_score: number }> }> | undefined;
    if (!history) return undefined;
    const map: Record<string, { date: string; score: number }[]> = {};
    for (const day of history) {
      for (const s of day.stocks ?? []) {
        if (!map[s.stock_id]) map[s.stock_id] = [];
        map[s.stock_id].push({ date: day.date, score: s.total_score });
      }
    }
    // ensure oldest first
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
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'dashboard' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
              >
                <Activity className="w-3.5 h-3.5" />最新掃描
              </button>
              <button
                onClick={() => handleTabChange('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'all' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
              >
                <List className="w-3.5 h-3.5" />全部結果
                {allResultsCount > 0 && (
                  <span className="text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded-full">{allResultsCount}</span>
                )}
              </button>
              <button
                onClick={() => handleTabChange('watchlist')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'watchlist' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
              >
                <Star className="w-3.5 h-3.5" />自選股
              </button>
              <button
                onClick={() => handleTabChange('history')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'history' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
              >
                <History className="w-3.5 h-3.5" />歷史記錄
              </button>
              <button
                onClick={() => handleTabChange('selfcheck')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'selfcheck' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
              >
                <Search className="w-3.5 h-3.5" />自選評分
              </button>
            </nav>
            <div className="flex items-center gap-2 shrink-0">
              {isLoading && <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin" />}
              {now && (
                <div className="flex items-center gap-1 text-[11px] text-gray-600">
                  <Clock className="w-3 h-3" />
                  {now}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-6">
        {/* 最新掃描 tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {isLoading && !scanData && (
              <div className="flex items-center justify-center py-20 text-gray-500 text-sm gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />載入中…
              </div>
            )}
            {scanData && (
              <>
                <SummaryCards data={scanData} isDemo={isDemo} />
                <Top10Table
                  stocks={scanData.top10}
                  scanDate={scanData.scan_date}
                  scannedCount={scanData.scanned_count}
                  isDemo={isDemo}
                  trendMap={trendMap}
                />
              </>
            )}
          </div>
        )}

        {/* 全部結果 tab */}
        {activeTab === 'all' && (
          <div>
            {allLoading && (
              <div className="flex items-center justify-center py-20 text-gray-500 text-sm gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />載入全部結果…
              </div>
            )}
            {!allLoading && allResults && (
              <AllResultsTable stocks={allResults} scanDate={allResultsDate} />
            )}
            {!allLoading && !allResults && !allTabVisited && (
              <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
                點選「全部結果」頁籤以載入資料
              </div>
            )}
          </div>
        )}

        {/* 自選股 tab */}
        {activeTab === 'watchlist' && (
          <WatchlistPanel stocks={allStocksPool} />
        )}

        {/* 歷史記錄 tab */}
        {activeTab === 'history' && <HistoryBrowser />}

        {/* 自選評分 tab */}
        {activeTab === 'selfcheck' && (
          <SelfCheck indexData={indexData ?? null} />
        )}
      </main>
    </div>
  );
}
