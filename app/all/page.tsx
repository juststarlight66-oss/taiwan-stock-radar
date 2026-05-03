'use client';
import TopNav from '@/components/TopNav';
import AllResultsTable from '@/components/AllResultsTable';
import { useAllScores } from '@/lib/useScanData';
import { List, GitFork, Radar } from 'lucide-react';

export default function AllPage() {
  const { data: allScores, isLoading, error } = useAllScores();

  const allResults = allScores?.all_stock_scores ?? null;
  const allResultsDate = allScores?.scan_date ?? null;
  const allResultsCount = allScores?.scanned_count ?? allResults?.length ?? 0;

  return (
    <div className="min-h-dvh bg-white text-gray-900 font-sans flex flex-col">
      <TopNav />

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-5">
        <div className="space-y-4 fade-in">
          {/* Hero */}
          <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-900 via-gray-900 to-sky-950/30 px-5 py-5 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(56,189,248,0.06),transparent_60%)] pointer-events-none" />
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  <List className="w-5 h-5 text-sky-400" />
                  族群動態 — 全部掃描結果
                  <span className="text-[10px] text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-full font-normal">全市場</span>
                </h1>
                <p className="text-xs text-gray-400 mt-1">
                  本次掃描所有{' '}
                  <span className="text-gray-200 font-mono">{allResultsCount.toLocaleString()}</span>{' '}
                  檔完整評分，可依分數排序與搜尋
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {['分數排序', '族群篩選', '關鍵字搜尋', '維度明細'].map((t) => (
                    <span key={t} className="text-[10px] text-sky-300/80 bg-sky-500/8 border border-sky-500/15 px-2 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              </div>
              {allResultsDate && (
                <div className="text-right">
                  <div className="text-[10px] text-gray-500 mb-1">掃描日期</div>
                  <div className="text-base font-mono font-bold text-sky-400">{allResultsDate}</div>
                </div>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="skeleton h-12 rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-12 text-center">
              <List className="w-10 h-10 text-red-300 mx-auto mb-3" />
              <p className="text-sm text-red-600 font-medium">資料載入失敗</p>
              <p className="text-xs text-red-400 mt-1">all_scores.json 尚未就緒，請等待 19:00 掃描</p>
            </div>
          ) : allResults ? (
            <AllResultsTable stocks={allResults} scanDate={allResultsDate ?? undefined} />
          ) : (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-16 text-center">
              <List className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-sm text-gray-500">尚無完整結果資料</p>
              <p className="text-xs text-gray-400 mt-1">all_scores.json 尚未就緒，請等待 19:00 掃描</p>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-gray-200 py-6 mt-4">
        <div className="max-w-screen-xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Radar className="w-4 h-4 text-sky-400" />
              <span className="text-sm font-semibold text-gray-700">台股雷達</span>
              <span className="text-[10px] text-gray-400">Taiwan Stock Radar v3.1</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-gray-500">
              <span>資料來源：TWSE OpenAPI</span>
              <span className="hidden sm:inline text-gray-300">|</span>
              <span>每日 19:00 自動更新（交易日）</span>
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
