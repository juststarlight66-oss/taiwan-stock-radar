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
    return { cls: 'text-red-600 font-bold', dot: 'bg-red-500', label: '強力買進' };
  }
  if (a.includes('積極')) {
    return { cls: 'text-orange-500 font-bold', dot: 'bg-orange-500', label: '積極買進' };
  }
  if (a.includes('買進') || a.includes('buy')) {
    return { cls: 'text-orange-400 font-semibold', dot: 'bg-orange-400', label: '買進' };
  }
  if (a.includes('觀望') || a.includes('watch') || a.includes('hold')) {
    return { cls: 'text-gray-500', dot: 'bg-gray-400', label: '觀望' };
  }
  if (a.includes('偏弱') || a.includes('weak') || a.includes('avoid')) {
    return { cls: 'text-gray-400', dot: 'bg-gray-300', label: '偏弱' };
  }
  return { cls: 'text-emerald-600', dot: 'bg-emerald-500', label: action.split(' - ')[0] };
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
      rank === 3 ? 'bg-orange-50 text-orange-700 border border-orange-200' :
      'text-gray-400'
    }`}>
      {rank <= 3 ? rank : rank}
    </span>
  );
}

interface ScoreTrendPoint { score: number; }
function ScoreTrendChart({ stockId, history, width, height }: {
  stockId: string;
  history: ScoreTrendPoint[];
  width: number;
  height: number;
}) {
  if (!history || history.length < 2) return null;
  const scores = history.map(h => h.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;
  const pts = scores.map((s, i) => {
    const x = (i / (scores.length - 1)) * width;
    const y = height - ((s - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  const last = scores[scores.length - 1];
  const prev = scores[scores.length - 2];
  const color = last >= prev ? '#10b981' : '#ef4444';
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

export default function Top10Table({
  stocks,
  history,
}: {
  stocks: ScanStock[];
  history?: Record<string, ScoreTrendPoint[]>;
}) {
  const [selectedStock, setSelectedStock] = useState<ScanStock | null>(null);

  if (!stocks || stocks.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg">尚無掃描資料</p>
        <p className="text-sm mt-1 text-gray-400">等待下次掃描結果...</p>
      </div>
    );
  }

  const totalMax = Math.max(...stocks.map(s => s.total_score));

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-100">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-8">#</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">股票</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">族群</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">收盤</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">漲跌</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">評分</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">趨勢</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 bg-white">
            {stocks.map((s, i) => {
              const up = s.change_pct >= 0;
              const rec = s.strategy?.recommendation ?? '';
              const { cls: actionCls } = getActionStyle(rec);
              const { label: actionLabel } = getActionStyle(rec);
              const trend = history?.[s.stock_id];
              const rowCls = i === 0 ? 'bg-amber-50/30' : '';

              return (
                <tr
                  key={s.stock_id}
                  onClick={() => setSelectedStock(s)}
                  className={`hover:bg-gray-800/40 cursor-pointer transition-colors group ${rowCls}`}
                >
                  <td className="px-4 py-2.5 text-gray-600 font-mono">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-mono text-gray-500 text-[11px]">{s.stock_id}</div>
                    <div className="font-semibold text-gray-200">{s.name}</div>
                  </td>
                  <td className="px-3 py-2.5 text-gray-400 hidden lg:table-cell">{s.sector}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold text-white">
                    {s.close.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`font-mono flex items-center justify-end gap-1 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {Math.abs(s.change_pct).toFixed(2)}%
                      <LimitBadge changePct={s.change_pct} />
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <ScoreBar score={s.total_score} max={totalMax} />
                  </td>
                  <td className="px-3 py-2.5">
                    {trend && trend.length >= 2 ? (
                      <ScoreTrendChart stockId={s.stock_id} history={trend} width={80} height={28} />
                    ) : (
                      <span className="text-[10px] text-gray-700">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${actionCls}`}>
                      {actionLabel}
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

      {selectedStock && (
        <StockDetailModal stock={selectedStock} onClose={() => setSelectedStock(null)} />
      )}
    </>
  );
}
