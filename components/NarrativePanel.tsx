'use client';

import { ScanStock, StockNarrative } from '@/lib/scanTypes';
import { Brain, TrendingUp, BarChart3, ShieldAlert, Zap } from 'lucide-react';

interface Props {
  stock: ScanStock;
}

// ── 推薦格式輔助函數（支援所有 Python 輸出格式）──
// "★★★ Strong Recommend" / "強力買進" / "積極買進 ⚡ 中型部位" / "買進" / "觀望" / "偏弱"
function isStrongBuy(rec: string): boolean {
  const r = rec.toLowerCase();
  return r.includes('★★★') || r.includes('strong') || r.includes('強力');
}
function isAggressive(rec: string): boolean {
  return rec.includes('積極');
}
function isBuy(rec: string): boolean {
  const r = rec.toLowerCase();
  return (r.includes('買進') || r.includes('buy') || r.includes('逢低')) && !isStrongBuy(rec) && !isAggressive(rec);
}
function isWatch(rec: string): boolean {
  const r = rec.toLowerCase();
  return r.includes('觀望') || r.includes('wait') || r.includes('hold');
}

/** 從五維分數 + 策略 + 技術指標自動生成白話文解析 */
function generateNarrative(stock: ScanStock): StockNarrative {
  const dims = stock.dimensions;
  const tech = dims?.technical ?? 0;
  const fund = dims?.fundamental ?? 0;
  const news = dims?.news ?? 0;
  const sent = dims?.sentiment ?? 0;
  const chips = dims?.chips ?? 0;
  const rsi = stock.details?.rsi;
  const volRatio = stock.details?.vol_ratio;
  const rec = stock.strategy?.recommendation ?? '觀望';
  const upside = stock.strategy?.upside ?? 0;
  const downside = stock.strategy?.downside ?? 0;

  // 進場價範圍
  const entryLow = stock.strategy?.entry_low;
  const entryHigh = stock.strategy?.entry_high;
  const entryMid = stock.strategy?.entry;
  const entryStr = (entryLow && entryHigh)
    ? `${entryLow.toFixed(2)}～${entryHigh.toFixed(2)}`
    : entryMid
      ? entryMid.toFixed(2)
      : '開盤價';
  const stopStr = stock.strategy?.stop_loss?.toFixed(2) ?? '支撐位';

  // ── 技術面 ──
  let techText = '';
  if (tech >= 35) {
    techText = '技術面極強，多頭排列完整，均線多頭發散';
  } else if (tech >= 30) {
    techText = '技術面偏多，短期動能強勁，均線結構健康';
  } else if (tech >= 25) {
    techText = '技術面中性偏多，均線糾結待突破，短線具反彈機會';
  } else if (tech >= 18) {
    techText = '技術面偏弱，均線壓力沉重，短線震盪整理中';
  } else {
    techText = '技術面弱勢，空頭排列明顯，反彈即壓力';
  }
  if (rsi !== undefined) {
    if (rsi >= 70) techText += '，RSI 進入超買區注意回檔風險';
    else if (rsi <= 30) techText += '，RSI 超賣區有技術反彈機會';
  }

  // ── 籌碼面 ──
  let chipsText = '';
  if (chips >= 8) {
    chipsText = '籌碼集中度高，法人持續買超，大戶持股穩定';
  } else if (chips >= 6) {
    chipsText = '籌碼偏集中，法人小幅買超，主力尚在布局';
  } else if (chips >= 4) {
    chipsText = '籌碼中性，法人買賣互見，尚無明顯方向';
  } else if (chips >= 2) {
    chipsText = '籌碼偏分散，法人站在賣方，需留意籌碼鬆動';
  } else {
    chipsText = '籌碼弱勢，法人明顯出脫，散戶持股偏高';
  }
  if (volRatio !== undefined && volRatio >= 1.5) {
    chipsText += `，量能放大 ${volRatio.toFixed(1)}x 顯示換手積極`;
  }

  // ── 基本面 ──
  let fundText = '';
  if (fund >= 35) {
    fundText = '基本面優異，營收獲利雙成長，評價偏低具安全邊際';
  } else if (fund >= 28) {
    fundText = '基本面良好，獲利穩定，營收溫和成長';
  } else if (fund >= 20) {
    fundText = '基本面持平，營運尚穩但成長動能不足，需關注後續營收';
  } else if (fund >= 12) {
    fundText = '基本面偏弱，營收或獲利出現下滑，評價偏高';
  } else {
    fundText = '基本面疲弱，營運壓力大，財報數字不佳';
  }

  // ── 風險 ──
  const risks: string[] = [];
  if (upside < downside * 1.5) risks.push('風報比偏低，上漲空間有限');
  if (rsi && rsi >= 75) risks.push('RSI 過熱，短線回檔壓力大');
  if (volRatio && volRatio >= 3) risks.push('爆量後可能出現量縮拉回');
  if (tech < 20 && fund < 20) risks.push('技術面與基本面雙弱，趨勢尚未落底');
  if (news < 3 && sent < 3) risks.push('市場關注度低，缺乏催化劑');
  if (chips < 3) risks.push('籌碼鬆散，法人持續減碼');
  if (risks.length === 0) risks.push('短線波動風險可控，但仍需設好停損');
  const riskText = risks.slice(0, 3).join('；') + '。';

  // ── 操作建議（支援所有 Python 格式）──
  let actionText = '';
  if (isStrongBuy(rec)) {
    actionText = `強勢突破訊號明確，建議於 ${entryStr} 附近進場，停損嚴守 ${stopStr}（約 -${downside}%），目標上看 +${upside}%，持股 3-5 天短打為主。`;
  } else if (isAggressive(rec)) {
    actionText = `積極買進訊號，建議於 ${entryStr} 分批布局，停損設 ${stopStr}，目標 +${upside}%，持股 3-7 天。`;
  } else if (isBuy(rec)) {
    actionText = `趨勢偏多且籌碼穩定，可於 ${entryStr} 附近分批布局，停損設 ${stopStr}，目標 +${upside}%，持股 5-7 天。`;
  } else if (isWatch(rec)) {
    actionText = '多空訊號混雜，建議觀望等待方向明確，若已持有則嚴守停損。';
  } else {
    actionText = '技術面偏弱，暫時避開，等待止跌訊號出現再考慮進場。';
  }

  return { technical: techText, chips: chipsText, fundamental: fundText, risk: riskText, action: actionText };
}

export default function NarrativePanel({ stock }: Props) {
  const narrative = stock.narrative ?? generateNarrative(stock);

  const sections = [
    { icon: TrendingUp, label: '技術面', text: narrative.technical, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
    { icon: BarChart3, label: '籌碼面', text: narrative.chips, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
    { icon: Brain, label: '基本面', text: narrative.fundamental, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    { icon: ShieldAlert, label: '風險提示', text: narrative.risk, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    { icon: Zap, label: '操作建議', text: narrative.action, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  ];

  return (
    <div className="space-y-3">
      {sections.map(({ icon: Icon, label, text, color, bg, border }) => (
        <div key={label} className={`rounded-xl border ${border} ${bg} p-3`}>
          <div className="flex items-center gap-2 mb-1.5">
            <Icon className={`w-3.5 h-3.5 ${color}`} />
            <span className={`text-xs font-semibold ${color}`}>{label}</span>
          </div>
          <p className="text-xs text-gray-300 leading-relaxed">{text}</p>
        </div>
      ))}
    </div>
  );
}
