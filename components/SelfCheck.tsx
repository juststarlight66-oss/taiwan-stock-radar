'use client';
import { useState, useMemo, useRef } from 'react';
import { useAllScores, useOnDemandScan, AllStocksIndex } from '@/lib/useScanData';
import { ScanStock, DIMENSION_CONFIG } from '@/lib/scanTypes';
import RadarChart from './RadarChart';
import DimensionBars from './DimensionBars';
import { Search, X, TrendingUp, TrendingDown, Minus, Info, AlertCircle, Zap, BarChart2 } from 'lucide-react';

const BASE = '/taiwan-stock-radar';

function getChangeIcon(pct: number) {
  if (pct > 0) return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (pct < 0) return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-gray-400" />;
}

function getChangeColor(pct: number) {
  if (pct > 0) return 'text-emerald-400';
  if (pct < 0) return 'text-red-400';
  return 'text-gray-400';
}

function getScoreGrade(score: number): { label: string; color: string } {
  if (score >= 85) return { label: '強力買進', color: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40' };
  if (score >= 70) return { label: '買進', color: 'text-sky-300 bg-sky-500/15 border-sky-500/40' };
  if (score >= 55) return { label: '觀望', color: 'text-amber-300 bg-amber-500/15 border-amber-500/40' };
  return { label: '偏弱', color: 'text-red-300 bg-red-500/15 border-red-500/40' };
}

interface StockResultProps {
  stock: ScanStock;
  scanDate: string;
  isHistorical?: boolean;
  historicalDate?: string;
  isOnDemand?: boolean;
}

function StockResult({ stock, scanDate, isHistorical, historicalDate, isOnDemand }: StockResultProps) {
  const totalMax = Object.values(DIMENSION_CONFIG).reduce((s, c) => s + c.max, 0);
  const scorePercent = Math.min(Math.round((stock.total_score / totalMax) * 100), 100);
  const grade = getScoreGrade(stock.total_score);
  const dimKeys = Object.keys(DIMENSION_CONFIG) as (keyof typeof DIMENSION_CONFIG)[];

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center gap-2">
        {isOnDemand ? (
          <div className="flex items-center gap-1.5 rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1">
            <Zap className="w-3 h-3 text-violet-400" />
            <span className="text-xs font-medium text-violet-300">即時分析</span>
            <span className="text-[10px] text-violet-500 ml-1">· 即時計算，非每日掃描收錄</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1">
            <BarChart2 className="w-3 h-3 text-sky-400" />
            <span className="text-xs font-medium text-sky-300">每日掃描</span>
          </div>
        )}
      </div>
      {isHistorical && historicalDate && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
          <Info className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">此股票未出現在最新掃描中，顯示的是 <span className="font-mono font-bold">{historicalDate}</span> 的歷史資料</p>
        </div>
      )}
      {isOnDemand && (
        <div className="flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2.5">
          <Info className="w-4 h-4 text-violet-400 shrink-0" />
          <p className="text-xs text-violet-300">此股票不在今日掃描池中，已從 TWSE 即時計算五維評分。基本面數據（毛利率、營收）採中性估算。</p>
        </div>
      )}
      <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 px-5 py-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white">{stock.name}</h2>
              <span className="font-mono text-sm text-gray-400">({stock.stock_id})</span>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">{stock.sector}</span>
              <span className="text-xs text-gray-600">收盤 <span className="font-mono text-gray-300">{stock.close.toLocaleString()}</span></span>
              <span className={`flex items-center gap-1 text-xs font-mono font-bold ${getChangeColor(stock.change_pct)}`}>
                {getChangeIcon(stock.change_pct)}
                {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct.toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold font-mono text-white">{Math.round(stock.total_score)}</div>
            <div className="text-[11px] text-gray-500">/ {totalMax} 分</div>
            <div className={`mt-1 text-xs px-2 py-0.5 rounded border font-medium inline-block ${grade.color}`}>{grade.label}</div>
          </div>
        </div>

        <div className="mt-4 h-1.5 rounded-full bg-gray-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              scorePercent >= 70 ? 'bg-emerald-500' : scorePercent >= 50 ? 'bg-sky-500' : scorePercent >= 35 ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${scorePercent}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-4">
          <h3 className="text-xs font-semibold text-gray-400 mb-3">五維評分雷達</h3>
          <RadarChart dimensions={stock.dimensions} />
        </div>
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-4">
          <h3 className="text-xs font-semibold text-gray-400 mb-3">各維度分項</h3>
          <DimensionBars dimensions={stock.dimensions} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {dimKeys.map((dim) => {
          const cfg = DIMENSION_CONFIG[dim];
          const sigs = stock.signals?.[dim] ?? [];
          return (
            <div key={dim} className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
                <span className="font-mono text-xs text-gray-400">{stock.dimensions[dim]} / {cfg.max}</span>
              </div>
              <ul className="space-y-1">
                {sigs.length > 0
                  ? sigs.map((s, i) => <li key={i} className="text-[11px] text-gray-400 flex items-start gap-1.5"><span className="mt-0.5 w-1 h-1 rounded-full bg-gray-600 shrink-0" />{s}</li>)
                  : <li className="text-[11px] text-gray-600">無訊號</li>}
              </ul>
            </div>
          );
        })}
      </div>

      {stock.strategy && (
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 px-5 py-4">
          <h3 className="text-xs font-semibold text-gray-400 mb-3">策略建議</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div><div className="text-[11px] text-gray-500 mb-1">建議進場</div><div className="font-mono font-bold text-sky-300">{stock.strategy.entry.toLocaleString()}</div></div>
            <div><div className="text-[11px] text-gray-500 mb-1">目標價</div><div className="font-mono font-bold text-emerald-300">{stock.strategy.target.toLocaleString()}</div></div>
            <div><div className="text-[11px] text-gray-500 mb-1">停損價</div><div className="font-mono font-bold text-red-400">{stock.strategy.stop_loss.toLocaleString()}</div></div>
            <div>
              <div className="text-[11px] text-gray-500 mb-1">上行空間</div>
              <div className="font-mono font-bold text-emerald-300">+{stock.strategy.upside}%</div>
            </div>
          </div>
          <div className="mt-3 text-center">
            <span className="text-xs text-gray-600">掃描日期：{scanDate}</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  /** Lightweight index passed from MainDashboard (already loaded, ~120KB) */
  indexData: AllStocksIndex | null;
}

export default function SelfCheck({ indexData }: Props) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Full all_scores — only loaded when we actually need detail for a stock in the index
  const needFullData = useMemo(() => {
    if (!submitted) return false;
    if (!indexData) return true; // index not available, load full data
    const q = submitted.trim().toLowerCase();
    const inIndex = indexData.stocks.some(
      (s) => s.stock_id === q || s.name.toLowerCase().includes(q)
    );
    return inIndex; // if found in index → need full data for detail view
  }, [submitted, indexData]);

  const { data: allScores, isLoading: allLoading } = useAllScores(needFullData);

  // Determine if the stock is in today's scan
  const todayStock = useMemo(() => {
    if (!submitted || !allScores) return null;
    const q = submitted.trim().toLowerCase();
    return allScores.all_stock_scores.find(
      (s) => s.stock_id === q || s.name.toLowerCase().includes(q)
    ) ?? null;
  }, [submitted, allScores]);

  // If not in today's scan, try on-demand TWSE fetch
  // Only trigger if: submitted, full data loaded (or index confirmed not found), and todayStock is null
  const indexConfirmedNotFound = useMemo(() => {
    if (!submitted || !indexData) return false;
    const q = submitted.trim().toLowerCase();
    return !indexData.stocks.some(
      (s) => s.stock_id === q || s.name.toLowerCase().includes(q)
    );
  }, [submitted, indexData]);

  const onDemandId = useMemo(() => {
    if (!submitted) return null;
    // Trigger on-demand if:
    // 1. Index says not found, OR
    // 2. Full data loaded and todayStock is null
    const fullDataLoaded = !!allScores;
    if (indexConfirmedNotFound) return submitted.trim();
    if (fullDataLoaded && !todayStock) return submitted.trim();
    return null;
  }, [submitted, indexConfirmedNotFound, allScores, todayStock]);

  const { data: onDemandData, status: onDemandStatus, error: onDemandError } = useOnDemandScan(onDemandId);

  // Search suggestions from lightweight index
  const suggestions = useMemo(() => {
    if (!query.trim() || query.trim().length < 1 || !indexData) return [];
    const q = query.trim().toLowerCase();
    return indexData.stocks
      .filter((s) => s.stock_id.startsWith(q) || s.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, indexData]);

  function handleSubmit(val?: string) {
    const v = (val ?? query).trim();
    if (!v) return;
    setSubmitted(v);
    setQuery(v);
  }

  function handleClear() {
    setQuery('');
    setSubmitted('');
    inputRef.current?.focus();
  }

  const scanDate = allScores?.scan_date ?? indexData?.scan_date ?? '';
  const isLoading = needFullData && allLoading;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-700/40 bg-gradient-to-r from-gray-900 to-gray-900/50 px-5 py-4">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <Search className="w-5 h-5 text-sky-400" />自主檢查
        </h1>
        <p className="text-xs text-gray-400 mt-1">
          輸入任意台股代號或名稱，查詢五維評分。今日掃描收錄 {indexData?.scanned_count ?? 0} 檔，未收錄者自動即時分析。
        </p>
      </div>

      <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-5">
        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="輸入股票代號或名稱，如 2330 或 台積電"
                className="w-full bg-gray-800 border border-gray-700/60 rounded-lg pl-9 pr-8 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-sky-500/60"
              />
              {query && (
                <button onClick={handleClear} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => handleSubmit()}
              className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              查詢
            </button>
          </div>

          {/* Suggestions dropdown from lightweight index */}
          {suggestions.length > 0 && query !== submitted && (
            <div className="absolute top-full left-0 right-0 mt-1 z-10 rounded-xl border border-gray-700/60 bg-gray-900 shadow-2xl overflow-hidden">
              {suggestions.map((s) => (
                <button
                  key={s.stock_id}
                  onClick={() => handleSubmit(s.stock_id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800 transition-colors text-left"
                >
                  <span className="font-mono text-xs text-gray-500 w-10">{s.stock_id}</span>
                  <span className="text-sm text-gray-200 font-medium">{s.name}</span>
                  <span className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">{s.sector}</span>
                  <span className={`ml-auto text-xs font-mono font-bold ${s.change_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {s.change_pct >= 0 ? '+' : ''}{s.change_pct.toFixed(2)}%
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {submitted && (
        <div>
          {isLoading && (
            <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-12 text-center">
              <div className="w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-gray-400">查詢 {submitted} 中...</p>
            </div>
          )}

          {!isLoading && todayStock && (
            <StockResult stock={todayStock} scanDate={scanDate} />
          )}

          {!isLoading && !todayStock && onDemandStatus === 'loading' && (
            <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-12 text-center">
              <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-gray-400">即時查詢 TWSE 資料中...</p>
              <p className="text-xs text-gray-600 mt-1">{submitted} 不在今日掃描池，正在即時計算五維評分</p>
            </div>
          )}

          {!isLoading && !todayStock && onDemandStatus === 'done' && onDemandData && (
            <StockResult stock={onDemandData.stock} scanDate={scanDate} isOnDemand />
          )}

          {!isLoading && !todayStock && onDemandStatus === 'not_traded' && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center">
              <AlertCircle className="w-10 h-10 text-red-500/60 mx-auto mb-3" />
              <p className="text-sm text-red-400">找不到此股票</p>
              <p className="text-xs text-gray-500 mt-1">{onDemandError}</p>
            </div>
          )}

          {!isLoading && !todayStock && onDemandStatus === 'error' && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-8 text-center">
              <AlertCircle className="w-10 h-10 text-amber-500/60 mx-auto mb-3" />
              <p className="text-sm text-amber-400">即時查詢失敗</p>
              <p className="text-xs text-gray-500 mt-1">{onDemandError ?? 'TWSE API 暫時無法存取，請稍後再試'}</p>
            </div>
          )}

          {!isLoading && !todayStock && onDemandStatus === 'idle' && !indexConfirmedNotFound && !needFullData && (
            <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-12 text-center">
              <div className="w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-gray-400">搜尋中...</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
