#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全域掃描腳本：scan_all_stocks.py

優先從 TWSE + TPEx OpenAPI 取得全市場個股資料；
若 API 無資料（非交易日），自動 fallback 讀取 scan_result.json。
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

OUTPUT_PATH = os.environ.get("OUTPUT_PATH", "public/data/all_scores.json")
SCAN_RESULT_PATH = os.environ.get("SCAN_RESULT_PATH", "public/data/scan_result.json")


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
    score = 50  # 基礎分
    # 成交量評分 (0-20)
    if volume > 10000: score += 20
    elif volume > 5000: score += 15
    elif volume > 1000: score += 10
    elif volume > 100: score += 5
    # 殖利率評分 (0-20)
    if yield_pct > 6: score += 20
    elif yield_pct > 4: score += 15
    elif yield_pct > 2: score += 10
    elif yield_pct > 0: score += 5
    # PE評分 (0-10)
    if 0 < pe < 15: score += 10
    elif 15 <= pe < 25: score += 7
    elif 25 <= pe < 40: score += 3
    # PBR評分 (0-10)
    if 0 < pbr < 1.5: score += 10
    elif 1.5 <= pbr < 3: score += 5
    return min(100, score)


def recommendation_from_score(score):
    if score >= 80: return "★★★ Strong Recommend"
    if score >= 70: return "★★ Recommend"
    if score >= 60: return "★ Watch"
    return "觀望"


def fetch_from_twse():
    """從 TWSE + TPEx API 取得資料，回傳 (twse_list, tpex_list)"""
    print("[TWSE] 取得上市股票日成交資料...")
    twse_day = http_get(URL_STOCK_DAY_ALL)
    print(f"  TWSE 日成交: {len(twse_day)} 筆")

    print("[TWSE] 取得本益比資料...")
    twse_pe = http_get(URL_BWIBBU_ALL)
    twse_pe_map = {r.get("Code", ""): r for r in twse_pe}
    print(f"  TWSE PE: {len(twse_pe)} 筆")

    print("[TPEx] 取得上櫃收盤資料...")
    tpex_close = http_get(URL_TPEX_CLOSE)
    print(f"  TPEx 收盤: {len(tpex_close)} 筆")

    print("[TPEx] 取得上櫃本益比資料...")
    tpex_pe = http_get(URL_TPEX_PE)
    tpex_pe_map = {r.get("SecuritiesCompanyCode", ""): r for r in tpex_pe}
    print(f"  TPEx PE: {len(tpex_pe)} 筆")

    return twse_day, twse_pe_map, tpex_close, tpex_pe_map


def build_from_api(twse_day, twse_pe_map, tpex_close, tpex_pe_map):
    """從 API 資料建立 all_stock_scores 列表"""
    stocks = []

    # 處理上市股票
    for row in twse_day:
        sid = row.get("Code", row.get("股票代號", "")).strip()
        name = row.get("Name", row.get("股票名稱", "")).strip()
        if not sid or not name:
            continue
        # 過濾非一般股票 (ETF/權證/特別股)
        if len(sid) > 5 or not sid.isdigit():
            continue
        close_str = row.get("ClosingPrice", row.get("收盤價", "0"))
        close = safe_float(close_str)
        if close <= 0:
            continue
        vol = safe_int(row.get("TradeVolume", row.get("成交股數", "0"))) // 1000
        pe_row = twse_pe_map.get(sid, {})
        pe = safe_float(pe_row.get("PEratio", pe_row.get("本益比", "0")))
        yield_pct = safe_float(pe_row.get("DividendYield", pe_row.get("殖利率(%)", "0")))
        pbr = safe_float(pe_row.get("PBratio", pe_row.get("股價淨值比", "0")))
        sector = infer_sector(sid)
        total_score = score_stock(vol, pe, yield_pct, pbr)
        stocks.append({
            "stock_id": sid,
            "stock_name": name,
            "close": close,
            "sector": sector,
            "total_score": total_score,
            "recommendation": recommendation_from_score(total_score),
            "volume": vol,
            "pe": pe,
            "yield_pct": yield_pct,
            "pbr": pbr,
            "reason": f"{sector}類股，收盤{close}元，評分{total_score}分"
        })

    # 處理上櫃股票
    for row in tpex_close:
        sid = row.get("SecuritiesCompanyCode", row.get("代號", "")).strip()
        name = row.get("CompanyName", row.get("名稱", "")).strip()
        if not sid or not name:
            continue
        if len(sid) > 5 or not sid.isdigit():
            continue
        close = safe_float(row.get("ClosingPrice", row.get("收盤", "0")))
        if close <= 0:
            continue
        vol = safe_int(row.get("TradingShares", row.get("成交股數", "0"))) // 1000
        pe_row = tpex_pe_map.get(sid, {})
        pe = safe_float(pe_row.get("PriceEarningRatio", pe_row.get("本益比", "0")))
        yield_pct = safe_float(pe_row.get("DividendYield", pe_row.get("殖利率", "0")))
        pbr = safe_float(pe_row.get("PriceBookRatio", pe_row.get("股價淨值比", "0")))
        sector = infer_sector(sid)
        total_score = score_stock(vol, pe, yield_pct, pbr)
        stocks.append({
            "stock_id": sid,
            "stock_name": name,
            "close": close,
            "sector": sector,
            "total_score": total_score,
            "recommendation": recommendation_from_score(total_score),
            "volume": vol,
            "pe": pe,
            "yield_pct": yield_pct,
            "pbr": pbr,
            "reason": f"{sector}類股，收盤{close}元，評分{total_score}分"
        })

    return stocks


def build_from_scan_result(scan_result_path):
    """從 scan_result.json fallback 建立 all_stock_scores"""
    print(f"[Fallback] 讀取 {scan_result_path}...")
    if not os.path.exists(scan_result_path):
        print(f"  [錯誤] 找不到 {scan_result_path}")
        return []

    with open(scan_result_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # scan_result.json 可能是 list 或 {all_stock_scores: [...]}
    if isinstance(data, list):
        raw_stocks = data
    elif isinstance(data, dict):
        raw_stocks = data.get("all_stock_scores", data.get("stocks", []))
    else:
        return []

    print(f"  原始資料: {len(raw_stocks)} 筆")
    stocks = []
    for s in raw_stocks:
        sid = str(s.get("stock_id", "")).strip()
        name = str(s.get("stock_name", s.get("name", ""))).strip()
        if not sid or not name:
            continue
        # 確保有 sector
        sector = s.get("sector") or infer_sector(sid)
        close = safe_float(s.get("close", s.get("price", 0)))
        total_score = safe_int(s.get("total_score", s.get("score", 50)))
        stocks.append({
            "stock_id": sid,
            "stock_name": name,
            "close": close,
            "sector": sector,
            "total_score": total_score,
            "recommendation": s.get("recommendation") or recommendation_from_score(total_score),
            "volume": safe_int(s.get("volume", 0)),
            "pe": safe_float(s.get("pe", 0)),
            "yield_pct": safe_float(s.get("yield_pct", s.get("dividend_yield", 0))),
            "pbr": safe_float(s.get("pbr", 0)),
            "reason": s.get("reason", f"{sector}類股，評分{total_score}分")
        })
    return stocks


def main():
    now_tw = datetime.now(_TW_TZ)
    scan_date = now_tw.strftime("%Y%m%d")
    print(f"=== 全域掃描開始: {now_tw.strftime('%Y-%m-%d %H:%M CST')} ===")

    # Step 1: 嘗試 TWSE/TPEx API
    stocks = []
    try:
        twse_day, twse_pe_map, tpex_close, tpex_pe_map = fetch_from_twse()
        total_api = len(twse_day) + len(tpex_close)
        print(f"API 總資料: {total_api} 筆")
        if total_api > 100:  # 有足夠資料才用 API
            stocks = build_from_api(twse_day, twse_pe_map, tpex_close, tpex_pe_map)
            print(f"[API] 有效個股: {len(stocks)} 筆")
    except Exception as e:
        print(f"[API Error] {e}")

    # Step 2: Fallback — 讀取 scan_result.json
    if len(stocks) < 100:
        print(f"[Fallback] API 資料不足 ({len(stocks)} 筆)，改用 scan_result.json")
        stocks = build_from_scan_result(SCAN_RESULT_PATH)
        print(f"[Fallback] 取得 {len(stocks)} 筆")
        if stocks:
            # 使用最近交易日日期
            scan_date = "fallback_" + scan_date

    if not stocks:
        print("[錯誤] 無法取得任何股票資料，結束")
        sys.exit(1)

    # 按 total_score 排序（高分在前）
    stocks.sort(key=lambda x: x.get("total_score", 0), reverse=True)

    # 建立輸出格式（包裝格式，相容前端 allScoresFetcher）
    output = {
        "scan_date": scan_date,
        "scanned_count": len(stocks),
        "all_stock_scores": stocks
    }

    # 確保輸出目錄存在
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(',', ':'))

    print(f"=== 完成: {len(stocks)} 筆寫入 {OUTPUT_PATH} ===")

    # 族群統計
    sectors = {}
    for s in stocks:
        sec = s.get("sector", "其他")
        sectors[sec] = sectors.get(sec, 0) + 1
    top5 = sorted(sectors.items(), key=lambda x: -x[1])[:5]
    print("族群分布 Top5:", top5)


if __name__ == "__main__":
    main()
