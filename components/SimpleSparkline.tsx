'use client';

interface SimpleSparklineProps {
  data: number[];
  width?: number;
  height?: number;
}

export function SimpleSparkline({ data, width = 300, height = 80 }: SimpleSparklineProps) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 4;

  const points = data.map((val, i) => {
    const x = padding + ((width - padding * 2) / (data.length - 1)) * i;
    const y = padding + (height - padding * 2) * (1 - (val - min) / range);
    return `${x},${y}`;
  });

  const isUp = data[data.length - 1] >= data[0];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={isUp ? '#16a34a' : '#dc2626'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Fill area under the line */}
      <polygon
        points={`${points[0]} ${points.join(' ')} ${points[points.length - 1]} ${width - padding},${height - padding} ${padding},${height - padding}`}
        fill={isUp ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)'}
      />
    </svg>
  );
}
