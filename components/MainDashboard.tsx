'use client';
import { useState, useEffect } from 'react';
import { useLatestScan } from '@/lib/useScanData';
import { demoScanResult } from '@/lib/demoScanData';
import SummaryCards from './SummaryCards';
import Top10Table from './Top10Table';
import HistoryBrowser from './HistoryBrowser';
import { Activity, RefreshCw, Clock, History, Radar } from 'lucide-react';

type Tab = 'dashboard' | 'history';

export default function MainDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [now, setNow] = useState('');
  const { data, isLoading, error } = useLatestScan();

  // Hydration-safe clock
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

  return (
    <div className="min-h-dvh bg-gray-950 text-gray-100 font-sans flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-gray-800 bg-gray-950/90 backdrop-blur">
        <div className="max-w-screen-xl mx-auto px-4">
          <div className="flex items-center h-13 gap-4 py-2">
            {/* Logo */}
            <div className="flex items-center gap-2 shrink-0">
              <Radar className="w-5 h-5 text-sky-400" />
              <span className="font-bold text-white text-sm tracking-wide">台股雷達</span>
              <span className="text-gray-600 text-xs hidden sm:inline">Taiwan Stock Radar</span>
            </div>

            {/* Tabs */}
            <nav className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === 'dashboard'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                最新掃錨
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === 'history'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                歷史查詢
              </button>
            </nav>

            {/* Status */}
            <div className="flex items-center gap-3 shrink-0 text-xs">
              {isLoading && (
                <span className="flex items-center gap-1 text-sky-400">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span className="hidden sm:inline text-[11px]">載入中</span>
                </span>
              )}
              {!isLoading && !error && data && (
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="hidden sm:inline text-[11px]">最新資料</span>
                </span>
              )}
              {isDemo && (
                <span className="text-amber-400 text-[10px] hidden sm:inline">示範模式</span>
              )}
              {now && (
                <span className="text-gray-600 text-[11px] hidden md:flex items-center gap-1 font-mono">
                  <Clock className="w-3 h-3" />
                  {now}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-5">
        {activeTab === 'dashboard' && (
          <div className="space-y-5">
            {/* Hero */}
            <div className="rounded-xl border border-gray-700/40 bg-gradient-to-r from-gray-900 to-gray-900/50 px-5 py-4">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h1 className="text-lg font-bold text-white flex items-center gap-2">
                    <Radar className="w-5 h-5 text-sky-400" />
                    每日底部反轉掃錨
                  </h1>
                  <p className="text-xs text-gray-400 mt-1">
                    每日 22:55 自動掃描全市場，依五維度評分篩選最強勢標的
                  </p>
                </div>
                {scanData && (
                  <div className="text-right">
                    <div className="text-xs text-gray-500">掃描日期</div>
                    <div className="text-sm font-mono font-bold text-sky-300">{scanData.scan_date}</div>
                  </div>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-16 text-center">
                <div className="w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm text-gray-400">正在載入最新掃錨資料...</p>
                <p className="text-xs text-gray-600 mt-1">從 /data/latest.json 讀取</p>
              </div>
            ) : scanData ? (
              <>
                <SummaryCards data={scanData} />
                <Top10Table
                  stocks={scanData.top10}
                  scanDate={scanData.scan_date}
                  scannedCount={scanData.scanned_count}
                  isDemo={isDemo}
                />
              </>
            ) : (
              <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-16 text-center">
                <Radar className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                <p className="text-sm text-gray-400">尚無掃錨資料</p>
                <p className="text-xs text-gray-600 mt-1">每日 22:55 自動執行掃錨任務後更新</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-700/40 bg-gradient-to-r from-gray-900 to-gray-900/50 px-5 py-4">
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <History className="w-5 h-5 text-sky-400" />
                歷史掃錨記錄
              </h1>
              <p className="text-xs text-gray-400 mt-1">
                瀏覽過去每日掃錨結果，點擊日期查看當日 Top 10 詳情
              </p>
            </div>
            <HistoryBrowser />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800/60 py-4 text-center text-[10px] text-gray-600 px-4">
        資料來源：TWSE OpenAPI｜本系統僅供資訊參考，不構成投資建議
        ｜<span className="text-gray-700">Taiwan Stock Radar v2.0</span>
      </footer>
    </div>
  );
}
