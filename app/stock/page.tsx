'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAllScores } from '@/lib/useScanData';
import { getStockName, getStockSector } from '@/lib/scanTypes';
import { Search, ChevronRight } from 'lucide-react';
import Link from 'next/link';

function StockSearchInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryCode = searchParams?.get('code');
  const [search, setSearch] = useState('');
  
  const { stocks, isLoading } = useAllScores();

  // If there's a code in the URL query param, we could redirect or just show it, 
  // but a redirect is better so it goes to the static route.
  if (queryCode && typeof window !== 'undefined') {
    router.replace(`/stock/${queryCode}`);
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600" />
      </div>
    );
  }

  const filteredStocks = search.trim() 
    ? stocks.filter((s: any) => 
        (s.stock_id && s.stock_id.includes(search)) || 
        (getStockName(s) && getStockName(s).includes(search))
      )
    : [];

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <h1 className="text-2xl font-bold text-slate-800 mb-6">搜尋個股分析</h1>
        
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-xl leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-lg transition-colors"
            placeholder="輸入股票代號或名稱 (例: 2330)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {search.trim() && (
          <div className="mt-6">
            {isLoading ? (
               <div className="text-center py-4 text-slate-500">載入中...</div>
            ) : filteredStocks.length > 0 ? (
              <div className="space-y-2">
                {filteredStocks.slice(0, 10).map((s: any) => (
                  <Link 
                    key={s.stock_id} 
                    href={`/stock/${s.stock_id}`}
                    className="flex items-center justify-between p-4 rounded-xl border border-slate-100 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                  >
                    <div>
                      <div className="font-bold text-slate-800 flex items-center gap-2">
                        {getStockName(s)} 
                        <span className="text-sm font-mono text-slate-500">{s.stock_id}</span>
                      </div>
                      <div className="text-sm text-slate-500 mt-1">{getStockSector(s)}</div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  </Link>
                ))}
                {filteredStocks.length > 10 && (
                  <div className="text-center text-sm text-slate-500 mt-4">
                    還有 {filteredStocks.length - 10} 筆相符資料，請提供更精確的搜尋詞
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                找不到符合「{search}」的個股資料
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StockSearchPage() {
  return (
    <Suspense fallback={<div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600" /></div>}>
      <StockSearchInner />
    </Suspense>
  );
}
