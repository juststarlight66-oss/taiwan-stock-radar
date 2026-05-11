'use client';
import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import {
  Activity, TrendingUp, BarChart3, Target, ScanLine as RadarIcon,
  Share2 as GitFork, AlertCircle, Award as Trophy, Zap,
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
}
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

function pct(v: number) { return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`; }
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
    <div className={`rounded-xl border p-4 ${accent}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function SectionHeader({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function TrackingDashboard() {
  const [latestData, setLatestData] = useState<LatestData | null>(null);
  const [backtestData, setBacktestData] = useState<BacktestData | null>(null);
  const [allScores, setAllScores] = useState<AllScoresData | null>(null);
  const [activeTab, setActiveTab] = useState<'backtest' | 'strategy' | 'all'>('backtest');
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [latestRes, backtestRes, allRes] = await Promise.allSettled([
          fetch(`${BASE}/data/latest.json`),
          fetch(`${BASE}/data/backtest.json`),
          fetch(`${BASE}/data/all_scores.json`),
        ]);

        if (latestRes.status === 'fulfilled' && latestRes.value.ok) {
          const d = await latestRes.value.json();
          setLatestData(d);
        }
        if (backtestRes.status === 'fulfilled' && backtestRes.value.ok) {
          const d = await backtestRes.value.json();
          setBacktestData(d);
        }
        if (allRes.status === 'fulfilled' && allRes.value.ok) {
          const d = await allRes.value.json();
          setAllScores(d);
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // ── Derived data ──────────────────────────────────────────────────────────

  const groupedRecords = backtestData?.grouped_records ?? [];

  const settledRecords = useMemo(() =>
    groupedRecords.filter(r =>
      !r.periods.T1.pending || !r.periods.T3.pending || !r.periods.T5.pending
    ),
    [groupedRecords]
  );

  const overallStats = useMemo(() => {
    const allPeriods = settledRecords.flatMap(r =>
      [r.periods.T1, r.periods.T3, r.periods.T5].filter(p => !p.pending)
    );
    if (!allPeriods.length) return null;
    const wins = allPeriods.filter(p => (p.win_rate ?? 0) >= 50).length;
    const avgWinRate = allPeriods.reduce((a, p) => a + (p.win_rate ?? 0), 0) / allPeriods.length;
    const avgReturn = allPeriods.reduce((a, p) => a + (p.avg_return ?? 0), 0) / allPeriods.length;
    return { wins, total: allPeriods.length, avgWinRate, avgReturn };
  }, [settledRecords]);

  const chartData = useMemo(() =>
    settledRecords.map(r => ({
      date: shortDate(r.scan_date),
      T1: r.periods.T1.win_rate,
      T3: r.periods.T3.win_rate,
      T5: r.periods.T5.win_rate,
    })),
    [settledRecords]
  );

  const stockBacktestMap = useMemo(() => {
    const map: Record<string, BacktestMapEntry> = {};
    // Placeholder: strategy backtest from backtest.json if structured
    return map;
  }, []);

  const stockList = useMemo(() =>
    (latestData?.top10 ?? []).map(s => s.stock_id),
    [latestData]
  );

  const currentStock = selectedStock ?? stockList[0] ?? null;
  const currentBacktest = currentStock ? stockBacktestMap[currentStock] : null;

  const dimData = useMemo(() => {
    if (!latestData) return [];
    const stock = latestData.top10.find(s => s.stock_id === currentStock);
    if (!stock?.dimensions) return [];
    return Object.entries(stock.dimensions).map(([key, val]) => ({
      subject: DIM_LABELS[key] ?? key,
      value: val,
      max: DIM_MAX[key] ?? 10,
      color: DIM_COLORS[key] ?? '#38bdf8',
    }));
  }, [latestData, currentStock]);

  // ── Loading / Error ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-dvh bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">載入追蹤儀表板...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-dvh bg-white flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-white text-gray-900 font-sans flex flex-col">
      <TopNav />

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-5">
        <div className="space-y-6 fade-in">

          {/* Hero */}
          <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-indigo-50 px-5 py-5">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-sky-500" />
                  績效追蹤儀表板
                  <span className="text-[10px] bg-sky-100 text-sky-600 border border-sky-200 px-2 py-0.5 rounded-full font-normal">LIVE</span>
                </h1>
                <p className="text-xs text-gray-500 mt-1">T+1 / T+3 / T+5 報酬追蹤 · 策略回測 · 維度分析</p>
              </div>
              {latestData && (
                <div className="text-right">
                  <div className="text-[10px] text-gray-400">最新掃描</div>
                  <div className="text-sm font-mono font-bold text-sky-600">{latestData.scan_date}</div>
                  <div className="text-xs text-gray-400">{latestData.scanned_count?.toLocaleString()} 檔掃描</div>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mt-4">
              {([
                { id: 'backtest', label: '報酬追蹤', icon: <TrendingUp className="w-3.5 h-3.5" /> },
                { id: 'strategy', label: '策略分析', icon: <BarChart3 className="w-3.5 h-3.5" /> },
                { id: 'all',      label: '全市場',   icon: <Target className="w-3.5 h-3.5" /> },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-sky-500 text-white shadow-sm'
                      : 'bg-white border border-gray-200 text-gray-600 hover:border-sky-200 hover:text-sky-600'
                  }`}
                >
                  {tab.icon}{tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Tab: 報酬追蹤 ── */}
          {activeTab === 'backtest' && (
            <div className="space-y-5">

              {/* Overall stats */}
              {overallStats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard
                    icon={<Trophy className="w-4 h-4 text-yellow-500" />}
                    label="已結算期數" value={overallStats.total}
                    accent="border-yellow-100 bg-yellow-50" valueColor="text-yellow-600"
                  />
                  <StatCard
                    icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
                    label="平均勝率" value={`${overallStats.avgWinRate.toFixed(1)}%`}
                    accent="border-emerald-100 bg-emerald-50" valueColor="text-emerald-600"
                  />
                  <StatCard
                    icon={<Zap className="w-4 h-4 text-sky-500" />}
                    label="平均報酬" value={pct(overallStats.avgReturn)}
                    accent="border-sky-100 bg-sky-50" valueColor={overallStats.avgReturn >= 0 ? 'text-rose-500' : 'text-emerald-600'}
                  />
                  <StatCard
                    icon={<Activity className="w-4 h-4 text-purple-500" />}
                    label="掃描次數" value={groupedRecords.length}
                    accent="border-purple-100 bg-purple-50" valueColor="text-purple-600"
                  />
                </div>
              )}

              {/* Win rate chart */}
              {chartData.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <SectionHeader
                    icon={<TrendingUp className="w-4 h-4 text-sky-500" />}
                    title="各期勝率趨勢"
                    sub="每次掃描 T+1 / T+3 / T+5 勝率"
                  />
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                      <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="T1" stroke="#38bdf8" dot={false} name="T+1" />
                      <Line type="monotone" dataKey="T3" stroke="#34d399" dot={false} name="T+3" />
                      <Line type="monotone" dataKey="T5" stroke="#a78bfa" dot={false} name="T+5" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Settled records table */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <SectionHeader
                    icon={<BarChart3 className="w-4 h-4 text-sky-500" />}
                    title="已結算回測記錄"
                    sub={`共 ${settledRecords.length} 筆`}
                  />
                </div>
                {settledRecords.length === 0 ? (
                  <div className="py-16 text-center">
                    <BarChart3 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">暫無已結算回測記錄</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <th className="px-4 py-2.5 text-left font-medium text-gray-500">掃描日</th>
                          <th className="px-4 py-2.5 text-center font-medium text-gray-500">T+1</th>
                          <th className="px-4 py-2.5 text-center font-medium text-gray-500">T+3</th>
                          <th className="px-4 py-2.5 text-center font-medium text-gray-500">T+5</th>
                          <th className="px-4 py-2.5 text-right font-medium text-gray-500">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {settledRecords.map((record) => (
                          <tr key={record.scan_date} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-mono text-gray-700">{record.scan_date}</td>
                            {(['T1', 'T3', 'T5'] as const).map(period => {
                              const p = record.periods[period];
                              return (
                                <td key={period} className="px-4 py-2.5 text-center">
                                  {p.pending ? (
                                    <span className="text-gray-300">—</span>
                                  ) : (
                                    <span className={`font-semibold ${
                                      (p.win_rate ?? 0) >= 60 ? 'text-rose-500' :
                                      (p.win_rate ?? 0) >= 40 ? 'text-amber-500' : 'text-gray-400'
                                    }`}>
                                      {p.win_rate?.toFixed(0)}%
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-4 py-2.5 text-right">
                              <button
                                onClick={() => setSelectedStock(record.scan_date)}
                                className="text-sky-500 hover:text-sky-700 text-[10px] underline"
                              >
                                明細
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Tab: 策略分析 ── */}
          {activeTab === 'strategy' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <SectionHeader
                  icon={<RadarIcon className="w-4 h-4 text-sky-500" />}
                  title="個股維度雷達圖"
                  sub="選擇個股查看五維評分分布"
                />
                {/* Stock selector */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {stockList.map(id => (
                    <button
                      key={id}
                      onClick={() => setSelectedStock(id)}
                      className={`px-3 py-1 rounded-full text-xs font-mono transition-all ${
                        currentStock === id
                          ? 'bg-sky-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-sky-50'
                      }`}
                    >
                      {id}
                    </button>
                  ))}
                </div>
                {dimData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <RadarChart data={dimData}>
                      <PolarGrid stroke="#e5e7eb" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                      <PolarRadiusAxis tick={{ fontSize: 9 }} />
                      <Radar name="評分" dataKey="value" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.3} />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-40 flex items-center justify-center text-sm text-gray-400">
                    選擇股票查看維度分析
                  </div>
                )}
              </div>

              {/* Strategy backtest placeholder */}
              {currentBacktest ? (
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <SectionHeader
                    icon={<BarChart3 className="w-4 h-4 text-sky-500" />}
                    title={`${currentStock} 策略回測`}
                    sub={currentBacktest.date_range}
                  />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Object.entries(currentBacktest.strategies).map(([key, strat]) => (
                      <div key={key} className="rounded-lg border border-gray-100 p-3">
                        <div className="text-[10px] text-gray-400 mb-1">{STRATEGY_LABELS[key] ?? key}</div>
                        <div className="text-sm font-bold" style={{ color: STRATEGY_COLORS[key] }}>
                          {strat.win_rate.toFixed(1)}%
                        </div>
                        <div className="text-[10px] text-gray-500">勝率</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center">
                  <GitFork className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">策略回測資料累積中</p>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: 全市場 ── */}
          {activeTab === 'all' && (
            <div className="space-y-4">
              {allScores ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <StatCard
                      icon={<Target className="w-4 h-4 text-sky-500" />}
                      label="掃描檔數" value={allScores.scanned_count?.toLocaleString()}
                      accent="border-sky-100 bg-sky-50" valueColor="text-sky-600"
                    />
                    <StatCard
                      icon={<Activity className="w-4 h-4 text-emerald-500" />}
                      label="掃描日期" value={allScores.scan_date}
                      accent="border-emerald-100 bg-emerald-50" valueColor="text-emerald-600"
                    />
                    <StatCard
                      icon={<TrendingUp className="w-4 h-4 text-purple-500" />}
                      label="全市場股數" value={allScores.all_stock_scores?.length?.toLocaleString()}
                      accent="border-purple-100 bg-purple-50" valueColor="text-purple-600"
                    />
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <SectionHeader
                        icon={<BarChart3 className="w-4 h-4 text-sky-500" />}
                        title="全市場分數分布"
                        sub="Top 20 高分股"
                      />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50">
                            <th className="px-4 py-2 text-left font-medium text-gray-500">排名</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-500">股票</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-500">族群</th>
                            <th className="px-4 py-2 text-right font-medium text-gray-500">總分</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allScores.all_stock_scores
                            .slice(0, 20)
                            .map((s, i) => (
                              <tr key={s.stock_id} className="border-b border-gray-50 hover:bg-gray-50">
                                <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                                <td className="px-4 py-2">
                                  <span className="font-mono text-gray-900">{s.stock_id}</span>
                                  <span className="text-gray-400 ml-1">{s.name}</span>
                                </td>
                                <td className="px-4 py-2 text-gray-500">{s.sector}</td>
                                <td className="px-4 py-2 text-right font-bold text-sky-600">{s.total_score}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-16 text-center">
                  <Target className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-sm text-gray-500">全市場資料載入中</p>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      <footer className="border-t border-gray-200 py-4 mt-4">
        <div className="max-w-screen-xl mx-auto px-4 text-center">
          <p className="text-xs text-gray-400">台股雷達 · 績效追蹤 · 資料每日 19:00 更新</p>
        </div>
      </footer>
    </div>
  );
}
