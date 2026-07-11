'use client';

import { useState, useEffect } from 'react';
import { Trophy, Target, Calendar, TrendingUp, TrendingDown, Minus, BarChart3, Zap } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────

interface PredictionStock {
  stock_id: string;
  name: string;
  entry_price: number;
  change_pct?: number;
  sector?: string;
  market?: string;
  total_score?: number;
}

interface PredictionDay {
  scan_date: string;
  scan_type?: string;
  state?: string;
  weights?: Record<string, number>;
  top5?: PredictionStock[];
  top10?: PredictionStock[];
  top40?: PredictionStock[];
  t1_return: number | null;
  t3_return: number | null;
  t5_return: number | null;
  t1_check_date?: string | null;
  t3_check_date?: string | null;
  t5_check_date?: string | null;
  win: boolean | null;
}

interface BacktestProfile {
  name: string;
  win_rate: number;
  avg_return: number;
  total: number;
  wins: number;
}

interface BacktestComparison {
  generated_at: string;
  scan_dates_used: number;
  profiles: BacktestProfile[];
  baseline: BacktestProfile | null;
  top_profile: string | null;
}

const BASE = '/taiwan-stock-radar';

// ── Config ────────────────────────────────────────────────────────────────

export interface PredictionHistoryConfig {
  dataUrl: string;
  backtestUrl?: string;
  title: string;
  topKey: 'top5' | 'top10' | 'top40';
  headerIcon: React.ReactNode;
  headerAccent: string;        // bg class for header icon
  cardAccent: string;          // bg class for stat cards e.g. 'bg-sky-50 border-sky-100'
  barColor: string;            // positive bar color e.g. '#ef4444'
  showMarketState: boolean;
  showBacktest: boolean;
  emptyMessage: string;
}

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
  const barY = value >= 0 ? zero - barH : zero;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width={44} height={height} className="shrink-0">
        <line x1={12} y1={zero} x2={36} y2={zero} stroke="#e5e7eb" strokeWidth={0.5} />
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
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border min-w-[150px] ${accent}`}>
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-500 font-medium">{label}</p>
        <p className="text-base font-bold text-gray-800">{value}</p>
        {sub && <p className="text-[9px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

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

export default function PredictionHistory({ config }: { config: PredictionHistoryConfig }) {
  const [history, setHistory] = useState<PredictionDay[]>([]);
  const [backtest, setBacktest] = useState<BacktestComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetches: Promise<any>[] = [
      fetch(`${BASE}${config.dataUrl}`, { cache: 'no-store' }).then(r => r.json()),
    ];
    if (config.showBacktest && config.backtestUrl) {
      fetches.push(
        fetch(`${BASE}${config.backtestUrl}`, { cache: 'no-store' })
          .then(r => r.json())
          .catch(() => null)
      );
    }

    Promise.all(fetches)
      .then(([hist, bt]) => {
        setHistory(hist.slice(0, 60));
        if (bt) setBacktest(bt);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [config.dataUrl, config.backtestUrl, config.showBacktest]);

  const topKey = config.topKey;

  // ── Loading ───────────────────────────────────────────────────────────

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

  // ── Error ─────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <p className="text-[11px] text-gray-400">{config.emptyMessage}</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <p className="text-[11px] text-gray-400">{config.emptyMessage}</p>
      </div>
    );
  }

  // ── Computed stats ────────────────────────────────────────────────────

  const completed = history.filter((d) => d.win !== null);
  const pending = history.filter((d) => d.win === null);
  const wins = completed.filter((d) => d.win === true).length;
  const rate = completed.length > 0 ? (wins / completed.length) * 100 : 0;

  const avgT1 = completed.length > 0
    ? completed.reduce((s, d) => s + (d.t1_return ?? 0), 0) / completed.length
    : 0;
  const avgT3 = completed.length > 0
    ? completed.reduce((s, d) => s + (d.t3_return ?? 0), 0) / completed.length
    : 0;
  const avgT5 = completed.length > 0
    ? completed.reduce((s, d) => s + (d.t5_return ?? 0), 0) / completed.length
    : 0;

  // Market state breakdown (only for daily scan)
  const stateBreakdown = config.showMarketState
    ? (['bull', 'range', 'bear'] as const)
        .map((st) => {
          const sub = completed.filter((d) => d.state === st);
          if (sub.length === 0) return null;
          const w = sub.filter((d) => d.win).length;
          return { state: st, count: sub.length, wins: w, rate: (w / sub.length) * 100 };
        })
        .filter(Boolean) as { state: string; count: number; wins: number; rate: number }[]
    : [];

  // T+1 bar chart (last 30 completed)
  const barData = completed.slice(-30).reverse();
  const maxAbs = Math.max(...barData.map((d) => Math.abs(d.t1_return ?? 0)), 0.5);

  const green = (r: number) => (r >= 70 ? 'text-red-500 font-bold' : r >= 50 ? 'text-orange-500' : 'text-emerald-600');

  const latestDate = history[0]?.scan_date
    ? `${history[0].scan_date.slice(0, 4)}/${history[0].scan_date.slice(4, 6)}/${history[0].scan_date.slice(6)}`
    : '--';

  // Determine win rate accent
  const rateAccent = rate >= 70 ? 'bg-red-50 border-red-200' : rate >= 50 ? 'bg-orange-50 border-orange-200' : config.cardAccent;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {config.headerIcon}
          <h2 className="text-sm font-bold text-gray-800">{config.title}</h2>
          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
            {history.length} {completed.length > 0 ? `/ ${completed.length} 已驗證` : '天記錄'}
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
            label={config.topKey === 'top40' ? '整體勝率（Top 40平均）' : `整體勝率（${config.topKey === 'top5' ? 'Top 5' : 'Top 10'}）`}
            value={completed.length > 0 ? `${rate.toFixed(0)}%` : '--'}
            sub={`${wins}/${completed.length} 天獲利`}
            accent={rateAccent}
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
                  {sb.state === 'bull' ? '\u{1F7E2} \u591A\u982D' : sb.state === 'bear' ? '\u{1F534} \u7A7A\u982D' : '\u{1F7E1} \u76E4\u6574'}
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
              const barFill = val >= 0 ? config.barColor : '#10b981';
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
                          backgroundColor: barFill,
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
          <div className="flex items-center gap-3 mt-1.5 mb-2">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: config.barColor, opacity: 0.8 }} />
              <span className="text-[8px] text-gray-400">T+1 {'>'} 0</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500/80" />
              <span className="text-[8px] text-gray-400">T+1 {'<'} 0</span>
            </div>
          </div>
        </div>
      )}

      {/* Backtest Comparison (only for daily scan) */}
      {config.showBacktest && backtest && backtest.profiles && backtest.profiles.length > 0 && (
        <div className="px-5 pt-3 pb-0">
          <div className="rounded-xl border border-purple-100 bg-purple-50/30 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-3.5 h-3.5 text-purple-500" />
              <p className="text-[10px] text-purple-700 font-semibold">
                權重回測對比（{backtest.scan_dates_used} 天資料）
              </p>
              {backtest.top_profile && (
                <span className="text-[9px] text-purple-500 bg-purple-100 px-1.5 py-0.5 rounded-full">
                  最佳: {backtest.top_profile}
                </span>
              )}
            </div>
            <div className="space-y-1">
              {backtest.profiles.map((p) => {
                const isTop = backtest.top_profile === p.name;
                const isBase = p.name === 'baseline';
                return (
                  <div
                    key={p.name}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                      isTop ? 'bg-purple-100 border border-purple-200' :
                      isBase ? 'bg-white border border-purple-50' :
                      'bg-white/60'
                    }`}
                  >
                    <span className={`text-[10px] w-28 shrink-0 ${
                      isTop ? 'text-purple-800 font-bold' : 'text-gray-700'
                    }`}>
                      {p.name.replace(/-/g, ' ')}
                      {isBase && <span className="text-[8px] text-gray-400 ml-1">(current)</span>}
                    </span>
                    <div className="flex-1 relative h-5 bg-gray-100 rounded-full overflow-hidden min-w-[80px]">
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-400 to-purple-500 rounded-full transition-all"
                        style={{ width: `${Math.min(p.win_rate, 100)}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono font-bold text-gray-700">
                        {p.win_rate}%
                      </span>
                    </div>
                    <span className="text-[9px] text-gray-500 w-16 text-right font-mono">
                      {p.avg_return >= 0 ? '+' : ''}{p.avg_return}%
                    </span>
                    <span className="text-[8px] text-gray-400 w-12 text-right">
                      ({p.wins}/{p.total})
                    </span>
                    {isTop && <Zap className="w-3 h-3 text-amber-500 shrink-0" />}
                  </div>
                );
              })}
            </div>
            <p className="text-[8px] text-gray-400 mt-2 text-right">
              每週六自動更新 | 模擬用同一天全市場數據、不同權重組合重新評分 Top 10
            </p>
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
                {config.showMarketState && (
                  <th className="text-left px-3 py-2 text-gray-500 font-medium">市場</th>
                )}
                <th className="text-right px-3 py-2 text-gray-500 font-medium">T+1</th>
                <th className="text-right px-3 py-2 text-gray-500 font-medium">T+3</th>
                <th className="text-right px-3 py-2 text-gray-500 font-medium">T+5</th>
                <th className="text-center px-3 py-2 text-gray-500 font-medium">勝敗</th>
                <th className="text-left px-3 py-2 text-gray-500 font-medium hidden sm:table-cell">
                  {config.topKey === 'top40' ? 'Top 5 標的' : `Top 3 標的`}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {history.slice(0, 30).map((d) => {
                const stateLabel = config.showMarketState
                  ? (d.state === 'bull' ? '\u{1F7E2}' : d.state === 'bear' ? '\u{1F534}' : '\u{1F7E1}')
                  : '';
                const picks = (d[topKey] ?? []).slice(0, 3);
                const isWin = d.win === true;
                const isLoss = d.win === false;
                return (
                  <tr key={d.scan_date} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 text-gray-600 font-mono">
                      {d.scan_date.length === 8
                        ? `${d.scan_date.slice(4, 6)}/${d.scan_date.slice(6)}`
                        : d.scan_date.slice(5, 10).replace('-', '/')}
                    </td>
                    {config.showMarketState && <td className="px-3 py-2">{stateLabel}</td>}
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
                        {picks.map((s: PredictionStock) => (
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
