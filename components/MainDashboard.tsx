'use client';
import { useState, useEffect } from 'react';
import { useLatestScan } from '@/lib/useScanData';
import { demoScanResult } from '@/lib/demoScanData';
import SummaryCards from './SummaryCards';
import Top10Table from './Top10Table';
import DisclaimerModal from './DisclaimerModal';
import TopNav from './TopNav';
import { RefreshCw, ScanLine } from 'lucide-react';

export default function MainDashboard() {
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const { data, isLoading, error } = useLatestScan();

  useEffect(() => {
    if (!sessionStorage.getItem('disclaimer_seen')) {
      setShowDisclaimer(true);
      sessionStorage.setItem('disclaimer_seen', '1');
    }
  }, []);

  const scanData = data ?? (error ? demoScanResult : null);
  const isDemo = !data && !!error;

  const rightSlot = (
    <>
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
      {isDemo && (
        <span className="text-amber-600 text-[10px] hidden sm:inline px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded">
          示範模式
        </span>
      )}
    </>
  );

  return (
    <div className="min-h-dvh bg-white text-gray-900 font-sans flex flex-col">
      {showDisclaimer && <DisclaimerModal onClose={() => setShowDisclaimer(false)} />}

      <TopNav rightSlot={rightSlot} onInfoClick={() => setShowDisclaimer(true)} />

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-5">
        <div className="space-y-5 fade-in">
          {/* Hero header */}
          <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-900 via-gray-900 to-sky-950/30 px-5 py-5 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(56,189,248,0.06),transparent_60%)] pointer-events-none" />
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  <ScanLine className="w-5 h-5 text-sky-400" />
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
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      共掃描 <span className="text-gray-300 font-mono">{scanData.scanned_count.toLocaleString()}</span> 檔
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {scanData ? (
            <>
              <SummaryCards data={scanData} />
              <Top10Table
                stocks={scanData.top10 ?? []}
                scanDate={scanData.scan_date}
                scannedCount={scanData.scanned_count}
                isDemo={isDemo}
              />
            </>
          ) : isLoading ? (
            <div className="text-center py-20 text-gray-400 text-sm">正在載入掃描資料...</div>
          ) : (
            <div className="text-center py-20 text-gray-400 text-sm">目前無掃描資料</div>
          )}
        </div>
      </main>
    </div>
  );
}
