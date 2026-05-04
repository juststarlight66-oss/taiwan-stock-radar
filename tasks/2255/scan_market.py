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


def _http_get(url, *, headers=None, timeout=30, verify=False, retries=3, backoff=2.0):
    """帶 retry 的 requests.get 包裝（最多重試 retries 次，指數退避 backoff 秒）"""
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            r = requests.get(url, headers=headers, timeout=timeout, verify=verify)
            r.raise_for_status()
            return r
        except Exception as e:
            last_err = e
            if attempt < retries:
                wait = backoff * (2 ** (attempt - 1))
                print(f"[HTTP] 第 {attempt} 次失敗，{wait:.0f}s 後重試：{e}")
                time.sleep(wait)
    raise last_err

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
        r = _http_get(url, headers=TWSE_HEADERS, timeout=30, verify=False)
        resp = r.json()
    except Exception as e:
        print(f"[API] STOCK_DAY_ALL 失敗（已重試3次）：{e}")
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
        except Exception as e:
            print(f"[WARN] STOCK_DAY_ALL 列解析失敗：{e}")
            continue

    print(f"[API] STOCK_DAY_ALL 解析完成：{len(result)} 檔 (日期5{ad_date})")
    return result