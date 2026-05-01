'use client';
import { useState } from 'react';
import { useHistoryIndex, useDateScan } from '@/lib/useScanData';
import { ScanStock, DIMENSION_CONFIG } from '@/lib/scanTypes';
import StockDetailModal from './StockDetailModal';
import { Calendar, ChevronRight, Loader2, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const totalMax = Object.values(DIMENSION_CONFIG).reduce((s, c) => s + c.max, 0);

function MiniBar({ score }: { score: number }) {
  const pct = Math.min(100, (score / totalMax) * 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-sky-500' : pct >= 35 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-600 font-semibold">{score.toFixed(1)}</span>
    </div>
  );
}

function StockRow({ stock, rank, onClick }: { stock: ScanStock; rank: number; onClick: () => void }) {
  const up = (stock.change_pct ?? 0) >= 0;
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-sky-50 cursor-pointer transition-colors border-b border-gray-50 last:border-0"
    >
      <span className="text-xs text-gray-300 font-mono w-5 shrink-0">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-gray-400">{stock.stock_id}</span>
          <span className="text-sm font-semibold text-gray-800 truncate">{stock.name}</span>
          <span className="text-[10px] text-gray-400 hidden sm:inline bg-gray-100 px-1 rounded">{stock.sector}</span>
        </div>
        <MiniBar score={stock.total_score} />
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-mono font-bold text-gray-800">{stock.close.toLocaleString()}</div>
        {/* 台灣：漲紅跌綠 */}
        <div className={`text-xs font-mono flex items-center justify-end gap-0.5 ${up ? 'text-red-500' : 'text-green-600'}`}>
          {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {Math.abs(stock.change_pct ?? 0).toFixed(2)}%
        </div>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
    </div>
  );
}

function DatePanel({ date, onSelectStock }: { date: string; onSelectStock: (s: ScanStock) => void }) {
  const { data, isLoading } = useDateScan(date);

  if (isLoading) return (
    <div className="py-10 text-center">
      <Loader2 className="w-6 h-6 text-sky-500 animate-spin mx-auto mb-2" />
      <p className="text-xs text-gray-400">載入 {date} 掃描結果...</p>
    </div>
  );

  if (!data) return (
    <div className="py-8 text-center text-xs text-gray-400">找不到該日期的掃描資料</div>
  );

  return (
    <div>
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-500">掃描日：<span className="font-mono text-sky-600">{data.scan_date}</span></span>
        {data.scanned_count && (
          <span className="text-xs text-gray-400">共掃描 {data.scanned_count} 檔</span>
        )}
      </div>
      <div>
        {data.top10.map((s, i) => (
          <StockRow key={s.stock_id} stock={s} rank={i + 1} onClick={() => onSelectStock(s)} />
        ))}
      </div>
    </div>
  );
}

export default function HistoryBrowser() {
  const { dates, isLoading: indexLoading } = useHistoryIndex();
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [selectedStock, setSelectedStock] = useState<ScanStock | null>(null);

  if (indexLoading) return (
    <div className="rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm">
      <Loader2 className="w-8 h-8 text-sky-500 animate-spin mx-auto mb-3" />
      <p className="text-sm text-gray-500">載入歷史索引...</p>
    </div>
  );

  if (!dates || dates.length === 0) return (
    <div className="rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm">
      <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="text-sm text-gray-500">尚無歷史掃描記錄</p>
      <p className="text-xs text-gray-400 mt-1">每日 22:55 掃描後自動建立記錄</p>
    </div>
  );

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* 日期選單 */}
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span className="text-xs text-gray-500 font-medium">選擇日期（共 {dates.length} 筆記錄）</span>
        </div>
        <div className="flex flex-wrap gap-2 p-4 border-b border-gray-100">
          {dates.slice().reverse().map(d => (
            <button
              key={d}
              onClick={() => setActiveDate(activeDate === d ? null : d)}
              className={`px-3 py-1.5 text-xs rounded-lg border font-mono transition-all ${
                activeDate === d
                  ? 'bg-sky-500 text-white border-sky-500 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-sky-300 hover:text-sky-600'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {/* 選中日期的結果 */}
        {activeDate && (
          <DatePanel date={activeDate} onSelectStock={setSelectedStock} />
        )}

        {!activeDate && (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-400">點選上方日期查看當日 Top 10</p>
          </div>
        )}
      </div>

      {selectedStock && (
        <StockDetailModal stock={selectedStock} onClose={() => setSelectedStock(null)} />
      )}
    </>
  );
}
