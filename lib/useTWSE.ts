'use client';
import useSWR from 'swr';
import { demoIndex, demoStocks } from './demoData';
import { IndexData, StockData } from './types';

const fetcher = (url: string) => fetch(url).then(r => r.json());

function parseTWSEIndex(raw: unknown[]): IndexData {
  // MI_INDEX returns array of objects with 指數, 收盤指數, etc.
  const taiex = (raw as Record<string, string>[]).find(
    r => r['指數'] === '發行量加權股價指數' || r['index'] === 'TAIEX'
  );
  if (!taiex) return demoIndex;
  const close = parseFloat(taiex['收盤指數']?.replace(/,/g, '') || '0');
  const change = parseFloat(taiex['漲跌點數']?.replace(/,/g, '') || '0');
  return {
    index: 'TAIEX',
    name: '加權指數',
    change,
    changePercent: close > 0 ? (change / (close - change)) * 100 : 0,
    open: parseFloat(taiex['開盤指數']?.replace(/,/g, '') || '0'),
    high: parseFloat(taiex['最高指數']?.replace(/,/g, '') || '0'),
    low: parseFloat(taiex['最低指數']?.replace(/,/g, '') || '0'),
    close,
    volume: parseFloat(taiex['成交金額(元)']?.replace(/,/g, '') || '0'),
    updatedAt: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
  };
}

function parseTWSEStocks(stockDay: unknown[], bwibbu: unknown[]): StockData[] {
  if (!Array.isArray(stockDay) || stockDay.length === 0) return demoStocks;

  const bwiMap = new Map<string, Record<string, string>>();
  if (Array.isArray(bwibbu)) {
    (bwibbu as Record<string, string>[]).forEach(b => {
      bwiMap.set(b['證券代號'] || b['Code'] || '', b);
    });
  }

  const targetIds = new Set(['2330', '2454', '2337', '2317', '2382', '2308', '2881', '3034']);
  const results: StockData[] = [];

  (stockDay as Record<string, string>[]).forEach(s => {
    const id = s['證券代號'] || s['Code'] || '';
    if (!targetIds.has(id)) return;

    const close = parseFloat(s['收盤價']?.replace(/,/g, '') || '0');
    const prevClose = parseFloat(s['昨收']?.replace(/,/g, '') || s['開盤價']?.replace(/,/g, '') || '0');
    const change = close - prevClose;
    const bwi = bwiMap.get(id);
    const pe = bwi ? parseFloat(bwi['本益比'] || '0') : 0;
    const pb = bwi ? parseFloat(bwi['股價淨值比'] || '0') : 0;

    // derive recommendation from change%
    const pct = prevClose > 0 ? (change / prevClose) * 100 : 0;
    let rec: StockData['recommendation'] = 'hold';
    let score = 50;
    if (pct > 2) { rec = 'strong_buy'; score = 85 + Math.min(pct * 2, 14); }
    else if (pct > 0.5) { rec = 'buy'; score = 65 + pct * 5; }
    else if (pct < -1.5) { rec = 'sell'; score = 35 - Math.abs(pct) * 3; }

    const demo = demoStocks.find(d => d.stockId === id);

    results.push({
      stockId: id,
      name: s['證券名稱'] || s['Name'] || demo?.name || id,
      close,
      change,
      changePercent: pct,
      open: parseFloat(s['開盤價']?.replace(/,/g, '') || '0'),
      high: parseFloat(s['最高價']?.replace(/,/g, '') || '0'),
      low: parseFloat(s['最低價']?.replace(/,/g, '') || '0'),
      volume: parseFloat(s['成交股數']?.replace(/,/g, '') || '0'),
      pe: pe || demo?.pe,
      pb: pb || demo?.pb,
      yield: demo?.yield,
      recommendation: rec,
      score: Math.round(score),
      sector: demo?.sector || '其他',
    });
  });

  return results.length >= 3 ? results : demoStocks;
}

export function useMarketData() {
  const { data: indexRes, error: indexErr, isLoading: indexLoading } =
    useSWR('/api/twse?type=MI_INDEX', fetcher, { refreshInterval: 60000 });
  const { data: stockRes, error: stockErr, isLoading: stockLoading } =
    useSWR('/api/twse?type=STOCK_DAY_ALL', fetcher, { refreshInterval: 120000 });
  const { data: bwiRes } =
    useSWR('/api/twse?type=BWIBBU_ALL', fetcher, { refreshInterval: 300000 });

  const indexData: IndexData =
    indexRes?.success && Array.isArray(indexRes.data)
      ? parseTWSEIndex(indexRes.data)
      : demoIndex;

  const stockData: StockData[] =
    stockRes?.success && Array.isArray(stockRes.data)
      ? parseTWSEStocks(stockRes.data, bwiRes?.data || [])
      : demoStocks;

  return {
    indexData,
    stockData,
    isLoading: indexLoading || stockLoading,
    isError: !!(indexErr || stockErr),
    isDemo: !indexRes?.success,
  };
}
