'use client';
import { useAllScores } from '@/lib/useScanData';
import { DIMENSION_CONFIG, getStockName, getStockSector, getStockClose, getStockChangePct, getStockRecommendation, getStockReason, getStockEntryLow, getStockEntryHigh, getStockStopLoss, getStockTarget1, getStockTarget2, getStockTarget3, getStockDimensions } from '@/lib/scanTypes';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { TrendingUp, AlertTriangle, Crosshair, HelpCircle, Activity } from 'lucide-react';
import React, { use } from 'react';

// For Next.js static export: provide empty paths to build purely client-side

const ACTION_MAP: Record<string, { label: string; text: string; bg: string; border: string; dot: string }> = {
  '強力買進': { label: '強力買進 🔥', text: 'text-red-600 font-bold',    bg: 'bg-red-50',     border: 'border-red-200',    dot: 'bg-red-500' },
  '買進':     { label: '買進 ✅',      text: 'text-orange-600 font-bold', bg: 'bg-orange-50',  border: 'border-orange-200', dot: 'bg-orange-500' },
  '觀望':     { label: '觀望 ⏳',      text: 'text-gray-500',             bg: 'bg-gray-50',    border: 'border-gray-200',   dot: 'bg-gray-400' },
  '偏弱':     { label: '偏弱 ⚠️',     text: 'text-emerald-600',          bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
};

export default function StockDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const resolvedParams = use(params);
  const code = resolvedParams.code;
  
  // Note: Since we want the latest info by default and date isn't in path, checking the "latest" scan might be required,
  // but the prompt says useDateStockSearch. With date=null, it might fail or return null based on the hook implementation.
  // Actually, useDateScan with date=null fetches latest if we look closely, wait... no, useDateScan(null) returns null key in SWR.
  // Let's use the 'latest' endpoint by not relying on the date param if possible.
  // Wait, let's look at useDateStockSearch logic: 
  // It takes (date, stockId) -> if 'latest', wait, we can just pass 'latest' or null?
  // Let's just use `useAllScores` to find the stock directly so it loads the `all_scores.json`.
  const { stocks, isLoading } = useAllScores();
  const stock = stocks.find((s: any) => s.stock_id === code);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600" />
      </div>
    );
  }

  if (!stock) {
    return (
      <div className="max-w-2xl mx-auto p-4 flex flex-col items-center justify-center space-y-4 text-center mt-12 bg-white rounded-xl shadow-sm border border-slate-200 py-12">
        <HelpCircle className="w-12 h-12 text-slate-300" />
        <div>
          <h2 className="text-xl font-bold text-slate-800">找不到個股資料</h2>
          <p className="text-slate-500 mt-2">代號 {code} 不在最新的掃描清單中</p>
        </div>
        <a href="/taiwan-stock-radar/stock/" className="px-4 py-2 mt-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors">
          返回搜尋
        </a>
      </div>
    );
  }

  const name = getStockName(stock);
  const sector = getStockSector(stock);
  const close = getStockClose(stock) ?? 0;
  const changePct = getStockChangePct(stock) ?? 0;
  const isUp = changePct > 0;
  const isDown = changePct < 0;
  const color = isUp ? 'text-red-500' : isDown ? 'text-emerald-500' : 'text-slate-500';
  const sign = isUp ? '+' : '';

  const rec = getStockRecommendation(stock) || '觀望';
  const actionStyle = ACTION_MAP[rec] || ACTION_MAP['觀望'];
  const reason = getStockReason(stock) || '無特別說明';
  
  const dims = getStockDimensions(stock);
  const radarData = Object.entries(dims).map(([key, val]) => ({
    subject: DIMENSION_CONFIG[key]?.label || key,
    A: val,
    fullMark: DIMENSION_CONFIG[key]?.max || 40,
  }));

  const entryLow = getStockEntryLow(stock);
  const entryHigh = getStockEntryHigh(stock);
  const stopLoss = getStockStopLoss(stock);
  const target1 = getStockTarget1(stock);
  const target2 = getStockTarget2(stock);
  const target3 = getStockTarget3(stock);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Header Card */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">
              {name}
            </h1>
            <span className="text-xl text-slate-500 font-mono tracking-wider">{stock.stock_id}</span>
            <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-sm font-medium">
              {sector}
            </span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className={`text-4xl font-mono font-bold ${color}`}>{close.toFixed(2)}</span>
            <span className={`text-lg font-medium ${color}`}>
              {sign}{changePct.toFixed(2)}%
            </span>
          </div>
        </div>

        <div className={`px-6 py-4 rounded-xl border ${actionStyle.bg} ${actionStyle.border} flex flex-col items-center justify-center min-w-[160px]`}>
          <div className="text-sm text-slate-500 font-medium mb-1">AI 綜合評級</div>
          <div className={`text-2xl ${actionStyle.text}`}>{actionStyle.label}</div>
          <div className="text-sm font-bold text-slate-800 mt-2">
            綜合總分: {stock.total_score.toFixed(1)} / 110
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Radar Chart */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 mb-6">
            <Activity className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-bold text-slate-800">五維分數解析</h2>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 13, fontWeight: 500 }} />
                <Radar name={name} dataKey="A" stroke="#6366f1" fill="#818cf8" fillOpacity={0.5} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4">
            {Object.entries(dims).map(([k, v]) => (
              <div key={k} className="text-center p-2 bg-slate-50 rounded-lg">
                <div className="text-xs text-slate-500 font-medium">{DIMENSION_CONFIG[k]?.label || k}</div>
                <div className="text-sm font-bold text-slate-700">{Number(v).toFixed(1)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Strategy Card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <Crosshair className="w-5 h-5 text-rose-500" />
            <h2 className="text-lg font-bold text-slate-800">操作策略計畫</h2>
          </div>
          
          <div className="flex-1 space-y-5">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-sm font-bold text-slate-500 mb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> 進場區間 (參考)
              </div>
              <div className="text-xl font-mono text-slate-700">
                {entryLow && entryHigh ? `${entryLow.toFixed(2)} - ${entryHigh.toFixed(2)}` : (entryLow || entryHigh || '—')}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               {target1 ? (
                <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                  <div className="text-sm font-bold text-red-400 mb-1">目標價 (T1)</div>
                  <div className="text-lg font-mono font-bold text-red-600">{target1.toFixed(2)}</div>
                  {target2 && <div className="text-xs text-red-400 mt-1">T2: {target2.toFixed(2)}</div>}
                  {target3 && <div className="text-xs text-red-400">T3: {target3.toFixed(2)}</div>}
                </div>
               ) : null}

               {stopLoss ? (
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                  <div className="text-sm font-bold text-emerald-500 mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> 停損價
                  </div>
                  <div className="text-lg font-mono font-bold text-emerald-600">{stopLoss.toFixed(2)}</div>
                </div>
               ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Reason full width */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
         <h2 className="text-lg font-bold text-slate-800 mb-4">判定理由</h2>
         <p className="text-slate-600 leading-relaxed max-w-none">
           {reason}
         </p>
         <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-500">
           {stock.rsi !== undefined && <span>RSI: {Number(stock.rsi).toFixed(1)}</span>}
           {stock.vol_ratio !== undefined && <span>量比: {Number(stock.vol_ratio).toFixed(2)}</span>}
           {stock.hold_days && <span>建議持有: {stock.hold_days}</span>}
         </div>
      </div>
    </div>
  );
}
