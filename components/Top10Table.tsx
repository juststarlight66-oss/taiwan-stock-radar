'use client';
import { useState } from 'react';
import {
  ScanStock,
  DIMENSION_CONFIG,
  getActionColor,
  getStockName,
  getStockSector,
  getStockDimensions,
} from '@/lib/scanTypes';
import StockDetailModal from './StockDetailModal';
import { WatchlistToggleBtn } from './WatchlistPanel';
import RadarChart from './RadarChart';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

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

/** 漲跌停徽章 */
function LimitBadge({ changePct }: { changePct: number }) {
  if (Math.abs(changePct) < 9.5) return null;
  const up = changePct >= 0;
  return (
    <span
      className={`text-[9px] px-1 py-0.5 rounded font-bold ${
        up ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'
      }`}
    >
      {up ? '漲停' : '跌停'}
    </span>
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
            const up = (s.change_pct ?? 0) >= 0;
            const isLimit = Math.abs(s.change_pct ?? 0) >= 9.5;
            const limitCls = isLimit
              ? up
                ? 'ring-1 ring-red-500/60 bg-red-500/5'
                : 'ring-1 ring-emerald-500/60 bg-emerald-500/5'
              : '';
            const rec = s.recommendation ?? s.strategy?.recommendation ?? '';
            const actionCls = getActionColor(rec);
            return (
              <div key={s.stock_id} className={`flex items-center gap-3 p-3 ${limitCls}`}>
                <button
                  className="flex-1 text-left hover:bg-gray-800/50 transition-colors"
                  onClick={() => setSelectedStock(s)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-gray-600 w-4">{i + 1}</span>
                    <span className="font-mono text-xs text-gray-500">{s.stock_id}</span>
                    <span className="text-sm font-semibold text-gray-200 truncate">{getStockName(s)}</span>
                    <span className="text-[10px] text-gray-500 hidden sm:inline bg-gray-800 px-1 rounded">{getStockSector(s)}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <ScoreBar score={s.total_score} max={totalMax} />
                    {rec && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${actionCls}`}>
                        {rec.split(' - ')[0]}
                      </span>
                    )}
                    <RadarChart dimensions={getStockDimensions(s)} size={56} />
                  </div>
                </button>
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <div className="text-sm font-mono font-bold text-white">{(s.close ?? 0).toLocaleString()}</div>
                  <div className={`text-xs font-mono flex items-center justify-end gap-1 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
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
              <tr className="text-gray-500 border-b border-gray-700/40 bg-gray-800/30">
                <th className="text-left px-4 py-2.5 font-medium w-8">#</th>
                <th className="text-left px-3 py-2.5 font-medium">代號 / 名稱</th>
                <th className="text-left px-3 py-2.5 font-medium hidden lg:table-cell">族群</th>
                <th className="text-right px-3 py-2.5 font-medium">收盤</th>
                <th className="text-right px-3 py-2.5 font-medium">漲跌</th>
                <th className="text-left px-3 py-2.5 font-medium">綜合分</th>
                <th className="text-left px-3 py-2.5 font-medium">五維分析</th>
                <th className="text-left px-3 py-2.5 font-medium">建議</th>
                <th className="px-3 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/20">
              {stocks.map((s, i) => {
                const up = (s.change_pct ?? 0) >= 0;
                const isLimit = Math.abs(s.change_pct ?? 0) >= 9.5;
                const rowCls = isLimit
                  ? up
                    ? 'ring-1 ring-inset ring-red-500/50 bg-red-500/5'
                    : 'ring-1 ring-inset ring-emerald-500/50 bg-emerald-500/5'
                  : '';
                const rec = s.recommendation ?? s.strategy?.recommendation ?? '';
                const actionCls = getActionColor(rec);
                return (
                  <tr
                    key={s.stock_id}
                    onClick={() => setSelectedStock(s)}
                    className={`hover:bg-gray-800/40 cursor-pointer transition-colors group ${rowCls}`}
                  >
                    <td className="px-4 py-2.5 text-gray-600 font-mono">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-gray-500 text-[11px]">{s.stock_id}</div>
                      <div className="font-semibold text-gray-200">{getStockName(s)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-400 hidden lg:table-cell">{getStockSector(s)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-white">
                      {(s.close ?? 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`font-mono flex items-center justify-end gap-1 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                        {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(s.change_pct ?? 0).toFixed(2)}%
                        <LimitBadge changePct={s.change_pct ?? 0} />
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <ScoreBar score={s.total_score} max={totalMax} />
                    </td>
                    <td className="px-3 py-2.5">
                      <RadarChart dimensions={getStockDimensions(s)} size={80} />
                    </td>
                    <td className="px-3 py-2.5">
                      {rec && (
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${actionCls}`}>
                          {rec.split(' - ')[0]}
                        </span>
                      )}
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
