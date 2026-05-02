'use client';
import { useState, useMemo, useCallback } from 'react';
import { useAllScores, useOnDemandScan } from '@/lib/useScanData';
import { ScanStock, DIMENSION_CONFIG } from '@/lib/scanTypes';
import {
  Search, X, AlertCircle, ChevronDown, ChevronUp,
  Target, ArrowUpRight, ArrowDownRight, TrendingUp,
  Plus, Trash2, Share2, Check, ExternalLink,
} from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  Legend,
} from 'recharts';

const GRADE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  '強力買進': { label: '強力買進 🔥', color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30' },
  '買進':     { label: '買進 ✅',      color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30' },
  '觀望':     { label: '觀望 ⏳',      color: 'text-gray-400',    bg: 'bg-gray-800',       border: 'border-gray-700' },
  '偏弱':     { label: '偏弱 ⚠️',     color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
};

const DIM_LABELS: Record<string, string> = {
  technical: '技術面', fundamental: '基本面', news: '消息面', sentiment: '市場情緒', chips: '籌碼面',
};
const DIM_MAXES: Record<string, number> = {
  technical: 40, fundamental: 40, news: 10, sentiment: 10, chips: 10,
};
const DIM_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#a78bfa', '#f87171'];

function ScoreBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-sky-500' : pct >= 30 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div className="w-full bg-gray-800 rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="skeleton h-6 w-32 rounded" />
        <div className="skeleton h-8 w-16 rounded" />
      </div>
      <div className="skeleton h-4 w-full rounded" />
      <div className="skeleton h-4 w-3/4 rounded" />
      <div className="grid grid-cols-3 gap-2">
        {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-12 rounded" />)}
      </div>
      <div className="skeleton h-24 w-full rounded" />
    </div>
  );
}

function CompareRadar({ stocks }: { stocks: ScanStock[] }) {
  const data = Object.entries(DIM_LABELS).map(([key, label]) => {
    const entry: Record<string, string | number> = { dim: label };
    stocks.forEach((s) => {
      const raw = (s.dimensions as unknown as Record<string, number>)?.[key] ?? 0;
      entry[s.stock_id] = Math.round((raw / (DIM_MAXES[key] ?? 10)) * 100);
    });
    return entry;
  });

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
      <h3 className="text-xs font-semibold text-gray-400 mb-3">五維度比較雷達圖</h3>
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
          <PolarGrid stroke="#1e293b" />
          <PolarAngleAxis dataKey="dim" tick={{ fontSize: 11, fill: '#6b7280' }} />
          <Legend
            formatter={(value) => <span className="text-[11px] text-gray-400">{value}</span>}
          />
          {stocks.map((s, i) => (
            <Radar
              key={s.stock_id}
              name={`${s.stock_id} ${s.name}`}
              dataKey={s.stock_id}
              stroke={DIM_COLORS[i % DIM_COLORS.length]}
              fill={DIM_COLORS[i % DIM_COLORS.length]}
              fillOpacity={0.12}
              strokeWidth={1.5}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

function StockCard({ stock, onRemove, showRemove }: { stock: ScanStock; onRemove: () => void; showRemove: boolean }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const up = (stock.change_pct ?? 0) >= 0;
  const grade = GRADE_CONFIG[stock.strategy?.recommendation ?? '觀望'] ?? GRADE_CONFIG['觀望'];
  const totalMax = Object.values(DIMENSION_CONFIG).reduce((s, c) => s + c.max, 0);

  const share = () => {
    const text = `台股雷達評分 ${stock.name}(${stock.stock_id}): ${stock.total_score.toFixed(1)} — ${stock.strategy.recommendation}`;
    if (navigator.share) {
      navigator.share({ title: '台股雷達', text, url: window.location.href });
    } else {
      navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    }
  };

  return (
    <div className={`rounded-xl border ${grade.border} ${grade.bg} p-5 fade-in`}>
      {/* Stock header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-base">{stock.name}</span>
            <span className="font-mono text-xs text-gray-500">{stock.stock_id}</span>
            <a
              href={`https://tw.stock.yahoo.com/quote/${stock.stock_id}`}
              target="_blank" rel="noopener noreferrer"
              className="text-sky-500 hover:text-sky-400"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">{stock.sector}</div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={share} className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors" title="分享">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5 text-gray-500" />}
          </button>
          {showRemove && (
            <button onClick={onRemove} className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors" title="移除">
              <Trash2 className="w-3.5 h-3.5 text-gray-600 hover:text-red-400" />
            </button>
          )}
        </div>
      </div>

      {/* Price + Score */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="text-2xl font-bold font-mono text-white">{stock.close.toLocaleString()}</div>
          <div className={`text-xs font-mono flex items-center gap-0.5 mt-0.5 ${up ? 'text-red-400' : 'text-emerald-400'}`}>
            {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(stock.change_pct ?? 0).toFixed(2)}%
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-white">{stock.total_score.toFixed(1)}</div>
          <div className={`text-xs font-semibold ${grade.color}`}>{grade.label}</div>
        </div>
      </div>

      {/* Dim bars */}
      {stock.dimensions && (
        <div className="space-y-2 mb-3">
          {Object.entries(DIM_LABELS).map(([key, label]) => {
            const val = (stock.dimensions as unknown as Record<string, number>)[key] ?? 0;
            const max = DIM_MAXES[key] ?? 10;
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 w-14 shrink-0">{label}</span>
                <div className="flex-1"><ScoreBar value={val} max={max} /></div>
                <span className="text-[10px] font-mono text-gray-400 w-8 text-right">{val.toFixed(1)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Strategy */}
      {stock.strategy && (
        <div className="rounded-lg bg-gray-800/60 p-3 flex gap-3 text-xs">
          <div className="text-center flex-1">
            <div className="text-gray-500 text-[10px] mb-0.5">進場</div>
            <div className="font-mono font-bold text-white">{stock.strategy.entry?.toFixed(2)}</div>
          </div>
          <div className="text-center flex-1">
            <div className="text-emerald-500 text-[10px] mb-0.5">目標 +{stock.strategy.upside}%</div>
            <div className="font-mono font-bold text-emerald-400">{stock.strategy.target?.toFixed(2)}</div>
          </div>
          <div className="text-center flex-1">
            <div className="text-red-500 text-[10px] mb-0.5">停損 -{stock.strategy.downside}%</div>
            <div className="font-mono font-bold text-red-400">{stock.strategy.stop_loss?.toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* Signals toggle */}
      {stock.signals && (
        <div className="mt-3">
          <button
            onClick={() => setOpen((o) => !o)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors text-xs text-gray-500"
          >
            <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />訊號明細</span>
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {open && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {Object.entries(stock.signals).map(([dim, sigs]) =>
                Array.isArray(sigs) && sigs.length > 0 && (
                  <div key={dim} className="rounded-lg bg-gray-800/50 p-2">
                    <div className="text-[10px] font-semibold text-gray-500 mb-1">{DIM_LABELS[dim]}</div>
                    {sigs.map((s, i) => (
                      <div key={i} className="text-[10px] text-gray-400 leading-relaxed">• {s}</div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SingleStockLookup({
  onAdd, existing,
}: {
  onAdd: (stock: ScanStock) => void;
  existing: string[];
}) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const { data: allScores } = useAllScores();
  const { data: onDemand, status, error } = useOnDemandScan(submitted);

  const allList = useMemo(
    () => allScores?.all_stock_scores ?? [],
    [allScores]
  );

  const suggestions = useMemo(() => {
    if (!query || query.length < 1) return [];
    return allList
      .filter(
        (s) =>
          s.stock_id.startsWith(query) ||
          s.name.includes(query)
      )
      .slice(0, 6);
  }, [query, allList]);

  const handleSearch = useCallback(() => {
    const id = query.trim().toUpperCase();
    if (!id) return;
    // First check allScores
    const found = allList.find((s) => s.stock_id === id || s.name === id);
    if (found) {
      onAdd(found);
      setQuery('');
      setSubmitted(null);
      return;
    }
    setSubmitted(id);
  }, [query, allList, onAdd]);

  useEffect(() => {
    if (status === 'done' && onDemand) {
      onAdd(onDemand.stock);
      setQuery('');
      setSubmitted(null);
    }
  }, [status, onDemand, onAdd]);

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSubmitted(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="輸入股票代號或名稱，如 2330 或 台積電"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 transition-colors"
          />
          {query && (
            <button onClick={() => { setQuery(''); setSubmitted(null); }} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-500 hover:text-gray-300" />
            </button>
          )}
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-2.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 text-sm font-medium hover:bg-sky-500/25 transition-colors whitespace-nowrap"
        >
          查詢
        </button>
      </div>

      {/* Autocomplete */}
      {suggestions.length > 0 && !submitted && (
        <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
          {suggestions.map((s) => (
            <button
              key={s.stock_id}
              onClick={() => {
                if (!existing.includes(s.stock_id)) onAdd(s);
                setQuery('');
                setSubmitted(null);
              }}
              disabled={existing.includes(s.stock_id)}
              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-800 transition-colors disabled:opacity-40"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-gray-500">{s.stock_id}</span>
                <span className="text-sm text-gray-200">{s.name}</span>
                <span className="text-[10px] text-gray-600">{s.sector}</span>
              </div>
              <span className={`text-xs font-mono font-bold ${
                s.total_score >= 70 ? 'text-red-400' :
                s.total_score >= 55 ? 'text-amber-400' : 'text-gray-500'
              }`}>{s.total_score.toFixed(1)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Loading / Error */}
      {status === 'loading' && <SkeletonCard />}
      {(status === 'error' || status === 'not_traded') && error && (
        <div className="mt-3 flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}
    </div>
  );
}

export default function SelfCheck() {
  const [stocks, setStocks] = useState<ScanStock[]>([]);
  const MAX_STOCKS = 3;

  const addStock = useCallback((s: ScanStock) => {
    setStocks((prev) => {
      if (prev.find((p) => p.stock_id === s.stock_id)) return prev;
      if (prev.length >= MAX_STOCKS) return [...prev.slice(1), s];
      return [...prev, s];
    });
  }, []);

  const removeStock = useCallback((id: string) => {
    setStocks((prev) => prev.filter((s) => s.stock_id !== id));
  }, []);

  const canCompare = stocks.length >= 2;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-gray-800/60 bg-gradient-to-br from-gray-900 to-gray-900/50 px-5 py-4">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <Search className="w-5 h-5 text-sky-400" />自主檢查
        </h1>
        <p className="text-xs text-gray-400 mt-1">
          輸入股票代號即時查詢五維度評分，最多同時比較 {MAX_STOCKS} 支股票
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <SingleStockLookup
          onAdd={addStock}
          existing={stocks.map((s) => s.stock_id)}
        />
      </div>

      {/* Compare button */}
      {stocks.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {stocks.map((s) => (
              <span key={s.stock_id} className="flex items-center gap-1 text-xs bg-sky-500/10 border border-sky-500/20 text-sky-300 px-2 py-1 rounded-full">
                {s.stock_id}
                <button onClick={() => removeStock(s.stock_id)}>
                  <X className="w-3 h-3 text-sky-400 hover:text-red-400" />
                </button>
              </span>
            ))}
          </div>
          {stocks.length < MAX_STOCKS && (
            <span className="text-xs text-gray-600 flex items-center gap-1">
              <Plus className="w-3 h-3" />再搜尋可加入比較
            </span>
          )}
        </div>
      )}

      {/* Compare radar */}
      {canCompare && <CompareRadar stocks={stocks} />}

      {/* Stock cards */}
      <div className={`grid gap-4 ${
        stocks.length >= 2 ? 'md:grid-cols-2' : 'grid-cols-1'
      } ${stocks.length >= 3 ? 'lg:grid-cols-3' : ''}`}>
        {stocks.map((s) => (
          <StockCard
            key={s.stock_id}
            stock={s}
            onRemove={() => removeStock(s.stock_id)}
            showRemove={stocks.length > 1}
          />
        ))}
      </div>

      {stocks.length === 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-12 text-center">
          <Search className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">搜尋任意台股代號或名稱</p>
          <p className="text-xs text-gray-700 mt-1">例如：2330、台積電、0050</p>
        </div>
      )}
    </div>
  );
}
