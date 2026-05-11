'use client';
import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import {
  Activity, TrendingUp, BarChart3, Target, ScanLine as RadarIcon,
  Share2 as GitFork, AlertCircle, Trophy, Zap,
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
    <div className={`rounded-xl border ${accent} p-4 flex flex-col gap-1`}>
      <div className="flex items-center gap-2 text-gray-500 text-xs">{icon}{label}</div>
      <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
      {sub && <div className="text-gray-400 text-xs">{sub}</div>}
    </div>
  );
}

function WinBadge({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-gray-400 text-xs">待驗證</span>;
  const color = rate >= 0.6 ? 'text-emerald-600' : rate >= 0.4 ? 'text-amber-500' : 'text-red-500';
  return <span className={`font-bold text-sm ${color}`}>{(rate * 100).toFixed(0)}%</span>;
}

function ReturnBadge({ ret }: { ret: number | null }) {
  if (ret === null) return <span className="text-gray-400 text-xs">待驗證</span>;
  const color = ret >= 0 ? 'text-emerald-600' : 'text-red-500';
  return <span className={`font-bold text-sm ${color}`}>{ret >= 0 ? '+' : ''}{ret.toFixed(1)}%</span>;
}

function PendingPill() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 border border-amber-300 text-amber-600 rounded-full px-2 py-0.5">
      <AlertCircle className="w-3 h-3" />持倉中
    </span>
  );
}

// ── Backtest Panel ───────────────────────────────────────────────────────────

function BacktestPanel({ records }: { records: BacktestRecord[] }) {
  const [activeRecord, setActiveRecord] = useState(0);
  const [activePeriod, setActivePeriod] = useState<'T1' | 'T3' | 'T5'>('T1');

  const record = records[activeRecord];
  if (!record) return null;
  const period = record.periods[activePeriod];

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <RadarIcon className="w-4 h-4 text-sky-500" />
        <span className="font-bold text-gray-800">歷史回測績效</span>
      </div>

      {/* Date selector */}
      <div className="flex gap-2 flex-wrap">
        {records.map((r, i) => (
          <button
            key={r.scan_date}
            onClick={() => setActiveRecord(i)}
            className={`text-xs px-3 py-1 rounded-full border transition-all ${
              i === activeRecord
                ? 'bg-sky-500 text-white border-sky-500'
                : 'text-gray-500 border-gray-200 hover:border-sky-300'
            }`}
          >
            {r.scan_date}
          </button>
        ))}
      </div>

      {/* Period tabs */}
      <div className="flex gap-2">
        {(['T1', 'T3', 'T5'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setActivePeriod(p)}
            className={`text-xs px-4 py-1.5 rounded-lg border transition-all ${
              p === activePeriod
                ? 'bg-sky-500 text-white border-sky-500'
                : 'text-gray-500 border-gray-200 hover:border-sky-300'
            }`}
          >
            {p === 'T1' ? 'T+1 隔日' : p === 'T3' ? 'T+3 三日' : 'T+5 週線'}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
          <div className="text-xs text-gray-500 mb-1">勝率</div>
          <WinBadge rate={period.win_rate} />
        </div>
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
          <div className="text-xs text-gray-500 mb-1">平均報酬</div>
          <ReturnBadge ret={period.avg_return} />
        </div>
      </div>

      {/* Stock list */}
      <div className="flex flex-col gap-2">
        {period.stocks.map((s) => (
          <div key={s.stock_id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-gray-500">{s.stock_id}</span>
              <span className="text-gray-700">{s.name}</span>
              {s.pending && <PendingPill />}
            </div>
            <div className="flex items-center gap-3">
              {s.return_pct !== null && (
                <span className={`font-bold text-sm ${s.return_pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {s.return_pct >= 0 ? '+' : ''}{s.return_pct.toFixed(1)}%
                </span>
              )}
              {s.hit_target && <span className="text-[10px] bg-emerald-50 border border-emerald-300 text-emerald-600 rounded-full px-2 py-0.5">達標</span>}
              {s.hit_stoploss && <span className="text-[10px] bg-red-50 border border-red-300 text-red-600 rounded-full px-2 py-0.5">止損</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Strategy Panel ───────────────────────────────────────────────────────────

function StrategyPanel({ data }: { data: BacktestMapEntry[] }) {
  const [selectedStock, setSelectedStock] = useState<string>(data[0]?.stock_id ?? '');
  const [selectedStrategy, setSelectedStrategy] = useState<string>('ma_cross');

  const entry = data.find((d) => d.stock_id === selectedStock);
  const strat = entry?.strategies[selectedStrategy as keyof typeof entry.strategies];

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <GitFork className="w-4 h-4 text-violet-500" />
        <span className="font-bold text-gray-800">策略回測分析</span>
      </div>

      {/* Stock selector */}
      <div className="flex gap-2 flex-wrap">
        {data.map((d) => (
          <button
            key={d.stock_id}
            onClick={() => setSelectedStock(d.stock_id)}
            className={`text-xs px-3 py-1 rounded-full border transition-all ${
              d.stock_id === selectedStock
                ? 'bg-violet-500 text-white border-violet-500'
                : 'text-gray-500 border-gray-200 hover:border-violet-300'
            }`}
          >
            {d.stock_id}
          </button>
        ))}
      </div>

      {/* Strategy tabs */}
      <div className="flex gap-2 flex-wrap">
        {Object.keys(STRATEGY_LABELS).map((s) => (
          <button
            key={s}
            onClick={() => setSelectedStrategy(s)}
            className={`text-xs px-3 py-1 rounded-lg border transition-all ${
              s === selectedStrategy
                ? 'bg-violet-500 text-white border-violet-500'
                : 'text-gray-500 border-gray-200 hover:border-violet-300'
            }`}
          >
            {STRATEGY_LABELS[s]}
          </button>
        ))}
      </div>

      {strat && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={<Trophy className="w-3.5 h-3.5" />} label="勝率" value={`${(strat.win_rate * 100).toFixed(0)}%`} accent="border-emerald-200" valueColor="text-emerald-600" />
            <StatCard icon={<TrendingUp className="w-3.5 h-3.5" />} label="獲利因子" value={strat.profit_factor.toFixed(2)} accent="border-sky-200" valueColor="text-sky-600" />
            <StatCard icon={<Activity className="w-3.5 h-3.5" />} label="夏普比率" value={strat.sharpe.toFixed(2)} accent="border-violet-200" valueColor="text-violet-600" />
            <StatCard icon={<Target className="w-3.5 h-3.5" />} label="最大回撤" value={`${strat.max_drawdown.toFixed(1)}%`} accent="border-red-200" valueColor="text-red-500" />
          </div>

          {strat.equity_curve_data?.length > 0 && (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={strat.equity_curve_data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="equity" stroke={STRATEGY_COLORS[selectedStrategy] ?? '#38bdf8'} dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Dimension Radar Panel ─────────────────────────────────────────────────────

function DimensionRadarPanel({ stocks }: { stocks: ExplosiveStock[] }) {
  const [selected, setSelected] = useState<string>(stocks[0]?.stock_id ?? '');
  const stock = stocks.find((s) => s.stock_id === selected);

  const radarData = stock
    ? Object.keys(DIM_LABELS).map((k) => ({
        dim: DIM_LABELS[k],
        value: (stock.dimensions[k as keyof Dimensions] / DIM_MAX[k]) * 100,
        fullMark: 100,
      }))
    : [];

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <RadarIcon className="w-4 h-4 text-sky-500" />
        <span className="font-bold text-gray-800">五維評分雷達圖</span>
      </div>

      <div className="flex gap-2 flex-wrap">
        {stocks.map((s) => (
          <button
            key={s.stock_id}
            onClick={() => setSelected(s.stock_id)}
            className={`text-xs px-3 py-1 rounded-full border transition-all ${
              s.stock_id === selected
                ? 'bg-sky-500 text-white border-sky-500'
                : 'text-gray-500 border-gray-200 hover:border-sky-300'
            }`}
          >
            {s.stock_id} {s.name}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <RadarChart data={radarData}>
          <PolarGrid />
          <PolarAngleAxis dataKey="dim" tick={{ fontSize: 12 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
          <Radar name="評分" dataKey="value" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.25} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Performance Table ─────────────────────────────────────────────────────────

function PerformanceTable({ records }: { records: BacktestRecord[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-violet-500" />
        <span className="font-bold text-gray-800">績效總覽</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs text-gray-500">日期</th>
              <th className="px-4 py-2 text-center text-xs text-gray-500">T+1 勝率</th>
              <th className="px-4 py-2 text-center text-xs text-gray-500">T+1 報酬</th>
              <th className="px-4 py-2 text-center text-xs text-gray-500">T+3 勝率</th>
              <th className="px-4 py-2 text-center text-xs text-gray-500">T+3 報酬</th>
              <th className="px-4 py-2 text-center text-xs text-gray-500">T+5 勝率</th>
              <th className="px-4 py-2 text-center text-xs text-gray-500">T+5 報酬</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {records.map((r) => (
              <tr key={r.scan_date} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-xs">{r.scan_date}</td>
                {(['T1', 'T3', 'T5'] as const).map((p) => (
                  <>
                    <td key={`${p}-wr`} className="px-4 py-2 text-center"><WinBadge rate={r.periods[p].win_rate} /></td>
                    <td key={`${p}-ret`} className="px-4 py-2 text-center"><ReturnBadge ret={r.periods[p].avg_return} /></td>
                  </>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function TrackingDashboard() {
  const [tab, setTab] = useState<'backtest' | 'strategy' | 'dimension' | 'performance'>('backtest');
  const [latestData, setLatestData] = useState<LatestData | null>(null);
  const [backtestData, setBacktestData] = useState<BacktestData | null>(null);
  const [strategyData, setStrategyData] = useState<BacktestMapEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [latestRes, backtestRes] = await Promise.all([
          fetch(`${BASE}/data/latest.json`),
          fetch(`${BASE}/data/backtest.json`),
        ]);
        if (!latestRes.ok || !backtestRes.ok) throw new Error('Failed to fetch data');
        const latest = await latestRes.json() as LatestData;
        const backtest = await backtestRes.json() as BacktestData;
        setLatestData(latest);
        setBacktestData(backtest);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const records = backtestData?.grouped_records ?? [];
  const top10 = latestData?.top10 ?? [];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <TopNav />
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-500 text-sm">載入追蹤數據中...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <TopNav />
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      <main className="max-w-screen-xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">追蹤儀表板</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              掃描日期：{latestData?.scan_date ?? '—'} · 掃描數量：{latestData?.scanned_count ?? '—'} 檔
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <span className="text-sm text-gray-600">{latestData?.trend_label ?? latestData?.market_trend ?? '—'}</span>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-2 border-b border-gray-200 pb-1">
          {([
            { key: 'backtest', label: '回測績效', icon: <RadarIcon className="w-3.5 h-3.5" /> },
            { key: 'strategy', label: '策略分析', icon: <GitFork className="w-3.5 h-3.5" /> },
            { key: 'dimension', label: '五維雷達', icon: <Activity className="w-3.5 h-3.5" /> },
            { key: 'performance', label: '績效總覽', icon: <BarChart3 className="w-3.5 h-3.5" /> },
          ] as const).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-sky-500 text-sky-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {icon}{label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === 'backtest' && records.length > 0 && <BacktestPanel records={records} />}
        {tab === 'strategy' && strategyData && strategyData.length > 0 && <StrategyPanel data={strategyData} />}
        {tab === 'dimension' && top10.length > 0 && <DimensionRadarPanel stocks={top10} />}
        {tab === 'performance' && records.length > 0 && <PerformanceTable records={records} />}

        {/* Empty states */}
        {tab === 'backtest' && records.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <RadarIcon className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>暫無已結算回測記錄</p>
          </div>
        )}
        {tab === 'strategy' && (!strategyData || strategyData.length === 0) && (
          <div className="text-center py-16 text-gray-400">
            <GitFork className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>暫無策略回測數據</p>
          </div>
        )}
        {tab === 'dimension' && top10.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Activity className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>暫無維度數據</p>
          </div>
        )}
        {tab === 'performance' && records.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>暫無績效記錄</p>
          </div>
        )}
      </main>
    </div>
  );
}
