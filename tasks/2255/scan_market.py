#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台股五維分析掃描腳本 - 22:55 收盤報告核心引擎
版本：v7.0 (TWSE OpenAPI 重構版)
優化項目：
  - 移除 yfinance，改用 openapi.twse.com.tw (WAF 白名單，sandbox 可存取)
  - STOCK_DAY_ALL 單次 HTTP 呼叫取得全部 ~1,082 檔股票當日 OHLCV
  - BWIBBU_ALL 單次 HTTP 呼叫取得全部股票 PE/PBR/殖利率（基本面分析真實數據）
  - 日線快取系統：每日資料追加至 .cache/daily_ohlcv.json，累積 90 天歷史
  - 首次執行（快取空白）：以今日單日資料做簡化評分，技術面函式已處理 < 20 日情形

五維分析框架：
  技術面 (40%)：均線糾結、爆量突破、創高、RSI 超賣/超買、量價關係
  籌碼面 (25%)：融資變化、法人買賣超、主力進出軌跡
  基本面 (15%)：本益比、殖利率、股價淨值比（BWIBBU_ALL 真實數據）
  消息面 (10%)：產業新聞熱度、地緣政治風險、美股連動
  情緒面 (10%)：周轉率、成交量比、散戶參與度

ML 爆漲股預測（RandomForestClassifier）：
  特徵工程：RSI、量比、動能、波動率、均線乖離率、連續漲跌天數、周轉率
  目標：預測隔日漲停（+9.5% 以上）機率 Top 5

輸出：五維綜合評分 Top 10 標的 + 爆漲預測 Top 5
"""

import json, os, sys, time, warnings
warnings.filterwarnings('ignore')
from datetime import datetime, timedelta, date
from typing import Dict, List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
requests.packages.urllib3.disable_warnings()

# ── 個股回測引擎 ──
import sys as _bt_sys
_bt_sys.path.insert(0, '/home/sprite/tasks')
try:
    from shared.per_stock_backtest import run_backtest as _run_per_stock_backtest
    _BACKTEST_AVAILABLE = True
except ImportError:
    _BACKTEST_AVAILABLE = False
    def _run_per_stock_backtest(stock_id, strategy='all', days=60): return {}

try:
    import pandas as pd
    import numpy as np
except ImportError:
    import subprocess
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'pandas', 'numpy', '-q'])
    import pandas as pd
    import numpy as np

try:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.preprocessing import StandardScaler
except ImportError:
    import subprocess
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'scikit-learn', '-q'])
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.preprocessing import StandardScaler

# ================================================================
# 快取設定
# ================================================================
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache')
STOCK_LIST_CACHE = os.path.join(CACHE_DIR, 'stock_list.json')
DAILY_OHLCV_CACHE = os.path.join(CACHE_DIR, 'daily_ohlcv.json')
CACHE_TTL_HOURS = 24        # 股票清單快取 24 小時
MAX_CACHE_DAYS  = 90        # 保留最近 90 個交易日

os.makedirs(CACHE_DIR, exist_ok=True)

# ================================================================
# TWSE OpenAPI 端點（openapi.twse.com.tw — sandbox WAF 白名單可用）
# ================================================================
TWSE_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Nebula/1.0",
}
URL_STOCK_DAY_ALL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
URL_BWIBBU_ALL    = "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL"
URL_MI_5MINS_HIST = "https://openapi.twse.com.tw/v1/indicesReport/MI_5MINS_HIST"


# ================================================================
# 每日 OHLCV 快取系統
# ================================================================

def load_daily_ohlcv_cache() -> Dict:
    """讀取本地日線快取，格式：{ 'YYYYMMDD': { stock_id: {ohlcv dict} } }"""
    if not os.path.exists(DAILY_OHLCV_CACHE):
        return {}
    try:
        with open(DAILY_OHLCV_CACHE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"[快取] 讀取日線快取失敗：{e}，重建")
        return {}


def save_daily_ohlcv_cache(cache: Dict):
    """將日線快取寫回磁碟，僅保留最近 MAX_CACHE_DAYS 天"""
    try:
        # 只保留最近 N 天
        sorted_dates = sorted(cache.keys())
        if len(sorted_dates) > MAX_CACHE_DAYS:
            for old_date in sorted_dates[:-MAX_CACHE_DAYS]:
                del cache[old_date]
        with open(DAILY_OHLCV_CACHE, 'w', encoding='utf-8') as f:
            json.dump(cache, f, ensure_ascii=False)
        print(f"[快取] 日線快取已更新，共 {len(cache)} 個交易日")
    except Exception as e:
        print(f"[快取] 儲存日線快取失敗：{e}")


def fetch_stock_day_all() -> Dict[str, Dict]:
    """
    從 www.twse.com.tw/exchangeReport/STOCK_DAY_ALL 取得當日所有股票的 OHLCV。
    使用 www.twse.com.tw（非 openapi），可在收盤後立即取得當日數據（不需等到隔日早上）。
    欄位順序：[0]證券代號 [1]證券名稱 [2]成交股數 [3]成交金額
              [4]開盤價 [5]最高價 [6]最低價 [7]收盤價 [8]漲跌價差 [9]成交筆數
    回傳格式：{ stock_id: {date, open, high, low, close, volume, change, change_pct, name} }
    """
    today = datetime.now().strftime('%Y%m%d')
    url = f"https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=json&date={today}"
    print(f"[API] 呼叫 STOCK_DAY_ALL (www, {today})...")
    try:
        r = requests.get(url, headers=TWSE_HEADERS, timeout=30, verify=False)
        r.raise_for_status()
        resp = r.json()
    except Exception as e:
        print(f"[API] STOCK_DAY_ALL 失敗：{e}")
        return {}

    if resp.get('stat') != 'OK':
        print(f"[API] STOCK_DAY_ALL stat={resp.get('stat')}，可能為非交易日")
        return {}

    rows = resp.get('data', [])
    ad_date = str(resp.get('date', today))  # API returns YYYYMMDD directly

    result = {}
    for row in rows:
        try:
            code = str(row[0]).strip()
            # 只保留 4 位數字（正股，排除 ETF/債券/權證）
            if not (len(code) == 4 and code.isdigit()):
                continue

            def clean(v):
                return str(v).replace(',', '').replace('+', '').strip()

            close_str = clean(row[7])
            open_str  = clean(row[4])
            high_str  = clean(row[5])
            low_str   = clean(row[6])
            vol_str   = clean(row[2])
            chg_str   = clean(row[8])
            name      = str(row[1]).strip()

            if not close_str or close_str in ('--', '0', ''):
                continue
            close = float(close_str)
            if close <= 0:
                continue

            open_p = float(open_str) if open_str  not in ('--', '', '0') else close
            high_p = float(high_str) if high_str  not in ('--', '', '0') else close
            low_p  = float(low_str)  if low_str   not in ('--', '', '0') else close
            volume = int(vol_str.replace(',', '')) if vol_str.replace(',', '').isdigit() else 0
            change = float(chg_str)  if chg_str   not in ('--', '', 'X', '0') else 0.0

            prev_close = close - change
            change_pct = round(change / prev_close * 100, 2) if prev_close > 0 else 0.0

            result[code] = {
                'date':       ad_date,
                'open':       open_p,
                'high':       high_p,
                'low':        low_p,
                'close':      close,
                'volume':     volume,
                'change':     change,
                'change_pct': change_pct,
                'name':       name,
            }
        except Exception:
            continue

    print(f"[API] STOCK_DAY_ALL 解析完成：{len(result)} 檔 (日期={ad_date})")
    return result


def fetch_tpex_day_all() -> Dict[str, Dict]:
    """
    從 TPEx OpenAPI 取得上櫃股票當日 OHLCV。
    API: https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes
    補充 fetch_stock_day_all() 的上市資料，合併後覆蓋 ~3100 檔。
    回傳格式與 fetch_stock_day_all() 相同：
    { stock_id: {date, open, high, low, close, volume, change, change_pct, name} }
    """
    today = datetime.now().strftime('%Y%m%d')
    url = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes'
    print('[API] 呼叫 TPEx tpex_mainboard_quotes...')
    try:
        r = requests.get(url, headers=TWSE_HEADERS, timeout=30, verify=False)
        r.raise_for_status()
        rows = r.json()
    except Exception as e:
        print(f'[API] TPEx OHLCV 失敗：{e}')
        return {}

    if not isinstance(rows, list) or not rows:
        print('[API] TPEx OHLCV 無資料（可能為非交易日）')
        return {}

    result = {}
    for row in rows:
        try:
            code = str(row.get('SecuritiesCompanyCode', '') or row.get('Code', '')).strip()
            if not (len(code) == 4 and code.isdigit()):
                continue

            def clean_tpex(v):
                return str(v or '').replace(',', '').replace('+', '').strip()

            close_str  = clean_tpex(row.get('Close', row.get('ClosingPrice', '')))
            open_str   = clean_tpex(row.get('Open',  row.get('OpeningPrice', '')))
            high_str   = clean_tpex(row.get('High',  row.get('HighestPrice', '')))
            low_str    = clean_tpex(row.get('Low',   row.get('LowestPrice',  '')))
            vol_str    = clean_tpex(row.get('TradingShares', row.get('TradeVolume', row.get('Volume', ''))))
            chg_str    = clean_tpex(row.get('Change', ''))
            name       = str(row.get('CompanyName', row.get('Name', code))).strip()

            if not close_str or close_str in ('--', '0', '', 'N/A'):
                continue
            close = float(close_str)
            if close <= 0:
                continue

            open_p = float(open_str)  if open_str  not in ('--', '', '0', 'N/A') else close
            high_p = float(high_str)  if high_str  not in ('--', '', '0', 'N/A') else close
            low_p  = float(low_str)   if low_str   not in ('--', '', '0', 'N/A') else close
            vol_clean = vol_str.replace(',', '')
            volume = int(float(vol_clean)) if vol_clean and vol_clean.replace('.','').isdigit() else 0
            change = float(chg_str)   if chg_str   not in ('--', '', 'X', '0', 'N/A') else 0.0

            prev_close = close - change
            change_pct = round(change / prev_close * 100, 2) if prev_close > 0 else 0.0

            result[code] = {
                'date':       today,
                'open':       open_p,
                'high':       high_p,
                'low':        low_p,
                'close':      close,
                'volume':     volume,
                'change':     change,
                'change_pct': change_pct,
                'name':       name,
            }
        except Exception:
            continue

    print(f'[API] TPEx OHLCV 解析完成：{len(result)} 檔')
    return result


def fetch_bwibbu_all() -> Dict[str, Dict]:
    """
    從 BWIBBU_ALL 取得所有股票的 PE/PBR/殖利率。
    回傳格式：{ stock_id: {PEratio, DividendYield, PBratio} }
    """
    print("[API] 呼叫 BWIBBU_ALL...")
    try:
        r = requests.get(URL_BWIBBU_ALL, headers=TWSE_HEADERS, timeout=30, verify=False)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"[API] BWIBBU_ALL 失敗：{e}")
        return {}

    result = {}
    for item in data:
        code = item.get('Code', '').strip()
        if not (len(code) == 4 and code.isdigit()):
            continue
        try:
            pe_str  = str(item.get('PEratio',      '') or '').replace(',', '').strip()
            dy_str  = str(item.get('DividendYield', '') or '').replace(',', '').strip()
            pb_str  = str(item.get('PBratio',       '') or '').replace(',', '').strip()
            result[code] = {
                'pe':  float(pe_str)  if pe_str  not in ('--', '', '0') else None,
                'dy':  float(dy_str)  if dy_str  not in ('--', '', '0') else None,
                'pb':  float(pb_str)  if pb_str  not in ('--', '', '0') else None,
            }
        except Exception:
            continue

    print(f"[API] BWIBBU_ALL 解析完成：{len(result)} 檔")
    return result


def fetch_taiex_trend() -> Dict:
    """
    取得加權指數歷史資料（主要：yfinance ^TWII 4個月；備用：TWSE FMTQIK當月）
    計算 MA20/MA60 並判斷大盤趨勢。
    回傳格式：{
        'trend': 'strongly_bullish'|'bullish'|'neutral'|'bearish'|'strongly_bearish',
        'trend_label': '強多頭'|'多頭'|'中性'|'空頭'|'強空頭',
        'taiex_close': float,
        'ma20': float,
        'ma60': float,
        'ma20_bias_pct': float,
        'ma60_bias_pct': float,
        'data_points': int,
        'source': str,
    }
    """
    closes = []
    source = 'unknown'

    # ── 主要來源：yfinance ^TWII（4個月，約 80 個交易日）──────────────
    try:
        import yfinance as yf
        import warnings as _w
        _w.filterwarnings('ignore')
        twii = yf.Ticker('^TWII')
        hist = twii.history(period='4mo')
        if not hist.empty and len(hist) >= 5:
            closes = hist['Close'].tolist()
            source = f'yfinance({len(closes)}d)'
            print(f"[TAIEX] yfinance ^TWII 取得 {len(closes)} 個交易日")
    except Exception as e:
        print(f"[TAIEX] yfinance 失敗：{e}，嘗試 TWSE FMTQIK 備用")

    # ── 備用來源：TWSE FMTQIK（當月，約 19 個交易日）───────────────────
    if not closes:
        try:
            r = requests.get(
                "https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK",
                headers=TWSE_HEADERS, timeout=20, verify=False)
            r.raise_for_status()
            for row in r.json():
                try:
                    v = float(str(row.get('TAIEX', '')).replace(',', '').strip())
                    if v > 0:
                        closes.append(v)
                except Exception:
                    continue
            source = f'FMTQIK({len(closes)}d)'
            print(f"[TAIEX] FMTQIK 備用取得 {len(closes)} 個交易日")
        except Exception as e:
            print(f"[TAIEX] FMTQIK 備用也失敗：{e}")

    if not closes:
        print("[TAIEX] 無有效資料，使用中性預設值")
        return {
            'trend': 'neutral', 'trend_label': '中性(無資料)',
            'taiex_close': 0, 'ma20': 0, 'ma60': 0,
            'ma20_bias_pct': 0, 'ma60_bias_pct': 0,
            'data_points': 0, 'source': 'none',
        }

    n = len(closes)
    taiex_close = closes[-1]
    ma20 = sum(closes[-20:]) / min(n, 20)
    ma60 = sum(closes[-60:]) / min(n, 60)

    ma20_bias = (taiex_close - ma20) / ma20 * 100 if ma20 > 0 else 0
    ma60_bias = (taiex_close - ma60) / ma60 * 100 if ma60 > 0 else 0

    # 判斷趨勢（MA20 vs MA60 排列 + 乖離率）
    if taiex_close > ma20 and taiex_close > ma60 and ma20 > ma60:
        if ma60_bias >= 10:
            trend = 'strongly_bullish'; label = '強多頭'
        else:
            trend = 'bullish';          label = '多頭'
    elif taiex_close < ma20 and taiex_close < ma60 and ma20 < ma60:
        if ma60_bias <= -10:
            trend = 'strongly_bearish'; label = '強空頭'
        else:
            trend = 'bearish';          label = '空頭'
    else:
        trend = 'neutral'; label = '中性'

    print(f"[TAIEX] 收盤:{taiex_close:.0f} MA20:{ma20:.0f}({ma20_bias:+.1f}%) "
          f"MA60:{ma60:.0f}({ma60_bias:+.1f}%) → 趨勢:{label} [{source}]")

    return {
        'trend':         trend,
        'trend_label':   label,
        'taiex_close':   round(taiex_close, 2),
        'ma20':          round(ma20, 2),
        'ma60':          round(ma60, 2),
        'ma20_bias_pct': round(ma20_bias, 2),
        'ma60_bias_pct': round(ma60_bias, 2),
        'data_points':   n,
        'source':        source,
    }


def update_daily_cache(today_data: Dict[str, Dict]) -> Dict:
    """
    將今日 STOCK_DAY_ALL 資料追加到本地快取，回傳更新後的快取 dict。
    """
    cache = load_daily_ohlcv_cache()
    if not today_data:
        print("[快取] 今日資料為空，跳過快取更新")
        return cache

    # 取今日日期 key（YYYYMMDD）
    sample = next(iter(today_data.values()))
    today_key = sample.get('date', datetime.now().strftime('%Y%m%d'))

    if today_key in cache:
        print(f"[快取] 今日 {today_key} 已存在，跳過追加")
    else:
        # 只存 OHLCV，不含 name（name 另從 STOCK_POOL 取）
        cache[today_key] = {
            code: {k: v for k, v in ohlcv.items() if k != 'name'}
            for code, ohlcv in today_data.items()
        }
        save_daily_ohlcv_cache(cache)

    return cache


def build_history_from_cache(cache: Dict, stock_id: str) -> List[Dict]:
    """
    從日線快取組裝單一股票的歷史 OHLCV 列表（時間升序）。
    格式：[{date, open, high, low, close, volume, change, change_pct}, ...]
    """
    rows = []
    for date_key in sorted(cache.keys()):
        day_data = cache[date_key]
        if stock_id in day_data:
            row = dict(day_data[stock_id])
            row['date'] = date_key
            rows.append(row)
    return rows


# ================================================================
# 股票清單快取（沿用原有 ISIN 解析，仍以 STOCK_DAY_ALL codes 補充）
# ================================================================

def load_stock_list_cache() -> Optional[Dict]:
    """讀取股票清單快取（若未過期）"""
    if not os.path.exists(STOCK_LIST_CACHE):
        return None
    try:
        with open(STOCK_LIST_CACHE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        cached_at = datetime.fromisoformat(data.get('cached_at', '2000-01-01'))
        age_hours = (datetime.now() - cached_at).total_seconds() / 3600
        if age_hours < CACHE_TTL_HOURS:
            print(f"[快取] 股票清單快取命中（{age_hours:.1f}h 前），共 {len(data['stocks'])} 檔")
            return data['stocks']
        else:
            print(f"[快取] 股票清單快取已過期（{age_hours:.1f}h），重新下載")
            return None
    except Exception as e:
        print(f"[快取] 讀取失敗：{e}，重新下載")
        return None


def save_stock_list_cache(stocks: Dict):
    """儲存股票清單快取"""
    try:
        data = {'cached_at': datetime.now().isoformat(), 'stocks': stocks}
        with open(STOCK_LIST_CACHE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        print(f"[快取] 股票清單已快取（{len(stocks)} 檔）")
    except Exception as e:
        print(f"[快取] 儲存失敗：{e}")


def get_all_twse_stocks():
    """從 TWSE ISIN 頁面獲取所有上市/上櫃股票清單（SSL verify=False）"""
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        import subprocess
        subprocess.run([sys.executable, '-m', 'pip', 'install', 'beautifulsoup4', '-q'])
        from bs4 import BeautifulSoup

    stocks = {}
    sources = [
        ('上市', 'https://isin.twse.com.tw/isin/C_public.jsp?strMode=2'),
        ('上櫃', 'https://isin.twse.com.tw/isin/C_public.jsp?strMode=4'),
        ('興櫃', 'https://isin.twse.com.tw/isin/C_public.jsp?strMode=8'),
    ]

    for label, url in sources:
        try:
            response = requests.get(url, timeout=30, verify=False)
            response.encoding = 'big5'
            soup = BeautifulSoup(response.text, 'html.parser')
            table = soup.find('table', {'class': 'h4'})
            if not table:
                print(f"    [警告] {label} 找不到表格")
                continue
            count = 0
            for row in table.find_all('tr')[1:]:
                cells = row.find_all('td')
                if len(cells) < 6 or len(cells) > 7:
                    continue
                code_name = cells[0].text.strip()
                if '\u3000' in code_name:
                    code, name = code_name.split('\u3000', 1)
                    if len(code) == 4 and code.isdigit():
                        stocks[code] = name
                        count += 1
            print(f"    [{label}] 解析 {count} 檔")
        except Exception as e:
            print(f"    [警告] 獲取 {label} 失敗：{e}")
            continue

    return stocks


def get_stock_pool(today_ohlcv: Dict[str, Dict] = None) -> Dict[str, str]:
    """
    獲取掃描股票池。
    優先：ISIN 快取 → ISIN 重新下載 → 以 STOCK_DAY_ALL codes 補充（含股名）
    """
    WHITE_LIST = []  # 留空則掃描全台股

    # 嘗試讀取快取
    cached = load_stock_list_cache()
    if cached:
        pool = cached
    else:
        pool = get_all_twse_stocks()
        if pool:
            save_stock_list_cache(pool)

    # 用 STOCK_DAY_ALL + TPEx codes 補充（確保上市+上櫃全涵蓋）
    if today_ohlcv:
        before = len(pool)
        for code, ohlcv in today_ohlcv.items():
            if code not in pool and ohlcv.get('name'):
                pool[code] = ohlcv['name']
        after = len(pool)
        if after > before:
            print(f"[股票池] OHLCV 補充 {after - before} 檔，總計 {after} 檔")

    if WHITE_LIST:
        return {code: pool.get(code, '') for code in WHITE_LIST if code in pool}
    return pool


# 特殊族群標記（用於消息面分析加分）
SECTOR_MAP = {
    '記憶體': ['2408', '2344', '2337', '2371'],
    '矽光子': ['2382', '2360', '3189', '6274', '6669'],
    'AI伺服器': ['2382', '6669', '2357', '2353'],
    'PCB': ['2313', '2368', '3037', '8046', '6274'],
    '被動元件': ['2327', '2492', '2456'],
    '半導體': ['2330', '2317', '2454', '2303', '2308'],
    '電動車': ['2207', '2208', '2209', '2236'],
    '生技醫療': ['4161', '4120', '4142', '6929'],
    '光學': ['3008', '3019', '6271'],
    '電網': ['1507', '1504', '2427'],
}

# TWSE 官方產業別代碼 → 中文族群名稱（用於全市場分類）
TWSE_INDUSTRY_CODE_MAP = {
    '01': '水泥工業',
    '02': '食品工業',
    '03': '塑膠工業',
    '04': '紡織纖維',
    '05': '電機機械',
    '06': '電器電纜',
    '08': '玻璃陶瓷',
    '09': '造紙工業',
    '10': '鋼鐵工業',
    '11': '橡膠工業',
    '12': '汽車工業',
    '14': '建材營造',
    '15': '航運業',
    '16': '觀光餐旅',
    '17': '金融保險',
    '18': '貿易百貨',
    '20': '其他電子業',
    '21': '化學工業',
    '22': '生技醫療',
    '23': '油電燃氣業',
    '24': '半導體業',
    '25': '電腦及週邊設備業',
    '26': '光電業',
    '27': '通信網路業',
    '28': '電子零組件業',
    '29': '電子通路業',
    '30': '資訊服務業',
    '31': '其他電子業',
    '32': '文化創意業',
    '33': '農業科技業',
    '34': '電子商務業',
    '35': '綠能環保',
    '36': '數位雲端',
    '37': '運動休閒',
    '38': '居家生活',
    '39': '管理股票',
    '91': '存託憑證',
}

# 全市場 stock_id → TWSE官方產業別 快取（在 run_five_dimension_scan 啟動時載入）
_TWSE_STOCK_SECTOR_CACHE: Dict[str, str] = {}


def load_twse_industry_map() -> Dict[str, str]:
    """
    從 TWSE t187ap03_L 取得所有上市公司的官方產業別，
    建立 stock_id → 產業別名稱 對照表。
    失敗時回傳空 dict（降級到舊的 SECTOR_MAP 邏輯）。
    """
    global _TWSE_STOCK_SECTOR_CACHE
    if _TWSE_STOCK_SECTOR_CACHE:
        return _TWSE_STOCK_SECTOR_CACHE

    print("[產業別] 載入 TWSE 官方產業別對照表...")
    try:
        r = requests.get(
            'https://openapi.twse.com.tw/v1/opendata/t187ap03_L',
            headers=TWSE_HEADERS, timeout=20, verify=False
        )
        r.raise_for_status()
        data = r.json()
        mapping = {}
        for row in data:
            code = str(row.get('公司代號', '')).strip()
            ind_code = str(row.get('產業別', '')).strip()
            if code and len(code) == 4 and code.isdigit():
                ind_name = TWSE_INDUSTRY_CODE_MAP.get(ind_code, f'其他({ind_code})')
                mapping[code] = ind_name
        _TWSE_STOCK_SECTOR_CACHE = mapping
        print(f"[產業別] 載入完成：{len(mapping)} 檔股票已分類，涵蓋 {len(set(mapping.values()))} 個產業別")
        return mapping
    except Exception as e:
        print(f"[產業別] 載入失敗：{e}，將使用 SECTOR_MAP 後備邏輯")
        return {}


def get_stock_sector(stock_id: str, industry_map: Dict[str, str]) -> str:
    """
    取得股票的族群分類。優先順序：
    1. SECTOR_MAP 熱門題材（用於消息面加分的特殊標記）
    2. TWSE 官方產業別（涵蓋全市場 1000+ 檔）
    3. 回退到「其他」
    """
    # 優先用熱門題材（消息面加分用）
    hot = next((k for k, v in SECTOR_MAP.items() if stock_id in v), None)
    if hot:
        return hot
    # 再用 TWSE 官方產業別
    if stock_id in industry_map:
        return industry_map[stock_id]
    return '其他'


def estimate_share_capital(stock_id):
    """估算股本 - 對於沒有預設值的股票使用合理估算"""
    KNOWN_CAPITAL = {
        '2408': 1126000, '2344': 992000, '2337': 359000, '2371': 406000,
        '2382': 908000, '2360': 62000, '3189': 68000, '6274': 196000,
        '6669': 119000, '2395': 191000,
        '2313': 476000, '2368': 462000, '3037': 884000, '8046': 552000,
        '2327': 391000, '2492': 597000, '2456': 239000,
        '2353': 1565000, '2357': 777000,
        '2330': 2590000, '2317': 544000, '2454': 98000,
    }
    if stock_id in KNOWN_CAPITAL:
        return KNOWN_CAPITAL[stock_id]
    return 500000  # 預設估算：中型股本 50 萬張


# ================================================================
# 特徵工程 - ML 爆漲股預測用
# ================================================================
def compute_rsi(closes: List[float], period: int = 14) -> float:
    """計算 RSI"""
    if len(closes) < period + 1:
        return 50.0
    deltas = [closes[i] - closes[i-1] for i in range(1, len(closes))]
    gains  = [d if d > 0 else 0.0 for d in deltas]
    losses = [-d if d < 0 else 0.0 for d in deltas]
    avg_gain = sum(gains[-period:]) / period
    avg_loss = sum(losses[-period:]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 2)


def compute_features(hist: List[Dict], stock_id: str) -> Optional[Dict]:
    """
    從歷史資料計算 ML 特徵向量
    特徵：RSI、量比 (5 日)、動能 (5 日/20 日)、波動率、均線乖離率 (5/20)、連續漲跌天數、周轉率
    """
    if len(hist) < 25:
        return None

    closes       = [r['close']  for r in hist]
    volumes      = [r['volume'] for r in hist]
    changes_pct  = [r['change_pct'] for r in hist]

    today = hist[-1]

    # 1. RSI (14 日)
    rsi = compute_rsi(closes, 14)

    # 2. 量比 (今日量 / 5 日均量)
    avg_vol5     = sum(volumes[-6:-1]) / 5 if len(volumes) >= 6 else volumes[-1]
    vol_ratio_5  = today['volume'] / avg_vol5 if avg_vol5 > 0 else 1.0

    # 3. 量比 (今日量 / 20 日均量)
    avg_vol20    = sum(volumes[-21:-1]) / 20 if len(volumes) >= 21 else avg_vol5
    vol_ratio_20 = today['volume'] / avg_vol20 if avg_vol20 > 0 else 1.0

    # 4. 動能 - 5 日漲幅
    momentum_5   = (closes[-1] - closes[-6]) / closes[-6] * 100 if len(closes) >= 6 and closes[-6] > 0 else 0.0

    # 5. 動能 - 20 日漲幅
    momentum_20  = (closes[-1] - closes[-21]) / closes[-21] * 100 if len(closes) >= 21 and closes[-21] > 0 else 0.0

    # 6. 波動率 (20 日收盤標準差 / 均值)
    close_arr    = np.array(closes[-20:])
    volatility   = float(np.std(close_arr) / np.mean(close_arr) * 100) if np.mean(close_arr) > 0 else 0.0

    # 7. 均線乖離率 MA5
    ma5      = sum(closes[-5:]) / 5
    ma5_bias = (closes[-1] - ma5) / ma5 * 100 if ma5 > 0 else 0.0

    # 8. 均線乖離率 MA20
    ma20      = sum(closes[-20:]) / 20
    ma20_bias = (closes[-1] - ma20) / ma20 * 100 if ma20 > 0 else 0.0

    # 9. 連續漲天數（正值=連漲，負值=連跌）
    streak = 0
    for r in reversed(hist[-10:]):
        if r['change_pct'] > 0:
            if streak >= 0:
                streak += 1
            else:
                break
        elif r['change_pct'] < 0:
            if streak <= 0:
                streak -= 1
            else:
                break
        else:
            break

    # 10. 周轉率
    capital  = estimate_share_capital(stock_id)
    turnover = (today['volume'] / 1000) / capital * 100

    # 11. 今日漲幅
    today_change = today['change_pct']

    # 12. 高低點位置 (今收與 20 日高的距離)
    max_20d = max(r['high'] for r in hist[-20:])
    min_20d = min(r['low']  for r in hist[-20:])
    price_position = (closes[-1] - min_20d) / (max_20d - min_20d) * 100 if (max_20d - min_20d) > 0 else 50.0

    return {
        'rsi':            rsi,
        'vol_ratio_5':    vol_ratio_5,
        'vol_ratio_20':   vol_ratio_20,
        'momentum_5':     momentum_5,
        'momentum_20':    momentum_20,
        'volatility':     volatility,
        'ma5_bias':       ma5_bias,
        'ma20_bias':      ma20_bias,
        'streak':         float(streak),
        'turnover':       turnover,
        'today_change':   today_change,
        'price_position': price_position,
    }


def generate_synthetic_training_data(hist: List[Dict], stock_id: str) -> tuple:
    """
    從歷史數據生成訓練樣本（滑動窗口）
    標籤：若隔日漲幅 >= 9.5% 則為 1（漲停），否則為 0
    """
    X, y = [], []
    if len(hist) < 30:
        return X, y

    for i in range(25, len(hist) - 1):
        window = hist[:i+1]
        feat   = compute_features(window, stock_id)
        if feat is None:
            continue
        next_day_change = hist[i+1]['change_pct']
        label = 1 if next_day_change >= 9.5 else 0
        X.append(list(feat.values()))
        y.append(label)

    return X, y


def predict_explosive_stocks(all_stock_data: List[Dict]) -> List[Dict]:
    """
    機器學習爆漲股預測引擎
    使用 RandomForestClassifier 預測隔日漲停機率，輸出 Top 5
    """
    print("[ML] 爆漲股預測模型啟動 (RandomForestClassifier)...")

    all_X, all_y     = [], []
    stock_features   = {}

    for item in all_stock_data:
        sid  = item['stock_id']
        hist = item['hist']
        if not hist or len(hist) < 30:
            continue

        X_s, y_s = generate_synthetic_training_data(hist, sid)
        all_X.extend(X_s)
        all_y.extend(y_s)

        feat = compute_features(hist, sid)
        if feat:
            stock_features[sid] = feat

    if not all_X or len(all_X) < 10:
        print("[ML] 訓練資料不足，使用規則式後備預測")
        return _rule_based_fallback(all_stock_data)

    X_arr = np.array(all_X)
    y_arr = np.array(all_y)

    pos_count = int(np.sum(y_arr))
    neg_count = len(y_arr) - pos_count
    print(f"[ML] 訓練樣本：{len(X_arr)} 筆 | 漲停樣本：{pos_count} | 未漲停：{neg_count}")

    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=6,
        min_samples_leaf=3,
        class_weight='balanced',
        random_state=42,
        n_jobs=-1
    )
    clf.fit(X_arr, y_arr)

    predictions = []

    for item in all_stock_data:
        sid = item['stock_id']
        if sid not in stock_features:
            continue
        feat     = stock_features[sid]
        feat_vec = np.array(list(feat.values())).reshape(1, -1)

        try:
            proba = clf.predict_proba(feat_vec)[0]
            surge_prob = float(proba[1]) if len(proba) > 1 else float(proba[0])
        except Exception:
            surge_prob = 0.0

        predictions.append({
            'stock_id':         sid,
            'name':             item['name'],
            'sector':           item['sector'],
            'close':            item['hist'][-1]['close'],
            'change_pct':       item['hist'][-1]['change_pct'],
            'surge_probability': round(surge_prob * 100, 2),
            'features': {
                'rsi':            round(feat['rsi'], 1),
                'vol_ratio_5':    round(feat['vol_ratio_5'], 2),
                'momentum_5':     round(feat['momentum_5'], 2),
                'momentum_20':    round(feat['momentum_20'], 2),
                'volatility':     round(feat['volatility'], 2),
                'ma5_bias':       round(feat['ma5_bias'], 2),
                'ma20_bias':      round(feat['ma20_bias'], 2),
                'streak':         int(feat['streak']),
                'turnover':       round(feat['turnover'], 2),
                'price_position': round(feat['price_position'], 1),
            },
            'ml_signals': _interpret_features(feat),
        })

    predictions.sort(key=lambda x: x['surge_probability'], reverse=True)
    top5 = predictions[:5]

    print("[ML] 預測完成，Top 5 爆漲候選：")
    for i, p in enumerate(top5, 1):
        print(f"  {i}. {p['name']}({p['stock_id']}) 漲停機率：{p['surge_probability']:.1f}%"
              f" | RSI:{p['features']['rsi']} 量比:{p['features']['vol_ratio_5']:.1f}x")

    return top5


def _interpret_features(feat: Dict) -> List[str]:
    """將特徵數值轉換成可讀訊號說明"""
    signals = []
    if feat['rsi'] < 35:
        signals.append(f"RSI 超賣 ({feat['rsi']:.0f})")
    elif 40 <= feat['rsi'] <= 65:
        signals.append(f"RSI 健康 ({feat['rsi']:.0f})")
    elif feat['rsi'] > 75:
        signals.append(f"RSI 偏高 ({feat['rsi']:.0f})")

    if feat['vol_ratio_5'] >= 2.5:
        signals.append(f"爆量 ({feat['vol_ratio_5']:.1f}x)")
    elif feat['vol_ratio_5'] >= 1.5:
        signals.append(f"量增 ({feat['vol_ratio_5']:.1f}x)")

    if feat['momentum_5'] >= 5:
        signals.append(f"5 日強勢 (+{feat['momentum_5']:.1f}%)")
    elif feat['momentum_5'] <= -5:
        signals.append(f"5 日弱勢 ({feat['momentum_5']:.1f}%)")

    if feat['streak'] >= 3:
        signals.append(f"連漲{int(feat['streak'])}日")
    elif feat['streak'] <= -3:
        signals.append(f"連跌{abs(int(feat['streak']))}日")

    if feat['ma5_bias'] > 3:
        signals.append(f"MA5 乖離過大 (+{feat['ma5_bias']:.1f}%)")
    elif feat['ma5_bias'] < -3:
        signals.append(f"MA5 跌破 (-{abs(feat['ma5_bias']):.1f}%)")

    if feat['turnover'] >= 5:
        signals.append(f"高周轉 ({feat['turnover']:.1f}%)")

    if not signals:
        signals.append("特徵中性")
    return signals


def _rule_based_fallback(all_stock_data: List[Dict]) -> List[Dict]:
    """訓練資料不足時的規則式後備預測"""
    candidates = []
    for item in all_stock_data:
        hist = item['hist']
        if not hist or len(hist) < 20:
            continue
        feat = compute_features(hist, item['stock_id'])
        if not feat:
            continue
        score = 0
        if feat['rsi'] < 40:         score += 30
        if feat['vol_ratio_5'] >= 2.0: score += 25
        if feat['momentum_5'] > 3:   score += 20
        if feat['streak'] <= -2:     score += 15  # 連跌反彈機率
        if feat['turnover'] >= 5:    score += 10
        candidates.append({
            'stock_id':          item['stock_id'],
            'name':              item['name'],
            'sector':            item['sector'],
            'close':             hist[-1]['close'],
            'change_pct':        hist[-1]['change_pct'],
            'surge_probability': round(score * 0.5, 2),
            'features':          feat,
            'ml_signals':        _interpret_features(feat),
        })
    candidates.sort(key=lambda x: x['surge_probability'], reverse=True)
    return candidates[:5]


# ================================================================
# 五維分析函式 — v2 暴漲預測模型 (2026/04/28)
# 權重：技術面 25%、基本面 23%、消息面 32%、情緒面 12%、籌碼面 8%
# 滿分：技術面 40、基本面 40、消息面 10、情緒面 10、籌碼面 10
# ================================================================
def analyze_technical(hist) -> Dict:
    """技術面分析（滿分 40 = 5 個子指標各 8 分）
    均線排列(8)、爆量突破(8)、創新高(8)、RSI(8)、量價關係(8)"""
    score   = 0
    signals = []
    details = {}
    if len(hist) < 20:
        if not hist:
            return {'score': 0, 'signals': [], 'details': {'note': '無資料'},
                    'ma5': 0, 'ma10': 0, 'ma20': 0}
        today  = hist[-1]
        closes = [r['close'] for r in hist]
        n      = len(hist)

        # 1. 均線排列（簡化 — 用 MA5/MA10 代替長天期均線）
        ma5_val = sum(closes[-5:]) / min(n, 5)
        ma10_val = sum(closes[-min(n,10):]) / min(n, 10)
        score_ma = 0
        if today['close'] > ma5_val: score_ma += 3
        if n >= 5 and ma5_val > ma10_val: score_ma += 3
        if n >= 10 and ma10_val > sum(closes[-min(n,20):]) / min(n, 20): score_ma += 2
        score += score_ma
        if score_ma >= 6: signals.append('多頭排列')
        elif score_ma >= 4: signals.append('部分多頭排列')
        elif score_ma >= 2: signals.append('站上短均')
        else: signals.append('空頭排列')
        details['ma_arrangement'] = score_ma

        # 2. 爆量突破
        vol_ratio = 0
        if n >= 2:
            avg_vol_prev = sum(r['volume'] for r in hist[:-1]) / (n - 1)
            vol_ratio = today['volume'] / avg_vol_prev if avg_vol_prev > 0 else 0
        if vol_ratio >= 3: score += 8; signals.append(f'爆量突破 ({vol_ratio:.1f}x)')
        elif vol_ratio >= 2: score += 5; signals.append(f'量增 ({vol_ratio:.1f}x)')
        elif vol_ratio >= 1.5: score += 3; signals.append(f'量溫增 ({vol_ratio:.1f}x)')
        else: score += 0
        details['vol_ratio'] = round(vol_ratio, 2)

        # 3. RSI（簡化）
        rsi = None
        if n >= 5:
            deltas = [closes[i] - closes[i-1] for i in range(1, n)]
            gains  = [d if d > 0 else 0 for d in deltas]
            losses = [-d if d < 0 else 0 for d in deltas]
            k      = min(len(gains), 14)
            avg_g  = sum(gains[-k:])  / k
            avg_l  = sum(losses[-k:]) / k
            rs     = avg_g / avg_l if avg_l > 0 else 100
            rsi    = 100 - (100 / (1 + rs))
        if rsi is not None:
            if 50 <= rsi <= 70: score += 8; signals.append(f'RSI 健康強勢 ({rsi:.0f})')
            elif rsi < 30: score += 7; signals.append(f'RSI 超賣反彈 ({rsi:.0f})')
            elif 70 < rsi <= 80: score += 6; signals.append(f'RSI 偏強 ({rsi:.0f})')
            elif rsi > 80: score += 2; signals.append(f'RSI 過熱 ({rsi:.0f})')
            else: score += 4; signals.append(f'RSI 中性 ({rsi:.0f})')
        details['rsi'] = round(rsi, 2) if rsi else None

        # 4. 量價關係
        chg = today.get('change_pct', 0)
        if chg >= 1 and vol_ratio > 1.2: score += 8; signals.append('漲帶量')
        elif chg < -0.5 and vol_ratio < 0.9: score += 6; signals.append('跌縮量')
        elif chg >= 1 and vol_ratio < 0.8: score += 2; signals.append('漲量縮(假突破)')
        elif chg < -1 and vol_ratio > 1.5: score += 1; signals.append('跌量增(出貨)')
        else: score += 4
        details['price_volume'] = f'漲跌:{chg:.1f}% 量比:{vol_ratio:.1f}'

        details['note'] = f'partial ({n}天)'
        return {'score': min(max(score, 0), 40),
                'signals': signals,
                'details': details,
                'ma5':  round(ma5_val, 2),
                'ma10': round(sum(closes[-min(n,10):]) / min(n,10), 2),
                'ma20': round(closes[-1], 2)}

    closes = [r['close'] for r in hist]
    today  = hist[-1]

    # 1. 均線排列 (8 分)
    ma5 = sum(closes[-5:]) / 5
    ma10 = sum(closes[-10:]) / 10
    ma20 = sum(closes[-20:]) / 20
    ma60 = sum(closes[-min(len(closes),60):]) / min(len(closes),60) if len(closes) >= 20 else ma20
    ma120 = sum(closes[-120:]) / 120 if len(closes) >= 120 else ma60
    ma_arr = 0
    # 短期排列 (3分): 收盤 > MA5(1), MA5 > MA10(2)
    if today['close'] > ma5: ma_arr += 1
    if ma5 > ma10: ma_arr += 2
    # 中期排列 (3分): MA10 > MA20(1), MA20 > MA60(2)
    if ma10 > ma20: ma_arr += 1
    if ma20 > ma60: ma_arr += 2
    # 長期排列 (2分): MA60 > MA120
    if ma60 > ma120: ma_arr += 2
    if ma_arr >= 7: signals.append('黃金多頭排列 (MA5>MA10>MA20>MA60>MA120)')
    elif ma_arr >= 5: signals.append('多頭排列')
    elif ma_arr >= 3: signals.append('部分多頭排列')
    else: signals.append('空頭排列')
    score += ma_arr
    details['ma_arrangement'] = ma_arr

    # 2. 爆量突破 (8 分)
    avg_vol20 = sum(r['volume'] for r in hist[-21:-1]) / 20
    vol_ratio = today['volume'] / avg_vol20 if avg_vol20 > 0 else 0
    if vol_ratio >= 3: vb = 8; signals.append(f'爆量突破 ({vol_ratio:.1f}x)')
    elif vol_ratio >= 2: vb = 5; signals.append(f'量增 ({vol_ratio:.1f}x)')
    elif vol_ratio >= 1.5: vb = 3; signals.append(f'量溫增 ({vol_ratio:.1f}x)')
    else: vb = 0
    score += vb
    details['vol_ratio_5'] = round(vol_ratio, 2)

    # 3. 創新高 (8 分)
    high_60d = max(r['high'] for r in hist[-60:]) if len(hist) >= 60 else max(r['high'] for r in hist)
    if today['high'] >= high_60d: nh = 8; signals.append('創 60 日新高')
    elif today['high'] >= high_60d * 0.995: nh = 6; signals.append(f'接近 60 日高 ({today["high"]/high_60d*100:.1f}%)')
    elif today['high'] >= high_60d * 0.98: nh = 3; signals.append(f'逼近 60 日高 ({today["high"]/high_60d*100:.1f}%)')
    else: nh = 0
    score += nh
    details['near_60d_high'] = round(today['high'] / high_60d * 100, 2)

    # 4. RSI (8 分)
    deltas = [closes[i] - closes[i-1] for i in range(1, len(closes))]
    gains  = [d if d > 0 else 0 for d in deltas]
    losses = [-d if d < 0 else 0 for d in deltas]
    rsi = None
    if len(gains) >= 14:
        avg_gain = sum(gains[-14:]) / 14
        avg_loss = sum(losses[-14:]) / 14
        rs  = avg_gain / avg_loss if avg_loss > 0 else 100
        rsi = 100 - (100 / (1 + rs))
    if rsi is not None:
        if 50 <= rsi <= 70: rs_s = 8; signals.append(f'RSI 健康強勢 ({rsi:.0f})')
        elif rsi < 30: rs_s = 7; signals.append(f'RSI 超賣反彈 ({rsi:.0f})')
        elif 70 < rsi <= 80: rs_s = 6; signals.append(f'RSI 偏強 ({rsi:.0f})')
        elif rsi > 80: rs_s = 2; signals.append(f'RSI 過熱 ({rsi:.0f})')
        else: rs_s = 4; signals.append(f'RSI 中性 ({rsi:.0f})')
    else:
        rs_s = 4
    score += rs_s
    details['rsi'] = round(rsi, 2) if rsi else None

    # 5. 量價關係 (8 分)
    ret = today.get('change_pct', 0) / 100
    if ret > 0.01 and vol_ratio > 1.2: pv = 8; signals.append('漲帶量')
    elif ret < -0.005 and vol_ratio < 0.9: pv = 6; signals.append('跌縮量')
    elif ret > 0.01 and vol_ratio < 0.8: pv = 2; signals.append('漲量縮(假突破)')
    elif ret < -0.01 and vol_ratio > 1.5: pv = 1; signals.append('跌量增(出貨)')
    else: pv = 4
    score += pv
    details['price_volume'] = f'漲跌:{today.get("change_pct",0):.1f}% 量比:{vol_ratio:.1f}'

    return {
        'score':   min(score, 40),
        'signals': signals,
        'details': details,
        'ma5':     round(sum(closes[-5:]) / 5,  2),
        'ma10':    round(sum(closes[-10:]) / 10, 2),
        'ma20':    round(ma20, 2),
    }


def analyze_chips(hist) -> Dict:
    """籌碼面分析（滿分 10）：主力進出(4)、融資變化(3)、三大法人(3)
    TWSE OpenAPI 不直接提供法人資料，用成交量與價格變動推算"""
    score   = 0
    signals = []
    details = {}
    if not hist:
        return {'score': 0, 'signals': [], 'details': {}}

    today = hist[-1]
    n     = len(hist)
    sigs_partial  = []
    det_partial   = {}

    # 1. 主力進出 (4 分) — 用量比 + 漲跌幅估算
    if n >= 2:
        avg_vol_prev = sum(r['volume'] for r in hist[:-1]) / (n - 1)
        vol_ratio    = today['volume'] / avg_vol_prev if avg_vol_prev > 0 else 1.0
        chg = today.get('change_pct', 0)
        det_partial['vol_ratio'] = round(vol_ratio, 2)
        if vol_ratio >= 2.0 and chg >= 2.0:
            score += 4; sigs_partial.append('主力加碼(估)')
            det_partial['main_force'] = '加碼'
        elif vol_ratio >= 1.5 and chg >= 1.0:
            score += 2; sigs_partial.append('主力逢低承接(估)')
            det_partial['main_force'] = '承接'
        elif vol_ratio < 0.5 and chg >= 2.0:
            score += 1; sigs_partial.append('主力縮手(價漲量縮)')
            det_partial['main_force'] = '觀望'
        else:
            det_partial['main_force'] = '觀望'
    else:
        det_partial['main_force'] = '觀望'

    # 2. 融資變化 (3 分) — 用連漲趨勢代替（無真實融資資料時）
    if n >= 3:
        consec_up = sum(1 for r in hist[-3:] if r.get('change_pct', 0) > 0)
        consec_down = sum(1 for r in hist[-3:] if r.get('change_pct', 0) < 0)
        if consec_up >= 2:
            score += 3; sigs_partial.append('連漲(融資增估)')
        elif consec_down >= 2:
            score += 1; sigs_partial.append('連跌(融資減估)')
        else:
            score += 2

    # 3. 三大法人 (3 分) — 用價格相對 20 日均線位置推估
    if n >= 20:
        ma20 = sum(r['close'] for r in hist[-20:]) / 20
        if today['close'] > ma20 * 1.03:
            score += 3; sigs_partial.append('法人買超(估)')
        elif today['close'] < ma20 * 0.97:
            score += 1; sigs_partial.append('法人賣超(估)')
        else:
            score += 2

    return {'score': min(max(score, 0), 10),
            'signals': sigs_partial, 'details': det_partial}


def analyze_fundamental(stock_id: str, bwibbu: Dict[str, Dict] = None, all_bwibbu: Dict[str, Dict] = None, hist: List[Dict] = None) -> Dict:
    """
    基本面分析（滿分 40，動態 5 指標）
    指標：PE估值(8)、財務體質(8)、量能趨勢(8)、PBR(8)、殖利率(8)
    - PE/PBR/殖利率：BWIBBU_ALL 真實數據；無資料時跳過，不顯示「無法取得」
    - 財務體質：由 PBR+殖利率 組合推算（替代毛利率）
    - 量能趨勢：由近 5 日量能 vs 20 日均量推算（替代營收成長，使用 hist）
    - 無資料的指標分數由有資料指標按比例補足，確保滿分仍為 40
    """
    signals = []
    details = {}
    scored_items = []  # [(score, max_score)] 只記錄有資料的指標

    pe_val = None
    pb_val = None
    dy_val = None

    # 從 BWIBBU 取真實數據
    if bwibbu and stock_id in bwibbu:
        fb = bwibbu[stock_id]
        pe_val = fb.get('pe')
        pb_val = fb.get('pb')
        dy_val = fb.get('dy')

    # ── 1. PE 估值 (8 分) ──────────────────────────────────────────
    if pe_val is not None and pe_val > 0:
        details['pe'] = round(pe_val, 2)
        if 10 <= pe_val <= 18:   pe_s = 8; signals.append(f'PE 合理 ({pe_val:.1f}x)')
        elif pe_val < 10:         pe_s = 7; signals.append(f'PE 低估 ({pe_val:.1f}x)')
        elif pe_val < 25:         pe_s = 5; signals.append(f'PE 偏高 ({pe_val:.1f}x)')
        else:                     pe_s = 2; signals.append(f'PE 過高 ({pe_val:.1f}x)')
        scored_items.append((pe_s, 8))

    # ── 2. 財務體質 (8 分) — 由 PBR+殖利率 組合推算（替代毛利率）──
    # 邏輯：PBR 低 + 殖利率高 → 財務扎實；PBR 合理 + 殖利率中等 → 穩健
    if pb_val is not None and pb_val > 0 and dy_val is not None and dy_val >= 0:
        # PBR 分 (0-4)
        if pb_val < 1:           pbr_sub = 4
        elif pb_val <= 2.5:      pbr_sub = 3
        elif pb_val <= 5:        pbr_sub = 2
        else:                    pbr_sub = 1
        # 殖利率分 (0-4)
        if dy_val > 5:           dy_sub = 4
        elif dy_val >= 3:        dy_sub = 3
        elif dy_val >= 1:        dy_sub = 2
        else:                    dy_sub = 1
        fin_s = pbr_sub + dy_sub
        if fin_s >= 7:   signals.append(f'財務體質優良 (PBR:{pb_val:.1f} 殖利率:{dy_val:.1f}%)')
        elif fin_s >= 5: signals.append(f'財務穩健 (PBR:{pb_val:.1f} 殖利率:{dy_val:.1f}%)')
        else:            signals.append(f'財務普通 (PBR:{pb_val:.1f} 殖利率:{dy_val:.1f}%)')
        scored_items.append((fin_s, 8))
    elif pb_val is not None and pb_val > 0:
        # 只有 PBR
        if pb_val < 1:    fin_s = 6
        elif pb_val <= 2.5: fin_s = 5
        elif pb_val <= 5:   fin_s = 3
        else:               fin_s = 1
        signals.append(f'PBR {pb_val:.2f}x')
        scored_items.append((fin_s, 8))

    # ── 3. 量能趨勢 (8 分) — 近 5 日量能 vs 20 日均量（替代營收成長）
    if hist and len(hist) >= 6:
        vols = [r['volume'] for r in hist]
        avg_vol20 = sum(vols[-21:-1]) / 20 if len(vols) >= 21 else sum(vols[:-1]) / max(len(vols)-1, 1)
        avg_vol5  = sum(vols[-6:-1]) / 5
        vol_trend = avg_vol5 / avg_vol20 if avg_vol20 > 0 else 1.0
        if vol_trend >= 2.0:   rev_s = 8; signals.append(f'量能爆發 (5日均量 {vol_trend:.1f}x)')
        elif vol_trend >= 1.5: rev_s = 7; signals.append(f'量能增溫 (5日均量 {vol_trend:.1f}x)')
        elif vol_trend >= 1.1: rev_s = 5; signals.append(f'量能溫和放大 ({vol_trend:.1f}x)')
        elif vol_trend >= 0.8: rev_s = 4; signals.append(f'量能持平 ({vol_trend:.1f}x)')
        else:                  rev_s = 2; signals.append(f'量能萎縮 ({vol_trend:.1f}x)')
        details['vol_trend'] = round(vol_trend, 2)
        scored_items.append((rev_s, 8))
    elif hist and len(hist) >= 2:
        # 資料不足 20 天：用今日 vs 前幾日均量
        vols = [r['volume'] for r in hist]
        avg_prev = sum(vols[:-1]) / (len(vols) - 1)
        vol_ratio = vols[-1] / avg_prev if avg_prev > 0 else 1.0
        if vol_ratio >= 2.0:   rev_s = 7; signals.append(f'今日爆量 ({vol_ratio:.1f}x)')
        elif vol_ratio >= 1.3: rev_s = 5; signals.append(f'量增 ({vol_ratio:.1f}x)')
        else:                  rev_s = 3
        scored_items.append((rev_s, 8))

    # ── 4. PBR (8 分) ──────────────────────────────────────────────
    if pb_val is not None and pb_val > 0:
        details['pb'] = round(pb_val, 2)
        if 1 <= pb_val <= 2.5:  pb_s = 8; signals.append(f'PBR 合理 ({pb_val:.2f}x)')
        elif pb_val < 1:         pb_s = 7; signals.append(f'PBR 低估 ({pb_val:.2f}x)')
        elif pb_val < 5:         pb_s = 5; signals.append(f'PBR 偏高 ({pb_val:.2f}x)')
        else:                    pb_s = 2; signals.append(f'PBR 過高 ({pb_val:.2f}x)')
        scored_items.append((pb_s, 8))

    # ── 5. 殖利率 (8 分) ───────────────────────────────────────────
    if dy_val is not None and dy_val >= 0:
        details['dy'] = round(dy_val, 2)
        if dy_val > 5:    dy_s = 8; signals.append(f'高殖利率 ({dy_val:.1f}%)')
        elif dy_val >= 3: dy_s = 7; signals.append(f'殖利率不錯 ({dy_val:.1f}%)')
        elif dy_val >= 1: dy_s = 5; signals.append(f'殖利率偏低 ({dy_val:.1f}%)')
        else:             dy_s = 2; signals.append(f'殖利率低 ({dy_val:.1f}%)')
        scored_items.append((dy_s, 8))

    # ── 加總：有資料指標按比例換算到 40 分滿分 ─────────────────────
    if not scored_items:
        # 完全無資料（OTC 且無歷史），給基本中性分
        score = 20
    else:
        total_got   = sum(s for s, _ in scored_items)
        total_max   = sum(m for _, m in scored_items)
        # 按比例換算到 40 分
        score = round(total_got / total_max * 40, 1)

    return {'score': min(max(score, 0), 40), 'signals': signals, 'details': details}


def analyze_news(stock_id, sector) -> Dict:
    """消息面分析（10%）：拆分三子維度加權計算"""
    signals = []
    details = {'sector': sector}

    # ── 子維度 1：產業消息 (權重 40%) ──────────────────────
    industry_score = 5
    in_hot_sector  = (
        sector in SECTOR_MAP or
        stock_id in [s for stocks in SECTOR_MAP.values() for s in stocks]
    )
    if in_hot_sector:
        industry_score = 9
        signals.append('熱門族群題材')
    else:
        signals.append('產業消息中性')
    details['industry_score'] = industry_score

    # ── 子維度 2：法說/財報事件 (權重 35%) ─────────────────
    import datetime as _dt
    current_month  = _dt.datetime.now().month
    earnings_months = {3, 4, 6, 7, 9, 10, 12, 1}
    if current_month in earnings_months:
        earnings_score = 8
        signals.append('財報/法說季')
    else:
        earnings_score = 5
        signals.append('法說事件中性')
    details['earnings_score'] = earnings_score

    # ── 子維度 3：美股連動 (權重 25%) ───────────────────────
    high_us_linkage_sectors = {'半導體', 'AI伺服器', '電源管理', 'PCB', '散熱模組', '記憶體', '矽光子', '低軌衛星'}
    if sector in high_us_linkage_sectors:
        us_linkage_score = 8
        signals.append('美股高連動')
    elif in_hot_sector:
        us_linkage_score = 6
        signals.append('美股中連動')
    else:
        us_linkage_score = 5
        signals.append('美股連動中性')
    details['us_linkage_score'] = us_linkage_score

    weighted_score = (
        industry_score   * 0.40 +
        earnings_score   * 0.35 +
        us_linkage_score * 0.25
    )
    # 線性映射：加權總分理論範圍 [5*0.4+5*0.35+5*0.25, 9*0.4+8*0.35+8*0.25] = [5.0, 8.4]
    # 映射到 0-10：normalized = (weighted - min_possible) / (max_possible - min_possible) * 10
    min_possible = 5.0 * 0.40 + 5.0 * 0.35 + 5.0 * 0.25  # = 5.0
    max_possible = 9.0 * 0.40 + 8.0 * 0.35 + 8.0 * 0.25  # = 8.4
    if max_possible > min_possible:
        normalized = (weighted_score - min_possible) / (max_possible - min_possible) * 10.0
    else:
        normalized = 5.0
    final_score = round(max(0.0, min(10.0, normalized)), 2)
    details['sub_scores'] = {
        'industry(40%)':   industry_score,
        'earnings(35%)':   earnings_score,
        'us_linkage(25%)': us_linkage_score,
        'weighted_raw':    round(weighted_score, 2),
        'normalized_0_10': final_score,
    }

    return {'score': final_score, 'signals': signals, 'details': details}


def analyze_sentiment(hist, stock_id) -> Dict:
    """情緒面分析（10%）：周轉率、量比"""
    score   = 0
    signals = []
    if len(hist) < 20:
        # 資料不足：用漲跌幅 + 量比計算動能分數
        if not hist:
            return {'score': 0, 'signals': ['無資料'], 'details': {}}
        today = hist[-1]
        n     = len(hist)
        score_s = 0
        sigs_s  = []
        det_s   = {'note': f'partial sentiment ({n}天)'}

        chg = today.get('change_pct', 0)
        # 漲跌幅動能（最高 5 分）
        if chg >= 5.0:
            score_s += 5; sigs_s.append(f'強勢動能 ({chg:.1f}%)')
        elif chg >= 3.0:
            score_s += 4; sigs_s.append(f'正向動能 ({chg:.1f}%)')
        elif chg >= 1.0:
            score_s += 3; sigs_s.append(f'溫和動能 ({chg:.1f}%)')
        elif chg >= 0:
            score_s += 1
        elif chg <= -3.0:
            score_s -= 1; sigs_s.append(f'弱勢 ({chg:.1f}%)')

        # 量比動能（需 ≥2 天，最高 5 分）
        if n >= 2:
            avg_vol_prev = sum(r['volume'] for r in hist[:-1]) / (n - 1)
            vol_ratio    = today['volume'] / avg_vol_prev if avg_vol_prev > 0 else 0
            det_s['vol_ratio'] = round(vol_ratio, 2)
            if 1.5 <= vol_ratio <= 4.0:
                score_s += 5; sigs_s.append(f'量比健康 ({vol_ratio:.1f}x)')
            elif vol_ratio > 4.0:
                score_s += 3; sigs_s.append(f'爆量注意 ({vol_ratio:.1f}x)')
            elif 1.2 <= vol_ratio < 1.5:
                score_s += 2; sigs_s.append(f'量微增 ({vol_ratio:.1f}x)')

        return {'score': min(max(score_s, 0), 10),
                'signals': sigs_s,
                'details': det_s}

    today    = hist[-1]
    capital  = estimate_share_capital(stock_id)
    turnover = (today['volume'] / 1000) / capital * 100
    if 5 <= turnover <= 15:
        score += 5
        signals.append(f'周轉率健康 ({turnover:.1f}%)')
    elif 3 <= turnover < 5:
        score += 3
        signals.append(f'周轉率溫和 ({turnover:.1f}%)')

    avg_vol20 = sum(r['volume'] for r in hist[-21:-1]) / 20
    vol_ratio = today['volume'] / avg_vol20 if avg_vol20 > 0 else 0
    if 1.5 <= vol_ratio <= 3.0:
        score += 3
        signals.append(f'量比理想 ({vol_ratio:.1f}x)')

    return {
        'score':   min(score, 10),
        'signals': signals,
        'details': {'turnover': round(turnover, 2), 'vol_ratio': round(vol_ratio, 2)},
    }


def calculate_entry_exit(stock_data, technical, hist: List[Dict] = None) -> Dict:
    """
    計算進場點、停損點、三段目標價（ATR 動態版）

    進場價：收盤 × (1 + ATR% × 0.3)
      ATR% = 個股近14日平均真實波幅 / 收盤
      乘 0.3 取 30% ATR 作為合理追價空間

    停損價：收盤 - ATR × 2
      2倍 ATR 動態停損，高波動股自動放寬、低波動股自動收緊
      上限：最多停損 15%

    目標價三關（以近60日最高價為基準）：
      第一關 ×1.00：前高壓力位
      第二關 ×1.15：突破前高後延伸 +15%
      第三關 ×1.35：強勢飆升段 +35%
      已創60日新高時：改用布林上軌（MA20+2σ）作為第一關
    """
    close = stock_data['close']

    # ── 計算 ATR（14日真實波幅均值）─────────────────────────
    atr = close * 0.025  # 預設 2.5%（無歷史資料時）
    if hist and len(hist) >= 2:
        trs = []
        for i in range(1, min(len(hist), 15)):
            h      = hist[-i].get('high', close)
            l      = hist[-i].get('low',  close)
            prev_c = hist[-(i+1)].get('close', close) if i + 1 <= len(hist) else close
            tr = max(h - l, abs(h - prev_c), abs(l - prev_c))
            trs.append(tr)
        if trs:
            atr = sum(trs) / len(trs)
    atr_pct = atr / close if close > 0 else 0.025

    # ── 進場價：收盤 × (1 + ATR% × 0.3) ─────────────────────
    entry = round(close * (1 + atr_pct * 0.3), 2)

    # ── 停損價：收盤 - ATR × 2（最多停損15%）────────────────
    stop_loss = round(max(close - atr * 2, close * 0.85), 2)

    # ── 60日最高價 ────────────────────────────────────────────
    today_high = stock_data.get('high', close)
    high60 = close
    if hist and len(hist) >= 2:
        highs  = [h.get('high', h.get('close', close)) for h in hist[-60:]]
        high60 = max(highs) if highs else close

    at_new_high = today_high >= high60 * 0.995  # 貼近或已創60日新高

    if at_new_high and hist and len(hist) >= 20:
        # 已創新高：布林上軌（MA20 + 2σ）作為第一關備用
        closes20 = [h.get('close', close) for h in hist[-20:]]
        ma20_v   = sum(closes20) / 20
        sigma    = (sum((c - ma20_v) ** 2 for c in closes20) / 20) ** 0.5
        boll_upper = ma20_v + 2 * sigma
        t1 = round(max(boll_upper, close * 1.05), 2)
        target_note = '布林上軌(已創新高)'
    else:
        t1 = round(high60, 2)
        target_note = '60日前高'

    t2 = round(t1 * 1.15, 2)
    t3 = round(t1 * 1.35, 2)

    # 確保第一關至少比進場價高 3%
    if t1 <= entry * 1.03:
        t1 = round(entry * 1.08, 2)
        t2 = round(entry * 1.18, 2)
        t3 = round(entry * 1.35, 2)
        target_note = '動態基準'

    return {
        'entry':       entry,
        'stop_loss':   stop_loss,
        'target':      t1,      # 相容舊欄位
        'target1':     t1,
        'target2':     t2,
        'target3':     t3,
        'target_note': target_note,
        'atr':         round(atr, 2),
        'upside':      round((t1 - entry) / entry * 100, 1),
        'upside2':     round((t2 - entry) / entry * 100, 1),
        'upside3':     round((t3 - entry) / entry * 100, 1),
        'downside':    round((entry - stop_loss) / entry * 100, 1),
    }


def determine_strategy(score) -> str:
    """v4 積極型判定（score 為 0~100+ 加權總分）
    ≥80: 強力買進  65~79: 積極買進  50~64: 逢低佈局  35~49: 小量試單  <35: 觀望等待
    """
    if score >= 80:   return '強力買進 🔥 重倉佈局'
    elif score >= 65: return '積極買進 ⚡ 中型部位'
    elif score >= 50: return '逢低佈局 📈 分批進場'
    elif score >= 35: return '小量試單 👀 控制風險'
    else:             return '觀望等待 ⏳'


def get_holding_advice(recommendation: str) -> str:
    """依推薦等級生成持有建議文字。"""
    if '強力買進' in recommendation:
        return '次日開盤 ±1% 內確認動能進場，持有至 T+5 分批減碼，核心部位可續抱'
    elif '積極買進' in recommendation:
        return '積極建倉，持有至 T+5 分批減碼，核心部位可續抱'
    elif '逢低佈局' in recommendation:
        return '分批進場，逢回檔加碼，持有至 T+3 再評估'
    elif '小量試單' in recommendation:
        return '小量建立試單，確認方向後再加碼，嚴守停損'
    else:
        return ''


# ================================================================
# 動能等級分類函數
# ================================================================
def momentum_grade(tech_score: float, chips_score: float, fund_score: float) -> tuple:
    """
    根據五維評分中的技術面/籌碼面/基本面判斷動能等級 A/B/C/D。
    A 級 = 技術面>=75%滿分 且 籌碼面>=70%滿分 且 基本面>=60%滿分
    B 級 = 技術面>=75%滿分 且 (籌碼面>=70%滿分 或 基本面>=60%滿分)
    C 級 = 技術面>=75%滿分 但其他面都不達標
    D 級 = 技術面<75%滿分
    Returns: (grade: str, grade_reason: str)
    """
    TECH_THRESHOLD  = 40 * 0.60  # 24.0 (was 30.0)
    CHIPS_THRESHOLD = 25 * 0.50  # 12.5 (was 17.5)
    FUND_THRESHOLD  = 15 * 0.40  # 6.0  (was 9.0)

    tech_ok  = tech_score  >= TECH_THRESHOLD
    chips_ok = chips_score >= CHIPS_THRESHOLD
    fund_ok  = fund_score  >= FUND_THRESHOLD

    reason_parts = []
    reason_parts.append('技術✓' if tech_ok  else '技術✗')
    reason_parts.append('籌碼✓' if chips_ok else '籌碼✗')
    reason_parts.append('基本✓' if fund_ok  else '基本✗')
    grade_reason = ' '.join(reason_parts)

    if tech_ok and chips_ok and fund_ok:
        grade = 'A'
    elif tech_ok and (chips_ok or fund_ok):
        grade = 'B'
    elif tech_ok:
        grade = 'C'
    else:
        grade = 'D'

    return grade, grade_reason


# ================================================================
# 主掃描引擎
# ================================================================
def run_five_dimension_scan(verbose=True) -> Dict:
    """
    執行五維分析掃描 + ML 爆漲股預測。
    資料來源：TWSE OpenAPI (STOCK_DAY_ALL + BWIBBU_ALL)，本地日線快取累積歷史。
    """
    scan_start = datetime.now()
    today_str  = scan_start.strftime('%Y/%m/%d')

    if verbose:
        print(f"\n{'='*70}")
        print(f"  台股五維分析掃描引擎 v7.0 (TWSE OpenAPI)  |  {today_str}")
        print(f"  資料來源：openapi.twse.com.tw (STOCK_DAY_ALL + BWIBBU_ALL)")
        print(f"  權重：技術 25% + 基本面 23% + 消息 32% + 情緒 12% + 籌碼 8%")
        print(f"  ML 爆漲預測：RandomForestClassifier 隔日漲停機率 Top 5")
        print(f"{'='*70}\n")

    # ── Step 1：取得今日 OHLCV（STOCK_DAY_ALL，單次呼叫）──────────
    dl_start    = datetime.now()
    today_ohlcv = fetch_stock_day_all()
    # 合併上櫃 OHLCV（TPEx），上市已有資料的不覆蓋
    tpex_ohlcv = fetch_tpex_day_all()
    if tpex_ohlcv:
        merged = {**tpex_ohlcv, **today_ohlcv}  # 上市優先（右邊覆蓋左邊）
        added = len(merged) - len(today_ohlcv)
        print(f'[系統] 合併上市+上櫃 OHLCV：{len(today_ohlcv)} + {len(tpex_ohlcv)} → {len(merged)} 檔（新增上櫃 {added} 檔）')
        today_ohlcv = merged
    if not today_ohlcv:
        print("[警告] STOCK_DAY_ALL 無資料，嘗試使用快取繼續執行")

    # ── Step 2：取得基本面數據（BWIBBU_ALL，單次呼叫）─────────────
    bwibbu_data = fetch_bwibbu_all()

    dl_elapsed = (datetime.now() - dl_start).total_seconds()
    print(f"[API] 下載完成：今日 {len(today_ohlcv)} 檔 OHLCV + {len(bwibbu_data)} 檔 PE/PBR，耗時 {dl_elapsed:.1f}s")

    # ── Step 3：更新本地日線快取，組建股票池，載入產業別對照表 ──────
    cache        = update_daily_cache(today_ohlcv)
    STOCK_POOL   = get_stock_pool(today_ohlcv)
    industry_map = load_twse_industry_map()
    print(f"[系統] 掃描範圍：{len(STOCK_POOL)} 檔股票")

    # ── Step 4：五維分析 ─────────────────────────────────────────
    results              = []
    all_stock_data_for_ml = []
    scanned_count        = 0

    for stock_id, name in STOCK_POOL.items():
        sector = get_stock_sector(stock_id, industry_map)

        # 從快取組建歷史（多天）
        hist = build_history_from_cache(cache, stock_id)

        # 若快取中沒有今日資料但 today_ohlcv 有，補上
        if today_ohlcv and stock_id in today_ohlcv:
            today_key = today_ohlcv[stock_id].get('date', datetime.now().strftime('%Y%m%d'))
            if not hist or hist[-1].get('date') != today_key:
                row = dict(today_ohlcv[stock_id])
                row.pop('name', None)
                hist.append(row)

        # 資料完全為空，跳過五維分析但仍產出預設分數供前端自主檢查
        if not hist:
            all_stock_data_for_ml.append({'stock_id': stock_id, 'name': name, 'sector': sector, 'hist': []})
            results.append({
                'stock_id':   stock_id,
                'name':       name,
                'sector':     sector,
                'close':      0,
                'change_pct': 0,
                'total_score': 0,
                'dimensions': {
                    'technical':   0,
                    'chips':       0,
                    'fundamental': 0,
                    'news':        0,
                    'sentiment':   0,
                },
                'signals': {
                    'technical':   ['無歷史資料'],
                    'chips':       [],
                    'fundamental': [],
                    'news':        [],
                    'sentiment':   [],
                },
                'details': {},
                'strategy': {'recommendation': '觀望', 'entry_price': 0, 'stop_loss_price': 0, 'target_price': 0},
                'grade':        'D',
                'grade_reason': '無歷史成交資料，暫不評分',
            })
            continue

        scanned_count += 1
        all_stock_data_for_ml.append({'stock_id': stock_id, 'name': name, 'sector': sector, 'hist': hist})

        tech      = analyze_technical(hist)
        chips     = analyze_chips(hist)
        fund      = analyze_fundamental(stock_id, bwibbu_data, bwibbu_data, hist)
        news      = analyze_news(stock_id, sector)
        sentiment = analyze_sentiment(hist, stock_id)

        # ── 加權總分 (v2 暴漲預測模型) ──
        # 權重: 技術 25%、基本面 23%、消息 32%、情緒 12%、籌碼 8%
        # 滿分: 40/40/10/10/10
        _pct = {
            'tech': tech['score'] / 40.0,
            'fund': fund['score'] / 40.0,
            'news': news['score'] / 10.0,
            'sent': sentiment['score'] / 10.0,
            'chip': chips['score'] / 10.0,
        }
        total_score = (_pct['tech'] * 25 + _pct['fund'] * 23 + _pct['news'] * 32 +
                       _pct['sent'] * 12 + _pct['chip'] * 8)

        today_data  = hist[-1]
        entry_exit  = calculate_entry_exit(today_data, tech, hist)
        strategy    = determine_strategy(total_score)
        grade, grade_reason = momentum_grade(tech['score'], chips['score'], fund['score'])

        results.append({
            'stock_id':   stock_id,
            'name':       name,
            'sector':     sector,
            'close':      today_data['close'],
            'change_pct': today_data['change_pct'],
            'total_score': round(total_score, 1),
            'dimensions': {
                'technical':   tech['score'],
                'chips':       chips['score'],
                'fundamental': fund['score'],
                'news':        news['score'],
                'sentiment':   sentiment['score'],
            },
            'signals': {
                'technical':   tech['signals'],
                'chips':       chips['signals'],
                'fundamental': fund['signals'],
                'news':        news['signals'],
                'sentiment':   sentiment['signals'],
            },
            'details': {**tech['details'], **chips['details'], **fund['details'], **news['details'], **sentiment['details']},
            'strategy': {**entry_exit, 'recommendation': strategy},
            'grade':        grade,
            'grade_reason': grade_reason,
        })

    results.sort(key=lambda x: x['total_score'], reverse=True)

    # ════════════════════════════════════════════════════
    # 大盤趨勢判斷（TAIEX MA20/MA60 排列判定，不依賴漲跌家數）
    # ════════════════════════════════════════════════════
    taiex_info = fetch_taiex_trend()
    market_trend = taiex_info['trend']           # 'strongly_bullish'/'bullish'/'neutral'/'bearish'/'strongly_bearish'
    trend_label  = taiex_info['trend_label']     # '強多頭'/'多頭'/'中性'/'空頭'/'強空頭'
    # 只在大盤真的站在 MA20/MA60 下方才算空頭
    is_bear_market = market_trend in ('bearish', 'strongly_bearish')

    # 今日盤面（漲跌家數比例，僅供報告顯示用，不影響多空判定）
    up_count   = sum(1 for r in results if r['change_pct'] > 0)
    down_count = sum(1 for r in results if r['change_pct'] < 0)
    bull_ratio = up_count / len(results) if results else 0.5
    if bull_ratio >= 0.55:
        day_breadth_label = '強勢'
    elif bull_ratio >= 0.40:
        day_breadth_label = '偏強'
    elif bull_ratio >= 0.30:
        day_breadth_label = '偏弱'
    else:
        day_breadth_label = '弱勢'

    ma60_bias_str = f"{taiex_info['ma60_bias_pct']:+.1f}%" if taiex_info['taiex_close'] > 0 else 'N/A'
    if verbose:
        print(f"[大盤] 趨勢：{trend_label} (TAIEX {taiex_info['taiex_close']:.0f} vs MA60 {ma60_bias_str})")
        print(f"[盤面] 上漲 {up_count} 家 / 下跌 {down_count} 家 ({bull_ratio:.1%}) → {day_breadth_label}"
              f" | {'⚠️ 空頭環境（加權指數低於 MA20/MA60）' if is_bear_market else '多頭/中性環境，正常篩選'}")

    # 漲停過濾（不建議追高）
    LIMIT_UP_THRESHOLD = 9.5
    limit_up_watchlist = []
    filtered_top       = []

    for r in results:
        today_chg = r['change_pct']
        if today_chg >= LIMIT_UP_THRESHOLD:
            r['watchlist_note'] = '已漲停，不建議追高'
            limit_up_watchlist.append(r)
            continue
        filtered_top.append(r)

    top10           = filtered_top[:10]
    extra_watchlist = limit_up_watchlist

    if verbose:
        print(f"[過濾] 推薦名單：{len(top10)} 檔 | 漲停排除：{len(limit_up_watchlist)} 檔")
        for w in limit_up_watchlist:
            print(f"  ⛔ {w['name']}({w['stock_id']}) 漲幅 {w['change_pct']:.1f}% ─ 已漲停，不建議追高")
        for w in extra_watchlist[:3]:
            if w not in limit_up_watchlist:
                print(f"  ⚠️  {w['name']}({w['stock_id']}) ─ {w.get('watchlist_note', '額外觀察')}")

    scan_elapsed = (datetime.now() - scan_start).total_seconds()
    if verbose:
        print(f"\n[完成] 有效掃描：{scanned_count}/{len(STOCK_POOL)} 檔 | 總耗時：{scan_elapsed:.1f}s")

    # ── 飆股快篩：漲幅>6% + 量比>2 + 創20日高（規則式，優先於ML）──
    def _is_explosive(r):
        hist_r = build_history_from_cache(cache, r['stock_id'])
        if len(hist_r) < 20:
            return False
        today_c = hist_r[-1]['close']
        max_20  = max(h['close'] for h in hist_r[-20:-1]) if len(hist_r) >= 20 else today_c
        vol_ratio = r.get('details', {}).get('vol_ratio_5', 0)
        return r['change_pct'] >= 6.0 and vol_ratio >= 2.0 and today_c >= max_20

    explosive_candidates = [r for r in results if _is_explosive(r)]
    explosive_candidates.sort(key=lambda x: (x['change_pct'], x['total_score']), reverse=True)
    explosive_top5_manual = explosive_candidates[:5]

    # 給飆股加 50 分紅利，並標記，同步更新推薦標籤
    for ex in explosive_top5_manual:
        ex['total_score'] += 50
        ex['strategy']['recommendation'] = determine_strategy(ex['total_score'])
        ex['is_explosive'] = True
        ex['explosive_note'] = '飆股爆發：漲幅>6% + 爆量 + 創高'
        if 'surge_probability' not in ex:
            ex['surge_probability'] = min(ex['change_pct'] * 5.0, 85.0)  # heuristic estimate
        if 'features' not in ex:
            ex['features'] = {}
        if 'ml_signals' not in ex:
            ex['ml_signals'] = ['飆股爆發：漲幅>6% + 爆量 + 創高']

    if explosive_top5_manual:
        if verbose:
            print(f"[飆股] 快篩命中 {len(explosive_top5_manual)} 檔：{[r['stock_id'] for r in explosive_top5_manual]}")
        # 重新排序 results（含加分後的飆股）
        results.sort(key=lambda x: x['total_score'], reverse=True)
        # 重建 filtered_top（排除漲停/空頭過濾但保留飆股）
        filtered_top_ids = {r['stock_id'] for r in filtered_top}
        explosive_ids    = {r['stock_id'] for r in explosive_top5_manual}
        # 飆股強制加入 filtered_top（即使漲幅>=9.5% 也放行，因已是爆發確認）
        for ex in explosive_top5_manual:
            if ex['stock_id'] not in filtered_top_ids:
                filtered_top.insert(0, ex)
        filtered_top.sort(key=lambda x: x['total_score'], reverse=True)
        top10 = filtered_top[:10]

    # ── ML 爆漲股預測 ──────────────────────────────────────────
    explosive_top5_ml = []
    try:
        explosive_top5_ml = predict_explosive_stocks(all_stock_data_for_ml)
    except Exception as e:
        print(f"[ML] 預測模型執行失敗：{e}，跳過")

    # 合併：規則式快篩優先，ML 補充
    if explosive_top5_manual:
        explosive_top5 = explosive_top5_manual + explosive_top5_ml[:5]
    else:
        explosive_top5 = explosive_top5_ml[:5]

    # ── 文字報告 ───────────────────────────────────────────────
    lines = [
        f"【台股五維分析報告】{today_str}",
        f"掃描：{scanned_count}/{len(STOCK_POOL)} 檔 | 權重：技術 25%+ 基本面 23%+ 消息 32%+ 情緒 12%+ 籌碼 8%",
        f"資料來源：TWSE OpenAPI (STOCK_DAY_ALL + BWIBBU_ALL) | 總耗時：{scan_elapsed:.0f}s（API {dl_elapsed:.0f}s）",
        "",
        "── Top 10 推薦 ──",
    ]
    for i, r in enumerate(top10, 1):
        tech_sigs    = ', '.join(r['signals']['technical'][:3])
        holding_note = get_holding_advice(r['strategy']['recommendation'])
        lines.append(f"{i}. {r['name']}({r['stock_id']}) 總分:{r['total_score']:.1f} 收盤:{r['close']} ({r['change_pct']:+.2f}%)")
        t1 = r['strategy'].get('target1', r['strategy'].get('target', ''))
        t2 = r['strategy'].get('target2', '')
        t3 = r['strategy'].get('target3', '')
        target_str = f"第一關:{t1}"
        if t2: target_str += f" 第二關:{t2}"
        if t3: target_str += f" 第三關:{t3}"
        lines.append(f"   技術:[{tech_sigs}] 進場:{r['strategy']['entry']} {target_str} 停損:{r['strategy']['stop_loss']}")
        lines.append(f"   策略:{r['strategy']['recommendation']}")
        if holding_note:
            lines.append(f"   持有建議:{holding_note}")
        lines.append("")

    lines.append("── 爆漲股預測 Top 5（ML 隔日漲停機率）──")
    if explosive_top5:
        for i, p in enumerate(explosive_top5, 1):
            ml_sigs = p.get('ml_signals', [])
            sigs = ', '.join(ml_sigs[:3]) if ml_sigs else p.get('explosive_note', '規則式快篩')
            feat = p.get('features', {})
            rsi_val = feat.get('rsi', '—')
            vr_val  = feat.get('vol_ratio_5', '—')
            m5_val  = feat.get('momentum_5', 0)
            tr_val  = feat.get('turnover', 0)
            lines.append(f"{i}. {p['name']}({p['stock_id']}) 漲停機率:{p['surge_probability']:.1f}% 收盤:{p['close']} ({p['change_pct']:+.2f}%)")
            if isinstance(rsi_val, (int, float)) and isinstance(vr_val, (int, float)):
                lines.append(f"   RSI:{rsi_val} 量比:{vr_val:.1f}x 5 日動能:{m5_val:+.1f}% 周轉:{tr_val:.1f}%")
            elif isinstance(vr_val, (int, float)):
                lines.append(f"   量比:{vr_val:.1f}x 5 日動能:{m5_val:+.1f}% 周轉:{tr_val:.1f}%")
            lines.append(f"   訊號:[{sigs}]\n")
    else:
        lines.append("   (資料不足，無法預測)")

    text_report = '\n'.join(lines)
    if verbose:
        print(text_report)

    # ── 個股回測（Top10 並行）─────────────────────────────────
    backtest_map = {}
    if _BACKTEST_AVAILABLE:
        from concurrent.futures import ThreadPoolExecutor as _TPE, as_completed as _as_completed
        def _bt_worker(sid):
            try:
                return sid, _run_per_stock_backtest(sid, strategy='all', days=60)
            except Exception as _e:
                return sid, {'error': str(_e)}
        top10_ids = [r['stock_id'] for r in top10]
        if verbose:
            print(f"\n[回測] 對 Top10 {len(top10_ids)} 檔執行個股回測...")
        with _TPE(max_workers=5) as _ex:
            _futs = {_ex.submit(_bt_worker, sid): sid for sid in top10_ids}
            for _fut in _as_completed(_futs):
                _sid, _res = _fut.result()
                backtest_map[_sid] = _res
        if verbose:
            print(f"[回測] 完成 {len(backtest_map)} 檔")
        for r in top10:
            bt       = backtest_map.get(r['stock_id'], {})
            best_key = bt.get('best_strategy', '')
            best_sd  = bt.get('strategies', {}).get(best_key, {})
            r['backtest_summary'] = {
                'best_strategy':     bt.get('best_strategy_name', '—'),
                'win_rate':          best_sd.get('win_rate', 0),
                'profit_factor':     best_sd.get('profit_factor', 0),
                'sharpe':            best_sd.get('sharpe', 0),
                'max_drawdown':      best_sd.get('max_drawdown', 0),
                'best_entry_signal': best_sd.get('best_entry_signal', '—'),
                'stop_loss_pct':     bt.get('params', {}).get('stop_loss_pct', -5),
                'take_profit_pct':   bt.get('params', {}).get('take_profit_pct', 10),
            }

    return {
        'scan_date':        today_str,
        'scan_start':       scan_start.strftime('%Y-%m-%d %H:%M:%S'),
        'scan_elapsed_sec': round(scan_elapsed, 1),
        'dl_elapsed_sec':   round(dl_elapsed, 1),
        'scanned_count':    scanned_count,
        'total_stocks':     len(STOCK_POOL),
        'top10':            top10,
        'all_results':      results,
        'explosive_top5':   explosive_top5,
        'text_report':      text_report,
        'backtest_map':     backtest_map,
        'extra_watchlist':  extra_watchlist,
        'bull_ratio':       round(bull_ratio, 4),
        'up_count':         up_count,
        'down_count':       down_count,
        'day_breadth_label': day_breadth_label,
        'is_bear_market':   is_bear_market,
        'market_trend':     market_trend,
        'trend_label':      trend_label,
        'taiex_close':      taiex_info['taiex_close'],
        'taiex_ma20':       taiex_info['ma20'],
        'taiex_ma60':       taiex_info['ma60'],
        'taiex_ma20_bias':  taiex_info['ma20_bias_pct'],
        'taiex_ma60_bias':  taiex_info['ma60_bias_pct'],
    }


# ================================================================
# 初始化：模組層級載入股票清單（供 generate_report_v5.py 等引用）
# ================================================================
print("[系統] 載入台股股票清單（TWSE OpenAPI v7.0）...")
# 延遲初始化：STOCK_POOL 在 run_five_dimension_scan() 內動態建立，
# 此處提供一個快取命中時的靜態備用值，避免 import 時觸發 API 呼叫
_cached_pool = load_stock_list_cache()
STOCK_POOL   = _cached_pool if _cached_pool else {}
print(f"[系統] 預載股票清單：{len(STOCK_POOL)} 檔（正式掃描時會用 STOCK_DAY_ALL 補充）")


if __name__ == '__main__':
    print(f"[開始] {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    output  = run_five_dimension_scan(verbose=True)
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scan_result.json')

    safe_output = json.loads(json.dumps(output, ensure_ascii=False, default=str))
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(safe_output, f, ensure_ascii=False, indent=2)
    print(f"\n[JSON 已儲存] {out_path}")

    # ── 輸出 all_scores.json：每檔股票五維評分快照，供前端自主檢查功能使用 ──
    all_scores_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'all_scores.json')
    all_scores_data = {
        'scan_date': output['scan_date'],
        'scanned_count': output['scanned_count'],
        'all_stock_scores': [
            {
                'stock_id':   r['stock_id'],
                'name':       r['name'],
                'sector':     r['sector'],
                'close':      r['close'],
                'change_pct': r['change_pct'],
                'total_score': r['total_score'],
                'dimensions': r['dimensions'],
                'signals':    r['signals'],
                'strategy':   r['strategy'],
            }
            for r in output.get('all_results', [])
        ],
    }
    safe_all_scores = json.loads(json.dumps(all_scores_data, ensure_ascii=False, default=str))
    with open(all_scores_path, 'w', encoding='utf-8') as f:
        json.dump(safe_all_scores, f, ensure_ascii=False, indent=2)
    print(f"[all_scores.json 已儲存] {all_scores_path}（{len(safe_all_scores['all_stock_scores'])} 檔）")

    print(f"\n=== 掃描摘要 ===")
    print(f"開始時間: {output['scan_start']}")
    print(f"結束時間: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"STOCK_POOL 大小: {output['total_stocks']} 檔")
    print(f"有效掃描: {output['scanned_count']} 檔")
    print(f"總耗時: {output['scan_elapsed_sec']}s（其中 API {output['dl_elapsed_sec']}s）")
    print(f"\nTop 10 推薦:")
    for i, r in enumerate(output['top10'], 1):
        print(f"  {i}. {r['name']}({r['stock_id']}) 總分:{r['total_score']:.1f} [{r['strategy']['recommendation']}]")
    print(f"\n爆漲 Top 5:")
    for i, p in enumerate(output.get('explosive_top5', []), 1):
        print(f"  {i}. {p['name']}({p['stock_id']}) 漲停機率:{p['surge_probability']:.1f}%")
    print(f"\n[結束] {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


# ================================================================
# GitHub Pages 自動同步（每次掃描後自動 push）
# ================================================================
def push_scan_to_github(scan_result: dict, all_scores: dict, task_dir: str):
    """
    將掃描結果 push 到 GitHub Pages repo (juststarlight66-oss/taiwan-stock-radar)
    更新 public/data/ 下的：
      - latest.json
      - scan_result_YYYYMMDD.json
      - all_scores.json
      - index.json（日期索引）
    使用 GitHub REST API + Personal Access Token (從環境變數或 ~/.nebula-env)
    """
    import base64, re

    OWNER  = 'juststarlight66-oss'
    REPO   = 'taiwan-stock-radar'
    BRANCH = 'main'

    # ── 取得 GitHub Token ────────────────────────────────────────
    token = os.environ.get('GITHUB_TOKEN', '')
    if not token:
        env_file = os.path.expanduser('~/.nebula-env')
        if os.path.exists(env_file):
            with open(env_file) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('GITHUB_TOKEN='):
                        token = line.split('=', 1)[1].strip().strip('"').strip("'")
                        break
    if not token:
        print('[GitHub Push] 找不到 GITHUB_TOKEN，跳過同步')
        return

    headers = {
        'Authorization': f'token {token}',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
    }
    api_base = f'https://api.github.com/repos/{OWNER}/{REPO}/contents/public/data'

    def get_sha(path_in_repo: str) -> str:
        """取得檔案現有 SHA（更新時需要）"""
        try:
            r = requests.get(
                f'https://api.github.com/repos/{OWNER}/{REPO}/contents/{path_in_repo}',
                headers=headers, timeout=15
            )
            if r.status_code == 200:
                return r.json().get('sha', '')
        except Exception:
            pass
        return ''

    def push_file(path_in_repo: str, content_str: str, commit_msg: str):
        """push 單一 JSON 檔案"""
        encoded = base64.b64encode(content_str.encode('utf-8')).decode('ascii')
        sha = get_sha(path_in_repo)
        payload = {'message': commit_msg, 'content': encoded, 'branch': BRANCH}
        if sha:
            payload['sha'] = sha
        r = requests.put(
            f'https://api.github.com/repos/{OWNER}/{REPO}/contents/{path_in_repo}',
            headers=headers, json=payload, timeout=30
        )
        if r.status_code in (200, 201):
            print(f'[GitHub Push] ✅ {path_in_repo}')
        else:
            print(f'[GitHub Push] ❌ {path_in_repo} → {r.status_code}: {r.text[:200]}')

    # ── 解析掃描日期 → YYYYMMDD ──────────────────────────────────
    raw_date = scan_result.get('scan_date', '')           # e.g. "2026/05/01"
    date_key = re.sub(r'\D', '', raw_date)                # "20260501"
    if not date_key:
        date_key = datetime.now().strftime('%Y%m%d')

    print(f'\n[GitHub Push] 開始同步 (日期={date_key})...')

    scan_json      = json.dumps(scan_result, ensure_ascii=False, indent=2)
    all_scores_json = json.dumps(all_scores, ensure_ascii=False, indent=2)

    commit_msg = f'chore: 自動同步掃描結果 {date_key} ({scan_result.get("scanned_count",0)} 檔)'

    # 1. latest.json
    push_file('public/data/latest.json', scan_json, commit_msg)

    # 2. scan_result_YYYYMMDD.json
    push_file(f'public/data/scan_result_{date_key}.json', scan_json, commit_msg)

    # 3. all_scores.json
    push_file('public/data/all_scores.json', all_scores_json, commit_msg)

    # 4. index.json — 更新日期清單
    try:
        idx_sha = get_sha('public/data/index.json')
        idx_data = {'dates': []}
        if idx_sha:
            r = requests.get(
                f'https://api.github.com/repos/{OWNER}/{REPO}/contents/public/data/index.json',
                headers=headers, timeout=15
            )
            if r.status_code == 200:
                raw = base64.b64decode(r.json()['content']).decode('utf-8')
                idx_data = json.loads(raw)

        dates = idx_data.get('dates', [])
        # 轉成 YYYY-MM-DD 格式加入
        fmt_date = f'{date_key[:4]}-{date_key[4:6]}-{date_key[6:]}'
        if fmt_date not in dates:
            dates.insert(0, fmt_date)
            dates = dates[:90]  # 只保留最近 90 天
        idx_data['dates'] = dates
        push_file('public/data/index.json', json.dumps(idx_data, ensure_ascii=False, indent=2), commit_msg)
    except Exception as e:
        print(f'[GitHub Push] index.json 更新失敗: {e}')

    print('[GitHub Push] 同步完成 🚀')

    # ── 自動 push 到 GitHub Pages ────────────────────────────────
    try:
        push_scan_to_github(safe_output, safe_all_scores, os.path.dirname(os.path.abspath(__file__)))
    except Exception as e:
        print(f'[GitHub Push] 失敗（不影響 Email 寄送）: {e}')
