'use client';
import { useState, useMemo } from 'react';
import { ScanStock, DIMENSION_CONFIG } from '@/lib/scanTypes';
import StockDetailModal from './StockDetailModal';
import { Search, ArrowUpDown, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface Props {
  stocks: ScanStock[];
  scanDate?: string;
}

const DIM_KEYS = Object.keys(DIMENSION_CONFIG) as (keyof typeof DIMENSION_CONFIG)[];
const totalMax = Object.values(DIMENSION_CONFIG).reduce((s, c) => s + c.max, 0);

type SortKey = 'total_score' | 'close' | 'change_pct' | keyof typeof DIMENSION_CONFIG;

export default function AllResultsTable({ stocks, scanDate }: Props) {
  const [query, setQuery]       = useState('');
  const [sortKey, setSortKey]   = useState<SortKey>('total_score');
  const [sortAsc, setSortAsc]   = useState(false);
  const [selected, setSelected] = useState<ScanStock | null>(null);
  const [page, setPage]         = useState(1);
  const PAGE_SIZE = 50;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let arr = q
      ? stocks.filter(s => s.stock_id.includes(q) || s.name.toLowerCase().includes(q) || s.sector.includes(q))
      : [...stocks];
    arr.sort((a, b) => {
      let av: number, bv: number;
      if (sortKey === 'total_score') { av = a.total_score; bv = b.total_score; }
      else if (sortKey === 'close')  { av = a.close; bv = b.close; }
      else if (sortKey === 'change_pct') { av = a.change_pct ?? 0; bv = b.change_pct ?? 0; }
      else { av = a.dimensions?.[sortKey] ?? 0; bv = b.dimensions?.[sortKey] ?? 0; }
      return sortAsc ? av - bv : bv - av;
    });
    return arr;
  }, [stocks, query, sortKey, sortAsc]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
    setPage(1);
  };

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => handleSort(k)}
      className={`flex items-center gap-0.5 hover:text-sky-600 transition-colors ${sortKey === k ? 'text-sky-600 font-semibold' : ''}`}
    >
      {label}
      <ArrowUpDown className={`w-2.5 h-2.5 ${sortKey === k ? 'text-sky-500' : 'text-gray-300'}`} />
    </button>
  );

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* 搜尋列 */}
        <div className="p-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(1); }}
              placeholder="搜尋代號 / 名稱 / 族群..."
              className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
          </div>
          <span className="text-xs text-gray-400 shrink-0">
            共 {filtered.length} 檔{scanDate ? `　${scanDate}` : ''}
          </span>
        </div>

        {/* 桌面版表格 */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 bg-gray-50 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 font-medium w-8 text-gray-300">#</th>
                <th className="text-left px-3 py-2.5 font-medium">代號 / 名稱</th>
                <th className="text-left px-3 py-2.5 font-medium hidden lg:table-cell">族群</th>
                <th className="text-right px-3 py-2.5 font-medium"><SortBtn k="close" label="收盤" /></th>
                <th className="text-right px-3 py-2.5 font-medium"><SortBtn k="change_pct" label="漲跌" /></th>
                <th className="text-right px-3 py-2.5 font-medium"><SortBtn k="total_score" label="總分" /></th>
                {DIM_KEYS.map(k => (
                  <th key={k} className="text-right px-2 py-2.5 font-medium hidden xl:table-cell">
                    <SortBtn k={k} label={DIMENSION_CONFIG[k].label.slice(0, 2)} />
                  </th>
                ))}
                <th className="text-left px-3 py-2.5 font-medium">建議</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paged.map((s, i) => {
                const up = (s.change_pct ?? 0) >= 0;
                const recKey = s.strategy?.recommendation ?? '';
                const recColor =
                  recKey.includes('強力') ? 'bg-red-50 text-red-600 border-red-200' :
                  recKey.includes('買進') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  recKey === '觀望'       ? 'bg-amber-50 text-amber-600 border-amber-200' :
                                           'bg-gray-100 text-gray-500 border-gray-200';
                return (
                  <tr
                    key={s.stock_id}
                    onClick={() => setSelected(s)}
                    className="hover:bg-sky-50 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2 text-gray-300 font-mono">{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-gray-400 text-[10px]">{s.stock_id}</div>
                      <div className="font-semibold text-gray-800 text-xs">{s.name}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-500 hidden lg:table-cell">{s.sector}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-gray-800">{s.close.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      {/* 台灣：漲紅跌綠 */}
                      <span className={`font-mono flex items-center justify-end gap-0.5 text-xs ${up ? 'text-red-500' : 'text-green-600'}`}>
                        {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(s.change_pct ?? 0).toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="font-mono font-bold text-gray-800">{s.total_score.toFixed(1)}</span>
                      <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                        <div
                          className="h-1 rounded-full bg-sky-500"
                          style={{ width: `${Math.min(100, (s.total_score / totalMax) * 100)}%` }}
                        />
                      </div>
                    </td>
                    {DIM_KEYS.map(k => (
                      <td key={k} className="px-2 py-2 text-right font-mono text-gray-500 hidden xl:table-cell">
                        {(s.dimensions?.[k] ?? 0).toFixed(1)}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${recColor}`}>
                        {recKey.split(' - ')[0] || '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 手機卡片 */}
        <div className="block md:hidden divide-y divide-gray-100">
          {paged.map((s, i) => {
            const up = (s.change_pct ?? 0) >= 0;
            return (
              <div
                key={s.stock_id}
                onClick={() => setSelected(s)}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-sky-50 cursor-pointer"
              >
                <span className="text-xs text-gray-300 w-6 shrink-0 font-mono">{(page - 1) * PAGE_SIZE + i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-gray-400">{s.stock_id}</span>
                    <span className="text-sm font-semibold text-gray-800 truncate">{s.name}</span>
                  </div>
                  <div className="text-[10px] text-gray-400">{s.sector}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-gray-800 text-sm">{s.close.toLocaleString()}</div>
                  <div className={`text-xs font-mono flex items-center justify-end gap-0.5 ${up ? 'text-red-500' : 'text-green-600'}`}>
                    {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {Math.abs(s.change_pct ?? 0).toFixed(2)}%
                  </div>
                </div>
                <div className="text-right shrink-0 w-10">
                  <div className="font-mono font-bold text-sky-600 text-sm">{s.total_score.toFixed(1)}</div>
                  <div className="text-[9px] text-gray-400">分</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 分頁 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 py-3 border-t border-gray-100 bg-gray-50">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-xs rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30 hover:bg-gray-100 transition-colors"
            >
              上一頁
            </button>
            <span className="text-xs text-gray-500">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-xs rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30 hover:bg-gray-100 transition-colors"
            >
              下一頁
            </button>
          </div>
        )}
      </div>

      {selected && <StockDetailModal stock={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
