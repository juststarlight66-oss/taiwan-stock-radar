'use client';
import { ScanStock, DIMENSION_CONFIG } from '@/lib/scanTypes';
import { X, TrendingUp, TrendingDown, Target, Shield, ChevronRight } from 'lucide-react';
import { useEffect } from 'react';

interface Props {
  stock: ScanStock;
  onClose: () => void;
  rank?: number;
  isDemo?: boolean;
}

const ACTION_MAP: Record<string, { bg: string; border: string; text: string }> = {
  '強力買進': { bg: 'bg-red-500/15',     border: 'border-red-500/40',     text: 'text-red-300' },
  '買進':     { bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-300' },
  '逢低佈局': { bg: 'bg-sky-500/15',     border: 'border-sky-500/40',     text: 'text-sky-300' },
  '觀望':     { bg: 'bg-amber-500/15',   border: 'border-amber-500/40',   text: 'text-amber-300' },
  '偏弱':     { bg: 'bg-gray-700/40',    border: 'border-gray-600/40',    text: 'text-gray-400' },
};

export default function StockDetailModal({ stock, onClose, rank, isDemo }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const ac = ACTION_MAP[stock.strategy?.recommendation ?? ''] ?? ACTION_MAP['觀望'];
  const actionColor = `${ac.bg} ${ac.border} ${ac.text} border`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full sm:max-w-lg bg-gray-900 border border-gray-700/60 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {rank && (
              <span className="w-7 h-7 rounded-full bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-xs font-bold text-sky-300">
                {rank}
              </span>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">{stock.name}</span>
                <span className="text-xs text-gray-500 font-mono">{stock.stock_id}</span>
                {isDemo && <span className="text-[9px] bg-amber-900/40 text-amber-400 px-1.5 py-0.5 rounded border border-amber-700/40">示範</span>}
              </div>
              <div className="text-xs text-gray-500">{stock.sector}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* 價格 + 評分 */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold font-mono text-white">{stock.close.toLocaleString()}</div>
              <div className={`text-sm font-mono mt-0.5 ${
                (stock.change_pct ?? 0) > 0 ? 'text-red-400' : (stock.change_pct ?? 0) < 0 ? 'text-emerald-400' : 'text-gray-400'
              }`}>
                {(stock.change_pct ?? 0) > 0 ? '▲' : (stock.change_pct ?? 0) < 0 ? '▼' : '—'}
                {' '}{Math.abs(stock.change_pct ?? 0).toFixed(2)}%
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-white">{stock.total_score.toFixed(1)}</div>
              <div className="text-xs text-gray-500">綜合評分</div>
            </div>
          </div>

          {/* 五維度雷達 */}
          {stock.dimensions && (
            <div className="rounded-lg bg-gray-800/50 border border-gray-700/60 p-4">
              <h3 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">五維度評分</h3>
              <div className="space-y-2.5">
                {Object.entries(DIMENSION_CONFIG).map(([key, cfg]) => {
                  const val = stock.dimensions![key as keyof typeof stock.dimensions] ?? 0;
                  const max = cfg.max;
                  const pct = Math.min(100, (val / max) * 100);
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400">{cfg.label}</span>
                        <span className="text-xs font-mono text-gray-300">{val.toFixed(1)} / {max}</span>
                      </div>
                      <div className="w-full bg-gray-700/60 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${
                            pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : pct >= 30 ? 'bg-orange-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 訊號 */}
          {stock.signals && (
            <div className="rounded-lg bg-gray-800/50 border border-gray-700/60 p-4">
              <h3 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">評分訊號</h3>
              <div className="space-y-2">
                {Object.entries(DIMENSION_CONFIG).map(([key, cfg]) => {
                  const sigs = stock.signals![key as keyof typeof stock.signals];
                  if (!sigs || sigs.length === 0) return null;
                  return (
                    <div key={key}>
                      <div className="text-[10px] text-gray-500 mb-1">{cfg.label}</div>
                      <div className="flex flex-wrap gap-1">
                        {sigs.map((s, i) => (
                          <span key={i} className="text-[10px] bg-gray-700/60 text-gray-300 px-2 py-0.5 rounded-full">{s}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 交易策略 */}
          {stock.strategy && (
            <div className="rounded-lg bg-gray-800/50 border border-gray-700/60 p-4">
              <h3 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">交易策略</h3>
              {/* 進場 + 停損 */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="rounded bg-sky-500/10 border border-sky-500/20 p-2.5 text-center">
                  <div className="text-[10px] text-gray-500 mb-1 flex items-center justify-center gap-1"><Target className="w-3 h-3" />進場參考</div>
                  <div className="text-sm font-bold font-mono text-sky-300">{stock.strategy.entry.toLocaleString()}</div>
                  {stock.strategy.atr != null && (
                    <div className="text-[9px] text-gray-600 mt-0.5">ATR {stock.strategy.atr}</div>
                  )}
                </div>
                <div className="rounded bg-red-500/10 border border-red-500/20 p-2.5 text-center">
                  <div className="text-[10px] text-gray-500 mb-1 flex items-center justify-center gap-1"><Shield className="w-3 h-3" />停損價</div>
                  <div className="text-sm font-bold font-mono text-red-300">{stock.strategy.stop_loss.toLocaleString()}</div>
                  <div className="text-[9px] text-red-600 mt-0.5">-{stock.strategy.downside.toFixed(1)}%</div>
                </div>
              </div>
              {/* 三關目標價 */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-center">
                  <div className="text-[9px] text-gray-500 mb-1">🎯 第一關</div>
                  <div className="text-sm font-bold font-mono text-emerald-300">
                    {(stock.strategy.target1 ?? stock.strategy.target).toLocaleString()}
                  </div>
                  <div className="text-[9px] text-emerald-600 mt-0.5">+{stock.strategy.upside.toFixed(1)}%</div>
                </div>
                <div className="rounded bg-emerald-500/15 border border-emerald-500/30 p-2.5 text-center">
                  <div className="text-[9px] text-gray-500 mb-1">🎯 第二關</div>
                  <div className="text-sm font-bold font-mono text-emerald-200">
                    {stock.strategy.target2 != null ? stock.strategy.target2.toLocaleString() : '—'}
                  </div>
                  {stock.strategy.upside2 != null && (
                    <div className="text-[9px] text-emerald-500 mt-0.5">+{stock.strategy.upside2.toFixed(1)}%</div>
                  )}
                </div>
                <div className="rounded bg-amber-500/10 border border-amber-500/20 p-2.5 text-center">
                  <div className="text-[9px] text-gray-500 mb-1">🚀 第三關</div>
                  <div className="text-sm font-bold font-mono text-amber-300">
                    {stock.strategy.target3 != null ? stock.strategy.target3.toLocaleString() : '—'}
                  </div>
                  {stock.strategy.upside3 != null && (
                    <div className="text-[9px] text-amber-600 mt-0.5">+{stock.strategy.upside3.toFixed(1)}%</div>
                  )}
                </div>
              </div>
              {/* 基準說明 + 風險比 */}
              <div className="flex items-center justify-between text-[10px] text-gray-500 mb-2">
                {stock.strategy.target_note && <span>基準：{stock.strategy.target_note}</span>}
                <span className="ml-auto flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" />
                  風險報酬比 {(stock.strategy.upside / Math.max(stock.strategy.downside, 0.1)).toFixed(1)}x
                </span>
              </div>
              <div className={`mt-2 rounded-lg border px-3 py-2.5 text-xs font-medium ${actionColor}`}>{stock.strategy.recommendation}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
