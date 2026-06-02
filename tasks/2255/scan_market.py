#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台股五維分析掃描腳本 - 22:55 收盤報告核心引擎
版本：v7.3 (per-stock TPEx try/except, cache fallback, zero-price guard)

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
    """帶 retry 的 requests.get 包裝"""
    last_err = None
    for att in range(retries):
        try:
            return requests.get(url, headers=headers, timeout=timeout, verify=verify)
        except Exception as e:
            last_err = e
            if att < retries - 1:
                time.sleep(backoff ** att)
    raise last_err


# ================================================================
# 資料來源：政府開放資料、均線、融資、法人、基本面、BWIBBU_ALL
# ================================================================

TSE_DAILY_URL = "https://www.twse.com.tw/exchangeReport/STOCK_DAY"
LISTEDSTATUS = "https://openapi.twse.com.tw/v1/opendata/t187ap03_L"
TPEX_DAILY_URL = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"
FUND_URL = "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL"
TPEX_LISTED_URL = "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O"

# ================================================================
# 全域參數
# ================================================================

TOP_N = 10
MAX_WORKERS = 50
DIMENSION_WEIGHTS = {
    'tech': 0.40,
    'chips': 0.25,
    'fundamental': 0.15,
    'news': 0.10,
    'sentiment': 0.10
}

# Load external weights if available
_w = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dimension_weights.json')
if os.path.exists(_w):
    try:
        with open(_w, 'r', encoding='utf-8') as f:
            _ext = json.load(f)
        for k in ['tech', 'chips', 'fundamental', 'news', 'sentiment']:
            if k in _ext:
                DIMENSION_WEIGHTS[k] = float(_ext[k])
    except Exception:
        pass

TOP_EXPLODE = 5


# ================================================================
# 資料層：上市股票、上櫃股票、日K、基本面
# ================================================================

def fetch_listed_stocks() -> List[Dict]:
    """上市公司股票清單 (t187ap03_L: 欄位 '公司代號', '公司簡稱')"""
    try:
        resp = _http_get(LISTEDSTATUS, timeout=30)
        data = resp.json()
        rows = data if isinstance(data, list) else data.get('msgArr', [])
        result = []
        for r in rows:
            code = str(r.get('公司代號', '')).strip()
            if len(code) == 4:
                result.append({'Code': code, 'Name': str(r.get('公司簡稱', r.get('公司名稱', ''))).strip()})
        return result
    except Exception as e:
        print(f"[錯誤] Listed stocks: {e}")
        return []


def fetch_tpex_stocks() -> List[Dict]:
    """上櫃股票清單 (mopsfin_t187ap03_O: 欄位 'SecuritiesCompanyCode', 'CompanyName')"""
    try:
        resp = _http_get(TPEX_LISTED_URL, timeout=30)
        data = resp.json()
        rows = data if isinstance(data, list) else data.get('msgArr', [])
        result = []
        for r in rows:
            code = str(r.get('SecuritiesCompanyCode', '')).strip()
            if len(code) == 4:
                result.append({'Code': code, 'Name': str(r.get('CompanyName', '')).strip()})
        return result
    except Exception as e:
        print(f"[錯誤] TPEx stocks: {e}")
        return []


def fetch_stock_day(stock_id: str, scan_date: str) -> Optional[Dict]:
    """TSE 日 K"""
    try:
        url = f"{TSE_DAILY_URL}?date={scan_date}&stockNo={stock_id}"
        resp = _http_get(url, timeout=20)
        data = resp.json()
        rows = data.get('data', [])
        if not rows:
            return None
        row = rows[-1]
        try:
            close = float(str(row[6]).replace(',', ''))
            if close <= 0:
                return None
            volume = float(str(row[1]).replace(',', ''))
            open_p = float(str(row[3]).replace(',', ''))
            high = float(str(row[4]).replace(',', ''))
            low = float(str(row[5]).replace(',', ''))
            chg_str = str(row[7]).replace(',', '').strip()
            chg = 0.0 if chg_str in ('+', '-', '', 'X', '--') else float(chg_str)
            prev = close - chg
            chg_pct = round(chg / prev * 100, 2) if prev != 0 else 0.0
            return {'stock_id': stock_id, 'close': close, 'volume': volume,
                    'open': open_p, 'high': high, 'low': low,
                    'change': chg, 'change_pct': chg_pct, 'market': 'TSE'}
        except (ValueError, IndexError):
            return None
    except Exception:
        return None


def fetch_tpex_day(stock_id: str, scan_date: str) -> Optional[Dict]:
    """TPEx 日 K (tpex_mainboard_daily_close_quotes: 回傳全市場 list of dicts, 需自行 filter)"""
    try:
        resp = _http_get(TPEX_DAILY_URL, timeout=30)
        data = resp.json()
        # API 直接回傳 list，不需要 .get('data')
        rows = data if isinstance(data, list) else data.get('data', [])
        # filter by SecuritiesCompanyCode
        matched = [r for r in rows if str(r.get('SecuritiesCompanyCode', '')).strip() == stock_id]
        if not matched:
            return None
        row = matched[-1]
        try:
            def _f(key):
                return float(str(row.get(key, '0') or '0').replace(',', '').strip() or '0')
            close = _f('Close')
            if close <= 0:
                return None
            volume = _f('TradeVolume')
            open_p = _f('Open')
            high = _f('High')
            low = _f('Low')
            chg_str = str(row.get('Change', '0') or '0').replace(',', '').strip()
            chg = 0.0 if chg_str in ('+', '-', '', 'X', '--') else float(chg_str)
            prev = close - chg
            chg_pct = round(chg / prev * 100, 2) if prev != 0 else 0.0
            return {'stock_id': stock_id, 'close': close, 'volume': volume,
                    'open': open_p, 'high': high, 'low': low,
                    'change': chg, 'change_pct': chg_pct, 'market': 'TPEx'}
        except (ValueError, KeyError):
            return None
    except Exception:
        return None


def fetch_fundamentals(stock_id: str) -> Dict:
    """BWIBBU_ALL 本益比、殖利率、淨值比 (直接回傳 list of dicts, 欄位: Code, PEratio, PBratio, DividendYield)"""
    try:
        resp = _http_get(FUND_URL, timeout=30)
        data = resp.json()
        # API 直接回傳 list，不需要 .get('data')
        rows = data if isinstance(data, list) else data.get('data', [])
        for row in rows:
            if str(row.get('Code', '')).strip() == stock_id:
                try:
                    pe = float(str(row.get('PEratio', '0') or '0').replace(',', '').strip() or '0')
                    pb = float(str(row.get('PBratio', '0') or '0').replace(',', '').strip() or '0')
                    dy = float(str(row.get('DividendYield', '0') or '0').replace(',', '').strip() or '0')
                    return {'pe': pe, 'pb': pb, 'dy': dy}
                except Exception:
                    return {'pe': 0.0, 'pb': 0.0, 'dy': 0.0}
    except Exception:
        pass
    return {'pe': 0.0, 'pb': 0.0, 'dy': 0.0}
