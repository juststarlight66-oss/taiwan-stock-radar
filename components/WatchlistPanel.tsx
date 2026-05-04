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
      (s) => s.stock_id.includes(q) || s.name.toLowerCase().includes(q) || s.sector.toLowerCase().includes(q)
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

  if (ids.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <Star className="w-10 h-10 text-gray-700" />
        <p className="text-gray-500 text-sm">尚無自選股</p>
        <p className="text-gray-600 text-xs">在「最新掃描」或「全部結果」表格中點擊 ★ 加入</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 overflow-hidden">
        {/* header */}
        <div className="px-4 py-3 border-b border-gray-700/60 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400 fill-current" />
              自選股清單
              <span className="text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded-full">{ids.length}</span>
            </h3>
            <div className="text-[11px] text-gray-500 mt-0.5">
              {watchedStocks.length < ids.length
                ? `${watchedStocks.length}/${ids.length} 筆在今日掃描中`
                : `共 ${ids.length} 檔`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋"
                className="bg-gray-800 border border-gray-700/60 rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-sky-500/60 w-36"
              />
            </div>
            <button
              onClick={clearAll}
              title="清空自選股"
              className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* mobile cards */}
        <div className="block md:hidden divide-y divide-gray-700/30">
          {filtered.map((s) => {
            const up = ((s.change_pct ?? 0) ?? 0) >= 0;
            const isLimit = Math.abs((s.change_pct ?? 0)) >= 9.5;
            const limitCls = isLimit
              ? up
                ? 'ring-1 ring-red-500/60 bg-red-500/5'
                : 'ring-1 ring-emerald-500/60 bg-emerald-500/5'
              : '';
            return (
              <button
                key={s.stock_id}
                onClick={() => setSelectedStock(s)}
                className={`w-full text-left p-3 hover:bg-gray-800/50 transition-colors flex items-center gap-3 ${limitCls}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-500">{s.stock_id}</span>
                    <span className="text-sm font-semibold text-gray-200 truncate">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <ScoreBar score={s.total_score} max={totalMax} />
                  </div>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <div className="text-sm font-mono font-bold text-white">{s.close.toLocaleString()}</div>
                  <div className={`text-xs font-mono flex items-center justify-end ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                    {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {Math.abs((s.change_pct ?? 0)).toFixed(2)}%
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeId(s.stock_id); }}
                  className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors shrink-0"
                >
                  <StarOff className="w-3.5 h-3.5" />
                </button>
              </button>
            );
          })}
        </div>

        {/* desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-700/40 bg-gray-800/30">
                <th className="text-left px-4 py-2.5 font-medium w-8">#</th>
                <th className="text-left px-3 py-2.5 font-medium">代號 / 名稱</th>
                <th className="text-left px-3 py-2.5 font-medium">族群</th>
                <th className="text-right px-3 py-2.5 font-medium">收盤</th>
                <th className="text-right px-3 py-2.5 font-medium">漲跌</th>
                <th className="text-left px-3 py-2.5 font-medium">綜合分</th>
                <th className="text-left px-3 py-2.5 font-medium">建議</th>
                <th className="px-3 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/20">
              {filtered.map((s, i) => {
                const up = ((s.change_pct ?? 0) ?? 0) >= 0;
                const isLimit = Math.abs((s.change_pct ?? 0)) >= 9.5;
                const rowCls = isLimit
                  ? up
                    ? 'ring-1 ring-inset ring-red-500/50 bg-red-500/5'
                    : 'ring-1 ring-inset ring-emerald-500/50 bg-emerald-500/5'
                  : '';
                const actionCls = getActionColor(s.strategy?.recommendation);
                return (
                  <tr
                    key={s.stock_id}
                    onClick={() => setSelectedStock(s)}
                    className={`hover:bg-gray-800/40 cursor-pointer transition-colors group ${rowCls}`}
                  >
                    <td className="px-4 py-2.5 text-gray-600 font-mono">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-gray-500 text-[11px]">{s.stock_id}</div>
                      <div className="font-semibold text-gray-200">{s.name}</div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-400">{s.sector}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-white">
                      {s.close.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`font-mono flex items-center justify-end gap-0.5 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                        {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs((s.change_pct ?? 0)).toFixed(2)}%
                        {isLimit && (
                          <span className={`ml-1 text-[9px] px-1 py-0.5 rounded font-bold ${up ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                            {up ? '漲停' : '跌停'}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <ScoreBar score={s.total_score} max={totalMax} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${actionCls}`}>
                        {s.strategy?.recommendation.split(' - ')[0]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); removeId(s.stock_id); }}
                        className="p-1 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="移出自選股"
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

        {filtered.length === 0 && (
          <div className="py-8 text-center text-gray-600 text-xs">沒有符合的結果</div>
        )}
      </div>

      {selectedStock && (
        <StockDetailModal stock={selectedStock} onClose={() => setSelectedStock(null)} />
      )}
    </>
  );
}
