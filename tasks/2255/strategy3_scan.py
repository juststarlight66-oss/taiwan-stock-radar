#!/usr/bin/env python3
"""
策略三：爆量中小型股掃描器 (TPEx)

規則：
  1. 股本 < 30億 (Paidin.Capital < 3,000,000,000 NTD)
  2. 今日量 > 100張 (TradingShares > 100,000)
  3. 今日量 / 5日均量 >= 3.0
  4. 10日漲幅 > 1%

歷史資料來源: yfinance (.TWO suffix)
當日行情: TPEx daily close API (gzip stream)
股本資料: TPEx listed company info API (curl)

輸出: JSON + 終端表格
"""

import gzip
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta

import numpy as np
import requests
import yfinance as yf

# ── Constants ──

TPEX_LISTED_URL = "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O"
TPEX_DAILY_URL  = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"

CAP_MAX_NTD    = 3_000_000_000  # 30億 NTD
MIN_VOL_SHARES = 100_000         # 100張 = 100,000股
VOL_RATIO_MIN  = 3.0             # 量比 >= 3x
GAIN_10D_MIN   = 1.0             # 10日漲幅 > 1%
YF_BATCH_SIZE  = 100             # yfinance batch download size

# ── Data fetching ──

def fetch_tpex_capital_map():
    """curl TPEx basic info -> {stock_id: {name, capital_ntd}}"""
    print("[1/4] 抓取 TPEx 基本資料 (股本)...")
    cmd = ['curl', '-sL', '-A', 'Mozilla/5.0', '--max-time', '30', TPEX_LISTED_URL]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=35)
    data = json.loads(res.stdout)
    rows = data if isinstance(data, list) else data.get('msgArr', [])
    cap_map = {}
    for r in rows:
        code = str(r.get('SecuritiesCompanyCode', '')).strip()
        if len(code) != 4:
            continue
        try:
            cap = float(str(r.get('Paidin.Capital.NTDollars', '0') or '0').replace(',', ''))
        except (ValueError, TypeError):
            cap = 0
        cap_map[code] = {
            'name': str(r.get('CompanyAbbreviation', r.get('CompanyName', ''))).strip(),
            'capital_ntd': cap,
        }
    print(f"  ✓ {len(cap_map)} 檔基本資料")
    return cap_map

def fetch_tpex_daily():
    """TPEx daily close API (gzip chunked) -> {stock_id: daily_data}"""
    print("[2/4] 抓取 TPEx 當日行情 (gzip stream + retries)...")
    rows = None
    for attempt in range(5):
        try:
            resp = requests.get(TPEX_DAILY_URL, stream=True,
                headers={'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'gzip'},
                timeout=60)
            raw_bytes = resp.raw.read()
            if raw_bytes[:2] == b'\x1f\x8b':
                raw_bytes = gzip.decompress(raw_bytes)
            rows = json.loads(raw_bytes)
            if isinstance(rows, list) and len(rows) > 100:
                break
            print(f"  attempt {attempt+1}: got {len(rows) if isinstance(rows, list) else 0} rows, retrying...")
        except Exception as e:
            print(f"  attempt {attempt+1}: {type(e).__name__}, retrying...")
            time.sleep(attempt * 2 + 1)

    if not isinstance(rows, list):
        rows = rows.get('data', []) if rows else []

    daily_map = {}
    date_str = ''
    for r in rows:
        code = str(r.get('SecuritiesCompanyCode', '')).strip()
        if len(code) != 4:
            continue
        try:
            close = float(str(r.get('Close', '0') or '0').replace(',', '').strip())
            if close <= 0:
                continue
            vol = float(str(r.get('TradingShares', '0') or '0').replace(',', '').strip())
            chg_s = str(r.get('Change', '0') or '0').replace(',', '').strip()
            chg = 0.0 if chg_s in ('+', '-', '', 'X', '--') else float(chg_s)
            prev = close - chg
            chg_pct = round(chg / prev * 100, 2) if prev != 0 else 0.0
            open_p  = float(str(r.get('Open',  '0') or '0').replace(',', '').strip())
            high    = float(str(r.get('High',  '0') or '0').replace(',', '').strip())
            low     = float(str(r.get('Low',   '0') or '0').replace(',', '').strip())
            d = str(r.get('Date', '')).strip()
            if d:
                date_str = d
            daily_map[code] = {
                'close': close, 'volume': vol, 'change_pct': chg_pct,
                'open': open_p, 'high': high, 'low': low,
                'date': d,
            }
        except (ValueError, KeyError):
            continue

    # Minguo -> Western
    scan_date = ''
    if date_str and len(date_str) >= 7:
        scan_date = str(int(date_str[:3]) + 1911) + date_str[3:]

    print(f"  ✓ {len(daily_map)} 檔當日行情 (日期: {date_str} = {scan_date})")
    return daily_map, scan_date

def download_histories(tickers_with_sids):
    """Batch download 2-month history via yfinance"""
    results = {}
    tickers = [f'{sid}.TWO' for sid, _ in tickers_with_sids]
    print(f"[3/4] 下載歷史資料 ({len(tickers)} 檔, batch={YF_BATCH_SIZE})...")

    for batch_start in range(0, len(tickers), YF_BATCH_SIZE):
        batch = tickers[batch_start:batch_start + YF_BATCH_SIZE]
        batch_items = tickers_with_sids[batch_start:batch_start + YF_BATCH_SIZE]
        try:
            df = yf.download(batch, period='2mo', progress=False, group_by='ticker')
            for (sid, _), ticker in zip(batch_items, batch):
                try:
                    data = df[ticker] if ticker in df.columns else (df if len(batch) == 1 else None)
                    if data is None or data.empty:
                        continue
                    closes  = data['Close'].values
                    volumes = data['Volume'].values
                    if len(closes) < 11:
                        continue
                    results[sid] = {'closes': closes, 'volumes': volumes}
                except Exception:
                    continue
            n = (batch_start // YF_BATCH_SIZE) + 1
            print(f"  Batch {n}: {len(batch_items)} -> {len(results)} total")
        except Exception as e:
            print(f"  Batch {(batch_start // YF_BATCH_SIZE) + 1} failed: {e}")
        time.sleep(0.5)

    print(f"  ✓ 共取得 {len(results)} 檔歷史資料")
    return results

# ── Strategy 3 screening ──

def screen_results(cap_map, daily_map, histories):
    """Apply strategy 3 rules"""
    print(f"[4/4] 策略三篩選...")
    results = []
    for sid, daily in daily_map.items():
        if sid not in histories or sid not in cap_map:
            continue

        closes  = histories[sid]['closes']
        volumes = histories[sid]['volumes']

        gain_10d  = float((closes[-1] - closes[-11]) / closes[-11] * 100)
        avg_vol_5d = float(volumes[-6:-1].mean())
        vol_ratio  = float(volumes[-1] / avg_vol_5d) if avg_vol_5d > 0 else 0

        if vol_ratio < VOL_RATIO_MIN:
            continue
        if gain_10d <= GAIN_10D_MIN:
            continue

        capital_yi = cap_map[sid]['capital_ntd'] / 1e8
        results.append({
            'stock_id': sid,
            'name': cap_map[sid]['name'],
            'close': float(daily['close']),
            'volume': int(daily['volume']),
            'volume_zhang': round(daily['volume'] / 1000, 1),
            'change_pct': daily['change_pct'],
            'capital_yi': round(capital_yi, 2),
            'gain_10d': round(gain_10d, 2),
            'vol_ratio': round(vol_ratio, 2),
            'avg_vol_5d_shares': int(avg_vol_5d),
            'open': daily.get('open', 0),
            'high': daily.get('high', 0),
            'low': daily.get('low', 0),
        })

    results.sort(key=lambda r: r['vol_ratio'], reverse=True)
    return results

# ── Main ──

def main():
    print(f"策略三：爆量中小型股掃描器 (TPEx)\n"
          f"規則: 股本<30億 | 量>100張 | vol_ratio>={VOL_RATIO_MIN} | 10日漲幅>{GAIN_10D_MIN}%\n")

    # 1. Fetch data
    cap_map = fetch_tpex_capital_map()
    daily_map, scan_date = fetch_tpex_daily()
    if not daily_map:
        print("✗ 無當日行情，終止")
        return

    # 2. Filter small-cap + min volume
    candidates = {}
    for sid, d in daily_map.items():
        if sid not in cap_map:
            continue
        if cap_map[sid]['capital_ntd'] >= CAP_MAX_NTD:
            continue
        if d['volume'] < MIN_VOL_SHARES:
            continue
        candidates[sid] = d

    print(f"  初篩候選: {len(candidates)} 檔 (股本<30億 + 量>100張)")

    # 3. Download histories via yfinance
    ticker_list = [(sid, cap_map[sid]['name']) for sid in candidates]
    histories = download_histories(ticker_list)

    # 4. Screen
    results = screen_results(cap_map, candidates, histories)

    # 5. Output
    print(f"\n{'=' * 75}")
    print(f"  ✅ 策略三篩選結果: {len(results)} 檔通過")
    print(f"{'=' * 75}\n")
    if results:
        print(f"{'代碼':<6} {'名稱':<10} {'收盤':>8} {'漲跌%':>7} {'今日量(張)':>10} {'量比':>6} {'10日漲%':>7} {'股本(億)':>8}")
        print("-" * 75)
        for r in results:
            print(f"{r['stock_id']:<6} {r['name']:<10} {r['close']:>8.2f} {r['change_pct']:>+6.2f}% "
                  f"{r['volume_zhang']:>10.1f} {r['vol_ratio']:>6.2f} {r['gain_10d']:>+6.2f}% "
                  f"{r['capital_yi']:>8.2f}")
        print("-" * 75)
        print(f"  合計: {len(results)} 檔")

    # 6. Save
    output_path = os.environ.get('OUTPUT', 'strategy3_result.json')
    output = {
        'scan_date': scan_date,
        'generated_at': datetime.now().isoformat(),
        'strategy': 'strategy3_smallcap_volume_breakout',
        'market': 'TPEx',
        'history_source': 'yfinance',
        'scanned_count': len(candidates),
        'passed': len(results),
        'rules': {
            'capital_max_yi': CAP_MAX_NTD / 1e8,
            'min_volume_zhang': MIN_VOL_SHARES / 1000,
            'vol_ratio_min': VOL_RATIO_MIN,
            'gain_10d_min_pct': GAIN_10D_MIN,
        },
        'candidates': results,
        'total': len(results),
    }
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n結果已儲存: {output_path}")

if __name__ == '__main__':
    main()
