'use client';
import { useState, useEffect } from 'react';
import { useLatestScan, useAllScores } from '@/lib/useScanData';
import { demoScanResult } from '@/lib/demoScanData';
import SummaryCards from './SummaryCards';
import Top10Table from './Top10Table';
import HistoryBrowser from './HistoryBrowser';
import SelfCheck from './SelfCheck';
import AllResultsTable from './AllResultsTable';
import DisclaimerModal from './DisclaimerModal';
import { Activity, RefreshCw, Clock, History, Radar, Search, List, GitFork, Info, TrendingUp, Radio } from 'lucide-react';

type Tab = 'dashboard' | 'all' | 'history' | 'selfcheck';

export default function MainDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [now, setNow] = useState('');
  const [showDisclaimer, setShowDisclaimer] = useState(false);
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

  useEffect(() => {
    if (!sessionStorage.getItem('disclaimer_seen')) {
      setShowDisclaimer(true);
      sessionStorage.setItem('disclaimer_seen', '1');
    }
  }, []);

  const scanData = data ?? (error ? demoScanResult : null);
  const isDemo = !data && !!error;
  const allResults = allScores?.all_stock_scores ?? null;
  const allResultsDate = allScores?.scan_date ?? scanData?.scan_date;
  const allResultsCount = allScores?.scanned_count ?? allResults?.length ?? 0;

  return (
    <div className="min-h-dvh bg-white text-gray-900 font-sans flex flex-col">
      {showDisclaimer && <DisclaimerModal onClose={() => setShowDisclaimer(false)} />}

      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4">
          <div className="flex items-center h-14 gap-3 py-2">
            <a href="/taiwan-stock-radar/" className="flex items-center gap-2 shrink-0 group">
              <div className="relative w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center group-hover:bg-sky-500/30 transition-colors">
                <Radar className="w-4 h-4 text-sky-400" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-bold text-gray-900 text-sm tracking-wide">台股雷達</span>
                <span className="text-gray-500 text-[10px] hidden sm:inline">Taiwan Stock Radar</span>
              </div>
              <span className="hidden sm:inline text-[9px] bg-sky-500/20 text-sky-600 border border-sky-500/30 px-1.5 py-0.5 rounded-full font-mono">v3.0</span>
            </a>

            <nav className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-hide">
              {([
                { id: 'dashboard', icon: <Activity className="w-3.5 h-3.5" />, label: '每日推薦' },
                { id: 'all',       icon: <List className="w-3.5 h-3.5" />,     label: '全部結果', badge: allResultsCount > 0 ? allResultsCount : null },
                { id: 'history',   icon: <History className="w-3.5 h-3.5" />,  label: '歷史查詢' },
                { id: 'selfcheck', icon: <Search className="w-3.5 h-3.5" />,   label: '自主檢查' },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    activeTab === t.id
                      ? 'bg-sky-50 text-sky-700 border border-sky-300'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {t.icon}{t.label}
                  {'badge' in t && t.badge && (
                    <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{t.badge.toLocaleString()}</span>
                  )}
                </button>
              ))}
              <a
                href="/taiwan-stock-radar/tracking"
                className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              >
                <TrendingUp className="w-3.5 h-3.5" />追蹤儀表板
              </a>
              <a
                href="/taiwan-stock-radar/intraday"
                className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              >
                <Radio className="w-3.5 h-3.5" />盤中即時雷達
              </a>
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              {isLoading && (
                <span className="flex items-center gap-1 text-sky-500 text-[11px]">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span className="hidden sm:inline">載入中</span>
                </span>
              )}
              {!isLoading && !error && data && (
                <span className="relative flex items-center gap-1.5 text-emerald-600 text-[11px]">
                  <span className="relative w-1.5 h-1.5">
                    <span className="pulse-ring absolute inset-0 rounded-full bg-emerald-500" />
                    <span className="relative block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  </span>
                  <span className="hidden sm:inline">最新資料</span>
                </span>
              )}
              {isDemo && <span className="text-amber-600 text-[10px] hidden sm:inline px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded">示範模式</span>}
              {now && (
                <span className="text-gray-400 text-[11px] hidden md:flex items-center gap-1 font-mono">
                  <Clock className="w-3 h-3" />{now}
                </span>
              )}
              <button
                onClick={() => setShowDisclaimer(true)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="免責聲明"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
              <a
                href="https://github.com/juststarlight66-oss/taiwan-stock-radar"
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="GitHub"
              >
                <GitFork className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-5">

        {activeTab === 'dashboard' && (
          <div className="space-y-5 fade-in">
            <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-900 via-gray-900 to-sky-950/30 px-5 py-5 relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(56,189,248,0.06),transparent_60%)] pointer-events-none" />
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <h1 className="text-lg font-bold text-white flex items-center gap-2">
                    <Radar className="w-5 h-5 text-sky-400" />
                    每日底部反轉掃描
                    <span className="text-[10px] text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-full font-normal">AI 驅動</span>
                  </h1>
                  <p className="text-xs text-gray-400 mt-1">每日 19:00 自動掃描全市場，依五維度 AI 評分篩選最強勢標的</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {['技術面', '基本面', '消息面', '市場情緒', '籌碼面'].map((d) => (
                      <span key={d} className="text-[10px] text-sky-300/80 bg-sky-500/8 border border-sky-500/15 px-2 py-0.5 rounded-full">{d}</span>
                    ))}
                  </div>
                </div>
                {scanData && (
                  <div className="text-right">
                    <div className="text-[10px] text-gray-500 mb-1">掃描日期</div>
                    <div className="text-base font-mono font-bold text-sky-400">{scanData.scan_date}</div>
                    {scanData.scanned_count && (
                      <div className="text-[11px] text-gray-500 mt-0.5">共掃描 <span className="text-gray-300 font-mono">{scanData.scanned_count.toLocaleString()}</span> 檔</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
                </div>
                <div className="skeleton h-64 rounded-xl" />
              </div>
            ) : scanData ? (
              <>
                <SummaryCards data={scanData} />
                <Top10Table stocks={scanData.top10} scanDate={scanData.scan_date} scannedCount={scanData.scanned_count} isDemo={isDemo} />
              </>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-16 text-center">
                <Radar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-sm text-gray-500">尚無掃描資料</p>
                <p className="text-xs text-gray-400 mt-1">等待今日 19:00 掃描完成</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'all' && (
          <div className="space-y-4 fade-in">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <List className="w-5 h-5 text-sky-500" />全部掃描結果
                  </h1>
                  <p className="text-xs text-gray-500 mt-1">本次掃描所有 <span className="text-gray-700 font-mono">{allResultsCount.toLocaleString()}</span> 檔完整評分，可依分數排序與搜尋</p>
                </div>
                {allResultsDate && (
                  <div className="text-right">
                    <div className="text-[10px] text-gray-500">掃描日期</div>
                    <div className="text-sm font-mono font-bold text-sky-600">{allResultsDate}</div>
                  </div>
                )}
              </div>
            </div>
            {allLoading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-12 rounded-lg" />)}
              </div>
            ) : allResults ? (
              <AllResultsTable stocks={allResults} scanDate={allResultsDate} />
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-16 text-center">
                <List className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-sm text-gray-500">尚無完整結果資料</p>
                <p className="text-xs text-gray-400 mt-1">all_scores.json 尚未就緒，請等待 19:00 掃描</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4 fade-in">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4">
              <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <History className="w-5 h-5 text-sky-500" />歷史掃描記錄
              </h1>
              <p className="text-xs text-gray-500 mt-1">瀏覽過去每日掃描結果，點擊日期查看當日 Top 10 詳情</p>
            </div>
            <HistoryBrowser />
          </div>
        )}

        {activeTab === 'selfcheck' && (
          <div className="fade-in">
            <SelfCheck />
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 py-6 mt-4">
        <div className="max-w-screen-xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Radar className="w-4 h-4 text-sky-400" />
              <span className="text-sm font-semibold text-gray-700">台股雷達</span>
              <span className="text-[10px] text-gray-400">Taiwan Stock Radar v3.0</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-gray-500">
              <span>資料來源：TWSE OpenAPI</span>
              <span className="hidden sm:inline text-gray-300">|</span>
              <span>每日 19:00 自動更新（交易日）</span>
              <span className="hidden sm:inline text-gray-300">|</span>
              <button
                onClick={() => setShowDisclaimer(true)}
                className="text-gray-500 hover:text-gray-700 transition-colors underline underline-offset-2"
              >
                免責聲明
              </button>
              <span className="hidden sm:inline text-gray-300">|</span>
              <a
                href="https://github.com/juststarlight66-oss/taiwan-stock-radar"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
              >
                <GitFork className="w-3 h-3" />GitHub
              </a>
            </div>
          </div>
          <p className="text-center text-[10px] text-gray-400 mt-3">
            本系統資料僅供參考，不構成任何投資建議。投資有風險，請審慎評估個人財務狀況。過去績效不代表未來獲利保證。
          </p>
        </div>
      </footer>
    </div>
  );
}
