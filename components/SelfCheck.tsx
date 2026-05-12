'use client';
import { useState, useMemo, useCallback } from 'react';
import { useAllScores, useOnDemandScan } from '@/lib/useScanData';
import { ScanStock, DIMENSION_CONFIG } from '@/lib/scanTypes';
import {
  Search, X, AlertCircle, ChevronDown, ChevronUp,
  ArrowUpRight, ArrowDownRight, Plus, Trash2, Share2, Check,
  Shield, Target,
} from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
} from 'recharts';

const ACTION_MAP: Record<string, { label: string; text: string; bg: string; border: string; dot: string }> = {
  '強力買進': { label: '強力買進 🔥', text: 'text-red-600 font-bold',    bg: 'bg-red-50',     border: 'border-red-200',    dot: 'bg-red-500' },
  '買進':     { label: '買進 ✅',      text: 'text-orange-600 font-bold', bg: 'bg-orange-50',  border: 'border-orange-200', dot: 'bg-orange-500' },
  '觀望':     { label: '觀望 ⏳',      text: 'text-gray-500',             bg: 'bg-gray-50',    border: 'border-gray-200',   dot: 'bg-gray-400' },
  '偏弱':     { label: '偏弱 ⚠️',     text: 'text-emerald-600',          bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
};

const DIM_KEYS = Object.keys(DIMENSION_CONFIG);
const DIM_COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];

function ScoreBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 70 ? 'bg-violet-500' : pct >= 50 ? 'bg-sky-500' : pct >= 30 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="w-full bg-gray-200 rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-6 w-32 rounded bg-gray-200" />
        <div className="h-8 w-16 rounded bg-gray-200" />
      </div>
      <div className="h-4 w-full rounded bg-gray-200" />
      <div className="h-4 w-3/4 rounded bg-gray-200" />
      <div className="grid grid-cols-3 gap-2">
        {[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded bg-gray-200" />)}
      </div>
    </div>
  );
}

function CompareRadar({ stocks }: { stocks: ScanStock[] }) {
  const data = DIM_KEYS.map((key) => {
    const cfg = DIMENSION_CONFIG[key];
    const entry: Record<string, string | number> = { dim: cfg.label };
    stocks.forEach((s) => {
      const raw = (s.dimensions as unknown as Record<string, number>)?.[key] ?? 0;
      entry[s.stock_id] = Math.round((raw / cfg.max) * 100);
    });
    return entry;
  });
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-xs font-semibold text-gray-500 mb-3">五維度比較雷達圖</h3>
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis dataKey="dim" tick={{ fontSize: 11, fill: '#6b7280' }} />
          {stocks.map((s, i) => (
            <Radar
              key={s.stock_id}
              name={`${s.stock_id} ${s.stock_name ?? s.name ?? ''}`}
              dataKey={s.stock_id}
              stroke={DIM_COLORS[i % DIM_COLORS.length]}
              fill={DIM_COLORS[i % DIM_COLORS.length]}
              fillOpacity={0.12}
              strokeWidth={1.5}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3 mt-2 justify-center">
        {stocks.map((s, i) => (
          <span key={s.stock_id} className="flex items-center gap-1 text-xs text-gray-600">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: DIM_COLORS[i % DIM_COLORS.length] }} />
            {s.stock_id} {s.stock_name ?? s.name ?? ''}
          </span>
        ))}
      </div>
    </div>
  );
}

function StockCard({
  stock,
  onRemove,
  rank,
}: {
  stock: ScanStock;
  onRemove: () => void;
  rank: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const action = stock.recommendation ?? '';
  const actionStyle = ACTION_MAP[action] ?? ACTION_MAP['觀望'];
  const dims = DIM_KEYS.map((k) => ({
    key: k,
    label: DIMENSION_CONFIG[k].label,
    max: DIMENSION_CONFIG[k].max,
    value: (stock.dimensions as unknown as Record<string, number>)?.[k] ?? 0,
  }));

  return (
    <div className={`rounded-xl border ${actionStyle.border} ${actionStyle.bg} p-5 space-y-3 relative`}>
      <button
        onClick={onRemove}
        className="absolute top-3 right-3 text-gray-400 hover:text-red-500 transition-colors"
        aria-label="移除"
      >
        <X size={14} />
      </button>

      {/* Header */}
      <div className="flex items-start justify-between pr-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400">#{rank}</span>
            <span className="font-bold text-gray-900 text-base">{stock.stock_name ?? stock.name ?? stock.stock_id}</span>
            <span className="text-xs text-gray-500">{stock.stock_id}</span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{stock.sector_name ?? stock.sector ?? '—'}</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-gray-900">{stock.total_score}</div>
          <div className="text-xs text-gray-400">總分</div>
        </div>
      </div>

      {/* Price */}
      {stock.close != null && (
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-gray-800">${stock.close.toFixed(2)}</span>
          {stock.change_pct != null && (
            <span className={`flex items-center gap-0.5 text-xs font-medium ${
              stock.change_pct >= 0 ? 'text-red-600' : 'text-green-600'
            }`}>
              {stock.change_pct >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {Math.abs(stock.change_pct).toFixed(2)}%
            </span>
          )}
        </div>
      )}

      {/* Action badge */}
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${actionStyle.border} ${actionStyle.bg}`}>
        <span className={`w-2 h-2 rounded-full ${actionStyle.dot}`} />
        <span className={actionStyle.text}>{actionStyle.label}</span>
      </div>

      {/* Dimension scores */}
      <div className="space-y-1.5">
        {dims.map(({ key, label, max, value }) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-16 shrink-0">{label}</span>
            <div className="flex-1">
              <ScoreBar value={value} max={max} />
            </div>
            <span className="text-xs font-medium text-gray-700 w-8 text-right">{value}/{max}</span>
          </div>
        ))}
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-800 transition-colors"
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {expanded ? '收起' : '展開詳情'}
      </button>

      {expanded && (
        <div className="space-y-3 pt-2 border-t border-gray-100">
          {/* Entry/exit */}
          {(stock.entry_low != null || stock.entry_high != null) && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-white border border-gray-200 p-2">
                <div className="text-gray-400 mb-0.5 flex items-center gap-1"><Target size={10}/>進場區間</div>
                <div className="font-semibold text-gray-800">
                  {stock.entry_low ?? 0} – {stock.entry_high ?? 0}
                </div>
              </div>
              <div className="rounded-lg bg-white border border-red-100 p-2">
                <div className="text-gray-400 mb-0.5 flex items-center gap-1"><Shield size={10}/>止損</div>
                <div className="font-semibold text-red-600">{stock.stop_loss ?? 0}</div>
              </div>
            </div>
          )}
          {/* Targets */}
          {stock.target1 != null && (
            <div className="flex gap-2 text-xs">
              {[stock.target1, stock.target2, stock.target3].filter(Boolean).map((t, i) => (
                <div key={i} className="rounded-lg bg-white border border-green-100 p-2 flex-1 text-center">
                  <div className="text-gray-400 mb-0.5">T{i + 1}</div>
                  <div className="font-semibold text-green-600">{t}</div>
                </div>
              ))}
            </div>
          )}
          {/* Reason */}
          {stock.reason && (
            <p className="text-xs text-gray-600 leading-relaxed">{stock.reason}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function SelfCheck() {
  const { stocks: allStocks, isLoading: allLoading, error: allError } = useAllScores();
  const { stock: scannedStock, isLoading: scanning, error: scanError, scan, reset } = useOnDemandScan();

  const [query, setQuery] = useState('');
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  // Search suggestions
  const suggestions = useMemo(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return allStocks
      .filter(
        (s) =>
          s.stock_id.startsWith(q) ||
          (s.stock_name ?? s.name ?? '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, allStocks]);

  const watchlistStocks = useMemo(
    () => allStocks.filter((s) => watchlist.includes(s.stock_id)),
    [allStocks, watchlist]
  );

  const handleAdd = useCallback(
    (stockId: string) => {
      if (!watchlist.includes(stockId)) {
        setWatchlist((prev) => [...prev, stockId]);
      }
      setQuery('');
    },
    [watchlist]
  );

  const handleRemove = useCallback(
    (stockId: string) => setWatchlist((prev) => prev.filter((id) => id !== stockId)),
    []
  );

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!query) return;
      scan(query.toUpperCase());
    },
    [query, scan]
  );

  const handleShare = useCallback(async () => {
    const text = watchlist.join(',');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [watchlist]);

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div className="relative">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); reset(); }}
              placeholder="輸入股票代號或名稱搜尋..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm
                         focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={!query || scanning}
            className="px-4 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium
                       hover:bg-sky-600 disabled:opacity-40 transition-colors"
          >
            {scanning ? '掃描中...' : '掃描'}
          </button>
        </form>

        {/* Suggestions dropdown */}
        {suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
            {suggestions.map((s) => (
              <button
                key={s.stock_id}
                onClick={() => handleAdd(s.stock_id)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-sky-50 transition-colors text-sm"
              >
                <span>
                  <span className="font-medium text-gray-900">{s.stock_id}</span>
                  <span className="ml-2 text-gray-500">{s.stock_name ?? s.name}</span>
                </span>
                <span className="text-xs text-sky-600 flex items-center gap-1">
                  <Plus size={12} /> 加入自選清單
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Scan result */}
      {scanning && <SkeletonCard />}
      {scanError && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
          <AlertCircle size={14} />
          <span>掃描失敗：{scanError.message}</span>
        </div>
      )}
      {scannedStock && (
        <div className="space-y-2">
          <div className="text-xs text-gray-400 font-medium">掃描結果</div>
          <StockCard stock={scannedStock} rank={1} onRemove={reset} />
          <button
            onClick={() => handleAdd(scannedStock.stock_id)}
            disabled={watchlist.includes(scannedStock.stock_id)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-sky-200
                       bg-sky-50 text-sky-700 text-sm font-medium hover:bg-sky-100
                       disabled:opacity-40 transition-colors"
          >
            <Plus size={14} /> 加入自選清單
          </button>
        </div>
      )}

      {/* Watchlist */}
      {watchlistStocks.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              自選清單 <span className="text-gray-400 font-normal">({watchlistStocks.length})</span>
            </h2>
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-sky-600 transition-colors"
            >
              {copied ? <Check size={12} className="text-green-500" /> : <Share2 size={12} />}
              {copied ? '已複製' : '分享清單'}
            </button>
          </div>

          {allLoading
            ? [...Array(2)].map((_, i) => <SkeletonCard key={i} />)
            : watchlistStocks.map((s, i) => (
                <StockCard
                  key={s.stock_id}
                  stock={s}
                  rank={i + 1}
                  onRemove={() => handleRemove(s.stock_id)}
                />
              ))}

          {watchlistStocks.length >= 2 && (
            <CompareRadar stocks={watchlistStocks.slice(0, 5)} />
          )}

          <button
            onClick={() => setWatchlist([])}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-red-100
                       text-red-400 text-xs hover:bg-red-50 transition-colors"
          >
            <Trash2 size={12} /> 清空所有
          </button>
        </div>
      )}

      {/* Error state for allScores */}
      {allError && (
        <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <AlertCircle size={14} />
          <span>無法載入全市場資料，搜尋功能可能受限</span>
        </div>
      )}

      {/* Empty state */}
      {watchlist.length === 0 && !scannedStock && !scanning && (
        <div className="text-center py-12 text-gray-400">
          <Search size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">搜尋股票代號或名稱以加入自選清單</p>
          <p className="text-xs mt-1">支援加入多支證券進行比較分析</p>
        </div>
      )}
    </div>
  );
}
