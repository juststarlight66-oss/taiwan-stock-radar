'use client';
import { demoIndex, demoStocks } from './demoData';
import { IndexData, StockData } from './types';

export function useMarketData() {
  // With static export (output: 'export'), API routes are disabled.
  // Market data uses demo values; real-time TWSE data requires a server-rendered deployment.
  const indexData: IndexData = { ...demoIndex, updatedAt: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) };
  const stockData: StockData[] = [...demoStocks];

  return {
    indexData,
    stockData,
    isLoading: false,
    isError: false,
    isDemo: true,
  };
}
