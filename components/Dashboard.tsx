'use client';
import { useState } from 'react';
import { useMarketData } from '@/lib/useTWSE';
import MarketOverviewCards from './MarketOverviewCards';
import StockTable from './StockTable';
import NewsSidebar from './NewsSidebar';
import SectorHeatmap from './SectorHeatmap';
import TradingStrategy from './TradingStrategy';
import LoadingSpinner from './LoadingSpinner';
import { Activity, RefreshCw } from 'lucide-react';

type Tab = '大盤概況' | '族群熱點' | '個股追蹤' | '交易策略';
const TABS: Tab[] = ['大盤概況', '族群熱點', '個股追蹤', '交易策略'];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('大盤概況');
  const { indexData, stockData, isLoading, isError, isDemo } = useMarketData();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans">
      {/* Top bar */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4">
          <div className="flex items-center h-12 gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2 shrink-0">
              <Activity className="w-5 h-5 text-sky-400" />
              <span className="font-bold text-white text-sm tracking-wide">台股雷達</span>
              <span className="text-gray-600 text-xs hidden sm:inline">Taiwan Stock Radar</span>
            </div>

            {/* Tabs */}
            <nav className="flex items-center gap-1 flex-1 overflow-x-auto">
              {TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    activeTab === tab
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </nav>

            {/* Status */}
            <div className="flex items-center gap-2 shrink-0 text-xs">
              {isLoading && (
                <div className="flex items-center gap-1 text-sky-400">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span className="hidden sm:inline">更新中</span>
                </div>
              )}
              {isError && (
                <span className="text-amber-400 text-[10px]">API 連線失敗，使用示範資料</span>
              )}
              {!isLoading && !isError && !isDemo && (
                <div className="flex items-center gap-1 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                  <span className="hidden sm:inline text-[10px]">即時資料</span>
                </div>
              )}
              <span className="text-gray-600 text-[10px] hidden md:inline">
                {new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-screen-2xl mx-auto px-4 py-5">
        {isLoading && activeTab === '大盤概況' ? (
          <LoadingSpinner text="正在載入市場資料..." />
        ) : (
          <>
            {activeTab === '大盤概況' && (
              <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
                {/* Left: overview + table */}
                <div className="xl:col-span-3 space-y-5">
                  <MarketOverviewCards data={indexData} isDemo={isDemo} />
                  <StockTable
                    stocks={stockData}
                    title="今日強勢股 — 漲幅排行"
                    filter={s => s.changePercent > 0}
                  />
                  <StockTable
                    stocks={stockData}
                    title="今日弱勢股 — 跌幅排行"
                    filter={s => s.changePercent <= 0}
                  />
                </div>
                {/* Right: news */}
                <div className="xl:col-span-1 min-h-[500px]">
                  <NewsSidebar />
                </div>
              </div>
            )}

            {activeTab === '族群熱點' && (
              <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
                <div className="xl:col-span-3 space-y-5">
                  <SectorHeatmap />
                  <StockTable stocks={stockData} title="族群輪動個股總表" />
                </div>
                <div className="xl:col-span-1 min-h-[500px]">
                  <NewsSidebar />
                </div>
              </div>
            )}

            {activeTab === '個股追蹤' && (
              <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
                <div className="xl:col-span-3 space-y-5">
                  <div className="rounded-lg border border-gray-700/60 bg-gray-800/50 p-4">
                    <div className="text-sm font-semibold text-gray-300 mb-1">追蹤清單</div>
                    <p className="text-xs text-gray-500">顯示所有監控中的個股即時資訊</p>
                  </div>
                  <StockTable
                    stocks={stockData}
                    title="個股追蹤清單（全部）"
                  />
                  {/* Mini detail cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {stockData.slice(0, 4).map(s => {
                      const up = s.change >= 0;
                      return (
                        <div key={s.stockId} className="rounded-lg border border-gray-700/60 bg-gray-800/50 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-mono text-gray-400">{s.stockId}</span>
                            <span className="text-[10px] text-gray-500 bg-gray-700/50 rounded px-1.5 py-0.5">{s.sector}</span>
                          </div>
                          <div className="text-sm font-semibold text-gray-200">{s.name}</div>
                          <div className={`text-lg font-bold font-mono mt-1 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                            {s.close.toFixed(1)}
                          </div>
                          <div className={`text-xs font-mono ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                            {up ? '+' : ''}{s.changePercent.toFixed(2)}%
                          </div>
                          <div className="mt-2 text-[10px] text-gray-500 space-y-0.5">
                            <div>PE {s.pe?.toFixed(1) ?? '—'} / PB {s.pb?.toFixed(1) ?? '—'}</div>
                            <div>殖利率 {s.yield?.toFixed(1) ?? '—'}%</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="xl:col-span-1 min-h-[500px]">
                  <NewsSidebar />
                </div>
              </div>
            )}

            {activeTab === '交易策略' && (
              <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
                <div className="xl:col-span-3">
                  <TradingStrategy stocks={stockData} />
                </div>
                <div className="xl:col-span-1 min-h-[500px]">
                  <NewsSidebar />
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-8 py-4 text-center text-[10px] text-gray-600">
        資料來源：TWSE OpenAPI｜本系統僅供資訊參考，不構成投資建議｜Taiwan Stock Radar v1.0
      </footer>
    </div>
  );
}
