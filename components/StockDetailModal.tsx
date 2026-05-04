'use client';
import { ScanStock, StockNarrative, DIMENSION_CONFIG } from '@/lib/scanTypes';
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

const ACTION_MAP: Record<string, { bg: string; border: string; text: string }> = {
  '強力買進': { bg: 'bg-red-500/10',     border: 'border-red-500/30',     text: 'text-red-400' },
  '買進':     { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400' },
  '逢低佈局': { bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     text: 'text-sky-400' },
  '觀望':     { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-400' },
  '偏弱':     { bg: 'bg-gray-800',       border: 'border-gray-700',       text: 'text-gray-400' },
};

const DIM_LABELS: Record<string, string> = {
  technical: '技術面', fundamental: '基本面', news: '消息面', sentiment: '市場情緒', chips: '籌碼面',
};
const DIM_COLORS: Record<string, string> = {
  technical: '#38bdf8', fundamental: '#34d399', news: '#fbbf24', sentiment: '#a78bfa', chips: '#f87171',
};

// ── AI 白話文分析面板 ──────────────────────────────────────────
const NARRATIVE_ROWS: { key: keyof StockNarrative; label: string; icon: string; color: string }[] = [
  { key: 'technical',   label: '技術面解讀', icon: '📈', color: 'text-sky-300' },
  { key: 'chips',       label: '籌碼面解讀', icon: '🏦', color: 'text-violet-300' },
  { key: 'fundamental', label: '基本面評價', icon: '📊', color: 'text-emerald-300' },
  { key: 'risk',        label: '風險提示',   icon: '⚠️', color: 'text-amber-300' },
  { key: 'action',      label: '操作建議',   icon: '🎯', color: 'text-red-300' },
];

function NarrativePanel({ narrative }: { narrative: StockNarrative }) {
  return (
    <div className="rounded-xl bg-gray-800/40 border border-gray-700/50 p-4">
      <h3 className="text-[11px] font-semibold text-gray-500 mb-3 uppercase tracking-wide flex items-center gap-1.5">
        <span>🤖</span>AI 白話文分析
      </h3>
      <div className="space-y-3">
        {NARRATIVE_ROWS.map(({ key, label, icon, color }) => (
          <div key={key} className="rounded-lg bg-gray-900/60 border border-gray-700/40 px-3 py-2.5">
            <div className={`text-[10px] font-semibold mb-1 flex items-center gap-1 ${color}`}>
              <span>{icon}</span>{label}
            </div>
            <p className="text-[12px] text-gray-300 leading-relaxed">{narrative[key]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SimpleSparkline({ candles }: { candles: { date: string; close: number }[] }) {
  if (!candles || candles.length < 2) return null;
  const min = Math.min(...candles.map((c) => c.close));
  const max = Math.max(...candles.map((c) => c.close));
  const last = candles[candles.length - 1].close;
  const first = candles[0].close;
  const up = last >= first;

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: { date: string; close: number } }[] }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs">
        <div className="text-gray-400">{d.date}</div>
        <div className="font-mono font-bold text-white">{d.close.toFixed(2)}</div>
      </div>
    );
  };

  return (
    <div className="rounded-xl bg-gray-800/40 border border-gray-700/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">近期走勢</span>
        <span className={`text-xs font-mono ${up ? 'text-red-400' : 'text-emerald-400'}`}>
          {up ? '▲' : '▼'} {Math.abs(((last - first) / first) * 100).toFixed(2)}%
        </span>
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <LineChart data={candles} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <XAxis dataKey="date" hide />
          <YAxis domain={[min * 0.995, max * 1.005]} hide />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone" dataKey="close"
            stroke={up ? '#f87171' : '#34d399'}
            strokeWidth={1.5} dot={false}
            activeDot={{ r: 3, fill: up ? '#f87171' : '#34d399' }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex justify-between text-[9px] text-gray-600 mt-1 font-mono">
        <span>{candles[0]?.date}</span>
        <span>{candles[candles.length - 1]?.date}</span>
      </div>
    </div>
  );
}

export default function StockDetailModal({ stock, onClose, rank, isDemo }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const share = useCallback(() => {
    const text = `台股雷達推薦 ${stock.name}(${stock.stock_id}) 評分 ${stock.total_score.toFixed(1)} — ${stock.strategy?.recommendation ?? ''}`;
    if (navigator.share) {
      navigator.share({ title: '台股雷達', text, url: window.location.href });
    } else {
      navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    }
  }, [stock]);

  const ac = ACTION_MAP[stock.strategy?.recommendation ?? ''] ?? ACTION_MAP['觀望'];
  const up = (stock.change_pct ?? 0) >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full sm:max-w-lg bg-gray-900 border border-gray-700/60 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92dvh] overflow-y-auto fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-900/98 backdrop-blur border-b border-gray-800 px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {rank && (
              <span className="w-7 h-7 rounded-full bg-sky-500/15 border border-sky-500/25 flex items-center justify-center text-xs font-bold text-sky-400">
                {rank}
              </span>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">{stock.name}</span>
                <span className="text-xs text-gray-500 font-mono">{stock.stock_id}</span>
                {isDemo && <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20">示範</span>}
              </div>
              <div className="text-[11px] text-gray-500 flex items-center gap-1">
                {stock.sector}
                <a
                  href={`https://tw.stock.yahoo.com/quote/${stock.stock_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-sky-500 hover:text-sky-400 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); share(); }}
              className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
              title="分享"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4 text-gray-500" />}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Price + Score */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold font-mono text-white">{stock.close.toLocaleString()}</div>
              <div className={`text-sm font-mono mt-0.5 flex items-center gap-1 ${up ? 'text-red-400' : 'text-emerald-400'}`}>
                {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {up ? '+' : ''}{(stock.change_pct ?? 0).toFixed(2)}%
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-white">{stock.total_score.toFixed(1)}</div>
              <div className="text-[11px] text-gray-500">綜合評分</div>
              <div className={`text-xs font-medium mt-1 px-2 py-0.5 rounded border ${ac.bg} ${ac.border} ${ac.text}`}>
                {stock.strategy?.recommendation}
              </div>
            </div>
          </div>

          {/* 五維度 */}
          {stock.dimensions && (
            <div className="rounded-xl bg-gray-800/40 border border-gray-700/50 p-4">
              <h3 className="text-[11px] font-semibold text-gray-500 mb-3 uppercase tracking-wide">五維度評分</h3>
              <div className="space-y-2">
                {Object.entries(DIMENSION_CONFIG).map(([key, cfg]) => {
                  const val = (stock.dimensions as unknown as Record<string, number>)[key] ?? 0;
                  const pct = Math.min((val / cfg.max) * 100, 100);
                  const color = DIM_COLORS[key] ?? '#38bdf8';
                  return (
                    <div key={key} className="flex items-center gap-2.5">
                      <span className="text-[11px] text-gray-400 w-16 shrink-0">{DIM_LABELS[key]}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-gray-800">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                      <span className="text-[11px] font-mono text-gray-300 w-8 text-right">{val.toFixed(1)}</span>
                      <span className="text-[10px] text-gray-600 w-10 text-right">/{cfg.max}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 策略建議卡 */}
          {stock.strategy && (
            <div className={`rounded-xl border p-4 ${ac.bg} ${ac.border}`}>
              <h3 className="text-[11px] font-semibold text-gray-500 mb-3 uppercase tracking-wide flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" />操作策略
              </h3>
              {/* 進場 / 停損 */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="text-center rounded-lg bg-gray-800/60 py-2.5">
                  <div className="text-[10px] text-gray-500 mb-1">進場價</div>
                  <div className="font-mono font-bold text-white text-sm">{stock.strategy.entry?.toFixed(2) ?? '—'}</div>
                </div>
                <div className="text-center rounded-lg bg-red-900/30 py-2.5">
                  <div className="text-[10px] text-red-400 mb-1 flex items-center justify-center gap-0.5">
                    <Shield className="w-2.5 h-2.5" />停損價
                  </div>
                  <div className="font-mono font-bold text-red-400 text-sm">{stock.strategy.stop_loss?.toFixed(2) ?? '—'}</div>
                  <div className="text-[9px] text-red-600">-{stock.strategy.downside}%</div>
                </div>
              </div>
              {/* 三關目標價 */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { label: '第一關', key: 'target1', pct: stock.strategy.upside ? String(stock.strategy.upside) : null },
                  { label: '第二關', key: 'target2', pct: stock.strategy.upside2 ? String(stock.strategy.upside2) : null },
                  { label: '第三關', key: 'target3', pct: stock.strategy.upside3 ? String(stock.strategy.upside3) : null },
                ].map(({ label, key, pct }) => {
                  const val = ((stock.strategy ?? {}) as Record<string, number>)[key] ?? (key === 'target1' ? stock.strategy?.target : undefined);
                  return (
                    <div key={key} className="text-center rounded-lg bg-emerald-900/30 py-2.5">
                      <div className="text-[10px] text-emerald-500 mb-1 flex items-center justify-center gap-0.5">
                        <TrendingUp className="w-2.5 h-2.5" />{label}
                      </div>
                      <div className="font-mono font-bold text-emerald-400 text-sm">
                        {val && val > 0 ? val.toFixed(2) : '—'}
                      </div>
                      {pct && <div className="text-[9px] text-emerald-600">+{pct}%</div>}
                    </div>
                  );
                })}
              </div>
              {/* R/R ratio */}
              <div className="pt-2 border-t border-gray-700/50">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">風報比</span>
                  <span className="font-mono text-white">
                    1 : {((stock.strategy.upside ?? 0) / Math.max(stock.strategy.downside ?? 1, 1)).toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 技術指標 */}
          {stock.details && (
            <div className="rounded-xl bg-gray-800/40 border border-gray-700/50 p-4">
              <h3 className="text-[11px] font-semibold text-gray-500 mb-3 uppercase tracking-wide">技術指標</h3>
              <div className="grid grid-cols-3 gap-3">
                {stock.details.rsi !== undefined && (
                  <div className="text-center">
                    <div className="text-[10px] text-gray-500 mb-1">RSI</div>
                    <div className={`font-mono font-bold text-sm ${
                      stock.details.rsi >= 70 ? 'text-red-400' :
                      stock.details.rsi <= 30 ? 'text-emerald-400' : 'text-white'
                    }`}>{stock.details.rsi.toFixed(1)}</div>
                    <div className="text-[9px] text-gray-600">
                      {stock.details.rsi >= 70 ? '超買' : stock.details.rsi <= 30 ? '超賣' : '中性'}
                    </div>
                  </div>
                )}
                {stock.details.vol_ratio !== undefined && (
                  <div className="text-center">
                    <div className="text-[10px] text-gray-500 mb-1">量比</div>
                    <div className={`font-mono font-bold text-sm ${
                      stock.details.vol_ratio >= 2 ? 'text-red-400' :
                      stock.details.vol_ratio >= 1.5 ? 'text-amber-400' : 'text-white'
                    }`}>{stock.details.vol_ratio.toFixed(2)}x</div>
                    <div className="text-[9px] text-gray-600">
                      {stock.details.vol_ratio >= 2 ? '爆量' : stock.details.vol_ratio >= 1.5 ? '放量' : '正常'}
                    </div>
                  </div>
                )}
                {stock.details.pe !== undefined && (
                  <div className="text-center">
                    <div className="text-[10px] text-gray-500 mb-1">本益比</div>
                    <div className="font-mono font-bold text-white text-sm">{stock.details.pe.toFixed(1)}</div>
                    <div className="text-[9px] text-gray-600">
                      {stock.details.pe < 10 ? '低估' : stock.details.pe > 25 ? '偏高' : '合理'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Signals */}
          {stock.signals && (
            <div className="rounded-xl bg-gray-800/40 border border-gray-700/50 p-4">
              <h3 className="text-[11px] font-semibold text-gray-500 mb-3 uppercase tracking-wide">訊號明細</h3>
              <div className="space-y-2">
                {Object.entries(stock.signals).map(([dim, sigs]) => (
                  Array.isArray(sigs) && sigs.length > 0 && (
                    <div key={dim}>
                      <div className="text-[10px] text-gray-600 mb-1" style={{ color: DIM_COLORS[dim] }}>{DIM_LABELS[dim]}</div>
                      <div className="flex flex-wrap gap-1">
                        {sigs.map((sig, j) => (
                          <span key={j} className="text-[10px] bg-gray-800 border border-gray-700 text-gray-300 px-2 py-0.5 rounded-full">
                            {sig}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          {/* AI 白話文分析 */}
          {stock.narrative && <NarrativePanel narrative={stock.narrative} />}

          <a
            href={`https://tw.stock.yahoo.com/quote/${stock.stock_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-400 text-xs font-medium hover:bg-gray-750 hover:text-gray-200 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            在 Yahoo Finance 查看 {stock.stock_id}
          </a>
        </div>
      </div>
    </div>
  );
}
