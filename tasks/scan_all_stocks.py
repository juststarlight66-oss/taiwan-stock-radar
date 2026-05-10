#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全域掃描腳本：scan_all_stocks.py
從 TWSE + TPEx OpenAPI 取得全市場約 2100 檔個股資料，
加上族群分類與基礎評分，輸出 all_scores.json
"""

import json, os, sys, time, warnings, math
warnings.filterwarnings('ignore')
from datetime import datetime, timedelta, timezone
import requests
requests.packages.urllib3.disable_warnings()

_TW_TZ = timezone(timedelta(hours=8))

HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; StockRadar/1.0)",
}

URL_STOCK_DAY_ALL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
URL_BWIBBU_ALL    = "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL"
URL_TPEX_CLOSE    = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"
URL_TPEX_PE       = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis"

def infer_sector(sid: str) -> str:
    s = str(sid).strip()
    if not s or not s[:4].isdigit():
        return "其他"
    try:
        num = int(s[:4])
    except ValueError:
        return "其他"
    if 1000 <= num <= 1099: return "水泥工業"
    if 1100 <= num <= 1199: return "食品工業"
    if 1200 <= num <= 1399: return "食品工業"
    if 1400 <= num <= 1499: return "紡織纖維"
    if 1500 <= num <= 1599: return "電機機械"
    if 1600 <= num <= 1699: return "電器電纜"
    if 1700 <= num <= 1799: return "化學工業"
    if 1800 <= num <= 1899: return "玻璃陶瓷"
    if 1900 <= num <= 1999: return "造紙工業"
    if 2000 <= num <= 2099: return "鋼鐵工業"
    if 2100 <= num <= 2199: return "紡織纖維"
    if 2200 <= num <= 2299: return "航運業"
    if num in (2301, 2303, 2308, 2330, 2337, 2338, 2347, 2351, 2352, 2353,
               2354, 2356, 2363, 2364, 2365, 2368, 2371, 2374, 2376, 2377,
               2379, 2388, 2395, 2396, 2397, 2404, 2408, 2412, 2454, 2455,
               3008, 3034, 3036, 3037, 3661, 3711, 6446, 6488, 6526):
        # 精選半導體/IC設計/封測
        if num in (2330, 2303, 2308, 2337, 2338, 2363, 2364, 2365, 2368, 2454, 2455, 3008, 3034, 3661, 3711, 6488): return "半導體"
        if num in (2301, 2351, 2352, 2353, 2354, 2356, 2374, 2376, 2377, 2395, 2396, 2397): return "電子零組件"
        if num in (2379, 2388, 6526): return "通信網路"
        if num in (3036, 3037): return "電子通路"
        if num in (2371, 2404, 2412): return "電腦及週邊設備"
        if num in (2347): return "電腦及週邊設備"
        if num in (6446): return "生技醫療"
    if 2300 <= num <= 2399: return "半導體"
    if 2400 <= num <= 2499: return "電腦及週邊設備"
    if 2500 <= num <= 2599: return "建材營造"
    if 2600 <= num <= 2699: return "航運業"
    if 2700 <= num <= 2799: return "金融保險"
    if 2800 <= num <= 2899: return "金融保險"
    if 2900 <= num <= 2999: return "貿易百貨"
    if 3000 <= num <= 3199: return "電子零組件"
    if 3200 <= num <= 3299: return "光電"
    if 3300 <= num <= 3499: return "其他電子"
    if 3500 <= num <= 3599: return "電子零組件"
    if 3600 <= num <= 3799: return "半導體"
    if 4000 <= num <= 4199: return "生技醫療"
    if 4500 <= num <= 4799: return "生技醫療"
    if 4800 <= num <= 4999: return "電機機械"
    if 5000 <= num <= 5999: return "建材營造"
    if 6000 <= num <= 6099: return "電子通路"
    if 6100 <= num <= 6299: return "光電"
    if 6400 <= num <= 6699: return "生技醫療"
    if 6700 <= num <= 6999: return "數位雲端"
    if 8000 <= num <= 8999: return "電腦及週邊設備"
    if 9000 <= num <= 9199: return "其他"
    if 9200 <= num <= 9299: return "電機機械"
    if 9900 <= num <= 9999: return "綜合"
    return "其他"

def safe_float(v, default=0.0):
    try: return float(str(v).replace(",", "").replace("+", ""))
    except: return default

def safe_int(v, default=0):
    try: return int(str(v).replace(",", ""))
    except: return default

def http_get(url, retries=3):
    for i in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=30, verify=False)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            print(f"  [重試 {i+1}] {e}")
            time.sleep(3 * (i + 1))
    return []

def score_stock(volume, pe, yield_pct, pbr):
    tech = min(40, int(math.log10(volume + 1) * 5)) if volume > 0 else 0
    fund = 0
    if pe and 0 < pe < 10: fund += 10
    elif pe and 0 < pe < 15: fund += 8
    elif pe and 0 < pe < 20: fund += 6
    elif pe and 0 < pe < 30: fund += 4
    elif pe and 0 < pe < 50: fund += 2
    if yield_pct and yield_pct > 6: fund += 8
    elif yield_pct and yield_pct > 4: fund += 6
    elif yield_pct and yield_pct > 2: fund += 4
    elif yield_pct and yield_pct > 0: fund += 2
    if pbr and pbr < 1: fund += 7
    elif pbr and pbr < 2: fund += 5
    elif pbr and pbr < 3: fund += 3
    elif pbr and pbr < 5: fund += 1
    fund = min(25, fund)
    total = tech + fund + 8 + 5 + 5
    return {"technical_score": tech, "fundamental_score": fund,
            "chips_score": 8, "news_score": 5, "sentiment_score": 5,
            "total_score": total}

def main():
    today = datetime.now(_TW_TZ).strftime("%Y-%m-%d")
    print(f"台股全域掃描 {today}")

    twse_raw  = http_get(URL_STOCK_DAY_ALL)
    bwibbu    = {str(x.get("Code","")).strip(): x for x in http_get(URL_BWIBBU_ALL) if x.get("Code","")}
    tpex_raw  = http_get(URL_TPEX_CLOSE)
    tpex_pe   = {str(x.get("SecuritiesCompanyCode","")).strip(): x for x in http_get(URL_TPEX_PE) if x.get("SecuritiesCompanyCode","")}

    stocks = []
    seen = set()

    # 處理上市
    for item in twse_raw:
        sid = str(item.get("Code","")).strip()
        if not sid or len(sid) != 4 or not sid.isdigit() or sid in seen: continue
        close = safe_float(item.get("ClosingPrice",0))
        if close <= 0: continue
        seen.add(sid)
        vol = safe_int(item.get("TradeVolume",0))
        change = safe_float(item.get("Change",0))
        prev = close - change
        chg_pct = round(change / prev * 100, 2) if prev > 0 else 0.0
        bw = bwibbu.get(sid, {})
        pe = safe_float(bw.get("PEratio",0))
        yld = safe_float(bw.get("DividendYield",0))
        pbr = safe_float(bw.get("PBratio",0))
        sc = score_stock(vol, pe or None, yld or None, pbr or None)
        stocks.append({
            "stock_id": sid,
            "stock_name": str(item.get("Name","")).strip(),
            "sector": infer_sector(sid),
            "close": round(close, 2),
            "change_pct": chg_pct,
            "volume": vol,
            "pe": round(pe,2) if pe > 0 else None,
            "yield_pct": round(yld,2) if yld > 0 else None,
            "pbr": round(pbr,2) if pbr > 0 else None,
            **sc
        })

    # 處理上櫃
    close_keys = ["Close","收盤價","close","ClosingPrice"]
    vol_keys   = ["TradingShares","成交股數","TradeVolume"]
    chg_keys   = ["Change","漲跌","change"]
    for item in tpex_raw:
        sid = str(item.get("SecuritiesCompanyCode","")).strip()
        if not sid or len(sid) != 4 or not sid.isdigit() or sid in seen: continue
        close = 0.0
        for k in close_keys:
            v = safe_float(item.get(k,0))
            if v > 0: close = v; break
        if close <= 0: continue
        seen.add(sid)
        vol = 0
        for k in vol_keys:
            v = safe_int(item.get(k,0))
            if v > 0: vol = v; break
        change = 0.0
        for k in chg_keys:
            v = safe_float(item.get(k,0))
            if v != 0: change = v; break
        prev = close - change
        chg_pct = round(change / prev * 100, 2) if prev > 0 else 0.0
        pe_item = tpex_pe.get(sid, {})
        pe  = safe_float(pe_item.get("PEratio",0))
        yld = safe_float(pe_item.get("DividendYield",0))
        pbr = safe_float(pe_item.get("PBratio",0))
        sc = score_stock(vol, pe or None, yld or None, pbr or None)
        stocks.append({
            "stock_id": sid,
            "stock_name": str(item.get("CompanyName", item.get("股票名稱",""))).strip(),
            "sector": infer_sector(sid),
            "close": round(close, 2),
            "change_pct": chg_pct,
            "volume": vol,
            "pe": round(pe,2) if pe > 0 else None,
            "yield_pct": round(yld,2) if yld > 0 else None,
            "pbr": round(pbr,2) if pbr > 0 else None,
            **sc
        })

    stocks.sort(key=lambda x: x["total_score"], reverse=True)
    print(f"合計 {len(stocks)} 檔有效個股")

    out = {
        "scan_date": today,
        "scanned_count": len(stocks),
        "all_stock_scores": stocks
    }

    out_path = os.environ.get("OUTPUT_PATH", "public/data/all_scores.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(f"輸出: {out_path} ({os.path.getsize(out_path)/1024:.1f} KB)")

if __name__ == "__main__":
    main()
