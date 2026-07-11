'use client';
import TopNav from '@/components/TopNav';
import PredictionHistory from '@/components/PredictionHistory';
import { TrendingUp, Share2, ScanLine } from 'lucide-react';
import type { PredictionHistoryConfig } from '@/components/PredictionHistory';

const CONFIG: PredictionHistoryConfig = {
  dataUrl: '/data/uptrend_predictions_history.json',
  title: '主升段起漲 預測追蹤',
  topKey: 'top40',
  headerIcon: <TrendingUp className="w-4 h-4 text-emerald-500" />,
  headerAccent: 'text-emerald-500',
  cardAccent: 'bg-emerald-50 border-emerald-100',
  barColor: '#10b981',
  showMarketState: false,
  showBacktest: false,
  emptyMessage: '主升段預測追蹤數據將於下一個交易日後自動生成',
};

export default function UptrendPredictionsPage() {
  return (
    <div className="min-h-dvh bg-white text-gray-900 font-sans flex flex-col">
      <TopNav />
      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-5">
        <div className="space-y-4 fade-in">
          <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-900 via-gray-900 to-emerald-950/30 px-5 py-5 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.08),transparent_60%)] pointer-events-none" />
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                主升段起漲追蹤
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-normal">Top 40</span>
              </h1>
              <p className="text-xs text-gray-400 mt-1">追蹤每日 19:00 底部主升段起漲候選 Top 40 的 T+1/T+3/T+5 表現</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {['19:00 掃描', 'Top 40 精選', 'T+1/T+3/T+5', 'signal_3 + signal_1'].map((t) => (
                  <span key={t} className="text-[10px] text-emerald-300/80 bg-emerald-500/8 border border-emerald-500/15 px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            </div>
          </div>
          <PredictionHistory config={CONFIG} />
        </div>
      </main>
      <footer className="border-t border-gray-200 py-6 mt-4">
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
              <a href="https://github.com/juststarlight66-oss/taiwan-stock-radar" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1">
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
