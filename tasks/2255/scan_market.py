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
            r = requests.get(url, headers=headers, timeout=timeout, verify=verify)
            r.raise_for_status()
            return r
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
