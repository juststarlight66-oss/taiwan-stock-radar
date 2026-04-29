'use client';
import { useState, useMemo } from 'react';
import { ScanStock, DIMENSION_CONFIG, getActionColor } from '@/lib/scanTypes';
import StockDetailModal from './StockDetailModal';
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

export default function AllResultsTable({ stocks, scanDate }: Props) {
  const [selectedStock, setSelectedStock] = useState<ScanStock | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<'total_score' | 'change_pct' | 'close'>('total_score');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const totalMax = Object.values(DIMENSION_CONFIG).reduce((s, c) => s + c.max, 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q
      ? stocks.filter(
          (s) => s.stock_id.includes(q) || s.name.toLowerCase().includes(q) || s.sector.toLowerCase().includes(q)
        )
      : [...stocks];
    list.sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === 'desc' ? -diff : diff;
    });
    return list;
  }, [stocks, query, sortKey, sortDir]);

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

  const SortIndicator = ({ k }: { k: typeof sortKey }) =>
    sortKey === k ? (
      <span className="ml-0.5 text-sky-400">{sortDir === 'desc' ? '↓' : '↑'}</span>
    ) : null;

  return (
    <>
      <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700/60 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-gray-200">全部掃描結果</h3>
            {scanDate && (
              <div className="text-[11px] text-gray-500 mt-0.5">
                掃描日期：{scanDate}　共 {filtered.length} / {stocks.length} 檔
              </div>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="搜尋代號/名稱/族群"
              className="bg-gray-800 border border-gray-700/60 rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-sky-500/60 w-48"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-700/40 bg-gray-800/30">
                <th className="text-left px-4 py-2.5 font-medium w-8">#</th>
                <th className="text-left px-3 py-2.5 font-medium">代號 / 名稱</th>
                <th className="text-right px-3 py-2.5 font-medium cursor-pointer hover:text-gray-300 select-none" onClick={() => handleSort('close')}>
                  收盤 <SortIndicator k="close" />
                </th>
                <th className="text-right px-3 py-2.5 font-medium cursor-pointer hover:text-gray-300 select-none" onClick={() => handleSort('change_pct')}>
                  漲跌% <SortIndicator k="change_pct" />
                </th>
                <th className="text-right px-3 py-2.5 font-medium hidden lg:table-cell">族群</th>
                <th className="px-3 py-2.5 font-medium cursor-pointer hover:text-gray-300 select-none" onClick={() => handleSort('total_score')}>
                  評分 <SortIndicator k="total_score" />
                </th>
                <th className="px-3 py-2.5 font-medium">建議</th>
                <th className="px-3 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((s, i) => {
                const up = s.change_pct >= 0;
                const actionCls = getActionColor(s.strategy.recommendation);
                const rank = (page - 1) * PAGE_SIZE + i + 1;
                return (
                  <tr key={s.stock_id} onClick={() => setSelectedStock(s)} className="border-b border-gray-700/20 hover:bg-gray-800/50 cursor-pointer transition-colors">
                    <td className="px-4 py-2.5 text-gray-600 font-bold">{rank}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-gray-500 text-[11px] w-10 shrink-0">{s.stock_id}</span>
                        <span className="text-gray-200 font-semibold">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-200">{s.close.toLocaleString()}</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-bold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                      <span className="flex items-center justify-end gap-0.5">
                        {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        {Math.abs(s.change_pct).toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell">
                      <span className="text-gray-400 bg-gray-700/40 px-1.5 py-0.5 rounded text-[11px]">{s.sector}</span>
                    </td>
                    <td className="px-3 py-2.5"><ScoreBar score={s.total_score} max={totalMax} /></td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[11px] px-2 py-1 rounded border font-medium whitespace-nowrap ${actionCls}`}>
                        {s.strategy.recommendation.split(' - ')[0]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5"><ChevronRight className="w-4 h-4 text-gray-600" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-700/40 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] text-gray-500">第 {page} / {totalPages} 頁　（每頁 {PAGE_SIZE} 筆）</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let p: number;
                if (totalPages <= 7) { p = i + 1; }
                else if (page <= 4) { p = i + 1; }
                else if (page >= totalPages - 3) { p = totalPages - 6 + i; }
                else { p = page - 3 + i; }
                return (
                  <button key={p} onClick={() => setPage(p)} className={`w-7 h-7 text-xs rounded-lg font-medium transition-colors ${p === page ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'text-gray-500 hover:bg-gray-800 hover:text-gray-200'}`}>{p}</button>
                );
              })}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
      {selectedStock && <StockDetailModal stock={selectedStock} onClose={() => setSelectedStock(null)} />}
    </>
  );
}
