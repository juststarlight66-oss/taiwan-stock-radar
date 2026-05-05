'use client';

interface RecommendationBadgeProps {
  recommendation: string;
}

export function RecommendationBadge({ recommendation }: RecommendationBadgeProps) {
  // Parse action type from recommendation text
  const getStyle = (text: string) => {
    if (text.includes('強力買進') || text.includes('積極買進'))
      return 'bg-red-100 text-red-700 border-red-300';
    if (text.includes('買進'))
      return 'bg-orange-100 text-orange-700 border-orange-300';
    if (text.includes('觀望'))
      return 'bg-gray-100 text-gray-600 border-gray-300';
    if (text.includes('減碼') || text.includes('賣出'))
      return 'bg-blue-100 text-blue-700 border-blue-300';
    return 'bg-emerald-100 text-emerald-700 border-emerald-300';
  };

  return (
    <span
      className={`inline-block px-3 py-1 text-sm font-semibold rounded-full border ${getStyle(recommendation)}`}
    >
      {recommendation}
    </span>
  );
}
