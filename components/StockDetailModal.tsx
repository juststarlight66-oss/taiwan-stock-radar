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
      </svg>
      <div className="grid grid-cols-5 gap-1 w-full">
        {keys.map((k, i) => (
          <div key={k} className="flex flex-col items-center gap-0.5">
            <div className="text-[9px] text-gray-500">{labels[i]}</div>
            <div className="text-xs font-bold" style={{ color: DIM_COLORS[k] }}>
              {Math.round((dims as Record<string, number>)[k] ?? 0)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StockDetailModal({ stock, onClose, rank, isDemo }: Props) {
  const rec = getStockRecommendation(stock);
  const reason = getStockReason(stock);
  const actionStyle = getActionStyle(rec);
  const dims = getStockDimensions(stock);
  const entryLow = getStockEntryLow(stock);
  const entryHigh = getStockEntryHigh(stock);
  const stopLoss = getStockStopLoss(stock);
  const target1 = getStockTarget1(stock);
  const target2 = getStockTarget2(stock);
  const target3 = getStockTarget3(stock);
  const close = getStockClose(stock);
  const changePct = getStockChangePct(stock);
  const up = changePct >= 0;
  const [copied, setCopied] = useState(false);

  // 取得 AI 白話文敘事
  const narrative: StockNarrative | undefined = (stock as any).narrative ?? (stock as any).ai_analysis;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleShare = useCallback(async () => {
    const text = `${getStockName(stock)}（${stock.stock_id}）\n建議：${rec}\n進場：${entryLow}–${entryHigh}　停損：${stopLoss}　目標：${target1}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [stock, rec, entryLow, entryHigh, stopLoss, target1]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">

        {/* Header */}
        <div className={`px-5 pt-5 pb-4 border-b border-gray-100 ${actionStyle.bg}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {rank && (
                  <span className="text-lg">
                    {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                  </span>
                )}
                <span className="font-mono text-sm text-gray-500">{stock.stock_id}</span>
                <h2 className="text-lg font-bold text-gray-900 truncate">{getStockName(stock)}</h2>
                {isDemo && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded">示範</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-sm text-gray-500">{getStockSector(stock)}</span>
                <span className={`text-base font-mono font-bold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
                  {close.toLocaleString()}
                  <span className="text-sm ml-1">{up ? '+' : ''}{changePct.toFixed(2)}%</span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleShare}
                className="p-2 rounded-lg hover:bg-black/5 transition-colors text-gray-400"
                title="複製摘要"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
              </button>
              <a
                href={`https://tw.stock.yahoo.com/quote/${stock.stock_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg hover:bg-black/5 transition-colors text-gray-400"
                title="Yahoo 股市"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-black/5 transition-colors text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 操作建議徽章 */}
          <div className={`mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${actionStyle.bg} ${actionStyle.border}`}>
            <span className={`text-sm font-bold ${actionStyle.text}`}>{actionStyle.label}</span>
            {rec && rec !== actionStyle.label && (
              <span className="text-xs text-gray-500">{rec.split(' - ').slice(1).join(' - ')}</span>
            )}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* AI 白話文區塊 */}
          {narrative && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
              <div className="text-xs font-semibold text-sky-700 mb-2 flex items-center gap-1.5">
                <span>🤖</span>
                <span>AI 白話文分析</span>
              </div>
              {narrative.summary && (
                <p className="text-sm text-gray-800 leading-relaxed mb-2">{narrative.summary}</p>
              )}
              {narrative.why_now && (
                <div className="mt-2">
                  <div className="text-xs font-medium text-sky-600 mb-1">為什麼現在？</div>
                  <p className="text-sm text-gray-700 leading-relaxed">{narrative.why_now}</p>
                </div>
              )}
              {narrative.risk_warning && (
                <div className="mt-2 flex items-start gap-1.5">
                  <span className="text-amber-500 text-xs mt-0.5">⚠️</span>
                  <p className="text-xs text-amber-700 leading-relaxed">{narrative.risk_warning}</p>
                </div>
              )}
            </div>
          )}

          {/* 三關價 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 flex flex-col items-center gap-1">
              <div className="flex items-center gap-1 text-sky-600">
                <Target className="w-3.5 h-3.5" />
                <span className="text-[11px] font-medium">進場區間</span>
              </div>
              <div className="text-sm font-mono font-bold text-gray-800">
                {entryLow && entryHigh ? `${entryLow}–${entryHigh}` : entryLow || entryHigh || '—'}
              </div>
            </div>
            <div className="rounded-xl border border-red-100 bg-red-50 p-3 flex flex-col items-center gap-1">
              <div className="flex items-center gap-1 text-red-500">
                <Shield className="w-3.5 h-3.5" />
                <span className="text-[11px] font-medium">停損價</span>
              </div>
              <div className="text-sm font-mono font-bold text-red-600">{stopLoss ?? '—'}</div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 flex flex-col items-center gap-1">
              <div className="flex items-center gap-1 text-emerald-600">
                <TrendingUp className="w-3.5 h-3.5" />
                <span className="text-[11px] font-medium">目標價</span>
              </div>
              <div className="text-sm font-mono font-bold text-emerald-700">
                {[target1, target2, target3].filter(Boolean).join(' / ') || '—'}
              </div>
            </div>
          </div>

          {/* 操作理由 */}
          {reason && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="text-xs font-semibold text-gray-500 mb-1.5">操作理由</div>
              <p className="text-sm text-gray-700 leading-relaxed">{reason}</p>
            </div>
          )}

          {/* 五維雷達圖 */}
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <div className="text-xs font-semibold text-gray-500 mb-3">五維分析</div>
            <RadarChart stock={stock} />
          </div>

          {/* 維度細分 */}
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <div className="text-xs font-semibold text-gray-500 mb-2">維度評分明細</div>
            <div className="space-y-2">
              {Object.entries(DIMENSION_CONFIG).map(([key, cfg]) => {
                const val = (dims as Record<string, number>)[key] ?? 0;
                const pct = Math.min((val / cfg.max) * 100, 100);
                return (
                  <div key={key} className="flex items-center gap-2">
                    <div className="w-14 text-[11px] text-gray-500 shrink-0">{DIM_LABELS[key] ?? key}</div>
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: DIM_COLORS[key] ?? '#94a3b8' }}
                      />
                    </div>
                    <div className="w-12 text-right text-[11px] font-mono text-gray-600">
                      {Math.round(val)} / {cfg.max}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
