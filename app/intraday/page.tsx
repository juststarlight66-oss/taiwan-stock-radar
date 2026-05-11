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
  // v2 scanner uses top10; legacy used explosive_top5
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

/** Fetch live quotes from TWSE for a list of stock IDs (mix of TWSE/TPEx) */
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
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-gray-500 w-8 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pctVal}%`, backgroundColor: color }} />
      </div>
      <span className="text-[11px] font-mono text-gray-700 w-6 text-right">{value}</span>
    </div>
  );
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ stock }: { stock: IntradayStock }) {
  const live = stock.live;
  if (!live?.current) {
    return <span className="text-[10px] text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">載入中</span>;
  }
  const dist = ((live.current - stock.entry) / stock.entry) * 100;
  if (dist <= 0 && dist >= -3) {
    return <span className="text-[10px] text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full font-medium">⭐ 可买區間</span>;
  } else if (dist > 0 && dist <= 3) {
    return <span className="text-[10px] text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">接近進場</span>;
  } else if (dist > 3) {
    return <span className="text-[10px] text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">等待回落</span>;
  } else {
    return <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">高於進場價</span>;
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
    <ResponsiveContainer width="100%" height={80}>
      <BarChart data={entries} margin={{ top: 2, right: 4, left: -20, bottom: 0 }} barSize={14}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
        <YAxis domain={[0, 40]} tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
        <Bar dataKey="value" radius={[2, 2, 0, 0]}>
          {entries.map((e, i) => <Cell key={i} fill={e.fill} />)}
        </Bar>
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
    <div
      className="rounded-xl border border-gray-200 bg-white overflow-hidden cursor-pointer hover:border-sky-200 hover:shadow-sm transition-all"
      onClick={onToggle}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-gray-900">{stock.stock_id}</span>
              <span className="text-sm text-gray-700">{stock.name}</span>
              <StatusBadge stock={stock} />
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-gray-400">{stock.sector}</span>
              <span className="text-[10px] text-sky-600 bg-sky-50 px-1.5 py-px rounded font-medium">{stock.recommendation}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {live?.current ? (
            <div className="text-right">
              <div className="text-sm font-bold text-gray-900">{live.current.toFixed(2)}</div>
              <div className={`text-xs font-medium ${isUp ? 'text-red-500' : 'text-green-600'}`}>
                {changePct !== null ? pct(changePct) : '—'}
              </div>
            </div>
          ) : (
            <div className="text-right">
              <div className="text-xs text-gray-400">載入中...</div>
            </div>
          )}
          <div className="text-center">
            <div className="text-lg font-bold text-sky-600">{stock.total_score}</div>
            <div className="text-[10px] text-gray-400">總分</div>
          </div>
          <Eye className={`w-4 h-4 transition-colors ${expanded ? 'text-sky-500' : 'text-gray-300'}`} />
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50 space-y-3">
          {/* Price levels */}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <div className="text-[10px] text-gray-400">進場價</div>
              <div className="text-sm font-bold text-gray-900">{stock.entry.toFixed(2)}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-400">止損</div>
              <div className="text-sm font-bold text-red-500">{stock.stop_loss.toFixed(2)}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-400">目標</div>
              <div className="text-sm font-bold text-green-600">{stock.target.toFixed(2)}</div>
            </div>
          </div>

          {/* Upside */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">預期漲幅</span>
            <span className="font-bold text-green-600">+{stock.upside.toFixed(1)}%</span>
          </div>

          {/* Dimension chart */}
          <DimensionChart dims={stock.dimensions} />

          {/* Score bars */}
          <div className="space-y-1">
            {Object.entries(stock.dimensions).map(([k, v]) => (
              <ScoreBar
                key={k}
                label={DIM_LABELS[k] ?? k}
                value={v}
                max={DIM_MAX[k] ?? 40}
                color={DIM_COLORS[k] ?? '#94a3b8'}
              />
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

      const intradayData: IntradaySnapshot = await intradayRes.json();
      const latest: LatestData = await latestRes.json();

      // Normalize latest data stocks into IntradayStock format
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

      // Fetch live quotes for all stocks
      const allIds = [
        ...intradayData.stocks.map((s) => s.stock_id),
        ...latestStocks.map((s) => s.stock_id),
      ];
      const uniqueIds = [...new Set(allIds)];
      const quotes = await fetchLiveQuotes(uniqueIds);

      // Attach live quotes
      intradayData.stocks = intradayData.stocks.map((s) => ({ ...s, live: quotes[s.stock_id] }));
      const latestWithLive = latestStocks.map((s) => ({ ...s, live: quotes[s.stock_id] }));

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
      <div className="min-h-dvh bg-white flex flex-col">
        <TopNav />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <RadarIcon className="w-8 h-8 text-sky-400 animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">載入盤中數據...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-dvh bg-white flex flex-col">
        <TopNav />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
            <p className="text-sm text-gray-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gray-50 text-gray-900 font-sans flex flex-col">
      <TopNav />

      <main className="flex-1 max-w-screen-lg mx-auto w-full px-4 py-5 space-y-4">

        {/* Hero */}
        <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-900 via-gray-900 to-sky-950/30 px-5 py-5 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(56,189,248,0.06),transparent_60%)] pointer-events-none" />
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <RadarIcon className="w-5 h-5 text-sky-400" />
                盤中即時掃描
                <span className="text-[10px] text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-full font-normal">LIVE</span>
              </h1>
              <p className="text-xs text-gray-400 mt-1">加權動能·量能·突破·跳空四維評分，Top 5 隔日沖候選</p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-[11px] text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/15 border border-sky-500/20 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? '更新中' : '重新載入'}
            </button>
          </div>

          {lastRefresh && (
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-500">
              <Clock className="w-3 h-3" />
              最後更新 {lastRefresh.toLocaleTimeString('zh-TW')}
            </div>
          )}

          {snapshot && (
            <div className="mt-3 flex flex-wrap gap-3">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                <Target className="w-3.5 h-3.5 text-sky-400" />
                盤中掃描：{snapshot.scan_date}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                {intradayStocks.length} 支候選
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('intraday')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'intraday'
                ? 'bg-sky-500 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-sky-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            盤中候選
          </button>
          <button
            onClick={() => setActiveTab('latest')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'latest'
                ? 'bg-sky-500 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-sky-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            昨日推薦
          </button>
        </div>

        {/* Stock list */}
        <div className="space-y-3">
          {activeStocks.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">未找到相符法件的股票</p>
            </div>
          ) : (
            activeStocks.map((stock) => (
              <StockCard
                key={stock.stock_id}
                stock={stock}
                expanded={expandedId === stock.stock_id}
                onToggle={() => setExpandedId(expandedId === stock.stock_id ? null : stock.stock_id)}
              />
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-gray-500 space-y-1">
              <p>盤中即時行情小延遲提供，僅供參考。</p>
              <p>進場價為昨日收盤價之近小垂點，實際操作請審慎評估个人風險承受能力。</p>
            </div>
          </div>
        </div>

      </main>

      <footer className="border-t border-gray-200 bg-white py-4 mt-4">
        <div className="max-w-screen-lg mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RadarIcon className="w-4 h-4 text-sky-400" />
            <span className="text-sm font-semibold text-gray-700">台股雷達</span>
            <span className="text-[10px] text-gray-400">Intraday Scan v1.0</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-gray-500">
            <span>盤中 13:00 自動更新</span>
            <a
              href="https://github.com/juststarlight66-oss/taiwan-stock-radar"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <Share2 className="w-3 h-3" />
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
