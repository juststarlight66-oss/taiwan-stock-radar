'use client';

import { useState, useEffect } from 'react';
import { Trophy, Target, Calendar, TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────

interface PredictionDay {
  scan_date: string;
  state: string;
  weights: Record<string, number>;
  top10: PredictionStock[];
  t1_return: number | null;
  t3_return: number | null;
  t5_return: number | null;
  win: boolean | null;
}

interface PredictionStock {
  stock_id: string;
  name: string;
  entry_price: number;
  change_pct: number;
  sector: string;
}

const BASE = '/taiwan-stock-radar';

// ── Mini SVG Bar ─────────────────────────────────────────────────────────

function MiniBar({
  label,
  value,
  color,
  maxAbs,
  height = 52,
}: {
  label: string;
  value: number | null;
  color: string;
  maxAbs: number;
  height?: number;
}) {
  if (value === null) return null;
  const barPad = 8;
  const usable = height - barPad * 2;
  const zero = usable / 2 + barPad;
  const scale = maxAbs > 0 ? (usable / 2) / maxAbs : 1;
  const barH = Math.max(Math.abs(value * scale), 1);
  const y = value >= 0 ? zero - barH : zero;
  const barY = value >= 0 ? zero - barH : zero;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width={44} height={height} className="shrink-0">
        {/* baseline */}
        <line x1={12} y1={zero} x2={36} y2={zero} stroke="#e5e7eb" strokeWidth={0.5} />
        {/* bar */}
        <rect
          x={14}
          y={barY}
          width={16}
          height={barH}
          rx={2}
          fill={color}
          opacity={0.85}
        />
      </svg>
      <span className="text-[9px] text-gray-500">{label}</span>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border min-w-[160px] ${accent}`}
    >
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-500 font-medium">{label}</p>
        <p className="text-base font-bold text-gray-800">{value}</p>
        {sub && <p className="text-[9px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Return Badge ──────────────────────────────────────────────────────────

function ReturnBadge({ value, period }: { value: number | null; period: string }) {
  if (value === null) {
    return (
      <div className="flex flex-col items-center min-w-[46px]">
        <span className="text-[8px] text-gray-400">{period}</span>
        <span className="text-[10px] text-gray-300">--</span>
      </div>
    );
  }
  const up = value > 0;
  const color = up ? 'text-red-500' : value < 0 ? 'text-emerald-600' : 'text-gray-400';
  const bg = up ? 'bg-red-50' : value < 0 ? 'bg-emerald-50' : 'bg-gray-50';
  const Icon = up ? TrendingUp : value < 0 ? TrendingDown : Minus;
  return (
    <div className={`flex flex-col items-center min-w-[46px] px-1 py-1 rounded-md ${bg}`}>
      <span className="text-[8px] text-gray-500">{period}</span>
      <div className={`flex items-center gap-0.5 ${color}`}>
        <Icon className="w-2.5 h-2.5" />
        <span className="text-[10px] font-mono font-bold">
          {value >= 0 ? '+' : ''}{value.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export default function PredictionsDashboard() {
  const [history, setHistory] = useState<PredictionDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/data/predictions_history.json`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: PredictionDay[]) => {
        setHistory(data.slice(0, 60)); // last 60 trading days
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-4 rounded-full bg-sky-200 animate-pulse" />
          <div className="h-4 w-36 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="flex gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 flex-1 bg-gray-50 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <p className="text-[11px] text-gray-400">
          預測追蹤數據將於下一個交易日後自動生成
        </p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <p className="text-[11px] text-gray-400">
          尚無預測追蹤數據，每日掃描後會自動記錄。
        </p>
      </div>
    );
  }

  const completed = history.filter((d) => d.win !== null);
  const pending = history.filter((d) => d.win === null);
  const wins = completed.filter((d) => d.win === true).length;
  const rate = completed.length > 0 ? (wins / completed.length) * 100 : 0;

  const avgT1 =
    completed.length > 0
      ? completed.reduce((s, d) => s + (d.t1_return ?? 0), 0) / completed.length
      : 0;
  const avgT3 =
    completed.length > 0
      ? completed.reduce((s, d) => s + (d.t3_return ?? 0), 0) / completed.length
      : 0;
  const avgT5 =
    completed.length > 0
      ? completed.reduce((s, d) => s + (d.t5_return ?? 0), 0) / completed.length
      : 0;

  // Market state breakdown
  const states = ['bull', 'range', 'bear'] as const;
  const stateBreakdown = states
    .map((st) => {
      const sub = completed.filter((d) => d.state === st);
      if (sub.length === 0) return null;
      const w = sub.filter((d) => d.win).length;
      return { state: st, count: sub.length, wins: w, rate: (w / sub.length) * 100 };
    })
    .filter(Boolean) as { state: string; count: number; wins: number; rate: number }[];

  // Mini bar chart: daily T+1 returns (last 30)
  const barData = completed.slice(-30).reverse();
  const maxAbs = Math.max(
    ...barData.map((d) => Math.abs(d.t1_return ?? 0)),
    0.5
  );

  // Ranking by win rate by market state
  const green = (r: number) => (r >= 70 ? 'text-red-500 font-bold' : r >= 50 ? 'text-orange-500' : 'text-emerald-600');

  // Latest scan date
  const latestDate = history[0]?.scan_date
    ? `${history[0].scan_date.slice(0, 4)}/${history[0].scan_date.slice(4, 6)}/${history[0].scan_date.slice(6)}`
    : '--';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-bold text-gray-800">Top 10 預測追蹤</h2>
          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
            {history.length} 天記錄
          </span>
        </div>
        <span className="text-[10px] text-gray-400">
          最新: {latestDate}
        </span>
      </div>

      {/* Summary Stat Cards */}
      <div className="p-5 pb-1 space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <StatCard
            icon={<Target className="w-4 h-4 text-sky-500" />}
            label="整體勝率"
            value={completed.length > 0 ? `${rate.toFixed(0)}%` : '--'}
            sub={`${wins}/${completed.length} 天獲利`}
            accent={rate >= 70 ? 'bg-red-50 border-red-200' : rate >= 50 ? 'bg-orange-50 border-orange-200' : 'bg-sky-50 border-sky-100'}
          />
          <StatCard
            icon={<TrendingUp className="w-4 h-4 text-red-500" />}
            label="平均 T+1"
            value={completed.length > 0 ? `${avgT1 >= 0 ? '+' : ''}${avgT1.toFixed(2)}%` : '--'}
            accent="bg-red-50/60 border-red-100"
          />
          <StatCard
            icon={<BarChart3 className="w-4 h-4 text-amber-500" />}
            label="平均 T+3"
            value={completed.length > 0 ? `${avgT3 >= 0 ? '+' : ''}${avgT3.toFixed(2)}%` : '--'}
            accent="bg-amber-50 border-amber-100"
          />
          <StatCard
            icon={<Calendar className="w-4 h-4 text-emerald-500" />}
            label="待驗證"
            value={`${pending.length} 天`}
            sub="等待 T+1 收盤"
            accent="bg-gray-50 border-gray-100"
          />
        </div>

        {/* Market State Breakdown */}
        {stateBreakdown.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {stateBreakdown.map((sb) => (
              <div
                key={sb.state}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-100 bg-gray-50/50"
              >
                <span className="text-[10px] text-gray-600 font-medium">
                  {sb.state === 'bull' ? '🟢 多頭' : sb.state === 'bear' ? '🔴 空頭' : '🟡 盤整'}
                </span>
                <span className={`text-[11px] font-mono font-bold ${green(sb.rate)}`}>
                  {sb.rate.toFixed(0)}%
                </span>
                <span className="text-[9px] text-gray-400">
                  ({sb.wins}/{sb.count})
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* T+1 Daily Bar Chart */}
      {barData.length >= 3 && (
        <div className="px-5 pt-4 pb-0">
          <p className="text-[10px] text-gray-500 font-medium mb-2">每日 T+1 報酬（近 {barData.length} 天）</p>
          <div className="flex items-end gap-0.5 overflow-x-auto" style={{ height: 60 }}>
            {barData.map((d) => {
              const val = d.t1_return ?? 0;
              const barColor = val >= 0 ? '#ef4444' : '#10b981';
              const h = maxAbs > 0 ? Math.max(Math.abs(val / maxAbs) * 48, 1) : 1;
              const baseline = 52;
              return (
                <div key={d.scan_date} className="flex flex-col items-center shrink-0" style={{ width: 28 }}>
                  <div className="relative" style={{ height: baseline }}>
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
                      <div
                        className="w-4 rounded-t-sm"
                        style={{
                          height: `${h}px`,
                          backgroundColor: barColor,
                          opacity: 0.8,
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-[7px] text-gray-400 mt-0.5">
                    {d.scan_date.slice(4, 6)}/{d.scan_date.slice(6)}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-3 mt-1.5 mb-2">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500/80" />
              <span className="text-[8px] text-gray-400">T+1 &gt; 0</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500/80" />
              <span className="text-[8px] text-gray-400">T+1 &lt; 0</span>
            </div>
          </div>
        </div>
      )}

      {/* History Table */}
      <div className="px-5 pt-2 pb-5">
        <p className="text-[10px] text-gray-500 font-medium mb-2">最近預測記錄</p>
        <div className="overflow-x-auto max-h-[360px] overflow-y-auto rounded-xl border border-gray-100">
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 text-gray-500 font-medium">日期</th>
                <th className="text-left px-3 py-2 text-gray-500 font-medium">市場</th>
                <th className="text-right px-3 py-2 text-gray-500 font-medium">T+1</th>
                <th className="text-right px-3 py-2 text-gray-500 font-medium">T+3</th>
                <th className="text-right px-3 py-2 text-gray-500 font-medium">T+5</th>
                <th className="text-center px-3 py-2 text-gray-500 font-medium">勝敗</th>
                <th className="text-left px-3 py-2 text-gray-500 font-medium hidden sm:table-cell">
                  Top 3 標的
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {history.slice(0, 30).map((d) => {
                const stateLabel =
                  d.state === 'bull' ? '🟢' : d.state === 'bear' ? '🔴' : '🟡';
                const top3 = d.top10?.slice(0, 3) ?? [];
                const isWin = d.win === true;
                const isLoss = d.win === false;
                return (
                  <tr key={d.scan_date} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 text-gray-600 font-mono">
                      {d.scan_date.slice(4, 6)}/{d.scan_date.slice(6)}
                    </td>
                    <td className="px-3 py-2">{stateLabel}</td>
                    <td className="px-3 py-2 text-right">
                      <ReturnBadge value={d.t1_return} period="" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <ReturnBadge value={d.t3_return} period="" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <ReturnBadge value={d.t5_return} period="" />
                    </td>
                    <td className="px-3 py-2 text-center">
                      {isWin ? (
                        <span className="inline-flex items-center gap-1 text-red-500 font-bold text-[10px]">
                          <TrendingUp className="w-3 h-3" /> WIN
                        </span>
                      ) : isLoss ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-[10px]">
                          <TrendingDown className="w-3 h-3" /> LOSS
                        </span>
                      ) : (
                        <span className="text-gray-300 text-[10px]">--</span>
                      )}
                    </td>
                    <td className="px-3 py-2 hidden sm:table-cell">
                      <div className="flex items-center gap-1.5 flex-wrap max-w-[200px]">
                        {top3.map((s) => (
                          <span
                            key={s.stock_id}
                            className="text-[9px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded"
                          >
                            {s.stock_id} {s.name.replace('股份有限公司', '')}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
