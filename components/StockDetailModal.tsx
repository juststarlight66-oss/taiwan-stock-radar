'use client';
import { ScanStock, StockNarrative, DIMENSION_CONFIG } from '@/lib/scanTypes';
import { X, Target, Shield, TrendingUp, TrendingDown, ExternalLink, Share2, Check } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useOnDemandScan } from '@/lib/useScanData';

interface Props {
  stock: ScanStock;
  onClose: () => void;
  rank?: number;
  isDemo?: boolean;
}

// ── 推薦格式輔助（支援所有 Python 輸出格式）──
function getActionStyle(rec: string | undefined) {
  if (!rec) return { bg: 'bg-gray-800', border: 'border-gray-700', text: 'text-gray-400', label: '觀望' };
  const r = rec.toLowerCase();
  if (r.includes('★★★') || r.includes('strong') || r.includes('強力')) {
    return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', label: '強力買進' };
  }
  if (r.includes('積極')) {
    return { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', label: '積極買進' };
  }
  if (r.includes('買進') || r.includes('buy')) {
    return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', label: '買進' };
  }
  if (r.includes('逢低')) {
    return { bg: 'bg-sky-500/10', border: 'border-sky-500/30', text: 'text-sky-400', label: '逢低佈局' };
  }
  if (r.includes('觀望') || r.includes('wait') || r.includes('hold')) {
    return { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', label: '觀望' };
  }
  return { bg: 'bg-gray-800', border: 'border-gray-700', text: 'text-gray-400', label: '偏弱' };
}

const DIM_LABELS: Record<string, string> = {
  technical: '技術面', fundamental: '基本面', news: '消息面', sentiment: '市場情緒', chips: '籌碼面',
};
const DIM_COLORS: Record<string, string> = {
  technical: '#38bdf8', fundamental: '#34d399', news: '#fbbf24', sentiment: '#a78bfa', chips: '#f87171',
};

// ── AI 白話文分析面板 ────────────────────────────────
const NARRATIVE_ROWS: { key: keyof StockNarrative; label: string; icon: string; color: string }[] = [
  { key: 'technical',   label: '技術面解讀', icon: '📈', color: 'text-sky-300' },
  { key: 'chips',       label: '籌碼面解讀', icon: '🏦', color: 'text-violet-300' },
  { key: 'fundamental', label: '基本面評價', icon: '📊', color: 'text-emerald-300' },
  { key: 'risk',        label: '風險提示',   icon: '⚠️', color: 'text-amber-300' },
  { key: 'action',      label: '操作建議',   icon: '🎯', color: 'text-red-300' },
];

function generateNarrative(stock: ScanStock): StockNarrative {
  const t = stock.dimensions?.technical ?? 0;
  const c = stock.dimensions?.chips ?? 0;
  const f = stock.dimensions?.fundamental ?? 0;
  const strategy = stock.strategy ?? {};
  const { stop_loss, downside, upside, upside2, upside3, recommendation } = strategy;
  const entry = strategy.entry;
  const entryLow = strategy.entry_low;
  const entryHigh = strategy.entry_high;
  const rr = ((upside ?? 0) / Math.max(downside ?? 1, 1)).toFixed(1);

  // 進場價範圍顯示
  const entryStr = (entryLow && entryHigh)
    ? `${entryLow.toFixed(2)}～${entryHigh.toFixed(2)}`
    : entry
      ? entry.toFixed(2)
      : '—';
  const slStr = stop_loss?.toFixed(2) ?? '—';
  const dsStr = downside ?? '?';

  // 推薦操作說明（支援所有格式）
  const recLabel = getActionStyle(recommendation).label;

  return {
    technical: t >= 30
      ? `技術面評分 ${t.toFixed(0)}/40，多頭趨勢明確，站穩短中期均線之上，動能強勁`
      : t >= 20
        ? `技術面評分 ${t.toFixed(0)}/40，短線偏多但上方壓力待消化，注意量能變化`
        : `技術面評分 ${t.toFixed(0)}/40，走勢偏弱，建議等待止跌訊號再進場`,
    chips: c >= 7
      ? `籌碼面評分 ${c.toFixed(0)}/10，法人持續買超，籌碼集中度佳，支撐力道足`
      : c >= 4
        ? `籌碼面評分 ${c.toFixed(0)}/10，法人動向分歧，籌碼尚屬中性`
        : `籌碼面評分 ${c.toFixed(0)}/10，籌碼鬆動，法人減碼明顯，短線壓力大`,
    fundamental: f >= 30
      ? `基本面評分 ${f.toFixed(0)}/40，營收獲利穩健成長，本益比處合理區間`
      : f >= 15
        ? `基本面評分 ${f.toFixed(0)}/40，體質尚可惧成長動能趨緩，中線持有需觀察`
        : `基本面評分 ${f.toFixed(0)}/40，營收獲利偏弱，建議短線操作為主`,
    risk: stop_loss
      ? `建護停損設於 ${slStr}（約 -${dsStr}%），務必控制單筆風險在總資金 2% 以內。`
        + (upside2 ? ` 若突破第一關可上移停損至成本價保護。` : '')
      : `尚無明確停損價位，若進場請自行設定技術面支撐（如月線或前低）作為防守。`,
    action: (recommendation && (entry || entryLow))
      ? `綜合評分 ${stock.total_score.toFixed(1)}，建護「${recLabel}」。進場 ${entryStr}，目標 +${upside ?? '?'}%`
        + (upside2 ? `/ +${upside2}%` : '') + (upside3 ? `/ +${upside3}%` : '')
        + `，風報比 1:${rr}，適合${downside && downside < 5 ? '短線積極' : '波段持有'}操作。`
      : `綜合評分 ${stock.total_score.toFixed(1)}，訊號尚不明確，建護觀望等待更佳進場點。`,
  };
}

function NarrativePanel({ stock }: { stock: ScanStock }) {
  const narrative = stock.narrative ?? generateNarrative(stock);
  return (
    <div className="rounded-xl bg-gray-800/40 border border-gray-700/50 p-4">
      <h3 className="text-[11px] font-semibold text-gray-500 mb-3 uppercase tracking-wide flex items-center gap-1.5">
        <span>🤖</span>AI 白話文分析
      </h3>
      <div className="space-y-2.5">
        {NARRATIVE_ROWS.map(({ key, label, icon, color }) => (
          <div key={key} className="text-[12px]">
            <span className={`font-semibold ${color}`}>{icon} {label}：</span>
            <span className="text-gray-300 ml-1">{narrative[key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 主元件 ───────────────────────────────────────
function TargetRow({ label, price, pct, color }: { label: string; price?: number; pct?: number; color: string }) {
  if (!price) return null;
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        {pct !== undefined && (
          <span className={`text-[10px] font-semibold ${color}`}>+{pct}%</span>
        )}
        <span className={`text-sm font-bold ${color}`}>{price.toFixed(2)}</span>
      </div>
    </div>
  );
}

export default function StockDetailModal({ stock, onClose, rank, isDemo }: Props) {
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'overview' | 'chart' | 'narrative'>('overview');
  const { scan, loading: scanLoading, data: scanData } = useOnDemandScan();

  const actionStyle = getActionStyle(stock.strategy?.recommendation);

  // 進場價範圍
  const entryLow = stock.strategy?.entry_low;
  const entryHigh = stock.strategy?.entry_high;
  const entryMid = stock.strategy?.entry;
  const entryDisplay = (entryLow && entryHigh)
    ? `${entryLow.toFixed(2)}～${entryHigh.toFixed(2)}`
    : entryMid
      ? entryMid.toFixed(2)
      : '—';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(stock.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [stock.code]);

  const dims = stock.dimensions ?? {};
  const dimEntries = Object.entries(DIMENSION_CONFIG);
  const strategy = stock.strategy ?? {};

  // 价格圖資料
  const chartData = (() => {
    if (!entryMid && !entryLow) return [];
    const base = entryMid ?? ((entryLow! + (entryHigh ?? entryLow!)) / 2);
    const t1 = strategy.target1 ?? base * 1.05;
    const t2 = strategy.target2 ?? base * 1.10;
    const t3 = strategy.target3 ?? base * 1.15;
    const sl = strategy.stop_loss ?? base * 0.95;
    return [
      { name: '停損', price: sl, ref: true },
      { name: '進場', price: base, ref: false },
      { name: 'T1', price: t1, ref: false },
      { name: 'T2', price: t2, ref: false },
      { name: 'T3', price: t3, ref: false },
    ];
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto relative">
        {/* 標題列 */}
        <div className={`sticky top-0 z-10 rounded-t-2xl border-b ${actionStyle.border} ${actionStyle.bg} px-5 py-4`}>
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {rank && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200/80 dark:bg-gray-700/80 text-gray-500 font-mono">#{rank}</span>
                )}
                <span className="text-base font-bold text-gray-900 dark:text-white truncate">{stock.name}</span>
                <span className="text-[11px] text-gray-400 font-mono">{stock.code}</span>
                {isDemo && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">DEMO</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${actionStyle.border} ${actionStyle.bg} ${actionStyle.text}`}>
                  {actionStyle.label}
                </span>
                {stock.sector && (
                  <span className="text-[10px] text-gray-400">{stock.sector}</span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ml-2">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* 分頁標簽 */}
          <div className="flex gap-1 mt-3">
            {(['overview', 'chart', 'narrative'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-[11px] px-3 py-1 rounded-full transition-colors ${
                  tab === t
                    ? 'bg-sky-500/20 text-sky-400 font-semibold border border-sky-500/30'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t === 'overview' ? '概覽' : t === 'chart' ? '價格圖' : 'AI 白話文'}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* 概覽頁籤 */}
          {tab === 'overview' && (
            <>
              {/* 進場 / 停損 / 三關價 */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/40 p-4 space-y-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">入場策略</h3>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">進場區間</span>
                  <span className="text-sm font-bold text-sky-400">{entryDisplay}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">停損價</span>
                  <div className="flex items-center gap-2">
                    {strategy.downside !== undefined && (
                      <span className="text-[10px] font-semibold text-red-400">-{strategy.downside}%</span>
                    )}
                    <span className="text-sm font-bold text-red-400">
                      {strategy.stop_loss?.toFixed(2) ?? '—'}
                    </span>
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700/40 pt-3 space-y-1.5">
                  <TargetRow label="第一關" price={strategy.target1} pct={strategy.upside} color="text-emerald-400" />
                  <TargetRow label="第二關" price={strategy.target2} pct={strategy.upside2} color="text-emerald-500" />
                  <TargetRow label="第三關" price={strategy.target3} pct={strategy.upside3} color="text-emerald-600" />
                </div>
              </div>

              {/* 五維評分 */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/40 p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">五維評分</h3>
                <div className="space-y-2">
                  {dimEntries.map(([key, cfg]) => {
                    const score = dims[key as keyof typeof dims] as number ?? 0;
                    const pct = Math.min((score / cfg.max) * 100, 100);
                    const color = DIM_COLORS[key] ?? '#6b7280';
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-500 w-14 shrink-0">{DIM_LABELS[key] ?? key}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                        <span className="text-[11px] font-mono font-bold text-gray-600 dark:text-gray-300 w-12 text-right">
                          {score.toFixed(1)}/{cfg.max}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700/40 flex justify-between items-center">
                  <span className="text-[11px] text-gray-500">綜合評分</span>
                  <span className="text-base font-bold text-gray-900 dark:text-white">{stock.total_score.toFixed(1)}</span>
                </div>
              </div>
            </>
          )}

          {/* 價格圖頁籤 */}
          {tab === 'chart' && (
            <div className="rounded-xl border border-gray-700/50 bg-gray-800/40 p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">目標價位指引</h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => v.toFixed(2)} />
                    <ReferenceLine y={strategy.stop_loss} stroke="#ef4444" strokeDasharray="4 2" />
                    <Line type="monotone" dataKey="price" stroke="#38bdf8" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-sm text-gray-500 py-8">無法取得價格資料</p>
              )}
            </div>
          )}

          {/* AI 白話文頁籤 */}
          {tab === 'narrative' && <NarrativePanel stock={stock} />}

          {/* 底部按鈕 */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
              {copied ? '已複製' : '複製代號'}
            </button>
            <a
              href={`https://tw.stock.yahoo.com/quote/${stock.code}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-sky-500/30 bg-sky-500/5 text-xs text-sky-400 hover:bg-sky-500/10 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Yahoo 行情
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
