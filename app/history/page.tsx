'use client';
import { History, Share2, ScanLine, Calendar } from 'lucide-react';
import TopNav from '@/components/TopNav';
import HistoryBrowser from '@/components/HistoryBrowser';

export default function HistoryPage() {
  return (
    <div className="min-h-dvh bg-gray-50 text-gray-900 font-sans flex flex-col">
      <TopNav />

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-5">
        <div className="space-y-5 fade-in">
          {/* Simple page header - clean, no duplicate */}
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-blue-600" />
            <div>
              <h1 className="text-lg font-bold text-gray-900">歷史掃描記錄</h1>
              <p className="text-xs text-gray-500 mt-0.5">瀏覽過去每日掃描結果與回測績效</p>
            </div>
          </div>

          <HistoryBrowser />
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white py-6 mt-4">
        <div className="max-w-screen-xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ScanLine className="w-4 h-4 text-sky-400" />
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
                <Share2 className="w-3 h-3" />GitHub
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
