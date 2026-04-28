'use client';
import { ScanDimensions, DIMENSION_CONFIG } from '@/lib/scanTypes';

interface Props {
  dimensions: ScanDimensions;
  size?: number;
}

export default function RadarChart({ dimensions, size = 200 }: Props) {
  const keys = Object.keys(DIMENSION_CONFIG) as (keyof typeof DIMENSION_CONFIG)[];
  const n = keys.length;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const labelR = size * 0.50;

  // angles: start from top (-90deg), go clockwise
  const angle = (i: number) => (i * 2 * Math.PI) / n - Math.PI / 2;

  const toXY = (i: number, radius: number) => ({
    x: cx + radius * Math.cos(angle(i)),
    y: cy + radius * Math.sin(angle(i)),
  });

  // grid rings
  const rings = [0.25, 0.5, 0.75, 1.0];

  // axis lines
  const axes = keys.map((_, i) => {
    const end = toXY(i, r);
    return `M${cx},${cy} L${end.x},${end.y}`;
  });

  // ring polygons
  const ringPaths = rings.map((scale) => {
    const pts = keys.map((_, i) => {
      const p = toXY(i, r * scale);
      return `${p.x},${p.y}`;
    });
    return `M${pts.join('L')}Z`;
  });

  // data polygon
  const dataPoints = keys.map((k, i) => {
    const cfg = DIMENSION_CONFIG[k];
    const val = dimensions[k] ?? 0;
    const pct = Math.min(val / cfg.max, 1);
    return toXY(i, r * pct);
  });
  const dataPath = `M${dataPoints.map((p) => `${p.x},${p.y}`).join('L')}Z`;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
      {/* Grid rings */}
      {ringPaths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#374151" strokeWidth={0.8} strokeDasharray="3,2" />
      ))}
      {/* Axis lines */}
      {axes.map((d, i) => (
        <path key={i} d={d} stroke="#4b5563" strokeWidth={0.8} />
      ))}
      {/* Data fill */}
      <path d={dataPath} fill="rgba(56,189,248,0.15)" stroke="#38bdf8" strokeWidth={1.5} strokeLinejoin="round" />
      {/* Data points */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill={DIMENSION_CONFIG[keys[i]].color} />
      ))}
      {/* Labels */}
      {keys.map((k, i) => {
        const cfg = DIMENSION_CONFIG[k];
        const lp = toXY(i, labelR);
        const val = dimensions[k] ?? 0;
        return (
          <g key={k}>
            <text
              x={lp.x}
              y={lp.y - 5}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9}
              fill="#9ca3af"
            >
              {cfg.label}
            </text>
            <text
              x={lp.x}
              y={lp.y + 6}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9}
              fontWeight="bold"
              fill={cfg.color}
            >
              {val}/{cfg.max}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
