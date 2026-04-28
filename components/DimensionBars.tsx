'use client';
import { ScanDimensions, DIMENSION_CONFIG } from '@/lib/scanTypes';

interface Props {
  dimensions: ScanDimensions;
}

export default function DimensionBars({ dimensions }: Props) {
  const keys = Object.keys(DIMENSION_CONFIG) as (keyof typeof DIMENSION_CONFIG)[];

  return (
    <div className="space-y-2">
      {keys.map((k) => {
        const cfg = DIMENSION_CONFIG[k];
        const val = dimensions[k] ?? 0;
        const pct = Math.min((val / cfg.max) * 100, 100);
        return (
          <div key={k}>
            <div className="flex justify-between items-center mb-0.5">
              <span className="text-[11px] text-gray-400">{cfg.label}</span>
              <span className="text-[11px] font-mono font-semibold" style={{ color: cfg.color }}>
                {val}<span className="text-gray-600">/{cfg.max}</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-700/60 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: cfg.color, opacity: 0.85 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
