'use client';
import { useState } from 'react';
import { ScanStock, DIMENSION_CONFIG, getActionColor, getStockEntryLow, getStockEntryHigh, getStockStopLoss, getStockTarget1 } from '@/lib/scanTypes';
import StockDetailModal from './StockDetailModal';
import { WatchlistToggleBtn } from './WatchlistPanel';
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
        up ? 'bg-red-500/20 text-red-600' : 'bg-emerald-500/20 text-emerald-600'
      }`}
    >
      {up ? '漲停' : '跌停'}
    </span>
  );
}

/** 三關價欄位（進場區間 / 停損 / 目標） */
function ThreeKeyPrices({ stock }: { stock: ScanStock }) {
  const entryLow = getStockEntryLow(stock);
  const entryHigh = getStockEntryHigh(stock);
  const stopLoss = getStockStopLoss(stock);
  const target = getStockTarget1(stock);
  return (
    <div className="flex flex-col gap-0.5 text-[10px] font-mono leading-tight">
      <div className="flex items-center gap-1">
        <span className="text-sky-600 w-8">進場</span>
        <span className="text-gray-700">
          {entryLow && entryHigh
            ? `${entryLow}–${entryHigh}`
            : entryLow || entryHigh || '—'}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-red-500 w-8">停損</span>
        <span className="text-gray-700">{stopLoss ?? '—'}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-emerald-600 w-8">目標</span>
        <span className="text-gray-700">{target ?? '—'}</span>
      </div>
    </div>
  );
}

export default function Top10Table({ stocks, scanDate, scannedCount, isDemo }: Props) {
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
                <span className="text-[10px] bg-amber-500/15 text-amber-600 border border-amber-500/30 px-1.5 py-0.5 rounded font-normal">
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
        <div className="block md:hidden divide-y divide-gray-200">
          {stocks.map((s, i) => {
            const up = s.change_pct >= 0;
            const isLimit = Math.abs(s.change_pct) >= 9.5;
            const limitCls = isLimit
              ? up
                ? 'ring-1 ring-red-500/60 bg-red-500/5'
                : 'ring-1 ring-emerald-500/60 bg-emerald-500/5'
              : '';
            const actionCls = getActionColor(s.strategy.recommendation);
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
                    <span className="text-sm font-semibold text-gray-800 truncate">{s.name}</span>
                    <span className="text-[10px] text-gray-500 hidden sm:inline bg-gray-100 px-1 rounded">{s.sector}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <ScoreBar score={s.total_score} max={totalMax} />
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${actionCls}`}>
                      {s.strategy.recommendation.split(' - ')[0]}
                    </span>
                  </div>
                </button>
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <div className="text-sm font-mono font-bold text-gray-800">{s.close.toLocaleString()}</div>
                  <div className={`text-xs font-mono flex items-center justify-end gap-1 ${up ? 'text-emerald-600' : 'text-red-500'}`}>
                    {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {Math.abs(s.change_pct).toFixed(2)}%
                    <LimitBadge changePct={s.change_pct} />
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
              <tr className="text-gray-500 border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-2.5 font-medium w-8">#</th>
                <th className="text-left px-3 py-2.5 font-medium">代號 / 名稱</th>
                <th className="text-left px-3 py-2.5 font-medium hidden lg:table-cell">族群</th>
                <th className="text-right px-3 py-2.5 font-medium">收盤</th>
                <th className="text-right px-3 py-2.5 font-medium">漲跌</th>
                <th className="text-left px-3 py-2.5 font-medium">綜合分</th>
                <th className="text-left px-3 py-2.5 font-medium">三關價</th>
                <th className="text-left px-3 py-2.5 font-medium">建議</th>
                <th className="px-3 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stocks.map((s, i) => {
                const up = s.change_pct >= 0;
                const isLimit = Math.abs(s.change_pct) >= 9.5;
                const rowCls = isLimit
                  ? up
                    ? 'ring-1 ring-inset ring-red-500/50 bg-red-500/5'
                    : 'ring-1 ring-inset ring-emerald-500/50 bg-emerald-500/5'
                  : '';
                const actionCls = getActionColor(s.strategy.recommendation);
                return (
                  <tr
                    key={s.stock_id}
                    onClick={() => setSelectedStock(s)}
                    className={`hover:bg-gray-50 cursor-pointer transition-colors group ${rowCls}`}
                  >
                    <td className="px-4 py-2.5 text-gray-400 font-mono text-center">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-gray-500 text-[11px]">{s.stock_id}</div>
                      <div className="font-semibold text-gray-800">{s.name}</div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 hidden lg:table-cell">{s.sector}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-800">
                      {s.close.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`font-mono flex items-center justify-end gap-1 ${up ? 'text-emerald-600' : 'text-red-500'}`}>
                        {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(s.change_pct).toFixed(2)}%
                        <LimitBadge changePct={s.change_pct} />
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <ScoreBar score={s.total_score} max={totalMax} />
                    </td>
                    <td className="px-3 py-2.5">
                      <ThreeKeyPrices stock={s} />
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
        <StockDetailModal
          stock={selectedStock}
          rank={stocks.indexOf(selectedStock) + 1}
          onClose={() => setSelectedStock(null)}
        />
      )}
    </>
  );
}
