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
          return <circle key={i} cx={pt.x} cy={pt.y} r={4} fill="#38bdf8" />;
        })}
        {labels.map((lbl, i) => {
          const pt = toXY(angles[i], 1.18);
          return (
            <text
              key={i}
              x={pt.x}
              y={pt.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={11}
              fill="#6b7280"
            >
              {lbl}
            </text>
          );
        })}
      </svg>
      <div className="flex flex-wrap justify-center gap-2">
        {keys.map((k) => {
          const val = (dims as Record<string, number>)[k] ?? 0;
          const pct = Math.round((val / maxVals[k]) * 100);
          return (
            <div key={k} className="flex items-center gap-1 text-xs">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: DIM_COLORS[k] }} />
              <span className="text-gray-500">{DIM_LABELS[k]}</span>
              <span className="font-semibold text-gray-700">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** AI 白話文區塊 */
function NarrativeSection({ ticker, narrative }: { ticker: string; narrative: StockNarrative | null | undefined }) {
  if (!narrative) return null;
  return (
    <div className="mt-4 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🤖</span>
        <span className="text-sm font-semibold text-blue-700">AI 白話文分析</span>
        <span className="ml-auto text-xs text-blue-400 bg-blue-100 px-2 py-0.5 rounded-full">AI Generated</span>
      </div>
      {narrative.summary && (
        <p className="text-sm text-gray-700 leading-relaxed mb-3">{narrative.summary}</p>
      )}
      {narrative.key_points && narrative.key_points.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-blue-600 mb-1.5">關鍵亮點</p>
          <ul className="space-y-1">
            {narrative.key_points.map((pt, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                <span className="text-blue-400 mt-0.5">•</span>
                <span>{pt}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {narrative.risk_warning && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <p className="text-xs text-amber-700">
            <span className="font-semibold">⚠️ 風險提示：</span>{narrative.risk_warning}
          </p>
        </div>
      )}
    </div>
  );
}

export default function StockDetailModal({ stock, onClose, rank, isDemo }: Props) {
  const name = getStockName(stock);
  const sector = getStockSector(stock);
  const close = getStockClose(stock);
  const changePct = getStockChangePct(stock);
  const rec = getStockRecommendation(stock);
  const reason = getStockReason(stock);
  const dims = getStockDimensions(stock);
  const entryLow = getStockEntryLow(stock);
  const entryHigh = getStockEntryHigh(stock);
  const stopLoss = getStockStopLoss(stock);
  const target1 = getStockTarget1(stock);
  const target2 = getStockTarget2(stock);
  const target3 = getStockTarget3(stock);
  const ticker = (stock as Record<string, unknown>).ticker as string ?? (stock as Record<string, unknown>).code as string ?? '';

  const actionStyle = getActionStyle(rec);
  const isUp = (changePct ?? 0) >= 0;

  const [copied, setCopied] = useState(false);

  // AI 白話文（按需掃描）
  const { narrative, loading: narrativeLoading } = useOnDemandScan(ticker);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleShare = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const dimEntries = Object.entries(DIMENSION_CONFIG ?? {});

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {rank && (
                  <span className="text-xs font-bold bg-gradient-to-r from-amber-400 to-orange-400 text-white px-2 py-0.5 rounded-full">
                    #{rank}
                  </span>
                )}
                {isDemo && (
                  <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full font-medium">
                    Demo
                  </span>
                )}
                <span className="text-lg font-bold text-gray-900 truncate">{name}</span>
                <span className="text-sm text-gray-400 font-mono">{ticker}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {sector && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{sector}</span>
                )}
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${actionStyle.bg} ${actionStyle.text}`}>
                  {actionStyle.label}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right">
                <div className="text-xl font-bold text-gray-900">
                  {close != null ? `$${close.toFixed(2)}` : '—'}
                </div>
                <div className={`text-sm font-semibold ${isUp ? 'text-red-500' : 'text-green-600'}`}>
                  {changePct != null ? `${isUp ? '+' : ''}${changePct.toFixed(2)}%` : '—'}
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="關閉"
              >
                <X size={18} className="text-gray-400" />
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* 操作建議 */}
          {rec && (
            <div className={`rounded-xl border-2 ${actionStyle.border} ${actionStyle.bg} p-3`}>
              <p className={`text-xs font-semibold mb-1 ${actionStyle.text}`}>操作建議</p>
              <p className="text-sm text-gray-700 leading-relaxed">{rec}</p>
            </div>
          )}

          {/* 推薦理由 */}
          {reason && (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-500 mb-1">推薦理由</p>
              <p className="text-sm text-gray-700 leading-relaxed">{reason}</p>
            </div>
          )}

          {/* AI 白話文 */}
          {narrativeLoading ? (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-blue-500">AI 正在分析中…</span>
            </div>
          ) : (
            <NarrativeSection ticker={ticker} narrative={narrative} />
          )}

          {/* 三關價 */}
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
            <p className="text-xs font-semibold text-gray-500 mb-3">三關價</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <TrendingUp size={12} className="text-emerald-500" />
                  <span className="text-xs text-emerald-600 font-medium">進場區間</span>
                </div>
                <div className="text-sm font-bold text-emerald-700">
                  {entryLow != null && entryHigh != null
                    ? `${entryLow}–${entryHigh}`
                    : entryLow != null ? `${entryLow}` : '—'}
                </div>
              </div>
              <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Shield size={12} className="text-red-400" />
                  <span className="text-xs text-red-500 font-medium">停損</span>
                </div>
                <div className="text-sm font-bold text-red-600">{stopLoss != null ? stopLoss : '—'}</div>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-2 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Target size={12} className="text-blue-500" />
                  <span className="text-xs text-blue-600 font-medium">目標</span>
                </div>
                <div className="text-xs font-bold text-blue-700 space-y-0.5">
                  {target1 != null && <div>T1: {target1}</div>}
                  {target2 != null && <div>T2: {target2}</div>}
                  {target3 != null && <div>T3: {target3}</div>}
                  {target1 == null && '—'}
                </div>
              </div>
            </div>
          </div>

          {/* 五維分析 */}
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
            <p className="text-xs font-semibold text-gray-500 mb-3">五維分析</p>
            <RadarChart stock={stock} />
          </div>

          {/* 維度細分 */}
          {dimEntries.length > 0 && (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-500 mb-3">維度細分</p>
              <div className="space-y-2">
                {dimEntries.map(([dimKey, dimCfg]: [string, unknown]) => {
                  const cfg = dimCfg as { label: string; max: number; color: string };
                  const val = (dims as Record<string, number>)[dimKey] ?? 0;
                  const pct = Math.min(Math.round((val / cfg.max) * 100), 100);
                  return (
                    <div key={dimKey}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600">{cfg.label}</span>
                        <span className="font-semibold text-gray-700">{val} / {cfg.max}</span>
                      </div>
                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: cfg.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 外部連結 + 分享 */}
          <div className="flex gap-2 pt-1">
            <a
              href={`https://tw.stock.yahoo.com/quote/${ticker}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors text-sm text-gray-600 font-medium"
            >
              <ExternalLink size={14} />
              Yahoo 股市
            </a>
            <button
              onClick={handleShare}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors text-sm text-gray-600 font-medium"
            >
              {copied ? <Check size={14} className="text-green-500" /> : <Share2 size={14} />}
              {copied ? '已複製' : '分享'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
