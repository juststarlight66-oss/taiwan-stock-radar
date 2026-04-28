'use client';
import { StockData } from '@/lib/types';

const REC_LABELS: Record<StockData['recommendation'], { label: string; color: string; bg: string; width: string }> = {
  strong_buy: { label: '強力買進', color: 'text-emerald-300', bg: 'bg-emerald-500', width: 'w-full' },
  buy:        { label: '買進',     color: 'text-sky-300',     bg: 'bg-sky-500',     width: 'w-3/4'  },
  hold:       { label: '觀望',     color: 'text-amber-300',   bg: 'bg-amber-500',   width: 'w-1/2'  },
  sell:       { label: '減碼',     color: 'text-red-300',     bg: 'bg-red-500',     width: 'w-1/4'  },
};

function fmt(n: number, d = 2) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
}

interface Props { stocks: StockData[]; title: string; filter?: (s: StockData) => boolean; }

export default function StockTable({ stocks, title, filter }: Props) {
  const list = filter ? stocks.filter(filter) : stocks;
  const sorted = [...list].sort((a, b) => b.changePercent - a.changePercent);

  return (
    <div className="rounded-lg border border-gray-700/60 bg-gray-800/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-700/60 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
        <span className="text-xs text-gray-500">{sorted.length} 檔</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700/40">
              <th className="text-left px-4 py-2 font-medium">代號 / 名稱</th>
              <th className="text-right px-3 py-2 font-medium">收盤</th>
              <th className="text-right px-3 py-2 font-medium">漲跌%</th>
              <th className="text-right px-3 py-2 font-medium hidden md:table-cell">本益比</th>
              <th className="text-right px-3 py-2 font-medium hidden lg:table-cell">族群</th>
              <th className="px-4 py-2 font-medium">評分 / 建議</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => {
              const up = s.change >= 0;
              const rec = REC_LABELS[s.recommendation];
              return (
                <tr
                  key={s.stockId}
                  className={`border-b border-gray-700/20 hover:bg-gray-700/30 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-800/30'}`}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-gray-400 w-10 shrink-0">{s.stockId}</span>
                      <span className="text-gray-200 font-medium">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-200">{fmt(s.close)}</td>
                  <td className={`px-3 py-2.5 text-right font-mono font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                    {up ? '+' : ''}{fmt(s.changePercent)}%
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-400 hidden md:table-cell">
                    {s.pe ? fmt(s.pe, 1) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right hidden lg:table-cell">
                    <span className="text-gray-400 bg-gray-700/50 rounded px-1.5 py-0.5">{s.sector}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <div className="flex-1 bg-gray-700 rounded-full h-1.5 overflow-hidden">
                        <div className={`h-full rounded-full ${rec.bg} ${rec.width} transition-all`} />
                      </div>
                      <span className={`text-xs font-medium shrink-0 ${rec.color}`}>{rec.label}</span>
                    </div>
                    <div className="text-gray-600 mt-0.5">評分 {s.score}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
