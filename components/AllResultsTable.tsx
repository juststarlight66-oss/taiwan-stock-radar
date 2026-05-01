'use client';
import { useState, useMemo } from 'react';
import { ScanStock, DIMENSION_CONFIG } from '@/lib/scanTypes';

function getActionColor(rec: string): string {
  if (rec.includes('強力買進')) return 'bg-red-500/20 text-red-300 border-red-500/40';
  if (rec.includes('買進'))    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  if (rec.includes('觀望'))    return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  return 'bg-gray-700/40 text-gray-400 border-gray-600/40';
}
import StockDetailModal from './StockDetailModal';
import { WatchlistToggleBtn } from './WatchlistPanel';
import { ChevronRight, ArrowUpRight, ArrowDownRight, Search, ChevronLeft } from 'lucide-react';

interface Props {
  stocks: ScanStock[];
  scanDate?: string;
}

const PAGE_SIZE = 50;

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-sky-500' : pct >= 35 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-gray-700 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-bold text-white w-8 text-right">{Math.round(score)}</span>
    </div>
  );
}

/** 漲跌停徽章 */
function LimitBadge({ changePct }: { changePct: number }) {
  if (Math.abs(changePct) < 9.5) return null;
  const up = changePct >= 0;
  return (
    <span
      className={`ml-1 text-[9px] px-1 py-0.5 rounded font-bold ${
        up ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'
      }`}
    >
      {up ? '漲停' : '跌停'}
    </span>
  );
}

export default function AllResultsTable({ stocks, scanDate }: Props) {
  const [selectedStock, setSelectedStock] = useState<ScanStock | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<'total_score' | 'change_pct' | 'close'>('total_score');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [activeSector, setActiveSector] = useState<string>('全部');
  const totalMax = Object.values(DIMENSION_CONFIG).reduce((s, c) => s + c.max, 0);

  // 取得所有族群（排序按出現頻率）
  const sectors = useMemo(() => {
    const count = new Map<string, number>();
    stocks.forEach((s) => count.set(s.sector, (count.get(s.sector) ?? 0) + 1));
    const sorted = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return ['全部', ...sorted];
  }, [stocks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = stocks.filter((s) => {
      const matchSector = activeSector === '全部' || s.sector === activeSector;
      const matchQ = !q || s.stock_id.includes(q) || s.name.toLowerCase().includes(q) || s.sector.toLowerCase().includes(q);
      return matchSector && matchQ;
    });
    list.sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === 'desc' ? -diff : diff;
    });
    return list;
  }, [stocks, query, sortKey, sortDir, activeSector]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSort(key: typeof sortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  }

  function handleSearch(v: string) {
    setQuery(v);
    setPage(1);
  }

  function handleSector(sector: string) {
    setActiveSector(sector);
    setPage(1);
  }

  const SortIndicator = ({ k }: { k: typeof sortKey }) =>
    sortKey === k ? <span className="ml-0.5 text-sky-400">{sortDir === 'desc' ? '↓' : '↑'}</span> : null;

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {/* header */}
        <div className="px-4 py-3 border-b border-gray-700/60 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">全部掃描結果</h3>
            {scanDate && (
              <div className="text-[11px] text-gray-500 mt-0.5">
                掃描日期：{scanDate}　共 {filtered.length} / {stocks.length} 檔
              </div>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="搜尋代號/名稱/族群"
              className="bg-white border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-sky-500 w-48"
            />
          </div>
        </div>

        {/* 族群篩選 Tabs */}
        <div className="px-4 py-2 border-b border-gray-200 flex items-center gap-1.5 overflow-x-auto scrollbar-hide bg-gray-50">
          {sectors.slice(0, 20).map((sector) => (
            <button
              key={sector}
              onClick={() => handleSector(sector)}
              className={`shrink-0 px-2.5 py-1 text-[11px] rounded-full font-medium transition-all border ${
                activeSector === sector
                  ? 'bg-sky-500 text-white border-sky-500 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-200 border-gray-300 bg-white'
              }`}
            >
              {sector}
            </button>
          ))}
          {sectors.length > 21 && (
            <span className="shrink-0 text-[11px] text-gray-400 px-1">+{sectors.length - 21}</span>
          )}
        </div>

        {/* desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-2.5 font-medium w-8">#</th>
                <th className="text-left px-3 py-2.5 font-medium">代號 / 名稱</th>
                <th className="text-left px-3 py-2.5 font-medium">族群</th>
                <th
                  className="text-right px-3 py-2.5 font-medium cursor-pointer hover:text-gray-300"
                  onClick={() => handleSort('close')}
                >
                  收盤價 <SortIndicator k="close" />
                </th>
                <th
                  className="text-right px-3 py-2.5 font-medium cursor-pointer hover:text-gray-300"
                  onClick={() => handleSort('change_pct')}
                >
                  漲跌幅 <SortIndicator k="change_pct" />
                </th>
                <th
                  className="text-left px-3 py-2.5 font-medium cursor-pointer hover:text-gray-300"
                  onClick={() => handleSort('total_score')}
                >
                  綜合分 <SortIndicator k="total_score" />
                </th>
                <th className="text-left px-3 py-2.5 font-medium">建議</th>
                <th className="px-3 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageItems.map((s, i) => {
                const up = s.change_pct >= 0;
                const isLimit = Math.abs(s.change_pct) >= 9.5;
                const rowCls = isLimit
                  ? up
                    ? 'ring-1 ring-inset ring-red-500/50 bg-red-500/5'
                    : 'ring-1 ring-inset ring-emerald-500/50 bg-emerald-500/5'
                  : '';
                const actionCls = getActionColor(s.strategy.recommendation);
                return (
                  <tr
                    key={s.stock_id}
                    onClick={() => setSelectedStock(s)}
                    className={`hover:bg-sky-50/60 cursor-pointer transition-colors ${rowCls}`}
                  >
                    <td className="px-4 py-2.5 text-gray-400 font-mono">
                      {(page - 1) * PAGE_SIZE + i + 1}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-gray-400 text-[11px]">{s.stock_id}</div>
                      <div className="font-semibold text-gray-800">{s.name}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-200">{s.sector}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-800">
                      {s.close.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`font-mono flex items-center justify-end gap-0.5 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                        {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(s.change_pct).toFixed(2)}%
                        <LimitBadge changePct={s.change_pct} />
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <ScoreBar score={s.total_score} max={totalMax} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${actionCls}`}>
                        {s.strategy.recommendation.split(' - ')[0]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <WatchlistToggleBtn stockId={s.stock_id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* mobile cards */}
        <div className="block md:hidden divide-y divide-gray-100">
          {pageItems.map((s) => {
            const up = s.change_pct >= 0;
            const isLimit = Math.abs(s.change_pct) >= 9.5;
            const limitCls = isLimit
              ? up
                ? 'ring-1 ring-red-500/60 bg-red-500/5'
                : 'ring-1 ring-emerald-500/60 bg-emerald-500/5'
              : '';
            return (
              <div key={s.stock_id} className={`flex items-center gap-3 p-3 bg-white ${limitCls}`}>
                <button
                  className="flex-1 text-left hover:bg-sky-50/60 transition-colors"
                  onClick={() => setSelectedStock(s)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-400">{s.stock_id}</span>
                    <span className="text-sm font-semibold text-gray-800 truncate">{s.name}</span>
                    <span className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">{s.sector}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <ScoreBar score={s.total_score} max={totalMax} />
                    <span className={`font-mono text-xs flex items-center ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {Math.abs(s.change_pct).toFixed(2)}%
                      <LimitBadge changePct={s.change_pct} />
                    </span>
                  </div>
                </button>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-sm font-mono font-bold text-gray-800">{s.close.toLocaleString()}</span>
                  <WatchlistToggleBtn stockId={s.stock_id} />
                </div>
              </div>
            );
          })}
        </div>

        {/* empty state */}
        {pageItems.length === 0 && (
          <div className="py-10 text-center text-gray-400 text-xs">沒有符合條件的結果</div>
        )}

        {/* pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> 上一頁
            </button>
            <span>
              第 {page} / {totalPages} 頁　（共 {filtered.length} 筆）
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              下一頁 <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {selectedStock && (
        <StockDetailModal stock={selectedStock} onClose={() => setSelectedStock(null)} />
      )}
    </>
  );
}
