'use client';
import { ScanStock, DIMENSION_CONFIG, getActionColor } from '@/lib/scanTypes';
import RadarChart from './RadarChart';
import DimensionBars from './DimensionBars';
import { X, TrendingUp, TrendingDown, Target, Shield, Clock } from 'lucide-react';

interface Props {
  stock: ScanStock;
  onClose: () => void;
}

const SIGNAL_LABELS: Record<string, string> = {
  technical: '技術',
  chips: '籌碼',
  fundamental: '基本面',
  news: '消息',
  sentiment: '情緒',
};

const SIGNAL_COLORS: Record<string, string> = {
  technical: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
  chips: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  fundamental: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  news: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  sentiment: 'text-red-400 bg-red-500/10 border-red-500/30',
};

export default function StockDetailModal({ stock, onClose }: Props) {
  const up = stock.change_pct >= 0;
  const actionColor = getActionColor(stock.strategy.recommendation);
  const totalMax = Object.values(DIMENSION_CONFIG).reduce((s, c) => s + c.max, 0);
  const scorePercent = Math.round((stock.total_score / totalMax) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-700/60 px-5 py-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xs font-mono text-gray-500 bg-gray-800 px-2 py-1 rounded">
              {stock.stock_id}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{stock.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
                  {stock.sector}
                </span>
                <span className={`text-sm font-semibold font-mono ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                  {up ? '+' : ''}{stock.change_pct.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-2xl font-bold font-mono text-white">
                {stock.close.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 text-right">收盤價</div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Score + Radar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Score ring */}
            <div className="rounded-lg bg-gray-800/50 border border-gray-700/60 p-4 flex flex-col items-center justify-center gap-2">
              <div className="relative w-24 h-24">
                <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1f2937" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none"
                    stroke={scorePercent >= 70 ? '#34d399' : scorePercent >= 50 ? '#38bdf8' : '#fbbf24'}
                    strokeWidth="3"
                    strokeDasharray={`${scorePercent} ${100 - scorePercent}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-white">{Math.round(stock.total_score)}</span>
                  <span className="text-[10px] text-gray-500">總分</span>
                </div>
              </div>
              <div className={`text-xs font-medium px-3 py-1 rounded-full border ${actionColor}`}>
                {stock.strategy.recommendation.split(' - ')[0]}
              </div>
              <div className="text-[11px] text-gray-500">滿分 {totalMax} 分</div>
            </div>

            {/* Radar chart */}
            <div className="rounded-lg bg-gray-800/50 border border-gray-700/60 p-4 flex items-center justify-center">
              <RadarChart dimensions={stock.dimensions} size={180} />
            </div>
          </div>

          {/* Dimension bars */}
          <div className="rounded-lg bg-gray-800/50 border border-gray-700/60 p-4">
            <h3 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">五維度分析</h3>
            <DimensionBars dimensions={stock.dimensions} />
          </div>

          {/* Strategy */}
          <div className="rounded-lg bg-gray-800/50 border border-gray-700/60 p-4">
            <h3 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">交易策略</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div className="rounded bg-sky-500/10 border border-sky-500/20 p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-1 flex items-center justify-center gap-1">
                  <Target className="w-3 h-3" /> 進場價
                </div>
                <div className="text-sm font-bold font-mono text-sky-300">
                  {stock.strategy.entry.toLocaleString()}
                </div>
              </div>
              <div className="rounded bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-1 flex items-center justify-center gap-1">
                  <TrendingUp className="w-3 h-3" /> 目標價
                </div>
                <div className="text-sm font-bold font-mono text-emerald-300">
                  {stock.strategy.target.toLocaleString()}
                </div>
              </div>
              <div className="rounded bg-red-500/10 border border-red-500/20 p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-1 flex items-center justify-center gap-1">
                  <Shield className="w-3 h-3" /> 停損價
                </div>
                <div className="text-sm font-bold font-mono text-red-300">
                  {stock.strategy.stop_loss.toLocaleString()}
                </div>
              </div>
              <div className="rounded bg-gray-700/40 border border-gray-600/40 p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-1 flex items-center justify-center gap-1">
                  <TrendingDown className="w-3 h-3" /> 風險比
                </div>
                <div className="text-sm font-bold font-mono text-gray-300">
                  {(stock.strategy.upside / Math.max(stock.strategy.downside, 0.1)).toFixed(1)}x
                </div>
              </div>
            </div>
            <div className="text-[11px] flex gap-3 text-gray-400">
              <span className="text-emerald-400">↑ +{stock.strategy.upside.toFixed(1)}%</span>
              <span className="text-red-400">↓ -{stock.strategy.downside.toFixed(1)}%</span>
            </div>
            <div className={`mt-3 rounded-lg border px-3 py-2.5 text-xs font-medium ${actionColor}`}>
              {stock.strategy.recommendation}
            </div>
          </div>

          {/* Signals */}
          <div className="rounded-lg bg-gray-800/50 border border-gray-700/60 p-4">
            <h3 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">訊號明細</h3>
            <div className="space-y-2.5">
              {(Object.entries(stock.signals) as [string, string[]][]).map(([key, sigs]) => {
                if (!sigs || sigs.length === 0) return null;
                return (
                  <div key={key}>
                    <div className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded border mb-1.5 ${SIGNAL_COLORS[key] || 'text-gray-400 bg-gray-700/40 border-gray-600/40'}`}>
                      {SIGNAL_LABELS[key] || key}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {sigs.map((s: string, i: number) => (
                        <span key={i} className="text-[11px] text-gray-300 bg-gray-700/40 px-2 py-0.5 rounded border border-gray-600/30">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Technical details */}
          <div className="rounded-lg bg-gray-800/50 border border-gray-700/60 p-4">
            <h3 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">技術指標</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'RSI', value: stock.details.rsi.toFixed(1), color: stock.details.rsi > 70 ? 'text-red-400' : stock.details.rsi < 30 ? 'text-emerald-400' : 'text-sky-400' },
                { label: '量比', value: `${stock.details.vol_ratio.toFixed(1)}x`, color: stock.details.vol_ratio > 2 ? 'text-emerald-400' : 'text-gray-300' },
                { label: '均差', value: stock.details.ma_spread != null ? `${stock.details.ma_spread.toFixed(1)}%` : '—', color: 'text-gray-300' },
                { label: 'PE', value: stock.details.pe != null ? stock.details.pe.toFixed(1) : '—', color: 'text-gray-300' },
                { label: '毛利率', value: stock.details.gross_margin != null ? `${stock.details.gross_margin.toFixed(1)}%` : '—', color: 'text-gray-300' },
                { label: '周轉率', value: stock.details.turnover != null ? `${stock.details.turnover.toFixed(1)}%` : '—', color: 'text-gray-300' },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center rounded bg-gray-700/30 p-2">
                  <div className="text-[10px] text-gray-500 mb-1">{label}</div>
                  <div className={`text-sm font-mono font-semibold ${color}`}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
