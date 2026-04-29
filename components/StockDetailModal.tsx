'use client';
import { ScanStock, DIMENSION_CONFIG, getActionColor } from '@/lib/scanTypes';
import RadarChart from './RadarChart';
import DimensionBars from './DimensionBars';
import { X, TrendingUp, TrendingDown, Target, Shield } from 'lucide-react';

interface Props {
  stock: ScanStock;
  onClose: () => void;
}

const SIGNAL_LABELS: Record<string, string> = {
  technical: '\u6280\u8853',
  chips: '\u7c4c\u78bc',
  fundamental: '\u57fa\u672c\u9762',
  news: '\u6d88\u606f',
  sentiment: '\u60c5\u7dd2',
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
  const scorePercent = Math.min(Math.round((stock.total_score / totalMax) * 100), 100);

  // rsi and vol_ratio may live at top-level (on-demand) or inside details (daily scan)
  const rsi = stock.rsi ?? stock.details?.rsi;
  const volRatio = stock.vol_ratio ?? stock.details?.vol_ratio ?? stock.details?.vol_ratio_5;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-xl border border-gray-700 bg-gray-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-700/60 px-5 py-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xs font-mono text-gray-500 bg-gray-800 px-2 py-1 rounded">{stock.stock_id}</div>
            <div>
              <h2 className="text-lg font-bold text-white">{stock.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">{stock.sector}</span>
                <span className={`text-sm font-semibold font-mono ${up ? 'text-emerald-400' : 'text-red-400'}`}>{up ? '+' : ''}{stock.change_pct.toFixed(2)}%</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-2xl font-bold font-mono text-white">{stock.close.toLocaleString()}</div>
              <div className="text-xs text-gray-500 text-right">\u6536\u76e4\u50f9</div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg bg-gray-800/50 border border-gray-700/60 p-4 flex flex-col items-center justify-center gap-2">
              <div className="relative w-24 h-24">
                <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1f2937" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke={scorePercent >= 70 ? '#34d399' : scorePercent >= 50 ? '#38bdf8' : '#fbbf24'} strokeWidth="3" strokeDasharray={`${scorePercent} ${100 - scorePercent}`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-white">{Math.round(stock.total_score)}</span>
                  <span className="text-[10px] text-gray-500">\u7e3d\u5206</span>
                </div>
              </div>
              <div className={`text-xs font-medium px-3 py-1 rounded-full border ${actionColor}`}>{stock.strategy.recommendation.split(' - ')[0]}</div>
              <div className="text-[11px] text-gray-500">\u6eff\u5206 {totalMax} \u5206</div>
            </div>
            <div className="rounded-lg bg-gray-800/50 border border-gray-700/60 p-4 flex items-center justify-center">
              <RadarChart dimensions={stock.dimensions} size={180} />
            </div>
          </div>

          <div className="rounded-lg bg-gray-800/50 border border-gray-700/60 p-4">
            <h3 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">\u4e94\u7dad\u5ea6\u5206\u6790</h3>
            <DimensionBars dimensions={stock.dimensions} />
          </div>

          <div className="rounded-lg bg-gray-800/50 border border-gray-700/60 p-4">
            <h3 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">\u4ea4\u6613\u7b56\u7565</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div className="rounded bg-sky-500/10 border border-sky-500/20 p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-1 flex items-center justify-center gap-1"><Target className="w-3 h-3" />\u9032\u5834\u50f9</div>
                <div className="text-sm font-bold font-mono text-sky-300">{stock.strategy.entry.toLocaleString()}</div>
              </div>
              <div className="rounded bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-1 flex items-center justify-center gap-1"><TrendingUp className="w-3 h-3" />\u76ee\u6a19\u50f9</div>
                <div className="text-sm font-bold font-mono text-emerald-300">{stock.strategy.target.toLocaleString()}</div>
              </div>
              <div className="rounded bg-red-500/10 border border-red-500/20 p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-1 flex items-center justify-center gap-1"><Shield className="w-3 h-3" />\u505c\u640d\u50f9</div>
                <div className="text-sm font-bold font-mono text-red-300">{stock.strategy.stop_loss.toLocaleString()}</div>
              </div>
              <div className="rounded bg-gray-700/40 border border-gray-600/40 p-2.5 text-center">
                <div className="text-[10px] text-gray-500 mb-1 flex items-center justify-center gap-1"><TrendingDown className="w-3 h-3" />\u98a8\u96aa\u6bd4</div>
                <div className="text-sm font-bold font-mono text-gray-300">{(stock.strategy.upside / Math.max(stock.strategy.downside, 0.1)).toFixed(1)}x</div>
              </div>
            </div>
            <div className="text-[11px] flex gap-3 text-gray-400">
              <span className="text-emerald-400">\u2191 +{stock.strategy.upside.toFixed(1)}%</span>
              <span className="text-red-400">\u2193 -{stock.strategy.downside.toFixed(1)}%</span>
            </div>
            <div className={`mt-3 rounded-lg border px-3 py-2.5 text-xs font-medium ${actionColor}`}>{stock.strategy.recommendation}</div>
          </div>

          <div className="rounded-lg bg-gray-800/50 border border-gray-700/60 p-4">
            <h3 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">\u8a0a\u865f\u660e\u7d30</h3>
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
                        <span key={i} className="text-[11px] text-gray-300 bg-gray-700/40 px-2 py-0.5 rounded border border-gray-600/30">{s}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg bg-gray-800/50 border border-gray-700/60 p-4">
            <h3 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">\u6280\u8853\u6307\u6a19</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'RSI', value: rsi != null ? rsi.toFixed(1) : '\u2014', color: rsi == null ? 'text-gray-500' : rsi > 70 ? 'text-red-400' : rsi < 30 ? 'text-emerald-400' : 'text-sky-400' },
                { label: '\u91cf\u6bd4', value: volRatio != null ? `${volRatio.toFixed(1)}x` : '\u2014', color: volRatio != null && volRatio > 2 ? 'text-emerald-400' : 'text-gray-300' },
                { label: '\u5747\u5dee', value: stock.details?.ma_spread != null ? `${stock.details.ma_spread.toFixed(1)}%` : '\u2014', color: 'text-gray-300' },
                { label: 'PE', value: stock.details?.pe != null ? stock.details.pe.toFixed(1) : '\u2014', color: 'text-gray-300' },
                { label: '\u6bdb\u5229\u7387', value: stock.details?.gross_margin != null ? `${stock.details.gross_margin.toFixed(1)}%` : '\u2014', color: 'text-gray-300' },
                { label: '\u5468\u8f49\u7387', value: stock.details?.turnover != null ? `${stock.details.turnover.toFixed(1)}%` : '\u2014', color: 'text-gray-300' },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center rounded bg-gray-700/30 p-2">
                  <div className="text-[10px] text-gray-500 mb-1">{label}</div>
                  <div className={`text-sm font-mono font-semibold ${color}`}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {stock.backtest_summary?.best_entry_signal && (
            <div className="rounded-lg bg-gray-800/50 border border-gray-700/60 p-4">
              <h3 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">\u56de\u6e2c\u6458\u8981</h3>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="text-center rounded bg-gray-700/30 p-2"><div className="text-[10px] text-gray-500 mb-1">\u7b56\u7565</div><div className="text-xs font-semibold text-gray-300">{stock.backtest_summary.best_strategy ?? '\u2014'}</div></div>
                <div className="text-center rounded bg-gray-700/30 p-2"><div className="text-[10px] text-gray-500 mb-1">\u52dd\u7387</div><div className="text-xs font-mono font-semibold text-sky-300">{stock.backtest_summary.win_rate != null ? `${(stock.backtest_summary.win_rate * 100).toFixed(0)}%` : '\u2014'}</div></div>
                <div className="text-center rounded bg-gray-700/30 p-2"><div className="text-[10px] text-gray-500 mb-1">\u6700\u5927\u56de\u64a4</div><div className="text-xs font-mono font-semibold text-red-400">{stock.backtest_summary.max_drawdown != null ? `${stock.backtest_summary.max_drawdown.toFixed(1)}%` : '\u2014'}</div></div>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">{stock.backtest_summary.best_entry_signal}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
