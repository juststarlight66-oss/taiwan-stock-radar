'use client';
import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import {
  Activity, TrendingUp, BarChart3, Target, Radar as RadarIcon,
  GitFork, Clock, Info, ArrowUpRight, ArrowDownRight, Minus,
  CheckCircle, XCircle, AlertCircle, Trophy, Zap,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface EquityPoint { date: string; equity: number; }
interface StrategyData {
  strategy: string;
  win_rate: number;
  profit_factor: number;
  sharpe: number;
  max_drawdown: number;
  total_trades: number;
  best_entry_signal: string;
  equity_curve_data: EquityPoint[];
}
interface BacktestMapEntry {
  stock_id: string;
  date_range: string;
  data_rows: number;
  strategies: {
    ma_cross: StrategyData;
    breakout: StrategyData;
    pattern: StrategyData;
  };
}
interface Dimensions {
  technical: number;
  chips: number;
  fundamental: number;
  news: number;
  sentiment: number;
}
interface ExplosiveStock {
  stock_id: string;
  name: string;
  sector: string;
  close: number;
  change_pct: number;
  total_score: number;
  dimensions: Dimensions;
  strategy: {
    entry: number;
    stop_loss: number;
    target: number;
    target1?: number;
    target2?: number;
    target3?: number;
    upside: number;
    recommendation: string;
  };
  surge_probability?: number;
}
interface AllResult {
  stock_id: string;
  name: string;
  sector: string;
  close: number;
  change_pct: number;
  total_score: number;
  dimensions: Dimensions;
}
interface BacktestPeriodStock {
  stock_id: string;
  name: string;
  entry: number;
  close: number | null;
  return_pct: number | null;
  hit_target: boolean;
  hit_stoploss: boolean;
  pending: boolean;
}
interface BacktestPeriod {
  label: string;
  backtest_date: string;
  win_rate: number | null;
  avg_return: number | null;
  pending: boolean;
  stocks: BacktestPeriodStock[];
}
interface BacktestRecord {
  scan_date: string;
  periods: { T1: BacktestPeriod; T3: BacktestPeriod; T5: BacktestPeriod };
}
interface LatestData {
  scan_date: string;
  scanned_count: number;
  explosive_top5: ExplosiveStock[];
  backtest_map: Record<string, BacktestMapEntry>;
  all_results: AllResult[];
  market_trend?: string;
  trend_label?: string;
  bull_ratio?: number;
}
interface BacktestData {
  version: number;
  records: BacktestRecord[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const BASE = '/taiwan-stock-radar';

const STOCK_COLORS = ['#38bdf8', '#34d399', '#f59e0b', '#a78bfa', '#f87171'];
const STRATEGY_COLORS: Record<string, string> = {
  ma_cross: '#38bdf8',
  breakout: '#34d399',
  pattern: '#f59e0b',
};
const STRATEGY_LABELS: Record<string, string> = {
  ma_cross: '均線交叉',
  breakout: '突破策略',
  pattern: '形態識別',
};
const DIM_LABELS: Record<string, string> = {
  technical: '技術面',
  fundamental: '基本面',
  news: '消息面',
  sentiment: '市場情緒',
  chips: '籌碼面',
};
const DIM_COLORS: Record<string, string> = {
  technical: '#38bdf8',
  fundamental: '#34d399',
  news: '#f59e0b',
  sentiment: '#a78bfa',
  chips: '#f87171',
};
const DIM_MAX: Record<string, number> = {
  technical: 40,
  fundamental: 40,
  news: 10,
  sentiment: 10,
  chips: 10,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(v: number) { return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`; }
function fmtDate(s: string) {
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
  return s;
}
function shortDate(s: string) {
  const d = s.replace(/-/g, '');
  return d.length >= 8 ? `${d.slice(4, 6)}/${d.slice(6, 8)}` : s;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, accent, valueColor,
}: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; accent: string; valueColor: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${accent} relative overflow-hidden`}>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-[11px] text-gray-400 font-medium">{label}</span>
      </div>
      <div className={`text-xl font-bold font-mono ${valueColor}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-500 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function SectionHeader({ title, sub }: { title: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">{title}</h2>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Cumulative Return Curve ──────────────────────────────────────────────────

function CumulativeReturnChart({
  top5, backtestMap,
}: {
  top5: ExplosiveStock[];
  backtestMap: Record<string, BacktestMapEntry>;
}) {
  const [activeStrategy, setActiveStrategy] = useState<'ma_cross' | 'breakout' | 'pattern'>('ma_cross');

  // Build unified date axis and per-stock equity curves
  const { chartData, stocks } = useMemo(() => {
    const allDates = new Set<string>();
    const stockCurves: { id: string; name: string; points: Record<string, number> }[] = [];

    for (const stock of top5) {
      const entry = backtestMap[stock.stock_id];
      if (!entry) continue;
      const strat = entry.strategies[activeStrategy];
      if (!strat?.equity_curve_data?.length) continue;

      const points: Record<string, number> = {};
      for (const pt of strat.equity_curve_data) {
        const d = shortDate(pt.date);
        points[d] = Math.round((pt.equity - 1) * 1000) / 10; // convert to %
        allDates.add(d);
      }
      stockCurves.push({ id: stock.stock_id, name: stock.name, points });
    }

    const sortedDates = [...allDates].sort();
    const chartData = sortedDates.map((date) => {
      const row: Record<string, number | string> = { date };
      for (const sc of stockCurves) row[sc.id] = sc.points[date] ?? null!;
      return row;
    });

    return { chartData, stocks: stockCurves };
  }, [top5, backtestMap, activeStrategy]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <SectionHeader
        title={<><TrendingUp className="w-4 h-4 text-sky-500" />累積報酬曲線</>}
        sub="Top 5 推薦標的回測策略累積損益（以初始淨值 1.0 為基準，換算為 %）"
      />

      {/* Strategy selector */}
      <div className="flex gap-2 mb-4">
        {(['ma_cross', 'breakout', 'pattern'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setActiveStrategy(s)}
            className={`px-3 py-1 text-xs rounded-lg border transition-all font-medium ${
              activeStrategy === s
                ? 'bg-sky-50 text-sky-700 border-sky-300'
                : 'text-gray-500 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {STRATEGY_LABELS[s]}
          </button>
        ))}
      </div>

      {chartData.length === 0 ? (
        <div className="h-56 flex items-center justify-center text-gray-400 text-sm">
          此策略暫無曲線資料
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickFormatter={(v) => `${v}%`}
              width={48}
            />
            <Tooltip
              formatter={(v: number) => [`${v?.toFixed(1) ?? '—'}%`, '']}
              labelStyle={{ fontSize: 11 }}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {stocks.map((s, i) => (
              <Line
                key={s.id}
                type="monotone"
                dataKey={s.id}
                name={`${s.id} ${s.name}`}
                stroke={STOCK_COLORS[i % STOCK_COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Win Rate Heatmap by Sector ───────────────────────────────────────────────

function SectorWinRateHeatmap({ allResults }: { allResults: AllResult[] }) {
  const sectorData = useMemo(() => {
    const map: Record<string, { win: number; total: number; avgScore: number; scores: number[] }> = {};
    for (const s of allResults) {
      const sec = s.sector || '其他';
      if (!map[sec]) map[sec] = { win: 0, total: 0, avgScore: 0, scores: [] };
      map[sec].total++;
      map[sec].scores.push(s.total_score);
      // treat score >= 70 as "positive signal" (win)
      if (s.total_score >= 70) map[sec].win++;
    }
    return Object.entries(map)
      .map(([sector, d]) => ({
        sector,
        win: d.win,
        loss: d.total - d.win,
        total: d.total,
        winRate: Math.round((d.win / d.total) * 100),
        avgScore: Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length),
      }))
      .filter((d) => d.total >= 3)
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 16);
  }, [allResults]);

  const maxTotal = Math.max(...sectorData.map((d) => d.total));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <SectionHeader
        title={<><BarChart3 className="w-4 h-4 text-emerald-500" />族群勝率熱力圖</>}
        sub="以總分 ≥70 為強訊號，統計各族群強訊號比例與標的數量"
      />
      <div className="space-y-2">
        {sectorData.map((d) => {
          const barWidth = Math.round((d.total / maxTotal) * 100);
          const hue =
            d.winRate >= 50 ? '#34d399' :
            d.winRate >= 30 ? '#f59e0b' : '#f87171';
          return (
            <div key={d.sector} className="flex items-center gap-3">
              <div className="w-24 text-[11px] text-gray-600 font-medium truncate shrink-0 text-right">
                {d.sector}
              </div>
              <div className="flex-1 relative h-6 bg-gray-100 rounded-md overflow-hidden">
                {/* background bar showing total breadth */}
                <div
                  className="absolute inset-y-0 left-0 bg-gray-200 rounded-md"
                  style={{ width: `${barWidth}%` }}
                />
                {/* foreground bar showing win rate */}
                <div
                  className="absolute inset-y-0 left-0 rounded-md opacity-80"
                  style={{ width: `${d.winRate}%`, backgroundColor: hue }}
                />
                <div className="absolute inset-0 flex items-center px-2 gap-2">
                  <span className="text-[10px] font-bold text-gray-800 z-10">{d.winRate}%</span>
                  <span className="text-[9px] text-gray-500 z-10">
                    ✓{d.win} ✗{d.loss} ({d.total}檔)
                  </span>
                </div>
              </div>
              <div className="text-[10px] text-gray-400 w-14 text-right shrink-0 font-mono">
                均{d.avgScore}分
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Dimension Accuracy Stats ─────────────────────────────────────────────────

function DimensionAccuracyStats({ allResults }: { allResults: AllResult[] }) {
  const dimData = useMemo(() => {
    const dims = ['technical', 'fundamental', 'news', 'sentiment', 'chips'] as const;
    return dims.map((dim) => {
      const max = DIM_MAX[dim];
      let totalHigh = 0;
      let positiveReturn = 0; // stock has total_score >= 70 AND change_pct >= 0
      let total = 0;

      for (const s of allResults) {
        const dimScore = s.dimensions?.[dim] ?? 0;
        const pctOfMax = dimScore / max;
        // "dimension fired" = top 40% of max
        if (pctOfMax >= 0.6) {
          total++;
          // proxy for positive return: total_score >= 70 (strong buy) and price change positive
          if (s.change_pct >= 0) positiveReturn++;
          if (s.total_score >= 70) totalHigh++;
        }
      }

      const accuracy = total > 0 ? Math.round((positiveReturn / total) * 100) : 0;
      const strongRate = total > 0 ? Math.round((totalHigh / total) * 100) : 0;

      // Radar chart score (0-100 normalized)
      const radarScore = (dimScore: number) => Math.round((dimScore / max) * 100);
      const avgDimScore = total > 0
        ? allResults.reduce((a, s) => a + (s.dimensions?.[dim] ?? 0), 0) / allResults.length
        : 0;

      return {
        dim,
        label: DIM_LABELS[dim],
        color: DIM_COLORS[dim],
        total,
        positiveReturn,
        totalHigh,
        accuracy,
        strongRate,
        avgScore: Math.round(avgDimScore * 10) / 10,
        maxScore: max,
        radarValue: Math.round((avgDimScore / max) * 100),
      };
    });
  }, [allResults]);

  const radarData = dimData.map((d) => ({ subject: d.label, value: d.radarValue, fullMark: 100 }));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <SectionHeader
        title={<><Target className="w-4 h-4 text-purple-500" />各維度準確度分析</>}
        sub="高分維度（≥60% 滿分）觸發時，對應標的隔日正報酬比例及強力訊號率"
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar chart */}
        <div>
          <p className="text-[11px] text-gray-400 mb-2">五維平均分佈雷達圖</p>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: '#9ca3af' }} />
              <Radar name="平均分佈" dataKey="value" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.25} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Per-dimension accuracy bars */}
        <div className="space-y-3">
          {dimData.map((d) => (
            <div key={d.dim}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-xs font-medium text-gray-700">{d.label}</span>
                  <span className="text-[10px] text-gray-400">均{d.avgScore}/{d.maxScore}分</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-emerald-600 font-mono font-bold">{d.accuracy}%</span>
                  <span className="text-gray-400">隔日正報酬</span>
                </div>
              </div>
              <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                  style={{ width: `${d.accuracy}%`, backgroundColor: d.color, opacity: 0.75 }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full opacity-30"
                  style={{ width: `${d.strongRate}%`, backgroundColor: d.color }}
                />
              </div>
              <div className="flex justify-between mt-0.5 text-[9px] text-gray-400">
                <span>觸發 {d.total.toLocaleString()} 檔</span>
                <span>強訊號率 {d.strongRate}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Backtest Performance Table ───────────────────────────────────────────────

function BacktestPerformanceTable({ records }: { records: BacktestRecord[] }) {
  const completedRecords = records.filter((r) => !r.periods.T1.pending);

  if (completedRecords.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeader
          title={<><Activity className="w-4 h-4 text-amber-500" />歷史回測績效</>}
          sub="各期 T+1/T+3/T+5 實際報酬追蹤"
        />
        <div className="text-center py-10 text-gray-400 text-sm">暫無已結算回測記錄</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <SectionHeader
        title={<><Activity className="w-4 h-4 text-amber-500" />歷史回測績效</>}
        sub="各期 T+1/T+3/T+5 實際報酬追蹤（✓達標 ✗停損 — 待結算）"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 px-2 text-gray-500 font-medium">掃描日</th>
              <th className="text-right py-2 px-2 text-gray-500 font-medium">T+1 勝率</th>
              <th className="text-right py-2 px-2 text-gray-500 font-medium">T+1 均報酬</th>
              <th className="text-right py-2 px-2 text-gray-500 font-medium">T+3 勝率</th>
              <th className="text-right py-2 px-2 text-gray-500 font-medium">T+5 勝率</th>
              <th className="text-right py-2 px-2 text-gray-500 font-medium">個股明細</th>
            </tr>
          </thead>
          <tbody>
            {completedRecords.map((rec) => {
              const t1 = rec.periods.T1;
              const t3 = rec.periods.T3;
              const t5 = rec.periods.T5;
              return (
                <tr key={rec.scan_date} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="py-2 px-2 font-mono text-gray-700">{rec.scan_date}</td>
                  <td className="py-2 px-2 text-right">
                    {t1.win_rate != null ? (
                      <span className={`font-bold font-mono ${t1.win_rate >= 60 ? 'text-emerald-600' : t1.win_rate >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                        {t1.win_rate.toFixed(0)}%
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="py-2 px-2 text-right font-mono">
                    {t1.avg_return != null ? (
                      <span className={t1.avg_return >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                        {pct(t1.avg_return)}
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="py-2 px-2 text-right">
                    {t3.pending ? (
                      <span className="text-gray-400 text-[10px]">待結算</span>
                    ) : t3.win_rate != null ? (
                      <span className={`font-bold font-mono ${t3.win_rate >= 60 ? 'text-emerald-600' : t3.win_rate >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                        {t3.win_rate.toFixed(0)}%
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="py-2 px-2 text-right">
                    {t5.pending ? (
                      <span className="text-gray-400 text-[10px]">待結算</span>
                    ) : t5.win_rate != null ? (
                      <span className={`font-bold font-mono ${t5.win_rate >= 60 ? 'text-emerald-600' : t5.win_rate >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                        {t5.win_rate.toFixed(0)}%
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <div className="flex justify-end gap-0.5 flex-wrap">
                      {t1.stocks.slice(0, 5).map((s) => (
                        <span
                          key={s.stock_id}
                          title={`${s.stock_id} ${s.name}: ${s.return_pct != null ? pct(s.return_pct) : '待結'}`}
                          className={`inline-flex items-center text-[9px] px-1 py-0.5 rounded font-mono ${
                            s.pending ? 'bg-gray-100 text-gray-400' :
                            (s.return_pct ?? 0) >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                          }`}
                        >
                          {s.name}
                          {!s.pending && s.return_pct != null && ` ${pct(s.return_pct)}`}
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
  );
}

// ── Strategy Win Rate Bar Chart ──────────────────────────────────────────────

function StrategyWinRateChart({ top5, backtestMap }: { top5: ExplosiveStock[]; backtestMap: Record<string, BacktestMapEntry> }) {
  const data = useMemo(() => {
    return top5.map((stock) => {
      const entry = backtestMap[stock.stock_id];
      if (!entry) return null;
      return {
        name: `${stock.stock_id}\n${stock.name}`,
        shortName: stock.name,
        stockId: stock.stock_id,
        ma_cross: Math.round((entry.strategies.ma_cross?.win_rate ?? 0) * 100),
        breakout: Math.round((entry.strategies.breakout?.win_rate ?? 0) * 100),
        pattern: Math.round((entry.strategies.pattern?.win_rate ?? 0) * 100),
        trades: (entry.strategies.ma_cross?.total_trades ?? 0) +
                (entry.strategies.breakout?.total_trades ?? 0) +
                (entry.strategies.pattern?.total_trades ?? 0),
      };
    }).filter(Boolean) as {
      name: string; shortName: string; stockId: string;
      ma_cross: number; breakout: number; pattern: number; trades: number;
    }[];
  }, [top5, backtestMap]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <SectionHeader
        title={<><Zap className="w-4 h-4 text-amber-500" />策略勝率比較</>}
        sub="Top 5 標的三種回測策略勝率對比（%）"
      />
      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-gray-400 text-sm">暫無資料</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="shortName"
              tick={{ fontSize: 10, fill: '#6b7280' }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickFormatter={(v) => `${v}%`}
              width={40}
            />
            <Tooltip
              formatter={(v: number, name: string) => [`${v}%`, STRATEGY_LABELS[name] ?? name]}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
            />
            <Legend formatter={(v) => STRATEGY_LABELS[v] ?? v} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="ma_cross" fill={STRATEGY_COLORS.ma_cross} radius={[3, 3, 0, 0]} />
            <Bar dataKey="breakout" fill={STRATEGY_COLORS.breakout} radius={[3, 3, 0, 0]} />
            <Bar dataKey="pattern" fill={STRATEGY_COLORS.pattern} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Top5 Detail Cards ────────────────────────────────────────────────────────

function Top5Cards({ top5 }: { top5: ExplosiveStock[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <SectionHeader
        title={<><Trophy className="w-4 h-4 text-sky-500" />今日 Top 5 標的</>}
        sub="本日飆股雷達 Top 5 推薦，含各維度評分與策略建議"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {top5.map((s, i) => {
          const changePosive = s.change_pct >= 0;
          const dimEntries = Object.entries(s.dimensions ?? {}) as [keyof Dimensions, number][];
          return (
            <div
              key={s.stock_id}
              className="rounded-lg border border-gray-100 bg-gray-50 p-3 hover:border-sky-200 hover:bg-sky-50/30 transition-all"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="text-[10px] text-gray-400 font-mono">#{i + 1}</span>
                  <div className="font-bold text-gray-900 text-sm">{s.name}</div>
                  <div className="text-[10px] text-gray-500">{s.stock_id} · {s.sector}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-gray-900 text-sm">{s.close}</div>
                  <div className={`text-[11px] font-mono font-bold ${changePosive ? 'text-red-500' : 'text-green-600'}`}>
                    {changePosive ? '+' : ''}{s.change_pct.toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* Score bar */}
              <div className="mb-2">
                <div className="flex justify-between text-[10px] mb-0.5">
                  <span className="text-gray-500">總評分</span>
                  <span className="font-bold font-mono text-sky-600">{s.total_score.toFixed(1)}</span>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-400 rounded-full"
                    style={{ width: `${Math.min((s.total_score / 120) * 100, 100)}%` }}
                  />
                </div>
              </div>

              {/* Dimension mini bars */}
              <div className="space-y-0.5">
                {dimEntries.map(([dim, val]) => {
                  const max = DIM_MAX[dim] ?? 10;
                  const pctFill = Math.min((val / max) * 100, 100);
                  return (
                    <div key={dim} className="flex items-center gap-1.5">
                      <span className="text-[9px] text-gray-400 w-10 shrink-0">{DIM_LABELS[dim]}</span>
                      <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pctFill}%`, backgroundColor: DIM_COLORS[dim] }}
                        />
                      </div>
                      <span className="text-[9px] font-mono text-gray-500 w-6 text-right">{val}</span>
                    </div>
                  );
                })}
              </div>

              {/* Entry/target */}
              <div className="mt-2 pt-2 border-t border-gray-200 text-[9px] text-gray-500 space-y-0.5">
                <div className="flex justify-between">
                  <span>進場</span><span className="font-mono text-gray-700">{s.strategy.entry?.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span>目標</span><span className="font-mono text-emerald-600">{s.strategy.target?.toFixed(1)} (+{s.strategy.upside?.toFixed(1)}%)</span>
                </div>
                <div className="flex justify-between">
                  <span>停損</span><span className="font-mono text-red-500">{s.strategy.stop_loss?.toFixed(1)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function TrackingPage() {
  const [latestData, setLatestData] = useState<LatestData | null>(null);
  const [backtestData, setBacktestData] = useState<BacktestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState('');

  useEffect(() => {
    const tick = () =>
      setNow(new Date().toLocaleTimeString('zh-TW', {
        timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', second: '2-digit',
      }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [latestRes, backtestRes] = await Promise.all([
          fetch(`${BASE}/data/latest.json`),
          fetch(`${BASE}/data/backtest.json`),
        ]);
        if (!latestRes.ok) throw new Error(`latest.json: HTTP ${latestRes.status}`);
        const latest: LatestData = await latestRes.json();
        setLatestData(latest);

        if (backtestRes.ok) {
          const bt: BacktestData = await backtestRes.json();
          setBacktestData(bt);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '資料載入失敗');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Summary stats ──────────────────────────────────────────────────────────
  const summaryStats = useMemo(() => {
    if (!latestData) return null;
    const { backtest_map, all_results, scanned_count } = latestData;

    // Average win rate across all backtest strategies
    let totalWinRate = 0;
    let winRateCount = 0;
    let totalTrades = 0;
    for (const entry of Object.values(backtest_map)) {
      for (const strat of Object.values(entry.strategies)) {
        if (strat.win_rate > 0) { totalWinRate += strat.win_rate; winRateCount++; }
        totalTrades += strat.total_trades;
      }
    }
    const avgWinRate = winRateCount > 0 ? Math.round((totalWinRate / winRateCount) * 100) : 0;

    // Best sector by average score
    const sectorScores: Record<string, number[]> = {};
    for (const s of all_results) {
      if (!sectorScores[s.sector]) sectorScores[s.sector] = [];
      sectorScores[s.sector].push(s.total_score);
    }
    let bestSector = '—';
    let bestAvg = 0;
    for (const [sec, scores] of Object.entries(sectorScores)) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avg > bestAvg && scores.length >= 3) { bestAvg = avg; bestSector = sec; }
    }

    return { scanned_count, avgWinRate, bestSector, totalTrades };
  }, [latestData]);

  return (
    <div className="min-h-dvh bg-white text-gray-900 font-sans flex flex-col">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4">
          <div className="flex items-center h-14 gap-3 py-2">
            <a href={`${BASE}/`} className="flex items-center gap-2 shrink-0 group">
              <div className="relative w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center group-hover:bg-sky-500/30 transition-colors">
                <RadarIcon className="w-4 h-4 text-sky-400" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-bold text-gray-900 text-sm tracking-wide">台股雷達</span>
                <span className="text-gray-500 text-[10px] hidden sm:inline">Taiwan Stock Radar</span>
              </div>
              <span className="hidden sm:inline text-[9px] bg-sky-500/20 text-sky-600 border border-sky-500/30 px-1.5 py-0.5 rounded-full font-mono">v3.0</span>
            </a>

            <nav className="flex items-center gap-1 flex-1 overflow-x-auto">
              <a
                href={`${BASE}/`}
                className="px-3 py-1.5 text-xs font-medium rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all whitespace-nowrap flex items-center gap-1.5"
              >
                <Activity className="w-3.5 h-3.5" />每日推薦
              </a>
              <a
                href={`${BASE}/tracking`}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-sky-50 text-sky-700 border border-sky-300 whitespace-nowrap flex items-center gap-1.5"
              >
                <TrendingUp className="w-3.5 h-3.5" />追蹤儀表板
              </a>
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              {now && (
                <span className="text-gray-400 text-[11px] hidden md:flex items-center gap-1 font-mono">
                  <Clock className="w-3 h-3" />{now}
                </span>
              )}
              <a
                href="https://github.com/juststarlight66-oss/taiwan-stock-radar"
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="GitHub"
              >
                <GitFork className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-5">

        {/* Hero */}
        <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-900 via-gray-900 to-sky-950/30 px-5 py-5 relative overflow-hidden mb-5">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(56,189,248,0.06),transparent_60%)] pointer-events-none" />
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-sky-400" />
                推薦追蹤儀表板
                <span className="text-[10px] text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-full font-normal">即時統計</span>
              </h1>
              <p className="text-xs text-gray-400 mt-1">回測績效追蹤、族群勝率分析、各維度準確度統計</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {['累積報酬曲線', '族群勝率熱力圖', '維度準確度', '歷史回測'].map((t) => (
                  <span key={t} className="text-[10px] text-sky-300/80 bg-sky-500/8 border border-sky-500/15 px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            </div>
            {latestData && (
              <div className="text-right">
                <div className="text-[10px] text-gray-500 mb-1">最新掃描</div>
                <div className="text-base font-mono font-bold text-sky-400">{latestData.scan_date}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  共 <span className="text-gray-300 font-mono">{latestData.scanned_count?.toLocaleString()}</span> 檔
                </div>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
            <div className="h-72 rounded-xl bg-gray-100 animate-pulse" />
            <div className="h-72 rounded-xl bg-gray-100 animate-pulse" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-12 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-red-600 font-medium">資料載入失敗</p>
            <p className="text-xs text-red-400 mt-1">{error}</p>
          </div>
        ) : latestData ? (
          <div className="space-y-5">

            {/* Summary Cards */}
            {summaryStats && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  icon={<BarChart3 className="w-4 h-4 text-sky-400" />}
                  label="掃描標的數"
                  value={summaryStats.scanned_count?.toLocaleString() ?? '—'}
                  sub="本次全市場掃描"
                  accent="border-sky-500/20 bg-sky-500/5"
                  valueColor="text-sky-600"
                />
                <StatCard
                  icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
                  label="平均回測勝率"
                  value={`${summaryStats.avgWinRate}%`}
                  sub="三策略平均"
                  accent="border-emerald-500/20 bg-emerald-500/5"
                  valueColor="text-emerald-600"
                />
                <StatCard
                  icon={<Trophy className="w-4 h-4 text-amber-400" />}
                  label="最強族群"
                  value={summaryStats.bestSector}
                  sub="依平均分數排名"
                  accent="border-amber-500/20 bg-amber-500/5"
                  valueColor="text-amber-600"
                />
                <StatCard
                  icon={<Activity className="w-4 h-4 text-purple-400" />}
                  label="總回測交易次數"
                  value={summaryStats.totalTrades.toLocaleString()}
                  sub="三策略合計"
                  accent="border-purple-500/20 bg-purple-500/5"
                  valueColor="text-purple-600"
                />
              </div>
            )}

            {/* Top5 detail cards */}
            {latestData.explosive_top5?.length > 0 && (
              <Top5Cards top5={latestData.explosive_top5} />
            )}

            {/* Cumulative Return Curve */}
            {latestData.explosive_top5?.length > 0 && Object.keys(latestData.backtest_map ?? {}).length > 0 && (
              <CumulativeReturnChart
                top5={latestData.explosive_top5}
                backtestMap={latestData.backtest_map}
              />
            )}

            {/* Strategy win rate bar chart */}
            {latestData.explosive_top5?.length > 0 && Object.keys(latestData.backtest_map ?? {}).length > 0 && (
              <StrategyWinRateChart
                top5={latestData.explosive_top5}
                backtestMap={latestData.backtest_map}
              />
            )}

            {/* Sector Heatmap + Dimension Accuracy side by side on large screens */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {latestData.all_results?.length > 0 && (
                <SectorWinRateHeatmap allResults={latestData.all_results} />
              )}
              {latestData.all_results?.length > 0 && (
                <DimensionAccuracyStats allResults={latestData.all_results} />
              )}
            </div>

            {/* Backtest performance table */}
            {backtestData && (
              <BacktestPerformanceTable records={backtestData.records} />
            )}

          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-16 text-center">
            <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-sm text-gray-500">尚無資料</p>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 py-6 mt-4">
        <div className="max-w-screen-xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <RadarIcon className="w-4 h-4 text-sky-400" />
              <span className="text-sm font-semibold text-gray-700">台股雷達</span>
              <span className="text-[10px] text-gray-400">Taiwan Stock Radar v3.0</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-gray-500">
              <span>資料來源：TWSE OpenAPI</span>
              <span className="hidden sm:inline text-gray-300">|</span>
              <span>每日 19:00 自動更新（交易日）</span>
              <span className="hidden sm:inline text-gray-300">|</span>
              <a
                href="https://github.com/juststarlight66-oss/taiwan-stock-radar"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
              >
                <GitFork className="w-3 h-3" />GitHub
              </a>
            </div>
          </div>
          <p className="text-center text-[10px] text-gray-400 mt-3">
            本系統資料僅供參考，不構成任何投資建議。投資有風險，請審慎評估個人財務狀況。過去績效不代表未來獲利保證。
          </p>
        </div>
      </footer>
    </div>
  );
}
