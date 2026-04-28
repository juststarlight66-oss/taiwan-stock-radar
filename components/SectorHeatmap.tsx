'use client';
import { SectorData } from '@/lib/types';
import { demoSectors } from '@/lib/demoData';
import { Flame, Wind, Snowflake } from 'lucide-react';

const MOMENTUM_ICON = {
  hot:  <Flame className="w-3.5 h-3.5 text-orange-400" />,
  warm: <Wind className="w-3.5 h-3.5 text-amber-400" />,
  cool: <Snowflake className="w-3.5 h-3.5 text-sky-400" />,
};
const MOMENTUM_LABEL = { hot: '強勢', warm: '中性', cool: '弱勢' };

function intensityColor(change: number) {
  if (change >= 3) return 'bg-emerald-500/30 border-emerald-500/50 text-emerald-300';
  if (change >= 1) return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400';
  if (change >= 0) return 'bg-emerald-500/8 border-emerald-500/20 text-emerald-500';
  if (change >= -1) return 'bg-red-500/8 border-red-500/20 text-red-500';
  if (change >= -2) return 'bg-red-500/15 border-red-500/30 text-red-400';
  return 'bg-red-500/30 border-red-500/50 text-red-300';
}

function fmtVol(n: number) {
  return (n / 1e8).toFixed(0) + ' 億';
}

interface Props { sectors?: SectorData[]; }

export default function SectorHeatmap({ sectors }: Props) {
  const list = sectors && sectors.length > 0 ? sectors : demoSectors;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-300">族群熱力圖</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {list.map(s => (
          <div key={s.name} className={`rounded-lg border p-4 cursor-pointer hover:opacity-80 transition-opacity ${intensityColor(s.change)}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-sm">{s.name}</span>
              {MOMENTUM_ICON[s.momentum]}
            </div>
            <div className="font-mono text-xl font-bold mb-1">
              {s.change >= 0 ? '+' : ''}{s.change.toFixed(2)}%
            </div>
            <div className="text-[10px] opacity-70 space-y-0.5">
              <div>龍頭：{s.topStock}</div>
              <div>成交：{fmtVol(s.volume)}</div>
              <div className="flex items-center gap-1">
                {MOMENTUM_ICON[s.momentum]}
                <span>{MOMENTUM_LABEL[s.momentum]}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
