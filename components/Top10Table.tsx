'use client';
import { useState } from 'react';
import { ScanStock, DIMENSION_CONFIG } from '@/lib/scanTypes';
import StockDetailModal from './StockDetailModal';
import { WatchlistToggleBtn } from './WatchlistPanel';
import { ChevronRight, ArrowUpRight, ArrowDownRight, Copy, Check, Flame } from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
} from 'recharts';

const DIM_LABELS: Record<string, string> = {
  technical: '技', fundamental: '基', news: '消', sentiment: '情', chips: '籌',
};
const DIM_MAXES: Record<string, number> = {
  technical: 40, fundamental: 40, news: 10, sentiment: 10, chips: 10,
};

function getActionStyle(action: string) {
  if (action === '強力買進') return { cls: 'text-red-400 font-bold', dot: 'bg-red-400' };
  if (action === '買進')   return { cls: 'text-orange-400 font-bold', dot: 'bg-orange-400' };
  if (action === '觀望')   return { cls: 'text-gray-400', dot: 'bg-gray-600' };
  return { cls: 'text-emerald-400', dot: 'bg-emerald-400' };
}

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-sky-500' : pct >= 35 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1 rounded-full bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-bold text-gray-300 w-8 text-right">{Math.round(score)}</span>
    </div>
  );
}

function MiniRadar({ dimensions }: { dimensions: Record<string, number> }) {
  const data = Object.entries(DIM_LABELS).map(([key, label]) => ({
    dim: label,
    value: Math.round(((dimensions[key] as number ?? 0) / (DIM_MAXES[key] ?? 10)) * 100),
  }));
  return (
    <ResponsiveContainer width={72} height={72}>
      <RadarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <PolarGrid stroke="#1e293b" />
        <PolarAngleAxis dataKey="dim" tick={{ fontSize: 8, fill: '#4b5563' }} />
        <Radar dataKey="value" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.2} strokeWidth={1} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={copy}
      className="p-1 rounded hover:bg-gray-700 transition-colors"
      title="複製股票代號"
    >
      {copied
        ? <Check className="w-3 h-3 text-emerald-400" />
        : <Copy className="w-3 h-3 text-gray-600 hover:text-gray-400" />}
    </button>
  );
}

function LimitBadge({ changePct }: { changePct: number }) {
  if (Math.abs(changePct) < 9.5) return null;
  const up = changePct >= 0;
  return (
    <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${up ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
      {up ? '漲停' : '跌停'}
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const isTop3 = rank <= 3;
  return (
    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
      rank === 1 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
      rank === 2 ? 'bg-gray-400/20 text-gray-300 border border-gray-500/30' :
      rank === 3 ? 'bg-orange-800/30 text-orange-300 border border-orange-700/30' :
      'bg-gray-800 text-gray-500'
    }`}>
      {isTop3 ? rank : rank}
    </span>
  );
}

interface Props {
  stocks: ScanStock[];
  scanDate?: string;
  scannedCount?: number;
  isDemo?: boolean;
  trendMap?: Record<string, { date: string; score: number }[]>;
}

export default function Top10Table({ stocks, scanDate, scannedCount, isDemo, trendMap }: Props) {
  const [selectedStock, setSelectedStock] = useState<ScanStock | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const totalMax = Object.values(DIMENSION_CONFIG).reduce((s, c) => s + c.max, 0);

  return (
    <>
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-red-400" />
              Top 10 強勢股
              {isDemo && (
                <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-normal">示範資料</span>
              )}
            </h3>
            {scanDate && (
              <div className="text-[11px] text-gray-500 mt-0.5">
                掃描日期：<span className="font-mono text-gray-400">{scanDate}</span>
                {scannedCount ? <span>　掃描標的：<span className="font-mono text-gray-400">{scannedCount.toLocaleString()}</span> 檔</span> : ''}
              </div>
            )}
          </div>
          <span className="text-xs text-gray-600">{stocks.length} 檔入選</span>
        </div>

        {/* Mobile cards */}
        <div className="block md:hidden divide-y divide-gray-800/50">
          {stocks.map((s, i) => {
            const up = (s.change_pct ?? 0) >= 0;
            const actionStyle = getActionStyle(s.strategy.recommendation);
            const isExpanded = expandedId === s.stock_id;
            return (
              <div key={s.stock_id} className="p-3">
                <div
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : s.stock_id)}
                >
                  <RankBadge rank={i + 1} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-white truncate">{s.name}</span>
                      <span className="font-mono text-[10px] text-gray-500">{s.stock_id}</span>
                      <CopyBtn text={s.stock_id} />
                      <LimitBadge changePct={s.change_pct ?? 0} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-600">{s.sector}</span>
                      <span className={`text-[10px] ${actionStyle.cls}`}>{s.strategy.recommendation}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-white text-sm">{s.close.toLocaleString()}</div>
                    <div className={`text-[11px] font-mono ${up ? 'text-red-400' : 'text-emerald-400'}`}>
                      {up ? '▲' : '▼'}{Math.abs(s.change_pct ?? 0).toFixed(2)}%
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-gray-600 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </div>
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-800/50 space-y-2">
                    <div className="flex items-center gap-3">
                      {s.dimensions && <MiniRadar dimensions={s.dimensions as unknown as Record<string, number>} />}
                      <div className="flex-1 space-y-1">
                        <ScoreBar score={s.total_score} max={totalMax} />
                        <div className="text-[10px] text-gray-600">綜合評分</div>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedStock(s)}
                      className="w-full py-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs font-medium hover:bg-sky-500/15 transition-colors"
                    >
                      查看完整分析
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-2.5 text-[11px] text-gray-500 font-medium w-8">#</th>
                <th className="text-left px-3 py-2.5 text-[11px] text-gray-500 font-medium">股票</th>
                <th className="text-right px-3 py-2.5 text-[11px] text-gray-500 font-medium">收盤</th>
                <th className="text-right px-3 py-2.5 text-[11px] text-gray-500 font-medium">漲跌</th>
                <th className="text-left px-3 py-2.5 text-[11px] text-gray-500 font-medium w-36">綜合評分</th>
                <th className="text-center px-3 py-2.5 text-[11px] text-gray-500 font-medium">雷達</th>
                <th className="text-left px-3 py-2.5 text-[11px] text-gray-500 font-medium">建議</th>
                <th className="text-right px-3 py-2.5 text-[11px] text-gray-500 font-medium">目標</th>
                <th className="px-3 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {stocks.map((s, i) => {
                const up = (s.change_pct ?? 0) >= 0;
                const actionStyle = getActionStyle(s.strategy.recommendation);
                return (
                  <tr
                    key={s.stock_id}
                    className="hover:bg-gray-800/40 cursor-pointer transition-colors group"
                    onClick={() => setSelectedStock(s)}
                  >
                    <td className="px-4 py-3">
                      <RankBadge rank={i + 1} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white">{s.name}</span>
                        <span className="font-mono text-[10px] text-gray-500">{s.stock_id}</span>
                        <CopyBtn text={s.stock_id} />
                        <LimitBadge changePct={s.change_pct ?? 0} />
                      </div>
                      <div className="text-[10px] text-gray-600 mt-0.5">{s.sector}</div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-mono font-bold text-white">{s.close.toLocaleString()}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={`font-mono text-xs flex items-center justify-end gap-0.5 ${up ? 'text-red-400' : 'text-emerald-400'}`}>
                        {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(s.change_pct ?? 0).toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <ScoreBar score={s.total_score} max={totalMax} />
                    </td>
                    <td className="px-3 py-3">
                      {s.dimensions && (
                        <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                          <MiniRadar dimensions={s.dimensions as unknown as Record<string, number>} />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${actionStyle.dot}`} />
                        <span className={`text-xs ${actionStyle.cls}`}>{s.strategy.recommendation}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-xs font-mono text-red-300">+{s.strategy.upside}%</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <WatchlistToggleBtn stockId={s.stock_id} stockName={s.name} />
                        <ChevronRight className="w-4 h-4 text-gray-700 group-hover:text-gray-400 transition-colors" />
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
          rank={stocks.findIndex((s) => s.stock_id === selectedStock.stock_id) + 1}
          isDemo={isDemo}
        />
      )}
    </>
  );
}
