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
    if 0 < pbr < 1.5: score += 10
    elif 1.5 <= pbr < 3: score += 5
    return min(score, 100)


def fetch_pages_fallback():
    """從 GitHub Pages 抓取已部署的 all_scores.json 作為 fallback。
    成功回傳 dict，失敗回傳 None。
    """
    print(f"[Fallback] 嘗試從 GitHub Pages 抓取: {PAGES_ALL_SCORES_URL}")
    try:
        r = requests.get(PAGES_ALL_SCORES_URL, timeout=30)
        r.raise_for_status()
        data = r.json()
        if isinstance(data, dict) and data.get("stocks"):
            print(f"[Fallback] 成功取得 {len(data['stocks'])} 筆資料")
            return data
        print("[Fallback] Pages 回傳資料格式不符")
        return None
    except Exception as e:
        print(f"[Fallback] Pages 抓取失敗: {e}")
        return None


def build_stock_list():
    """從 TWSE + TPEx API 建立個股清單，回傳 list[dict]。"""
    print("[步驟1] 取得 TWSE 收盤資料...")
    twse_day = http_get(URL_STOCK_DAY_ALL)
    print(f"  TWSE 收盤: {len(twse_day)} 筆")

    print("[步驟2] 取得 TWSE PE/PBR/殖利率...")
    twse_pe = http_get(URL_BWIBBU_ALL)
    print(f"  TWSE PE: {len(twse_pe)} 筆")

    print("[步驟3] 取得 TPEx 收盤資料...")
    tpex_day = http_get(URL_TPEX_CLOSE)
    print(f"  TPEx 收盤: {len(tpex_day)} 筆")

    print("[步驟4] 取得 TPEx PE/PBR...")
    tpex_pe = http_get(URL_TPEX_PE)
    print(f"  TPEx PE: {len(tpex_pe)} 筆")

    total_api = len(twse_day) + len(tpex_day)
    if total_api == 0:
        print("[警告] 所有 API 均無資料（非交易日或 API 故障）")
        return []

    # --- 建立 PE/PBR lookup ---
    pe_map = {}
    for row in twse_pe:
        sid = str(row.get("Code", row.get("股票代號", ""))).strip()
        if sid:
            pe_map[sid] = {
                "pe": safe_float(row.get("PEratio", row.get("本益比", 0))),
                "pbr": safe_float(row.get("PBratio", row.get("股價淨值比", 0))),
                "yield_pct": safe_float(row.get("DividendYield", row.get("殖利率", 0))),
            }
    for row in tpex_pe:
        sid = str(row.get("SecuritiesCompanyCode", row.get("股票代號", ""))).strip()
        if sid:
            pe_map[sid] = {
                "pe": safe_float(row.get("PeRatio", row.get("本益比", 0))),
                "pbr": safe_float(row.get("PbRatio", row.get("股價淨值比", 0))),
                "yield_pct": safe_float(row.get("DividendYield", row.get("殖利率", 0))),
            }

    stocks = []

    # --- TWSE ---
    for row in twse_day:
        sid = str(row.get("Code", "")).strip()
        name = str(row.get("Name", "")).strip()
        if not sid or not sid[:4].isdigit():
            continue
        close = safe_float(row.get("ClosingPrice", 0))
        volume = safe_int(row.get("TradeVolume", 0)) // 1000
        pe_info = pe_map.get(sid, {"pe": 0, "pbr": 0, "yield_pct": 0})
        score = score_stock(volume, pe_info["pe"], pe_info["yield_pct"], pe_info["pbr"])
        stocks.append({
            "id": sid,
            "name": name,
            "price": close,
            "volume": volume,
            "pe": pe_info["pe"],
            "pbr": pe_info["pbr"],
            "yield_pct": pe_info["yield_pct"],
            "score": score,
            "sector": infer_sector(sid),
            "market": "TWSE",
        })

    # --- TPEx ---
    for row in tpex_day:
        sid = str(row.get("SecuritiesCompanyCode", row.get("股票代號", ""))).strip()
        name = str(row.get("CompanyName", row.get("公司名稱", ""))).strip()
        if not sid or not sid[:4].isdigit():
            continue
        close = safe_float(row.get("Close", row.get("收盤價", 0)))
        volume = safe_int(row.get("TradeVolume", row.get("成交股數", 0))) // 1000
        pe_info = pe_map.get(sid, {"pe": 0, "pbr": 0, "yield_pct": 0})
        score = score_stock(volume, pe_info["pe"], pe_info["yield_pct"], pe_info["pbr"])
        stocks.append({
            "id": sid,
            "name": name,
            "price": close,
            "volume": volume,
            "pe": pe_info["pe"],
            "pbr": pe_info["pbr"],
            "yield_pct": pe_info["yield_pct"],
            "score": score,
            "sector": infer_sector(sid),
            "market": "TPEx",
        })

    return stocks


def main():
    now_tw = datetime.now(_TW_TZ)
    print(f"[開始] 台灣時間: {now_tw.strftime('%Y-%m-%d %H:%M:%S')}")

    # --- 主路徑：從 API 取得資料 ---
    stocks = build_stock_list()

    if not stocks:
        # --- Fallback：從 GitHub Pages 抓取已部署資料 ---
        print("[Fallback] API 無資料，嘗試從 GitHub Pages 取得現有資料...")
        pages_data = fetch_pages_fallback()
        if pages_data:
            # 更新 generated_at 時間戳，但保留原始個股資料
            pages_data["generated_at"] = now_tw.strftime("%Y-%m-%dT%H:%M:%S+08:00")
            pages_data["note"] = "非交易日：資料來源為上次交易日已部署資料"
            os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
            with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
                json.dump(pages_data, f, ensure_ascii=False, separators=(',', ':'))
            count = len(pages_data.get("stocks", []))
            print(f"[完成] Fallback 資料已寫入 {OUTPUT_PATH}，共 {count} 筆")
            sys.exit(0)
        else:
            print("[略過] 非交易日且無法取得 fallback 資料，不更新 all_scores.json")
            sys.exit(0)  # exit(0) 讓 workflow 成功，不失敗

    # --- 正常交易日：寫出結果 ---
    output = {
        "generated_at": now_tw.strftime("%Y-%m-%dT%H:%M:%S+08:00"),
        "count": len(stocks),
        "stocks": sorted(stocks, key=lambda x: x["score"], reverse=True),
    }
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(',', ':'))
    print(f"[完成] 掃描結果已寫入 {OUTPUT_PATH}，共 {len(stocks)} 筆")
    sys.exit(0)


if __name__ == "__main__":
    main()
