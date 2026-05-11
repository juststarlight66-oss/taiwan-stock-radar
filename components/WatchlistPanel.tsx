'use client';
import { useState, useEffect, useMemo } from 'react';
import { ScanStock, DIMENSION_CONFIG } from '@/lib/scanTypes';
import StockDetailModal from './StockDetailModal';
import { Star, StarOff, Search, Trash2, ArrowUpRight, ArrowDownRight } from 'lucide-react';

function getActionColor(action: string | undefined) {
  if (action === '強力買進') return 'text-red-600 font-bold';
  if (action === '買進') return 'text-orange-500 font-bold';
  if (action === '觀望') return 'text-gray-500';
  return 'text-green-700';
}

const LS_KEY = 'twsr_watchlist';

function loadIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveIds(ids: string[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(ids));
}

interface Props {
  /** 傳入最新掃描的全部股票（top10 + all_results 合併後去重） */
  stocks: ScanStock[];
}

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color =
    pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-sky-500' : pct >= 35 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5 min-w-[72px]">
      <div className="flex-1 h-1.5 rounded-full bg-gray-700 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-bold text-white w-7 text-right">{Math.round(score)}</span>
    </div>
  );
}

/** 加入/移除自選股按鈕，可在任何表格裡單獨使用 */
export function WatchlistToggleBtn({ stockId, stockName: _stockName }: { stockId: string; stockName?: string }) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setIds(loadIds());
    const onStorage = () => setIds(loadIds());
    window.addEventListener('twsr_watchlist_changed', onStorage);
    return () => window.removeEventListener('twsr_watchlist_changed', onStorage);
  }, []);

  const inList = ids.includes(stockId);

  function toggle() {
    const next = inList ? ids.filter((id) => id !== stockId) : [...ids, stockId];
    saveIds(next);
    setIds(next);
    window.dispatchEvent(new Event('twsr_watchlist_changed'));
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); toggle(); }}
      title={inList ? '移出自選股' : '加入自選股'}
      className={`p-1 rounded transition-colors ${
        inList
          ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
          : 'text-gray-600 hover:text-amber-400 hover:bg-amber-500/10'
      }`}
    >
      {inList ? <Star className="w-3.5 h-3.5 fill-current" /> : <Star className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function WatchlistPanel({ stocks }: Props) {
  const [ids, setIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [selectedStock, setSelectedStock] = useState<ScanStock | null>(null);
  const totalMax = Object.values(DIMENSION_CONFIG).reduce((s, c) => s + c.max, 0);

  useEffect(() => {
    setIds(loadIds());
    const onStorage = () => setIds(loadIds());
    window.addEventListener('twsr_watchlist_changed', onStorage);
    return () => window.removeEventListener('twsr_watchlist_changed', onStorage);
  }, []);

  // 從傳入的 stocks 找到自選股資料
  const watchedStocks = useMemo(() => {
    const map = new Map(stocks.map((s) => [s.stock_id, s]));
    return ids.map((id) => map.get(id)).filter(Boolean) as ScanStock[];
  }, [ids, stocks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return watchedStocks;
    return watchedStocks.filter(
      (s) => s.stock_id.includes(q)
        || (s.stock_name ?? s.name ?? '').toLowerCase().includes(q)
        || (s.sector_name ?? s.sector ?? '').toLowerCase().includes(q)
    );
  }, [watchedStocks, query]);

  function removeId(id: string) {
    const next = ids.filter((x) => x !== id);
    saveIds(next);
    setIds(next);
    window.dispatchEvent(new Event('twsr_watchlist_changed'));
  }

  function clearAll() {
    saveIds([]);
    setIds([]);
    window.dispatchEvent(new Event('twsr_watchlist_changed'));
  }

  if (filtered.length === 0 && ids.length === 0) {
    return (
      <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-12 text-center">
        <Star className="w-10 h-10 text-gray-600 mx-auto mb-3" />
        <p className="text-sm text-gray-400 font-medium">尚無自選股</p>
        <p className="text-xs text-gray-500 mt-1">在任何股票列表點擊 ★ 即可加入</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-gray-700 bg-gray-800/80 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400 fill-current" />
            <span className="text-sm font-semibold text-white">自選股追蹤</span>
            <span className="text-xs text-gray-400">({ids.length} 檔)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
              <input
                type="text"
                placeholder="搜尋..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-6 pr-3 py-1 text-xs bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-sky-500 w-36"
              />
            </div>
            {ids.length > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
              >
                <Trash2 className="w-3 h-3" />
                清空
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="px-3 py-2 text-left font-medium">股票</th>
                <th className="px-3 py-2 text-right font-medium">現價</th>
                <th className="px-3 py-2 text-right font-medium">漲跌</th>
                <th className="px-3 py-2 text-right font-medium">總分</th>
                <th className="px-3 py-2 text-right font-medium">操作</th>
                <th className="px-3 py-2 text-center font-medium">移除</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const name = s.stock_name ?? s.name ?? s.stock_id;
                const changePct = s.change_pct ?? 0;
                const isUp = changePct >= 0;
                const rec = s.recommendation ?? '';
                const totalMax2 = Object.values(DIMENSION_CONFIG).reduce((acc, c) => acc + c.max, 0);
                return (
                  <tr
                    key={s.stock_id}
                    className="border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer transition-colors"
                    onClick={() => setSelectedStock(s)}
                  >
                    <td className="px-3 py-2">
                      <div className="font-mono font-bold text-white">{s.stock_id}</div>
                      <div className="text-gray-400 text-[11px]">{name}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-white">
                      {s.close?.toFixed(2) ?? '-'}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono font-bold ${
                      isUp ? 'text-red-400' : 'text-green-400'
                    }`}>
                      {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2">
                      <ScoreBar score={s.total_score} max={totalMax2} />
                    </td>
                    <td className={`px-3 py-2 text-right text-[11px] ${getActionColor(rec)}`}>
                      {rec || '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); removeId(s.stock_id); }}
                        className="p-1 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      >
                        <StarOff className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedStock && (
        <StockDetailModal stock={selectedStock} onClose={() => setSelectedStock(null)} />
      )}
    </>
  );
}
