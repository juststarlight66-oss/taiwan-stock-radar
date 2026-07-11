'use client';

import { TrendingUp, ScanLine, Share2, ArrowUp, ArrowDown } from 'lucide-react';
import { useState, useEffect } from 'react';
import TopNav from '@/components/TopNav';

const BASE = '/taiwan-stock-radar';
const DATA_URL = `${BASE}/data/main_uptrend_result.json`;

interface UptrendStock {
  stock_id: string;
  name: string;
  close: number;
  change_pct: number;
  volume_zhang: number;
  vol_ratio: number;
  capital_yi: number;
  total_score: number;
  above_ma5: boolean;
  above_ma10: boolean;
  above_ma20: boolean;
  is_red: boolean;
  fresh_start: boolean;
  chg_5d: number;
  chg_30d: number;
  ma5: number;
  ma10: number;
  ma20: number;
  signal_3: boolean;
  signal_1: boolean;
}

interface UptrendResult {
  scan_date: string;
  scanned_count: number;
  scored_count: number;
  top40: UptrendStock[];
  generated_at: string;
}

export default function MainUptrendPage() {
  const [data, setData] = useState<UptrendResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(DATA_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: UptrendResult) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const top10 = data?.top40?.slice(0, 10) ?? [];

  function fmtPct(v: number) {
    return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
  }

  function fmtNum(v: number, decimals = 1) {
    return v.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function formatDate(dateStr: string) {
    if (!dateStr || dateStr.length !== 10) return dateStr;
    const [y, m, d] = dateStr.split('-');
    return `${y}/${m}/${d}`;
  }

  return (
    <div className="min-h-dvh bg-gray-50 text-gray-900 font-sans flex flex-col">
      <TopNav />

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-5">
        <div className="space-y-5 fade-in">
          {/* Page header */}
          <div className="flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            <div>
              <h1 className="text-lg font-bold text-gray-900">主升段起漲掃描 Top 10</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                基於 Condition 三（第一波攻擊）+ Condition 一（主升段強勢）五維評分篩選
              </p>
            </div>
            {data && (
              <span className="ml-auto text-xs text-gray-400">
                掃描日期：{formatDate(data.scan_date)} | 共掃描 {data.scanned_count} 檔，評分 {data.scored_count} 檔
              </span>
            )}
          </div>

          {/* Loading / Error states */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
              <span className="ml-3 text-sm text-gray-500">載入主升段掃描結果中...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
              <p className="text-red-600 text-sm">無法載入掃描資料：{error}</p>
              <p className="text-red-400 text-xs mt-1">請確認 main_uptrend_result.json 已正確部署</p>
            </div>
          )}

          {/* Data table */}
          {data && top10.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-10">排名</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">代碼</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">名稱</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">收盤</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">漲跌幅</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">成交量(張)</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">量比</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">股本(億)</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">總分</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">第一波攻擊</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">主升段強勢</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">MA 排列</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {top10.map((stock, idx) => (
                      <tr
                        key={stock.stock_id}
                        className={`hover:bg-gray-50 transition-colors ${
                          idx < 3 ? 'bg-amber-50/30' : ''
                        }`}
                      >
                        {/* Rank */}
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                              idx === 0
                                ? 'bg-yellow-400 text-yellow-900'
                                : idx === 1
                                ? 'bg-gray-300 text-gray-700'
                                : idx === 2
                                ? 'bg-amber-200 text-amber-800'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {idx + 1}
                          </span>
                        </td>
                        {/* Stock ID */}
                        <td className="px-3 py-3 font-mono text-xs text-gray-600">{stock.stock_id}</td>
                        {/* Name */}
                        <td className="px-3 py-3 font-semibold text-gray-900">{stock.name}</td>
                        {/* Close */}
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-gray-900">
                          {fmtNum(stock.close, 1)}
                        </td>
                        {/* Change % */}
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          <span
                            className={`inline-flex items-center gap-0.5 ${
                              stock.change_pct >= 0 ? 'text-red-600' : 'text-green-600'
                            }`}
                          >
                            {stock.change_pct >= 0 ? (
                              <ArrowUp className="w-3 h-3" />
                            ) : (
                              <ArrowDown className="w-3 h-3" />
                            )}
                            {fmtPct(stock.change_pct)}
                          </span>
                        </td>
                        {/* Volume (volume_zhang) */}
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-gray-700">
                          {fmtNum(stock.volume_zhang, 0)}
                        </td>
                        {/* Vol Ratio */}
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          <span
                            className={
                              stock.vol_ratio >= 2
                                ? 'text-red-600 font-semibold'
                                : 'text-gray-600'
                            }
                          >
                            {stock.vol_ratio.toFixed(2)}x
                          </span>
                        </td>
                        {/* Capital YI */}
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-gray-600">
                          {fmtNum(stock.capital_yi, 1)}
                        </td>
                        {/* Total Score */}
                        <td className="px-3 py-3 text-right">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                              stock.total_score >= 85
                                ? 'bg-emerald-100 text-emerald-700'
                                : stock.total_score >= 75
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {stock.total_score}
                          </span>
                        </td>
                        {/* Signal 3 (第一波攻擊) */}
                        <td className="px-3 py-3 text-center">
                          {stock.signal_3 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                              Condition 三
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        {/* Signal 1 (主升段強勢) */}
                        <td className="px-3 py-3 text-center">
                          {stock.signal_1 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700">
                              Condition 一
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        {/* MA Alignment */}
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                stock.above_ma5 ? 'bg-emerald-500' : 'bg-gray-300'
                              }`}
                              title={`MA5: ${stock.ma5}`}
                            />
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                stock.above_ma10 ? 'bg-emerald-500' : 'bg-gray-300'
                              }`}
                              title={`MA10: ${stock.ma10}`}
                            />
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                stock.above_ma20 ? 'bg-emerald-500' : 'bg-gray-300'
                              }`}
                              title={`MA20: ${stock.ma20}`}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Table footer - summary */}
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
                <span>
                  顯示前 10 名 / 共 {data.scored_count} 檔評分標的
                </span>
                <span>
                  總分 = Condition 三 (第一波攻擊) + Condition 一 (主升段強勢) 五維權重評分
                </span>
              </div>
            </div>
          )}

          {data && top10.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-400">目前無符合條件標的</p>
            </div>
          )}

          {/* Scoring methodology card */}
          {data && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-3">評分方法說明</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-gray-600">
                <div className="space-y-1.5">
                  <p><span className="font-semibold text-red-600">Condition 三 (第一波攻擊)：</span>股價站上 MA5/MA10/MA20 三線、成交量放大（量比&gt;1.5）、近期出現底部轉強訊號</p>
                  <p><span className="font-semibold text-sky-600">Condition 一 (主升段強勢)：</span>趨勢確立、均線多頭排列、股價沿 MA5 攻擊、籌碼集中</p>
                </div>
                <div className="space-y-1.5">
                  <p><span className="font-semibold">篩選條件：</span>股本 &lt; 30億、股價 &gt; 5元、5日均量 &gt; 500張</p>
                  <p><span className="font-semibold">五維權重：</span>技術面 35%、籌碼面 25%、基本面 10%、消息面 10%、情緒面 10%、獲利空間 10%</p>
                  <p><span className="font-semibold">更新時間：</span>{data.generated_at || 'N/A'}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white py-6 mt-4">
        <div className="max-w-screen-xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ScanLine className="w-4 h-4 text-sky-400" />
              <span className="text-sm font-semibold text-gray-700">台股雷達</span>
              <span className="text-[10px] text-gray-400">Taiwan Stock Radar v3.1</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-gray-500">
              <span>資料來源：TWSE OpenAPI</span>
              <span className="hidden sm:inline text-gray-300">|</span>
              <span>每日 19:00 自動更新（交易日）</span>
              <span className="hidden sm:inline text-gray-300">|</span>
              <a
                href="https://github.com/juststarlight66-oss/taiwan-stock-radar"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
              >
                <Share2 className="w-3 h-3" />GitHub
              </a>
            </div>
          </div>
          <p className="text-center text-[10px] text-gray-400 mt-3">
            本系統資料僅供參考，不構成任何投資建議。投資有風險，請審慎評估個人財務狀況。過去績效不代表未來獲利保證。
          </p>
        </div>
      </footer>
    </div>
  );
}
