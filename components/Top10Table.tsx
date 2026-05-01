'use client';
import { useState } from 'react';
import { ScanStock, DIMENSION_CONFIG, getActionColor } from '@/lib/scanTypes';
import StockDetailModal from './StockDetailModal';
import { WatchlistToggleBtn } from './WatchlistPanel';
import ScoreTrendChart from './ScoreTrendChart';
import { ChevronRight, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface Props {
  stocks: ScanStock[];
  scanDate?: string;
  scannedCount?: number;
  isDemo?: boolean;
  trendMap?: Record<string, { date: string; score: number }[]>;
}

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-sky-500' : pct >= 35 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-bold text-gray-700 w-8 text-right">{Math.round(score)}</span>
    </div>
  );
}

/** 漲跌停徽章 — 台灣：漲停紅底、跌停綠底 */
function LimitBadge({ changePct }: { changePct: number }) {
  if (Math.abs(changePct) < 9.5) return null;
  const up = changePct >= 0;
  return (
    <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${up ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
      {up ? '漲停' : '跌停'}
    </span>
  );
}

export default function Top10Table({ stocks, scanDate, scannedCount, isDemo, trendMap }: Props) {
  const [selectedStock, setSelectedStock] = useState<ScanStock | null>(null);
  const totalMax = Object.values(DIMENSION_CONFIG).reduce((s, c) => s + c.max, 0);

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        {/* Table header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              Top 10 強勢股
              {isDemo && (
                <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded font-normal">
                  示範資料
                </span>
              )}
            </h3>
            {scanDate && (
              <div className="text-[11px] text-gray-400 mt-0.5">
                掃描日期：{scanDate}
                {scannedCount ? `　掃描標的：${scannedCount} 檔` : ''}
              </div>
            )}
          </div>
          <span className="text-xs text-gray-400">{stocks.length} 檔</span>
        </div>

        {/* Mobile card list */}
        <div className="block md:hidden divide-y divide-gray-100">
          {stocks.map((s, i) => {
            const up = (s.change_pct ?? 0) >= 0;
            const isLimit = Math.abs(s.change_pct ?? 0) >= 9.5;
            const limitCls = isLimit
              ? up ? 'ring-1 ring-red-300 bg-red-50' : 'ring-1 ring-green-300 bg-green-50'
              : '';
            const actionCls = getActionColor(s.strategy.recommendation);
            const trend = trendMap?.[s.stock_id];
            return (
              <div key={s.stock_id} className={`flex items-center gap-3 p-3 ${limitCls}`}>
                <button
                  className="flex-1 text-left hover:bg-gray-50 transition-colors"
                  onClick={() => setSelectedStock(s)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-gray-400 w-4">{i + 1}</span>
                    <span className="font-mono text-xs text-gray-400">{s.stock_id}</span>
                    <span className="text-sm font-semibold text-gray-800 truncate">{s.name}</span>
                    <span className="text-[10px] text-gray-400 hidden sm:inline bg-gray-100 px-1 rounded">{s.sector}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <ScoreBar score={s.total_score} max={totalMax} />
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${actionCls}`}>
                      {s.strategy.recommendation.split(' - ')[0]}
                    </span>
                    {trend && trend.length >= 2 && (
                      <ScoreTrendChart stockId={s.stock_id} history={trend} width={60} height={22} />
                    )}
                  </div>
                </button>
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <div className="text-sm font-mono font-bold text-gray-800">{s.close.toLocaleString()}</div>
                  {/* 台灣：漲紅跌綠 */}
                  <div className={`text-xs font-mono flex items-center justify-end gap-1 ${up ? 'text-red-500' : 'text-green-600'}`}>
                    {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {Math.abs(s.change_pct ?? 0).toFixed(2)}%
                    <LimitBadge changePct={s.change_pct ?? 0} />
                  </div>
                  <WatchlistToggleBtn stockId={s.stock_id} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-2.5 font-medium w-8">#</th>
                <th className="text-left px-3 py-2.5 font-medium">代號 / 名稱</th>
                <th className="text-left px-3 py-2.5 font-medium hidden lg:table-cell">族群</th>
                <th className="text-right px-3 py-2.5 font-medium">收盤</th>
                <th className="text-right px-3 py-2.5 font-medium">漲跌</th>
                <th className="text-left px-3 py-2.5 font-medium">綜合分</th>
                <th className="text-left px-3 py-2.5 font-medium">趨勢</th>
                <th className="text-left px-3 py-2.5 font-medium">建議</th>
                <th className="px-3 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stocks.map((s, i) => {
                const up = (s.change_pct ?? 0) >= 0;
                const isLimit = Math.abs(s.change_pct ?? 0) >= 9.5;
                const rowCls = isLimit
                  ? up ? 'ring-1 ring-inset ring-red-200 bg-red-50' : 'ring-1 ring-inset ring-green-200 bg-green-50'
                  : '';
                const actionCls = getActionColor(s.strategy.recommendation);
                const trend = trendMap?.[s.stock_id];
                return (
                  <tr
                    key={s.stock_id}
                    onClick={() => setSelectedStock(s)}
                    className={`hover:bg-sky-50 cursor-pointer transition-colors group ${rowCls}`}
                  >
                    <td className="px-4 py-2.5 text-gray-400 font-mono">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-gray-400 text-[11px]">{s.stock_id}</div>
                      <div className="font-semibold text-gray-800">{s.name}</div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 hidden lg:table-cell">{s.sector}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-800">
                      {s.close.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {/* 台灣：漲紅跌綠 */}
                      <span className={`font-mono flex items-center justify-end gap-1 ${up ? 'text-red-500' : 'text-green-600'}`}>
                        {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(s.change_pct ?? 0).toFixed(2)}%
                        <LimitBadge changePct={s.change_pct ?? 0} />
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <ScoreBar score={s.total_score} max={totalMax} />
                    </td>
                    <td className="px-3 py-2.5">
                      {trend && trend.length >= 2 ? (
                        <ScoreTrendChart stockId={s.stock_id} history={trend} width={80} height={28} />
                      ) : (
                        <span className="text-[10px] text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${actionCls}`}>
                        {s.strategy.recommendation.split(' - ')[0]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <WatchlistToggleBtn stockId={s.stock_id} />
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
