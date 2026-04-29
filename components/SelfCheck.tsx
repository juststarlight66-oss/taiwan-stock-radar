'use client';
import { useState, useMemo, useRef } from 'react';
import { useAllScores, useOnDemandScan } from '@/lib/useScanData';
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
              <span className={`text-xs font-medium border px-2 py-0.5 rounded ${grade.color}`}>{grade.label}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold font-mono text-white">{stock.close?.toFixed(2) ?? '—'}</div>
            <div className={`flex items-center justify-end gap-1 text-sm font-mono ${getChangeColor(stock.change_pct)}`}>
              {getChangeIcon(stock.change_pct)}
              {stock.change_pct > 0 ? '+' : ''}{stock.change_pct?.toFixed(2) ?? '0.00'}%
            </div>
            <div className="text-[10px] text-gray-600 mt-1">{isOnDemand ? '即時資料' : `掃描日期：${scanDate}`}</div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-700/40">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-gray-400">五維綜合評分</span>
            <span className="text-lg font-bold font-mono text-sky-300">{stock.total_score.toFixed(1)}<span className="text-xs text-gray-600">/{totalMax}</span></span>
          </div>
          <div className="h-2 rounded-full bg-gray-700/60 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-400 transition-all duration-700" style={{ width: `${scorePercent}%` }} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-5 flex flex-col items-center">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 self-start">五維雷達圖</h3>
          <RadarChart dimensions={stock.dimensions} size={220} />
        </div>
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">各維度分數</h3>
          <DimensionBars dimensions={stock.dimensions} />
          {stock.strategy && (
            <div className="mt-4 pt-4 border-t border-gray-700/40 space-y-2">
              <h4 className="text-xs font-semibold text-gray-400">策略建議</h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-gray-800/60 px-2 py-2"><div className="text-[10px] text-gray-500 mb-0.5">進場</div><div className="text-xs font-mono font-bold text-emerald-400">{stock.strategy.entry ?? '—'}</div></div>
                <div className="rounded-lg bg-gray-800/60 px-2 py-2"><div className="text-[10px] text-gray-500 mb-0.5">目標</div><div className="text-xs font-mono font-bold text-sky-400">{stock.strategy.target ?? '—'}</div></div>
                <div className="rounded-lg bg-gray-800/60 px-2 py-2"><div className="text-[10px] text-gray-500 mb-0.5">停損</div><div className="text-xs font-mono font-bold text-red-400">{stock.strategy.stop_loss ?? '—'}</div></div>
              </div>
              {stock.strategy.recommendation && (
                <div className="text-xs text-gray-400 text-center pt-1">策略：<span className="text-gray-200">{stock.strategy.recommendation}</span></div>
              )}
            </div>
          )}
        </div>
      </div>
      {stock.signals && (
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">訊號詳情</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {dimKeys.map((key) => {
              const cfg = DIMENSION_CONFIG[key];
              const sigs: string[] = stock.signals?.[key] ?? [];
              if (!sigs.length) return null;
              return (
                <div key={key} className="rounded-lg bg-gray-800/40 border border-gray-700/30 p-3">
                  <div className="text-[11px] font-semibold mb-2" style={{ color: cfg.color }}>{cfg.label}</div>
                  <ul className="space-y-1">
                    {sigs.slice(0, 4).map((sig, i) => (
                      <li key={i} className="text-[11px] text-gray-400 flex items-start gap-1.5">
                        <span className="mt-0.5 w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                        {sig}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function OnDemandLookup({ stockId, onClear }: { stockId: string; onClear: () => void }) {
  const { data, status, error } = useOnDemandScan(stockId);
  if (status === 'loading') {
    return (
      <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-12 text-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-400">正在從 TWSE 即時計算 <span className="font-mono text-violet-300">{stockId}</span> 的五維評分...</p>
        <p className="text-xs text-gray-600 mt-1">通常需要 3–8 秒</p>
      </div>
    );
  }
  if (status === 'not_traded' || status === 'error') {
    return (
      <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-12 text-center">
        <AlertCircle className="w-10 h-10 text-gray-600 mx-auto mb-3" />
        <p className="text-sm text-gray-400">找不到股票代號 <span className="font-mono text-sky-300">{stockId}</span></p>
        <p className="text-xs text-gray-600 mt-1.5">{error ?? '此股票可能不在 TWSE 上市，請確認代號是否正確'}</p>
      </div>
    );
  }
  if (status === 'done' && data) {
    return <StockResult stock={data.stock} scanDate={new Date().toISOString().slice(0, 10)} isOnDemand />;
  }
  return null;
}

export default function SelfCheck() {
  const { data: allScores, isLoading, error } = useAllScores();
  const [query, setQuery] = useState('');
  const [committed, setCommitted] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [result, setResult] = useState<{ stock: ScanStock; scanDate: string; isHistorical: boolean; historicalDate?: string; } | null>(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [onDemandId, setOnDemandId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const stockMap = useMemo(() => {
    if (!allScores?.all_stock_scores) return new Map<string, ScanStock>();
    return new Map(allScores.all_stock_scores.map((s) => [s.stock_id, s]));
  }, [allScores]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 1 || !allScores?.all_stock_scores) return [];
    return allScores.all_stock_scores.filter((s) => s.stock_id.startsWith(q) || s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, allScores]);

  function doSearch(ticker: string) {
    const q = ticker.trim();
    if (!q) return;
    setCommitted(q);
    setShowSuggestions(false);
    setSearching(true);
    setNotFound(false);
    setResult(null);
    setOnDemandId(null);
    const found = stockMap.get(q);
    if (found && allScores) {
      setResult({ stock: found, scanDate: allScores.scan_date, isHistorical: false });
      setSearching(false);
      return;
    }
    fetch(`${BASE}/data/index.json`)
      .then((r) => r.json())
      .then(async (idx: { dates: string[] }) => {
        const dates = (idx.dates ?? []).slice(0, 30);
        for (const date of dates) {
          const dateStr = date.replace(/-/g, '');
          try {
            const resp = await fetch(`${BASE}/data/scan_result_${dateStr}.json`);
            if (!resp.ok) continue;
            const scanData = await resp.json();
            const allItems: ScanStock[] = [...(scanData.top10 ?? []), ...(scanData.all_results ?? [])];
            const hist = allItems.find((s) => s.stock_id === q);
            if (hist) {
              setResult({ stock: hist, scanDate: date, isHistorical: true, historicalDate: date });
              setSearching(false);
              return;
            }
          } catch { continue; }
        }
        setSearching(false);
        setOnDemandId(q);
      })
      .catch(() => { setSearching(false); setOnDemandId(q); });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') doSearch(query);
    if (e.key === 'Escape') setShowSuggestions(false);
  }

  function clearSearch() {
    setQuery(''); setCommitted(''); setResult(null); setNotFound(false); setOnDemandId(null); setShowSuggestions(false);
    inputRef.current?.focus();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-700/40 bg-gradient-to-r from-gray-900 to-gray-900/50 px-5 py-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2"><Search className="w-5 h-5 text-sky-400" />自主檢查</h1>
            <p className="text-xs text-gray-400 mt-1">輸入股票代號（如 2330、3008），查詢五維雷達圖分析；未收錄股票將即時從 TWSE 計算</p>
          </div>
          {allScores && (
            <div className="text-right">
              <div className="text-xs text-gray-500">資料日期</div>
              <div className="text-sm font-mono font-bold text-sky-300">{allScores.scan_date}</div>
              <div className="text-[10px] text-gray-600">{allScores.scanned_count} 檔已掃描</div>
            </div>
          )}
        </div>
      </div>
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            <input ref={inputRef} type="text" value={query}
              onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); }}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="輸入股票代號或名稱（如 2330 / 台積電）"
              className="w-full bg-gray-900 border border-gray-700/60 rounded-xl pl-10 pr-10 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/30 transition-all"
            />
            {query && (
              <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button onClick={() => doSearch(query)} disabled={!query.trim() || isLoading}
            className="px-5 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors whitespace-nowrap">
            查詢
          </button>
        </div>
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 rounded-xl border border-gray-700/60 bg-gray-900 shadow-xl z-30 overflow-hidden">
            {suggestions.map((s) => (
              <button key={s.stock_id} onMouseDown={() => { setQuery(s.stock_id); doSearch(s.stock_id); }}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-800 transition-colors flex items-center justify-between gap-3 border-b border-gray-800/60 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-sky-300">{s.stock_id}</span>
                  <span className="text-sm text-gray-300">{s.name}</span>
                  <span className="text-[10px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">{s.sector}</span>
                </div>
                <span className={`text-xs font-mono ${getChangeColor(s.change_pct)}`}>{s.change_pct > 0 ? '+' : ''}{s.change_pct?.toFixed(2)}%</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {isLoading && (
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-12 text-center">
          <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">載入股票評分資料中...</p>
        </div>
      )}
      {!isLoading && error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
          <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm text-amber-300">無法載入評分資料</p>
          <p className="text-xs text-gray-500 mt-1">all_scores.json 尚未生成，請等待下一次 22:55 掃描後更新</p>
        </div>
      )}
      {searching && (
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-12 text-center">
          <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">搜尋 <span className="font-mono text-sky-300">{committed}</span> 中（包含歷史記錄）...</p>
        </div>
      )}
      {onDemandId && !searching && <OnDemandLookup stockId={onDemandId} onClear={clearSearch} />}
      {result && !searching && <StockResult stock={result.stock} scanDate={result.scanDate} isHistorical={result.isHistorical} historicalDate={result.historicalDate} isOnDemand={false} />}
      {!isLoading && !error && !result && !searching && !notFound && !onDemandId && (
        <div className="rounded-xl border border-gray-700/40 bg-gray-900/30 p-12 text-center">
          <Search className="w-12 h-12 text-gray-700 mx-auto mb-4" />
          <p className="text-sm text-gray-500">輸入股票代號開始查詢</p>
          <p className="text-xs text-gray-600 mt-1">支援代號（如 2330）或名稱（如 台積電）搜尋</p>
          <div className="mt-3 flex items-center justify-center gap-3 flex-wrap">
            {allScores && <span className="text-xs text-gray-700">資料庫收錄 <span className="text-gray-500">{allScores.all_stock_scores.length}</span> 檔股票評分</span>}
            <span className="text-xs text-gray-700">·</span>
            <span className="text-xs text-gray-600 flex items-center gap-1"><Zap className="w-3 h-3 text-violet-600" />未收錄股票自動即時分析</span>
          </div>
        </div>
      )}
    </div>
  );
}
