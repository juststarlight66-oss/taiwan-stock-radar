'use client';
import { useState, useMemo } from 'react';
import { ScanStock, DIMENSION_CONFIG, getStockName, getStockSector } from '@/lib/scanTypes';
import StockDetailModal from './StockDetailModal';
import { WatchlistToggleBtn } from './WatchlistPanel';
import { ChevronRight, ArrowUpRight, ArrowDownRight, Search, ChevronLeft } from 'lucide-react';

function getActionColor(rec: string): string {
  if (rec.includes('強力買進')) return 'text-red-600 font-bold';
  if (rec.includes('買進'))    return 'text-orange-500 font-bold';
  if (rec.includes('觀望'))    return 'text-gray-500';
  return 'text-green-700';
}

interface Props {
  stocks: ScanStock[];
  scanDate?: string;
}

const PAGE_SIZE = 50;

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color = pct >= 70 ? 'bg-violet-500' : pct >= 50 ? 'bg-sky-500' : pct >= 35 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-bold text-gray-900 w-8 text-right">{Math.round(score)}</span>
    </div>
  );
}

function LimitBadge({ changePct }: { changePct: number }) {
  if (Math.abs(changePct) < 9.5) return null;
  const up = changePct >= 0;
  return (
    <span className={`ml-1 text-[9px] px-1 py-0.5 rounded font-bold ${up ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
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

  const sectors = useMemo(() => {
    const count = new Map<string, number>();
    stocks.forEach((s) => {
      const sec = getStockSector(s);
      count.set(sec, (count.get(sec) ?? 0) + 1);
    });
    const sorted = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return ['全部', ...sorted];
  }, [stocks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = stocks.filter((s) => {
      const sec = getStockSector(s);
      const nm = getStockName(s);
      const matchSector = activeSector === '全部' || sec === activeSector;
      const matchQ = !q || s.stock_id.includes(q) || nm.toLowerCase().includes(q) || sec.toLowerCase().includes(q);
      return matchSector && matchQ;
    });
    list.sort((a, b) => {
      const av = (a[sortKey] as number) ?? 0;
      const bv = (b[sortKey] as number) ?? 0;
      const diff = av - bv;
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
    sortKey === k ? <span className="ml-0.5 text-sky-500">{sortDir === 'desc' ? '↓' : '↑'}</span> : null;

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">全市場掃描結果</h3>
            {scanDate && <p className="text-xs text-gray-500 mt-0.5">掃描日期：{scanDate}</p>}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="搜尋代碼/名稱/族群…"
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-sky-400 w-44"
              />
            </div>
          </div>
        </div>

        {/* Sector filter */}
        <div className="px-4 py-2 border-b border-gray-100 flex gap-1.5 overflow-x-auto scrollbar-none">
          {sectors.map((sec) => (
            <button
              key={sec}
              onClick={() => handleSector(sec)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                activeSector === sec
                  ? 'bg-sky-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {sec}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2 text-left text-gray-500 font-medium w-8">#</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">代碼 / 名稱</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">族群</th>
                <th
                  className="px-3 py-2 text-right text-gray-500 font-medium cursor-pointer hover:text-sky-600 select-none"
                  onClick={() => handleSort('close')}
                >
                  收盤 <SortIndicator k="close" />
                </th>
                <th
                  className="px-3 py-2 text-right text-gray-500 font-medium cursor-pointer hover:text-sky-600 select-none"
                  onClick={() => handleSort('change_pct')}
                >
                  漲跌 <SortIndicator k="change_pct" />
                </th>
                <th
                  className="px-3 py-2 text-left text-gray-500 font-medium cursor-pointer hover:text-sky-600 select-none"
                  onClick={() => handleSort('total_score')}
                >
                  總分 <SortIndicator k="total_score" />
                </th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium hidden md:table-cell">維度</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium hidden lg:table-cell">建議</th>
                <th className="px-3 py-2 text-center text-gray-500 font-medium w-16">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageItems.map((s, i) => {
                const nm = getStockName(s);
                const sec = getStockSector(s);
                const changePct = s.change_pct ?? 0;
                const close = s.close ?? 0;
                const rec = s.recommendation ?? s.strategy?.recommendation ?? '';
                const dims = s.dimensions ?? {
                  technical:   s.technical_score   ?? 0,
                  fundamental: s.fundamental_score ?? 0,
                  chips:       s.chips_score       ?? 0,
                  news:        s.news_score        ?? 0,
                  sentiment:   s.sentiment_score   ?? 0,
                };
                return (
                  <tr
                    key={s.stock_id}
                    className="hover:bg-sky-50/40 transition-colors cursor-pointer"
                    onClick={() => setSelectedStock(s)}
                  >
                    <td className="px-3 py-2.5 text-gray-400">{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-mono font-bold text-gray-900">{s.stock_id}</div>
                      <div className="text-gray-500 truncate max-w-[100px]">{nm}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 text-[10px] font-medium">{sec}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {close > 0 ? close.toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`font-mono font-medium ${
                        changePct > 0 ? 'text-red-500' : changePct < 0 ? 'text-green-600' : 'text-gray-500'
                      }`}>
                        {changePct !== 0 ? (
                          <>
                            {changePct > 0 ? <ArrowUpRight className="inline w-3 h-3" /> : <ArrowDownRight className="inline w-3 h-3" />}
                            {Math.abs(changePct).toFixed(2)}%
                            <LimitBadge changePct={changePct} />
                          </>
                        ) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <ScoreBar score={s.total_score} max={totalMax} />
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <div className="flex gap-1">
                        {Object.entries(DIMENSION_CONFIG).map(([key, cfg]) => (
                          <div key={key} title={cfg.label} className="w-4 h-4 rounded-sm" style={{
                            backgroundColor: cfg.color,
                            opacity: 0.3 + 0.7 * ((dims[key as keyof typeof dims] ?? 0) / cfg.max),
                          }} />
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell">
                      <span className={`text-[11px] ${getActionColor(rec)}`}>{rec || '—'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <WatchlistToggleBtn stockId={s.stock_id} size="sm" />
                        <button
                          onClick={() => setSelectedStock(s)}
                          className="p-1 rounded hover:bg-sky-100 text-sky-500"
                          title="查看詳情"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">
                    無符合條件的股票
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <span className="text-xs text-gray-500">共 {filtered.length} 筆，第 {page} / {totalPages} 頁</span>
            <div className="flex gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedStock && (
        <StockDetailModal
          stock={selectedStock}
          onClose={() => setSelectedStock(null)}
        />
      )}
    </>
  );
}
