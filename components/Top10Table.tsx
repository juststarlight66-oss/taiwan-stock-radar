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

// Handle all Python recommendation formats:
// "★★★ Strong Recommend" / "強力買進" / "積極買進 ⚡ 中型部位" / "買進" / "觀望" / "偏弱"
function getActionStyle(action: string | undefined) {
  if (!action) return { cls: 'text-gray-400', dot: 'bg-gray-400', label: '—' };
  const a = action.toLowerCase();
  if (a.includes('★★★') || a.includes('strong') || a.includes('強力')) {
    return { cls: 'text-red-600 font-bold', dot: 'bg-red-500', label: action };
  }
  if (a.includes('積極')) {
    return { cls: 'text-orange-500 font-bold', dot: 'bg-orange-500', label: action };
  }
  if (a.includes('買進')) {
    return { cls: 'text-orange-400 font-semibold', dot: 'bg-orange-400', label: action };
  }
  if (a.includes('觀望')) {
    return { cls: 'text-gray-500', dot: 'bg-gray-400', label: action };
  }
  return { cls: 'text-emerald-600', dot: 'bg-emerald-500', label: action };
}

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color = pct >= 70 ? 'bg-violet-500' : pct >= 50 ? 'bg-sky-500' : pct >= 35 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-bold text-gray-700 w-8 text-right">{Math.round(score)}</span>
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
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis dataKey="dim" tick={{ fontSize: 8, fill: '#6b7280' }} />
        <Radar dataKey="value" stroke="#0284c7" fill="#0284c7" fillOpacity={0.15} strokeWidth={1.5} />
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
      className="p-1 rounded hover:bg-gray-100 transition-colors"
      title="複製股票代號"
    >
      {copied
        ? <Check className="w-3 h-3 text-emerald-500" />
        : <Copy className="w-3 h-3 text-gray-400 hover:text-gray-600" />}
    </button>
  );
}

function LimitBadge({ changePct }: { changePct: number }) {
  if (Math.abs(changePct) < 9.5) return null;
  const up = changePct >= 0;
  return (
    <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${up ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
      {up ? '漲停' : '跌停'}
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
      rank === 1 ? 'bg-amber-100 text-amber-700 border border-amber-300' :
      rank === 2 ? 'bg-gray-100 text-gray-600 border border-gray-300' :
      rank === 3 ? 'bg-orange-100 text-orange-700 border border-orange-300' :
      'bg-gray-100 text-gray-500 border border-gray-200'
    }`}>
      {rank}
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

export default function Top10Table({ stocks, scanDate, scannedCount, isDemo = false, trendMap }: Props) {
  void trendMap;
  const [selected, setSelected] = useState<ScanStock | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const totalMax = Object.values(DIMENSION_CONFIG).reduce((s, c) => s + c.max, 0);

  return (
    <>
      {isDemo && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-center gap-2">
          <span>⚠️</span>
          <span>目前顯示示範資料。請等待今日掃描完成，或選擇歷史日期查看真實數據。</span>
        </div>
      )}
      {scanDate && (
        <div className="mb-2 text-xs text-gray-400">
          掃描日期：{scanDate}　掃描標的：{scannedCount?.toLocaleString() ?? '—'} 檔
        </div>
      )}
      <div className="divide-y divide-gray-100">
        {stocks.map((stock, idx) => {
          const rank = (stock as any).rank ?? idx + 1;
          const actionStyle = getActionStyle(stock.strategy?.recommendation);
          const isExpanded = expandedId === stock.stock_id;

          // Entry display: prefer entry_low~entry_high range, fallback to single entry
          const entryLow  = stock.strategy?.entry_low  ?? stock.strategy?.entry ?? 0;
          const entryHigh = stock.strategy?.entry_high ?? stock.strategy?.entry ?? 0;
          const entryDisplay = entryLow > 0 && entryHigh > 0 && entryLow !== entryHigh
            ? `${entryLow.toLocaleString()}~${entryHigh.toLocaleString()}`
            : entryLow > 0 ? entryLow.toLocaleString() : '—';

          const dims = stock.dimensions ?? {};

          return (
            <div
              key={stock.stock_id}
              className="py-3 px-1 hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : stock.stock_id)}
            >
              {/* ── Row: rank + name + badges + score ── */}
              <div className="flex items-center gap-2">
                <RankBadge rank={rank} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-sm text-gray-800">{stock.name}</span>
                    <span className="text-xs text-gray-400">{stock.stock_id}</span>
                    <LimitBadge changePct={stock.change_pct} />
                    {(stock as any).power_combo && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-purple-100 text-purple-700 font-bold flex items-center gap-0.5">
                        <Flame className="w-2.5 h-2.5" />強勢組合
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400">{stock.sector}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs ${stock.change_pct >= 0 ? 'text-red-500' : 'text-green-600'} font-mono`}>
                      {stock.change_pct >= 0 ? <ArrowUpRight className="w-3 h-3 inline" /> : <ArrowDownRight className="w-3 h-3 inline" />}
                      {Math.abs(stock.change_pct).toFixed(2)}%
                    </span>
                    <span className="text-xs text-gray-500 font-mono">{stock.close.toLocaleString()}</span>
                    {/* Recommendation badge */}
                    <span className={`text-[10px] ${actionStyle.cls} truncate max-w-[140px]`} title={stock.strategy?.recommendation}>
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${actionStyle.dot} mr-0.5`} />
                      {stock.strategy?.recommendation ?? '—'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ScoreBar score={stock.total_score} max={totalMax} />
                  <WatchlistToggleBtn stockId={stock.stock_id} stockName={stock.name} />
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelected(stock); }}
                    className="p-1 rounded hover:bg-gray-100"
                    title="詳細分析"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              </div>

              {/* ── Expanded row ── */}
              {isExpanded && (
                <div className="mt-3 ml-7 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-gray-600">
                  {/* Left: radar + dims */}
                  <div className="flex items-start gap-2">
                    {Object.keys(dims).length > 0 && (
                      <div className="shrink-0">
                        <MiniRadar dimensions={dims as Record<string, number>} />
                      </div>
                    )}
                    <div className="space-y-1">
                      {Object.entries(DIM_LABELS).map(([key, label]) => (
                        <div key={key} className="flex items-center gap-1">
                          <span className="text-gray-400 w-4">{label}</span>
                          <ScoreBar score={(dims as any)[key] ?? 0} max={DIM_MAXES[key] ?? 10} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right: strategy */}
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      <span className="text-gray-400 w-12 shrink-0">進場</span>
                      <span className="font-mono">{entryDisplay}</span>
                    </div>
                    <div className="flex gap-1">
                      <span className="text-gray-400 w-12 shrink-0">停損</span>
                      <span className="font-mono text-red-500">{stock.strategy?.stop_loss?.toLocaleString() ?? '—'}</span>
                    </div>
                    <div className="flex gap-1">
                      <span className="text-gray-400 w-12 shrink-0">目標1</span>
                      <span className="font-mono text-green-600">{stock.strategy?.target1?.toLocaleString() ?? stock.strategy?.target?.toLocaleString() ?? '—'}</span>
                    </div>
                    <div className="flex gap-1">
                      <span className="text-gray-400 w-12 shrink-0">目標2</span>
                      <span className="font-mono text-green-700">{stock.strategy?.target2?.toLocaleString() ?? '—'}</span>
                    </div>
                    <div className="flex gap-1">
                      <span className="text-gray-400 w-12 shrink-0">目標3</span>
                      <span className="font-mono text-green-800">{stock.strategy?.target3?.toLocaleString() ?? '—'}</span>
                    </div>
                    {stock.strategy?.hold_days && (
                      <div className="flex gap-1">
                        <span className="text-gray-400 w-12 shrink-0">持有</span>
                        <span>{stock.strategy.hold_days} 天</span>
                      </div>
                    )}
                    {stock.strategy?.reason && (
                      <div className="mt-1 text-[10px] text-gray-500 leading-relaxed">
                        {stock.strategy.reason}
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 flex items-center gap-2 pt-1">
                    <CopyBtn text={stock.stock_id} />
                    <span className="text-gray-400">複製代號</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {selected && (
        <StockDetailModal stock={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
