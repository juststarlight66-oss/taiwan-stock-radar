'use client';
import { useState } from 'react';
import {
  ScanStock,
  getStockEntryLow,
  getStockEntryHigh,
  getStockStopLoss,
  getStockTarget1,
  getStockTarget2,
  getStockDimensions,
} from '@/lib/scanTypes';
import StockDetailModal from './StockDetailModal';
import { WatchlistToggleBtn } from './WatchlistPanel';
import ScoreTrendChart from './ScoreTrendChart';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface Props {
  stocks: ScanStock[];
  scanDate?: string;
  scannedCount?: number;
  isDemo?: boolean;
  trendMap?: Record<string, { date: string; score: number }[]>;
}

const TOTAL_MAX = 110; // 40+40+10+10+10

function getActionColor(rec: string): string {
  if (!rec) return '';
  if (rec.includes('強力') || rec.includes('積極')) return 'bg-red-100 text-red-700';
  if (rec.includes('買進') || rec.includes('買入')) return 'bg-orange-100 text-orange-700';
  if (rec.includes('觀望') || rec.includes('持有')) return 'bg-gray-100 text-gray-600';
  if (rec.includes('減碼') || rec.includes('賣出')) return 'bg-green-100 text-green-700';
  return 'bg-blue-100 text-blue-700';
}

/** 分數條 — 白底版 */
function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color =
    pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-sky-500' : pct >= 35 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-bold text-gray-800 w-8 text-right">{Math.round(score)}</span>
    </div>
  );
}

/** 漲跌停徽章（台股：漲停紅、跌停綠） */
function LimitBadge({ changePct }: { changePct: number }) {
  if (Math.abs(changePct) < 9.5) return null;
  const up = changePct >= 0;
  return (
    <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${
      up ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'
    }`}>
      {up ? '漲停' : '跌停'}
    </span>
  );
}

/** 三關價：進場區間 / 目標價 / 停損 */
function ThreeKeyPrices({ s }: { s: ScanStock }) {
  const entryLow = getStockEntryLow(s);
  const entryHigh = getStockEntryHigh(s);
  const stopLoss = getStockStopLoss(s);
  const target1 = getStockTarget1(s);
  const target2 = getStockTarget2(s);
  if (!entryLow && !target1 && !stopLoss) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] mt-1">
      {(entryLow || entryHigh) && (
        <span>
          <span className="text-gray-400">進場 </span>
          <span className="text-amber-600 font-mono font-semibold">
            {entryLow?.toLocaleString()}
            {entryHigh && entryHigh !== entryLow ? `～${entryHigh.toLocaleString()}` : ''}
          </span>
        </span>
      )}
      {target1 && (
        <span>
          <span className="text-gray-400">目標 </span>
          <span className="text-red-600 font-mono font-semibold">{target1.toLocaleString()}</span>
          {target2 && <span className="text-red-500 font-mono">／{target2.toLocaleString()}</span>}
        </span>
      )}
      {stopLoss && (
        <span>
          <span className="text-gray-400">停損 </span>
          <span className="text-green-700 font-mono font-semibold">{stopLoss.toLocaleString()}</span>
        </span>
      )}
    </div>
  );
}

/** 金銀銅徽章 */
function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-xl leading-none select-none" title="第一名">🥇</span>;
  if (rank === 2) return <span className="text-xl leading-none select-none" title="第二名">🥈</span>;
  if (rank === 3) return <span className="text-xl leading-none select-none" title="第三名">🥉</span>;
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[11px] font-bold">
      {rank}
    </span>
  );
}

/** 五維雷達圖 — 純 SVG，無外部依賴 */
function RadarChart({ s }: { s: ScanStock }) {
  const dims = getStockDimensions(s);
  const axes = [
    { label: '技術', max: 40, value: dims.technical },
    { label: '基本', max: 40, value: dims.fundamental },
    { label: '籌碼', max: 10, value: dims.chips },
    { label: '消息', max: 10, value: dims.news },
    { label: '情緒', max: 10, value: dims.sentiment },
  ];
  const N = axes.length;
  const size = 130;
  const cx = size / 2;
  const cy = size / 2;
  const r = 48;
  const angle = (i: number) => (Math.PI * 2 * i) / N - Math.PI / 2;
  const levels = [0.25, 0.5, 0.75, 1.0];
  const levelPoints = (ratio: number) =>
    axes.map((_, i) => {
      const a = angle(i);
      return `${cx + r * ratio * Math.cos(a)},${cy + r * ratio * Math.sin(a)}`;
    }).join(' ');
  const dataPoints = axes.map((ax, i) => {
    const ratio = ax.max > 0 ? Math.min(ax.value / ax.max, 1) : 0;
    const a = angle(i);
    return `${cx + r * ratio * Math.cos(a)},${cy + r * ratio * Math.sin(a)}`;
  }).join(' ');
  const labelPos = (i: number) => {
    const a = angle(i);
    const lr = r + 16;
    return { x: cx + lr * Math.cos(a), y: cy + lr * Math.sin(a) };
  };
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {levels.map((lv) => (
          <polygon key={lv} points={levelPoints(lv)} fill="none" stroke="#e5e7eb" strokeWidth="0.8" />
        ))}
        {axes.map((_, i) => {
          const a = angle(i);
          return (
            <line key={i} x1={cx} y1={cy}
              x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)}
              stroke="#e5e7eb" strokeWidth="0.8" />
          );
        })}
        <polygon points={dataPoints}
          fill="rgba(59,130,246,0.18)" stroke="#3b82f6"
          strokeWidth="1.5" strokeLinejoin="round" />
        {axes.map((ax, i) => {
          const ratio = ax.max > 0 ? Math.min(ax.value / ax.max, 1) : 0;
          const a = angle(i);
          return (
            <circle key={i}
              cx={cx + r * ratio * Math.cos(a)}
              cy={cy + r * ratio * Math.sin(a)}
              r="2.5" fill="#3b82f6" />
          );
        })}
        {axes.map((ax, i) => {
          const pos = labelPos(i);
          return (
            <text key={i} x={pos.x} y={pos.y}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="9" fill="#6b7280" fontFamily="sans-serif">
              {ax.label}
            </text>
          );
        })}
      </svg>
      <div className="flex flex-wrap justify-center gap-x-2 gap-y-0.5 text-[9px] text-gray-500 mt-0.5 max-w-[140px]">
        {axes.map((ax) => (
          <span key={ax.label}>
            <span className="text-gray-400">{ax.label}</span>
            <span className="font-mono font-semibold text-gray-700 ml-0.5">{ax.value}</span>
            <span className="text-gray-300">/{ax.max}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Top10Table({ stocks, scanDate, scannedCount, isDemo, trendMap }: Props) {
  const [selectedStock, setSelectedStock] = useState<ScanStock | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap bg-gray-50">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              Top 10 強勢股
              {isDemo && (
                <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded font-normal">
                  示範資料
                </span>
              )}
            </h3>
            {scanDate && (
              <div className="text-[11px] text-gray-400 mt-0.5">
                掃描日期：{scanDate}
                {scannedCount && scannedCount > 0 ? `　共掃描 ${scannedCount.toLocaleString()} 檔` : ''}
              </div>
            )}
          </div>
        </div>

        {/* ── Mobile 列表 ── */}
        <div className="divide-y divide-gray-100 md:hidden">
          {stocks.map((s, idx) => {
            const rank = idx + 1;
            const name = s.stock_name ?? s.name ?? s.stock_id;
            const sector = s.sector_name ?? s.sector ?? '';
            const changePct = s.change_pct ?? 0;
            const isUp = changePct >= 0;
            const actionColor = getActionColor(s.recommendation ?? '');
            const isExpanded = expandedId === s.stock_id;
            return (
              <div key={s.stock_id}>
                <div
                  className="px-3 py-2.5 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : s.stock_id)}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 w-7 flex items-center justify-center pt-0.5">
                      <RankMedal rank={rank} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm text-gray-900">{name}</span>
                        <span className="text-xs text-gray-400">{s.stock_id}</span>
                        {sector && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-gray-200 text-gray-500">
                            {sector}
                          </span>
                        )}
                        {s.recommendation && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${actionColor}`}>
                            {s.recommendation}
                          </span>
                        )}
                        <LimitBadge changePct={changePct} />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {s.close != null && (
                          <span className="text-sm font-mono font-bold text-gray-900">
                            {s.close.toLocaleString()}
                          </span>
                        )}
                        {s.change_pct != null && (
                          <span className={`text-xs font-semibold flex items-center gap-0.5 ${
                            isUp ? 'text-red-500' : 'text-green-600'
                          }`}>
                            {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                            {Math.abs(changePct).toFixed(2)}%
                          </span>
                        )}
                      </div>
                      <ThreeKeyPrices s={s} />
                    </div>
                    <div className="flex-shrink-0 w-24">
                      <ScoreBar score={s.total_score} max={TOTAL_MAX} />
                    </div>
                  </div>
                </div>
                {/* 展開區 */}
                {isExpanded && (
                  <div className="px-3 pb-3 bg-gray-50 border-t border-gray-100">
                    <div className="flex flex-wrap gap-4 pt-3 items-start justify-around">
                      <div className="flex flex-col items-center">
                        <div className="text-[10px] text-gray-400 mb-1 font-medium">五維評分</div>
                        <RadarChart s={s} />
                      </div>
                      {trendMap?.[s.stock_id] && trendMap[s.stock_id].length > 1 && (
                        <div className="flex flex-col items-center">
                          <div className="text-[10px] text-gray-400 mb-1 font-medium">分數趨勢</div>
                          <ScoreTrendChart data={trendMap[s.stock_id]} width={130} height={60} />
                        </div>
                      )}
                    </div>
                    {s.reason && (
                      <p className="text-[11px] text-gray-600 mt-2 leading-relaxed">{s.reason}</p>
                    )}
                    <button
                      className="mt-2 text-[11px] text-blue-500 underline"
                      onClick={() => setSelectedStock(s)}
                    >
                      查看完整分析 →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Desktop 表格 ── */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-3 py-2 text-xs font-medium text-gray-500 w-10">#</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">股票</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">現價</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">漲跌</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">操作</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500 min-w-[120px]">評分</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500">三關價</th>
                <th className="px-3 py-2 text-xs font-medium text-gray-500 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stocks.map((s, idx) => {
                const rank = idx + 1;
                const name = s.stock_name ?? s.name ?? s.stock_id;
                const sector = s.sector_name ?? s.sector ?? '';
                const changePct = s.change_pct ?? 0;
                const isUp = changePct >= 0;
                const actionColor = getActionColor(s.recommendation ?? '');
                const isExpanded = expandedId === s.stock_id;
                return (
                  <>
                    <tr
                      key={s.stock_id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : s.stock_id)}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <RankMedal rank={rank} />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-gray-900">{name}</span>
                          <span className="text-xs text-gray-400">{s.stock_id}</span>
                        </div>
                        {sector && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-gray-200 text-gray-500 mt-0.5 inline-block">
                            {sector}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold text-gray-900">
                        {s.close != null ? s.close.toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {s.change_pct != null ? (
                          <span className={`font-semibold flex items-center gap-0.5 ${
                            isUp ? 'text-red-500' : 'text-green-600'
                          }`}>
                            {isUp ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                            {Math.abs(changePct).toFixed(2)}%
                            <LimitBadge changePct={changePct} />
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {s.recommendation && (
                          <span className={`text-xs px-2 py-0.5 rounded font-semibold ${actionColor}`}>
                            {s.recommendation}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <ScoreBar score={s.total_score} max={TOTAL_MAX} />
                      </td>
                      <td className="px-3 py-2.5">
                        <ThreeKeyPrices s={s} />
                      </td>
                      <td className="px-3 py-2.5">
                        <WatchlistToggleBtn stockId={s.stock_id} />
                      </td>
                    </tr>
                    {/* Desktop 展開區 */}
                    {isExpanded && (
                      <tr key={`${s.stock_id}-expanded`}>
                        <td colSpan={8} className="bg-gray-50 px-4 py-3 border-t border-gray-100">
                          <div className="flex flex-wrap gap-6 items-start">
                            <div className="flex flex-col items-center">
                              <div className="text-[10px] text-gray-400 mb-1 font-medium">五維評分雷達圖</div>
                              <RadarChart s={s} />
                            </div>
                            {trendMap?.[s.stock_id] && trendMap[s.stock_id].length > 1 && (
                              <div className="flex flex-col items-center">
                                <div className="text-[10px] text-gray-400 mb-1 font-medium">分數趨勢</div>
                                <ScoreTrendChart data={trendMap[s.stock_id]} width={180} height={70} />
                              </div>
                            )}
                            <div className="flex-1 min-w-[200px]">
                              {s.reason && (
                                <p className="text-xs text-gray-600 leading-relaxed mb-2">{s.reason}</p>
                              )}
                              <button
                                className="text-xs text-blue-500 underline"
                                onClick={(e) => { e.stopPropagation(); setSelectedStock(s); }}
                              >
                                查看完整分析 →
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedStock && (
        <StockDetailModal
          stock={selectedStock}
          onClose={() => setSelectedStock(null)}
        />
      )}
    </>
  );
}
