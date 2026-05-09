'use client';
import {
  ScanStock, DIMENSION_CONFIG,
  getStockName, getStockSector, getStockClose, getStockChangePct,
  getStockRecommendation, getStockReason, getStockDimensions,
  getStockEntryLow, getStockEntryHigh, getStockStopLoss,
  getStockTarget1, getStockTarget2, getStockTarget3,
} from '@/lib/scanTypes';
import { X, Target, Shield, TrendingUp, TrendingDown, ExternalLink, Share2, Check, Sparkles } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

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
        {angles.map((a, i) => {
          const labelPt = toXY(a, 1.22);
          return (
            <text
              key={i}
              x={labelPt.x}
              y={labelPt.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fill="#6b7280"
            >
              {labels[i]}
            </text>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-2 justify-center">
        {keys.map((k) => {
          const val = (dims as Record<string, number>)[k] ?? 0;
          return (
            <span key={k} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {DIM_LABELS[k]}&nbsp;
              <span style={{ color: DIM_COLORS[k] }} className="font-bold">{val}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function StockDetailModal({ stock, onClose, rank, isDemo }: Props) {
  const [priceData, setPriceData] = useState<{ date: string; close: number }[]>([]);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [copied, setCopied] = useState(false);

  const close = getStockClose(stock);
  const changePct = getStockChangePct(stock);
  const name = getStockName(stock);
  const sector = getStockSector(stock);
  const rec = getStockRecommendation(stock);
  const reason = getStockReason(stock);
  const entryLow = getStockEntryLow(stock);
  const entryHigh = getStockEntryHigh(stock);
  const stopLoss = getStockStopLoss(stock);
  const target1 = getStockTarget1(stock);
  const target2 = getStockTarget2(stock);
  const target3 = getStockTarget3(stock);

  const symbol = (stock as Record<string, unknown>).symbol as string | undefined
    ?? (stock as Record<string, unknown>).stock_id as string | undefined
    ?? '';

  const actionStyle = getActionStyle(rec);
  const isPositive = (changePct ?? 0) >= 0;

  // 取得歷史股價
  useEffect(() => {
    if (!symbol) return;
    setLoadingPrice(true);
    const fetchPrice = async () => {
      try {
        const res = await fetch(`/api/price-history?symbol=${symbol}&days=30`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setPriceData(data);
        }
      } catch {
        // silent
      } finally {
        setLoadingPrice(false);
      }
    };
    fetchPrice();
  }, [symbol]);

  // ESC 關閉
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleShare = useCallback(() => {
    const url = `${window.location.origin}?stock=${symbol}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [symbol]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            {rank && (
              <span className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-white text-sm font-bold flex items-center justify-center shadow">
                {rank}
              </span>
            )}
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {name}
                <span className="ml-2 text-sm font-normal text-gray-400">{symbol}</span>
              </h2>
              {sector && <p className="text-xs text-gray-400">{sector}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isDemo && (
              <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">Demo</span>
            )}
            <button
              onClick={handleShare}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="複製分享連結"
            >
              {copied ? <Check size={18} className="text-emerald-500" /> : <Share2 size={18} className="text-gray-400" />}
            </button>
            <a
              href={`https://tw.stock.yahoo.com/quote/${symbol}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Yahoo 股市"
            >
              <ExternalLink size={18} className="text-gray-400" />
            </a>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X size={18} className="text-gray-400" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* 股價 + 操作建議 */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-gray-900">
                  {close != null ? `$${close.toFixed(2)}` : 'N/A'}
                </span>
                {changePct != null && (
                  <span className={`flex items-center gap-1 text-sm font-semibold ${isPositive ? 'text-red-500' : 'text-green-500'}`}>
                    {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {isPositive ? '+' : ''}{changePct.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
            <div className={`px-4 py-2 rounded-xl border-2 ${actionStyle.bg} ${actionStyle.border}`}>
              <span className={`text-sm font-bold ${actionStyle.text}`}>{actionStyle.label}</span>
            </div>
          </div>

          {/* AI 白話文分析 */}
          {reason && (
            <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={16} className="text-sky-500" />
                <span className="text-sm font-semibold text-sky-700">AI 白話文分析</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{reason}</p>
            </div>
          )}

          {/* 進出場策略 */}
          <div className="rounded-xl bg-gray-50 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">進出場策略</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-3 border border-emerald-100">
                <p className="text-xs text-gray-400 mb-1">建議進場區間</p>
                <p className="text-sm font-bold text-emerald-600">
                  {entryLow != null && entryHigh != null
                    ? `$${entryLow} – $${entryHigh}`
                    : entryLow != null ? `$${entryLow}` : '—'}
                </p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-red-100">
                <div className="flex items-center gap-1 mb-1">
                  <Shield size={12} className="text-red-400" />
                  <p className="text-xs text-gray-400">停損價</p>
                </div>
                <p className="text-sm font-bold text-red-500">
                  {stopLoss != null ? `$${stopLoss}` : '—'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {[
                { label: '目標一', val: target1 },
                { label: '目標二', val: target2 },
                { label: '目標三', val: target3 },
              ].map(({ label, val }) => (
                <div key={label} className="bg-white rounded-lg p-3 border border-sky-100 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Target size={12} className="text-sky-400" />
                    <p className="text-xs text-gray-400">{label}</p>
                  </div>
                  <p className="text-sm font-bold text-sky-600">{val != null ? `$${val}` : '—'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 五維雷達圖 */}
          <div className="rounded-xl bg-gray-50 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">五維評分雷達</h3>
            <RadarChart stock={stock} />
          </div>

          {/* 走勢圖 */}
          {priceData.length > 0 && (
            <div className="rounded-xl bg-gray-50 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">近 30 日走勢</h3>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={priceData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} width={40} />
                  <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, '收盤價']} />
                  <ReferenceLine y={close ?? 0} stroke="#94a3b8" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="close"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {loadingPrice && (
            <p className="text-xs text-center text-gray-400 animate-pulse">載入走勢圖中…</p>
          )}
        </div>
      </div>
    </div>
  );
}
