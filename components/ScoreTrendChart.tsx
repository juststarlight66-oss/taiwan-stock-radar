'use client';

/**
 * ScoreTrendChart
 * 迷你 SVG 折線圖，顯示某支股票在歷史掃描中的 total_score 趨勢。
 * Props:
 *   stockId  — 股票代號
 *   history  — { date: string; score: number }[] (最舊 → 最新)
 *   width / height — 可選，預設 80×28
 */

interface DataPoint {
  date: string;
  score: number;
}

interface Props {
  stockId: string;
  history: DataPoint[];
  width?: number;
  height?: number;
  showDots?: boolean;
}

export default function ScoreTrendChart({
  history,
  width = 80,
  height = 28,
  showDots = false,
}: Props) {
  if (!history || history.length < 2) {
    return (
      <span className="text-[10px] text-gray-600 font-mono">—</span>
    );
  }

  const pad = 2;
  const scores = history.map((d) => d.score);
  const minS = Math.min(...scores);
  const maxS = Math.max(...scores);
  const range = maxS - minS || 1;

  const toX = (i: number) =>
    pad + (i / (history.length - 1)) * (width - pad * 2);
  const toY = (s: number) =>
    pad + ((maxS - s) / range) * (height - pad * 2);

  const points = history.map((d, i) => `${toX(i)},${toY(d.score)}`).join(' ');

  const last = history[history.length - 1].score;
  const prev = history[history.length - 2].score;
  const trend = last >= prev ? 'up' : 'down';
  const lineColor = trend === 'up' ? '#34d399' : '#f87171'; // emerald-400 / red-400

  // gradient fill under the line
  const fillPoints = [
    `${toX(0)},${height - pad}`,
    ...history.map((d, i) => `${toX(i)},${toY(d.score)}`),
    `${toX(history.length - 1)},${height - pad}`,
  ].join(' ');

  const gradId = `sg_${Math.random().toString(36).slice(2, 7)}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 overflow-visible"
      aria-label="score trend"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* fill */}
      <polygon points={fillPoints} fill={`url(#${gradId})`} />
      {/* line */}
      <polyline
        points={points}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* dots */}
      {showDots &&
        history.map((d, i) => (
          <circle
            key={i}
            cx={toX(i)}
            cy={toY(d.score)}
            r="2"
            fill={lineColor}
            opacity="0.8"
          />
        ))}
      {/* last value dot */}
      <circle
        cx={toX(history.length - 1)}
        cy={toY(last)}
        r="2.5"
        fill={lineColor}
      />
    </svg>
  );
}
