'use client';
import { useState } from 'react';
import { ScanStock, DIMENSION_CONFIG } from '@/lib/scanTypes';
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

// Handle all Python recommendation formats:
// "★★★ Strong Recommend" / "強力買進" / "積極買進 ⚡ 中型部位" / "買進" / "觀望" / "偏弱"
function getActionStyle(action: string | undefined) {
  if (!action) return { cls: 'text-gray-400', dot: 'bg-gray-400', label: '—' };
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
    <button
      onClick={copy}
      className="p-1 rounded hover:bg-gray-100 transition-colors"
      title="複製股票代號"
    >
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
    // 台灣慣例：漲停紅底、跌停綠底
    <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${up ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-800'}`}>
      {up ? '漲停' : '跌停'}
    </span>
  );
}

interface Props {
  stocks: ScanStock[];
  scoreHistory?: Record<string, { date: string; score: number }[]>;
}

export default function Top10Table({ stocks, scoreHistory = {} }: Props) {
  const [selected, setSelected] = useState<ScanStock | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-700 w-8">#</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-700">股票</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-700">族群</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700">收盤價</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700">漲跌%</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-700 min-w-[100px]">評分</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-700">建議</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700">目標1</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700">目標2</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700">目標3</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-700">趨勢</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-700 hidden lg:table-cell">AI 分析</th>
              <th className="px-3 py-2.5 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {stocks.map((s, idx) => {
              const actionStyle = getActionStyle(s.strategy?.recommendation);
              // 台灣慣例：上漲紅色、下跌綠色
              const changePct = s.price?.change_pct ?? 0;
              const isUp = changePct >= 0;
              const changeColor = isUp ? 'text-red-600' : 'text-green-700';
              const changeBg = isUp ? 'bg-red-50' : 'bg-green-50';
              const ChangeIcon = isUp ? ArrowUpRight : ArrowDownRight;

              // 三關價
              const t1 = s.strategy?.target1;
              const t2 = s.strategy?.target2;
              const t3 = s.strategy?.target3;

              // 趨勢歷史
              const history = scoreHistory[s.code] ?? scoreHistory[s.stock_id] ?? [];

              return (
                <tr
                  key={s.code ?? s.stock_id}
                  className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                  onClick={() => setSelected(s)}
                >
                  {/* 排名 */}
                  <td className="px-3 py-2.5">
                    {idx < 3
                      ? <Flame className={`w-4 h-4 ${idx === 0 ? 'text-red-500' : idx === 1 ? 'text-orange-400' : 'text-amber-400'}`} />
                      : <span className="text-xs font-mono text-gray-500">{idx + 1}</span>
                    }
                  </td>

                  {/* 股票代號 + 名稱 */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <div>
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-bold text-gray-900 text-sm">{s.code ?? s.stock_id}</span>
                          <CopyBtn text={s.code ?? s.stock_id ?? ''} />
                        </div>
                        <div className="text-xs font-medium text-gray-700">{s.name}</div>
                      </div>
                    </div>
                  </td>

                  {/* 族群 */}
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-medium text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">
                      {s.sector ?? s.industry ?? '—'}
                    </span>
                  </td>

                  {/* 收盤價 */}
                  <td className="px-3 py-2.5 text-right">
                    <span className="font-mono font-bold text-gray-900 text-sm">
                      {s.price?.close != null ? s.price.close.toFixed(2) : '—'}
                    </span>
                  </td>

                  {/* 漲跌% — 台灣慣例：紅漲綠跌 */}
                  <td className="px-3 py-2.5 text-right">
                    <div className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold ${changeBg} ${changeColor}`}>
                      <ChangeIcon className="w-3 h-3" />
                      {Math.abs(changePct).toFixed(2)}%
                      <LimitBadge changePct={changePct} />
                    </div>
                  </td>

                  {/* 評分 + 雷達圖 */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {s.dimensions && <MiniRadar dimensions={s.dimensions} />}
                      <ScoreBar score={s.total_score ?? 0} max={110} />
                    </div>
                  </td>

                  {/* 建議 */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${actionStyle.dot} shrink-0`} />
                      <span className={`text-xs ${actionStyle.cls}`}>{actionStyle.label}</span>
                    </div>
                  </td>

                  {/* 三關價：目標1/2/3 */}
                  <td className="px-3 py-2.5 text-right">
                    <span className="font-mono text-xs font-semibold text-orange-600">
                      {t1 != null ? t1.toFixed(2) : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="font-mono text-xs font-semibold text-red-600">
                      {t2 != null ? t2.toFixed(2) : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="font-mono text-xs font-semibold text-red-700">
                      {t3 != null ? t3.toFixed(2) : '—'}
                    </span>
                  </td>

                  {/* 趨勢 */}
                  <td className="px-3 py-2.5">
                    {history.length >= 2
                      ? <ScoreTrendChart stockId={s.code ?? s.stock_id ?? ''} history={history} width={80} height={28} />
                      : <span className="text-xs text-gray-500 font-mono">—</span>
                    }
                  </td>

                  {/* AI 分析 */}
                  <td className="px-3 py-2.5 max-w-[220px] hidden lg:table-cell">
                    <p className="text-xs text-gray-800 leading-relaxed line-clamp-2">
                      {s.strategy?.narrative ?? s.strategy?.summary ?? '—'}
                    </p>
                  </td>

                  {/* 詳情箭頭 */}
                  <td className="px-3 py-2.5">
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <StockDetailModal stock={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
