'use client';
import { ScanResult, DIMENSION_CONFIG } from '@/lib/scanTypes';
import { BarChart3, TrendingUp, Target, Zap } from 'lucide-react';

interface Props {
  data: ScanResult;
}

export default function SummaryCards({ data }: Props) {
  const stocks = data.top10 ?? [];
  const totalMax = Object.values(DIMENSION_CONFIG).reduce((s, c) => s + c.max, 0);
  const avgScore = stocks.length
    ? stocks.reduce((s, st) => s + st.total_score, 0) / stocks.length
    : 0;
  const strongBuy = stocks.filter(
    (s) => s.strategy.recommendation.includes('強力') || s.strategy.recommendation.includes('積極')
  ).length;
  const topSectors = [...new Set(stocks.map((s) => s.sector))].slice(0, 3);
  const avgUpside =
    stocks.length
      ? stocks.reduce((s, st) => s + st.strategy.upside, 0) / stocks.length
      : 0;

  const cards = [
    {
      icon: <BarChart3 className="w-4 h-4 text-sky-500" />,
      label: '掃描標的',
      value: data.scanned_count?.toLocaleString() ?? '—',
      sub: `Top 10 入選`,
      color: 'border-sky-200 bg-sky-50',
      valueColor: 'text-sky-700',
    },
    {
      icon: <Zap className="w-4 h-4 text-amber-500" />,
      label: '平均評分',
      value: avgScore.toFixed(1),
      sub: `滿分 ${totalMax}`,
      color: 'border-amber-200 bg-amber-50',
      valueColor: 'text-amber-700',
    },
    {
      icon: <TrendingUp className="w-4 h-4 text-red-500" />,
      label: '強力買進',
      value: `${strongBuy} 檔`,
      sub: `共 ${stocks.length} 檔推薦`,
      color: 'border-red-200 bg-red-50',
      valueColor: 'text-red-600',
    },
    {
      icon: <Target className="w-4 h-4 text-purple-500" />,
      label: '平均目標漲幅',
      value: `+${avgUpside.toFixed(1)}%`,
      sub: topSectors.join('、'),
      color: 'border-purple-200 bg-purple-50',
      valueColor: 'text-purple-700',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className={`rounded-xl border p-4 shadow-sm ${c.color}`}>
          <div className="flex items-center gap-2 mb-2">
            {c.icon}
            <span className="text-[11px] text-gray-500 font-medium">{c.label}</span>
          </div>
          <div className={`text-xl font-bold font-mono ${c.valueColor}`}>{c.value}</div>
          <div className="text-[10px] text-gray-400 mt-1 truncate">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}
