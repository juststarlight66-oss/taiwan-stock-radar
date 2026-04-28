'use client';
import { NewsItem } from '@/lib/types';
import { demoNews } from '@/lib/demoData';
import { Newspaper, TrendingUp, TrendingDown, Minus } from 'lucide-react';

const SENTIMENT_ICON = {
  positive: <TrendingUp className="w-3 h-3 text-emerald-400" />,
  negative: <TrendingDown className="w-3 h-3 text-red-400" />,
  neutral:  <Minus className="w-3 h-3 text-gray-400" />,
};
const SENTIMENT_DOT = {
  positive: 'bg-emerald-400',
  negative: 'bg-red-400',
  neutral:  'bg-gray-500',
};

interface Props { news?: NewsItem[]; }

export default function NewsSidebar({ news }: Props) {
  const items = news && news.length > 0 ? news : demoNews;

  return (
    <div className="rounded-lg border border-gray-700/60 bg-gray-800/50 flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-700/60 flex items-center gap-2">
        <Newspaper className="w-4 h-4 text-sky-400" />
        <h3 className="text-sm font-semibold text-gray-200">市場快訊</h3>
        <span className="ml-auto text-xs text-gray-500">即時</span>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-gray-700/30">
        {items.map(item => (
          <div key={item.id} className="px-4 py-3 hover:bg-gray-700/20 transition-colors cursor-pointer group">
            <div className="flex items-start gap-2">
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${SENTIMENT_DOT[item.sentiment]}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-300 leading-snug group-hover:text-white transition-colors line-clamp-2">
                  {item.title}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-gray-600 text-[10px]">{item.source}</span>
                  <span className="text-gray-700">·</span>
                  <span className="text-gray-600 text-[10px]">{item.time}</span>
                  <span className="ml-auto flex items-center gap-1">
                    <span className="text-[10px] text-gray-500 bg-gray-700/50 rounded px-1.5 py-0.5">{item.category}</span>
                    {SENTIMENT_ICON[item.sentiment]}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
