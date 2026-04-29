'use client';
import { useState, useEffect } from 'react';
import { useLatestScan, useAllScores } from '@/lib/useScanData';
import { demoScanResult } from '@/lib/demoScanData';
import SummaryCards from './SummaryCards';
import Top10Table from './Top10Table';
import HistoryBrowser from './HistoryBrowser';
import SelfCheck from './SelfCheck';
import AllResultsTable from './AllResultsTable';
import { Activity, RefreshCw, Clock, History, Radar, Search, List } from 'lucide-react';

type Tab = 'dashboard' | 'all' | 'history' | 'selfcheck';

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

  const scanData = data ?? (error ? demoScanResult : null);
  const isDemo = !data && !!error;
  // all_results comes from all_scores.json (2102 stocks), not latest.json
  const allResults = allScores?.all_stock_scores ?? null;
  const allResultsDate = allScores?.scan_date ?? scanData?.scan_date;
  const allResultsCount = allScores?.scanned_count ?? allResults?.length ?? 0;

  return (
    <div className="min-h-dvh bg-gray-950 text-gray-100 font-sans flex flex-col">
      <header className="sticky top-0 z-20 border-b border-gray-800 bg-gray-950/90 backdrop-blur">
        <div className="max-w-screen-xl mx-auto px-4">
          <div className="flex items-center h-13 gap-4 py-2">
            <div className="flex items-center gap-2 shrink-0">
              <Radar className="w-5 h-5 text-sky-400" />
              <span className="font-bold text-white text-sm tracking-wide">\u53f0\u80a1\u96f7\u9054</span>
              <span className="text-gray-600 text-xs hidden sm:inline">Taiwan Stock Radar</span>
            </div>
            <nav className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-hide">
              <button onClick={() => setActiveTab('dashboard')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'dashboard' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}>
                <Activity className="w-3.5 h-3.5" />\u6700\u65b0\u6383\u63cf
              </button>
              <button onClick={() => setActiveTab('all')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'all' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}>
                <List className="w-3.5 h-3.5" />\u5168\u90e8\u7d50\u679c
                {allResultsCount > 0 && (
                  <span className="text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded-full">{allResultsCount}</span>
                )}
              </button>
              <button onClick={() => setActiveTab('history')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'history' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}>
                <History className="w-3.5 h-3.5" />\u6b77\u53f2\u67e5\u8a62
              </button>
              <button onClick={() => setActiveTab('selfcheck')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'selfcheck' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}>
                <Search className="w-3.5 h-3.5" />\u81ea\u4e3b\u6aa2\u67e5
              </button>
            </nav>
            <div className="flex items-center gap-3 shrink-0 text-xs">
              {isLoading && <span className="flex items-center gap-1 text-sky-400"><RefreshCw className="w-3 h-3 animate-spin" /><span className="hidden sm:inline text-[11px]">\u8f09\u5165\u4e2d</span></span>}
              {!isLoading && !error && data && <span className="flex items-center gap-1 text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /><span className="hidden sm:inline text-[11px]">\u6700\u65b0\u8cc7\u6599</span></span>}
              {isDemo && <span className="text-amber-400 text-[10px] hidden sm:inline">\u793a\u7bc4\u6a21\u5f0f</span>}
              {now && <span className="text-gray-600 text-[11px] hidden md:flex items-center gap-1 font-mono"><Clock className="w-3 h-3" />{now}</span>}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-5">
        {activeTab === 'dashboard' && (
          <div className="space-y-5">
            <div className="rounded-xl border border-gray-700/40 bg-gradient-to-r from-gray-900 to-gray-900/50 px-5 py-4">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h1 className="text-lg font-bold text-white flex items-center gap-2"><Radar className="w-5 h-5 text-sky-400" />\u6bcf\u65e5\u5e95\u90e8\u53cd\u8f49\u6383\u63cf</h1>
                  <p className="text-xs text-gray-400 mt-1">\u6bcf\u65e5 22:55 \u81ea\u52d5\u6383\u63cf\u5168\u5e02\u5834\uff0c\u4f9d\u4e94\u7dad\u5ea6\u8a55\u5206\u7be9\u9078\u6700\u5f37\u52e2\u6a19\u7684</p>
                </div>
                {scanData && (
                  <div className="text-right">
                    <div className="text-xs text-gray-500">\u6383\u63cf\u65e5\u671f</div>
                    <div className="text-sm font-mono font-bold text-sky-300">{scanData.scan_date}</div>
                    {scanData.scanned_count && <div className="text-[11px] text-gray-600">\u5171\u6383\u63cf {scanData.scanned_count} \u6a94</div>}
                  </div>
                )}
              </div>
            </div>
            {isLoading ? (
              <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-16 text-center">
                <div className="w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm text-gray-400">\u6b63\u5728\u8f09\u5165\u6700\u65b0\u6383\u63cf\u8cc7\u6599...</p>
              </div>
            ) : scanData ? (
              <>
                <SummaryCards data={scanData} />
                <Top10Table stocks={scanData.top10} scanDate={scanData.scan_date} scannedCount={scanData.scanned_count} isDemo={isDemo} />
              </>
            ) : (
              <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-16 text-center">
                <Radar className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                <p className="text-sm text-gray-400">\u5c1a\u7121\u6383\u63cf\u8cc7\u6599</p>
              </div>
            )}
          </div>
        )}
        {activeTab === 'all' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-700/40 bg-gradient-to-r from-gray-900 to-gray-900/50 px-5 py-4">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h1 className="text-lg font-bold text-white flex items-center gap-2"><List className="w-5 h-5 text-sky-400" />\u5168\u90e8\u6383\u63cf\u7d50\u679c</h1>
                  <p className="text-xs text-gray-400 mt-1">\u672c\u6b21\u6383\u63cf\u6240\u6709 {allResultsCount} \u6a94\u5b8c\u6574\u8a55\u5206\uff0c\u53ef\u4f9d\u5206\u6578\u6392\u5e8f\u8207\u641c\u5c0b</p>
                </div>
                {allResultsDate && <div className="text-right"><div className="text-xs text-gray-500">\u6383\u63cf\u65e5\u671f</div><div className="text-sm font-mono font-bold text-sky-300">{allResultsDate}</div></div>}
              </div>
            </div>
            {allLoading ? (
              <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-16 text-center">
                <div className="w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm text-gray-400">\u8f09\u5165 {allResultsCount || 2102} \u6a94\u5b8c\u6574\u8cc7\u6599...</p>
              </div>
            ) : allResults ? (
              <AllResultsTable stocks={allResults} scanDate={allResultsDate} />
            ) : (
              <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-16 text-center">
                <List className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                <p className="text-sm text-gray-400">\u5c1a\u7121\u5b8c\u6574\u7d50\u679c\u8cc7\u6599</p>
                <p className="text-xs text-gray-600 mt-1">all_scores.json \u5c1a\u672a\u5c31\u7dd2\uff0c\u8acb\u7b49\u5f85\u4e0b\u4e00\u6b21 22:55 \u6383\u63cf</p>
              </div>
            )}
          </div>
        )}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-700/40 bg-gradient-to-r from-gray-900 to-gray-900/50 px-5 py-4">
              <h1 className="text-lg font-bold text-white flex items-center gap-2"><History className="w-5 h-5 text-sky-400" />\u6b77\u53f2\u6383\u63cf\u8a18\u9304</h1>
              <p className="text-xs text-gray-400 mt-1">\u700f\u89bd\u904e\u53bb\u6bcf\u65e5\u6383\u63cf\u7d50\u679c\uff0c\u9ede\u64ca\u65e5\u671f\u67e5\u770b\u7576\u65e5 Top 10 \u8a73\u60c5</p>
            </div>
            <HistoryBrowser />
          </div>
        )}
        {activeTab === 'selfcheck' && <SelfCheck />}
      </main>

      <footer className="border-t border-gray-800/60 py-4 text-center text-[10px] text-gray-600 px-4">
        \u8cc7\u6599\u4f86\u6e90\uff1aTWSE OpenAPI\uff5c\u672c\u7cfb\u7d71\u50c5\u4f9b\u8cc7\u8a0a\u53c3\u8003\uff0c\u4e0d\u69cb\u6210\u6295\u8cc7\u5efa\u8b70
        \uff5c<span className="text-gray-700">Taiwan Stock Radar v2.0</span>
      </footer>
    </div>
  );
}
