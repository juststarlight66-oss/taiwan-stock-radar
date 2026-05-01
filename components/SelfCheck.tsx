'use client';
import { useState, useMemo } from 'react';
import { useAllScores, useOnDemandScan } from '@/lib/useScanData';
import { ScanStock } from '@/lib/scanTypes';
import {
  Search, X, AlertCircle, Loader2, ChevronDown, ChevronUp,
  Target, ArrowUpRight, ArrowDownRight, TrendingUp,
} from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
} from 'recharts';

/* ── 評等設定 ─────────────────────────────────────────── */
const GRADE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  '強力買進': { label: '強力買進 🔥', color: 'text-red-600',      bg: 'bg-red-50',      border: 'border-red-300' },
  '買進':     { label: '買進 ✅',      color: 'text-orange-500',   bg: 'bg-orange-50',   border: 'border-orange-300' },
  '觀望':     { label: '觀望 ⏳',      color: 'text-gray-500',     bg: 'bg-gray-50',     border: 'border-gray-300' },
  '偏弱':     { label: '偏弱 ⚠️',     color: 'text-green-700',    bg: 'bg-green-50',    border: 'border-green-300' },
};

const DIM_LABELS: Record<string, string> = {
  technical: '技術面', fundamental: '基本面', news: '消息面', sentiment: '市場情緒', chips: '籌碼面',
};

const DIM_MAXES: Record<string, number> = {
  technical: 40, fundamental: 40, news: 10, sentiment: 10, chips: 10,
};

/* ── 維度進度條 ───────────────────────────────────────── */
function ScoreBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color =
    pct >= 70 ? 'bg-emerald-500' :
    pct >= 50 ? 'bg-sky-500' :
    pct >= 30 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ── 五維雷達圖 ───────────────────────────────────────── */
function DimRadar({ dimensions }: { dimensions: Record<string, number> }) {
  const data = Object.entries(DIM_LABELS).map(([key, label]) => {
    const raw = (dimensions[key] as number) ?? 0;
    const max = DIM_MAXES[key] ?? 10;
    return { dim: label, value: Math.round((raw / max) * 100) };
  });

  return (
    <ResponsiveContainer width="100%" height={180}>
      <RadarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis
          dataKey="dim"
          tick={{ fontSize: 10, fill: '#6b7280' }}
        />
        <Radar
          name="評分"
          dataKey="value"
          stroke="#38bdf8"
          fill="#38bdf8"
          fillOpacity={0.25}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/* ── 訊號折疊卡片 ────────────────────────────────────── */
const DIM_COLORS: Record<string, string> = {
  technical:   'bg-sky-50 border-sky-200 text-sky-700',
  fundamental: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  news:        'bg-amber-50 border-amber-200 text-amber-700',
  sentiment:   'bg-purple-50 border-purple-200 text-purple-700',
  chips:       'bg-rose-50 border-rose-200 text-rose-700',
};

function SignalsPanel({ signals }: { signals: Record<string, string[]> }) {
  const [open, setOpen] = useState(false);
  const total = Object.values(signals).flat().length;

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-[11px] font-semibold text-gray-500 flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />五維訊號明細（{total} 條）
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
      </button>

      {open && (
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.entries(signals).map(([dim, sigs]) => {
            const cls = DIM_COLORS[dim] ?? 'bg-gray-50 border-gray-200 text-gray-600';
            const items = sigs as string[];
            if (!items.length) return null;
            return (
              <div key={dim} className={`rounded-lg border px-3 py-2 ${cls}`}>
                <div className="text-[10px] font-bold mb-1 uppercase tracking-wide opacity-70">
                  {DIM_LABELS[dim] ?? dim}
                </div>
                <ul className="space-y-0.5">
                  {items.map((s, i) => (
                    <li key={i} className="text-[11px] flex items-start gap-1">
                      <span className="opacity-40 shrink-0">•</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── 主卡片 ──────────────────────────────────────────── */
function StockCard({ stock }: { stock: ScanStock & { isOnDemand?: boolean } }) {
  const [expanded, setExpanded] = useState(true);
  const grade = stock.strategy?.recommendation ?? '觀望';
  const gradeKey = Object.keys(GRADE_CONFIG).find(k => grade.includes(k)) ?? '觀望';
  const gradeConf = GRADE_CONFIG[gradeKey];
  const up = (stock.change_pct ?? 0) >= 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      {/* Header — 點擊折疊 */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-gray-900">{stock.name}</span>
              <span className="text-xs text-gray-400 font-mono">{stock.stock_id}</span>
              {stock.isOnDemand && (
                <span className="text-[9px] bg-purple-50 text-purple-600 border border-purple-200 px-1.5 py-0.5 rounded-full">即時</span>
              )}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">{stock.sector}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xl font-bold font-mono text-gray-900">{stock.total_score.toFixed(1)}</div>
            <div className={`text-[10px] font-semibold ${gradeConf.color}`}>{gradeConf.label}</div>
          </div>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-gray-400" />
            : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-5 space-y-4 pt-4">

          {/* 價格列 */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-2xl font-bold font-mono text-gray-900">
                {stock.close.toLocaleString()}
              </span>
              <span className="text-xs text-gray-400 ml-1">TWD</span>
            </div>
            <div className={`text-sm font-mono font-bold flex items-center gap-1 ${up ? 'text-red-500' : 'text-green-600'}`}>
              {up ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              {up ? '+' : ''}{(stock.change_pct ?? 0).toFixed(2)}%
            </div>
          </div>

          {/* 雷達圖 + 五維度條（左右並排，小螢幕疊排）*/}
          {stock.dimensions && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              {/* 雷達圖 */}
              <div className="rounded-xl border border-gray-100 bg-gray-50 py-2">
                <DimRadar dimensions={stock.dimensions as Record<string, number>} />
              </div>

              {/* 維度條 */}
              <div className="space-y-2.5">
                {Object.entries(stock.dimensions).map(([dim, val]) => {
                  const v = val as number;
                  const max = DIM_MAXES[dim] ?? 10;
                  const pct = Math.min(100, (v / max) * 100);
                  return (
                    <div key={dim}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] text-gray-500">{DIM_LABELS[dim] ?? dim}</span>
                        <span className="text-[11px] font-mono font-semibold text-gray-700">
                          {v.toFixed(1)} / {max}
                          <span className="text-gray-400 ml-1">({Math.round(pct)}%)</span>
                        </span>
                      </div>
                      <ScoreBar value={v} max={max} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 訊號折疊卡片 */}
          {stock.signals && (
            <SignalsPanel signals={stock.signals as Record<string, string[]>} />
          )}

          {/* 交易策略區塊 */}
          {stock.strategy && (
            <div className="space-y-3">
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                <Target className="w-3 h-3" />交易策略
              </div>

              {/* 進場 / 停損 */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-sky-50 border border-sky-200 px-3 py-2.5 text-center">
                  <div className="text-[10px] text-gray-500 mb-0.5">進場參考</div>
                  <div className="text-sm font-mono font-bold text-sky-700">
                    {stock.strategy.entry ?? '—'}
                  </div>
                  {stock.strategy.atr != null && (
                    <div className="text-[9px] text-gray-400 mt-0.5">ATR {stock.strategy.atr}</div>
                  )}
                </div>
                <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-center">
                  <div className="text-[10px] text-gray-500 mb-0.5">停損</div>
                  <div className="text-sm font-mono font-bold text-red-600">
                    {stock.strategy.stop_loss ?? '—'}
                  </div>
                  {stock.strategy.downside != null && (
                    <div className="text-[9px] text-red-400 mt-0.5">-{stock.strategy.downside}%</div>
                  )}
                </div>
              </div>

              {/* 三關目標價 */}
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: '🎯 第一關', price: stock.strategy.target1 ?? stock.strategy.target, upside: stock.strategy.upside,  cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                  { label: '🎯 第二關', price: stock.strategy.target2,  upside: stock.strategy.upside2, cls: 'bg-emerald-50 border-emerald-300 text-emerald-800' },
                  { label: '🚀 第三關', price: stock.strategy.target3,  upside: stock.strategy.upside3, cls: 'bg-amber-50 border-amber-200 text-amber-700' },
                ].map(({ label, price, upside, cls }) => (
                  <div key={label} className={`rounded-xl border px-1.5 py-2.5 text-center ${cls}`}>
                    <div className="text-[9px] text-gray-500 mb-0.5">{label}</div>
                    <div className="text-xs font-mono font-bold">{price ?? '—'}</div>
                    {upside != null && (
                      <div className="text-[9px] opacity-70 mt-0.5">+{upside}%</div>
                    )}
                  </div>
                ))}
              </div>

              {stock.strategy.target_note && (
                <div className="text-[10px] text-gray-400 text-center">基準：{stock.strategy.target_note}</div>
              )}

              {/* 評等標籤 */}
              <div className={`text-sm font-bold text-center py-2.5 rounded-xl border ${gradeConf.bg} ${gradeConf.border} ${gradeConf.color}`}>
                {gradeConf.label}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 搜尋建議下拉 ─────────────────────────────────────── */
function SuggestionList({
  items,
  onSelect,
}: {
  items: { stock_id: string; name: string; sector: string }[];
  onSelect: (id: string, name: string) => void;
}) {
  if (!items.length) return null;
  return (
    <ul className="absolute top-full left-0 right-0 z-20 mt-1 rounded-xl border border-gray-200 bg-white shadow-lg max-h-52 overflow-y-auto">
      {items.map(s => (
        <li key={s.stock_id}>
          <button
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-sky-50 transition-colors text-left"
            onMouseDown={() => onSelect(s.stock_id, s.name)}
          >
            <span className="text-sm font-medium text-gray-800">{s.name}</span>
            <span className="text-xs text-gray-400 font-mono">{s.stock_id} · {s.sector}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ── 主元件 ──────────────────────────────────────────── */
export default function SelfCheck() {
  const [inputVal, setInputVal]   = useState('');
  const [searchId, setSearchId]   = useState<string | null>(null);
  const [showSug,  setShowSug]    = useState(false);

  const { data: allScores } = useAllScores();
  const { data: onDemand, status: odStatus, error: odError } = useOnDemandScan(searchId);

  /* 名稱 or 代號搜尋建議（從 all_scores.json 拿） */
  const suggestions = useMemo(() => {
    const list = allScores?.all_stock_scores ?? [];
    const q = inputVal.trim();
    if (!q || q.length < 1) return [];
    const lower = q.toLowerCase();
    return list
      .filter(s =>
        s.stock_id.startsWith(q) ||
        s.name.includes(q) ||
        s.stock_id.toLowerCase().includes(lower)
      )
      .slice(0, 8)
      .map(s => ({ stock_id: s.stock_id, name: s.name, sector: s.sector }));
  }, [inputVal, allScores]);

  /* 在 all_scores 裡找到的結果 */
  const found = useMemo(() => {
    if (!searchId) return null;
    const list = allScores?.all_stock_scores ?? [];
    return list.find(s => s.stock_id === searchId) ?? null;
  }, [searchId, allScores]);

  const displayStock: (ScanStock & { isOnDemand?: boolean }) | null = useMemo(() => {
    if (!searchId) return null;
    if (found) return found;
    if (onDemand?.stock) return { ...onDemand.stock, isOnDemand: true };
    return null;
  }, [found, onDemand, searchId]);

  const handleSearch = (idOverride?: string) => {
    const raw = (idOverride ?? inputVal).trim();
    if (!raw) return;
    // 若輸入的是名稱，先去 allScores 找 stock_id
    const list = allScores?.all_stock_scores ?? [];
    const byName = list.find(s => s.name === raw);
    setSearchId(byName ? byName.stock_id : raw);
    setShowSug(false);
  };

  const handleSelect = (id: string, name: string) => {
    setInputVal(`${name}（${id}）`);
    setSearchId(id);
    setShowSug(false);
  };

  const handleClear = () => {
    setInputVal('');
    setSearchId(null);
    setShowSug(false);
  };

  const showLoading  = !!searchId && !found && odStatus === 'loading';
  const showNotFound = !!searchId && !found && odStatus === 'not_traded';
  const showError    = !!searchId && !found && odStatus === 'error';

  return (
    <div className="space-y-4">
      {/* 搜尋框 */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={inputVal}
              onChange={e => { setInputVal(e.target.value); setShowSug(true); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); if (e.key === 'Escape') setShowSug(false); }}
              onFocus={() => setShowSug(true)}
              onBlur={() => setTimeout(() => setShowSug(false), 150)}
              placeholder="輸入股票代號或名稱（如 2330 或 台積電）"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
            {showSug && (
              <SuggestionList items={suggestions} onSelect={handleSelect} />
            )}
          </div>
          <button
            onClick={() => handleSearch()}
            className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            查詢
          </button>
          {searchId && (
            <button onClick={handleClear} className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          支援代號或中文名稱搜尋；今日掃描名單內即時顯示，名單外將向 TWSE 即時查詢並評分
        </p>
      </div>

      {/* 載入中 */}
      {showLoading && (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <Loader2 className="w-8 h-8 text-sky-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-600">正在即時查詢 {searchId} 並計算五維評分...</p>
          <p className="text-[11px] text-gray-400 mt-1">從 TWSE OpenAPI 抓取近 60 日 K 線，約需 5–15 秒</p>
        </div>
      )}

      {/* 找不到 */}
      {showNotFound && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
          <p className="text-sm text-amber-700">找不到「{searchId}」的交易資料</p>
          <p className="text-[11px] text-gray-500 mt-1">請確認代號正確，或該股票尚未在 TWSE 上市</p>
        </div>
      )}

      {/* 錯誤 */}
      {showError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center shadow-sm">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-sm text-red-700">查詢失敗</p>
          <p className="text-[11px] text-gray-500 mt-1">{odError}</p>
        </div>
      )}

      {/* 結果卡片 */}
      {displayStock && <StockCard stock={displayStock} />}

      {/* 空狀態 */}
      {!searchId && (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <Search className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500 font-medium">輸入股票代號或名稱開始查詢</p>
          <p className="text-[11px] text-gray-400 mt-1">支援台積電、聯發科等中文名稱，或直接輸入 2330</p>
        </div>
      )}
    </div>
  );
}
