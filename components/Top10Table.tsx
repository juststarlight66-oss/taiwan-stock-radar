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
  /** stockId → 歷史分數陣列 (最舊→最新)，由 MainDashboard 傳入 */
  trendMap?: Record<string, { date: string; score: number }[]>;
}

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-sky-500' : pct >= 35 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-bold text-gray-800 w-8 text-right">{Math.round(score)}</span>
    </div>
  );
}

/** 漲跌停徽章 */
function LimitBadge({ changePct }: { changePct: number }) {
  if (Math.abs(changePct) < 9.5) return null;
  const up = changePct >= 0;
  return (
    <span
      className={`text-[9px] px-1 py-0.5 rounded font-bold ${
        up ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
      }`}
    >
      {up ? '漲停' : '跌停'}
    </span>
  );
}

export default function Top10Table({ stocks, scanDate, scannedCount, isDemo, trendMap }: Props) {
  const [selectedStock, setSelectedStock] = useState<ScanStock | null>(null);
  const totalMax = Object.values(DIMENSION_CONFIG).reduce((s, c) => s + c.max, 0);

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {/* Table header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-2 flex-wrap">
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
              <div className="text-[11px] text-gray-500 mt-0.5">
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
            const up = s.change_pct >= 0;
            const isLimit = Math.abs(s.change_pct) >= 9.5;
            const limitCls = isLimit
              ? up
                ? 'ring-1 ring-red-400/60 bg-red-50'
                : 'ring-1 ring-emerald-400/60 bg-emerald-50'
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
                    <span className="text-[11px] font-bold text-gray-400 w-5 text-center">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </span>
                    <span className="font-mono text-xs text-gray-500">{s.stock_id}</span>
                    <span className="text-xs font-medium text-gray-800 truncate max-w-[80px]">{s.name ?? s.stock_id}</span>
                    <LimitBadge changePct={s.change_pct} />
                  </div>
                  <div className="flex items-center gap-2 mt-1 pl-7">
                    <span className={`text-sm font-bold ${up ? 'text-red-600' : 'text-emerald-600'}`}>
                      {s.close?.toFixed(2) ?? '-'}
                    </span>
                    <span className={`text-xs flex items-center gap-0.5 ${up ? 'text-red-500' : 'text-emerald-500'}`}>
                      {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                      {Math.abs(s.change_pct).toFixed(2)}%
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${actionCls}`}>
                      {s.strategy.recommendation}
                    </span>
                  </div>
                  {trend && trend.length >= 2 && (
                    <div className="mt-1 pl-7">
                      <ScoreTrendChart data={trend} width={120} height={28} />
                    </div>
                  )}
                </button>
                <div className="flex flex-col items-end gap-1">
                  <ScoreBar score={s.total_score} max={totalMax} />
                  <WatchlistToggleBtn stockId={s.stock_id} size="sm" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 w-8">#</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">股票</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">現價</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">漲跌</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">評分</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">趨勢</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">建議</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">詳情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stocks.map((s, i) => {
                const up = s.change_pct >= 0;
                const isLimit = Math.abs(s.change_pct) >= 9.5;
                const limitCls = isLimit
                  ? up
                    ? 'bg-red-50'
                    : 'bg-emerald-50'
                  : '';
                const actionCls = getActionColor(s.strategy.recommendation);
                const trend = trendMap?.[s.stock_id];
                return (
                  <tr
                    key={s.stock_id}
                    className={`hover:bg-gray-50 transition-colors cursor-pointer ${limitCls}`}
                    onClick={() => setSelectedStock(s)}
                  >
                    <td className="py-2.5 px-3 text-center">
                      <span className="text-sm">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-xs text-gray-400">{i + 1}</span>}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-gray-400">{s.stock_id}</span>
                        <span className="font-medium text-gray-800">{s.name ?? s.stock_id}</span>
                        <LimitBadge changePct={s.change_pct} />
                      </div>
                      {s.sector && <div className="text-[11px] text-gray-400 mt-0.5">{s.sector}</div>}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`font-mono font-bold ${up ? 'text-red-600' : 'text-emerald-600'}`}>
                        {s.close?.toFixed(2) ?? '-'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`text-xs flex items-center justify-end gap-0.5 ${up ? 'text-red-500' : 'text-emerald-500'}`}>
                        {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {Math.abs(s.change_pct).toFixed(2)}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <ScoreBar score={s.total_score} max={totalMax} />
                    </td>
                    <td className="py-2.5 px-3">
                      {trend && trend.length >= 2 ? (
                        <ScoreTrendChart data={trend} width={80} height={24} />
                      ) : (
                        <span className="text-[11px] text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${actionCls}`}>
                        {s.strategy.recommendation}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <WatchlistToggleBtn stockId={s.stock_id} size="sm" />
                        <ChevronRight size={14} className="text-gray-300" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedStock && (
        <StockDetailModal
          stock={selectedStock}
          onClose={() => setSelectedStock(null)}
          rank={stocks.indexOf(selectedStock) + 1}
          isDemo={isDemo}
        />
      )}
    </>
  );
}
