'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { ScanStock } from '@/lib/scanTypes';
import { BarChart3, ChevronDown, ChevronUp } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface ScanRawData {
  scan_date: string;
  scan_start: string;
  scanned_count: number;
  total_stocks: number;
  top10: ScanStock[];
  all_results: ScanStock[];
  explosive_top5: ScanStock[];
}

function DimensionBadge({ label, score, maxScore = 25 }: { label: string; score: number; maxScore?: number }) {
  const pct = score / maxScore;
  const color = pct >= 0.8 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                pct >= 0.6 ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' :
                pct >= 0.4 ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' :
                'bg-gray-500/20 text-gray-400 border-gray-500/40';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${color}`}>
      {label} {score}/{maxScore}
    </span>
  );
}

function StockCard({ stock, expanded, onToggle }: { stock: ScanStock; expanded: boolean; onToggle: () => void }) {
  const up = stock.change_pct >= 0;

  return (
    <div className="rounded-lg border border-gray-700/60 bg-gray-800/50 overflow-hidden">
      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-750/50" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <div className="text-sm font-bold font-mono text-white">{stock.stock_id}</div>
          <div>
            <div className="text-sm font-semibold text-gray-200">{stock.name}</div>
            <div className="text-[10px] text-gray-500">{stock.sector}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className={`text-lg font-bold font-mono ${up ? 'text-emerald-400' : 'text-red-400'}`}>
              {stock.close}
            </div>
            <div className={`text-[10px] font-mono ${up ? 'text-emerald-400' : 'text-red-400'}`}>
              {up ? '+' : ''}{stock.change_pct.toFixed(2)}%
            </div>
          </div>
          <div className="text-sky-400 font-bold text-sm">{stock.total_score}</div>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-gray-700/40 pt-3">
          <div className="flex flex-wrap gap-1.5">
            <DimensionBadge label="技術" score={stock.dimensions.technical} />
            <DimensionBadge label="籌碼" score={stock.dimensions.chips} />
            <DimensionBadge label="基本面" score={stock.dimensions.fundamental} />
            <DimensionBadge label="消息" score={stock.dimensions.news} />
            <DimensionBadge label="情緒" score={stock.dimensions.sentiment} />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded bg-gray-700/30 p-2">
              <div className="text-[10px] text-gray-500">進場價</div>
              <div className="font-mono text-sky-300">{stock.strategy.entry}</div>
            </div>
            <div className="rounded bg-gray-700/30 p-2">
              <div className="text-[10px] text-gray-500">目標價</div>
              <div className="font-mono text-emerald-300">{stock.strategy.target}</div>
            </div>
            <div className="rounded bg-gray-700/30 p-2">
              <div className="text-[10px] text-gray-500">停損價</div>
              <div className="font-mono text-red-300">{stock.strategy.stop_loss}</div>
            </div>
            <div className="rounded bg-gray-700/30 p-2">
              <div className="text-[10px] text-gray-500">上漲空間</div>
              <div className="font-mono text-emerald-300">+{stock.strategy.upside}%</div>
            </div>
          </div>

          <div className="rounded bg-sky-500/10 border border-sky-500/30 p-2 text-xs">
            <div className="text-[10px] text-gray-500 mb-1">策略建議</div>
            <div className="text-sky-300 font-medium">{stock.strategy.recommendation}</div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            {Object.entries(stock.signals).map(([key, signals]) =>
              signals.map((s, i) => (
                <div key={`${key}-${i}`} className="text-gray-400 flex items-start gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400/60 mt-1 flex-shrink-0" />
                  <span>
                    <span className="text-gray-500">[{key === 'technical' ? '技術' : key === 'chips' ? '籌碼' : key === 'fundamental' ? '基本面' : key === 'news' ? '消息' : '情緒'}]</span> {s}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2 text-[10px] text-gray-500">
            <span>RSI: {stock.details.rsi.toFixed(1)}</span>
            <span>量比: {stock.details.vol_ratio.toFixed(1)}x</span>
            {stock.details.pe != null && <span>PE: {stock.details.pe.toFixed(1)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StockRecommendations() {
  const { data, isLoading, error } = useSWR<ScanRawData>('/data/scan_result.json', fetcher, { refreshInterval: 0 });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const stocks = data?.explosive_top5?.length ? data.explosive_top5 : data?.top10 || [];

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-700/60 bg-gray-800/50 p-6 text-center">
        <div className="text-sm text-gray-400">載入掃錨結果中...</div>
      </div>
    );
  }

  if (error || !stocks.length) {
    return (
      <div className="rounded-lg border border-gray-700/60 bg-gray-800/50 p-6 text-center">
        <div className="text-sm text-gray-400 mb-2">目前沒有掃錨資料</div>
        <div className="text-[10px] text-gray-600">請等待每日 22:55 掃錨任務執行，或等待資料更新</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-700/60 bg-gray-800/50 p-4">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="w-4 h-4 text-sky-400" />
          <div className="text-sm font-semibold text-gray-300">每日底部反轉掃錨結果</div>
        </div>
        <div className="text-[10px] text-gray-500">最近掃描：{data?.scan_date} | 掃描數：{data?.scanned_count} 檔</div>
      </div>

      <div className="space-y-3">
        {stocks.map((stock) => (
          <StockCard
            key={stock.stock_id}
            stock={stock}
            expanded={expandedId === stock.stock_id}
            onToggle={() => setExpandedId(expandedId === stock.stock_id ? null : stock.stock_id)}
          />
        ))}
      </div>

      <div className="rounded-lg border border-gray-700/60 bg-gray-800/50 p-4">
        <div className="text-xs font-semibold text-gray-300 mb-2">評分機制說明</div>
        <div className="grid grid-cols-2 gap-1 text-[10px] text-gray-400">
          <div>總分 = 技術 + 籌碼 + 基本面 + 消息 + 情緒</div>
          <div>最高分: 125 分（每維度各 25 分）</div>
          <div className="text-emerald-400">&gt;= 80: 強烈買進</div>
          <div className="text-blue-400">60-79: 建議買進</div>
          <div className="text-yellow-400">40-59: 觀望</div>
          <div className="text-red-400">&lt; 40: 減碼</div>
        </div>
      </div>
    </div>
  );
}
