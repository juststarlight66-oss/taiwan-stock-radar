'use client';
import { useState, useMemo, useRef } from 'react';
import { useAllScores, useOnDemandScan } from '@/lib/useScanData';
import { ScanStock } from '@/lib/scanTypes';
import { Search, X, AlertCircle, Loader2, ChevronDown, ChevronUp, TrendingUp, TrendingDown, BarChart2, Target, Shield, Zap } from 'lucide-react';

const GRADE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  '強力買進': { label: '強力買進 🔥', color: 'text-red-300',    bg: 'bg-red-900/30',    border: 'border-red-700/50' },
  '買進':     { label: '買進 ✅',     color: 'text-emerald-300', bg: 'bg-emerald-900/30', border: 'border-emerald-700/50' },
  '觀望':     { label: '觀望 ⏳',     color: 'text-amber-300',   bg: 'bg-amber-900/30',   border: 'border-amber-700/50' },
  '偏弱':     { label: '偏弱 ⚠️',    color: 'text-gray-400',    bg: 'bg-gray-800/40',    border: 'border-gray-600/40' },
};

const DIM_LABELS: Record<string, string> = {
  technical: '技術面', fundamental: '基本面', news: '消息面', sentiment: '市場情緒', chips: '籌碼面',
};

function ScoreBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : pct >= 30 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <div className="w-full bg-gray-700/60 rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StockCard({ stock }: { stock: ScanStock & { isOnDemand?: boolean } }) {
  const [expanded, setExpanded] = useState(true);
  const grade = stock.strategy?.recommendation ?? '觀望';
  const gradeConf = GRADE_CONFIG[grade] ?? GRADE_CONFIG['觀望'];

  const dimMaxes: Record<string, number> = {
    technical: 40, fundamental: 40, news: 10, sentiment: 10, chips: 10,
  };

  return (
    <div className="rounded-xl border border-gray-700/60 bg-gray-900/70 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-800/40 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">{stock.name}</span>
              <span className="text-xs text-gray-500 font-mono">{stock.stock_id}</span>
              {stock.isOnDemand && (
                <span className="text-[9px] bg-purple-900/40 text-purple-400 border border-purple-700/40 px-1.5 py-0.5 rounded-full">即時</span>
              )}
            </div>
            <div className="text-[11px] text-gray-500">{stock.sector}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-lg font-bold font-mono text-white">{stock.total_score.toFixed(1)}</div>
            <div className={`text-[10px] ${gradeConf.color}`}>{gradeConf.label}</div>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-800/60">
          {/* 價格行 */}
          <div className="flex items-center justify-between pt-3">
            <div className="text-xl font-bold font-mono text-white">{stock.close.toLocaleString()}</div>
            <div className={`text-sm font-mono font-bold ${
              (stock.change_pct ?? 0) > 0 ? 'text-red-400' : (stock.change_pct ?? 0) < 0 ? 'text-emerald-400' : 'text-gray-400'
            }`}>
              {(stock.change_pct ?? 0) > 0 ? '+' : ''}{(stock.change_pct ?? 0).toFixed(2)}%
            </div>
          </div>

          {/* 五維度 */}
          {stock.dimensions && (
            <div className="space-y-1.5">
              {Object.entries(stock.dimensions).map(([dim, val]) => (
                <div key={dim} className="flex items-center gap-2">
                  <div className="text-[10px] text-gray-500 w-14 shrink-0">{DIM_LABELS[dim] ?? dim}</div>
                  <ScoreBar value={val as number} max={dimMaxes[dim] ?? 10} />
                  <div className="text-[10px] font-mono text-gray-400 w-8 text-right shrink-0">{(val as number).toFixed(1)}</div>
                </div>
              ))}
            </div>
          )}

          {/* 訊號 */}
          {stock.signals && (
            <div className="space-y-1">
              {Object.entries(stock.signals).map(([dim, sigs]) =>
                (sigs as string[]).map((s, i) => (
                  <div key={`${dim}-${i}`} className="text-[10px] text-gray-400 flex items-start gap-1">
                    <span className="text-gray-600 shrink-0">•</span>
                    <span>{s}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 交易策略 */}
          {stock.strategy && (
            <div className="space-y-2 pt-1">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Target className="w-3 h-3" />交易策略
              </div>
              {/* 進場 + 停損 */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-gray-800/60 px-2 py-2">
                  <div className="text-[10px] text-gray-500 mb-0.5">進場參考</div>
                  <div className="text-xs font-mono font-bold text-emerald-400">{stock.strategy.entry ?? '—'}</div>
                  {stock.strategy.atr != null && (
                    <div className="text-[9px] text-gray-600 mt-0.5">ATR {stock.strategy.atr}</div>
                  )}
                </div>
                <div className="rounded-lg bg-red-900/20 border border-red-800/30 px-2 py-2">
                  <div className="text-[10px] text-gray-500 mb-0.5">停損</div>
                  <div className="text-xs font-mono font-bold text-red-400">{stock.strategy.stop_loss ?? '—'}</div>
                  {stock.strategy.downside != null && (
                    <div className="text-[9px] text-red-600 mt-0.5">-{stock.strategy.downside}%</div>
                  )}
                </div>
              </div>
              {/* 三關目標價 */}
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div className="rounded-lg bg-sky-900/20 border border-sky-800/30 px-1.5 py-2">
                  <div className="text-[9px] text-gray-500 mb-0.5">🎯 第一關</div>
                  <div className="text-xs font-mono font-bold text-sky-300">{stock.strategy.target1 ?? stock.strategy.target ?? '—'}</div>
                  {stock.strategy.upside != null && (
                    <div className="text-[9px] text-sky-600 mt-0.5">+{stock.strategy.upside}%</div>
                  )}
                </div>
                <div className="rounded-lg bg-sky-900/30 border border-sky-700/40 px-1.5 py-2">
                  <div className="text-[9px] text-gray-500 mb-0.5">🎯 第二關</div>
                  <div className="text-xs font-mono font-bold text-sky-200">{stock.strategy.target2 ?? '—'}</div>
                  {stock.strategy.upside2 != null && (
                    <div className="text-[9px] text-sky-500 mt-0.5">+{stock.strategy.upside2}%</div>
                  )}
                </div>
                <div className="rounded-lg bg-amber-900/20 border border-amber-700/30 px-1.5 py-2">
                  <div className="text-[9px] text-gray-500 mb-0.5">🚀 第三關</div>
                  <div className="text-xs font-mono font-bold text-amber-300">{stock.strategy.target3 ?? '—'}</div>
                  {stock.strategy.upside3 != null && (
                    <div className="text-[9px] text-amber-600 mt-0.5">+{stock.strategy.upside3}%</div>
                  )}
                </div>
              </div>
              {stock.strategy.target_note && (
                <div className="text-[10px] text-gray-600 text-center">基準：{stock.strategy.target_note}</div>
              )}
              {stock.strategy.recommendation && (
                <div className="text-xs text-gray-400 text-center pt-1">策略：<span className="text-gray-200">{stock.strategy.recommendation}</span></div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SelfCheck() {
  const [inputVal, setInputVal] = useState('');
  const [searchId, setSearchId]  = useState<string | null>(null);
  const { data: allScores, isLoading: allLoading } = useAllScores();
  const { data: onDemand, status: odStatus, error: odError } = useOnDemandScan(searchId);

  const found = useMemo(() => {
    if (!searchId) return null;
    const allList = allScores?.all_stock_scores ?? [];
    return allList.find(s => s.stock_id === searchId) ?? null;
  }, [searchId, allScores]);

  const displayStock: (ScanStock & { isOnDemand?: boolean }) | null = useMemo(() => {
    if (!searchId) return null;
    if (found) return found;
    if (onDemand?.stock) return { ...onDemand.stock, isOnDemand: true };
    return null;
  }, [found, onDemand, searchId]);

  const handleSearch = () => {
    const id = inputVal.trim();
    if (id) setSearchId(id);
  };

  const handleClear = () => {
    setInputVal('');
    setSearchId(null);
  };

  const isLoading = allLoading || odStatus === 'loading';
  const showOnDemandLoading = !!searchId && !found && odStatus === 'loading';
  const showNotFound = !!searchId && !found && odStatus === 'not_traded';
  const showError = !!searchId && !found && odStatus === 'error';

  return (
    <div className="space-y-4">
      {/* 搜尋框 */}
      <div className="rounded-xl border border-gray-700/40 bg-gray-900/70 p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="輸入股票代號（如 2330）"
              className="w-full bg-gray-800/60 border border-gray-700/60 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-sky-500/60"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            查詢
          </button>
          {searchId && (
            <button onClick={handleClear} className="p-2 text-gray-500 hover:text-gray-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-[10px] text-gray-600 mt-2">
          在今日掃描結果中搜尋；若不在名單內，將即時向 TWSE 查詢並進行五維度評分
        </p>
      </div>

      {/* 結果 */}
      {showOnDemandLoading && (
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-10 text-center">
          <Loader2 className="w-8 h-8 text-sky-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">正在即時查詢 {searchId} 並計算評分...</p>
          <p className="text-[11px] text-gray-600 mt-1">從 TWSE OpenAPI 抓取近 60 日 K 線，約需 5-15 秒</p>
        </div>
      )}

      {showNotFound && (
        <div className="rounded-xl border border-amber-700/30 bg-amber-900/10 p-6 text-center">
          <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm text-amber-300">找不到 {searchId} 的交易資料</p>
          <p className="text-[11px] text-gray-500 mt-1">該股票可能未在 TWSE 上市，或代號有誤</p>
        </div>
      )}

      {showError && (
        <div className="rounded-xl border border-red-700/30 bg-red-900/10 p-6 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-300">查詢失敗</p>
          <p className="text-[11px] text-gray-500 mt-1">{odError}</p>
        </div>
      )}

      {displayStock && <StockCard stock={displayStock} />}

      {!searchId && (
        <div className="rounded-xl border border-gray-700/40 bg-gray-900/40 p-8 text-center">
          <Search className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">輸入股票代號開始查詢</p>
          <p className="text-[11px] text-gray-600 mt-1">支援所有 TWSE 上市股票，不限今日掃描名單</p>
        </div>
      )}
    </div>
  );
}
