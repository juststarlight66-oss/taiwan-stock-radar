'use client';
import { StockData } from '@/lib/types';
import { Shield, Zap, Target, AlertTriangle } from 'lucide-react';

interface Props { stocks: StockData[]; }

export default function TradingStrategy({ stocks }: Props) {
  const strongBuys = stocks.filter(s => s.recommendation === 'strong_buy');
  const buys = stocks.filter(s => s.recommendation === 'buy');
  const sells = stocks.filter(s => s.recommendation === 'sell');

  return (
    <div className="space-y-6">
      {/* Market regime */}
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold text-emerald-300">市場環境判斷：多頭</span>
          <span className="ml-auto text-xs bg-emerald-500/20 text-emerald-300 rounded px-2 py-0.5">進攻模式</span>
        </div>
        <p className="text-xs text-gray-400">外資連買、技術面強勢，建議積極布局強勢族群，持股比例 70-80%</p>
      </div>

      {/* Strategy grid */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Strong buy list */}
        <div className="rounded-lg border border-gray-700/60 bg-gray-800/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold text-gray-200">強力買進</span>
            <span className="ml-auto text-xs text-emerald-400 font-mono">{strongBuys.length} 檔</span>
          </div>
          <div className="space-y-2">
            {strongBuys.map(s => (
              <div key={s.stockId} className="flex items-center justify-between py-1.5 border-b border-gray-700/30">
                <div>
                  <span className="text-xs font-mono text-gray-400">{s.stockId}</span>
                  <span className="ml-2 text-xs text-gray-200">{s.name}</span>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono text-emerald-400">+{s.changePercent.toFixed(2)}%</div>
                  <div className="text-[10px] text-gray-500">評分 {s.score}</div>
                </div>
              </div>
            ))}
            {strongBuys.length === 0 && <p className="text-xs text-gray-500">目前無強力買進標的</p>}
          </div>
        </div>

        {/* Buy list */}
        <div className="rounded-lg border border-gray-700/60 bg-gray-800/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-sky-400" />
            <span className="text-sm font-semibold text-gray-200">買進候選</span>
            <span className="ml-auto text-xs text-sky-400 font-mono">{buys.length} 檔</span>
          </div>
          <div className="space-y-2">
            {buys.map(s => (
              <div key={s.stockId} className="flex items-center justify-between py-1.5 border-b border-gray-700/30">
                <div>
                  <span className="text-xs font-mono text-gray-400">{s.stockId}</span>
                  <span className="ml-2 text-xs text-gray-200">{s.name}</span>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono text-sky-400">+{s.changePercent.toFixed(2)}%</div>
                  <div className="text-[10px] text-gray-500">評分 {s.score}</div>
                </div>
              </div>
            ))}
            {buys.length === 0 && <p className="text-xs text-gray-500">目前無買進候選</p>}
          </div>
        </div>

        {/* Risk / sell */}
        <div className="rounded-lg border border-gray-700/60 bg-gray-800/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-semibold text-gray-200">減碼 / 風險</span>
            <span className="ml-auto text-xs text-red-400 font-mono">{sells.length} 檔</span>
          </div>
          <div className="space-y-2">
            {sells.map(s => (
              <div key={s.stockId} className="flex items-center justify-between py-1.5 border-b border-gray-700/30">
                <div>
                  <span className="text-xs font-mono text-gray-400">{s.stockId}</span>
                  <span className="ml-2 text-xs text-gray-200">{s.name}</span>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono text-red-400">{s.changePercent.toFixed(2)}%</div>
                  <div className="text-[10px] text-gray-500">評分 {s.score}</div>
                </div>
              </div>
            ))}
            {sells.length === 0 && <p className="text-xs text-gray-500">目前無減碼標的</p>}
          </div>
        </div>
      </div>

      {/* Position sizing guide */}
      <div className="rounded-lg border border-gray-700/60 bg-gray-800/50 p-4">
        <h4 className="text-sm font-semibold text-gray-200 mb-3">倉位管理建議</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {[
            { label: '強力買進', pct: '15-20%', color: 'text-emerald-400', desc: '每檔最大倉位' },
            { label: '買進', pct: '8-12%', color: 'text-sky-400', desc: '每檔建議倉位' },
            { label: '觀望', pct: '5%', color: 'text-amber-400', desc: '試水溫倉位' },
            { label: '現金部位', pct: '20-30%', color: 'text-gray-400', desc: '保留備用金' },
          ].map(item => (
            <div key={item.label} className="bg-gray-700/30 rounded p-3">
              <div className={`text-base font-bold font-mono ${item.color}`}>{item.pct}</div>
              <div className="text-gray-300 mt-1">{item.label}</div>
              <div className="text-gray-500 mt-0.5">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
