'use client';
import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import {
  Activity, TrendingUp, BarChart3, Target, Radar as RadarIcon,
  GitFork, AlertCircle, Trophy, Zap,
} from 'lucide-react';
import TopNav from '@/components/TopNav';

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
    rsi_div: StrategyData;
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
    entry?: number;
    entry_low?: number;
    entry_high?: number;
    stop_loss: number;
    target?: number;
    target1?: number;
    target2?: number;
    target3?: number;
    upside: number;
    recommendation?: string;
  };
  surge_probability?: number;
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
  top10: ExplosiveStock[];
  total_stocks?: number;
  market_trend?: string;
  trend_label?: string;
  bull_ratio?: number;
}
interface AllScoresData {
  scan_date: string;
  scanned_count: number;
  all_stock_scores: ExplosiveStock[];
}
interface BacktestData {
  version: number;
  grouped_records: BacktestRecord[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const BASE = '/taiwan-stock-radar';

const STOCK_COLORS = ['#38bdf8', '#34d399', '#f59e0b', '#a78bfa', '#f87171'];
const STRATEGY_COLORS: Record<string, string> = {
  ma_cross: '#38bdf8',
  breakout: '#34d399',
  pattern: '#f59e0b',
  rsi_div: '#f59e0b',
};
const STRATEGY_LABELS: Record<string, string> = {
  ma_cross: '均線交叉',
  breakout: '突破策略',
  pattern: '形態識別',
  rsi_div: 'RSI 背離',
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

function pct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}
function shortDate(s: string) {
  const d = s.replace(/-/g, '');
  return d.length >= 8 ? `${d.slice(4, 6)}/${d.slice(6, 8)}` : s;
}
function fmtRate(v: number | null): string {
  if (v == null) return '待結算';
  return `${(v * 100).toFixed(1)}%`;
}
function fmtReturn(v: number | null): string {
  if (v == null) return '待結算';
  return pct(v);
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, accent, valueColor,
}: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; accent: string; valueColor: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${accent} bg-gray-900/60`}>
      <div className="flex items-center gap-2 mb-2 text-gray-400 text-sm">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function Top5Cards({ stocks }: { stocks: ExplosiveStock[] }) {
  const top5 = stocks.slice(0, 5);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      {top5.map((s, i) => {
        const entryLow = s.strategy.entry_low ?? s.strategy.entry ?? 0;
        const entryHigh = s.strategy.entry_high ?? s.strategy.entry ?? 0;
        const target = s.strategy.target1 ?? s.strategy.target ?? 0;
        return (
          <div key={s.stock_id} className="rounded-xl border border-gray-700 bg-gray-900/80 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg font-bold" style={{ color: STOCK_COLORS[i] }}>#{i + 1}</span>
              <span className="font-semibold text-white">{s.stock_id}</span>
              <span className="text-xs text-gray-400 truncate">{s.name}</span>
            </div>
            <div className="text-xs text-gray-500 mb-2">{s.sector}</div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">總分</span>
                <span className="text-yellow-400 font-bold">{s.total_score?.toFixed(1) ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">收盤</span>
                <span className="text-white">{s.close?.toFixed(2) ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">漲跌</span>
                <span className={s.change_pct >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {pct(s.change_pct)}
                </span>
              </div>
              {entryLow > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-400">進場區</span>
                  <span className="text-sky-400">{entryLow.toFixed(2)}–{entryHigh.toFixed(2)}</span>
                </div>
              )}
              {s.strategy.stop_loss > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-400">停損</span>
                  <span className="text-red-400">{s.strategy.stop_loss.toFixed(2)}</span>
                </div>
              )}
              {target > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-400">目標</span>
                  <span className="text-green-400">{target.toFixed(2)}</span>
                </div>
              )}
            </div>
            {/* Dimensions bar */}
            <div className="mt-3 space-y-1">
              {(Object.keys(DIM_LABELS) as Array<keyof Dimensions>).map((k) => (
                <div key={k} className="flex items-center gap-1">
                  <span className="text-gray-500 w-10 text-xs">{DIM_LABELS[k]}</span>
                  <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, ((s.dimensions?.[k] ?? 0) / DIM_MAX[k]) * 100)}%`,
                        background: DIM_COLORS[k],
                      }}
                    />
                  </div>
                  <span className="text-gray-500 text-xs w-6 text-right">{s.dimensions?.[k] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DimensionRadar({ stocks }: { stocks: ExplosiveStock[] }) {
  const top5 = stocks.slice(0, 5);
  const dims = Object.keys(DIM_LABELS) as Array<keyof Dimensions>;
  const radarData = dims.map((k) => ({
    dim: DIM_LABELS[k],
    ...Object.fromEntries(top5.map((s, i) => [
      `s${i}`, Math.round(((s.dimensions?.[k] ?? 0) / DIM_MAX[k]) * 100),
    ])),
  }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={radarData}>
        <PolarGrid stroke="#374151" />
        <PolarAngleAxis dataKey="dim" tick={{ fill: '#9ca3af', fontSize: 12 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 10 }} />
        {top5.map((s, i) => (
          <Radar
            key={s.stock_id}
            name={`${s.stock_id} ${s.name}`}
            dataKey={`s${i}`}
            stroke={STOCK_COLORS[i]}
            fill={STOCK_COLORS[i]}
            fillOpacity={0.15}
          />
        ))}
        <Legend />
        <Tooltip />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function ScoreDistribution({ stocks }: { stocks: ExplosiveStock[] }) {
  const bins = [0, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const data = bins.slice(0, -1).map((lo, i) => ({
    range: `${lo}–${bins[i + 1]}`,
    count: stocks.filter((s) => s.total_score >= lo && s.total_score < bins[i + 1]).length,
  }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="range" tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
          labelStyle={{ color: '#f9fafb' }}
        />
        <Bar dataKey="count" fill="#38bdf8" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function BacktestPerformanceTable({ records }: { records: BacktestRecord[] }) {
  const [activePeriod, setActivePeriod] = useState<'T1' | 'T3' | 'T5'>('T1');
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  // Show ALL records (pending + completed), sorted by date desc
  const sortedRecords = [...records].sort((a, b) => b.scan_date.localeCompare(a.scan_date));

  if (sortedRecords.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <AlertCircle className="mx-auto mb-3 w-8 h-8" />
        <p>尚無回測記錄</p>
        <p className="text-sm mt-1">每日掃描後自動產生追蹤記錄</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Period tabs */}
      <div className="flex gap-2">
        {(['T1', 'T3', 'T5'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setActivePeriod(p)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activePeriod === p
                ? 'bg-sky-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {p === 'T1' ? 'T+1 隔日' : p === 'T3' ? 'T+3 三日' : 'T+5 五日'}
          </button>
        ))}
      </div>

      {/* Records list */}
      <div className="space-y-3">
        {sortedRecords.map((rec) => {
          const period = rec.periods[activePeriod];
          const isExpanded = expandedDate === rec.scan_date;
          const isPending = period.pending;
          const winRateDisplay = fmtRate(period.win_rate);
          const avgReturnDisplay = fmtReturn(period.avg_return);

          return (
            <div key={rec.scan_date} className="rounded-xl border border-gray-700 bg-gray-900/60 overflow-hidden">
              {/* Header row */}
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors"
                onClick={() => setExpandedDate(isExpanded ? null : rec.scan_date)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-white font-semibold">{shortDate(rec.scan_date)}</span>
                  {isPending ? (
                    <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                      待結算
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400 border border-green-500/30">
                      已結算
                    </span>
                  )}
                  <span className="text-gray-400 text-sm">
                    {period.stocks?.length ?? 0} 檔
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="text-right">
                    <div className="text-gray-500 text-xs">勝率</div>
                    <div className={isPending ? 'text-yellow-400' : 'text-green-400'}>
                      {winRateDisplay}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-gray-500 text-xs">均報酬</div>
                    <div className={isPending ? 'text-yellow-400' : (
                      period.avg_return != null && period.avg_return >= 0 ? 'text-green-400' : 'text-red-400'
                    )}>
                      {avgReturnDisplay}
                    </div>
                  </div>
                  <span className="text-gray-500">{isExpanded ? '▲' : '▼'}</span>
                </div>
              </button>

              {/* Expanded stocks */}
              {isExpanded && (
                <div className="border-t border-gray-700 px-4 py-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 border-b border-gray-700">
                        <th className="text-left pb-2">股票</th>
                        <th className="text-right pb-2">進場</th>
                        <th className="text-right pb-2">現價</th>
                        <th className="text-right pb-2">報酬</th>
                        <th className="text-right pb-2">結果</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {(period.stocks ?? []).map((s) => (
                        <tr key={s.stock_id} className="py-1">
                          <td className="py-1.5">
                            <span className="text-white">{s.stock_id}</span>
                            <span className="text-gray-500 ml-1">{s.name}</span>
                          </td>
                          <td className="text-right text-gray-300">{s.entry?.toFixed(2) ?? '—'}</td>
                          <td className="text-right text-gray-300">
                            {s.close != null ? s.close.toFixed(2) : '—'}
                          </td>
                          <td className={`text-right ${
                            s.return_pct == null ? 'text-yellow-400' :
                            s.return_pct >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {s.return_pct != null ? pct(s.return_pct) : '待結算'}
                          </td>
                          <td className="text-right">
                            {s.pending ? (
                              <span className="text-yellow-400">持倉中</span>
                            ) : s.hit_target ? (
                              <span className="text-green-400">達標 ✓</span>
                            ) : s.hit_stoploss ? (
                              <span className="text-red-400">停損 ✗</span>
                            ) : (
                              <span className="text-gray-400">持有</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CumulativeEquityCurve({ records }: { records: BacktestRecord[] }) {
  const completed = records.filter((r) => !r.periods.T1.pending);
  if (completed.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
        待更多已結算資料後產生權益曲線
      </div>
    );
  }
  const sorted = [...completed].sort((a, b) => a.scan_date.localeCompare(b.scan_date));
  let cumReturn = 0;
  const data = sorted.map((r) => {
    const avgR = r.periods.T1.avg_return ?? 0;
    cumReturn += avgR;
    return { date: shortDate(r.scan_date), equity: parseFloat((100 + cumReturn * 100).toFixed(2)) };
  });
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
          formatter={(v: number) => [`${v.toFixed(1)}`, '累計指數']}
        />
        <Line type="monotone" dataKey="equity" stroke="#34d399" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TrackingDashboard() {
  const [latestData, setLatestData] = useState<LatestData | null>(null);
  const [allScoresData, setAllScoresData] = useState<AllScoresData | null>(null);
  const [backtestData, setBacktestData] = useState<BacktestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'backtest' | 'distribution'>('overview');

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        // Fetch latest.json (required)
        const latestRes = await fetch(`${BASE}/data/latest.json`);
        if (!latestRes.ok) throw new Error(`latest.json HTTP ${latestRes.status}`);
        const latest: LatestData = await latestRes.json();
        setLatestData(latest);

        // Fetch backtest.json (optional — don't fail page if missing)
        try {
          const btRes = await fetch(`${BASE}/data/backtest.json`);
          if (btRes.ok) {
            const bt = await btRes.json();
            // Support both v1 (history[]) and v2 (grouped_records[])
            if (bt.grouped_records) {
              setBacktestData({ version: bt.version ?? 2, grouped_records: bt.grouped_records });
            } else if (bt.history) {
              // Legacy format: wrap into grouped_records shape as pending
              const wrapped: BacktestRecord[] = (bt.history as Array<{
                date: string;
                top5: Array<{ stock_id: string; name: string; entry: number }>;
              }>).map((h) => ({
                scan_date: h.date,
                periods: {
                  T1: { label: 'T+1', backtest_date: '', win_rate: null, avg_return: null, pending: true, stocks: h.top5.map((s) => ({ ...s, close: null, return_pct: null, hit_target: false, hit_stoploss: false, pending: true })) },
                  T3: { label: 'T+3', backtest_date: '', win_rate: null, avg_return: null, pending: true, stocks: h.top5.map((s) => ({ ...s, close: null, return_pct: null, hit_target: false, hit_stoploss: false, pending: true })) },
                  T5: { label: 'T+5', backtest_date: '', win_rate: null, avg_return: null, pending: true, stocks: h.top5.map((s) => ({ ...s, close: null, return_pct: null, hit_target: false, hit_stoploss: false, pending: true })) },
                },
              }));
              setBacktestData({ version: 1, grouped_records: wrapped });
            }
          }
        } catch (btErr) {
          console.warn('backtest.json fetch failed:', btErr);
        }

        // Fetch all_scores.json (optional)
        try {
          const asRes = await fetch(`${BASE}/data/all_scores.json`);
          if (asRes.ok) {
            const as: AllScoresData = await asRes.json();
            setAllScoresData(as);
          }
        } catch (asErr) {
          console.warn('all_scores.json fetch failed:', asErr);
        }
      } catch (err) {
        console.error('TrackingDashboard fetch error:', err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  const top10 = latestData?.top10 ?? [];
  const allStocks = allScoresData?.all_stock_scores ?? top10;
  const groupedRecords = backtestData?.grouped_records ?? [];

  // Summary stats from completed backtest records
  const completedRecords = groupedRecords.filter((r) => !r.periods.T1.pending);
  const avgWinRate = completedRecords.length > 0
    ? completedRecords.reduce((s, r) => s + (r.periods.T1.win_rate ?? 0), 0) / completedRecords.length
    : null;
  const avgReturn = completedRecords.length > 0
    ? completedRecords.reduce((s, r) => s + (r.periods.T1.avg_return ?? 0), 0) / completedRecords.length
    : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <TopNav />
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-400 mx-auto mb-4" />
            <p className="text-gray-400">載入追蹤資料中…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <TopNav />
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="mx-auto mb-3 w-10 h-10 text-red-400" />
            <p className="text-red-400 font-semibold">資料載入失敗</p>
            <p className="text-gray-500 text-sm mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!latestData) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <TopNav />
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">尚無掃描資料</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <TopNav />
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">📊 追蹤儀表板</h1>
            <p className="text-gray-400 text-sm mt-1">
              掃描日期：{latestData.scan_date} ｜ 掃描數量：{latestData.scanned_count?.toLocaleString() ?? '—'} 檔
            </p>
          </div>
          <div className="text-right text-sm text-gray-500">
            <div>回測記錄：{groupedRecords.length} 筆</div>
            <div>已結算：{completedRecords.length} 筆</div>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<Trophy className="w-4 h-4" />}
            label="T+1 平均勝率"
            value={avgWinRate != null ? `${(avgWinRate * 100).toFixed(1)}%` : '—'}
            sub={completedRecords.length > 0 ? `${completedRecords.length} 筆已結算` : '待結算中'}
            accent="border-green-500/30"
            valueColor="text-green-400"
          />
          <StatCard
            icon={<TrendingUp className="w-4 h-4" />}
            label="T+1 平均報酬"
            value={avgReturn != null ? pct(avgReturn) : '—'}
            sub="已結算平均"
            accent="border-sky-500/30"
            valueColor={avgReturn != null && avgReturn >= 0 ? 'text-green-400' : 'text-red-400'}
          />
          <StatCard
            icon={<Activity className="w-4 h-4" />}
            label="追蹤中股票"
            value={groupedRecords.reduce((s, r) => s + (r.periods.T1.stocks?.length ?? 0), 0)}
            sub="累計追蹤標的"
            accent="border-purple-500/30"
            valueColor="text-purple-400"
          />
          <StatCard
            icon={<Zap className="w-4 h-4" />}
            label="今日 Top10"
            value={top10.length}
            sub={`${latestData.trend_label ?? latestData.market_trend ?? '—'}`}
            accent="border-yellow-500/30"
            valueColor="text-yellow-400"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-800 pb-1">
          {(['overview', 'backtest', 'distribution'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab
                  ? 'bg-gray-800 text-white border-b-2 border-sky-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab === 'overview' ? '🏆 今日 Top10' : tab === 'backtest' ? '📈 回測追蹤' : '📊 分佈分析'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-white mb-3">今日推薦 Top 10</h2>
              <Top5Cards stocks={top10} />
            </div>
            {top10.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-3">五維度雷達圖</h2>
                <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-4">
                  <DimensionRadar stocks={top10} />
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'backtest' && (
          <div className="space-y-6">
            {groupedRecords.length > 0 ? (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-white mb-3">回測績效追蹤</h2>
                  <BacktestPerformanceTable records={groupedRecords} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white mb-3">累計報酬曲線（T+1）</h2>
                  <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-4">
                    <CumulativeEquityCurve records={groupedRecords} />
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-16 text-gray-500">
                <BarChart3 className="mx-auto mb-3 w-10 h-10" />
                <p>尚無回測記錄</p>
                <p className="text-sm mt-1">每日 22:55 掃描後自動產生追蹤記錄</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'distribution' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-white mb-3">總分分佈</h2>
              <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-4">
                <ScoreDistribution stocks={allStocks} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
