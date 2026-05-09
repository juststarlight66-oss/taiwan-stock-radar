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
  if (!rec) return { bg: 'bg-gray-700', border: 'border-gray-600', text: 'text-gray-300', label: '觀望' };
  const r = rec.toLowerCase();
  if (r.includes('★★★') || r.includes('strong') || r.includes('強力')) {
    return { bg: 'bg-red-900/60', border: 'border-red-500', text: 'text-red-300', label: '強力買進' };
  }
  if (r.includes('積極')) {
    return { bg: 'bg-orange-900/60', border: 'border-orange-500', text: 'text-orange-300', label: '積極買進' };
  }
  if (r.includes('買進') || r.includes('buy')) {
    return { bg: 'bg-emerald-900/60', border: 'border-emerald-500', text: 'text-emerald-300', label: '買進' };
  }
  if (r.includes('逢低')) {
    return { bg: 'bg-sky-900/60', border: 'border-sky-500', text: 'text-sky-300', label: '逢低佈局' };
  }
  if (r.includes('觀望') || r.includes('wait') || r.includes('hold')) {
    return { bg: 'bg-amber-900/60', border: 'border-amber-500', text: 'text-amber-300', label: '觀望' };
  }
  return { bg: 'bg-gray-700', border: 'border-gray-600', text: 'text-gray-300', label: '偏弱' };
}

const DIM_LABELS: Record<string, string> = {
  technical: '技術面', fundamental: '基本面', news: '消息面', sentiment: '市場情緒', chips: '籌碼面',
};
const DIM_COLORS: Record<string, string> = {
  technical: '#38bdf8', fundamental: '#34d399', news: '#fbbf24', sentiment: '#a78bfa', chips: '#f87171',
};

/** 五維雷達圖（純 SVG，無外部依賴） */
function RadarChart({ stock }: { stock: ScanStock }) {
  const dims = getStockDimensions(stock);
  const keys = ['technical', 'fundamental', 'chips', 'news', 'sentiment'] as const;
  const labels = ['技術面', '基本面', '籌碼面', '消息面', '市場情緒'];
  const maxVals: Record<string, number> = {
    technical: 40, fundamental: 40, chips: 10, news: 5, sentiment: 5,
  };
  const colors = ['#38bdf8', '#34d399', '#f87171', '#fbbf24', '#a78bfa'];

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
    .map((s, i) => {
      const pt = toXY(angles[i], s);
      return `${pt.x},${pt.y}`;
    })
    .join(' ');

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={220} height={220} viewBox="0 0 220 220">
        {/* Grid */}
        {gridLevels.map((lvl) => (
          <polygon
            key={lvl}
            points={angles.map((a) => { const p = toXY(a, lvl); return `${p.x},${p.y}`; }).join(' ')}
            fill="none"
            stroke="#374151"
            strokeWidth={lvl === 1.0 ? 1.5 : 0.8}
          />
        ))}
        {/* Axis lines */}
        {angles.map((a, i) => {
          const end = toXY(a, 1.0);
          return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#374151" strokeWidth={0.8} />;
        })}
        {/* Score polygon */}
        <polygon
          points={polyPoints}
          fill="rgba(56,189,248,0.15)"
          stroke="#38bdf8"
          strokeWidth={2}
        />
        {/* Score dots */}
        {scores.map((s, i) => {
          const pt = toXY(angles[i], s);
          return <circle key={i} cx={pt.x} cy={pt.y} r={4} fill={colors[i]} stroke="#1f2937" strokeWidth={1.5} />;
        })}
        {/* Labels */}
        {angles.map((a, i) => {
          const pt = toXY(a, 1.22);
          const val = Math.round((dims as Record<string, number>)[keys[i]] ?? 0);
          const max = maxVals[keys[i]];
          return (
            <g key={i}>
              <text
                x={pt.x} y={pt.y - 5}
                textAnchor="middle"
                fontSize={9}
                fill="#9ca3af"
              >
                {labels[i]}
              </text>
              <text
                x={pt.x} y={pt.y + 8}
                textAnchor="middle"
                fontSize={9}
                fontWeight="bold"
                fill={colors[i]}
              >
                {val}/{max}
              </text>
            </g>
          );
        })}
      </svg>
      {/* Legend */}
      <div className="grid grid-cols-5 gap-x-2 gap-y-1 w-full max-w-[260px]">
        {keys.map((k, i) => {
          const val = Math.round((dims as Record<string, number>)[k] ?? 0);
          const max = maxVals[k];
          const pct = Math.round((val / max) * 100);
          return (
            <div key={k} className="flex flex-col items-center">
              <div className="w-full h-1 rounded-full bg-gray-700 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: colors[i] }} />
              </div>
              <span className="text-[9px] mt-0.5" style={{ color: colors[i] }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const NARRATIVE_ROWS: { key: keyof StockNarrative; label: string; icon: string; color: string; bg: string }[] = [
  { key: 'technical',   label: '技術面解讀', icon: '📈', color: 'text-sky-200',     bg: 'bg-sky-900/40 border-sky-700' },
  { key: 'chips',       label: '籌碼面解讀', icon: '🏦', color: 'text-violet-200',  bg: 'bg-violet-900/40 border-violet-700' },
  { key: 'fundamental', label: '基本面評價', icon: '📊', color: 'text-emerald-200', bg: 'bg-emerald-900/40 border-emerald-700' },
  { key: 'risk',        label: '風險提示',   icon: '⚠️', color: 'text-amber-200',   bg: 'bg-amber-900/40 border-amber-700' },
  { key: 'action',      label: '操作建議',   icon: '🎯', color: 'text-red-200',     bg: 'bg-red-900/40 border-red-700' },
];

function generateNarrative(stock: ScanStock): StockNarrative {
  const dims = getStockDimensions(stock);
  const t = dims.technical;
  const c = dims.chips;
  const f = dims.fundamental;
  const rec = getStockRecommendation(stock);
  const entryLow = getStockEntryLow(stock);
  const entryHigh = getStockEntryHigh(stock);
  const stopLoss = getStockStopLoss(stock);
  const target1 = getStockTarget1(stock);

  const entryStr = (entryLow && entryHigh)
    ? `${entryLow.toFixed(2)}～${entryHigh.toFixed(2)}`
    : entryLow?.toFixed(2) ?? '—';
  const slStr = stopLoss?.toFixed(2) ?? '—';
  const recLabel = getActionStyle(rec).label;

  const upside = target1 && entryLow ? (((target1 - entryLow) / entryLow) * 100).toFixed(1) : '?';

  return {
    technical: t >= 30
      ? `技術面評分 ${t}/40，多頭趨勢明確，站穩短中期均線之上，動能強勁`
      : t >= 20
        ? `技術面評分 ${t}/40，短線偏多但上方壓力待消化，注意量能變化`
        : `技術面評分 ${t}/40，走勢偏弱，建議等待止跌訊號再進場`,
    chips: c >= 7
      ? `籌碼面評分 ${c}/10，法人持續買超，籌碼集中度佳，支撐力道足`
      : c >= 4
        ? `籌碼面評分 ${c}/10，法人動向分歧，籌碼尚屬中性`
        : `籌碼面評分 ${c}/10，籌碼鬆動，法人減碼明顯，短線壓力大`,
    fundamental: f >= 30
      ? `基本面評分 ${f}/40，營收獲利穩健成長，本益比具吸引力`
      : f >= 20
        ? `基本面評分 ${f}/40，基本面中性，尚待觀察獲利動能`
        : `基本面評分 ${f}/40，基本面偏弱，獲利能見度有限`,
    risk: `建議停損設 ${slStr}，突破則追蹤目標價一`,
    action: `建議操作：${recLabel}。參考進場區間 ${entryStr}，預估上漲空間 ${upside}%`,
  };
}

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-sky-500' : pct >= 35 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-gray-700 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-bold text-white w-8 text-right">{Math.round(score)}</span>
    </div>
  );
}

function DimensionRow({ label, score, max, color }: { label: string; score: number; max: number; color: string }) {
  const pct = Math.min((score / max) * 100, 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-gray-700 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-mono text-gray-300 w-10 text-right">{Math.round(score)}/{max}</span>
    </div>
  );
}

export default function StockDetailModal({ stock, onClose, rank, isDemo }: Props) {
  const [copied, setCopied] = useState(false);
  const [narrative, setNarrative] = useState<StockNarrative | null>(null);
  const [priceHistory, setPriceHistory] = useState<{ date: string; close: number }[]>([]);
  const { trigger: triggerScan, data: onDemandData, loading: scanLoading } = useOnDemandScan();

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

  const actionStyle = getActionStyle(rec);
  const up = changePct >= 0;
  const totalMax = Object.values(DIMENSION_CONFIG).reduce((s, c) => s + c.max, 0);

  useEffect(() => {
    setNarrative(generateNarrative(stock));
  }, [stock]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleShare = useCallback(async () => {
    const text = `【台股雷達】${name}(${stock.stock_id}) 綜合分 ${Math.round(stock.total_score)} | ${rec}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [stock, name, rec]);

  const rankLabel = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank ? `#${rank}` : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative z-10 w-full sm:max-w-lg mx-auto bg-gray-900 border border-gray-700/60 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`sticky top-0 z-10 px-4 pt-4 pb-3 border-b border-gray-700/60 ${actionStyle.bg} backdrop-blur-md`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {rankLabel && <span className="text-xl">{rankLabel}</span>}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-gray-400 text-sm">{stock.stock_id}</span>
                  <span className="font-bold text-white text-lg leading-tight">{name}</span>
                  {isDemo && (
                    <span className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded">
                      示範
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-400">{sector}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${actionStyle.border} ${actionStyle.text}`}>
                    {actionStyle.label}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleShare}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
                title="複製分享"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
              </button>
              <a
                href={`https://www.twse.com.tw/zh/stock/${stock.stock_id}`}
                target="_blank" rel="noopener noreferrer"
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
                title="TWSE"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Price */}
          <div className="flex items-baseline gap-3 mt-2">
            <span className="text-2xl font-mono font-bold text-white">{close.toLocaleString()}</span>
            <span className={`flex items-center gap-1 text-sm font-mono font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
              {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {up ? '+' : ''}{changePct.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-5">

          {/* ── 五維評分 ── */}
          <section>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">五維評分</h4>

            {/* Radar Chart */}
            <div className="flex justify-center mb-4">
              <RadarChart stock={stock} />
            </div>

            {/* Score bars */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-gray-500">綜合分</span>
                <div className="flex-1">
                  <ScoreBar score={stock.total_score} max={totalMax} />
                </div>
              </div>
              {Object.entries(DIMENSION_CONFIG).map(([key, cfg]) => {
                const score = (dims as Record<string, number>)[key] ?? 0;
                const color = DIM_COLORS[key] ?? '#6b7280';
                const label = DIM_LABELS[key] ?? key;
                return (
                  <DimensionRow key={key} label={label} score={score} max={cfg.max} color={color} />
                );
              })}
            </div>
          </section>

          {/* ── 進出場建議 ── */}
          <section>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">進出場建議</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Target className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-medium text-emerald-300">進場區間</span>
                </div>
                <div className="font-mono text-sm font-bold text-white">
                  {entryLow && entryHigh
                    ? `${entryLow.toFixed(2)} ~ ${entryHigh.toFixed(2)}`
                    : entryLow?.toFixed(2) ?? '—'}
                </div>
              </div>
              <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Shield className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-xs font-medium text-red-300">停損價</span>
                </div>
                <div className="font-mono text-sm font-bold text-white">{stopLoss?.toFixed(2) ?? '—'}</div>
              </div>
            </div>

            {/* Targets */}
            {(target1 || target2 || target3) && (
              <div className="mt-3 flex gap-2">
                {[target1, target2, target3].map((t, i) =>
                  t ? (
                    <div key={i} className="flex-1 bg-sky-900/30 border border-sky-700/50 rounded-lg p-2.5 text-center">
                      <div className="text-[10px] text-sky-400 mb-1">目標 {i + 1}</div>
                      <div className="font-mono text-sm font-bold text-white">{t.toFixed(2)}</div>
                      {entryLow && (
                        <div className="text-[10px] text-sky-300 mt-0.5">
                          +{(((t - entryLow) / entryLow) * 100).toFixed(1)}%
                        </div>
                      )}
                    </div>
                  ) : null
                )}
              </div>
            )}
          </section>

          {/* ── AI 操作解讀 ── */}
          {narrative && (
            <section>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">AI 操作解讀</h4>
              <div className="space-y-2">
                {NARRATIVE_ROWS.map(({ key, label, icon, color, bg }) => {
                  const text = narrative[key];
                  if (!text) return null;
                  return (
                    <div key={key} className={`rounded-lg border p-3 ${bg}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-sm">{icon}</span>
                        <span className={`text-xs font-semibold ${color}`}>{label}</span>
                      </div>
                      <p className="text-xs text-gray-300 leading-relaxed">{text}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── 推薦原因 ── */}
          {reason && (
            <section>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">推薦原因</h4>
              <p className="text-sm text-gray-300 leading-relaxed bg-gray-800/50 rounded-lg p-3">{reason}</p>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
