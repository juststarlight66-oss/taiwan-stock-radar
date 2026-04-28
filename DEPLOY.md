# Taiwan Stock Radar — Deploy Guide

## Option 1: Vercel (Recommended — 1 click)

1. Push this repo to GitHub
2. Go to https://vercel.com/new
3. Import the repo → Vercel auto-detects Next.js
4. Click Deploy — no environment variables needed
5. Live in ~60 seconds at `https://taiwan-stock-radar-xxx.vercel.app`

## Option 2: Local dev

```bash
cd taiwan-stock-radar
npm install
npm run dev        # http://localhost:3000
```

## Option 3: Self-hosted (any Linux VPS)

```bash
npm run build
npm run start -- -p 3000
# or with PM2:
pm2 start "npm run start -- -p 3000" --name taiwan-stock-radar
```

## Option 4: Docker

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm ci && npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Architecture

```
app/
  page.tsx              — Root page (renders Dashboard)
  layout.tsx            — HTML shell + metadata
  globals.css           — Dark theme + scrollbar styles
  api/twse/route.ts     — Server-side TWSE proxy (handles CORS)

components/
  Dashboard.tsx         — Main shell: 4 tabs + header + live status
  MarketOverviewCards.tsx — TAIEX index cards (4 metrics)
  StockTable.tsx        — Gainers/losers table with recommendation bars
  NewsSidebar.tsx       — News feed with sentiment indicators
  SectorHeatmap.tsx     — Sector heatmap grid (hot/warm/cool)
  TradingStrategy.tsx   — Strategy panel: buy/hold/sell lists + sizing
  LoadingSpinner.tsx    — Reusable loading indicator

lib/
  types.ts              — TypeScript interfaces
  demoData.ts           — 8 sample stocks + news + sectors (fallback)
  useTWSE.ts            — SWR hooks for all 3 TWSE endpoints
```

## Data Sources

All TWSE endpoints are public (no API key needed):
- MI_INDEX    → 加權指數 (refreshes every 60s)
- STOCK_DAY_ALL → All stock OHLCV (refreshes every 2min)  
- BWIBBU_ALL  → PE/PB ratios (refreshes every 5min)

During non-trading hours or if TWSE API is unavailable,
the app automatically falls back to realistic demo data
for 8 stocks: 2330 台積電, 2454 聯發科, 2337 旺宏,
2317 鴻海, 2382 廣達, 2308 台達電, 2881 富邦金, 3034 聯詠
