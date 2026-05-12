'use client';
import { useState, useMemo, useCallback } from 'react';
import { useAllScoresHistory, useOnDemandScan } from '@/lib/useScanData';
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

// ── Stub types for on-demand scan result ─────────────────────────
interface OnDemandResult { stock: ScanStock | null; error?: string; }

export default function SelfCheck() {
  // all_scores history for search pool
  const { data: allData, isLoading: allLoading } = useAllScoresHistory();
  const allStocks: ScanStock[] = allData?.all_stock_scores ?? [];

  // on-demand single-stock scan
  const { scan, result: scanResult, isLoading: scanLoading } = useOnDemandScan();

  // watchlist state
  const [watchlist, setWatchlist] = useState<ScanStock[]>([]);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allStocks
      .filter(s =>
        s.stock_id.includes(q) ||
        (s.stock_name ?? s.name ?? '').toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [search, allStocks]);

  const addToWatchlist = useCallback((s: ScanStock) => {
    setWatchlist(prev => prev.some(x => x.stock_id === s.stock_id) ? prev : [...prev, s]);
    setSearch('');
    setShowSearch(false);
  }, []);

  const removeFromWatchlist = useCallback((id: string) => {
    setWatchlist(prev => prev.filter(s => s.stock_id !== id));
    if (expandedId === id) setExpandedId(null);
  }, [expandedId]);

  const handleShare = useCallback(() => {
    const ids = watchlist.map(s => s.stock_id).join(',');
    const url = `${window.location.origin}${window.location.pathname}?stocks=${ids}`;
    navigator.clipboard?.writeText(url).then(() => {
      setShareMsg('連結已複製！');
      setTimeout(() => setShareMsg(''), 2000);
    });
  }, [watchlist]);

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">自選股健診</h1>
            <p className="text-sm text-gray-500 mt-0.5">加入自選股，即時查看五維評分與操作建議</p>
          </div>
          {watchlist.length >= 2 && (
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
            >
              {shareMsg ? <><Check className="w-3.5 h-3.5 text-emerald-500" />{shareMsg}</> : <><Share2 className="w-3.5 h-3.5" />分享比較</>}
            </button>
          )}
        </div>

        {/* Search bar */}
        <div className="relative">
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 cursor-text"
            onClick={() => setShowSearch(true)}
          >
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setShowSearch(true); }}
              onFocus={() => setShowSearch(true)}
              placeholder={allLoading ? '載入股票資料中...' : '輸入股票代號或名稱（如 2330 台積電）'}
              className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400"
            />
            {search && (
              <button onClick={() => { setSearch(''); setShowSearch(false); }}>
                <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>

          {/* Dropdown results */}
          {showSearch && search.trim() && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
              {allLoading ? (
                <div className="px-4 py-3 text-sm text-gray-500">載入中...</div>
              ) : filtered.length > 0 ? (
                <ul>
                  {filtered.map(s => (
                    <li
                      key={s.stock_id}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                      onMouseDown={() => addToWatchlist(s)}
                    >
                      <div>
                        <span className="font-mono text-sm font-semibold text-gray-800">{s.stock_id}</span>
                        <span className="ml-2 text-sm text-gray-600">{s.stock_name ?? s.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{s.sector_name ?? s.sector ?? ''}</span>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                          s.total_score >= 70 ? 'bg-red-50 text-red-600' :
                          s.total_score >= 50 ? 'bg-orange-50 text-orange-600' :
                          'bg-gray-100 text-gray-500'
                        }`}>{s.total_score}分</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-3 text-sm text-gray-500">找不到符合的股票</div>
              )}
            </div>
          )}
        </div>

        {/* Compare radar (only when 2+ stocks) */}
        {watchlist.length >= 2 && <CompareRadar stocks={watchlist} />}

        {/* Empty state */}
        {watchlist.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Search className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-sm">搜尋並加入您的自選股</p>
            <p className="text-xs mt-1 opacity-70">支援股票代號與名稱模糊搜尋</p>
          </div>
        )}

        {/* Watchlist cards */}
        <div className="space-y-3">
          {allLoading && watchlist.length === 0 && (
            <>{[...Array(2)].map((_, i) => <SkeletonCard key={i} />)}</>
          )}
          {watchlist.map((stock) => {
            const action = ACTION_MAP[stock.recommendation] ?? ACTION_MAP['觀望'];
            const isExpanded = expandedId === stock.stock_id;
            const dims = DIM_KEYS.map(k => ({
              key: k,
              label: DIMENSION_CONFIG[k].label,
              max: DIMENSION_CONFIG[k].max,
              value: (stock.dimensions as unknown as Record<string, number>)?.[k] ?? 0,
            }));
            return (
              <div
                key={stock.stock_id}
                className={`rounded-xl border ${action.border} ${action.bg} overflow-hidden transition-all`}
              >
                {/* Card header */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : stock.stock_id)}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${action.dot}`} />
                    <div>
                      <span className="font-mono font-bold text-gray-900">{stock.stock_id}</span>
                      <span className="ml-2 text-sm text-gray-700">{stock.stock_name ?? stock.name}</span>
                      <span className="ml-2 text-xs text-gray-400">{stock.sector_name ?? stock.sector ?? ''}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold ${action.text}`}>{action.label}</span>
                    <span className="text-xs font-bold text-gray-900 bg-white/80 px-2 py-0.5 rounded-lg border border-gray-200">{stock.total_score}分</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFromWatchlist(stock.stock_id); }}
                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-5 pb-5 space-y-4 border-t border-gray-200/60">

                    {/* Price row */}
                    <div className="flex items-center gap-4 pt-3">
                      <div>
                        <span className="text-2xl font-bold text-gray-900">{stock.close > 0 ? stock.close.toFixed(2) : '—'}</span>
                        <span className="ml-1 text-sm text-gray-400">元</span>
                      </div>
                      {stock.change_pct !== undefined && (
                        <span className={`flex items-center gap-0.5 text-sm font-medium ${
                          stock.change_pct > 0 ? 'text-red-500' : stock.change_pct < 0 ? 'text-green-500' : 'text-gray-400'
                        }`}>
                          {stock.change_pct > 0 ? <ArrowUpRight className="w-4 h-4" /> : stock.change_pct < 0 ? <ArrowDownRight className="w-4 h-4" /> : null}
                          {stock.change_pct > 0 ? '+' : ''}{stock.change_pct.toFixed(2)}%
                        </span>
                      )}
                      <span className="text-xs text-gray-400">RSI {stock.rsi?.toFixed(0) ?? '—'}</span>
                      <span className="text-xs text-gray-400">量比 {stock.vol_ratio?.toFixed(1) ?? '—'}</span>
                    </div>

                    {/* Dimension bars */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {dims.map(d => (
                        <div key={d.key} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-600">{d.label}</span>
                            <span className="font-semibold text-gray-800">{d.value}<span className="text-gray-400">/{d.max}</span></span>
                          </div>
                          <ScoreBar value={d.value} max={d.max} />
                        </div>
                      ))}
                    </div>

                    {/* Strategy boxes */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="bg-white rounded-lg border border-gray-200 p-2.5 text-center">
                        <p className="text-[10px] text-gray-400 mb-0.5">建議進場</p>
                        <p className="text-xs font-bold text-gray-800">
                          {stock.entry_low > 0 ? `${stock.entry_low}–${stock.entry_high}` : '—'}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg border border-red-100 p-2.5 text-center">
                        <p className="text-[10px] text-gray-400 mb-0.5">停損</p>
                        <p className="text-xs font-bold text-red-600">{stock.stop_loss > 0 ? stock.stop_loss : '—'}</p>
                      </div>
                      <div className="bg-white rounded-lg border border-emerald-100 p-2.5 text-center">
                        <p className="text-[10px] text-gray-400 mb-0.5">目標 T1/T2/T3</p>
                        <p className="text-xs font-bold text-emerald-600">
                          {stock.target1 > 0 ? `${stock.target1} / ${stock.target2} / ${stock.target3}` : '—'}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg border border-gray-200 p-2.5 text-center">
                        <p className="text-[10px] text-gray-400 mb-0.5">持有</p>
                        <p className="text-xs font-bold text-gray-800">{stock.hold_days || '—'}</p>
                      </div>
                    </div>

                    {/* Reason */}
                    {stock.reason && (
                      <div className="flex items-start gap-2 bg-white/70 rounded-lg px-3 py-2.5 border border-gray-100">
                        <AlertCircle className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-gray-600 leading-relaxed">{stock.reason}</p>
                      </div>
                    )}

                    {/* Risk metrics */}
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Shield className="w-3 h-3" />
                        每口最大虧損：{stock.max_loss_per_lot > 0 ? `${stock.max_loss_per_lot} 元` : '—'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Target className="w-3 h-3" />
                        建議倉位：{stock.position || '—'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* On-demand scan section */}
        <div className="border-t border-gray-200 pt-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">即時掃描（單股）</h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="輸入股票代號進行即時評分..."
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 outline-none focus:border-sky-400"
              onKeyDown={e => { if (e.key === 'Enter') scan((e.target as HTMLInputElement).value.trim()); }}
            />
            <button
              onClick={() => {
                const inp = document.querySelector<HTMLInputElement>('input[placeholder*="即時掃描"]');
                if (inp) scan(inp.value.trim());
              }}
              disabled={scanLoading}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 transition"
            >
              {scanLoading ? '掃描中...' : '掃描'}
            </button>
          </div>
          {scanResult && (
            <div className="mt-3 p-3 rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-600">
              {(scanResult as OnDemandResult).error
                ? <span className="text-red-500">{(scanResult as OnDemandResult).error}</span>
                : <pre className="whitespace-pre-wrap">{JSON.stringify((scanResult as OnDemandResult).stock, null, 2)}</pre>
              }
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
