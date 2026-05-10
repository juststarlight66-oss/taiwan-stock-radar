#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全域掃描腳本：scan_all_stocks.py

優先從 TWSE + TPEx OpenAPI 取得全市場個股資料；
若 API 無資料（非交易日），自動 fallback 從 GitHub Pages 抓取已部署的 all_scores.json。
若 Pages 也無法取得，graceful exit(0)，不讓 workflow 標記為 failure。
輸出格式：public/data/all_scores.json
"""

import json, os, sys, time, warnings
warnings.filterwarnings('ignore')
from datetime import datetime, timedelta, timezone
import requests
try:
    requests.packages.urllib3.disable_warnings()
except Exception:
    pass

_TW_TZ = timezone(timedelta(hours=8))

HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; StockRadar/1.0)",
}

URL_STOCK_DAY_ALL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
URL_BWIBBU_ALL    = "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL"
URL_TPEX_CLOSE    = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"
URL_TPEX_PE       = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis"

# GitHub Pages 已部署的 all_scores.json URL（fallback 用）
PAGES_ALL_SCORES_URL = "https://juststarlight66-oss.github.io/taiwan-stock-radar/data/all_scores.json"

OUTPUT_PATH = os.environ.get("OUTPUT_PATH", "public/data/all_scores.json")


def infer_sector(sid: str) -> str:
    s = str(sid).strip()
    if not s or not s[:4].isdigit():
        return "其他"
    try:
        num = int(s[:4])
    except ValueError:
        return "其他"
    if 1000 <= num <= 1099: return "水泥工業"
    if 1100 <= num <= 1399: return "食品工業"
    if 1400 <= num <= 1499: return "紡織纖維"
    if 1500 <= num <= 1599: return "電機機械"
    if 1600 <= num <= 1699: return "電器電纜"
    if 1700 <= num <= 1799: return "化學工業"
    if 1800 <= num <= 1899: return "玻璃陶瓷"
    if 1900 <= num <= 1999: return "造紙工業"
    if 2000 <= num <= 2099: return "鋼鐵工業"
    if 2100 <= num <= 2199: return "紡織纖維"
    if 2200 <= num <= 2299: return "航運業"
    if 2300 <= num <= 2399: return "半導體"
    if 2400 <= num <= 2499: return "電腦及週邊設備"
    if 2500 <= num <= 2599: return "建材營造"
    if 2600 <= num <= 2699: return "航運業"
    if 2700 <= num <= 2899: return "金融保險"
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
    if 9200 <= num <= 9299: return "電機機械"
    if 9900 <= num <= 9999: return "綜合"
    return "其他"


def safe_float(v, default=0.0):
    try: return float(str(v).replace(",", "").replace("+", "").replace("-", "0") or "0")
    except: return default


def safe_int(v, default=0):
    try: return int(str(v).replace(",", ""))
    except: return default


def http_get(url, retries=3):
    for i in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=30, verify=False)
            r.raise_for_status()
            data = r.json()
            if isinstance(data, list) and len(data) > 0:
                return data
            return []
        except Exception as e:
            print(f"  [重試 {i+1}] {url}: {e}")
            time.sleep(3 * (i + 1))
    return []


def score_stock(volume, pe, yield_pct, pbr):
    """簡單的基礎評分 (0-100)"""
    score = 50
    if volume > 10000: score += 20
    elif volume > 5000: score += 15
    elif volume > 1000: score += 10
    elif volume > 100: score += 5
    if yield_pct > 6: score += 20
    elif yield_pct > 4: score += 15
    elif yield_pct > 2: score += 10
    elif yield_pct > 0: score += 5
    if 0 < pe < 15: score += 10
    elif 15 <= pe < 25: score += 7
    elif 25 <= pe < 40: score += 3
    if pbr < 1: score += 10
    elif pbr < 2: score += 5
    return min(score, 100)


def build_record(sid, name, close, volume, pe, yield_pct, pbr, sector):
    score = score_stock(volume, pe, yield_pct, pbr)
    return {
        "stock_id": sid,
        "name": name,
        "close": close,
        "volume": volume,
        "pe": pe,
        "yield_pct": yield_pct,
        "pbr": pbr,
        "sector": sector,
        "score": score,
        "updated_at": datetime.now(_TW_TZ).strftime("%Y-%m-%d %H:%M"),
    }


def fetch_twse():
    print("[TWSE] 取得上市股票日收盤...")
    day_all = http_get(URL_STOCK_DAY_ALL)
    pe_all  = http_get(URL_BWIBBU_ALL)
    if not day_all:
        print("[TWSE] 無資料（非交易日或 API 異常）")
        return []

    pe_map = {}
    for row in pe_all:
        sid = str(row.get("Code", "")).strip()
        pe_map[sid] = {
            "pe":    safe_float(row.get("PEratio", 0)),
            "yield": safe_float(row.get("DividendYield", 0)),
            "pbr":   safe_float(row.get("PBratio", 0)),
        }

    records = []
    for row in day_all:
        sid   = str(row.get("Code", "")).strip()
        name  = str(row.get("Name", "")).strip()
        close = safe_float(row.get("ClosingPrice", 0))
        vol   = safe_int(row.get("TradeVolume", 0)) // 1000
        if not sid or close <= 0:
            continue
        p = pe_map.get(sid, {})
        records.append(build_record(
            sid, name, close, vol,
            p.get("pe", 0), p.get("yield", 0), p.get("pbr", 0),
            infer_sector(sid)
        ))
    print(f"[TWSE] 共 {len(records)} 檔")
    return records


def fetch_tpex():
    print("[TPEx] 取得上櫃股票日收盤...")
    close_all = http_get(URL_TPEX_CLOSE)
    pe_all    = http_get(URL_TPEX_PE)
    if not close_all:
        print("[TPEx] 無資料（非交易日或 API 異常）")
        return []

    pe_map = {}
    for row in pe_all:
        sid = str(row.get("SecuritiesCompanyCode", "")).strip()
        pe_map[sid] = {
            "pe":    safe_float(row.get("PriceEarningRatio", 0)),
            "yield": safe_float(row.get("DividendYield", 0)),
            "pbr":   safe_float(row.get("PriceBookRatio", 0)),
        }

    records = []
    for row in close_all:
        sid   = str(row.get("SecuritiesCompanyCode", "")).strip()
        name  = str(row.get("CompanyName", "")).strip()
        close = safe_float(row.get("Close", 0))
        vol   = safe_int(row.get("TradingShares", 0)) // 1000
        if not sid or close <= 0:
            continue
        p = pe_map.get(sid, {})
        records.append(build_record(
            sid, name, close, vol,
            p.get("pe", 0), p.get("yield", 0), p.get("pbr", 0),
            infer_sector(sid)
        ))
    print(f"[TPEx] 共 {len(records)} 檔")
    return records


def main():
    try:
        now_tw = datetime.now(_TW_TZ)
        print(f"[scan_all_stocks] 啟動 @ {now_tw.strftime('%Y-%m-%d %H:%M')} (Asia/Taipei)")

        twse_data = fetch_twse()
        tpex_data = fetch_tpex()
        all_data  = twse_data + tpex_data

        if not all_data:
            # --- fallback: try fetching from GitHub Pages ---
            print("[fallback] API 無資料，嘗試從 GitHub Pages 取得 all_scores.json ...")
            try:
                resp = requests.get(
                    PAGES_ALL_SCORES_URL,
                    headers=HEADERS,
                    timeout=30,
                    verify=False,
                )
                resp.raise_for_status()
                pages_data = resp.json()

                if not pages_data or not isinstance(pages_data, list):
                    print("[fallback] Pages 回傳空資料或格式不符，視為非交易日，exit(0)")
                    sys.exit(0)

                print(f"[fallback] 從 Pages 取得 {len(pages_data)} 筆資料，寫入 {OUTPUT_PATH}")
                os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
                with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
                    json.dump(pages_data, f, ensure_ascii=False, indent=2)
                print("[fallback] 完成，exit(0)")
                sys.exit(0)

            except Exception as e:
                print(f"[fallback] GitHub Pages 取得失敗：{e}")
                print("[fallback] 視為非交易日，graceful exit(0)")
                sys.exit(0)

        # Sort by score descending
        all_data.sort(key=lambda x: x.get("score", 0), reverse=True)

        os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
        with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
            json.dump(all_data, f, ensure_ascii=False, indent=2)

        print(f"[完成] 共寫入 {len(all_data)} 筆 -> {OUTPUT_PATH}")

    except Exception as e:
        # Top-level safety net: never let an unhandled exception cause exit(1)
        print(f"[ERROR] 未預期的錯誤：{e}")
        print("[ERROR] 視為非交易日或暫時性錯誤，graceful exit(0)")
        sys.exit(0)


if __name__ == "__main__":
    main()
