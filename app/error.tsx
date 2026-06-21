'use client';
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className='flex items-center justify-center min-h-screen bg-white'>
      <div className='text-center p-8 bg-slate-50 rounded-xl shadow-sm border border-slate-100 max-w-md'>
        <h2 className='text-xl font-bold text-slate-800 mb-4'>發生錯誤 - 請重新整理頁面</h2>
        <p className='text-slate-600 mb-6 text-sm'>{error.message || '無法載入頁面資料'}</p>
        <button
          onClick={() => reset()}
          className='px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium'
        >
          重新嘗試
        </button>
      </div>
    </div>
  );
}
