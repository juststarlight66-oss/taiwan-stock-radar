'use client';
import { useEffect } from 'react';
import { AlertTriangle, X, Shield } from 'lucide-react';

export default function DisclaimerModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6 fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <h2 className="font-bold text-white">免責聲明</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-3 text-sm text-gray-300">
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/8 border border-amber-500/20">
            <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-amber-200 text-xs leading-relaxed">
              本系統所有資訊<strong>僅供研究參考</strong>，不構成任何投資建議或買賣依據。
            </p>
          </div>
          <ul className="space-y-2 text-xs text-gray-400 leading-relaxed">
            <li className="flex items-start gap-2"><span className="text-gray-600 shrink-0">•</span>AI 評分模型基於歷史數據與統計規律，無法預測未來走勢</li>
            <li className="flex items-start gap-2"><span className="text-gray-600 shrink-0">•</span>過去績效不代表未來獲利，所有投資均有本金虧損風險</li>
            <li className="flex items-start gap-2"><span className="text-gray-600 shrink-0">•</span>請依據個人風險承受能力與財務狀況獨立判斷</li>
            <li className="flex items-start gap-2"><span className="text-gray-600 shrink-0">•</span>資料來源為 TWSE OpenAPI，本系統不保證資料即時性與完整性</li>
            <li className="flex items-start gap-2"><span className="text-gray-600 shrink-0">•</span>投資前請詳閱公開說明書，必要時諮詢專業投資顧問</li>
          </ul>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-5 py-2.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 text-sm font-medium hover:bg-sky-500/25 transition-colors"
        >
          我已了解，進入系統
        </button>
      </div>
    </div>
  );
}
