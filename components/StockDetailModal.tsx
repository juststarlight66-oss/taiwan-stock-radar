'use client';
import {
  ScanStock, DIMENSION_CONFIG,
  getStockName, getStockSector, getStockClose, getStockChangePct,
  getStockRecommendation, getStockReason, getStockDimensions,
  getStockEntryLow, getStockEntryHigh, getStockStopLoss,
  getStockTarget1, getStockTarget2, getStockTarget3,
} from '@/lib/scanTypes';
import { X, Target, Shield, TrendingUp, TrendingDown, ExternalLink, Share2, Check, Sparkles, Activity, Clock, CalendarDays, AlertTriangle } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

interface Props {
  stock: ScanStock;
  onClose: () => void;
  rank?: number;
  isDemo?: boolean;
  scanDate?: string; // e.g. "2026/05/08"
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
    return { bg: 'bg-sky-50', border: 'border-sky-400', text: 'text-sky-600', label: '逢低布局' };
  }
  return { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-600', label: '觀望' };
}

/** 解析 "2026/05/08" or "2026-05-08" -> Date (台灣時區 00:00) */
function parseScanDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  const clean = dateStr.replace(/\//g, '-');
  const d = new Date(clean + 'T00:00:00+08:00');
  return isNaN(d.getTime()) ? null : d;
}

/** 計算距掃描日已過幾個交易日（簡化：略過週末） */
function tradingDaysDiff(from: Date, to: Date): number {
  let count = 0;
  const cur = new Date(from);
  while (cur < to) {
    cur.setDate(cur.getDate() + 1);
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

/** 從今天起，往後加 N 個交易日（略過週末）*/
function addTradingDays(from: Date, days: number): Date {
  let count = 0;
  const cur = new Date(from);
  while (count < days) {
    cur.setDate(cur.getDate() + 1);
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return cur;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${dd}`;
}

/** 解析 hold_days "5~10" -> [5, 10]；"3" -> [3, 3] */
function parseHoldDays(holdDays: string | undefined): [number, number] | null {
  if (!holdDays) return null;
  const m = holdDays.match(/(\d+)\s*[~～-]\s*(\d+)/);
  if (m) return [parseInt(m[1]), parseInt(m[2])];
  const single = holdDays.match(/(\d+)/);
  if (single) { const n = parseInt(single[1]); return [n, n]; }
  return null;
}

export default function StockDetailModal({ stock, onClose, rank, isDemo, scanDate }: Props) {
  const [copied, setCopied] = useState(false);
  const [chartData, setChartData] = useState<{ time: string; price: number }[]>([]);

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
  const t1 = getStockTarget1(stock);
  const t2 = getStockTarget2(stock);
  const t3 = getStockTarget3(stock);
  const holdDays: string | undefined = stock.hold_days;
  const position: string | undefined = stock.position;

  const actionStyle = getActionStyle(rec);
  const isUp = (changePct ?? 0) >= 0;

  // ── 動態持有計算 ──
  const today = new Date();
  const scanDateObj = parseScanDate(scanDate);
  const parsedHold = parseHoldDays(holdDays);

  // 距離掃描已過的交易日
  const daysSinceScan = scanDateObj ? tradingDaysDiff(scanDateObj, today) : null;
  const isStale = daysSinceScan !== null && daysSinceScan >= 3;

  // 若今日進場，預計最早/最晚出場日
  let exitEarly: string | null = null;
  let exitLate: string | null = null;
  if (parsedHold) {
    exitEarly = formatDate(addTradingDays(today, parsedHold[0]));
    exitLate  = parsedHold[1] !== parsedHold[0] ? formatDate(addTradingDays(today, parsedHold[1])) : null;
  }

  // 如果已過部分持有天數（掃描後已過 N 天）
  let remainEarly: string | null = null;
  let remainLate: string | null = null;
  if (parsedHold && scanDateObj && daysSinceScan !== null && daysSinceScan > 0) {
    const remainMin = Math.max(0, parsedHold[0] - daysSinceScan);
    const remainMax = Math.max(0, parsedHold[1] - daysSinceScan);
    if (remainMin > 0) remainEarly = formatDate(addTradingDays(today, remainMin));
    if (remainMax > 0 && remainMax !== remainMin) remainLate = formatDate(addTradingDays(today, remainMax));
  }

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}?stock=${stock.stock_id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, [stock.stock_id]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    if (stock.intraday_data && Array.isArray(stock.intraday_data) && stock.intraday_data.length > 0) {
      setChartData(stock.intraday_data as { time: string; price: number }[]);
    } else if (stock.chart_data && Array.isArray(stock.chart_data) && stock.chart_data.length > 0) {
      setChartData(stock.chart_data as { time: string; price: number }[]);
    }
  }, [stock]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {rank && (
                  <span className="text-xs font-bold bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full">
                    #{rank}
                  </span>
                )}
                {isDemo && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Demo</span>
                )}
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${actionStyle.bg} ${actionStyle.border} ${actionStyle.text}`}>
                  {actionStyle.label}
                </span>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mt-1 truncate">
                {name}
                <span className="ml-2 text-sm font-normal text-gray-400">{stock.stock_id}</span>
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">{sector}</p>
            </div>
            <div className="text-right shrink-0">
              {close !== undefined && (
                <div className="text-2xl font-bold text-gray-900">{close.toLocaleString()}</div>
              )}
              {changePct !== undefined && (
                <div className={`flex items-center justify-end gap-1 text-sm font-semibold ${isUp ? 'text-red-500' : 'text-green-600'}`}>
                  {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {isUp ? '+' : ''}{changePct.toFixed(2)}%
                </div>
              )}
            </div>
          </div>
          {/* 操作按鈕 */}
          <div className="flex gap-2 mt-3">
            <a
              href={`https://tw.stock.yahoo.com/quote/${stock.stock_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              <ExternalLink size={12} /> Yahoo 即時報價
            </a>
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              {copied ? <Check size={12} className="text-green-500" /> : <Share2 size={12} />}
              {copied ? '已複製！' : '分享'}
            </button>
            <button onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <X size={18} className="text-gray-500" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* ── AI 白話文分析 ── */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-indigo-500" />
                <span className="text-sm font-semibold text-indigo-700">AI 分析摘要</span>
              </div>
              {scanDate && (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <CalendarDays size={11} />
                  <span>掃描日 {scanDate}</span>
                </div>
              )}
            </div>

            {/* 時效警告 */}
            {isStale && daysSinceScan !== null && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                <span className="text-xs text-amber-700">
                  距掃描已過 <strong>{daysSinceScan}</strong> 個交易日，請重新確認最新走勢後再決策
                </span>
              </div>
            )}

            {reason ? (
              <p className="text-sm text-gray-700 leading-relaxed">{reason}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">暫無 AI 分析資料</p>
            )}
          </div>

          {/* ── 建議持有期間（動態） ── */}
          {(holdDays || position) && (
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={15} className="text-emerald-600" />
                <span className="text-sm font-semibold text-emerald-700">建議持有期間</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {holdDays && (
                  <div className="bg-white rounded-lg p-3 border border-emerald-100">
                    <div className="text-xs text-gray-400 mb-1">持有天數</div>
                    <div className="text-lg font-bold text-emerald-700">{holdDays} 個交易日</div>
                  </div>
                )}
                {position && (
                  <div className="bg-white rounded-lg p-3 border border-emerald-100">
                    <div className="text-xs text-gray-400 mb-1">建議部位</div>
                    <div className="text-sm font-semibold text-gray-700 leading-snug">{position}</div>
                  </div>
                )}
              </div>

              {/* 若今日進場，預計出場日 */}
              {exitEarly && (
                <div className="mt-3 bg-white rounded-lg p-3 border border-emerald-100">
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1.5">
                    <CalendarDays size={11} />
                    <span>若今日（{formatDate(today)}）進場</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500">預計出場：</span>
                    <span className="text-sm font-bold text-emerald-700">
                      {exitEarly}{exitLate ? ` ~ ${exitLate}` : ''}
                    </span>
                  </div>
                  {/* 若掃描後已過幾天，顯示剩餘持有天數 */}
                  {daysSinceScan !== null && daysSinceScan > 0 && remainEarly && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap border-t border-gray-100 pt-2">
                      <span className="text-xs text-amber-600">若現在進場（已過{daysSinceScan}交易日）剩餘目標：</span>
                      <span className="text-sm font-bold text-amber-700">
                        {remainEarly}{remainLate ? ` ~ ${remainLate}` : ''}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── 進出場策略 ── */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-2 mb-3">
              <Target size={15} className="text-gray-600" />
              <span className="text-sm font-semibold text-gray-700">進出場策略</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(entryLow || entryHigh) && (
                <div className="col-span-2 bg-blue-50 rounded-lg p-3 border border-blue-100">
                  <div className="text-xs text-blue-500 mb-1">建議進場區間</div>
                  <div className="text-base font-bold text-blue-700">
                    {entryLow && entryHigh && entryLow !== entryHigh
                      ? `${entryLow} ~ ${entryHigh}`
                      : (entryLow || entryHigh)?.toLocaleString()}
                  </div>
                </div>
              )}
              {stopLoss && (
                <div className="bg-red-50 rounded-lg p-3 border border-red-100 flex items-center gap-2">
                  <Shield size={14} className="text-red-400 shrink-0" />
                  <div>
                    <div className="text-xs text-red-400">停損</div>
                    <div className="text-base font-bold text-red-600">{stopLoss.toLocaleString()}</div>
                  </div>
                </div>
              )}
              {t1 && (
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                  <div className="text-xs text-emerald-500">目標①</div>
                  <div className="text-base font-bold text-emerald-700">{t1.toLocaleString()}</div>
                </div>
              )}
              {t2 && (
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                  <div className="text-xs text-emerald-500">目標②</div>
                  <div className="text-base font-bold text-emerald-700">{t2.toLocaleString()}</div>
                </div>
              )}
              {t3 && (
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                  <div className="text-xs text-emerald-500">目標③</div>
                  <div className="text-base font-bold text-emerald-700">{t3.toLocaleString()}</div>
                </div>
              )}
            </div>
          </div>

          {/* ── 五維評分 ── */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={15} className="text-gray-600" />
              <span className="text-sm font-semibold text-gray-700">五維評分</span>
              <span className="ml-auto text-lg font-bold text-indigo-600">{stock.total_score}分</span>
            </div>
            <div className="space-y-2">
              {DIMENSION_CONFIG.map((cfg) => {
                const val = dims[cfg.key as keyof typeof dims] ?? 0;
                const pct = Math.round((val / cfg.max) * 100);
                return (
                  <div key={cfg.key}>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{cfg.label}</span>
                      <span className="font-medium text-gray-700">{val}/{cfg.max}</span>
                    </div>
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${cfg.color}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 分時走勢圖（若有資料）── */}
          {chartData.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <div className="text-sm font-semibold text-gray-700 mb-3">分時走勢</div>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} width={48} />
                  <Tooltip
                    formatter={(v: number) => [v.toLocaleString(), '價格']}
                    labelStyle={{ fontSize: 11 }}
                    contentStyle={{ fontSize: 11, padding: '4px 8px' }}
                  />
                  {close && <ReferenceLine y={close} stroke="#6366f1" strokeDasharray="3 3" strokeWidth={1} />}
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke={isUp ? '#ef4444' : '#22c55e'}
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── 底部 padding ── */}
          <div className="h-2" />
        </div>
      </div>
    </div>
  );
}
