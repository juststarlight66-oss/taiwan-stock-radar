'use client';
import { useState } from 'react';
import {
  ScanStock, DIMENSION_CONFIG,
  getStockName, getStockSector, getStockClose, getStockChangePct,
  getStockRecommendation, getStockReason, getStockDimensions,
  getStockTarget1, getStockTarget2, getStockTarget3,
  getStockEntryLow, getStockEntryHigh, getStockStopLoss,
} from '@/lib/scanTypes';
import StockDetailModal from './StockDetailModal';
import { WatchlistToggleBtn } from './WatchlistPanel';
import { ChevronRight, ArrowUpRight, ArrowDownRight, Copy, Check, Flame } from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
} from 'recharts';

const DIM_LABELS: Record<string, string> = {
  technical: '技', fundamental: '基', news: '消', sentiment: '情', chips: '籌',
};
const DIM_MAXES: Record<string, number> = {
  technical: 40, fundamental: 40, news: 10, sentiment: 10, chips: 10,
};

function getActionStyle(action: string | undefined) {
  if (!action) return { cls: 'text-gray-500', dot: 'bg-gray-400', label: '—' };
  const a = action.toLowerCase();
  if (a.includes('★★★') || a.includes('strong') || a.includes('強力')) {
    return { cls: 'text-red-600 font-bold', dot: 'bg-red-500', label: '強力買進' };
  }
  if (a.includes('積極')) {
    return { cls: 'text-orange-500 font-bold', dot: 'bg-orange-500', label: '積極買進' };
  }
  if (a.includes('買進') || a.includes('buy')) {
    return { cls: 'text-orange-400 font-semibold', dot: 'bg-orange-400', label: '買進' };
  }
  if (a.includes('觀望') || a.includes('watch') || a.includes('hold')) {
    return { cls: 'text-gray-600', dot: 'bg-gray-400', label: '觀望' };
  }
  return { cls: 'text-emerald-600', dot: 'bg-emerald-500', label: action.split(' - ')[0] };
}

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color = pct >= 70 ? 'bg-violet-500' : pct >= 50 ? 'bg-sky-500' : pct >= 35 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-bold text-gray-800 w-8 text-right">{Math.round(score)}</span>
    </div>
  );
}

function MiniRadar({ dimensions }: { dimensions: Record<string, number> }) {
  const data = Object.entries(DIM_LABELS).map(([key, label]) => ({
    dim: label,
    value: Math.round(((dimensions[key] as number ?? 0) / (DIM_MAXES[key] ?? 10)) * 100),
  }));
  return (
    <ResponsiveContainer width={72} height={72}>
      <RadarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis dataKey="dim" tick={{ fontSize: 8, fill: '#374151' }} />
        <Radar dataKey="value" stroke="#0284c7" fill="#0284c7" fillOpacity={0.15} strokeWidth={1.5} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy} className="p-1 rounded hover:bg-gray-100 transition-colors" title="複製股票代號">
      {copied
        ? <Check className="w-3 h-3 text-emerald-500" />
        : <Copy className="w-3 h-3 text-gray-500 hover:text-gray-700" />}
    </button>
  );
}

function LimitBadge({ changePct }: { changePct: number }) {
  if (Math.abs(changePct) < 9.5) return null;
  const up = changePct >= 0;
  return (
    <span className={`text-[9px] px-1 py-0.5 rounded font-bold ml-1 ${
      up ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'
    }`}>
      {up ? '漲停' : '跌停'}
    </span>
  );
}

interface Props {
  stocks: ScanStock[];
}

export default function Top10Table({ stocks }: Props) {
  const [selected, setSelected] = useState<ScanStock | null>(null);
  const [expandedReason, setExpandedReason] = useState<string | null>(null);

  if (!stocks || stocks.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-400">
        暫無推薦資料
      </div>
    );
  }

  return (
    <>
      {selected && (
        <StockDetailModal stock={selected} onClose={() => setSelected(null)} />
      )}

      <div className="space-y-3">
        {stocks.map((s, idx) => {
          const name = getStockName(s);
          const sector = getStockSector(s);
          const close = getStockClose(s);
          const changePct = getStockChangePct(s);
          const reason = getStockReason(s);
          const target1 = getStockTarget1(s);
          const target2 = getStockTarget2(s);
          const target3 = getStockTarget3(s);
          const entryLow = getStockEntryLow(s);
          const entryHigh = getStockEntryHigh(s);
          const stopLoss = getStockStopLoss(s);
          const dims = getStockDimensions(s);
          const action = getStockRecommendation(s);
          const actionStyle = getActionStyle(action);
          const isUp = (changePct ?? 0) >= 0;
          const isExpanded = expandedReason === s.stock_id;

          return (
            <div
              key={s.stock_id}
              className="rounded-2xl border border-gray-200 bg-white hover:border-sky-300 hover:shadow-sm transition-all cursor-pointer"
              onClick={() => setSelected(s)}
            >
              {/* ── 上半：股票基本資訊 ── */}
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  {/* 左側：排名 + 股票資訊 */}
                  <div className="flex items-start gap-3">
                    {/* 排名 */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                      idx === 0 ? 'bg-amber-100 text-amber-700' :
                      idx === 1 ? 'bg-gray-100 text-gray-600' :
                      idx === 2 ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-50 text-gray-500'
                    }`}>
                      {idx + 1}
                    </div>

                    {/* 股票代號 + 名稱 */}
                    <div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-base font-bold text-gray-900 font-mono">{s.stock_id}</span>
                        <CopyBtn text={s.stock_id} />
                        <span className="text-sm font-semibold text-gray-700">{name}</span>
                        {s.power_combo && (
                          <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">
                            <Flame className="w-2.5 h-2.5" />強勢組合
                          </span>
                        )}
                        {changePct !== undefined && <LimitBadge changePct={changePct} />}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{sector}</span>
                        <span className={`text-xs font-semibold ${actionStyle.cls}`}>
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${actionStyle.dot} mr-1`} />
                          {actionStyle.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 右側：收盤價 + 漲跌幅 */}
                  <div className="text-right shrink-0">
                    <div className="text-xl font-bold font-mono text-gray-900">
                      {close !== undefined ? close.toLocaleString() : '—'}
                    </div>
                    {changePct !== undefined ? (
                      <div className={`flex items-center justify-end gap-0.5 text-sm font-bold ${
                        isUp ? 'text-red-500' : 'text-green-600'
                      }`}>
                        {isUp
                          ? <ArrowUpRight className="w-4 h-4" />
                          : <ArrowDownRight className="w-4 h-4" />}
                        {isUp ? '+' : ''}{changePct.toFixed(2)}%
                      </div>
                    ) : (
                      <div className="text-sm text-gray-400">—</div>
                    )}
                    <div className="text-xs text-gray-400 mt-0.5">總分 <span className="font-bold text-gray-700">{s.total_score}</span></div>
                  </div>
                </div>

                {/* AI 分析 reason */}
                {reason && (
                  <div className="mt-3">
                    <div
                      className={`text-xs text-gray-700 leading-relaxed bg-sky-50 border border-sky-100 rounded-xl px-3 py-2 ${
                        isExpanded ? '' : 'line-clamp-2'
                      }`}
                      onClick={(e) => { e.stopPropagation(); setExpandedReason(isExpanded ? null : s.stock_id); }}
                    >
                      <span className="font-semibold text-sky-700 mr-1">AI 分析：</span>
                      {reason}
                    </div>
                  </div>
                )}
              </div>

              {/* ── 下半：數據面板 ── */}
              <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                <div className="flex items-start gap-4 flex-wrap">

                  {/* 雷達圖（五維度） */}
                  <div className="shrink-0">
                    <MiniRadar dimensions={{
                      technical:   dims.technical,
                      fundamental: dims.fundamental,
                      news:        dims.news,
                      sentiment:   dims.sentiment,
                      chips:       dims.chips,
                    }} />
                  </div>

                  {/* 進場/停損/目標 */}
                  <div className="flex-1 min-w-[160px] space-y-1.5">
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">價格區間</div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500">進場</span>
                        <span className="font-mono font-semibold text-gray-800">
                          {entryLow !== undefined && entryHigh !== undefined
                            ? `${entryLow}–${entryHigh}`
                            : entryLow ?? entryHigh ?? '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">停損</span>
                        <span className="font-mono font-semibold text-green-700">
                          {stopLoss !== undefined ? stopLoss.toLocaleString() : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-orange-500">目標1</span>
                        <span className="font-mono font-semibold text-orange-600">
                          {target1 !== undefined ? target1.toLocaleString() : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-orange-600">目標2</span>
                        <span className="font-mono font-semibold text-orange-700">
                          {target2 !== undefined ? target2.toLocaleString() : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between col-span-2">
                        <span className="text-red-500">目標3</span>
                        <span className="font-mono font-semibold text-red-600">
                          {target3 !== undefined ? target3.toLocaleString() : '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 五維度分數長條 */}
                  <div className="flex-1 min-w-[140px] space-y-1">
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">維度評分</div>
                    {DIMENSION_CONFIG.map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 w-6 shrink-0">{label.slice(0,1)}</span>
                        <ScoreBar score={dims[key as keyof typeof dims] ?? 0} max={DIM_MAXES[key] ?? 10} />
                      </div>
                    ))}
                  </div>

                  {/* 右下：持倉建議 */}
                  <div className="shrink-0 text-right">
                    {s.hold_days && (
                      <div className="text-xs text-gray-500">持有 <span className="font-semibold text-gray-700">{s.hold_days}</span> 天</div>
                    )}
                    {s.position && (
                      <div className="text-[11px] text-gray-500 mt-0.5 max-w-[120px] text-right">{s.position}</div>
                    )}
                    <button
                      className="mt-2 flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-medium"
                      onClick={(e) => { e.stopPropagation(); setSelected(s); }}
                    >
                      詳細分析 <ChevronRight className="w-3 h-3" />
                    </button>
                    <WatchlistToggleBtn stock={s} className="mt-1" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
