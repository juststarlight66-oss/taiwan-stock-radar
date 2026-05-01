'use client';
import { StockPerf, PerformanceData } from '@/lib/scanTypes';
import { TrendingUp, TrendingDown, Minus, Trophy } from 'lucide-react';

// ── 單格 T+N badge ────────────────────────────────────────
function PerfCell({ label, perf }: { label: string; perf: StockPerf }) {
  if (perf.pct === null) {
    return (
      <div className="flex flex-col items-center gap-0.5 min-w-[52px]">
        <span className="text-[9px] text-gray-400 font-medium">{label}</span>
        <span className="text-[10px] text-gray-300 font-mono">--</span>
      </div>
    );
  }

  const up = perf.win === true;
  const down = perf.win === false;
  const colorCls = up ? 'text-red-500' : down ? 'text-emerald-500' : 'text-gray-400';
  const bgCls    = up ? 'bg-red-50'   : down ? 'bg-emerald-50'    : 'bg-gray-50';
  const Icon     = up ? TrendingUp    : down ? TrendingDown        : Minus;

  return (
    <div className={`flex flex-col items-center gap-0.5 min-w-[52px] px-1.5 py-1 rounded-lg ${bgCls}`}>
      <span className="text-[9px] text-gray-500 font-medium">{label}</span>
      <div className={`flex items-center gap-0.5 ${colorCls}`}>
        <Icon className="w-2.5 h-2.5" />
        <span className="text-[11px] font-mono font-bold">
          {perf.pct >= 0 ? '+' : ''}{perf.pct.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

// ── 勝率 badge ────────────────────────────────────────────
export function WinRateBadge({ perfList }: { perfList: PerformanceData[] }) {
  // 計算 T+1、T+3、T+5 各自勝率
  function winRate(key: 't1' | 't3' | 't5') {
    const valid = perfList.filter(p => p[key].win !== null);
    if (valid.length === 0) return null;
    const wins = valid.filter(p => p[key].win === true).length;
    return Math.round((wins / valid.length) * 100);
  }

  const r1 = winRate('t1');
  const r3 = winRate('t3');
  const r5 = winRate('t5');

  if (r1 === null && r3 === null && r5 === null) return null;

  function rateColor(r: number | null) {
    if (r === null) return 'text-gray-400';
    if (r >= 70) return 'text-red-500 font-bold';
    if (r >= 50) return 'text-orange-500';
    return 'text-emerald-600';
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-sky-50 rounded-xl border border-sky-100">
      <Trophy className="w-3.5 h-3.5 text-sky-500 shrink-0" />
      <span className="text-[10px] text-sky-600 font-medium">Top 10 勝率</span>
      <div className="flex items-center gap-3 ml-1">
        {r1 !== null && (
          <span className="text-[10px]">
            <span className="text-gray-400">T+1 </span>
            <span className={rateColor(r1)}>{r1}%</span>
          </span>
        )}
        {r3 !== null && (
          <span className="text-[10px]">
            <span className="text-gray-400">T+3 </span>
            <span className={rateColor(r3)}>{r3}%</span>
          </span>
        )}
        {r5 !== null && (
          <span className="text-[10px]">
            <span className="text-gray-400">T+5 </span>
            <span className={rateColor(r5)}>{r5}%</span>
          </span>
        )}
      </div>
    </div>
  );
}

// ── 單股績效列（嵌入 StockRow 下方）─────────────────────────
export function PerformanceBadge({ perf, loading }: { perf: PerformanceData | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center gap-1 px-4 pb-2">
        <div className="w-2 h-2 rounded-full bg-sky-300 animate-pulse" />
        <span className="text-[9px] text-gray-400">查詢績效中...</span>
      </div>
    );
  }

  if (!perf) return null;

  const hasAnyData = perf.t1.pct !== null || perf.t3.pct !== null || perf.t5.pct !== null;
  const allPending = perf.t1.pct === null && perf.t3.pct === null && perf.t5.pct === null;

  if (allPending) {
    return (
      <div className="px-4 pb-2.5">
        <span className="text-[9px] text-gray-300 font-mono">T+1/T+3/T+5 尚未到期</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 pb-2.5 pt-0.5">
      <span className="text-[9px] text-gray-400 shrink-0">回測</span>
      <div className="flex items-center gap-1.5 flex-wrap">
        <PerfCell label="T+1" perf={perf.t1} />
        <PerfCell label="T+3" perf={perf.t3} />
        <PerfCell label="T+5" perf={perf.t5} />
      </div>
    </div>
  );
}
