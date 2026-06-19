#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台股五維分析掃描腳本 - v8 (真實 RSI/MA/ATR + 產業板塊 + 周轉率)
版本：v8.0 (real technical indicators, sector correlation, turnover-based sentiment)

五維分析框架：
  技術面 (40%)：真實 RSI(7) + MA5/MA10/MA20 交叉 + ATR 波動 + K 線位置
  籌碼面 (25%)：量價突破、成交量動能
  基本面 (15%)：本益比、殖利率、股價淨值比（BWIBBU_ALL 真實數據）
  消息面 (10%)：同產業板塊連動評分（同族群股價同向性）
  情緒面 (10%)：成交量 / 均量周轉率（散戶參與度代理）

ML 爆漲股預測（RandomForestClassifier）：
  使用歷史日 K 建立 lagged 特徵集（前 N 日 → 隔日漲停），
  不同於舊版直接用當日特徵標記當日結果

目標價/停損：以個股 ATR(7) 為基礎動態計算，非固定百分比

輸出：五維綜合評分 Top 10 標的 + 爆漲預測 Top 5
"""

import json, os, sys, time, warnings
warnings.filterwarnings('ignore')
from datetime import datetime, timedelta, date, timezone
from typing import Any, Dict, List, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
requests.packages.urllib3.disable_warnings()

# 台灣時區 UTC+8
_TW_TZ = timezone(timedelta(hours=8))


import subprocess, json as _json

class _CurlResponse:
    def __init__(self, text):
        self.text = text
    def json(self):
        try: return _json.loads(self.text)
        except Exception: return {}

def _http_get(url, *, headers=None, timeout=30, verify=False, retries=3, backoff=2.0):
    """帶 retry 的 requests.get 包裝 (curl 與 allorigins 繞過)"""
    import urllib.parse
    last_err = None
    for att in range(retries):
        try:
            if 'twse.com.tw' in url:
                # Try allorigins proxy for TWSE to avoid Cloudflare/WAF block in Actions
                proxy_url = 'https://api.allorigins.win/raw?url=' + urllib.parse.quote(url)
                try:
                    res = requests.get(proxy_url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=15)
                    if res.status_code == 200:
                        return res
                except Exception:
                    pass
                
                cmd = ['curl', '-s', '-L', '-A', 'Mozilla/5.0', '--max-time', '15', url]
                res = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
                if res.returncode == 0 and ('"stat":"OK"' in res.stdout or '"data":' in res.stdout):
                    return _CurlResponse(res.stdout)
                # Do NOT fall through to requests.get(TWSE) - it tarpits and hangs the runner
                raise RuntimeError(f"TWSE request blocked or timed out for {url}")
            return requests.get(url, headers=headers, timeout=15, verify=verify)
        except Exception as e:
            last_err = e
            if att < retries - 1:
                import time; time.sleep(backoff ** att)
    raise last_err


# ================================================================
# 資料來源
# ================================================================

TSE_DAILY_URL = "https://www.twse.com.tw/exchangeReport/STOCK_DAY"
LISTEDSTATUS = "https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=json"
TPEX_DAILY_URL = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"