#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台股五維分析掃描腳本 - 22:55 收盤報告核心引擎
版本：v7.1 (TWSE+TPEx 全市場覆蓋)
優化項目：
  - 移除 yfinance，改用 openapi.twse.com.tw (WAF 白名單，sandbox 可存取)
  - STOCK_DAY_ALL 單次 HTTP 呼叫取得全部 ~1,082 檔上市股票當日 OHLCV
  - TPEx tpex_mainboard_daily_close_quotes 新增上櫃 ~883 檔，合併後覆蓋 ~1,965 檔
  - BWIBBU_ALL + TPEx tpex_mainboard_peratio_analysis 合併 PE/PBR/殖利率（全市場）
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
from datetime import datetime, timedelta, date, timezone
from typing import Any, Dict, List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
requests.packages.urllib3.disable_warnings()

# 台灣時區 UTC+8
_TW_TZ = timezone(timedelta(hours=8))


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
URL_T86           = "https://openapi.twse.com.tw/v1/exchangeReport/T86"
URL_MI_MARGN      = "https://openapi.twse.com.tw/v1/exchangeReport/MI_MARGN"


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
    today = datetime.now(_TW_TZ).strftime('%Y%m%d')
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

    print(f"[API] STOCK_DAY_ALL 解析完成：{len(result)} 檔 (日期={ad_date})")
    return result


def fetch_tpex_day_all() -> Dict[str, Dict]:
    """
    從 TPEx OpenAPI 取得上櫃股票當日 OHLCV。
    API: https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes
    補充 fetch_stock_day_all() 的上市資料，合併後覆蓋 ~3100 檔。
    回傳格式與 fetch_stock_day_all() 相同：
    { stock_id: {date, open, high, low, close, volume, change, change_pct, name} }
    """
    today = datetime.now(_TW_TZ).strftime('%Y%m%d')
    url = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes'
    print('[API] 呼叫 TPEx tpex_mainboard_daily_close_quotes...')
    try:
        r = _http_get(url, headers=TWSE_HEADERS, timeout=30, verify=False)
        rows = r.json()
    except Exception as e:
        print(f'[API] TPEx OHLCV 失敗（已重試3次）：{e}')
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
        except Exception as e:
            print(f"[WARN] TPEx OHLCV 列解析失敗：{e}")
            continue

    print(f'[API] TPEx OHLCV 解析完成：{len(result)} 檔')
    return result


def fetch_tpex_bwibbu_all() -> Dict[str, Dict]:
    """
    從 TPEx OpenAPI 取得上櫃股票 PE/PBR/殖利率。
    API: https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis
    回傳格式與 fetch_bwibbu_all() 相同：
    { stock_id: {pe, dy, pb} }
    """
    url = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis'
    print('[API] 呼叫 TPEx tpex_mainboard_peratio_analysis...')
    try:
        r = _http_get(url, headers=TWSE_HEADERS, timeout=30, verify=False)
        rows = r.json()
    except Exception as e:
        print(f'[API] TPEx PE/PBR 失敗（已重試3次）：{e}')
        return {}

    if not isinstance(rows, list) or not rows:
        print('[API] TPEx PE/PBR 無資料（可能為非交易日）')
        return {}

    result = {}
    for row in rows:
        try:
            code = str(row.get('SecuritiesCompanyCode', '')).strip()
            if not (len(code) == 4 and code.isdigit()):
                continue
            def _clean(v):
                return str(v or '').replace(',', '').strip()
            pe_str = _clean(row.get('PriceEarningRatio', ''))
            pb_str = _clean(row.get('PriceBookRatio', ''))
            dy_str = _clean(row.get('YieldRatio', ''))
            result[code] = {
                'pe': float(pe_str) if pe_str not in ('--', '', '0', 'N/A') else None,
                'pb': float(pb_str) if pb_str not in ('--', '', '0', 'N/A') else None,
                'dy': float(dy_str) if dy_str not in ('--', '', '0', 'N/A') else None,
            }
        except Exception as e:
            print(f'[WARN] TPEx PE/PBR 列解析失敗：{e}')
            continue

    print(f'[API] TPEx PE/PBR 解析完成：{len(result)} 檔')
    return result


def fetch_t86_chips() -> Dict[str, Dict]:
    """
    從 TWSE T86 端點取得當日三大法人買賣超日報（上市股票）。
    端點：https://openapi.twse.com.tw/v1/exchangeReport/T86
    欄位：
      證券代號、證券名稱、外陸資買賣超股數、投信買賣超股數、自營商買賣超股數、三大法人買賣超股數
    回傳格式：
      { stock_id: {
          foreign_net: int,   # 外資（含陸資）買賣超張數（正=買超，負=賣超）
          trust_net:   int,   # 投信買賣超張數
          dealer_net:  int,   # 自營商買賣超張數
          total_net:   int,   # 三大法人合計買賣超張數
      } }
    非交易日或 API 失敗時回傳空 dict，analyze_chips 會降級到啟發式估算。
    """
    print("[API] 呼叫 T86 三大法人買賣超...")
    try:
        r = _http_get(URL_T86, headers=TWSE_HEADERS, timeout=30, verify=False)
        data = r.json()
    except Exception as e:
        print(f"[API] T86 失敗（已重試3次）：{e}")
        return {}

    if not isinstance(data, list) or not data:
        print("[API] T86 無資料（可能為非交易日）")
        return {}

    result = {}
    for row in data:
        try:
            code = str(row.get('證券代號', '') or row.get('Code', '')).strip()
            if not (len(code) == 4 and code.isdigit()):
                continue

            def _parse_net(v):
                s = str(v or '').replace(',', '').replace('+', '').strip()
                if not s or s in ('--', ''):
                    return 0
                try:
                    # API 回傳股數，除以 1000 轉為張數
                    return int(float(s) / 1000)
                except Exception:
                    return 0

            foreign_net = _parse_net(row.get('外陸資買賣超股數(不含外資自營商)', row.get('外陸資買賣超股數', 0)))
            trust_net   = _parse_net(row.get('投信買賣超股數', 0))
            dealer_net  = _parse_net(row.get('自營商買賣超股數(自行買賣)', row.get('自營商買賣超股數', 0)))
            total_net   = _parse_net(row.get('三大法人買賣超股數', 0))
            # 若 total_net 欄位缺失，用三者加總
            if total_net == 0 and (foreign_net or trust_net or dealer_net):
                total_net = foreign_net + trust_net + dealer_net

            result[code] = {
                'foreign_net': foreign_net,
                'trust_net':   trust_net,
                'dealer_net':  dealer_net,
                'total_net':   total_net,
            }
        except Exception as e:
            print(f"[WARN] T86 列解析失敗：{e}")
            continue

    print(f"[API] T86 解析完成：{len(result)} 檔")
    return result


def fetch_margin_data() -> Dict[str, Dict]:
    """
    從 TWSE MI_MARGN 端點取得當日融資融券餘額。
    端點：https://openapi.twse.com.tw/v1/exchangeReport/MI_MARGN
    欄位：
      股票代號、融資買進、融資賣出、融資現償、融資餘額、融資限額、
      融券賣出、融券買進、融券現償、融券餘額、融券限額、資券互抵
    回傳格式：
      { stock_id: {
          margin_bal:       int,   # 融資餘額（張）
          short_bal:        int,   # 融券餘額（張）
          margin_buy:       int,   # 當日融資買進（張）
          margin_sell:      int,   # 當日融資賣出（張）
          short_sell:       int,   # 當日融券賣出（張）
          short_cover:      int,   # 當日融券買回（張）
          margin_bal_chg:   int,   # 融資餘額變化 = margin_buy - margin_sell（估）
      } }
    非交易日或 API 失敗時回傳空 dict，analyze_chips 會降級到啟發式估算。
    """
    print("[API] 呼叫 MI_MARGN 融資融券餘額...")
    try:
        r = _http_get(URL_MI_MARGN, headers=TWSE_HEADERS, timeout=30, verify=False)
        data = r.json()
    except Exception as e:
        print(f"[API] MI_MARGN 失敗（已重試3次）：{e}")
        return {}

    if not isinstance(data, list) or not data:
        print("[API] MI_MARGN 無資料（可能為非交易日）")
        return {}

    result = {}
    for row in data:
        try:
            code = str(row.get('股票代號', '') or row.get('Code', '')).strip()
            if not (len(code) == 4 and code.isdigit()):
                continue

            def _parse_lots(v):
                s = str(v or '').replace(',', '').strip()
                if not s or s in ('--', ''):
                    return 0
                try:
                    return int(float(s))
                except Exception:
                    return 0

            margin_buy  = _parse_lots(row.get('融資買進', 0))
            margin_sell = _parse_lots(row.get('融資賣出', 0))
            margin_bal  = _parse_lots(row.get('融資餘額', 0))
            short_sell  = _parse_lots(row.get('融券賣出', 0))
            short_cover = _parse_lots(row.get('融券買進', 0))
            short_bal   = _parse_lots(row.get('融券餘額', 0))

            result[code] = {
                'margin_bal':     margin_bal,
                'short_bal':      short_bal,
                'margin_buy':     margin_buy,
                'margin_sell':    margin_sell,
                'short_sell':     short_sell,
                'short_cover':    short_cover,
                'margin_bal_chg': margin_buy - margin_sell,
            }
        except Exception as e:
            print(f"[WARN] MI_MARGN 列解析失敗：{e}")
            continue

    print(f"[API] MI_MARGN 解析完成：{len(result)} 檔")
    return result


def fetch_bwibbu_all() -> Dict[str, Dict]:
    """
    從 BWIBBU_ALL 取得所有股票的 PE/PBR/殖利率。
    回傳格式：{ stock_id: {PEratio, DividendYield, PBratio} }
    """
    print("[API] 呼叫 BWIBBU_ALL...")
    try:
        r = _http_get(URL_BWIBBU_ALL, headers=TWSE_HEADERS, timeout=30, verify=False)
        data = r.json()
    except Exception as e:
        print(f"[API] BWIBBU_ALL 失敗（已重試3次）：{e}")
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
        except Exception as e:
            print(f"[WARN] BWIBBU_ALL 列解析失敗：{e}")
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
            r = _http_get(
                "https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK",
                headers=TWSE_HEADERS, timeout=20, verify=False)
            for row in r.json():
                try:
                    v = float(str(row.get('TAIEX', '')).replace(',', '').strip())
                    if v > 0:
                        closes.append(v)
                except Exception as e:
                    print(f"[WARN] FMTQIK 列解析失敗：{e}")
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
    today_key = sample.get('date', datetime.now(_TW_TZ).strftime('%Y%m%d'))

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
        # Make cached_at timezone-aware for comparison with _TW_TZ aware datetime
        if cached_at.tzinfo is None:
            cached_at = cached_at.replace(tzinfo=_TW_TZ)
        age_hours = (datetime.now(_TW_TZ) - cached_at).total_seconds() / 3600
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
        data = {'cached_at': datetime.now(_TW_TZ).isoformat(), 'stocks': stocks}
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
            response = _http_get(url, timeout=30, verify=False)
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
        r = _http_get(
            'https://openapi.twse.com.tw/v1/opendata/t187ap03_L',
            headers=TWSE_HEADERS, timeout=20, verify=False
        )
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


# ================================================================
# 族群強弱排名：從 MI_INDEX 抓取 37 個官方產業類指數漲跌幅
# ================================================================
_SECTOR_RANKING_CACHE: Dict[str, Any] = {}  # 當日快取，避免重複呼叫

# MI_INDEX 指數名稱 → TWSE 官方產業別名稱 mapping
_MI_INDEX_TO_SECTOR: Dict[str, str] = {
    '水泥類指數':       '水泥工業',
    '食品類指數':       '食品工業',
    '塑膠類指數':       '塑膠工業',
    '紡織纖維類指數':   '紡織纖維',
    '電機機械類指數':   '電機機械',
    '電器電纜類指數':   '電器電纜',
    '化學類指數':       '化學工業',
    '生技醫療類指數':   '生技醫療業',
    '玻璃陶瓷類指數':   '玻璃陶瓷',
    '造紙類指數':       '造紙工業',
    '鋼鐵類指數':       '鋼鐵工業',
    '橡膠類指數':       '橡膠工業',
    '汽車類指數':       '汽車工業',
    '電子工業類指數':   '電子工業',
    '半導體類指數':     '半導體業',
    '電腦及週邊設備類指數': '電腦及週邊設備業',
    '光電類指數':       '光電業',
    '通信網路類指數':   '通信網路業',
    '電子零組件類指數': '電子零組件業',
    '電子通路類指數':   '電子通路業',
    '資訊服務類指數':   '資訊服務業',
    '其他電子類指數':   '其他電子業',
    '建材營造類指數':   '建材營造業',
    '航運類指數':       '航運業',
    '觀光餐旅類指數':   '觀光餐旅業',
    '金融保險類指數':   '金融保險業',
    '貿易百貨類指數':   '貿易百貨業',
    '油電燃氣類指數':   '油電燃氣業',
    '綠能環保類指數':   '綠能環保業',
    '數位雲端類指數':   '數位雲端業',
    '運動休閒類指數':   '運動休閒業',
    '居家生活類指數':   '居家生活業',
    '其他類指數':       '其他業',
    '化學生技醫療類指數': '化學生技醫療',
    '機電類指數':       '機電',
    '塑膠化工類指數':   '塑膠化工',
    '水泥窯製類指數':   '水泥窯製',
}


def fetch_sector_ranking() -> Dict[str, Any]:
    """
    從 TWSE MI_INDEX 抓取各產業類指數漲跌幅，
    回傳 sector_name → {change_pct, rank, index_name} 的字典，
    以及 sector_ranking 清單（依漲跌幅由高到低）。
    結果當日快取（避免同一次掃描重複呼叫）。
    """
    global _SECTOR_RANKING_CACHE
    today = datetime.now(_TW_TZ).strftime('%Y%m%d')
    if _SECTOR_RANKING_CACHE.get('date') == today:
        return _SECTOR_RANKING_CACHE

    print('[族群排名] 從 MI_INDEX 抓取產業類指數漲跌幅...')
    sector_map: Dict[str, Dict] = {}
    ranking_list: list = []
    try:
        r = _http_get(
            'https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX',
            headers=TWSE_HEADERS, timeout=20, verify=False
        )
        data = r.json()
        rows = [
            row for row in data
            if '類指數' in row.get('指數', '')
            and '報酬' not in row.get('指數', '')
            and '兩倍' not in row.get('指數', '')
            and '反向' not in row.get('指數', '')
            and '槓桿' not in row.get('指數', '')
        ]
        # 解析漲跌幅
        parsed = []
        for row in rows:
            idx_name = row.get('指數', '')
            try:
                pct_raw = str(row.get('漲跌百分比', '0')).replace(',', '').replace('%', '').strip()
                pct = float(pct_raw)
                sign = row.get('漲跌', '+')
                if sign == '-' and pct > 0:
                    pct = -pct
            except Exception:
                pct = 0.0
            sector_name = _MI_INDEX_TO_SECTOR.get(idx_name, idx_name.replace('類指數', '').replace('類', ''))
            parsed.append({'index_name': idx_name, 'sector_name': sector_name, 'change_pct': pct})

        # 依漲跌幅由高到低排名
        parsed.sort(key=lambda x: x['change_pct'], reverse=True)
        for rank, item in enumerate(parsed, 1):
            item['rank'] = rank
            sector_map[item['sector_name']] = {
                'change_pct': item['change_pct'],
                'rank':       rank,
                'index_name': item['index_name'],
            }
            ranking_list.append({
                'rank':        rank,
                'sector_name': item['sector_name'],
                'change_pct':  item['change_pct'],
                'index_name':  item['index_name'],
            })

        print(f'[族群排名] 解析完成：{len(ranking_list)} 個產業 | '
              f'Top2：{ranking_list[0]["sector_name"]}({ranking_list[0]["change_pct"]:+.2f}%) '
              f'{ranking_list[1]["sector_name"]}({ranking_list[1]["change_pct"]:+.2f}%)')
    except Exception as e:
        print(f'[族群排名] 抓取失敗：{e}，跳過族群加成')

    _SECTOR_RANKING_CACHE = {
        'date':           today,
        'sector_map':     sector_map,
        'ranking_list':   ranking_list,
    }
    return _SECTOR_RANKING_CACHE


def apply_sector_boost(results: list, sector_ranking: Dict[str, Any]) -> list:
    """
    對五維評分後的結果套用族群加成（動態配額版）：

    設計意圖：
    - Top2 強勢族群（漲跌幅最高的 2 個，且 > 0）內的個股統一 +3 分
    - 動態配額限制：族群漲跌幅 >= 3% → 最多讓 5 檔受益；否則最多 3 檔
      （避免「其他電子業」這類大類別壟斷 Top10）
    - 配額按五維原始評分由高到低分配（只有分數夠高才拿到加成資格）
    - 在 signals['technical'] 中標記「族群強勢」
    - 在 r['sector_boost'] 記錄加成資訊
    """
    ranking_list = sector_ranking.get('ranking_list', [])
    if not ranking_list:
        return results  # 無族群資料，跳過加成

    # 取 Top2 強勢族群（漲跌幅 > 0 才算強勢）
    top2_sectors = [s for s in ranking_list[:2] if s['change_pct'] > 0]
    if not top2_sectors:
        return results

    # 為每個 Top2 族群計算配額上限（動態佔比）
    sector_quota: Dict[str, int] = {}
    for s in top2_sectors:
        quota = 5 if s['change_pct'] >= 3.0 else 3
        sector_quota[s['sector_name']] = quota

    # 追蹤每個族群已加成的檔數
    sector_used: Dict[str, int] = {s['sector_name']: 0 for s in top2_sectors}

    # results 已按五維評分由高到低排列，依序分配加成配額
    boosted_count = 0
    for r in results:
        r_sector      = r.get('sector', '')
        r_twse_sector = r.get('twse_sector', '')

        # 嘗試 match：先用 TWSE 官方產業別（精確），再用熱門題材 fallback
        matched_sector = None
        for top_s in top2_sectors:
            top_name = top_s['sector_name']
            # 1) TWSE 官方產業別精確 match
            if r_twse_sector and (r_twse_sector == top_name or
                                   top_name in r_twse_sector or
                                   r_twse_sector in top_name):
                matched_sector = top_s
                break
            # 2) 熱門題材 fallback
            if r_sector == top_name or top_name in r_sector or r_sector in top_name:
                matched_sector = top_s
                break

        if matched_sector:
            sname = matched_sector['sector_name']
            # 檢查配額是否還有剩餘
            if sector_used[sname] < sector_quota[sname]:
                boost_pct = matched_sector['change_pct']
                boost_pts = 3.0  # 固定加 3 分；配額才是差異關鍵
                r['total_score'] = round(r['total_score'] + boost_pts, 2)
                r['sector_boost'] = {
                    'boosted':      True,
                    'sector_name':  sname,
                    'sector_rank':  matched_sector['rank'],
                    'sector_pct':   boost_pct,
                    'boost_points': boost_pts,
                    'quota_used':   sector_used[sname] + 1,
                    'quota_max':    sector_quota[sname],
                }
                # 在 signals 中標記
                tech_signals = r.get('signals', {}).get('technical', [])
                boost_label  = (f"[族群強勢+{boost_pts:.0f}] {sname}"
                                f"({boost_pct:+.2f}%)"
                                f" {sector_used[sname]+1}/{sector_quota[sname]}")
                if boost_label not in tech_signals:
                    tech_signals.insert(0, boost_label)
                r.setdefault('signals', {})['technical'] = tech_signals
                sector_used[sname] += 1
                boosted_count += 1
            else:
                # 配額已滿，不加成
                r.setdefault('sector_boost', {'boosted': False, 'quota_full': True, 'sector_name': sname})
        else:
            r.setdefault('sector_boost', {'boosted': False})

    quota_summary = ', '.join(f'{k}:{v}/{sector_quota[k]}' for k, v in sector_used.items())
    print(f'[族群加成] Top2：{[s["sector_name"] for s in top2_sectors]} | '
          f'配額使用：{quota_summary} | 實際加成：{boosted_count} 檔')
    return results


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
        except Exception as e:
            print(f"[WARN] ML predict_proba 失敗 ({sid})：{e}")
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
    ma5  = sum(closes[-5:])  / 5
    ma10 = sum(closes[-10:]) / 10
    ma20 = sum(closes[-20:]) / 20
    # MA60: only valid when we have >= 60 data points; avoid collapsing to MA20
    n_cls = len(closes)
    ma60  = sum(closes[-60:])  / 60  if n_cls >= 60  else None
    ma120 = sum(closes[-120:]) / 120 if n_cls >= 120 else None
    ma_arr = 0
    # 短期排列 (3分): 收盤 > MA5(1), MA5 > MA10(2)
    if today['close'] > ma5: ma_arr += 1
    if ma5 > ma10: ma_arr += 2
    # 中期排列 (3分): MA10 > MA20(1), MA20 > MA60(2 — 只在有足夠資料時計算)
    if ma10 > ma20: ma_arr += 1
    if ma60 is not None and ma20 > ma60: ma_arr += 2
    elif ma60 is None: ma_arr += 1  # 資料不足60日：給部分分，不虛增也不扣光
    # 長期排列 (2分): MA60 > MA120 (只在有足夠資料時計算)
    if ma60 is not None and ma120 is not None and ma60 > ma120: ma_arr += 2
    elif ma60 is not None and ma120 is None: ma_arr += 1  # 有60日但無120日：給半分
    if ma_arr >= 7: signals.append('黃金多頭排列 (MA5>MA10>MA20>MA60>MA120)')
    elif ma_arr >= 5: signals.append('多頭排列')
    elif ma_arr >= 3: signals.append('部分多頭排列')
    else: signals.append('空頭排列')
    score += ma_arr
    details['ma_arrangement'] = ma_arr
    details['ma60_valid']  = ma60  is not None
    details['ma120_valid'] = ma120 is not None

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


def analyze_chips(hist, t86_row: Dict = None, margin_row: Dict = None) -> Dict:
    """籌碼面分析（滿分 10）：三大法人買賣超(4)、融資變化(3)、籌碼集中度(3)

    優先使用 TWSE 真實資料：
      t86_row   — fetch_t86_chips() 回傳的單檔 dict（外資/投信/自營商買賣超張數）
      margin_row — fetch_margin_data() 回傳的單檔 dict（融資融券餘額）
    兩者皆為 None 時降級到啟發式估算（維持向後相容）。
    """
    score       = 0
    sigs        = []
    det         = {}

    if not hist:
        return {'score': 0, 'signals': [], 'details': {}}

    today = hist[-1]
    n     = len(hist)

    # ── 1. 三大法人買賣超 (4 分) ──────────────────────────────────────
    if t86_row:
        total_net   = t86_row.get('total_net',   0)
        foreign_net = t86_row.get('foreign_net', 0)
        trust_net   = t86_row.get('trust_net',   0)
        det['t86_total_net']   = total_net
        det['t86_foreign_net'] = foreign_net
        det['t86_trust_net']   = trust_net

        if total_net >= 1000:
            score += 4; sigs.append(f'三大法人大買 (+{total_net:,}張)')
        elif total_net >= 300:
            score += 3; sigs.append(f'三大法人買超 (+{total_net:,}張)')
        elif total_net >= 0:
            score += 2; sigs.append(f'三大法人小買/持平 ({total_net:+,}張)')
        elif total_net >= -300:
            score += 1; sigs.append(f'三大法人小賣 ({total_net:+,}張)')
        else:
            score += 0; sigs.append(f'三大法人大賣 ({total_net:+,}張)')

        # 投信連買加分（投信動向對中小型股影響大）
        if trust_net >= 200:
            score = min(score + 1, 4); sigs.append(f'投信買超 (+{trust_net:,}張)')
        elif trust_net <= -200:
            score = max(score - 1, 0); sigs.append(f'投信賣超 ({trust_net:+,}張)')
    else:
        # 降級：用價格相對 20MA 推估法人方向
        if n >= 20:
            ma20 = sum(r['close'] for r in hist[-20:]) / 20
            if today['close'] > ma20 * 1.03:
                score += 3; sigs.append('法人買超(估，無T86資料)')
            elif today['close'] < ma20 * 0.97:
                score += 1; sigs.append('法人賣超(估，無T86資料)')
            else:
                score += 2; sigs.append('法人中性(估，無T86資料)')
        else:
            score += 1; sigs.append('法人方向未知(資料不足)')

    # ── 2. 融資變化 (3 分) ────────────────────────────────────────────
    if margin_row:
        margin_bal_chg = margin_row.get('margin_bal_chg', 0)
        margin_bal     = margin_row.get('margin_bal',     0)
        short_bal      = margin_row.get('short_bal',      0)
        det['margin_bal']     = margin_bal
        det['margin_bal_chg'] = margin_bal_chg
        det['short_bal']      = short_bal

        # 融資餘額增加（散戶追多）：適量增加屬健康，大幅增加有軋空風險
        if margin_bal_chg >= 500:
            score += 2; sigs.append(f'融資大增 (+{margin_bal_chg:,}張)')
        elif margin_bal_chg >= 100:
            score += 3; sigs.append(f'融資增加 (+{margin_bal_chg:,}張)')
        elif margin_bal_chg >= -100:
            score += 2; sigs.append(f'融資持平 ({margin_bal_chg:+,}張)')
        elif margin_bal_chg >= -500:
            score += 1; sigs.append(f'融資減少 ({margin_bal_chg:+,}張)')
        else:
            score += 0; sigs.append(f'融資大減 ({margin_bal_chg:+,}張)')

        # 融券餘額高（軋空題材）加分
        if margin_bal > 0 and short_bal / margin_bal >= 0.3:
            score = min(score + 1, score + 1); sigs.append(f'券資比高({short_bal/margin_bal*100:.0f}%)，軋空題材')
    else:
        # 降級：用近 3 日連漲/連跌趨勢估算融資方向
        if n >= 3:
            consec_up   = sum(1 for r in hist[-3:] if r.get('change_pct', 0) > 0)
            consec_down = sum(1 for r in hist[-3:] if r.get('change_pct', 0) < 0)
            if consec_up >= 2:
                score += 3; sigs.append('融資增(估，無MI_MARGN資料)')
            elif consec_down >= 2:
                score += 1; sigs.append('融資減(估，無MI_MARGN資料)')
            else:
                score += 2

    # ── 3. 籌碼集中度 (3 分) — 量比 + 漲跌幅組合 ─────────────────────
    # 此維度仍用 OHLCV 估算（TWSE 無直接散戶 vs 法人分散度公開 API）
    if n >= 2:
        avg_vol_prev = sum(r['volume'] for r in hist[:-1]) / (n - 1)
        vol_ratio    = today['volume'] / avg_vol_prev if avg_vol_prev > 0 else 1.0
        chg          = today.get('change_pct', 0)
        det['vol_ratio'] = round(vol_ratio, 2)

        if vol_ratio >= 2.0 and chg >= 2.0:
            score += 3; sigs.append('量價齊揚(籌碼集中)')
        elif vol_ratio >= 1.5 and chg >= 1.0:
            score += 2; sigs.append('量增價漲(籌碼承接)')
        elif vol_ratio < 0.6 and chg >= 2.0:
            score += 1; sigs.append('縮量上漲(籌碼鎖定)')
        elif vol_ratio < 0.6 and chg <= -1.0:
            score += 2; sigs.append('縮量整理(籌碼沉澱)')
        elif chg < -2.0 and vol_ratio >= 1.5:
            score += 0; sigs.append('量增殺跌(籌碼鬆動)')
        else:
            score += 1

    return {'score': min(max(score, 0), 10), 'signals': sigs, 'details': det}


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

    # ── 3. 量能趨勢 (8 分) — 近 5 日均量 vs 20 日均量（替代營收成長）──
    if hist and len(hist) >= 5:
        vols = [r['volume'] for r in hist]
        avg5  = sum(vols[-5:])  / 5
        avg20 = sum(vols[-20:]) / 20 if len(vols) >= 20 else avg5
        vol_trend = avg5 / avg20 if avg20 > 0 else 1.0
        if vol_trend >= 2.0:   vt_s = 8; signals.append(f'量能大幅擴增 ({vol_trend:.1f}x)')
        elif vol_trend >= 1.5: vt_s = 6; signals.append(f'量能擴增 ({vol_trend:.1f}x)')
        elif vol_trend >= 1.1: vt_s = 4; signals.append(f'量能溫增 ({vol_trend:.1f}x)')
        elif vol_trend >= 0.8: vt_s = 3; signals.append(f'量能持平 ({vol_trend:.1f}x)')
        else:                  vt_s = 1; signals.append(f'量能萎縮 ({vol_trend:.1f}x)')
        details['vol_trend'] = round(vol_trend, 2)
        scored_items.append((vt_s, 8))

    # ── 4. PBR (8 分) ──────────────────────────────────────────────
    if pb_val is not None and pb_val > 0:
        details['pb'] = round(pb_val, 2)
        if pb_val < 1:           pb_s = 8; signals.append(f'PBR 低估 ({pb_val:.1f}x)')
        elif pb_val <= 2:        pb_s = 6; signals.append(f'PBR 合理 ({pb_val:.1f}x)')
        elif pb_val <= 3:        pb_s = 4; signals.append(f'PBR 偏高 ({pb_val:.1f}x)')
        elif pb_val <= 5:        pb_s = 2; signals.append(f'PBR 高 ({pb_val:.1f}x)')
        else:                    pb_s = 0; signals.append(f'PBR 過高 ({pb_val:.1f}x)')
        scored_items.append((pb_s, 8))

    # ── 5. 殖利率 (8 分) ──────────────────────────────────────────
    if dy_val is not None and dy_val >= 0:
        details['dy'] = round(dy_val, 2)
        if dy_val > 6:           dy_s = 8; signals.append(f'高殖利率 ({dy_val:.1f}%)')
        elif dy_val >= 4:        dy_s = 6; signals.append(f'殖利率佳 ({dy_val:.1f}%)')
        elif dy_val >= 2:        dy_s = 4; signals.append(f'殖利率中等 ({dy_val:.1f}%)')
        elif dy_val >= 1:        dy_s = 2; signals.append(f'殖利率偏低 ({dy_val:.1f}%)')
        else:                    dy_s = 0; signals.append(f'無配息/低殖利率 ({dy_val:.1f}%)')
        scored_items.append((dy_s, 8))

    # ── 計算最終分數（按比例補足至 40 分）──────────────────────────
    if not scored_items:
        # 完全無資料：給基本分
        final_score = 20
        signals.append('基本面資料不足（給予基本分）')
    else:
        raw_score  = sum(s for s, _ in scored_items)
        raw_max    = sum(m for _, m in scored_items)
        # 按比例放大到 40 分
        final_score = round(raw_score / raw_max * 40, 1) if raw_max > 0 else 20

    return {
        'score':   min(max(final_score, 0), 40),
        'signals': signals,
        'details': details,
    }


def analyze_news(stock_id: str, sector: str, taiex_trend: Dict = None) -> Dict:
    """
    消息面分析（滿分 10）：產業熱度(4)、地緣政治風險(3)、美股連動(3)
    使用靜態規則 + 大盤趨勢加成（無需即時新聞 API）
    """
    score   = 0
    signals = []
    details = {}

    # ── 1. 產業熱度 (4 分) ────────────────────────────────────────
    HOT_SECTORS = {
        '矽光子': 4, 'AI伺服器': 4, '半導體': 3,
        'PCB': 3, '記憶體': 3, '低軌衛星': 4,
        '電網': 3, '綠能': 2, '生技醫療': 2,
        '電動車': 2, '被動元件': 2,
    }
    sector_score = HOT_SECTORS.get(sector, 1)
    score += sector_score
    if sector_score >= 4:
        signals.append(f'熱門題材族群：{sector}')
    elif sector_score >= 3:
        signals.append(f'強勢族群：{sector}')
    elif sector_score >= 2:
        signals.append(f'關注族群：{sector}')
    details['sector_heat'] = sector_score

    # ── 2. 地緣政治風險 (3 分) ────────────────────────────────────
    # 簡化：使用大盤趨勢作為代理指標
    trend = (taiex_trend or {}).get('trend', 'neutral')
    if trend in ('strongly_bullish', 'bullish'):
        geo_score = 3; signals.append('地緣政治風險低（大盤多頭）')
    elif trend == 'neutral':
        geo_score = 2; signals.append('地緣政治風險中等（大盤中性）')
    else:
        geo_score = 1; signals.append('地緣政治風險偏高（大盤空頭）')
    score += geo_score
    details['geopolitical'] = geo_score

    # ── 3. 美股連動 (3 分) ────────────────────────────────────────
    # 簡化：科技股與美股連動性高，傳統產業連動性低
    TECH_SECTORS = {'矽光子', 'AI伺服器', '半導體', 'PCB', '記憶體', '電動車', '被動元件'}
    if sector in TECH_SECTORS:
        if trend in ('strongly_bullish', 'bullish'):
            us_score = 3; signals.append('科技股受惠美股多頭')
        elif trend == 'neutral':
            us_score = 2; signals.append('科技股美股連動中性')
        else:
            us_score = 1; signals.append('科技股受美股空頭拖累')
    else:
        us_score = 2  # 非科技股：中性
    score += us_score
    details['us_market'] = us_score

    return {
        'score':   min(max(score, 0), 10),
        'signals': signals,
        'details': details,
    }


def analyze_sentiment(hist: List[Dict], stock_id: str) -> Dict:
    """
    情緒面分析（滿分 10）：周轉率(4)、散戶參與度(3)、價格動能(3)
    """
    score   = 0
    signals = []
    details = {}

    if not hist:
        return {'score': 0, 'signals': ['無資料'], 'details': {}}

    today = hist[-1]
    n     = len(hist)

    # ── 1. 周轉率 (4 分) ──────────────────────────────────────────
    capital  = estimate_share_capital(stock_id)
    turnover = (today['volume'] / 1000) / capital * 100
    details['turnover'] = round(turnover, 2)

    if turnover >= 10:    to_s = 4; signals.append(f'超高周轉 ({turnover:.1f}%)')
    elif turnover >= 5:   to_s = 3; signals.append(f'高周轉 ({turnover:.1f}%)')
    elif turnover >= 2:   to_s = 2; signals.append(f'正常周轉 ({turnover:.1f}%)')
    elif turnover >= 0.5: to_s = 1; signals.append(f'低周轉 ({turnover:.1f}%)')
    else:                 to_s = 0; signals.append(f'極低周轉 ({turnover:.1f}%)')
    score += to_s

    # ── 2. 散戶參與度 (3 分) — 用成交量異常程度估算 ──────────────
    if n >= 6:
        avg_vol5 = sum(r['volume'] for r in hist[-6:-1]) / 5
        vol_ratio = today['volume'] / avg_vol5 if avg_vol5 > 0 else 1.0
        details['vol_ratio'] = round(vol_ratio, 2)

        if vol_ratio >= 3.0:   rp_s = 3; signals.append(f'散戶瘋搶 ({vol_ratio:.1f}x)')
        elif vol_ratio >= 1.8: rp_s = 2; signals.append(f'散戶積極 ({vol_ratio:.1f}x)')
        elif vol_ratio >= 1.0: rp_s = 1; signals.append(f'散戶觀望 ({vol_ratio:.1f}x)')
        else:                  rp_s = 0; signals.append(f'散戶冷淡 ({vol_ratio:.1f}x)')
        score += rp_s
    else:
        score += 1

    # ── 3. 價格動能 (3 分) — 近 5 日漲幅 ────────────────────────
    if n >= 5:
        mom_5 = (hist[-1]['close'] - hist[-5]['close']) / hist[-5]['close'] * 100 if hist[-5]['close'] > 0 else 0
        details['momentum_5d'] = round(mom_5, 2)

        if mom_5 >= 10:    pm_s = 3; signals.append(f'強勢動能 (+{mom_5:.1f}%)')
        elif mom_5 >= 5:   pm_s = 2; signals.append(f'正向動能 (+{mom_5:.1f}%)')
        elif mom_5 >= 0:   pm_s = 1; signals.append(f'微弱動能 (+{mom_5:.1f}%)')
        elif mom_5 >= -5:  pm_s = 1; signals.append(f'輕微回檔 ({mom_5:.1f}%)')
        else:              pm_s = 0; signals.append(f'回檔修正 ({mom_5:.1f}%)')
        score += pm_s
    else:
        chg = today.get('change_pct', 0)
        score += 2 if chg > 0 else (0 if chg < -3 else 1)

    return {
        'score':   min(max(score, 0), 10),
        'signals': signals,
        'details': details,
    }


# ================================================================
# T+N 回測記錄追蹤
# ================================================================
def update_tn_tracking(top_results: List[Dict], scan_date: str) -> None:
    """
    將本次掃描的 Top 結果寫入 T+N 追蹤檔案。
    追蹤檔：tasks/2255/tn_records.json
    格式：[{ scan_date, stock_id, name, entry_price, t1/t3/t5_price, t1/t3/t5_return }, ...]
    """
    tn_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tn_records.json')
    try:
        if os.path.exists(tn_file):
            with open(tn_file, 'r', encoding='utf-8') as f:
                records = json.load(f)
        else:
            records = []
    except Exception:
        records = []

    today_codes = {r['stock_id'] for r in records if r.get('scan_date') == scan_date}

    for item in top_results:
        if item['stock_id'] in today_codes:
            continue
        entry = item.get('entry_price') or (item.get('hist', [{}])[-1].get('close') if item.get('hist') else None)
        records.append({
            'scan_date':   scan_date,
            'stock_id':    item['stock_id'],
            'name':        item['name'],
            'total_score': item.get('total_score', 0),
            'entry_price': entry,
            't1_price':    None,
            't3_price':    None,
            't5_price':    None,
            't1_return':   None,
            't3_return':   None,
            't5_return':   None,
        })

    try:
        with open(tn_file, 'w', encoding='utf-8') as f:
            json.dump(records, f, ensure_ascii=False, indent=2)
        print(f"[T+N] 追蹤記錄已更新：{tn_file}（共 {len(records)} 筆）")
    except Exception as e:
        print(f"[T+N] 追蹤記錄寫入失敗：{e}")


# ================================================================
# 進出場計算
# ================================================================
def calculate_entry_exit(stock_id: str, hist: List[Dict], tech: Dict) -> Dict:
    """
    計算建議進出場價位。
    進場：收盤價（明日開盤追進）
    停損：近 5 日最低價 * 0.97（-3%）
    目標1：進場價 * 1.05（+5%）
    目標2：進場價 * 1.10（+10%）
    目標3：進場價 * 1.20（+20%）
    """
    if not hist:
        return {}

    close = hist[-1]['close']
    entry = close  # 以收盤價為進場基準

    low_5d = min(r['low'] for r in hist[-5:]) if len(hist) >= 5 else close * 0.95
    stop_loss = round(low_5d * 0.97, 2)

    if entry <= 0:
        return {}

    upside_t1 = round((entry * 1.05 - entry) / entry * 100, 1)
    upside_t2 = round((entry * 1.10 - entry) / entry * 100, 1)
    upside_t3 = round((entry * 1.20 - entry) / entry * 100, 1)

    return {
        'entry':     round(entry, 2),
        'stop_loss': stop_loss,
        'target1':   round(entry * 1.05, 2),
        'target2':   round(entry * 1.10, 2),
        'target3':   round(entry * 1.20, 2),
        'upside_t1': upside_t1,
        'upside_t2': upside_t2,
        'upside_t3': upside_t3,
        'risk_reward': round(upside_t1 / ((entry - stop_loss) / entry * 100), 2) if entry > stop_loss else 0,
    }


# ================================================================
# 主掃描引擎
# ================================================================
def run_five_dimension_scan() -> Dict:
    """
    五維分析主引擎：掃描全市場股票，輸出 Top 10 綜合評分 + ML 爆漲預測 Top 5
    """
    scan_start = datetime.now(_TW_TZ)
    print(f"\n{'='*60}")
    print(f"台股五維分析掃描啟動 {scan_start.strftime('%Y-%m-%d %H:%M:%S')} (台灣時間)")
    print(f"{'='*60}\n")

    # ── Step 1: 載入大盤趨勢 ─────────────────────────────────────
    print("[Step 1] 載入大盤趨勢...")
    taiex_trend = fetch_taiex_trend()
    trend_label = taiex_trend.get('trend_label', '中性')
    print(f"[Step 1] 大盤趨勢：{trend_label} | 加權指數：{taiex_trend.get('taiex_close', 0):.0f}")

    # ── Step 2: 載入 TWSE 官方產業別對照表 ───────────────────────
    print("\n[Step 2] 載入 TWSE 官方產業別對照表...")
    industry_map = load_twse_industry_map()

    # ── Step 3: 並行抓取市場資料 ──────────────────────────────────
    print("\n[Step 3] 並行抓取市場資料...")
    with ThreadPoolExecutor(max_workers=6) as executor:
        f_twse  = executor.submit(fetch_stock_day_all)
        f_tpex  = executor.submit(fetch_tpex_day_all)
        f_bwibbu = executor.submit(fetch_bwibbu_all)
        f_tpex_bwibbu = executor.submit(fetch_tpex_bwibbu_all)
        f_t86   = executor.submit(fetch_t86_chips)
        f_margin = executor.submit(fetch_margin_data)
        f_sector = executor.submit(fetch_sector_ranking)

        twse_data    = f_twse.result()
        tpex_data    = f_tpex.result()
        bwibbu_data  = f_bwibbu.result()
        tpex_bwibbu  = f_tpex_bwibbu.result()
        t86_data     = f_t86.result()
        margin_data  = f_margin.result()
        sector_ranking = f_sector.result()

    # 合併上市+上櫃 OHLCV（上市優先，上櫃補充）
    all_ohlcv = {**tpex_data, **twse_data}  # twse_data 覆蓋 tpex_data（上市優先）
    # 合併 BWIBBU（TWSE+TPEx）
    all_bwibbu = {**tpex_bwibbu, **bwibbu_data}  # TWSE 優先

    print(f"[Step 3] TWSE:{len(twse_data)} 檔 | TPEx:{len(tpex_data)} 檔 | "
          f"合計:{len(all_ohlcv)} 檔 | BWIBBU:{len(all_bwibbu)} 檔 | "
          f"T86:{len(t86_data)} 檔 | MI_MARGN:{len(margin_data)} 檔")

    # ── Step 4: 更新日線快取 ──────────────────────────────────────
    print("\n[Step 4] 更新日線快取...")
    daily_cache = update_daily_cache(all_ohlcv)
    cache_days  = len(daily_cache)
    print(f"[Step 4] 日線快取：{cache_days} 個交易日")

    # ── Step 5: 取得股票池 ────────────────────────────────────────
    print("\n[Step 5] 取得股票池...")
    stock_pool = get_stock_pool(all_ohlcv)
    total_stocks = len(stock_pool)
    print(f"[Step 5] 股票池：{total_stocks} 檔")

    if total_stocks == 0:
        print("[ERROR] 股票池為空，可能 API 全部失敗或非交易日")
        return {'error': '股票池為空', 'scan_date': scan_start.strftime('%Y%m%d')}

    # ── Step 6: 五維評分 ──────────────────────────────────────────
    print(f"\n[Step 6] 開始五維評分（{total_stocks} 檔）...")
    results     = []
    ml_data     = []
    scanned     = 0
    skipped     = 0

    # 大盤趨勢調整係數
    trend = taiex_trend.get('trend', 'neutral')
    if trend == 'strongly_bullish':
        trend_multiplier = 1.10
    elif trend == 'bullish':
        trend_multiplier = 1.05
    elif trend == 'bearish':
        trend_multiplier = 0.95
    elif trend == 'strongly_bearish':
        trend_multiplier = 0.90
    else:
        trend_multiplier = 1.00

    for stock_id, stock_name in stock_pool.items():
        hist = build_history_from_cache(daily_cache, stock_id)

        # 若快取無資料，使用當日單日資料
        if not hist and stock_id in all_ohlcv:
            hist = [all_ohlcv[stock_id]]

        if not hist:
            skipped += 1
            continue

        # 今日價格（hist 最後一天 = 今日）
        today_price = hist[-1]
        close = today_price.get('close', 0)
        if close <= 0:
            skipped += 1
            continue

        # 過濾極低價 & 極低量（殼股/停牌）
        volume = today_price.get('volume', 0)
        if close < 5 or volume < 100000:
            skipped += 1
            continue

        # 族群
        sector = get_stock_sector(stock_id, industry_map)
        twse_sector = industry_map.get(stock_id, '')

        # 五維評分
        tech  = analyze_technical(hist)
        chips = analyze_chips(
            hist,
            t86_row    = t86_data.get(stock_id),
            margin_row = margin_data.get(stock_id)
        )
        fund  = analyze_fundamental(stock_id, bwibbu=all_bwibbu, hist=hist)
        news  = analyze_news(stock_id, sector, taiex_trend)
        sent  = analyze_sentiment(hist, stock_id)

        # v2 加權總分（技術25% 基本面23% 消息32% 情緒12% 籌碼8%）
        # 各維度滿分：技術40、基本面40、消息10、情緒10、籌碼10
        # 標準化到 0-100：技術/40, 基本面/40, 消息/10, 情緒/10, 籌碼/10
        tech_norm  = tech['score']  / 40 * 100
        fund_norm  = fund['score']  / 40 * 100
        news_norm  = news['score']  / 10 * 100
        sent_norm  = sent['score']  / 10 * 100
        chips_norm = chips['score'] / 10 * 100

        weighted = (
            tech_norm  * 0.25 +
            fund_norm  * 0.23 +
            news_norm  * 0.32 +
            sent_norm  * 0.12 +
            chips_norm * 0.08
        )
        # 大盤趨勢調整
        total_score = round(weighted * trend_multiplier, 2)

        # 進出場計算
        entry_exit = calculate_entry_exit(stock_id, hist, tech)

        # 個股回測（若可用）
        backtest_result = {}
        if _BACKTEST_AVAILABLE:
            try:
                backtest_result = _run_per_stock_backtest(stock_id, strategy='all', days=30)
            except Exception:
                backtest_result = {}

        results.append({
            'stock_id':    stock_id,
            'name':        stock_name or today_price.get('name', stock_id),
            'sector':      sector,
            'twse_sector': twse_sector,
            'close':       close,
            'change_pct':  today_price.get('change_pct', 0),
            'volume':      volume,
            'total_score': total_score,
            'weighted_score': round(weighted, 2),
            'scores': {
                'technical':   tech['score'],
                'chips':       chips['score'],
                'fundamental': fund['score'],
                'news':        news['score'],
                'sentiment':   sent['score'],
            },
            'signals': {
                'technical':   tech['signals'],
                'chips':       chips['signals'],
                'fundamental': fund['signals'],
                'news':        news['signals'],
                'sentiment':   sent['signals'],
            },
            'details': {
                'technical':   tech.get('details', {}),
                'chips':       chips.get('details', {}),
                'fundamental': fund.get('details', {}),
                'news':        news.get('details', {}),
                'sentiment':   sent.get('details', {}),
            },
            'entry_exit':  entry_exit,
            'backtest':    backtest_result,
            'ma5':         tech.get('ma5', 0),
            'ma10':        tech.get('ma10', 0),
            'ma20':        tech.get('ma20', 0),
            'hist':        hist[-5:],  # 只保留最近 5 日（節省記憶體）
        })

        # ML 資料收集
        ml_data.append({
            'stock_id': stock_id,
            'name':     stock_name or today_price.get('name', stock_id),
            'sector':   sector,
            'hist':     hist,
        })

        scanned += 1
        if scanned % 200 == 0:
            print(f"  已評分：{scanned}/{total_stocks}...")

    print(f"[Step 6] 評分完成：{scanned} 檔有效 | {skipped} 檔跳過")

    # ── Step 7: 族群加成 ──────────────────────────────────────────
    print("\n[Step 7] 套用族群加成...")
    results.sort(key=lambda x: x['total_score'], reverse=True)
    results = apply_sector_boost(results, sector_ranking)
    results.sort(key=lambda x: x['total_score'], reverse=True)

    # ── Step 8: Top 10 輸出 ───────────────────────────────────────
    top10 = results[:10]
    print(f"\n[Step 8] Top 10 五維綜合評分：")
    for i, r in enumerate(top10, 1):
        boost_info = ''
        if r.get('sector_boost', {}).get('boosted'):
            boost_info = f" [族群+{r['sector_boost']['boost_points']:.0f}]"
        print(f"  {i:2d}. {r['name']}({r['stock_id']}) "
              f"總分:{r['total_score']:.1f}{boost_info} "
              f"收:{r['close']:.1f} 漲:{r['change_pct']:+.1f}% "
              f"技:{r['scores']['technical']} 籌:{r['scores']['chips']} "
              f"基:{r['scores']['fundamental']} 消:{r['scores']['news']} "
              f"情:{r['scores']['sentiment']}")

    # ── Step 9: ML 爆漲預測 ───────────────────────────────────────
    print("\n[Step 9] ML 爆漲股預測...")
    ml_top5 = []
    if len(ml_data) >= 10:
        try:
            ml_top5 = predict_explosive_stocks(ml_data)
        except Exception as e:
            print(f"[ML] 預測失敗：{e}")
    else:
        print(f"[ML] 資料不足（{len(ml_data)} 檔），跳過預測")

    # ── Step 10: T+N 追蹤 ────────────────────────────────────────
    scan_date = scan_start.strftime('%Y%m%d')
    update_tn_tracking(top10, scan_date)

    # ── 組裝最終結果 ─────────────────────────────────────────────
    scan_end = datetime.now(_TW_TZ)
    elapsed  = (scan_end - scan_start).total_seconds()

    final = {
        'scan_date':     scan_date,
        'scan_time':     scan_start.strftime('%Y-%m-%d %H:%M:%S'),
        'elapsed_sec':   round(elapsed, 1),
        'scanned_count': scanned,
        'total_pool':    total_stocks,
        'taiex_trend':   taiex_trend,
        'sector_ranking': sector_ranking.get('ranking_list', [])[:10],
        'top10':         top10,
        'ml_top5':       ml_top5,
        'all_results':   results[:100],  # 前 100 名
        'version':       'v7.1',
    }

    print(f"\n{'='*60}")
    print(f"掃描完成！耗時 {elapsed:.1f} 秒 | 掃描 {scanned} 檔 | Top10 最高分：{top10[0]['total_score']:.1f}")
    print(f"{'='*60}\n")

    return final


# ================================================================
# 輸出與儲存
# ================================================================
def save_scan_result(result: Dict, output_dir: str = None) -> str:
    """儲存掃描結果到 JSON 檔"""
    if output_dir is None:
        output_dir = os.path.dirname(os.path.abspath(__file__))

    scan_date = result.get('scan_date', datetime.now(_TW_TZ).strftime('%Y%m%d'))
    filename  = f"scan_result_{scan_date}.json"
    filepath  = os.path.join(output_dir, filename)

    # 移除 hist 大型欄位（節省磁碟）
    result_clean = json.loads(json.dumps(result))
    for item in result_clean.get('top10', []):
        item.pop('hist', None)
    for item in result_clean.get('all_results', []):
        item.pop('hist', None)

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(result_clean, f, ensure_ascii=False, indent=2)

    print(f"[輸出] 掃描結果已儲存：{filepath}")
    # Also save as scan_result.json (latest)
    latest_path = os.path.join(output_dir, 'scan_result.json')
    with open(latest_path, 'w', encoding='utf-8') as f:
        json.dump(result_clean, f, ensure_ascii=False, indent=2)
    print(f"[輸出] 最新結果已同步：{latest_path}")
    return filepath


# ================================================================
# CLI 入口
# ================================================================
if __name__ == '__main__':
    result = run_five_dimension_scan()

    if 'error' not in result:
        output_path = save_scan_result(result)
        print(f"\n[完成] 結果檔：{output_path}")
        print(f"[完成] 掃描股數：{result['scanned_count']}")
        print(f"[完成] Top 1：{result['top10'][0]['name']}({result['top10'][0]['stock_id']}) "
              f"總分：{result['top10'][0]['total_score']:.1f}")
    else:
        print(f"\n[ERROR] 掃描失敗：{result['error']}")
        sys.exit(1)
