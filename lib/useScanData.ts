'use client';
import useSWR from 'swr';
import { useState, useEffect } from 'react';
import { ScanResult, ScanStock, ScanDimensions, ScanSignals } from './scanTypes';

export interface AllScoreHistoryEntry {
  date: string;
  stocks: Array<{ stock_id: string; total_score: number }>;
}

export interface AllScoresData {
  scan_date: string;
  scanned_count: number;
  /** v2: key renamed from 'stocks' to 'all_stock_scores' */
  history?: AllScoreHistoryEntry[];
  all_stock_scores: ScanStock[];
}

// basePath is /taiwan-stock-radar — fetches must use absolute paths from that base
const BASE = '/taiwan-stock-radar';

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

/** Fetch the latest scan result */
export function useLatestScan() {
  const { data, error, isLoading } = useSWR<ScanResult>(
    `${BASE}/data/latest.json`,
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );
  return { data, error, isLoading };
}

/** Fetch a specific date's scan result */
export function useDateScan(date: string | null) {
  const key = date ? `${BASE}/data/scan_result_${date.replace(/-/g, '')}.json` : null;
  const { data, error, isLoading } = useSWR<ScanResult>(key, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
  });
  return { data, error, isLoading };
}

/** Fetch the index of available historical scan dates */
export function useHistoryIndex() {
  const { data, error, isLoading } = useSWR<{ dates: string[] }>(
    `${BASE}/data/index.json`,
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );
  return { dates: data?.dates ?? [], error, isLoading };
}

/** Fetch all_scores.json — every scanned stock's 5-dimension breakdown for the self-check tab */
export function useAllScores() {
  const { data, error, isLoading } = useSWR<AllScoresData>(
    `${BASE}/data/all_scores.json`,
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );
  return { data, error, isLoading };
}

// ─────────────────────────────────────────────────────────────────
// On-demand TWSE lookup + 5-dimension scoring (client-side only)
// Used by SelfCheck when a stock is not in the daily all_scores.json
// ─────────────────────────────────────────────────────────────────

/** TWSE STOCK_DAY_ALL row shape */
interface TwseDayRow {
  Date: string;        // ROC date e.g. "1150428"
  Code: string;
  Name: string;
  TradeVolume: string;
  TradeValue: string;
  OpeningPrice: string;
  HighestPrice: string;
  LowestPrice: string;
  ClosingPrice: string;
  Change: string;
  Transaction: string;
}

/** TWSE BWIBBU_ALL row shape */
interface TwseBwibbuRow {
  Date: string;
  Code: string;
  Name: string;
  PEratio: string;
  DividendYield: string;
  PBratio: string;
}

/** Normalised candle for internal scoring */
interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change_pct: number;
}

function parseFloat2(s: string): number {
  const n = parseFloat(s.replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

/** Fetch the last ~30 trading days of OHLCV for a stock from TWSE STOCK_DAY_ALL snapshots */
async function fetchTwseHistory(stockCode: string): Promise<Candle[]> {
  // Try to fetch today's STOCK_DAY_ALL first, then prior months
  const today = new Date();
  const dates: string[] = [];
  // Generate last 2 months of YYYYMMDD first-of-month strings (ROC API accepts any date in month)
  for (let m = 0; m <= 2; m++) {
    const d = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    dates.push(`${yyyy}${mm}01`);
  }

  const candles: Candle[] = [];

  for (const dateStr of dates) {
    try {
      const url = `https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY?date=${dateStr}&stockNo=${stockCode}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) continue;
      const rows: TwseDayRow[] = await resp.json();
      if (!Array.isArray(rows)) continue;

      for (const row of rows) {
        const close = parseFloat2(row.ClosingPrice);
        const open  = parseFloat2(row.OpeningPrice);
        const high  = parseFloat2(row.HighestPrice);
        const low   = parseFloat2(row.LowestPrice);
        const vol   = parseFloat2(row.TradeVolume);
        if (close <= 0) continue;

        // Compute change_pct from previous close approximation via Change field
        const changeAmt = parseFloat2(row.Change);
        const prevClose = close - changeAmt;
        const change_pct = prevClose > 0 ? (changeAmt / prevClose) * 100 : 0;

        candles.push({ date: row.Date, open, high, low, close, volume: vol, change_pct });
      }
    } catch {
      // silently skip failed months
    }
  }

  // Sort oldest→newest, keep last 60
  candles.sort((a, b) => a.date.localeCompare(b.date));
  return candles.slice(-60);
}

/** Fetch PE/PBR/DividendYield from TWSE BWIBBU_ALL */
async function fetchFundamentals(stockCode: string): Promise<{ pe: number | null; pb: number | null; dy: number | null }> {
  try {
    const resp = await fetch('https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL', {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return { pe: null, pb: null, dy: null };
    const rows: TwseBwibbuRow[] = await resp.json();
    const row = rows.find((r) => r.Code === stockCode);
    if (!row) return { pe: null, pb: null, dy: null };
    const pe = parseFloat2(row.PEratio);
    const pb = parseFloat2(row.PBratio);
    const dy = parseFloat2(row.DividendYield);
    return {
      pe: pe > 0 ? pe : null,
      pb: pb > 0 ? pb : null,
      dy: dy >= 0 ? dy : null,
    };
  } catch {
    return { pe: null, pb: null, dy: null };
  }
}

/** Fetch stock name from TWSE STOCK_DAY_ALL (today) */
async function fetchStockName(stockCode: string): Promise<string> {
  try {
    const resp = await fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return stockCode;
    const rows: TwseDayRow[] = await resp.json();
    const row = rows.find((r) => r.Code === stockCode);
    return row?.Name ?? stockCode;
  } catch {
    return stockCode;
  }
}

// ── Scoring helpers ──────────────────────────────────────────────

function computeRsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const deltas = closes.slice(1).map((c, i) => c - closes[i]);
  const gains  = deltas.map((d) => (d > 0 ? d : 0));
  const losses = deltas.map((d) => (d < 0 ? -d : 0));
  const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}

function scoreTechnical(hist: Candle[]): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;

  if (hist.length < 5) return { score: 12, signals: ['資料不足，給中性分'] };

  const closes  = hist.map((r) => r.close);
  const today   = hist[hist.length - 1];
  const n       = hist.length;

  // 1. MA arrangement (max 8)
  const ma5  = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const ma20 = n >= 20 ? closes.slice(-20).reduce((a, b) => a + b, 0) / 20 : ma5;
  const ma60 = n >= 60 ? closes.slice(-60).reduce((a, b) => a + b, 0) / 60 : ma20;
  let maScore = 0;
  if (today.close > ma5)  maScore += 2;
  if (today.close > ma20) maScore += 2;
  if (ma5 > ma20)  maScore += 2;
  if (ma20 > ma60) maScore += 2;
  score += maScore;
  if (maScore === 8) signals.push('MA5>MA20>MA60 完整多頭排列');
  else if (maScore >= 6) signals.push(`偏多排列 (MA得分${maScore}/8)`);
  else if (maScore >= 4) signals.push(`中性偏多 (MA得分${maScore}/8)`);
  else signals.push('空頭排列');

  // 2. Volume breakout (max 8)
  const avgVol20 = n >= 21
    ? hist.slice(-21, -1).reduce((a, b) => a + b.volume, 0) / 20
    : hist.slice(0, -1).reduce((a, b) => a + b.volume, 0) / Math.max(hist.length - 1, 1);
  const volRatio = avgVol20 > 0 ? today.volume / avgVol20 : 1;
  const vbScore  = volRatio >= 3 ? 8 : volRatio >= 2 ? 5 : volRatio >= 1.5 ? 3 : 0;
  score += vbScore;
  if (volRatio >= 3) signals.push(`爆量突破 (${volRatio.toFixed(1)}x)`);
  else if (volRatio >= 2) signals.push(`量增 (${volRatio.toFixed(1)}x)`);
  else if (volRatio >= 1.5) signals.push(`量溫增 (${volRatio.toFixed(1)}x)`);

  // 3. Near 60d high (max 8)
  const high60 = Math.max(...hist.slice(-Math.min(n, 60)).map((r) => r.high));
  const highRatio = today.high / high60;
  const nhScore = highRatio >= 1.0 ? 8 : highRatio >= 0.995 ? 6 : highRatio >= 0.98 ? 3 : 0;
  score += nhScore;
  if (nhScore === 8) signals.push('創 60 日新高');
  else if (nhScore >= 6) signals.push(`接近 60 日高 (${(highRatio * 100).toFixed(1)}%)`);

  // 4. RSI (max 8)
  const rsi = computeRsi(closes);
  let rsiScore = 4;
  if (rsi >= 50 && rsi <= 70)       { rsiScore = 8; signals.push(`RSI 健康強勢 (${rsi.toFixed(0)})`); }
  else if (rsi < 30)                 { rsiScore = 7; signals.push(`RSI 超賣反彈 (${rsi.toFixed(0)})`); }
  else if (rsi > 70 && rsi <= 80)   { rsiScore = 6; signals.push(`RSI 偏強 (${rsi.toFixed(0)})`); }
  else if (rsi > 80)                 { rsiScore = 2; signals.push(`RSI 過熱 (${rsi.toFixed(0)})`); }
  else                               { signals.push(`RSI 中性 (${rsi.toFixed(0)})`); }
  score += rsiScore;

  // 5. Price-volume relationship (max 8)
  const chg = today.change_pct;
  let pvScore = 4;
  if (chg > 1 && volRatio > 1.2)       { pvScore = 8; signals.push('漲帶量'); }
  else if (chg < -0.5 && volRatio < 0.9) { pvScore = 6; signals.push('跌縮量'); }
  else if (chg > 1 && volRatio < 0.8)   { pvScore = 2; signals.push('漲量縮(假突破)'); }
  else if (chg < -1 && volRatio > 1.5)  { pvScore = 1; signals.push('跌量增(出貨)'); }
  score += pvScore;

  return { score: Math.min(score, 40), signals };
}

function scoreChips(hist: Candle[]): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;
  if (hist.length < 2) return { score: 5, signals: ['資料不足，給中性分'] };

  const today    = hist[hist.length - 1];
  const n        = hist.length;
  const avgVolPrev = hist.slice(0, -1).reduce((a, b) => a + b.volume, 0) / (n - 1);
  const volRatio   = avgVolPrev > 0 ? today.volume / avgVolPrev : 1;

  // 1. Main force estimate from volume + change (max 4)
  if (volRatio >= 2.0 && today.change_pct >= 2.0)       { score += 4; signals.push('主力加碼(估)'); }
  else if (volRatio >= 1.5 && today.change_pct >= 1.0)  { score += 2; signals.push('主力承接(估)'); }

  // 2. Consecutive day trend (max 3)
  if (n >= 3) {
    const last3 = hist.slice(-3);
    const ups   = last3.filter((r) => r.change_pct > 0).length;
    const downs = last3.filter((r) => r.change_pct < 0).length;
    if (ups >= 2)   { score += 3; signals.push('連漲(融資增估)'); }
    else if (downs >= 2) { score += 1; signals.push('連跌(融資減估)'); }
    else score += 2;
  }

  // 3. Price vs MA20 (max 3)
  if (n >= 20) {
    const ma20 = hist.slice(-20).reduce((a, b) => a + b.close, 0) / 20;
    if (today.close > ma20 * 1.03)       { score += 3; signals.push('法人買超(估)'); }
    else if (today.close < ma20 * 0.97)  { score += 1; signals.push('法人賣超(估)'); }
    else score += 2;
  }

  return { score: Math.min(Math.max(score, 0), 10), signals };
}

function scoreFundamental(pe: number | null, pb: number | null, dy: number | null): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;

  // PE (max 8)
  if (pe !== null && pe > 0) {
    if (pe >= 10 && pe <= 18)      { score += 8; signals.push(`PE 合理 (${pe.toFixed(1)}x)`); }
    else if (pe < 10)              { score += 7; signals.push(`PE 低估 (${pe.toFixed(1)}x)`); }
    else if (pe < 25)              { score += 5; signals.push(`PE 偏高 (${pe.toFixed(1)}x)`); }
    else                           { score += 2; signals.push(`PE 過高 (${pe.toFixed(1)}x)`); }
  } else { score += 4; signals.push('PE 無法取得(中性分)'); }

  // Gross margin — no instant data, give neutral (max 8)
  score += 4; signals.push('毛利率無法取得(中性分)');

  // Revenue growth — no instant data, give neutral (max 8)
  score += 4; signals.push('營收成長無法取得(中性分)');

  // PBR (max 8)
  if (pb !== null && pb > 0) {
    if (pb >= 1 && pb <= 2.5)     { score += 8; signals.push(`PBR 合理 (${pb.toFixed(2)}x)`); }
    else if (pb < 1)              { score += 7; signals.push(`PBR 低估 (${pb.toFixed(2)}x)`); }
    else if (pb < 5)              { score += 5; signals.push(`PBR 偏高 (${pb.toFixed(2)}x)`); }
    else                          { score += 2; signals.push(`PBR 過高 (${pb.toFixed(2)}x)`); }
  } else { score += 4; signals.push('PBR 無法取得(中性分)'); }

  // Dividend yield (max 8)
  if (dy !== null && dy >= 0) {
    if (dy > 5)      { score += 8; signals.push(`高殖利率 (${dy.toFixed(1)}%)`); }
    else if (dy >= 3) { score += 7; signals.push(`殖利率不錯 (${dy.toFixed(1)}%)`); }
    else if (dy >= 1) { score += 5; signals.push(`殖利率偏低 (${dy.toFixed(1)}%)`); }
    else              { score += 2; signals.push(`殖利率低 (${dy.toFixed(1)}%)`); }
  } else { score += 4; signals.push('殖利率無法取得(中性分)'); }

  return { score: Math.min(Math.max(score, 0), 40), signals };
}

// Hot sectors for news scoring
const HOT_SECTORS = new Set([
  '半導體', 'AI伺服器', '電源管理', 'PCB', '散熱模組', '記憶體', '矽光子', '低軌衛星',
  '電動車', '網通', 'ABF載板', 'CoWoS封裝', 'HBM', 'DRAM', 'NAND',
]);
const HIGH_US_LINKAGE = new Set(['半導體', 'AI伺服器', '電源管理', 'PCB', '散熱模組', '記憶體', '矽光子', '低軌衛星']);

function scoreNews(sector: string): { score: number; signals: string[] } {
  const signals: string[] = [];
  const inHot = HOT_SECTORS.has(sector);

  // Industry (40%)
  const industryScore = inHot ? 9 : 5;
  if (inHot) signals.push('熱門族群題材'); else signals.push('產業消息中性');

  // Earnings season (35%) — months 3,4,6,7,9,10,12,1
  const month = new Date().getMonth() + 1;
  const earningsSeason = [3, 4, 6, 7, 9, 10, 12, 1].includes(month);
  const earningsScore = earningsSeason ? 8 : 5;
  if (earningsSeason) signals.push('財報/法說季'); else signals.push('法說事件中性');

  // US linkage (25%)
  const usScore = HIGH_US_LINKAGE.has(sector) ? 8 : inHot ? 6 : 5;
  if (HIGH_US_LINKAGE.has(sector)) signals.push('美股高連動');
  else if (inHot) signals.push('美股中連動');
  else signals.push('美股連動中性');

  const weighted = industryScore * 0.4 + earningsScore * 0.35 + usScore * 0.25;
  const minPossible = 5.0;
  const maxPossible = 9.0 * 0.4 + 8.0 * 0.35 + 8.0 * 0.25;
  const normalized = ((weighted - minPossible) / (maxPossible - minPossible)) * 10;
  const finalScore = Math.max(0, Math.min(10, normalized));

  return { score: Math.round(finalScore * 100) / 100, signals };
}

function scoreSentiment(hist: Candle[], stockCode: string): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;

  if (hist.length < 2) return { score: 5, signals: ['資料不足，給中性分'] };

  const today = hist[hist.length - 1];
  const n     = hist.length;

  // Turnover rate estimate (max 5) — approximate capital from volume patterns
  // Use a conservative 500k lot default for unknown stocks
  const estimatedCapital = 500000;
  const turnover = (today.volume / 1000) / estimatedCapital * 100;
  if (turnover >= 5 && turnover <= 15) { score += 5; signals.push(`周轉率健康 (${turnover.toFixed(1)}%)`); }
  else if (turnover >= 3)              { score += 3; signals.push(`周轉率溫和 (${turnover.toFixed(1)}%)`); }
  else if (turnover >= 1)              { score += 2; signals.push(`周轉率低 (${turnover.toFixed(1)}%)`); }

  // Volume ratio 20d (max 5)
  const avgVol20 = n >= 21
    ? hist.slice(-21, -1).reduce((a, b) => a + b.volume, 0) / 20
    : hist.slice(0, -1).reduce((a, b) => a + b.volume, 0) / Math.max(n - 1, 1);
  const volRatio = avgVol20 > 0 ? today.volume / avgVol20 : 1;
  if (volRatio >= 1.5 && volRatio <= 4)  { score += 5; signals.push(`量比健康 (${volRatio.toFixed(1)}x)`); }
  else if (volRatio > 4)                  { score += 3; signals.push(`爆量注意 (${volRatio.toFixed(1)}x)`); }
  else if (volRatio >= 1.2)               { score += 2; signals.push(`量微增 (${volRatio.toFixed(1)}x)`); }

  return { score: Math.min(Math.max(score, 0), 10), signals };
}

/** Infer sector from stock code prefix (rough approximation) */
function inferSector(stockCode: string): string {
  const prefix = parseInt(stockCode.slice(0, 2), 10);
  if (prefix >= 23 && prefix <= 25) return '半導體';
  if (prefix === 24 || prefix === 33) return '電子零組件';
  if (prefix >= 26 && prefix <= 27) return '電腦及週邊設備';
  if (prefix >= 28 && prefix <= 29) return '通信網路';
  if (prefix >= 30 && prefix <= 32) return '光電';
  if (prefix >= 13 && prefix <= 15) return '化學工業';
  if (prefix >= 16 && prefix <= 19) return '食品工業';
  if (prefix >= 22 && prefix <= 23) return '紡織';
  if (prefix >= 57 && prefix <= 59) return '金融保險';
  if (prefix >= 20 && prefix <= 22) return '建材營造';
  return '其他';
}

export interface OnDemandResult {
  stock: ScanStock;
  isOnDemand: true;
}

export type OnDemandStatus = 'idle' | 'loading' | 'done' | 'error' | 'not_traded';

/**
 * On-demand 5-dimension scoring for a stock not in daily all_scores.json.
 * Fetches TWSE history + fundamentals client-side, scores all 5 dimensions,
 * and returns a ScanStock-compatible object.
 *
 * Since this is a static export, all fetching is done client-side directly
 * from TWSE OpenAPI (which supports CORS).
 */
export function useOnDemandScan(stockId: string | null): {
  data: OnDemandResult | null;
  status: OnDemandStatus;
  error: string | null;
} {
  const [data, setData]     = useState<OnDemandResult | null>(null);
  const [status, setStatus] = useState<OnDemandStatus>('idle');
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!stockId) {
      setData(null);
      setStatus('idle');
      setError(null);
      return;
    }

    let cancelled = false;

    async function run() {
      setData(null);
      setError(null);
      setStatus('loading');

      try {
        // Fetch in parallel: history + fundamentals + name
        const [hist, fundamentals, name] = await Promise.all([
          fetchTwseHistory(stockId!),
          fetchFundamentals(stockId!),
          fetchStockName(stockId!),
        ]);

        if (cancelled) return;

        if (hist.length === 0) {
          setStatus('not_traded');
          setError(`無法取得 ${stockId} 的交易資料，該股票可能未在 TWSE 上市或近期未交易`);
          return;
        }

        const today   = hist[hist.length - 1];
        const sector  = inferSector(stockId!);
        const closes  = hist.map((r) => r.close);
        const rsi     = computeRsi(closes);

        const avgVol5 = hist.length >= 6
          ? hist.slice(-6, -1).reduce((a, b) => a + b.volume, 0) / 5
          : today.volume;
        const volRatio = avgVol5 > 0 ? today.volume / avgVol5 : 1;

        const techResult  = scoreTechnical(hist);
        const chipsResult = scoreChips(hist);
        const fundResult  = scoreFundamental(fundamentals.pe, fundamentals.pb, fundamentals.dy);
        const newsResult  = scoreNews(sector);
        const sentResult  = scoreSentiment(hist, stockId!);

        // v2 weights: tech 25%, fundamental 23%, news 32%, sentiment 12%, chips 8%
        // Map raw scores to 0-100 scale using each dimension's max
        const techNorm  = (techResult.score / 40) * 100;
        const fundNorm  = (fundResult.score / 40) * 100;
        const newsNorm  = (newsResult.score / 10) * 100;
        const sentNorm  = (sentResult.score / 10) * 100;
        const chipsNorm = (chipsResult.score / 10) * 100;

        const totalScore =
          techNorm  * 0.25 +
          fundNorm  * 0.23 +
          newsNorm  * 0.32 +
          sentNorm  * 0.12 +
          chipsNorm * 0.08;

        const dimensions: ScanDimensions = {
          technical:   Math.round(techResult.score  * 10) / 10,
          fundamental: Math.round(fundResult.score  * 10) / 10,
          news:        Math.round(newsResult.score  * 10) / 10,
          sentiment:   Math.round(sentResult.score  * 10) / 10,
          chips:       Math.round(chipsResult.score * 10) / 10,
        };

        const signals: ScanSignals = {
          technical:   techResult.signals,
          fundamental: fundResult.signals,
          news:        newsResult.signals,
          sentiment:   sentResult.signals,
          chips:       chipsResult.signals,
        };

        // Entry/target/stop-loss rough estimates
        const entryPrice   = today.close;
        const targetPrice  = Math.round(entryPrice * 1.08 * 100) / 100;
        const stopLoss     = Math.round(entryPrice * 0.95 * 100) / 100;
        const grade =
          totalScore >= 75 ? '強力買進' :
          totalScore >= 60 ? '買進' :
          totalScore >= 50 ? '觀望' : '偏弱';

        const stock: ScanStock = {
          stock_id:    stockId!,
          name,
          sector,
          close:       today.close,
          change_pct:  today.change_pct,
          total_score: Math.round(totalScore * 10) / 10,
          rsi,
          vol_ratio:   Math.round(volRatio * 100) / 100,
          dimensions,
          signals,
          details: {
            rsi,
            vol_ratio: volRatio,
            pe:        fundamentals.pe ?? undefined,
          },
          strategy: {
            entry:          entryPrice,
            target:         targetPrice,
            stop_loss:      stopLoss,
            upside:         8,
            downside:       5,
            recommendation: grade,
          },
        };

        if (!cancelled) {
          setData({ stock, isOnDemand: true });
          setStatus('done');
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setError(err instanceof Error ? err.message : '即時查詢失敗');
        }
      }
    }

    run();
    return () => { cancelled = true; };
  }, [stockId]);

  return { data, status, error };
}
