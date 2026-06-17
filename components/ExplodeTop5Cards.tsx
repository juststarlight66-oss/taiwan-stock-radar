'use client';
import { Zap } from 'lucide-react';
import { ExplodePredictStock } from '@/lib/scanTypes';

interface Props {
  stocks: ExplodePredictStock[];
}

export default function ExplodeTop5Cards({ stocks }: Props) {
  if (!stocks || stocks.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-5 h-5 text-amber-500" />
        <h2 className="text-lg font-bold text-slate-800">爆漲預測 Top 5</h2>
        <span className="text-xs text-slate-400 font-medium">ML 預測明日爆漲機率</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {stocks.map((s, i) => {
          const prob = s.explode_prob ?? 0;
          const probPct = (prob * 100).toFixed(1);
          const name = s.name ?? s.stock_name ?? s.stock_id;

          return (
            <a
              key={s.stock_id}
              href={`/taiwan-stock-radar/stock/${s.stock_id}`}
              className="block bg-white rounded-xl p-4 border border-amber-200 hover:border-amber-400 hover:shadow-md transition-all group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-amber-500">#{i + 1}</span>
                <Zap className="w-4 h-4 text-amber-400 group-hover:text-amber-600 transition-colors" />
              </div>
              <div className="font-bold text-slate-800 text-sm truncate mb-1">
                {name}
              </div>
              <div className="text-xs text-slate-400 font-mono mb-3">{s.stock_id}</div>
              <div className="text-2xl font-mono font-black text-amber-600">
                {probPct}%
              </div>
              <div className="text-xs text-slate-400 mt-1">爆漲機率</div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
