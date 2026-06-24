'use client';
import { useAllScores } from '@/lib/useScanData';
import { DIMENSION_CONFIG, getStockName, getStockSector, getStockClose, getStockChangePct, getStockRecommendation, getStockReason, getStockEntryLow, getStockEntryHigh, getStockStopLoss, getStockTarget1, getStockTarget2, getStockTarget3, getStockDimensions } from '@/lib/scanTypes';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { TrendingUp, AlertTriangle, Crosshair, HelpCircle, Activity } from 'lucide-react';
import React, { use } from 'react';

// For Next.js static export: provide empty paths to build purely client-side

function getActionStyle(rec: string | undefined) {
  if (!rec) return { label: '觀望 ⏳', text: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200', dot: 'bg-gray-400' };
  const r = rec.toLowerCase();
  if (r.includes('★★★') || r.includes('strong') || r.includes('強力') || r.includes('強烈'))
    return { label: '強力買進 🔥', text: 'text-red-600 font-bold', bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500' };
  if (r.includes('積極'))
    return { label: '積極買進 ⚡', text: 'text-orange-600 font-bold', bg: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-500' };
  if (r.includes('買進') || r.includes('buy'))
    return { label: '買進 ✅', text: 'text-emerald-600 font-bold', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' };
  if (r.includes('逢低'))
    return { label: '逢低佈局 📉', text: 'text-sky-600 font-bold', bg: 'bg-sky-50', border: 'border-sky-200', dot: 'bg-sky-500' };
  if (r.includes('觀望') || r.includes('wait') || r.includes('hold'))
    return { label: '觀望 ⏳', text: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200', dot: 'bg-gray-400' };
  return { label: '偏弱 ⚠️', text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' };
}

export default function StockDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const resolvedParams = use(params);
  const code = resolvedParams.code;
  
  // Note: Since we want the latest info by default and date isn't in path, checking the "latest" scan might be required,
  // but using generic latest/all_scores.json is simplest.
  const { data: scores, loading, error } = useAllScores('latest');

  if (loading) {
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
      </div>
    );
  }

  if (error || !scores) {
    return <div className="text-red-500 p-4 text-center">載入資料失敗</div>;
  }

  // Find the exact stock
  const stock = scores.find(s => String(s.stock_id) === code);
  
  if (!stock) {
    return (
      <div className="max-w-4xl mx-auto p-6 mt-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <HelpCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-700 mb-2">找不到個股資料</h2>
          <p className="text-slate-500">
            股票代號 <span className="font-mono bg-slate-100 px-2 py-1 rounded text-slate-700">{code}</span> 
            目前不在最新掃描清單的雷達範圍內，或近期無顯著趨勢訊號。
          </p>
          <a href="/taiwan-stock-radar" className="inline-block mt-6 px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-700 transition">
            返回首頁
          </a>
        </div>
      </div>
    );
  }

  const name = getStockName(stock);
  const sector = getStockSector(stock);
  const close = getStockClose(stock);
  const changePct = getStockChangePct(stock);
  const rec = getStockRecommendation(stock);
  const reason = getStockReason(stock);
  
  const entryLow = getStockEntryLow(stock);
  const entryHigh = getStockEntryHigh(stock);
  const stopLoss = getStockStopLoss(stock);
  const target1 = getStockTarget1(stock);
  const target2 = getStockTarget2(stock);
  const target3 = getStockTarget3(stock);
  
  const dims = getStockDimensions(stock);
  const style = getActionStyle(rec);

  const radarData = [
    { subject: '技術面 (Tech)', A: dims.technical, fullMark: DIMENSION_CONFIG.technical.max },
    { subject: '基本面 (Fund)', A: dims.fundamental, fullMark: DIMENSION_CONFIG.fundamental.max },
    { subject: '籌碼面 (Chips)', A: dims.chips, fullMark: DIMENSION_CONFIG.chips.max },
    { subject: '消息面 (News)', A: dims.news, fullMark: DIMENSION_CONFIG.news.max },
    { subject: '市場情緒 (Sent)', A: dims.sentiment, fullMark: DIMENSION_CONFIG.sentiment.max }
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 text-sm text-slate-500 mb-4">
          <a href="/taiwan-stock-radar" className="hover:text-slate-800">首頁</a>
          <span>/</span>
          <a href="/taiwan-stock-radar#all-results" className="hover:text-slate-800">所有信號</a>
          <span>/</span>
          <span className="text-slate-800 font-medium">{code} {name}</span>
        </div>
        
        <div className="flex justify-between items-end">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-4xl font-bold text-slate-900 tracking-tight">{code} {name}</h1>
              <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded text-sm font-medium border border-slate-200">
                {sector}
              </span>
            </div>
            <div className="flex items-baseline gap-3 mt-2">
              <span className="text-3xl font-bold text-slate-800">{close?.toFixed(2)}</span>
              {changePct !== undefined && (
                <span className={`text-lg font-medium flex items-center ${changePct >= 0 ? "text-red-500" : "text-green-500"}`}>
                  {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
          
          <div className="text-right">
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border ${style.bg} ${style.border}`}>
              <span className={`w-2 h-2 rounded-full ${style.dot} animate-pulse`}></span>
              <span className={`font-bold ${style.text}`}>{style.label}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col: Radar & Dimensions */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-500" />
              五維度雷達分析
            </h3>
            <div className="h-[250px] -mx-4">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Radar name={name} dataKey="A" stroke="#6366f1" fill="#818cf8" fillOpacity={0.5} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            
            <div className="space-y-3 mt-4">
              {radarData.map(d => (
                <div key={d.subject} className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">{d.subject}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-indigo-500 rounded-full" 
                        style={{ width: `${(d.A / d.fullMark) * 100}%` }}
                      ></div>
                    </div>
                    <span className="font-mono font-medium text-slate-800 w-12 text-right">
                      {d.A.toFixed(1)} <span className="text-slate-400 text-xs">/ {d.fullMark}</span>
                    </span>
                  </div>
                </div>
              ))}
              <div className="pt-3 mt-3 border-t border-slate-100 flex justify-between items-center">
                 <span className="font-bold text-slate-700">總分 (Total)</span>
                 <span className="font-mono font-bold text-indigo-600 text-lg">
                   {((stock as any).score || (dims.technical + dims.fundamental + dims.chips + dims.news + dims.sentiment)).toFixed(2)}
                 </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: AI Analysis & Strategy */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Crosshair className="w-5 h-5 text-emerald-500" />
                交易策略計畫 (Strategy)
              </h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 text-center">
                  <div className="text-xs text-slate-500 mb-1">建議進場區間</div>
                  <div className="text-lg font-bold text-slate-800">
                    {entryLow && entryHigh ? `${entryLow} - ${entryHigh}` : '等待訊號'}
                  </div>
                </div>
                <div className="bg-red-50 rounded-lg p-4 border border-red-100 text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-red-400"></div>
                  <div className="text-xs text-red-600/70 mb-1 font-medium">嚴格停損退出</div>
                  <div className="text-lg font-bold text-red-700">
                    {stopLoss || 'N/A'}
                  </div>
                </div>
                <div className="md:col-span-2 bg-emerald-50 rounded-lg p-4 border border-emerald-100 relative">
                  <div className="absolute top-0 left-0 w-1 h-full bg-emerald-400 rounded-l-lg"></div>
                  <div className="text-xs text-emerald-600/70 mb-2 font-medium">階段目標價 (T1 / T2 / T3)</div>
                  <div className="flex justify-between items-center text-emerald-800">
                    <div className="flex flex-col items-center">
                      <span className="text-sm font-medium opacity-75">T1 保本</span>
                      <span className="text-lg font-bold">{target1 || '-'}</span>
                    </div>
                    <div className="w-8 h-[1px] bg-emerald-200"></div>
                    <div className="flex flex-col items-center">
                      <span className="text-sm font-medium opacity-75">T2 獲利</span>
                      <span className="text-lg font-bold">{target2 || '-'}</span>
                    </div>
                    <div className="w-8 h-[1px] bg-emerald-200"></div>
                    <div className="flex flex-col items-center">
                      <span className="text-sm font-medium opacity-75">T3 延伸</span>
                      <span className="text-lg font-bold">{target3 || '-'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* R/R Ratio Visualizer if data available */}
              {close && stopLoss && target1 && (
                <div className="mb-6 px-2">
                  <div className="flex justify-between text-xs text-slate-500 mb-2">
                    <span>停損 {stopLoss}</span>
                    <span>現價 {close}</span>
                    <span>初標 {target1}</span>
                  </div>
                  <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden flex">
                    <div className="bg-red-400 h-full" style={{ width: `${((close - stopLoss) / (target1 - stopLoss)) * 100}%` }}></div>
                    <div className="bg-emerald-400 h-full flex-grow"></div>
                  </div>
                  <div className="mt-2 text-xs text-slate-400 text-center">
                    風報比預估: 1 : {((target1 - close) / (close - stopLoss)).toFixed(2)}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
             <div className="border-b border-slate-100 px-6 py-4 bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-500" />
                AI 邏輯與近期催化劑 (AI Reasoning)
              </h3>
            </div>
            <div className="p-6">
              <div className="prose prose-slate max-w-none">
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {reason || "系統尚未產生此股票的詳細解析與催化劑說明。可參考上方雷達圖分數判斷強弱項。"}
                </p>
              </div>
              
              <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-100 flex gap-3 text-sm">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                <div className="text-amber-800 leading-relaxed">
                  <strong>免責聲明：</strong> 本評分與目標價由 AI 模型依據歷史統計與量價結構演算生成，為盤後數據分析結果，<span className="underline decoration-amber-300 decoration-2">並非投顧建議</span>。進出場請務必嚴守停損紀律，不建議投入影響生活之資金。
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
