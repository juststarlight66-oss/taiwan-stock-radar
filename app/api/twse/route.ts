import { NextRequest, NextResponse } from 'next/server';

const TWSE_BASE = 'https://openapi.twse.com.tw/v1';

const ENDPOINTS: Record<string, string> = {
  MI_INDEX: `${TWSE_BASE}/exchangeReport/MI_INDEX`,
  STOCK_DAY_ALL: `${TWSE_BASE}/exchangeReport/STOCK_DAY_ALL`,
  BWIBBU_ALL: `${TWSE_BASE}/exchangeReport/BWIBBU_ALL`,
  STOCK_DAY: `${TWSE_BASE}/exchangeReport/STOCK_DAY`,
  BWIBBU_D: `${TWSE_BASE}/exchangeReport/BWIBBU_D`,
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'MI_INDEX';
  const stockNo = searchParams.get('stockNo');

  let url = ENDPOINTS[type];
  if (!url) {
    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  }
  if (stockNo) {
    url += `?stockNo=${stockNo}`;
  }

  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 TaiwanStockRadar/1.0',
      },
      next: { revalidate: 300 }, // cache 5 min
    });

    if (!res.ok) {
      throw new Error(`TWSE responded ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json({ success: true, data }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'fetch error';
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
