'use client';
import { IndexData } from '@/lib/types';
import { TrendingUp, TrendingDown, Activity, BarChart2, DollarSign } from 'lucide-react';

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtVol(n: number) {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + ' 兆';
  if (n >= 1e8) return (n / 1e8).toFixed(1) + ' 億';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + ' 萬';
  return n.toFixed(0);
}

interface Props { data: IndexData; isDemo: boolean; }

export default function MarketOverviewCards({ data, isDemo }: Props) {
  const up = data.change >= 0;
  const Color = up ? 'text-emerald-400' : 'text-red-400';
  const BgColor = up ? 'bg-emerald-400/10 border-emerald-400/30' : 'bg-red-400/10 border-red-400/30';
  const Icon = up ? TrendingUp : TrendingDown;

  const cards = [
    {
      label: '加權指數',
      value: fmt(data.close),
      sub: `${up ? '+' : ''}${fmt(data.change)} (${up ? '+' : ''}${fmt(data.changePercent)}%)`,
      color: Color,
      bg: BgColor,
      icon: <Icon className={`w-5 h-5 ${Color}`} />,
    },
    {
      label: '開盤 / 昨收',
      value: fmt(data.open),
      sub: `前收 ${fmt(data.close - data.change)}`,
      color: 'text-sky-400',
      bg: 'bg-sky-400/10 border-sky-400/30',
      icon: <Activity className="w-5 h-5 text-sky-400" />,
    },
    {
      label: '日高 / 日低',
      value: fmt(data.high),
      sub: `低 ${fmt(data.low)}`,
      color: 'text-amber-400',
      bg: 'bg-amber-400/10 border-amber-400/30',
      icon: <BarChart2 className="w-5 h-5 text-amber-400" />,
    },
    {
      label: '成交金額',
      value: fmtVol(data.volume),
      sub: '元',
      color: 'text-violet-400',
      bg: 'bg-violet-400/10 border-violet-400/30',
      icon: <DollarSign className="w-5 h-5 text-violet-400" />,
    },
  ];

  return (
    <div className="space-y-3">
      {isDemo && (
        <div className="text-xs text-amber-400/80 bg-amber-400/10 border border-amber-400/20 rounded px-3 py-1.5 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
          展示模式 — 顯示範例資料（非交易時段或 API 暫時無法連線）
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className={`rounded-lg border ${c.bg} p-4 flex flex-col gap-1`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">{c.label}</span>
              {c.icon}
            </div>
            <div className={`text-xl font-bold font-mono ${c.color}`}>{c.value}</div>
            <div className="text-xs text-gray-500">{c.sub}</div>
          </div>
        ))}
      </div>
      <div className="text-xs text-gray-600 text-right">更新時間：{data.updatedAt}</div>
    </div>
  );
}
