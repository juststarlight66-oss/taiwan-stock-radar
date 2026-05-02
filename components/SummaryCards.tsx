'use client';
import { ScanResult, DIMENSION_CONFIG } from '@/lib/scanTypes';
import { BarChart3, TrendingUp, Target, Zap, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface Props {
  data: ScanResult;
}

function TrendArrow({ value, threshold = 60 }: { value: number; threshold?: number }) {
  if (value >= threshold + 10) return <ArrowUpRight className="w-3.5 h-3.5 text-red-400" />;
  if (value <= threshold - 10) return <ArrowDownRight className="w-3.5 h-3.5 text-green-400" />;
  return <Minus className="w-3.5 h-3.5 text-gray-500" />;
}

function CircleProgress({ pct, color = '#38bdf8', size = 44 }: { pct: number; color?: string; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(pct / 100, 1));
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#1e293b" strokeWidth={3} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={color} strokeWidth={3} fill="none"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
    </svg>
  );
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
  const avgUpside = stocks.length
    ? stocks.reduce((s, st) => s + st.strategy.upside, 0) / stocks.length
    : 0;
  const scannedPct = data.scanned_count ? Math.min((data.scanned_count / 2200) * 100, 100) : 0;
  const scorePct = (avgScore / totalMax) * 100;
  const sentimentScore = Math.round(
    (strongBuy / Math.max(stocks.length, 1)) * 100
  );

  const cards = [
    {
      icon: <BarChart3 className="w-4 h-4 text-sky-400" />,
      label: '掃描標的',
      value: data.scanned_count?.toLocaleString() ?? '—',
      sub: '本日掃描完成',
      accent: 'border-sky-500/20 bg-sky-500/5',
      valueColor: 'text-sky-300',
      progress: <CircleProgress pct={scannedPct} color="#38bdf8" />,
      trend: null,
    },
    {
      icon: <Zap className="w-4 h-4 text-amber-400" />,
      label: '平均評分',
      value: avgScore.toFixed(1),
      sub: `滿分 ${totalMax}`,
      accent: 'border-amber-500/20 bg-amber-500/5',
      valueColor: 'text-amber-300',
      progress: <CircleProgress pct={scorePct} color="#fbbf24" />,
      trend: <TrendArrow value={scorePct} />,
    },
    {
      icon: <TrendingUp className="w-4 h-4 text-red-400" />,
      label: '強力買進',
      value: `${strongBuy} 檔`,
      sub: `共 ${stocks.length} 檔推薦`,
      accent: 'border-red-500/20 bg-red-500/5',
      valueColor: 'text-red-300',
      progress: <CircleProgress pct={sentimentScore} color="#f87171" />,
      trend: <TrendArrow value={sentimentScore} threshold={30} />,
    },
    {
      icon: <Target className="w-4 h-4 text-purple-400" />,
      label: '平均目標漲幅',
      value: `+${avgUpside.toFixed(1)}%`,
      sub: topSectors.join('、') || '—',
      accent: 'border-purple-500/20 bg-purple-500/5',
      valueColor: 'text-purple-300',
      progress: <CircleProgress pct={Math.min(avgUpside * 10, 100)} color="#a78bfa" />,
      trend: null,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className={`rounded-xl border p-4 ${c.accent} relative overflow-hidden`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              {c.icon}
              <span className="text-[11px] text-gray-400 font-medium">{c.label}</span>
            </div>
            {c.trend}
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className={`text-xl font-bold font-mono count-up ${c.valueColor}`}>{c.value}</div>
              <div className="text-[10px] text-gray-600 mt-0.5 truncate max-w-[100px]">{c.sub}</div>
            </div>
            <div className="opacity-80">{c.progress}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
