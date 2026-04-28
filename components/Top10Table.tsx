'use client';
import { useState } from 'react';
import { ScanStock, DIMENSION_CONFIG, getActionColor } from '@/lib/scanTypes';
import StockDetailModal from './StockDetailModal';
import { ChevronRight, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface Props {
  stocks: ScanStock[];
  scanDate?: string;
  scannedCount?: number;
  isDemo?: boolean;
}

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-sky-500' : pct >= 35 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-gray-700 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-bold text-white w-8 text-right">{Math.round(score)}</span>
    </div>
  );
}

export default function Top10Table({ stocks, scanDate, scannedCount, isDemo }: Props) {
  const [selectedStock, setSelectedStock] = useState<ScanStock | null>(null);
  const totalMax = Object.values(DIMENSION_CONFIG).reduce((s, c) => s + c.max, 0);

  return (
    <>
      <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 overflow-hidden">
        {/* Table header */}
        <div className="px-4 py-3 border-b border-gray-700/60 flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
              Top 10 強勢股
              {isDemo && (
                <span className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-normal">
                  示範資料
                </span>
              )}
            </h3>
            {scanDate && (
              <div className="text-[11px] text-gray-500 mt-0.5">
                掃描日期：{scanDate}
                {scannedCount ? `　掃描標的：${scannedCount} 檔` : ''}
              </div>
            )}
          </div>
          <span className="text-xs text-gray-500">{stocks.length} 檔</span>
        </div>

        {/* Mobile card list */}
        <div className="block md:hidden divide-y divide-gray-700/30">
          {stocks.map((s, i) => {
            const up = s.change_pct >= 0;
            const actionCls = getActionColor(s.strategy.recommendation);
            return (
              <button
                key={s.stock_id}
                onClick={() => setSelectedStock(s)}
                className="w-full text-left p-3 hover:bg-gray-800/50 transition-colors flex items-center gap-3"
              >
                <span className="text-[11px] font-bold text-gray-600 w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-500">{s.stock_id}</span>
                    <span className="text-sm font-semibold text-gray-200 truncate">{s.name}</span>
                    <span className="text-[10px] text-gray-500 hidden sm:inline bg-gray-800 px-1 rounded">{s.sector}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <ScoreBar score={s.total_score} max={totalMax} />
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${actionCls}`}>
                      {s.strategy.recommendation.split(' - ')[0]}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-mono font-bold text-white">{s.close.toLocaleString()}</div>
                  <div className={`text-xs font-mono flex items-center justify-end ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                    {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {Math.abs(s.change_pct).toFixed(2)}%
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
              </button>
            );
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-700/40 bg-gray-800/30">
                <th className="text-left px-4 py-2.5 font-medium w-8">#</th>
                <th className="text-left px-3 py-2.5 font-medium">代號 / 名稱</th>
                <th className="text-right px-3 py-2.5 font-medium">收盤</th>
                <th className="text-right px-3 py-2.5 font-medium">漲跌%</th>
                <th className="text-right px-3 py-2.5 font-medium hidden lg:table-cell">族群</th>
                <th className="px-3 py-2.5 font-medium">評分</th>
                <th className="text-left px-3 py-2.5 font-medium hidden xl:table-cell">技術訊號</th>
                <th className="px-3 py-2.5 font-medium">建議</th>
                <th className="px-3 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((s, i) => {
                const up = s.change_pct >= 0;
                const actionCls = getActionColor(s.strategy.recommendation);
                return (
                  <tr
                    key={s.stock_id}
                    onClick={() => setSelectedStock(s)}
                    className="border-b border-gray-700/20 hover:bg-gray-800/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-600 font-bold">{i + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-gray-500 text-[11px] w-10 shrink-0">{s.stock_id}</span>
                        <span className="text-gray-200 font-semibold">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-gray-200 font-semibold">
                      {s.close.toLocaleString()}
                    </td>
                    <td className={`px-3 py-3 text-right font-mono font-bold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                      <span className="flex items-center justify-end gap-0.5">
                        {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        {Math.abs(s.change_pct).toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell">
                      <span className="text-gray-400 bg-gray-700/40 px-1.5 py-0.5 rounded text-[11px]">{s.sector}</span>
                    </td>
                    <td className="px-3 py-3">
                      <ScoreBar score={s.total_score} max={totalMax} />
                    </td>
                    <td className="px-3 py-3 hidden xl:table-cell">
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {s.signals.technical.slice(0, 2).map((sig, j) => (
                          <span key={j} className="text-[10px] text-sky-400/80 bg-sky-500/8 px-1.5 py-0.5 rounded border border-sky-500/20">
                            {sig}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-[11px] px-2 py-1 rounded border font-medium whitespace-nowrap ${actionCls}`}>
                        {s.strategy.recommendation.split(' - ')[0]}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <ChevronRight className="w-4 h-4 text-gray-600" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedStock && (
        <StockDetailModal stock={selectedStock} onClose={() => setSelectedStock(null)} />
      )}
    </>
  );
}
