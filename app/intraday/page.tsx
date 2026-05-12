'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import {
  TrendingDown, Minus, Clock, RefreshCw,
  Target, AlertTriangle, CheckCircle, Zap, Share2,
  ScanLine as RadarIcon, ArrowUpRight, ArrowDownRight,
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
  entry: number;
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
  top10?: {
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
  explosive_top5?: LatestData['top10'];
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(v: number, digits = 2) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

async function fetchLiveQuotes(stockIds: string[]): Promise<Record<string, LiveQuote>> {
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
      const current = parseFloat(m.z) || parseFloat(m.y) || null;
      const prev_close = parseFloat(m.y) || null;
      result[id] = {
        stock_id: id,
        name: m.n ?? '',
        current,
        open: parseFloat(m.o) || null,
        high: parseFloat(m.h) || null,
        low: parseFloat(m.l) || null,
        prev_close,
        volume: parseInt(m.v) || null,
        time: m.t ?? '',
        date: m.d ?? '',
        change_pct: current && prev_close ? ((current - prev_close) / prev_close) * 100 : null,
      };
    }
    return result;
  } catch {
    return {};
  }
}

// ── Score Bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pctVal = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-10 text-gray-500">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pctVal}%`, backgroundColor: color }} />
      </div>
      <span className="w-8 text-right tabular-nums font-medium">{value}</span>
    </div>
  );
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ stock }: { stock: IntradayStock }) {
  const live = stock.live;
  if (!live?.current) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">載入中</span>;
  }
  const dist = ((live.current - stock.entry) / stock.entry) * 100;
  if (dist <= 0 && dist >= -3) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">⭐ 可买區間</span>;
  } else if (dist > 0 && dist <= 3) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">接近進場</span>;
  } else if (dist > 3) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">等待回落</span>;
  } else {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">高於進場價</span>;
  }
}

// ── Mini Chart ───────────────────────────────────────────────────────────────

function DimensionChart({ dims }: { dims: IntradayStock['dimensions'] }) {
  const entries = Object.entries(dims).map(([k, v]) => ({
    name: DIM_LABELS[k] ?? k,
    value: v,
    max: DIM_MAX[k] ?? 40,
    color: DIM_COLORS[k] ?? '#94a3b8',
    fill: DIM_COLORS[k] ?? '#94a3b8',
  }));

  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={entries} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 30 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={35} />
        <Tooltip />
        <ReferenceLine x={0} stroke="#e2e8f0" />
        {entries.map((e, i) => <Cell key={i} fill={e.fill} />)}
        <Bar dataKey="value" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Stock Card ────────────────────────────────────────────────────────────────

function StockCard({ stock, expanded, onToggle }: {
  stock: IntradayStock;
  expanded: boolean;
  onToggle: () => void;
}) {
  const live = stock.live;
  const changePct = live?.change_pct ?? null;
  const isUp = changePct !== null && changePct >= 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div onClick={onToggle} className="p-4 cursor-pointer flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-gray-400">{stock.stock_id}</span>
            <span className="font-semibold text-gray-900 truncate">{stock.name}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{stock.sector}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-sky-50 text-sky-600">{stock.recommendation}</span>
          </div>
          {live?.current ? (
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold tabular-nums">{live.current.toFixed(2)}</span>
              <span className={`text-sm tabular-nums ${isUp ? 'text-red-500' : 'text-green-500'}`}>
                {changePct !== null ? pct(changePct) : '—'}
              </span>
            </div>
          ) : (
            <div className="mt-1 text-sm text-gray-400">載入中...</div>
          )}
        </div>
        <div className="text-right">
          <div className="text-2xl font-black text-sky-500 tabular-nums">{stock.total_score}</div>
          <div className="text-xs text-gray-400">總分</div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-3">
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="bg-gray-50 rounded-lg p-2">
              <div className="text-gray-400">進場價</div>
              <div className="font-bold text-gray-800">{stock.entry.toFixed(2)}</div>
            </div>
            <div className="bg-red-50 rounded-lg p-2">
              <div className="text-red-400">止損</div>
              <div className="font-bold text-red-600">{stock.stop_loss.toFixed(2)}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-2">
              <div className="text-green-400">目標</div>
              <div className="font-bold text-green-600">{stock.target.toFixed(2)}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">預期漲幅</span>
            <span className="font-bold text-green-600">+{stock.upside.toFixed(1)}%</span>
          </div>

          <DimensionChart dims={stock.dimensions} />

          <div className="space-y-1">
            {Object.entries(stock.dimensions).map(([k, v]) => (
              <ScoreBar key={k} label={DIM_LABELS[k] ?? k} value={v} max={DIM_MAX[k] ?? 40} color={DIM_COLORS[k] ?? '#94a3b8'} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function IntradayPage() {
  const [snapshot, setSnapshot] = useState<IntradaySnapshot | null>(null);
  const [latestData, setLatestData] = useState<LatestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'intraday' | 'latest'>('intraday');
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [intradayRes, latestRes] = await Promise.all([
        fetch(`${BASE}/data/intraday.json`, { cache: 'no-store' }),
        fetch(`${BASE}/data/latest.json`, { cache: 'no-store' }),
      ]);

      const rawIntraday: any = await intradayRes.json();
      const intradayData: IntradaySnapshot = rawIntraday as IntradaySnapshot;

      // Build fallback live quotes from intraday.json top5[].intraday_snapshot
      // (used when TWSE real-time API is unreachable from browser)
      const fallbackQuotes: Record<string, LiveQuote> = {};
      for (const s of rawIntraday.top5 ?? []) {
        const snap = s.intraday_snapshot;
        if (snap && s.stock_id) {
          fallbackQuotes[s.stock_id] = {
            stock_id: s.stock_id,
            name: s.stock_name ?? '',
            current: snap.price ?? null,
            open: snap.open ?? null,
            high: snap.high ?? null,
            low: snap.low ?? null,
            prev_close: snap.yesterday_close ?? null,
            volume: snap.volume ?? null,
            time: snap.time ?? '',
            date: rawIntraday.scan_date ?? '',
            change_pct: snap.change_pct ?? null,
          };
        }
      }

      const latest: LatestData = await latestRes.json();

      const latestStocks: IntradayStock[] = (latest.top10 ?? latest.explosive_top5 ?? []).map((s) => ({
        stock_id: s.stock_id,
        name: s.name,
        sector: s.sector,
        entry: s.strategy?.entry ?? s.close,
        stop_loss: s.strategy?.stop_loss ?? s.close * 0.95,
        target: s.strategy?.target ?? s.close * 1.1,
        target1: s.strategy?.target1,
        target2: s.strategy?.target2,
        target3: s.strategy?.target3,
        upside: s.strategy?.upside ?? 0,
        total_score: s.total_score,
        recommendation: s.strategy?.recommendation ?? '觀望',
        dimensions: s.dimensions,
      }));

      const allIds = [
        ...intradayData.stocks.map((s) => s.stock_id),
        ...latestStocks.map((s) => s.stock_id),
      ];
      const uniqueIds = [...new Set(allIds)];
      const quotes = await fetchLiveQuotes(uniqueIds);

      // Merge: TWSE real-time quotes override intraday snapshot fallbacks
      const mergedQuotes: Record<string, LiveQuote> = { ...fallbackQuotes, ...quotes };

      intradayData.stocks = intradayData.stocks.map((s) => ({ ...s, live: mergedQuotes[s.stock_id] }));
      const latestWithLive = latestStocks.map((s) => ({ ...s, live: mergedQuotes[s.stock_id] }));

      setSnapshot(intradayData);
      setLatestData({ ...latest, top10: latestWithLive as unknown as LatestData['top10'] });
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const intradayStocks = snapshot?.stocks ?? [];
  const latestStocks = useMemo(() => {
    if (!latestData) return [];
    const raw = latestData.top10 ?? latestData.explosive_top5 ?? [];
    return raw as unknown as IntradayStock[];
  }, [latestData]);

  const activeStocks = activeTab === 'intraday' ? intradayStocks : latestStocks;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">載入盤中數據...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      
      <div className="bg-gradient-to-r from-sky-500 to-indigo-600 text-white">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Radio className="w-5 h-5 animate-pulse text-red-300" />
                盤中即時掃描
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded">LIVE</span>
              </h1>
              <p className="text-sm text-sky-100 mt-1">加權動能·量能·突破·跳空四維評分，Top 5 隔日沖候選</p>
            </div>
            <button onClick={handleRefresh} disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? '更新中' : '重新載入'}
            </button>
          </div>
          {lastRefresh && (
            <p className="text-xs text-sky-200 mt-2">
              最後更新 {lastRefresh.toLocaleTimeString('zh-TW')}
            </p>
          )}
          {snapshot && (
            <div className="flex items-center gap-3 mt-3 text-sm text-sky-100">
              <span>盤中掃描：{snapshot.scan_date}</span>
              <span className="bg-white/10 px-2 py-0.5 rounded">{intradayStocks.length} 支候選</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 flex gap-2">
        <button onClick={() => setActiveTab('intraday')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'intraday'
              ? 'bg-sky-500 text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-sky-200'
          }`}>
          <Zap className="w-4 h-4" />
          盤中候選
        </button>
        <button onClick={() => setActiveTab('latest')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'latest'
              ? 'bg-sky-500 text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-sky-200'
          }`}>
          <Clock className="w-4 h-4" />
          昨日推薦
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 pb-8 space-y-3">
        {activeStocks.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            未找到相符法件的股票
          </div>
        ) : (
          activeStocks.map((stock) => (
            <StockCard key={stock.stock_id} stock={stock}
              expanded={expandedId === stock.stock_id}
              onToggle={() => setExpandedId(expandedId === stock.stock_id ? null : stock.stock_id)}
            />
          ))
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4 pb-8 text-center text-xs text-gray-300 space-y-1">
        <p>盤中即時行情小延遲提供，僅供參考。</p>
        <p>進場價為昨日收盤價之近小垂點，實際操作請審慎評估个人風險承受能力。</p>
      </div>
    </div>
  );
}
