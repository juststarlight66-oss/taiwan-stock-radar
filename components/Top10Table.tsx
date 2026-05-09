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
import ScoreTrendChart from './ScoreTrendChart';
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
  if (a.includes('偏弱') || a.includes('weak') || a.includes('avoid')) {
    return { cls: 'text-gray-500', dot: 'bg-gray-300', label: '偏弱' };
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
    <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${
      up ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
    }`}>
      {up ? '漲停' : '跌停'}
    </span>
  );
}

interface Props {
  stocks: ScanStock[];
  scoreHistory?: Record<string, number[]>;
}

export default function Top10Table({ stocks, scoreHistory = {} }: Props) {
  const [selected, setSelected] = useState<ScanStock | null>(null);
  const [selectedRank, setSelectedRank] = useState<number>(1);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50 text-left">
              <th className="px-3 py-2 text-xs font-semibold text-gray-600 w-8">#</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-600">股票</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-600">族群</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-right">收盤價</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-600 text-right">漲跌幅</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-600">推薦</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-600">目標1</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-600">目標2</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-600">目標3</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-600">總分</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-600 hidden lg:table-cell">趨勢</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-600 hidden xl:table-cell">AI分析</th>
              <th className="px-3 py-2 text-xs font-semibold text-gray-600 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {stocks.map((s, idx) => {
              const name = getStockName(s);
              const sector = getStockSector(s);
              const close = getStockClose(s);
              const changePct = getStockChangePct(s);
              const rec = getStockRecommendation(s);
              const reason = getStockReason(s);
              const dims = getStockDimensions(s);
              const t1 = getStockTarget1(s);
              const t2 = getStockTarget2(s);
              const t3 = getStockTarget3(s);
              const actionStyle = getActionStyle(rec);
              const isUp = (changePct ?? 0) >= 0;
              const history = scoreHistory[s.stock_id] ?? [];

              return (
                <tr
                  key={s.stock_id}
                  className="hover:bg-blue-50 cursor-pointer transition-colors"
                  onClick={() => { setSelected(s); setSelectedRank(idx + 1); }}
                >
                  {/* # */}
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                      idx === 0 ? 'bg-yellow-100 text-yellow-700'
                      : idx === 1 ? 'bg-gray-100 text-gray-600'
                      : idx === 2 ? 'bg-orange-100 text-orange-600'
                      : 'bg-gray-50 text-gray-500'
                    }`}>{idx + 1}</span>
                  </td>

                  {/* 股票 */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <div>
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-bold text-gray-900 text-sm">{s.stock_id}</span>
                          {s.power_combo && <Flame className="w-3 h-3 text-orange-500" title="Power Combo" />}
                          <CopyBtn text={s.stock_id} />
                        </div>
                        <div className="text-xs text-gray-700 font-medium">{name}</div>
                      </div>
                    </div>
                  </td>

                  {/* 族群 */}
                  <td className="px-3 py-3">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">{sector}</span>
                  </td>

                  {/* 收盤價 */}
                  <td className="px-3 py-3 text-right">
                    <span className="font-mono font-bold text-gray-900 text-sm">
                      {close != null ? close.toFixed(2) : '—'}
                    </span>
                  </td>

                  {/* 漲跌幅 */}
                  <td className="px-3 py-3 text-right">
                    {changePct != null ? (
                      <div className="flex items-center justify-end gap-0.5">
                        {isUp
                          ? <ArrowUpRight className="w-3.5 h-3.5 text-red-500" />
                          : <ArrowDownRight className="w-3.5 h-3.5 text-green-600" />}
                        <span className={`font-mono font-bold text-sm ${
                          isUp ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {isUp ? '+' : ''}{changePct.toFixed(2)}%
                        </span>
                        <LimitBadge changePct={changePct} />
                      </div>
                    ) : <span className="text-gray-400">—</span>}
                  </td>

                  {/* 推薦 */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${actionStyle.dot}`} />
                      <span className={`text-sm ${actionStyle.cls}`}>{actionStyle.label}</span>
                    </div>
                  </td>

                  {/* 目標1/2/3 */}
                  <td className="px-3 py-3">
                    <span className="font-mono text-sm font-semibold text-orange-600">
                      {t1 != null ? t1.toFixed(0) : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-mono text-sm font-semibold text-red-500">
                      {t2 != null ? t2.toFixed(0) : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-mono text-sm font-semibold text-red-700">
                      {t3 != null ? t3.toFixed(0) : '—'}
                    </span>
                  </td>

                  {/* 總分 */}
                  <td className="px-3 py-3">
                    <ScoreBar score={s.total_score} max={100} />
                  </td>

                  {/* 趨勢 */}
                  <td className="px-3 py-3 hidden lg:table-cell">
                    {history.length >= 2
                      ? <ScoreTrendChart history={history} />
                      : <span className="text-gray-400 text-xs">—</span>}
                  </td>

                  {/* AI分析 */}
                  <td className="px-3 py-3 hidden xl:table-cell max-w-[200px]">
                    <p className="text-xs text-gray-700 leading-relaxed line-clamp-2">
                      {reason ?? '—'}
                    </p>
                  </td>

                  {/* 箭頭 */}
                  <td className="px-3 py-3">
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <StockDetailModal
          stock={selected}
          rank={selectedRank}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
