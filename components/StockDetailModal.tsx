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
      ? `基本面評分 ${f}/40，營收獲利穩健成長，本益比處合理區間`
      : f >= 15
        ? `基本面評分 ${f}/40，體質尚可但成長動能趨緩，中線持有需觀察`
        : `基本面評分 ${f}/40，營收獲利偏弱，建議短線操作為主`,
    risk: stopLoss
      ? `停損設於 ${slStr}，破此價位應立即出場，嚴守風控紀律`
      : `尚無明確停損價，建議以成本 -5% 作為保護停損`,
    action: `操作建議：${recLabel}，進場區間 ${entryStr}，目標1上看 ${target1?.toFixed(0) ?? '?'}（+${upside}%）`,
  };
}

export default function StockDetailModal({ stock, onClose, rank = 1, isDemo = false }: Props) {
  const [shared, setShared] = useState(false);
  const { data: liveData, loading } = useOnDemandScan(stock.stock_id);

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
  const isUp = (changePct ?? 0) >= 0;
  const narrative = stock.narrative ?? generateNarrative(stock);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}?stock=${stock.stock_id}`;
    await navigator.clipboard.writeText(url);
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  }, [stock.stock_id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-700">

        {/* Header */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-start justify-between z-10 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-200">#{rank}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-white text-lg">{stock.stock_id}</span>
                <span className="text-gray-300 font-medium text-base">{name}</span>
                {changePct != null && (
                  <span className={`text-sm font-bold ${ isUp ? 'text-red-400' : 'text-green-400' }`}>
                    {isUp ? '+' : ''}{changePct.toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-400">{sector}</span>
                {close != null && (
                  <span className="text-xs font-mono text-gray-300">收盤 {close.toFixed(2)}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleShare} className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors" title="分享">
              {shared ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
            </button>
            <a href={`https://tw.stock.yahoo.com/quote/${stock.stock_id}`} target="_blank" rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors" title="Yahoo奇摩股市">
              <ExternalLink className="w-4 h-4" />
            </a>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* 推薦標籤 */}
          <div className={`rounded-xl border-2 px-4 py-3 ${actionStyle.bg} ${actionStyle.border}`}>
            <div className="flex items-center gap-2">
              <span className={`text-base font-bold ${actionStyle.text}`}>{actionStyle.label}</span>
              <span className="text-gray-400 text-xs">|</span>
              <span className="text-gray-300 text-xs">總分 {stock.total_score}/100</span>
            </div>
            {reason && (
              <p className="mt-1.5 text-gray-100 text-sm leading-relaxed">{reason}</p>
            )}
          </div>

          {/* 三關價 + 進場區間 + 停損 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-800 rounded-xl p-3 border border-gray-600">
              <div className="text-xs text-gray-400 mb-1">進場區間</div>
              <div className="font-mono font-bold text-white text-sm">
                {(entryLow && entryHigh)
                  ? `${entryLow.toFixed(2)} ～ ${entryHigh.toFixed(2)}`
                  : entryLow?.toFixed(2) ?? '—'}
              </div>
            </div>
            <div className="bg-gray-800 rounded-xl p-3 border border-gray-600">
              <div className="text-xs text-gray-400 mb-1 flex items-center gap-1"><Shield className="w-3 h-3" />停損價</div>
              <div className="font-mono font-bold text-green-400 text-sm">{stopLoss?.toFixed(2) ?? '—'}</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-3 border border-orange-700">
              <div className="text-xs text-orange-300 mb-1 flex items-center gap-1"><Target className="w-3 h-3" />目標一</div>
              <div className="font-mono font-bold text-orange-300 text-sm">{target1?.toFixed(0) ?? '—'}</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-3 border border-red-700">
              <div className="text-xs text-red-300 mb-1 flex items-center gap-1"><Target className="w-3 h-3" />目標二</div>
              <div className="font-mono font-bold text-red-300 text-sm">{target2?.toFixed(0) ?? '—'}</div>
            </div>
            <div className="col-span-2 bg-gray-800 rounded-xl p-3 border border-red-900">
              <div className="text-xs text-red-200 mb-1 flex items-center gap-1"><Target className="w-3 h-3" />目標三（夢想價）</div>
              <div className="font-mono font-bold text-red-200 text-sm">{target3?.toFixed(0) ?? '—'}</div>
            </div>
          </div>

          {/* 五維分數條 */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-600">
            <div className="text-xs font-semibold text-gray-300 mb-3">五維評分</div>
            <div className="space-y-2">
              {(Object.keys(DIMENSION_CONFIG) as Array<keyof typeof DIMENSION_CONFIG>).map(key => {
                const cfg = DIMENSION_CONFIG[key];
                const val = dims[key] ?? 0;
                const pct = Math.min((val / cfg.max) * 100, 100);
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-16">{cfg.label}</span>
                    <div className="flex-1 h-2 rounded-full bg-gray-700 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: DIM_COLORS[key] }}
                      />
                    </div>
                    <span className="text-xs font-mono font-bold text-gray-200 w-10 text-right">{val}/{cfg.max}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI 白話文分析 */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-600">
            <div className="text-sm font-semibold text-gray-200 mb-3">AI 白話文分析</div>
            <div className="space-y-2">
              {NARRATIVE_ROWS.map(({ key, label, icon, color, bg }) => (
                <div key={key} className={`rounded-lg border px-3 py-2.5 ${bg}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span>{icon}</span>
                    <span className={`text-xs font-semibold ${color}`}>{label}</span>
                  </div>
                  <p className="text-sm text-gray-100 leading-relaxed">{narrative[key]}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 持股建議 */}
          {(stock.hold_days || stock.position) && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-600">
              <div className="text-xs font-semibold text-gray-300 mb-2">持股建議</div>
              <div className="flex gap-4 text-sm">
                {stock.hold_days && (
                  <div>
                    <span className="text-gray-400 text-xs">建議持有</span>
                    <div className="font-semibold text-white">{stock.hold_days} 天</div>
                  </div>
                )}
                {stock.position && (
                  <div>
                    <span className="text-gray-400 text-xs">部位建議</span>
                    <div className="font-semibold text-white">{stock.position}</div>
                  </div>
                )}
                {stock.max_loss_per_lot && (
                  <div>
                    <span className="text-gray-400 text-xs">每張最大損失</span>
                    <div className="font-semibold text-red-300">{stock.max_loss_per_lot.toLocaleString()} 元</div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
