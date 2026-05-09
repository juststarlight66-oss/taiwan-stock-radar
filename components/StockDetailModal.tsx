'use client';
import {
  ScanStock, StockNarrative, DIMENSION_CONFIG,
  getStockName, getStockSector, getStockClose, getStockChangePct,
  getStockRecommendation, getStockReason, getStockDimensions,
  getStockEntryLow, getStockEntryHigh, getStockStopLoss,
  getStockTarget1, getStockTarget2, getStockTarget3,
} from '@/lib/scanTypes';
import { X, Target, Shield, TrendingUp, TrendingDown, ExternalLink, Share2, Check } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useOnDemandScan } from '@/lib/useScanData';

interface Props {
  stock: ScanStock;
  onClose: () => void;
  rank?: number;
  isDemo?: boolean;
}

function getActionStyle(rec: string | undefined) {
  if (!rec) return { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-600', label: '觀望' };
  const r = rec.toLowerCase();
  if (r.includes('★★★') || r.includes('strong') || r.includes('強力')) {
    return { bg: 'bg-red-50', border: 'border-red-400', text: 'text-red-600', label: '強力買進' };
  }
  if (r.includes('積極')) {
    return { bg: 'bg-orange-50', border: 'border-orange-400', text: 'text-orange-600', label: '積極買進' };
  }
  if (r.includes('買進') || r.includes('buy')) {
    return { bg: 'bg-emerald-50', border: 'border-emerald-400', text: 'text-emerald-600', label: '買進' };
  }
  if (r.includes('逢低')) {
    return { bg: 'bg-sky-50', border: 'border-sky-400', text: 'text-sky-600', label: '逢低佈局' };
  }
  if (r.includes('觀望') || r.includes('wait') || r.includes('hold')) {
    return { bg: 'bg-amber-50', border: 'border-amber-400', text: 'text-amber-600', label: '觀望' };
  }
  return { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-600', label: '偏弱' };
}

const DIM_LABELS: Record<string, string> = {
  technical: '技術面', fundamental: '基本面', news: '消息面', sentiment: '市場情緒', chips: '籌碼面',
};
const DIM_COLORS: Record<string, string> = {
  technical: '#38bdf8', fundamental: '#34d399', news: '#fbbf24', sentiment: '#a78bfa', chips: '#f87171',
};

/** 五維雷達圖（純 SVG） */
function RadarChart({ stock }: { stock: ScanStock }) {
  const dims = getStockDimensions(stock);
  const keys = ['technical', 'fundamental', 'chips', 'news', 'sentiment'] as const;
  const labels = ['技術面', '基本面', '籌碼面', '消息面', '市場情緒'];
  const maxVals: Record<string, number> = {
    technical: 40, fundamental: 40, chips: 10, news: 5, sentiment: 5,
  };

  const cx = 110; const cy = 110; const r = 80;
  const n = keys.length;
  const angles = keys.map((_, i) => (i * 2 * Math.PI) / n - Math.PI / 2);
  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  const toXY = (angle: number, ratio: number) => ({
    x: cx + r * ratio * Math.cos(angle),
    y: cy + r * ratio * Math.sin(angle),
  });

  const scores = keys.map((k) => {
    const val = (dims as Record<string, number>)[k] ?? 0;
    return Math.min(Math.max(val / maxVals[k], 0), 1);
  });

  const polyPoints = scores
    .map((s, i) => { const pt = toXY(angles[i], s); return `${pt.x},${pt.y}`; })
    .join(' ');

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={220} height={220} viewBox="0 0 220 220">
        {gridLevels.map((lvl) => (
          <polygon
            key={lvl}
            points={angles.map((a) => { const p = toXY(a, lvl); return `${p.x},${p.y}`; }).join(' ')}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={lvl === 1.0 ? 1.5 : 0.8}
          />
        ))}
        {angles.map((a, i) => {
          const end = toXY(a, 1.0);
          return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#e5e7eb" strokeWidth={0.8} />;
        })}
        <polygon
          points={polyPoints}
          fill="rgba(56,189,248,0.15)"
          stroke="#38bdf8"
          strokeWidth={2}
        />
        {scores.map((s, i) => {
          const pt = toXY(angles[i], s);
          return <circle key={i} cx={pt.x} cy={pt.y} r={3} fill="#38bdf8" />;
        })}
        {labels.map((lbl, i) => {
          const pt = toXY(angles[i], 1.22);
          return (
            <text
              key={i}
              x={pt.x}
              y={pt.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fill="#6b7280"
            >
              {lbl}
            </text>
          );
        })}
      </svg>
      <div className="flex flex-wrap justify-center gap-2">
        {keys.map((k, i) => {
          const val = (dims as Record<string, number>)[k] ?? 0;
          const max = maxVals[k];
          const pct = Math.round((val / max) * 100);
          return (
            <div key={k} className="flex items-center gap-1 text-[11px]">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: ['#38bdf8','#34d399','#f87171','#fbbf24','#a78bfa'][i] }} />
              <span className="text-gray-500">{labels[i]}</span>
              <span className="font-bold text-gray-700">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function generateNarrative(stock: ScanStock): StockNarrative {
  const dims = getStockDimensions(stock);
  const close = getStockClose(stock);
  const changePct = getStockChangePct(stock);
  const rec = getStockRecommendation(stock);
  const reason = getStockReason(stock);
  const entryLow = getStockEntryLow(stock);
  const entryHigh = getStockEntryHigh(stock);
  const stopLoss = getStockStopLoss(stock);
  const target1 = getStockTarget1(stock);
  const target2 = getStockTarget2(stock);
  const target3 = getStockTarget3(stock);

  const dimEntries = Object.entries(dims ?? {});
  const topDims = dimEntries
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 3)
    .map(([k]) => DIM_LABELS[k] ?? k);

  const summary = reason
    ? reason
    : `${stock.name ?? stock.stock_id} 在${topDims.join('、')}表現突出，綜合評分 ${Math.round(stock.total_score)} 分。`;

  return {
    summary,
    entryLow,
    entryHigh,
    stopLoss,
    targets: [target1, target2, target3].filter(Boolean) as number[],
    rec,
  };
}

export default function StockDetailModal({ stock, onClose, rank, isDemo }: Props) {
  const [copied, setCopied] = useState(false);
  const { refresh, loading } = useOnDemandScan?.() ?? { refresh: null, loading: false };

  const close = getStockClose(stock);
  const changePct = getStockChangePct(stock);
  const up = (changePct ?? 0) >= 0;
  const actionStyle = getActionStyle(getStockRecommendation(stock));
  const narrative = generateNarrative(stock);
  const dims = getStockDimensions(stock);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleShare = useCallback(async () => {
    const text = `${stock.name ?? stock.stock_id} (${stock.stock_id}) — 台股雷達推薦\n評分：${Math.round(stock.total_score)}分\n建議：${getStockRecommendation(stock)}\n${narrative.summary}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [stock, narrative]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {rank && (
              <span className="text-2xl mt-0.5">
                {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
              </span>
            )}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-gray-900 text-lg leading-tight">{stock.name ?? stock.stock_id}</span>
                <span className="font-mono text-sm text-gray-400">{stock.stock_id}</span>
                {isDemo && (
                  <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded">示範</span>
                )}
              </div>
              {getStockSector(stock) && (
                <div className="text-xs text-gray-400 mt-0.5">{getStockSector(stock)}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleShare}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="複製分享"
            >
              {copied ? <Check size={16} className="text-emerald-500" /> : <Share2 size={16} />}
            </button>
            <a
              href={`https://tw.stock.yahoo.com/quote/${stock.stock_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="Yahoo 股市"
            >
              <ExternalLink size={16} />
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4">
          {/* Price row */}
          <div className="flex items-center gap-4">
            <div>
              <div className={`text-3xl font-bold font-mono ${up ? 'text-red-600' : 'text-emerald-600'}`}>
                {close?.toFixed(2) ?? '—'}
              </div>
              <div className={`text-sm flex items-center gap-1 ${up ? 'text-red-500' : 'text-emerald-500'}`}>
                {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {up ? '+' : ''}{changePct?.toFixed(2) ?? '—'}%
              </div>
            </div>
            <div className={`ml-auto px-3 py-1.5 rounded-xl border font-bold text-sm ${actionStyle.bg} ${actionStyle.border} ${actionStyle.text}`}>
              {actionStyle.label}
            </div>
          </div>

          {/* 三關價 */}
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
              <Target size={13} />三關價
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white rounded-lg p-2 border border-gray-100">
                <div className="text-[10px] text-gray-400 mb-1">進場區間</div>
                <div className="text-xs font-bold text-gray-700">
                  {narrative.entryLow && narrative.entryHigh
                    ? `${narrative.entryLow}–${narrative.entryHigh}`
                    : narrative.entryLow ?? narrative.entryHigh ?? '—'}
                </div>
              </div>
              <div className="bg-white rounded-lg p-2 border border-red-100">
                <div className="text-[10px] text-red-400 mb-1 flex items-center justify-center gap-0.5"><Shield size={9} />停損</div>
                <div className="text-xs font-bold text-red-600">{narrative.stopLoss ?? '—'}</div>
              </div>
              <div className="bg-white rounded-lg p-2 border border-emerald-100">
                <div className="text-[10px] text-emerald-500 mb-1 flex items-center justify-center gap-0.5"><Target size={9} />目標</div>
                <div className="text-xs font-bold text-emerald-600">
                  {narrative.targets.length > 0 ? narrative.targets[0] : '—'}
                </div>
              </div>
            </div>
            {narrative.targets.length > 1 && (
              <div className="mt-2 flex items-center gap-2 justify-center">
                {narrative.targets.slice(1).map((t, i) => (
                  <span key={i} className="text-[11px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                    T{i + 2}: {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 五維雷達圖 */}
          <div className="bg-white border border-gray-100 rounded-xl p-3">
            <div className="text-xs font-semibold text-gray-500 mb-2">五維評分</div>
            <RadarChart stock={stock} />
          </div>

          {/* 維度評分條 */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500">各維度評分</div>
            {Object.entries(DIMENSION_CONFIG).map(([key, cfg]) => {
              const val = (dims as Record<string, number>)?.[key] ?? 0;
              const pct = Math.min((val / cfg.max) * 100, 100);
              const color = DIM_COLORS[key] ?? '#38bdf8';
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500 w-16 shrink-0">{DIM_LABELS[key] ?? key}</span>
                  <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-gray-600 w-10 text-right">
                    {val.toFixed(1)}/{cfg.max}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 分析摘要 */}
          {narrative.summary && (
            <div className="bg-sky-50 border border-sky-100 rounded-xl p-3">
              <div className="text-xs font-semibold text-sky-600 mb-1.5">分析摘要</div>
              <p className="text-xs text-gray-700 leading-relaxed">{narrative.summary}</p>
            </div>
          )}

          {/* 操作建議 */}
          {getStockReason(stock) && getStockReason(stock) !== narrative.summary && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
              <div className="text-xs font-semibold text-amber-600 mb-1.5">操作建議</div>
              <p className="text-xs text-gray-700 leading-relaxed">{getStockReason(stock)}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
