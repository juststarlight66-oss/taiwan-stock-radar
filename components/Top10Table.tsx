'use client';
import { useState } from 'react';
import {
  ScanStock, DIMENSION_CONFIG,
  getStockName, getStockSector, getStockRecommendation,
  getStockEntryLow, getStockEntryHigh, getStockStopLoss, getStockTarget1,
} from '@/lib/scanTypes';
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
    <div className="flex items-center gap-1.5">
      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-6 text-right">{Math.round(score)}</span>
    </div>
  );
}

function LimitBadge({ changePct }: { changePct: number }) {
  if (Math.abs(changePct) < 9.5) return null;
  const up = changePct >= 0;
  return (
    <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${up ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>
      {up ? '漲停' : '跌停'}
    </span>
  );
}

function ThreeKeyPrices({ stock }: { stock: ScanStock }) {
  const entryLow = getStockEntryLow(stock);
  const entryHigh = getStockEntryHigh(stock);
  const stopLoss = getStockStopLoss(stock);
  const target = getStockTarget1(stock);
  return (
    <div className="text-xs space-y-0.5 text-gray-600">
      <div>
        <span className="text-emerald-600 font-medium">進場</span>{' '}
        {entryLow && entryHigh
          ? `${entryLow}–${entryHigh}`
          : entryLow || entryHigh || '—'}
      </div>
      <div><span className="text-red-500 font-medium">停損</span>{stopLoss ?? '—'}</div>
      <div><span className="text-sky-500 font-medium">目標</span>{target ?? '—'}</div>
    </div>
  );
}

function getActionColor(rec: string | undefined): string {
  if (!rec) return 'bg-gray-100 text-gray-500';
  const r = rec.toLowerCase();
  if (r.includes('★★★') || r.includes('strong') || r.includes('強力')) return 'bg-red-100 text-red-700';
  if (r.includes('積極')) return 'bg-orange-100 text-orange-700';
  if (r.includes('買進') || r.includes('buy')) return 'bg-emerald-100 text-emerald-700';
  if (r.includes('逢低')) return 'bg-sky-100 text-sky-700';
  if (r.includes('觀望') || r.includes('wait') || r.includes('hold')) return 'bg-amber-100 text-amber-700';
  return 'bg-gray-100 text-gray-500';
}

export default function Top10Table({ stocks, scanDate, scannedCount, isDemo }: Props) {
  const [selectedStock, setSelectedStock] = useState<ScanStock | null>(null);
  const totalMax = Object.values(DIMENSION_CONFIG).reduce((s, c) => s + c.max, 0);

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
            Top 10 強勢股&nbsp;
            {isDemo && (
              <span className="text-xs font-normal bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                示範資料
              </span>
            )}
          </h2>
          {scanDate && (
            <p className="text-xs text-gray-400">
              掃描日期：{scanDate}
              {scannedCount ? `　掃描標的：${scannedCount} 檔` : ''}
            </p>
          )}
          <span className="text-xs text-gray-400">{stocks.length} 檔</span>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-gray-50">
          {stocks.map((s, i) => {
            const up = (s.change_pct ?? 0) >= 0;
            const changePct = s.change_pct ?? 0;
            const isLimit = Math.abs(changePct) >= 9.5;
            const limitCls = isLimit
              ? up
                ? 'ring-1 ring-red-500/60 bg-red-500/5'
                : 'ring-1 ring-emerald-500/60 bg-emerald-500/5'
              : '';
            const rec = getStockRecommendation(s);
            const actionCls = getActionColor(rec);
            return (
              <div key={s.stock_id} className={`px-4 py-3 flex items-center gap-3 ${limitCls}`}>
                <button
                  className="flex-1 text-left"
                  onClick={() => setSelectedStock(s)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-gray-500 w-6">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </span>
                    <span className="text-sm font-bold text-gray-800">{s.stock_id}</span>
                    <span className="text-sm text-gray-600">{getStockName(s)}</span>
                    <span className="text-xs text-gray-400">{getStockSector(s)}</span>
                    <LimitBadge changePct={changePct} />
                  </div>
                  <div className="flex items-center gap-3 pl-8">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${actionCls}`}>
                      {rec ? rec.split(' - ')[0] : '—'}
                    </span>
                    <span className={`text-sm font-semibold ${up ? 'text-red-500' : 'text-green-600'}`}>
                      {(s.close ?? 0).toLocaleString()}
                    </span>
                    <span className={`text-xs flex items-center gap-0.5 ${up ? 'text-red-500' : 'text-green-600'}`}>
                      {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {Math.abs(changePct).toFixed(2)}%
                    </span>
                  </div>
                </button>
                <WatchlistToggleBtn stockId={s.stock_id} />
              </div>
            );
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100">
                <th className="px-3 py-2 text-left w-8">#</th>
                <th className="px-3 py-2 text-left">代號 / 名稱</th>
                <th className="px-3 py-2 text-left">族群</th>
                <th className="px-3 py-2 text-right">收盤</th>
                <th className="px-3 py-2 text-right">漲跌</th>
                <th className="px-3 py-2 text-right">綜合分</th>
                <th className="px-3 py-2 text-left">三關價</th>
                <th className="px-3 py-2 text-center">建議</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stocks.map((s, i) => {
                const up = (s.change_pct ?? 0) >= 0;
                const changePct = s.change_pct ?? 0;
                const isLimit = Math.abs(changePct) >= 9.5;
                const rowCls = isLimit
                  ? up
                    ? 'ring-1 ring-inset ring-red-500/50 bg-red-500/5'
                    : 'ring-1 ring-inset ring-emerald-500/50 bg-emerald-500/5'
                  : '';
                const rec = getStockRecommendation(s);
                const actionCls = getActionColor(rec);
                return (
                  <tr
                    key={s.stock_id}
                    onClick={() => setSelectedStock(s)}
                    className={`hover:bg-gray-50 cursor-pointer transition-colors group ${rowCls}`}
                  >
                    <td className="px-3 py-3 text-gray-400 font-medium">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-bold text-gray-800">{s.stock_id}</div>
                      <div className="text-xs text-gray-500">{getStockName(s)}</div>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500">{getStockSector(s)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-gray-800">
                      {(s.close ?? 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className={`flex items-center justify-end gap-0.5 ${up ? 'text-red-500' : 'text-green-600'}`}>
                        {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        <span className="text-xs">{Math.abs(changePct).toFixed(2)}%</span>
                        <LimitBadge changePct={changePct} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <ScoreBar score={s.total_score} max={totalMax} />
                    </td>
                    <td className="px-3 py-3">
                      <ThreeKeyPrices stock={s} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${actionCls}`}>
                        {rec ? rec.split(' - ')[0] : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
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
          isDemo={isDemo}
        />
      )}
    </>
  );
}
