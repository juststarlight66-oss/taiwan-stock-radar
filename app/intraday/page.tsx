'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import {
  TrendingDown, Minus, Clock, RefreshCw,
  Target, AlertTriangle, CheckCircle, Zap, GitFork,
  Radar as RadarIcon, ArrowUpRight, ArrowDownRight,
  BarChart3, Eye, Radio,
} from 'lucide-react';
import TopNav from '@/components/TopNav';

// ── Types ────────────────────────────────────────────────────────────────────

interface LiveQuote {
  stock_id: string;
  name: string;
  current: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  prev_close: number | null;
  volume: number | null;
  time: string;
  date: string;
  change_pct: number | null;
}

interface IntradayStock {
  stock_id: string;
  name: string;
  sector: string;
  entry: number;       // suggested entry price
  stop_loss: number;
  target: number;
  target1?: number;
  target2?: number;
  target3?: number;
  upside: number;
  total_score: number;
  recommendation: string;
  dimensions: {
    technical: number;
    fundamental: number;
    news: number;
    sentiment: number;
    chips: number;
  };
  // filled at runtime
  live?: LiveQuote;
}

interface IntradaySnapshot {
  scan_date: string;
  fetched_at: string;
  stocks: IntradayStock[];
}

interface LatestData {
  scan_date: string;
  scanned_count: number;
  explosive_top5: {
    stock_id: string;
    name: string;
    sector: string;
    total_score: number;
    close: number;
    change_pct: number;
    dimensions: {
      technical: number;
      fundamental: number;
      news: number;
      sentiment: number;
      chips: number;
    };
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
  }[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const BASE = '/taiwan-stock-radar';
const TWSE_API = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp';

const DIM_LABELS: Record<string, string> = {
  technical: '技術', fundamental: '基本', news: '消息', sentiment: '情緒', chips: '籌碼',
  momentum: '動能', volume: '量能', breakout: '突破', gap: '跳空',
};
const DIM_MAX: Record<string, number> = {
  technical: 40, fundamental: 40, news: 10, sentiment: 10, chips: 10,
  momentum: 30, volume: 25, breakout: 25, gap: 20,
};
const DIM_COLORS: Record<string, string> = {
  technical: '#38bdf8', fundamental: '#34d399', news: '#f59e0b', sentiment: '#a78bfa', chips: '#f87171',
  momentum: '#ef4444', volume: '#f97316', breakout: '#8b5cf6', gap: '#06b6d4',
};

// Distance thresholds for colour coding
// < -3%  = "past entry, now above target zone" — watch closely
// -3% to 0% = "at/near entry" — BUY zone  
// 0% to +5% = "slightly below entry" — approaching
// > +5% = "well below entry" — waiting

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(v: number, digits = 2) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

/** Fetch live quotes from TWSE for a list of stock IDs (mix of TWSE/TPEx) */
async function fetchLiveQuotes(stockIds: string[]): Promise<Record<string, LiveQuote>> {
  // Build query: tse_XXXX.tw (TWSE) — try tse first, then otc for failures
  const queryParts = stockIds.map((id) => `tse_${id}.tw`).join('|');
  const url = `${TWSE_API}?ex_ch=${encodeURIComponent(queryParts)}&json=1&delay=0`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const result: Record<string, LiveQuote> = {};

    for (const m of data.msgArray ?? []) {
      const id = m.c as string;
      if (!id) continue;
      const current = parseFloat(m.z ?? m.pz ?? '');
      const prev_close = parseFloat(m.y ?? '');
      result[id] = {
        stock_id: id,
        name: m.n ?? id,
        current: isNaN(current) ? null : current,
        open: parseFloat(m.o ?? '') || null,
        high: parseFloat(m.h ?? '') || null,
        low: parseFloat(m.l ?? '') || null,
        prev_close: isNaN(prev_close) ? null : prev_close,
        volume: parseInt(m.v ?? '0', 10) || null,
        time: m.t ?? '',
        date: m.d ?? '',
        change_pct:
          !isNaN(current) && !isNaN(prev_close) && prev_close > 0
            ? ((current - prev_close) / prev_close) * 100
            : null,
      };
    }

    // Retry missing ones with otc_ prefix
    const missing = stockIds.filter((id) => !result[id]);
    if (missing.length > 0) {
      const otcQuery = missing.map((id) => `otc_${id}.two`).join('|');
      const otcUrl = `${TWSE_API}?ex_ch=${encodeURIComponent(otcQuery)}&json=1&delay=0`;
      const otcRes = await fetch(otcUrl, { cache: 'no-store' });
      if (otcRes.ok) {
        const otcData = await otcRes.json();
        for (const m of otcData.msgArray ?? []) {
          const id = m.c as string;
          if (!id || result[id]) continue;
          const current = parseFloat(m.z ?? m.pz ?? '');
          const prev_close = parseFloat(m.y ?? '');
          result[id] = {
            stock_id: id,
            name: m.n ?? id,
            current: isNaN(current) ? null : current,
            open: parseFloat(m.o ?? '') || null,
            high: parseFloat(m.h ?? '') || null,
            low: parseFloat(m.l ?? '') || null,
            prev_close: isNaN(prev_close) ? null : prev_close,
            volume: parseInt(m.v ?? '0', 10) || null,
            time: m.t ?? '',
            date: m.d ?? '',
            change_pct:
              !isNaN(current) && !isNaN(prev_close) && prev_close > 0
                ? ((current - prev_close) / prev_close) * 100
                : null,
          };
        }
      }
    }

    return result;
  } catch {
    return {};
  }
}

function distanceClass(distPct: number): string {
  if (distPct <= -3) return 'text-emerald-600 bg-emerald-50 border-emerald-200';   // above entry — in profit zone
  if (distPct <= 0)  return 'text-sky-600 bg-sky-50 border-sky-200';               // at/near entry — buy zone
  if (distPct <= 5)  return 'text-amber-600 bg-amber-50 border-amber-200';         // approaching entry
  return 'text-gray-500 bg-gray-50 border-gray-200';                               // well below entry
}

function distanceLabel(distPct: number): string {
  if (distPct <= -3) return '已突破建議進場';
  if (distPct <= 0)  return '進場買入區間';
  if (distPct <= 3)  return '接近進場點';
  if (distPct <= 5)  return '等待回落';
  return '距進場尚遠';
}

function statusIcon(distPct: number) {
  if (distPct <= -3) return <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />;
  if (distPct <= 0)  return <CheckCircle className="w-3.5 h-3.5 text-sky-500" />;
  if (distPct <= 5)  return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
  return <Minus className="w-3.5 h-3.5 text-gray-400" />;
}

// ── Price Distance Bar Chart ─────────────────────────────────────────────────

function PriceDistanceChart({ stocks }: { stocks: IntradayStock[] }) {
  const data = stocks
    .filter((s) => s.live?.current != null)
    .map((s) => {
      const cur = s.live!.current!;
      const distToEntry = ((s.entry - cur) / s.entry) * 100;   // +ve = below entry, -ve = above
      const distToTarget = ((s.target - cur) / cur) * 100;     // remaining upside
      const distToStop = ((cur - s.stop_loss) / cur) * 100;    // buffer above stop
      return {
        name: s.name,
        stockId: s.stock_id,
        distToEntry: Math.round(distToEntry * 10) / 10,
        distToTarget: Math.round(distToTarget * 10) / 10,
        distToStop: Math.round(distToStop * 10) / 10,
        current: cur,
        entry: s.entry,
        target: s.target,
        stop_loss: s.stop_loss,
      };
    });

  if (data.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-purple-500" />
          價差分析圖
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          藍色 = 距建議進場點（正值=尚未到，負值=已突破）｜綠色 = 剩餘上漲空間｜紅色 = 停損緩衝
        </p>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} />
          <YAxis
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickFormatter={(v) => `${v}%`}
            width={44}
          />
          <ReferenceLine y={0} stroke="#e5e7eb" strokeDasharray="3 3" />
          <Tooltip
            formatter={(v: number, key: string) => {
              const labels: Record<string, string> = {
                distToEntry: '距進場點',
                distToTarget: '剩餘上漲空間',
                distToStop: '停損緩衝',
              };
              return [`${v.toFixed(1)}%`, labels[key] ?? key];
            }}
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
          <Bar dataKey="distToEntry" name="距進場點" fill="#38bdf8" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.distToEntry <= 0 ? '#34d399' : '#38bdf8'} />
            ))}
          </Bar>
          <Bar dataKey="distToTarget" name="剩餘上漲" fill="#34d399" radius={[3, 3, 0, 0]} />
          <Bar dataKey="distToStop" name="停損緩衝" fill="#f87171" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Stock Card ───────────────────────────────────────────────────────────────

function StockCard({ stock, rank }: { stock: IntradayStock; rank: number }) {
  const live = stock.live;
  const cur = live?.current ?? null;
  const hasCur = cur != null;

  // Distance from current price to entry suggestion
  const distToEntry = hasCur ? ((stock.entry - cur!) / stock.entry) * 100 : null;
  // Potential upside from current
  const uptarget = hasCur ? ((stock.target - cur!) / cur!) * 100 : null;
  // Buffer above stop loss
  const stopBuffer = hasCur ? ((cur! - stock.stop_loss) / cur!) * 100 : null;
  // Progress from entry to target (how far along)
  const progressToTarget = hasCur && stock.entry > 0
    ? Math.max(0, Math.min(100, ((cur! - stock.entry) / (stock.target - stock.entry)) * 100))
    : 0;

  const dimEntries = Object.entries(stock.dimensions ?? {}) as [string, number][];

  return (
    <div className={`rounded-xl border bg-white overflow-hidden transition-all hover:shadow-md ${
      distToEntry !== null && distToEntry <= 0
        ? 'border-emerald-300 shadow-emerald-100'
        : distToEntry !== null && distToEntry <= 3
        ? 'border-sky-200 shadow-sky-50'
        : 'border-gray-200'
    }`}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[10px] text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded">#{rank}</span>
              <span className="text-[10px] text-gray-400">{stock.sector}</span>
              {typeof stock.dimensions?.momentum === 'number' && (
                <span className="text-[9px] font-semibold text-red-500 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded">隔日沖</span>
              )}
            </div>
            <div className="font-bold text-gray-900">{stock.name}</div>
            <div className="text-xs text-gray-500 font-mono">{stock.stock_id}</div>
          </div>
          <div className="text-right">
            {hasCur ? (
              <>
                <div className="text-xl font-bold font-mono text-gray-900">{cur!.toFixed(1)}</div>
                <div className={`text-xs font-bold font-mono ${
                  (live?.change_pct ?? 0) >= 0 ? 'text-red-500' : 'text-green-600'
                }`}>
                  {live?.change_pct != null ? pct(live.change_pct) : '—'}
                </div>
              </>
            ) : (
              <div className="text-gray-400 text-sm">無報價</div>
            )}
          </div>
        </div>
      </div>

      {/* Entry distance status */}
      {distToEntry !== null && (
        <div className={`mx-4 mt-3 rounded-lg border px-3 py-2 flex items-center gap-2 ${distanceClass(distToEntry)}`}>
          {statusIcon(distToEntry)}
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold">{distanceLabel(distToEntry)}</div>
            <div className="text-[10px] opacity-75">
              現價 {cur!.toFixed(1)} vs 進場 {stock.entry.toFixed(1)}
              （{distToEntry > 0 ? '需再跌 ' : '已超出 '}{Math.abs(distToEntry).toFixed(1)}%）
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[11px] font-bold font-mono">{pct(-distToEntry, 1)}</div>
          </div>
        </div>
      )}

      {/* Price levels */}
      <div className="px-4 py-3 space-y-2">
        {/* Entry → Target progress bar */}
        {hasCur && (
          <div>
            <div className="flex justify-between text-[10px] text-gray-500 mb-1">
              <span>停損 {stock.stop_loss.toFixed(1)}</span>
              <span className="font-medium text-gray-700">進場 {stock.entry.toFixed(1)}</span>
              <span>目標 {stock.target.toFixed(1)}</span>
            </div>
            <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
              {/* Stop-to-entry zone (red) */}
              <div
                className="absolute inset-y-0 left-0 bg-red-100 rounded-l-full"
                style={{ width: `${Math.max(0, Math.min(30, (stock.entry - stock.stop_loss) / (stock.target - stock.stop_loss) * 100))}%` }}
              />
              {/* Entry-to-target zone (green) */}
              <div
                className="absolute inset-y-0 bg-emerald-100"
                style={{
                  left: `${Math.max(0, (stock.entry - stock.stop_loss) / (stock.target - stock.stop_loss) * 100)}%`,
                  right: 0,
                }}
              />
              {/* Progress fill */}
              {progressToTarget > 0 && (
                <div
                  className="absolute inset-y-0 left-0 bg-emerald-400 rounded-full"
                  style={{
                    left: `${Math.max(0, (stock.entry - stock.stop_loss) / (stock.target - stock.stop_loss) * 100)}%`,
                    width: `${progressToTarget * (1 - (stock.entry - stock.stop_loss) / (stock.target - stock.stop_loss))}%`,
                  }}
                />
              )}
              {/* Current price marker */}
              {hasCur && (
                <div
                  className="absolute inset-y-0 w-0.5 bg-sky-500 rounded"
                  style={{
                    left: `${Math.max(0, Math.min(100, (cur! - stock.stop_loss) / (stock.target - stock.stop_loss) * 100))}%`,
                  }}
                />
              )}
            </div>
          </div>
        )}

        {/* Key metrics row */}
        <div className="grid grid-cols-3 gap-2 mt-1">
          <div className="text-center">
            <div className="text-[9px] text-gray-400">潛在漲幅</div>
            <div className={`text-xs font-bold font-mono ${(uptarget ?? 0) > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
              {uptarget != null ? pct(uptarget, 1) : `+${stock.upside.toFixed(1)}%`}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[9px] text-gray-400">停損緩衝</div>
            <div className={`text-xs font-bold font-mono ${(stopBuffer ?? 0) > 0 ? 'text-orange-500' : 'text-red-500'}`}>
              {stopBuffer != null ? pct(-Math.abs(stopBuffer), 1) : '—'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[9px] text-gray-400">總評分</div>
            <div className="text-xs font-bold font-mono text-sky-600">{stock.total_score.toFixed(0)}</div>
          </div>
        </div>

        {/* OHLV row */}
        {live && hasCur && (
          <div className="grid grid-cols-4 gap-1 text-[10px] bg-gray-50 rounded-lg p-2">
            <div className="text-center">
              <div className="text-gray-400">開</div>
              <div className="font-mono text-gray-700">{live.open?.toFixed(1) ?? '—'}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">高</div>
              <div className="font-mono text-red-500">{live.high?.toFixed(1) ?? '—'}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">低</div>
              <div className="font-mono text-green-600">{live.low?.toFixed(1) ?? '—'}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">量(張)</div>
              <div className="font-mono text-gray-700">{live.volume != null ? (live.volume / 1000).toFixed(0) + 'K' : '—'}</div>
            </div>
          </div>
        )}

        {/* Dimension mini bars */}
        <div className="space-y-1 pt-1">
          {dimEntries.map(([dim, val]) => {
            const max = DIM_MAX[dim] ?? 10;
            return (
              <div key={dim} className="flex items-center gap-2">
                <span className="text-[9px] text-gray-400 w-8 shrink-0">{DIM_LABELS[dim]}</span>
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min((val / max) * 100, 100)}%`,
                      backgroundColor: DIM_COLORS[dim],
                    }}
                  />
                </div>
                <span className="text-[9px] font-mono text-gray-500 w-6 text-right">{val}</span>
              </div>
            );
          })}
        </div>

        {/* Recommendation badge */}
        <div className="pt-1">
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full border ${
            stock.recommendation?.includes('強力') ? 'bg-red-50 text-red-700 border-red-200' :
            stock.recommendation?.includes('買進') ? 'bg-sky-50 text-sky-700 border-sky-200' :
            'bg-gray-50 text-gray-600 border-gray-200'
          }`}>
            <Zap className="w-3 h-3" />{stock.recommendation}
          </span>
        </div>
      </div>

      {/* Live time footer */}
      {live?.time && (
        <div className="px-4 pb-3 flex items-center gap-1 text-[10px] text-gray-400">
          <Radio className="w-3 h-3" />報價時間 {live.time}
        </div>
      )}
    </div>
  );
}

// ── Market Breadth Bar ───────────────────────────────────────────────────────

function MarketSummaryBar({ stocks }: { stocks: IntradayStock[] }) {
  const liveStocks = stocks.filter((s) => s.live?.current != null);
  if (liveStocks.length === 0) return null;

  const atEntry = liveStocks.filter((s) => {
    const dist = ((s.entry - s.live!.current!) / s.entry) * 100;
    return dist <= 0;
  });
  const nearEntry = liveStocks.filter((s) => {
    const dist = ((s.entry - s.live!.current!) / s.entry) * 100;
    return dist > 0 && dist <= 3;
  });
  const waiting = liveStocks.filter((s) => {
    const dist = ((s.entry - s.live!.current!) / s.entry) * 100;
    return dist > 3;
  });

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
        <CheckCircle className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
        <div className="text-2xl font-bold text-emerald-700">{atEntry.length}</div>
        <div className="text-xs text-emerald-600">已達進場區</div>
      </div>
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-center">
        <AlertTriangle className="w-5 h-5 text-sky-500 mx-auto mb-1" />
        <div className="text-2xl font-bold text-sky-700">{nearEntry.length}</div>
        <div className="text-xs text-sky-600">接近進場（≤3%）</div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
        <Clock className="w-5 h-5 text-gray-400 mx-auto mb-1" />
        <div className="text-2xl font-bold text-gray-600">{waiting.length}</div>
        <div className="text-xs text-gray-500">等待中（{'>'}3%）</div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function IntradayPage() {
  const [stocks, setStocks] = useState<IntradayStock[]>([]);
  const [scanDate, setScanDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState('');
  const [now, setNow] = useState('');
  void now; // clock handled by TopNav
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString('zh-TW', {
          timeZone: 'Asia/Taipei',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Load base stock data — try intraday.json first (13:00 fresh scan), fall back to latest.json (19:00 scan)
  useEffect(() => {
    const loadIntraday = fetch(`${BASE}/data/intraday.json?ts=${Date.now()}`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error('no intraday');
        return r.json();
      })
      .then((d) => {
        const base: IntradayStock[] = (d.stocks ?? []).map((s: any) => ({
          stock_id: s.stock_id,
          name: s.name,
          sector: s.sector ?? '',
          entry: s.entry,
          stop_loss: s.stop_loss,
          target: s.target1 || s.target,
          target1: s.target1,
          target2: s.target2,
          target3: s.target3,
          upside: s.upside,
          total_score: s.total_score,
          recommendation: s.recommendation,
          dimensions: s.dimensions,
        }));
        setStocks(base);
        setScanDate(d.date || d.scan_date || '');
        setLastUpdated(
          new Date().toLocaleTimeString('zh-TW', {
            timeZone: 'Asia/Taipei',
            hour: '2-digit', minute: '2-digit',
          })
        );
        setLoading(false);
      });

    const loadLatest = loadIntraday.catch(() =>
      fetch(`${BASE}/data/latest.json`, { cache: 'no-store' })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<LatestData>;
        })
        .then((d) => {
          const base: IntradayStock[] = (d.explosive_top5 ?? []).map((s) => ({
            stock_id: s.stock_id,
            name: s.name,
            sector: s.sector ?? '',
            entry: s.strategy.entry,
            stop_loss: s.strategy.stop_loss,
            target: s.strategy.target,
            target1: s.strategy.target1,
            target2: s.strategy.target2,
            target3: s.strategy.target3,
            upside: s.strategy.upside,
            total_score: s.total_score,
            recommendation: s.strategy.recommendation,
            dimensions: s.dimensions,
          }));
          setStocks(base);
          setScanDate(d.scan_date);
          setLoading(false);
        })
    );

    loadLatest.catch((e) => {
      setError(e.message);
      setLoading(false);
    });
  }, []);

  // Fetch live prices
  const refreshLive = useCallback(async () => {
    if (stocks.length === 0) return;
    setRefreshing(true);
    try {
      const quotes = await fetchLiveQuotes(stocks.map((s) => s.stock_id));
      setStocks((prev) =>
        prev.map((s) => ({ ...s, live: quotes[s.stock_id] }))
      );
      setLastUpdated(
        new Date().toLocaleTimeString('zh-TW', {
          timeZone: 'Asia/Taipei',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        })
      );
    } catch {
      // silent fail — keep old data
    } finally {
      setRefreshing(false);
    }
  }, [stocks]);

  // Initial live fetch once stocks are loaded
  useEffect(() => {
    if (stocks.length > 0 && !stocks[0].live) {
      refreshLive();
    }
  }, [stocks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 60s when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(refreshLive, 60_000);
    return () => clearInterval(id);
  }, [autoRefresh, refreshLive]);

  // Sort: stocks at/near entry first
  const sortedStocks = useMemo(() => {
    return [...stocks].sort((a, b) => {
      const distA = a.live?.current != null
        ? ((a.entry - a.live.current) / a.entry) * 100 : 999;
      const distB = b.live?.current != null
        ? ((b.entry - b.live.current) / b.entry) * 100 : 999;
      return distA - distB;
    });
  }, [stocks]);

  const isMarketHours = useMemo(() => {
    const h = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour: 'numeric', hour12: false });
    const n = parseInt(h, 10);
    return n >= 9 && n < 14;
  }, []);

  const intradayRightSlot = (
    <>
      <button
        onClick={() => setAutoRefresh((v) => !v)}
        className={`p-1.5 rounded-lg transition-colors text-[10px] flex items-center gap-1 ${
          autoRefresh
            ? 'text-emerald-600 bg-emerald-50 border border-emerald-200'
            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
        }`}
        title="自動刷新（每 60 秒）"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin-slow' : ''}`} />
        <span className="hidden sm:inline">{autoRefresh ? '自動' : '手動'}</span>
      </button>
      <button
        onClick={refreshLive}
        disabled={refreshing}
        className="p-1.5 rounded-lg text-gray-400 hover:text-sky-600 hover:bg-sky-50 transition-colors disabled:opacity-40"
        title="立即刷新報價"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
      </button>
    </>
  );

  return (
    <div className="min-h-dvh bg-white text-gray-900 font-sans flex flex-col">
      <TopNav rightSlot={intradayRightSlot} />

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-5">
        {/* Hero */}
        <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-900 via-gray-900 to-sky-950/30 px-5 py-5 relative overflow-hidden mb-5">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(56,189,248,0.06),transparent_60%)] pointer-events-none" />
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <Radio className="w-5 h-5 text-sky-400 animate-pulse" />
                盤中即時雷達
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-normal border ${
                  isMarketHours
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                    : 'text-gray-400 bg-gray-500/10 border-gray-500/20'
                }`}>
                  {isMarketHours ? '交易中' : '收盤後'}
                </span>
              </h1>
              <p className="text-xs text-gray-400 mt-1">
                {stocks.length > 0 && stocks[0].dimensions?.momentum !== undefined
                  ? '盤中掃描 Top 5 隔日沖候選 — 即時報價 · 動能量能突破跳空四維評分'
                  : '追蹤 Top 5 推薦標的目前價位 vs 建議進場點距離，即時判斷進場時機'}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {['即時報價', '進場距離計算', '自動刷新', 'TWSE 直連'].map((t) => (
                  <span key={t} className="text-[10px] text-sky-300/80 bg-sky-500/8 border border-sky-500/15 px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            </div>
            <div className="text-right">
              {scanDate && (
                <>
                  <div className="text-[10px] text-gray-500 mb-1">推薦基準日</div>
                  <div className="text-base font-mono font-bold text-sky-400">{scanDate}</div>
                </>
              )}
              {lastUpdated && (
                <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-1 justify-end">
                  <Radio className="w-3 h-3 text-emerald-400" />報價更新 {lastUpdated}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Market hours notice */}
        {!isMarketHours && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-5 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <div>
              <span className="text-sm font-medium text-amber-800">目前非交易時段（09:00–13:30）</span>
              <span className="text-xs text-amber-600 ml-2">顯示最後收盤價，盤中報價請於交易時段查看</span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-gray-100 animate-pulse" />)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(5)].map((_, i) => <div key={i} className="h-80 rounded-xl bg-gray-100 animate-pulse" />)}
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-12 text-center">
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-red-600 font-medium">資料載入失敗</p>
            <p className="text-xs text-red-400 mt-1">{error}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Market summary bar */}
            <MarketSummaryBar stocks={sortedStocks} />

            {/* Price distance chart */}
            <PriceDistanceChart stocks={sortedStocks} />

            {/* Stock cards grid */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-sky-500" />
                  即時監控 — Top 5 標的
                  <span className="text-[11px] text-gray-400 font-normal">（按進場距離由近至遠排列）</span>
                </h2>
                {refreshing && (
                  <span className="flex items-center gap-1 text-xs text-sky-500">
                    <RefreshCw className="w-3 h-3 animate-spin" />更新中
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {sortedStocks.map((s, i) => (
                  <StockCard key={s.stock_id} stock={s} rank={i + 1} />
                ))}
              </div>
            </div>

            {/* Instructions */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />使用說明
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[11px] text-gray-600">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  <div><span className="font-medium text-emerald-700">已達進場區</span>：現價已達或突破建議進場點，可考慮建立部位</div>
                </div>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-sky-500 mt-0.5 shrink-0" />
                  <div><span className="font-medium text-sky-700">接近進場點</span>：距進場點 3% 以內，持續關注，準備進場</div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <div><span className="font-medium text-amber-700">等待中</span>：距進場點超過 3%，耐心等待回落至建議區間</div>
                </div>
                <div className="flex items-start gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-gray-500 mt-0.5 shrink-0" />
                  <div><span className="font-medium text-gray-700">自動刷新</span>：開啟後每 60 秒自動更新 TWSE 即時報價</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 py-6 mt-4">
        <div className="max-w-screen-xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <RadarIcon className="w-4 h-4 text-sky-400" />
              <span className="text-sm font-semibold text-gray-700">台股雷達</span>
              <span className="text-[10px] text-gray-400">Taiwan Stock Radar v3.1</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-gray-500">
              <span>即時報價：TWSE mis API</span>
              <span className="hidden sm:inline text-gray-300">|</span>
              <span>13:00 盤中掃描 · 19:00 收盤覆盤</span>
              <span className="hidden sm:inline text-gray-300">|</span>
              <a href="https://github.com/juststarlight66-oss/taiwan-stock-radar" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1">
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
