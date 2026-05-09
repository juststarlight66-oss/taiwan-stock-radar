'use client';
import {
  ScanStock, DIMENSION_CONFIG,
  getStockName, getStockSector, getStockClose, getStockChangePct,
  getStockRecommendation, getStockReason, getStockDimensions,
  getStockEntryLow, getStockEntryHigh, getStockStopLoss,
  getStockTarget1, getStockTarget2, getStockTarget3,
} from '@/lib/scanTypes';
import { X, Target, Shield, TrendingUp, TrendingDown, ExternalLink, Share2, Check, Sparkles, BarChart2, Cpu, Newspaper, Users, Activity } from 'lucide-react';
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
      {/* 五維分數列表 */}
      <div className="grid grid-cols-5 gap-1 w-full text-center">
        {keys.map((k) => {
          const val = (dims as Record<string, number>)[k] ?? 0;
          const max = maxVals[k];
          const pct = Math.round((val / max) * 100);
          return (
            <div key={k} className="flex flex-col items-center">
              <span className="text-xs text-gray-500">{DIM_LABELS[k]}</span>
              <span className="text-sm font-bold" style={{ color: DIM_COLORS[k] }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 盤中走勢折線圖 */
interface IntradayPoint { time: string; price: number; }

function IntradayChart({ symbol, close }: { symbol: string; close: number }) {
  const [data, setData] = useState<IntradayPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setError(false);
    fetch(`/taiwan-stock-radar/api/intraday?symbol=${symbol}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => {
        if (Array.isArray(json) && json.length > 0) {
          setData(json);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) return <div className="h-28 flex items-center justify-center text-gray-400 text-xs">載入中...</div>;
  if (error || data.length === 0) return <div className="h-28 flex items-center justify-center text-gray-400 text-xs">暫無盤中資料</div>;

  const minP = Math.min(...data.map(d => d.price));
  const maxP = Math.max(...data.map(d => d.price));
  const pad = (maxP - minP) * 0.1 || 1;
  const color = data[data.length - 1]?.price >= close ? '#f87171' : '#34d399';

  return (
    <ResponsiveContainer width="100%" height={112}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
        <YAxis domain={[minP - pad, maxP + pad]} tick={{ fontSize: 9 }} width={48} tickFormatter={(v) => v.toFixed(1)} />
        <Tooltip
          formatter={(v: number) => [v.toFixed(2), '價格']}
          contentStyle={{ fontSize: 11 }}
        />
        <ReferenceLine y={close} stroke="#94a3b8" strokeDasharray="3 3" />
        <Line type="monotone" dataKey="price" stroke={color} dot={false} strokeWidth={1.5} />
      </LineChart>
    </ResponsiveContainer>
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
  const symbol = (stock as Record<string, unknown>).symbol as string ?? '';

  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'technical' | 'strategy'>('overview');

  const actionStyle = getActionStyle(rec);
  const isUp = changePct >= 0;

  const handleShare = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}?stock=${symbol}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [symbol]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 五維敘述：從 narrative 欄位讀取（若無則 fallback 到空字串）
  const narrative = (stock as Record<string, unknown>).narrative as Record<string, string> | undefined;
  const dimNarrative: Record<string, string> = {
    technical: narrative?.technical ?? '',
    chips: narrative?.chips ?? '',
    fundamental: narrative?.fundamental ?? '',
    news: narrative?.news ?? '',
    sentiment: narrative?.sentiment ?? '',
  };
  const hasDimNarrative = Object.values(dimNarrative).some(v => v.length > 0);

  const dimIconMap: Record<string, React.ReactNode> = {
    technical: <Activity className="w-3.5 h-3.5" />,
    chips: <BarChart2 className="w-3.5 h-3.5" />,
    fundamental: <Cpu className="w-3.5 h-3.5" />,
    news: <Newspaper className="w-3.5 h-3.5" />,
    sentiment: <Users className="w-3.5 h-3.5" />,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {rank && (
                <span className="text-xs font-bold bg-gradient-to-r from-amber-400 to-orange-400 text-white px-2 py-0.5 rounded-full">
                  #{rank}
                </span>
              )}
              {isDemo && (
                <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full font-medium">示範</span>
              )}
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{symbol}</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mt-1 truncate">{name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{sector}</p>
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            <button
              onClick={handleShare}
              className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400"
              title="複製連結"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
            </button>
            <a
              href={`https://www.cnyes.com/twstock/${symbol}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400"
              title="前往鉅亨網"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Price + Action */}
        <div className="flex items-center justify-between px-5 py-3 bg-gray-50">
          <div>
            <span className="text-3xl font-bold text-gray-900">{close.toFixed(2)}</span>
            <span className={`ml-2 text-sm font-semibold ${isUp ? 'text-red-500' : 'text-emerald-600'}`}>
              {isUp ? '+' : ''}{changePct.toFixed(2)}%
              {isUp ? <TrendingUp className="inline w-4 h-4 ml-1" /> : <TrendingDown className="inline w-4 h-4 ml-1" />}
            </span>
          </div>
          <div className={`px-4 py-1.5 rounded-full border-2 text-sm font-bold ${actionStyle.bg} ${actionStyle.border} ${actionStyle.text}`}>
            {actionStyle.label}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-5">
          {(['overview', 'technical', 'strategy'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2.5 px-3 text-sm font-medium border-b-2 transition-colors mr-1 ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'overview' ? '總覽' : tab === 'technical' ? '技術分析' : '操作策略'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* ====== 總覽 Tab ====== */}
          {activeTab === 'overview' && (
            <>
              {/* ✅ AI 白話文分析卡片 — 永遠顯示在總覽頂部 */}
              <div className="rounded-xl overflow-hidden border border-blue-100">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600">
                  <Sparkles className="w-4 h-4 text-white" />
                  <span className="text-sm font-semibold text-white">AI 白話文分析</span>
                </div>
                <div className="px-4 py-3 bg-gradient-to-br from-blue-50 to-indigo-50">
                  {reason ? (
                    <p className="text-sm text-gray-700 leading-relaxed">{reason}</p>
                  ) : (
                    <p className="text-sm text-gray-400 italic">暫無 AI 分析資料</p>
                  )}
                </div>
              </div>

              {/* 五維分析文字說明（若有 narrative 欄位） */}
              {hasDimNarrative && (
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                    <span className="text-sm font-semibold text-gray-700">五維深度分析</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {(['technical', 'chips', 'fundamental', 'news', 'sentiment'] as const).map((k) => {
                      const text = dimNarrative[k];
                      if (!text) return null;
                      return (
                        <div key={k} className="px-4 py-3 flex gap-3">
                          <span style={{ color: DIM_COLORS[k] }} className="mt-0.5 shrink-0">
                            {dimIconMap[k]}
                          </span>
                          <div>
                            <span className="text-xs font-semibold text-gray-500 block mb-0.5">{DIM_LABELS[k]}</span>
                            <p className="text-xs text-gray-600 leading-relaxed">{text}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 盤中走勢 */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-700">今日盤中走勢</span>
                </div>
                <div className="px-2 pt-2 pb-1">
                  <IntradayChart symbol={symbol} close={close} />
                </div>
              </div>

              {/* 五維雷達圖 */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-700">五維評分雷達</span>
                </div>
                <div className="px-4 py-4">
                  <RadarChart stock={stock} />
                </div>
              </div>
            </>
          )}

          {/* ====== 技術分析 Tab ====== */}
          {activeTab === 'technical' && (
            <>
              {/* 五維分數條 */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-700">五維評分明細</span>
                </div>
                <div className="px-4 py-3 space-y-3">
                  {DIMENSION_CONFIG.map(({ key, label, max, color }) => {
                    const val = (dims as Record<string, number>)[key] ?? 0;
                    const pct = Math.min((val / max) * 100, 100);
                    return (
                      <div key={key}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-600 font-medium">{label}</span>
                          <span className="font-bold" style={{ color }}>{val.toFixed(1)} / {max}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 雷達圖 */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-700">五維雷達圖</span>
                </div>
                <div className="px-4 py-4">
                  <RadarChart stock={stock} />
                </div>
              </div>
            </>
          )}

          {/* ====== 操作策略 Tab ====== */}
          {activeTab === 'strategy' && (
            <>
              {/* AI 白話文也在策略頁重複顯示 */}
              {reason && (
                <div className="rounded-xl overflow-hidden border border-blue-100">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600">
                    <Sparkles className="w-4 h-4 text-white" />
                    <span className="text-sm font-semibold text-white">AI 操作建議摘要</span>
                  </div>
                  <div className="px-4 py-3 bg-gradient-to-br from-blue-50 to-indigo-50">
                    <p className="text-sm text-gray-700 leading-relaxed">{reason}</p>
                  </div>
                </div>
              )}

              {/* 進場區間 */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-700">進場策略</span>
                </div>
                <div className="px-4 py-3 grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="text-xs text-blue-500 font-medium mb-1">進場區間</div>
                    <div className="text-base font-bold text-blue-700">
                      {entryLow?.toFixed(2)} – {entryHigh?.toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3">
                    <div className="flex items-center gap-1 text-xs text-red-500 font-medium mb-1">
                      <Shield className="w-3 h-3" /> 停損價
                    </div>
                    <div className="text-base font-bold text-red-600">{stopLoss?.toFixed(2)}</div>
                  </div>
                </div>
              </div>

              {/* 目標價 */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-700">目標價位</span>
                </div>
                <div className="px-4 py-3 grid grid-cols-3 gap-2">
                  {[
                    { label: '目標一', val: target1, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: '目標二', val: target2, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: '目標三', val: target3, color: 'text-purple-600', bg: 'bg-purple-50' },
                  ].map(({ label, val, color, bg }) => (
                    <div key={label} className={`${bg} rounded-lg p-3 text-center`}>
                      <div className={`text-xs font-medium mb-1 ${color}`}>{label}</div>
                      <div className={`flex items-center justify-center gap-1 font-bold ${color}`}>
                        <Target className="w-3 h-3" />
                        <span className="text-sm">{val?.toFixed(2) ?? '–'}</span>
                      </div>
                      {val && close > 0 && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          +{(((val - close) / close) * 100).toFixed(1)}%
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium text-sm transition-colors"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
