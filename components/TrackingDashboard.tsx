'use client';

import React, { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, AlertCircle, Clock } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PeriodResult {
  pending: boolean;
  entry_price?: number | null;
  exit_price?: number | null;
  return_pct?: number | null;
  win?: boolean | null;
  win_rate?: number | null;
  avg_return?: number | null;
  count?: number | null;
}

interface BacktestPeriods {
  T1: PeriodResult;
  T3: PeriodResult;
  T5: PeriodResult;
}

interface StockEntry {
  stock_id: string;
  stock_name: string;
  score: number;
  rank: number;
}

interface BacktestRecord {
  scan_date: string;
  top5: StockEntry[];
  periods: BacktestPeriods;
}

interface CumulativeStats {
  total_recommendations: number;
  settled_count: number;
  overall_win_rate: number | null;
  avg_T1_return: number | null;
  avg_T3_return: number | null;
  avg_T5_return: number | null;
}

interface BacktestData {
  version: number;
  grouped_records: BacktestRecord[];
  cumulative_stats?: CumulativeStats;
  history?: unknown[];
}

interface Dimension {
  score: number;
  label?: string;
}

interface ExplosiveStock {
  stock_id: string;
  stock_name: string;
  total_score: number;
  dimensions: Record<string, Dimension>;
  strategy?: {
    entry_low?: number;
    entry_high?: number;
    stop_loss?: number;
    target1?: number;
    target2?: number;
    upside?: number;
    recommendation?: string;
  };
  sector?: string;
  close?: number;
  change_pct?: number;
}

interface LatestData {
  scan_date: string;
  top10: ExplosiveStock[];
  scanned_count?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BASE =
  typeof window !== 'undefined' &&
  window.location.hostname === 'juststarlight66-oss.github.io'
    ? '/taiwan-stock-radar'
    : '';

const DIM_LABELS: Record<string, string> = {
  technical: '技術面',
  fundamental: '基本面',
  news: '消息面',
  sentiment: '市場情緒',
  chips: '籌碼面',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, digits = 2): string {
  if (v == null || isNaN(v)) return '—';
  return v.toFixed(digits);
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function shortDate(s: string): string {
  const d = s.replace(/-/g, '');
  return d.length >= 8 ? `${d.slice(4, 6)}/${d.slice(6, 8)}` : s;
}

function returnColor(v: number | null | undefined): string {
  if (v == null) return 'text-gray-400';
  if (v > 0) return 'text-emerald-400';
  if (v < 0) return 'text-red-400';
  return 'text-gray-300';
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight
          ? 'border-emerald-500/40 bg-emerald-950/30'
          : 'border-gray-700/50 bg-gray-800/40'
      }`}
    >
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      : score >= 60
      ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
      : 'bg-gray-500/20 text-gray-300 border-gray-500/30';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${color}`}>
      {score.toFixed(1)}
    </span>
  );
}

function PeriodCell({ p, label }: { p: PeriodResult; label: string }) {
  if (p.pending) {
    return (
      <td className="px-3 py-2 text-center">
        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
          <Clock size={10} />
          待結算
        </span>
      </td>
    );
  }
  const ret = p.avg_return ?? p.return_pct;
  const win = p.win_rate ?? (p.win != null ? (p.win ? 100 : 0) : null);
  return (
    <td className="px-3 py-2 text-center">
      <div className={`text-sm font-mono font-bold ${returnColor(ret)}`}>
        {fmtPct(ret)}
      </div>
      {win != null && (
        <div className="text-xs text-gray-500">
          勝率 {fmt(win, 1)}%
        </div>
      )}
    </td>
  );
}

function BacktestTable({ records }: { records: BacktestRecord[] }) {
  if (!records || records.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <AlertCircle size={32} className="mx-auto mb-3 opacity-40" />
        <p>尚無回測記錄</p>
      </div>
    );
  }

  // Sort newest first
  const sorted = [...records].sort((a, b) =>
    b.scan_date.localeCompare(a.scan_date)
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700/50">
            <th className="px-3 py-2 text-left text-gray-400 font-medium">掃描日</th>
            <th className="px-3 py-2 text-left text-gray-400 font-medium">推薦標的</th>
            <th className="px-3 py-2 text-center text-gray-400 font-medium">T+1</th>
            <th className="px-3 py-2 text-center text-gray-400 font-medium">T+3</th>
            <th className="px-3 py-2 text-center text-gray-400 font-medium">T+5</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((rec) => (
            <tr
              key={rec.scan_date}
              className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors"
            >
              <td className="px-3 py-3 text-gray-300 font-mono text-xs whitespace-nowrap">
                {shortDate(rec.scan_date)}
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-1">
                  {(rec.top5 || []).slice(0, 5).map((s) => (
                    <span
                      key={s.stock_id}
                      className="text-xs bg-gray-700/50 text-gray-300 px-1.5 py-0.5 rounded"
                    >
                      {s.stock_id}
                      {s.stock_name ? ` ${s.stock_name}` : ''}
                    </span>
                  ))}
                </div>
              </td>
              <PeriodCell p={rec.periods?.T1 ?? { pending: true }} label="T+1" />
              <PeriodCell p={rec.periods?.T3 ?? { pending: true }} label="T+3" />
              <PeriodCell p={rec.periods?.T5 ?? { pending: true }} label="T+5" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WinRateChart({ records }: { records: BacktestRecord[] }) {
  const settled = records.filter((r) => r.periods?.T1 && !r.periods.T1.pending);
  if (settled.length < 2) return null;

  const data = settled
    .slice(-20)
    .sort((a, b) => a.scan_date.localeCompare(b.scan_date))
    .map((r) => ({
      date: shortDate(r.scan_date),
      T1: r.periods.T1.avg_return ?? r.periods.T1.return_pct ?? null,
      T3: r.periods.T3?.avg_return ?? r.periods.T3?.return_pct ?? null,
      T5: r.periods.T5?.avg_return ?? r.periods.T5?.return_pct ?? null,
    }));

  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium text-gray-400 mb-3">歷史報酬走勢</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} />
          <YAxis
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              background: '#1f2937',
              border: '1px solid #374151',
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v: number) => [`${fmt(v)}%`]}
          />
          <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="T1" stroke="#34d399" strokeWidth={2} dot={false} name="T+1" />
          <Line type="monotone" dataKey="T3" stroke="#60a5fa" strokeWidth={2} dot={false} name="T+3" />
          <Line type="monotone" dataKey="T5" stroke="#f59e0b" strokeWidth={2} dot={false} name="T+5" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Top5Cards({ stocks }: { stocks: ExplosiveStock[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {stocks.slice(0, 6).map((s, i) => (
        <div
          key={s.stock_id}
          className="rounded-xl border border-gray-700/50 bg-gray-800/40 p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">#{i + 1}</span>
              <span className="font-bold text-white">{s.stock_id}</span>
              <span className="text-sm text-gray-300">{s.stock_name}</span>
            </div>
            <ScoreBadge score={s.total_score} />
          </div>
          {s.close != null && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-mono text-gray-200">
                ${fmt(s.close)}
              </span>
              {s.change_pct != null && (
                <span
                  className={`text-xs font-mono ${
                    s.change_pct >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {fmtPct(s.change_pct)}
                </span>
              )}
            </div>
          )}
          {s.dimensions && (
            <div className="flex flex-wrap gap-1">
              {Object.entries(s.dimensions)
                .sort(([, a], [, b]) => b.score - a.score)
                .slice(0, 3)
                .map(([k, v]) => (
                  <span
                    key={k}
                    className="text-xs bg-gray-700/50 text-gray-400 px-1.5 py-0.5 rounded"
                  >
                    {DIM_LABELS[k] ?? k} {fmt(v.score, 0)}
                  </span>
                ))}
            </div>
          )}
          {s.strategy?.recommendation && (
            <div className="mt-2 text-xs text-amber-400">
              {s.strategy.recommendation}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TrackingDashboard() {
  const [latestData, setLatestData] = useState<LatestData | null>(null);
  const [backtestData, setBacktestData] = useState<BacktestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        const [latestRes, backtestRes] = await Promise.all([
          fetch(`${BASE}/data/latest.json`),
          fetch(`${BASE}/data/backtest.json`),
        ]);

        if (!latestRes.ok) throw new Error(`latest.json HTTP ${latestRes.status}`);
        if (!backtestRes.ok) throw new Error(`backtest.json HTTP ${backtestRes.status}`);

        const latest: LatestData = await latestRes.json();
        const backtest: BacktestData = await backtestRes.json();

        setLatestData(latest);
        setBacktestData(backtest);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-sm animate-pulse">載入中…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={40} className="mx-auto mb-4 text-red-400" />
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 text-xs text-gray-400 underline"
          >
            重試
          </button>
        </div>
      </div>
    );
  }

  const grouped = backtestData?.grouped_records ?? [];
  const stats = backtestData?.cumulative_stats;
  const top10 = latestData?.top10 ?? [];
  const scanDate = latestData?.scan_date ?? '';

  // Summary stats
  const settledCount = grouped.filter((r) => !r.periods?.T1?.pending).length;
  const pendingCount = grouped.length - settledCount;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800/50 bg-gray-900/50 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">📊 追蹤儀表板</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                最新掃描：{scanDate ? shortDate(scanDate) : '—'}
              </p>
            </div>
            <a
              href="/taiwan-stock-radar/"
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              ← 返回首頁
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="總推薦次數"
            value={String(grouped.length)}
            sub="歷史掃描記錄"
          />
          <StatCard
            label="已結算"
            value={String(settledCount)}
            sub={`待結算 ${pendingCount} 筆`}
          />
          <StatCard
            label="整體勝率"
            value={
              stats?.overall_win_rate != null
                ? `${fmt(stats.overall_win_rate, 1)}%`
                : settledCount === 0
                ? '結算中'
                : '—'
            }
            highlight={!!stats?.overall_win_rate && stats.overall_win_rate >= 60}
          />
          <StatCard
            label="T+1 平均報酬"
            value={
              stats?.avg_T1_return != null ? fmtPct(stats.avg_T1_return) : '—'
            }
            highlight={!!stats?.avg_T1_return && stats.avg_T1_return > 0}
          />
        </div>

        {/* Today's Top Picks */}
        {top10.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-gray-200 mb-3">
              今日推薦標的
              <span className="ml-2 text-xs text-gray-500 font-normal">
                {scanDate ? shortDate(scanDate) : ''}
              </span>
            </h2>
            <Top5Cards stocks={top10} />
          </section>
        )}

        {/* Backtest Performance Table */}
        <section>
          <h2 className="text-base font-semibold text-gray-200 mb-3">
            歷史回測績效
            <span className="ml-2 text-xs text-gray-500 font-normal">
              共 {grouped.length} 筆（待結算以 ⏱ 標示）
            </span>
          </h2>
          <div className="rounded-xl border border-gray-700/50 bg-gray-900/40 overflow-hidden">
            <BacktestTable records={grouped} />
          </div>
          {/* Chart */}
          {grouped.length > 0 && <WinRateChart records={grouped} />}
        </section>
      </div>
    </div>
  );
}
