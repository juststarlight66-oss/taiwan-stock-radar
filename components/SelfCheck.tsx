'use client';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAllScores, useOnDemandScan } from '@/lib/useScanData';
import { ScanStock, DIMENSION_CONFIG } from '@/lib/scanTypes';
import {
  Search, X, AlertCircle, ChevronDown, ChevronUp,
  ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown,
  Plus, Trash2, Share2, Check, ExternalLink, Shield, Target,
} from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
} from 'recharts';

// ── 建議等級：對齊 StockDetailModal 的 ACTION_MAP（light-theme 版）
const ACTION_MAP: Record<string, { label: string; text: string; bg: string; border: string; dot: string }> = {
  '強力買進': { label: '強力買進 🔥', text: 'text-red-600 font-bold',    bg: 'bg-red-50',     border: 'border-red-200',    dot: 'bg-red-500' },
  '買進':     { label: '買進 ✅',      text: 'text-orange-600 font-bold', bg: 'bg-orange-50',  border: 'border-orange-200', dot: 'bg-orange-500' },
  '觀望':     { label: '觀望 ⏳',      text: 'text-gray-500',             bg: 'bg-gray-50',    border: 'border-gray-200',   dot: 'bg-gray-400' },
  '偏弱':     { label: '偏弱 ⚠️',     text: 'text-emerald-600',          bg: 'bg-emerald-50', border: 'border-emerald-200',dot: 'bg-emerald-500' },
};

const DIM_LABELS: Record<string, string> = {
  technical: '技術面', fundamental: '基本面', news: '消息面', sentiment: '市場情緒', chips: '籌碼面',
};
const DIM_MAXES: Record<string, number> = {
  technical: 40, fundamental: 40, news: 10, sentiment: 10, chips: 10,
};
const DIM_COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];

function ScoreBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 70 ? 'bg-violet-500' : pct >= 50 ? 'bg-sky-500' : pct >= 30 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="w-full bg-gray-200 rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-6 w-32 rounded bg-gray-200" />
        <div className="h-8 w-16 rounded bg-gray-200" />
      </div>
      <div className="h-4 w-full rounded bg-gray-200" />
      <div className="h-4 w-3/4 rounded bg-gray-200" />
      <div className="grid grid-cols-3 gap-2">
        {[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded bg-gray-200" />)}
      </div>
    </div>
  );
}

function CompareRadar({ stocks }: { stocks: ScanStock[] }) {
  const data = Object.entries(DIM_LABELS).map(([key, label]) => {
    const entry: Record<string, string | number> = { dim: label };
    stocks.forEach((s) => {
      const raw = (s.dimensions as unknown as Record<string, number>)?.[key] ?? 0;
      entry[s.stock_id] = Math.round((raw / (DIM_MAXES[key] ?? 10)) * 100);
    });
    return entry;
  });
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-xs font-semibold text-gray-500 mb-3">五維度比較雷達圖</h3>
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis dataKey="dim" tick={{ fontSize: 11, fill: '#6b7280' }} />
          {stocks.map((s, i) => (
            <Radar
              key={s.stock_id}
              name={`${s.stock_id} ${s.name ?? ''}`}
              dataKey={s.stock_id}
              stroke={DIM_COLORS[i % DIM_COLORS.length]}
              fill={DIM_COLORS[i % DIM_COLORS.length]}
              fillOpacity={0.12}
              strokeWidth={1.5}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3 mt-2 justify-center">
        {stocks.map((s, i) => (
          <span key={s.stock_id} className="flex items-center gap-1 text-[11px] text-gray-500">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: DIM_COLORS[i % DIM_COLORS.length] }} />
            {s.stock_id} {s.name ?? ''}
          </span>
        ))}
      </div>
    </div>
  );
}
