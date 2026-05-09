'use client';
import {
  ScanStock, DIMENSION_CONFIG,
  getStockName, getStockSector, getStockClose, getStockChangePct,
  getStockRecommendation, getStockReason, getStockDimensions,
  getStockEntryLow, getStockEntryHigh, getStockStopLoss,
  getStockTarget1, getStockTarget2, getStockTarget3,
} from '@/lib/scanTypes';
import { X, Target, Shield, TrendingUp, TrendingDown, ExternalLink, Share2, Check, Sparkles, Activity } from 'lucide-react';
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
          const labelPt = toXY(a, 1.18);
          return (
            <text key={i} x={labelPt.x} y={labelPt.y} textAnchor="middle" dominantBaseline="middle"
              fontSize={10} fill="#6b7280">
              {labels[i]}
            </text>
          );
        })}
      </svg>
      {/* 分數條 */}
      <div className="w-full space-y-1.5 px-2">
        {keys.map((k) => {
          const val = (dims as Record<string, number>)[k] ?? 0;
          const max = maxVals[k];
          const pct = Math.round((val / max) * 100);
          return (
            <div key={k} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-14 shrink-0">{DIM_LABELS[k]}</span>
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-sky-400 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs font-semibold text-gray-700 w-6 text-right">{val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 盤中走勢圖：優先用 intraday_data，沒有則用模擬數據加 placeholder 提示 */
function IntradayChart({ stock }: { stock: ScanStock }) {
  const close = getStockClose(stock) ?? 100;
  const changePct = getStockChangePct(stock) ?? 0;
  const open = close / (1 + changePct / 100);
  const isUp = changePct >= 0;
  const color = isUp ? '#ef4444' : '#22c55e';
  const entry = getStockEntryLow(stock);
  const stop = getStockStopLoss(stock);
  const t1 = getStockTarget1(stock);

  // 嘗試使用 intraday_data 真實數據
  const rawIntraday = (stock as Record<string, unknown>).intraday_data;
  const hasRealData = Array.isArray(rawIntraday) && rawIntraday.length > 0;

  let data: { time: string; price: number }[];
  if (hasRealData) {
    data = (rawIntraday as Array<{ time?: string; t?: string; price?: number; c?: number }>).map((p) => ({
      time: p.time ?? p.t ?? '',
      price: p.price ?? p.c ?? 0,
    }));
  } else {
    // 模擬走勢（示意）
    data = Array.from({ length: 20 }, (_, i) => {
      const progress = i / 19;
      const noise = (Math.random() - 0.5) * close * 0.015;
      return {
        time: `${9 + Math.floor((i * 5) / 60)}:${String((i * 5) % 60).padStart(2, '0')}`,
        price: parseFloat((open + (close - open) * progress + noise).toFixed(2)),
      };
    });
    data[data.length - 1].price = close;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Activity size={14} className="text-sky-500" />
        <h3 className="text-sm font-semibold text-gray-700">
          盤中走勢{hasRealData ? '' : '（示意）'}
        </h3>
        {!hasRealData && (
          <span className="text-xs text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full">
            盤後無即時數據
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 9 }} tickFormatter={(v) => `${v}`} width={45} />
          <Tooltip formatter={(v: number) => [`$${v}`, '價格']} />
          <Line type="monotone" dataKey="price" stroke={color} strokeWidth={1.5} dot={false} />
          {entry && <ReferenceLine y={entry} stroke="#10b981" strokeDasharray="3 3" label={{ value: '進場', fontSize: 9 }} />}
          {stop && <ReferenceLine y={stop} stroke="#ef4444" strokeDasharray="3 3" label={{ value: '停損', fontSize: 9 }} />}
          {t1 && <ReferenceLine y={t1} stroke="#3b82f6" strokeDasharray="3 3" label={{ value: 'T1', fontSize: 9 }} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function StockDetailModal({ stock, onClose, rank, isDemo }: Props) {
  const [copied, setCopied] = useState(false);
  const name = getStockName(stock);
  const sector = getStockSector(stock);
  const close = getStockClose(stock);
  const changePct = getStockChangePct(stock);
  const rec = getStockRecommendation(stock);
  const reason = getStockReason(stock);
  const entryLow = getStockEntryLow(stock);
  const entryHigh = getStockEntryHigh(stock);
  const stopLoss = getStockStopLoss(stock);
  const t1 = getStockTarget1(stock);
  const t2 = getStockTarget2(stock);
  const t3 = getStockTarget3(stock);
  const actionStyle = getActionStyle(rec);
  const isUp = (changePct ?? 0) >= 0;

  // ESC 關閉
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleShare = useCallback(async () => {
    const text = `【${name} ${stock.stock_id}】\n評分 ${stock.total_score} | ${rec ?? ''}\n進場 ${entryLow}~${entryHigh} | 停損 ${stopLoss}\nT1:${t1} T2:${t2} T3:${t3}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [name, stock, rec, entryLow, entryHigh, stopLoss, t1, t2, t3]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm">
      <div
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white sm:rounded-2xl shadow-2xl"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        {/* ── Header ── */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-4 pt-4 pb-3 flex items-start justify-between gap-3 z-10">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {rank && (
                <span className="text-xs font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                  #{rank}
                </span>
              )}
              <h2 className="text-lg font-bold text-gray-900">{name}</h2>
              <span className="text-sm text-gray-400 font-mono">{stock.stock_id}</span>
              {isDemo && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Demo</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs text-gray-400">{sector}</span>
              {close != null && (
                <span className="text-base font-bold text-gray-800">${close.toLocaleString()}</span>
              )}
              {changePct != null && (
                <span className={`text-sm font-semibold flex items-center gap-0.5 ${isUp ? 'text-red-500' : 'text-green-600'}`}>
                  {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {isUp ? '+' : ''}{changePct.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleShare} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400">
              {copied ? <Check size={16} className="text-emerald-500" /> : <Share2 size={16} />}
            </button>
            <a href={`https://tw.stock.yahoo.com/quote/${stock.stock_id}`} target="_blank" rel="noopener noreferrer"
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400">
              <ExternalLink size={16} />
            </a>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="px-4 py-4 space-y-5">

          {/* 操作建議標籤 */}
          {rec && (
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-semibold ${actionStyle.bg} ${actionStyle.border} ${actionStyle.text}`}>
              <Target size={14} />
              <span>{actionStyle.label}</span>
              <span className="font-normal text-xs opacity-75">{rec}</span>
            </div>
          )}

          {/* ══ AI 白話文分析卡片（無條件渲染）══ */}
          <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-sky-50 border border-indigo-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={15} className="text-indigo-500" />
              <span className="text-sm font-semibold text-indigo-700">AI 白話文分析</span>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">
              {reason && reason.trim().length > 0
                ? reason
                : '暫無 AI 分析資料，請等待下次掃描更新。'}
            </p>
          </div>

          {/* 盤中走勢 */}
          <div className="rounded-xl bg-gray-50 p-4">
            <IntradayChart stock={stock} />
          </div>

          {/* 進場策略 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <Target size={14} className="text-emerald-500" />
              進場策略
            </h3>

            {/* 進場區間 */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                <div className="text-xs text-emerald-600 font-medium mb-1">進場區間</div>
                <div className="text-sm font-bold text-emerald-700">
                  {entryLow != null && entryHigh != null
                    ? `$${entryLow.toLocaleString()} ~ $${entryHigh.toLocaleString()}`
                    : entryLow != null ? `$${entryLow.toLocaleString()}`
                    : '—'}
                </div>
              </div>

              {/* 停損 */}
              <div className="bg-red-50 rounded-xl p-3 text-center">
                <div className="text-xs text-red-500 font-medium mb-1 flex items-center justify-center gap-1">
                  <Shield size={11} />停損
                </div>
                <div className="text-sm font-bold text-red-600">
                  {stopLoss != null ? `$${stopLoss.toLocaleString()}` : '—'}
                </div>
              </div>

              {/* 持有 */}
              <div className="bg-sky-50 rounded-xl p-3 text-center">
                <div className="text-xs text-sky-600 font-medium mb-1">📅建議持有</div>
                <div className="text-sm font-bold text-sky-700">
                  {stock.hold_days ?? '—'}
                </div>
              </div>
            </div>

            {/* 目標價 */}
            {(t1 || t2 || t3) && (
              <div className="bg-sky-50 rounded-xl p-3">
                <div className="text-xs text-sky-600 font-medium mb-2">目標價</div>
                <div className="flex gap-3 flex-wrap">
                  {t1 && (
                    <div className="text-center">
                      <div className="text-xs text-gray-400">T1</div>
                      <div className="text-sm font-bold text-sky-600">${t1.toLocaleString()}</div>
                    </div>
                  )}
                  {t2 && (
                    <div className="text-center">
                      <div className="text-xs text-gray-400">T2</div>
                      <div className="text-sm font-bold text-sky-700">${t2.toLocaleString()}</div>
                    </div>
                  )}
                  {t3 && (
                    <div className="text-center">
                      <div className="text-xs text-gray-400">T3</div>
                      <div className="text-sm font-bold text-sky-800">${t3.toLocaleString()}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 五維評分 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              五維評分 / 總分 {stock.total_score}
            </h3>
            <RadarChart stock={stock} />
          </div>

          {/* 技術指標 */}
          {(stock.rsi != null || stock.vol_ratio != null || stock.volume != null) && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">技術指標</h3>
              <div className="grid grid-cols-3 gap-2">
                {stock.rsi != null && (
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <div className="text-xs text-gray-400 mb-1">RSI</div>
                    <div className={`text-sm font-bold ${stock.rsi > 70 ? 'text-red-500' : stock.rsi < 30 ? 'text-green-600' : 'text-gray-700'}`}>
                      {stock.rsi.toFixed(1)}
                    </div>
                  </div>
                )}
                {stock.vol_ratio != null && (
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <div className="text-xs text-gray-400 mb-1">量比</div>
                    <div className={`text-sm font-bold ${stock.vol_ratio > 2 ? 'text-orange-500' : 'text-gray-700'}`}>
                      {stock.vol_ratio.toFixed(2)}x
                    </div>
                  </div>
                )}
                {stock.volume != null && (
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <div className="text-xs text-gray-400 mb-1">成交量</div>
                    <div className="text-sm font-bold text-gray-700">
                      {stock.volume >= 10000
                        ? `${(stock.volume / 10000).toFixed(1)}萬`
                        : stock.volume.toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 倉位建議 */}
          {(stock.position || stock.max_loss_per_lot != null) && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">倉位建議</h3>
              <div className="bg-amber-50 rounded-xl p-3 space-y-1">
                {stock.position && (
                  <div className="text-sm text-amber-700">{stock.position}</div>
                )}
                {stock.max_loss_per_lot != null && (
                  <div className="text-xs text-amber-600">
                    每張最大虧損：${stock.max_loss_per_lot.toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 免責聲明 */}
          <p className="text-xs text-gray-400 text-center border-t border-gray-100 pt-4">
            本資訊僅供參考，不構成投資建議。投資有風險，請自行評估。
          </p>
        </div>
      </div>
    </div>
  );
}
