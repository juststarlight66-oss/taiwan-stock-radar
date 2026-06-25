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

try:
    import yfinance as yf
    HAS_YFINANCE = True
except ImportError:
    HAS_YFINANCE = False

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
                if res.returncode == 0 and len(res.stdout) > 100:
                    # Accept both JSON ("stat":"OK"/"data") and CSV (\"證券代號\") responses
                    if '"stat":"OK"' in res.stdout or '"data":' in res.stdout:
                        return _CurlResponse(res.stdout)
                    if '證券代號' in res.stdout or '證券名稱' in res.stdout:
                        return _CurlResponse(res.stdout)
                # Last resort: try direct requests.get (TWSE sometimes works from certain IPs)
                try:
                    r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=15, verify=False)
                    if r.status_code == 200 and len(r.text) > 100:
                        return r
                except Exception:
                    pass
                raise RuntimeError(f"TWSE request blocked or timed out for {url}")
            return requests.get(url, headers=headers, timeout=15, verify=verify)
        except Exception as e:
            last_err = e
            if att < retries - 1:
                import time; time.sleep(backoff ** att)
    raise last_err


def salvage_truncated_json(text):
    """從截斷的 TPEx JSON 陣列中恢復完整記錄。

    TPEx daily close API 常回傳截斷的 JSON（最後一筆記錄被切斷）。
    此函數找到最後一個有效的 } 邊界，關閉陣列，解析所有已接收的完整記錄。
    回傳 list 或 None。
    """
    text = text.strip()
    if not text.startswith('['):
        return None
    # 尋找最後一個完整物件邊界: }, 或 }] 或 ]
    for end_marker in ('},', '}]', ']'):
        idx = text.rfind(end_marker)
        if idx == -1:
            continue
        # 裁切至結尾的 } (含); 若 marker 是 ] 則已完整，否則自行關閉陣列
        valid = text[:idx + 1]
        if not valid.endswith(']'):
            valid += ']'
        try:
            result = json.loads(valid)
            if isinstance(result, list) and len(result) > 0:
                return result
        except (json.JSONDecodeError, ValueError):
            continue
    return None


def _tpex_get(url, *, timeout=30, verify=False):
    """TPEx gzip chunked fallback + 截斷 JSON 恢復。

    TPEx API (tpex_mainboard_daily_close_quotes) returns gzip+chunked encoding.
    When the server drops the connection mid-chunk, requests raises ChunkedEncodingError.
    Workaround: stream=True, read raw bytes, manually decompress if gzip-compressed.
    If JSON is still truncated after decompression, salvage_truncated_json recovers
    all complete records from the partial response.
    """
    import gzip as _gzip
    try:
        resp = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'},
                           stream=True, timeout=timeout, verify=verify)
        raw_bytes = resp.raw.read()
        # Check for gzip magic bytes
        if raw_bytes[:2] == b'\x1f\x8b':
            raw_bytes = _gzip.decompress(raw_bytes)
        text = raw_bytes.decode('utf-8')
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # 解壓後 JSON 仍截斷 — 嘗試恢復完整記錄
            salvaged = salvage_truncated_json(text)
            if salvaged:
                print(f"[TPEx] 截斷恢復: {len(salvaged)} 筆記錄（原始 JSON 被截斷）")
                return salvaged
            raise
    except Exception:
        # Fallback: normal requests.get with .json()
        try:
            r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'},
                            timeout=timeout, verify=verify)
            try:
                return r.json()
            except json.JSONDecodeError:
                salvaged = salvage_truncated_json(r.text)
                if salvaged:
                    print(f"[TPEx-fallback] 截斷恢復: {len(salvaged)} 筆記錄")
                    return salvaged
                return {}
        except Exception:
            return {}


# ================================================================
# 資料來源
# ================================================================

TSE_DAILY_URL = "https://www.twse.com.tw/exchangeReport/STOCK_DAY"
LISTEDSTATUS = "https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=json"
TPEX_DAILY_URL = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"
FUND_URL = "https://www.twse.com.tw/exchangeReport/BWIBBU_ALL?response=json"
TPEX_LISTED_URL = "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O"

# ================================================================
# 產業分類對照
# ================================================================
TPEX_INDUSTRY_MAP = {
    '02': '食品工業', '03': '塑膠工業', '04': '紡織纖維',
    '05': '電機機械', '06': '電器電纜', '10': '鋼鐵工業',
    '14': '建材營造', '15': '航運業', '16': '觀光事業',
    '17': '金融保險', '20': '其他', '21': '化學工業',
    '22': '生技醫療業', '23': '油電燃氣業', '24': '半導體業',
    '25': '電腦及週邊設備業', '26': '光電業', '27': '通信網路業',
    '28': '電子零組件業', '29': '電子通路業', '30': '資訊服務業',
    '31': '其他電子業', '32': '文化創意業', '33': '農業科技業',
    '35': '其他', '36': '電子商務', '37': '運動休閒',
    '38': '貿易百貨',
}

# ================================================================
# 全域參數
# ================================================================

TOP_N = 10
MAX_WORKERS = 50
TOP_EXPLODE = 5
RSI_PERIOD = 7          # RSI 計算週期（需 7+1 以上交易日）
ATR_PERIOD = 7          # ATR 計算週期
LOOKBACK_DAYS = 20      # 至少需要的前期日數（MA20）
HISTORY_MONTHS = 2      # 抓取歷史月數（確保有足夠 K 線）
MIN_VOLUME = 500        # 最低成交量門檻（張），過濾流動性不佳的冷門股


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


# ================================================================
# 技術指標計算函式 (v8 新增)
# ================================================================

def compute_rsi(closes: List[float], period: int = RSI_PERIOD) -> float:
    """Wilder's RSI"""
    if len(closes) < period + 1:
        return 50.0
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains = [d if d > 0 else 0 for d in deltas]
    losses = [-d if d < 0 else 0 for d in deltas]
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    rs = avg_gain / avg_loss if avg_loss != 0 else 100.0
    rsi = 100.0 - (100.0 / (1.0 + rs))
    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        rs = avg_gain / avg_loss if avg_loss != 0 else 100.0
        rsi = 100.0 - (100.0 / (1.0 + rs))
    return round(rsi, 2)


def compute_ma(closes: List[float], period: int) -> Optional[float]:
    """Simple Moving Average"""
    if len(closes) < period:
        return None
    return round(sum(closes[-period:]) / period, 2)


def compute_atr(highs: List[float], lows: List[float], closes: List[float],
                period: int = ATR_PERIOD) -> float:
    """Average True Range"""
    if len(closes) < period + 1:
        # fallback: use range-based volatility
        if len(closes) >= 2:
            trs = []
            for i in range(1, len(closes)):
                h, l = highs[i], lows[i]
                c_prev = closes[i - 1]
                tr = max(h - l, abs(h - c_prev), abs(l - c_prev))
                trs.append(tr)
            return round(sum(trs) / len(trs), 2) if trs else closes[-1] * 0.03
        return closes[-1] * 0.03

    trs = []
    for i in range(1, len(closes)):
        h, l, c_prev = highs[i], lows[i], closes[i - 1]
        tr = max(h - l, abs(h - c_prev), abs(l - c_prev))
        trs.append(tr)

    atr = sum(trs[:period]) / period
    for i in range(period, len(trs)):
        atr = (atr * (period - 1) + trs[i]) / period
    return round(atr, 2)


def compute_targets(close: float, atr: float, change_pct: float = 0) -> Dict:
    """
    ATR-based 進場策略
    - entry_low/high: close ± 0.5 ATR（窄帶進場）
    - stop_loss: close - 2 ATR（2 倍波動停損）
    - t1/t2/t3: close + 1x/2x/3x ATR
    對高波動股（ATR 大）目標價更寬，低波動股更窄
    """
    if atr <= 0:
        atr = close * 0.02
    return {
        'entry_low': round(close - 0.5 * atr, 2),
        'entry_high': round(close + 0.5 * atr, 2),
        'stop_loss': round(close - 2.0 * atr, 2),
        't1': round(close + 1.0 * atr, 2),
        't2': round(close + 2.0 * atr, 2),
        't3': round(close + 3.0 * atr, 2),
    }


# ================================================================
# 資料層：上市股票、上櫃股票、日K、基本面
# ================================================================
def load_stock_industry() -> Dict[str, str]:
    """載入靜態產業分類對照表 (stock_code → industry_name)"""
    try:
        p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'stock_industry.json')
        if os.path.exists(p):
            with open(p, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return data.get('stock_industry', {})
        print(f"[警告] stock_industry.json 不存在於 {p}")
    except Exception as e:
        print(f"[錯誤] 載入 stock_industry.json: {e}")
    return {}


def fetch_listed_stocks() -> List[Dict]:
    """上市公司股票清單 (STOCK_DAY_ALL)"""
    try:
        resp = _http_get(LISTEDSTATUS, headers={'User-Agent': 'Mozilla/5.0'}, timeout=30)
        resp_text = resp.text
        # TWSE may return CSV or JSON; parse both
        if resp_text.strip().startswith('{'):
            data = resp.json().get('data', [])
            rows = data
        else:
            # CSV: 日期,證券代號,證券名稱,...
            import csv, io
            reader = csv.DictReader(io.StringIO(resp_text))
            rows = []
            for r in reader:
                rows.append([r.get('證券代號', ''), r.get('證券名稱', '')])
        result = []
        for r in rows:
            code = str(r[0]).strip()
            if len(code) == 4:
                result.append({'Code': code, 'Name': str(r[1]).strip()})
        return result
    except Exception as e:
        print(f"[錯誤] Listed stocks: {e}")
        return []


def fetch_tpex_stocks() -> List[Dict]:
    """上櫃股票清單"""
    try:
        data = _tpex_get(TPEX_LISTED_URL, timeout=30)
        rows = data if isinstance(data, list) else data.get('msgArr', [])
        result = []
        for r in rows:
            code = str(r.get('SecuritiesCompanyCode', '')).strip()
            if len(code) == 4:
                result.append({
                    'Code': code,
                    'Name': str(r.get('CompanyName', '')).strip(),
                    'IndustryCode': str(r.get('SecuritiesIndustryCode', '')).strip(),
                })
        return result
    except Exception as e:
        print(f"[錯誤] TPEx stocks: {e}")
        return []


def fetch_stock_day_history(stock_id: str, scan_date: str) -> Optional[Dict]:
    """
    抓取個股近 2 個月日 K 歷史，回傳：
    - 當日行情 (close, volume, open, high, low, change, change_pct)
    - 歷史清單 history [{close, high, low, open, volume, date}, ...]（按日期遞增）
    歷史順序：最早→最近
    """
    try:
        # 解析 scan_date 為 date 物件
        sd = datetime.strptime(scan_date, '%Y%m%d')
        all_rows = []

        # 抓取最近 HISTORY_MONTHS 個月的日 K
        for m_offset in range(HISTORY_MONTHS - 1, -1, -1):
            target_month = sd.replace(day=1) - timedelta(days=m_offset * 30)
            month_str = target_month.strftime('%Y%m01')
            url = f"{TSE_DAILY_URL}?date={month_str}&stockNo={stock_id}"
            resp = _http_get(url, timeout=20)
            data = resp.json()
            rows = data.get('data', [])
            for row in rows:
                try:
                    d = str(row[0]).replace(' ', '').replace('\u3000', '')
                    # TWSE format: YYYYMMDD or YYYY/MM/DD
                    if '/' in d:
                        parts = d.split('/')
                        d = f"{int(parts[0]) + 1911}{parts[1].zfill(2)}{parts[2].zfill(2)}"
                    close = float(str(row[6]).replace(',', ''))
                    if close <= 0:
                        continue
                    volume = float(str(row[1]).replace(',', ''))
                    open_p = float(str(row[3]).replace(',', ''))
                    high = float(str(row[4]).replace(',', ''))
                    low = float(str(row[5]).replace(',', ''))
                    all_rows.append({
                        'date': d, 'close': close, 'volume': volume,
                        'open': open_p, 'high': high, 'low': low,
                    })
                except (ValueError, IndexError):
                    continue

        if not all_rows:
            return None

        # 按日期排序，取最後 LOOKBACK_DAYS+RSI_PERIOD+5 筆
        all_rows.sort(key=lambda r: r['date'])
        if len(all_rows) > LOOKBACK_DAYS + RSI_PERIOD + 10:
            all_rows = all_rows[-(LOOKBACK_DAYS + RSI_PERIOD + 10):]

        # 最後一筆就是當日
        latest = all_rows[-1]
        chg_str_val = ''  # TWSE API 第 8 欄
        # 計算 change_pct 從歷史數據
        if len(all_rows) >= 2:
            prev_close = all_rows[-2]['close']
            chg = latest['close'] - prev_close
            chg_pct = round(chg / prev_close * 100, 2) if prev_close != 0 else 0
        else:
            chg = 0
            chg_pct = 0

        return {
            'stock_id': stock_id,
            'close': latest['close'],
            'volume': latest['volume'],
            'open': latest['open'],
            'high': latest['high'],
            'low': latest['low'],
            'change': chg,
            'change_pct': chg_pct,
            'market': 'TSE',
            'history': all_rows,  # list of dicts
        }
    except Exception:
        return None


def fetch_stock_day(stock_id: str, scan_date: str) -> Optional[Dict]:
    """TSE 日 K - 向後相容接口（呼叫 fetch_stock_day_history）"""
    return fetch_stock_day_history(stock_id, scan_date)


def fetch_tpex_day(stock_id: str, scan_date: str) -> Optional[Dict]:
    """
    TPEx 日 K - 從 tpex_mainboard_daily_close_quotes 取全市場數據
    包含 history（批量下載的全市場數據僅有當天，不含歷史）
    """
    try:
        data = _tpex_get(TPEX_DAILY_URL, timeout=30)
        rows = data if isinstance(data, list) else data.get('data', [])
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
            volume = _f('TradingShares')
            open_p = _f('Open')
            high = _f('High')
            low = _f('Low')
            chg_str = str(row.get('Change', '0') or '0').replace(',', '').strip()
            chg = 0.0 if chg_str in ('+', '-', '', 'X', '--') else float(chg_str)
            prev = close - chg
            chg_pct = round(chg / prev * 100, 2) if prev != 0 else 0.0
            return {'stock_id': stock_id, 'close': close, 'volume': volume,
                    'open': open_p, 'high': high, 'low': low,
                    'change': chg, 'change_pct': chg_pct, 'market': 'TPEx',
                    'history': []}  # TPEx bulk 不含歷史
        except (ValueError, KeyError):
            return None
    except Exception:
        return None


def fetch_fundamentals(stock_id: str) -> Dict:
    """BWIBBU_ALL 本益比、殖利率、淨值比"""
    try:
        resp = _http_get(FUND_URL, headers={'User-Agent': 'Mozilla/5.0'}, timeout=30)
        rows = resp.json().get('data', [])
        for row in rows:
            if str(row[0]).strip() == stock_id:
                try:
                    pe = float(str(row[2]).replace(',', '').replace('-', '0') or '0')
                    dy = float(str(row[3]).replace(',', '').replace('-', '0') or '0')
                    pb = float(str(row[4]).replace(',', '').replace('-', '0') or '0')
                    return {'pe': pe, 'pb': pb, 'dy': dy}
                except Exception:
                    pass
        return {'pe': 0, 'pb': 0, 'dy': 0}
    except Exception as e:
        print(f"[錯誤] Fund {stock_id}: {e}")
        return {'pe': 0, 'pb': 0, 'dy': 0}


# ================================================================
# 板塊統計計算 (v8 新增 - 用於消息面評分)
# ================================================================

def compute_sector_stats(stock_data: Dict[str, Dict]) -> Dict[str, Dict]:
    """
    計算各產業板塊當日均值：平均漲跌幅、上漲/下跌家數比例
    stock_data: {stock_id: {'change_pct': X, 'sector_name': Y, ...}}
    returns: {sector_name: {'avg_chg': float, 'up_ratio': float, 'count': int}}
    """
    sectors: Dict[str, List[float]] = {}
    for sid, d in stock_data.items():
        sec = d.get('sector_name', '其他')
        chg = d.get('change_pct', 0)
        if sec not in sectors:
            sectors[sec] = []
        sectors[sec].append(chg)

    result = {}
    for sec, chgs in sectors.items():
        if not chgs:
            continue
        up_count = sum(1 for c in chgs if c > 0)
        result[sec] = {
            'avg_chg': round(sum(chgs) / len(chgs), 2),
            'up_ratio': round(up_count / len(chgs), 2) if chgs else 0,
            'count': len(chgs),
        }
    return result


def compute_turnover_rate_proxy(volume: float, close: float) -> float:
    """
    周轉率代理值（無股本數據時的近似）
    假設：股本 = close × 100（極簡化，僅用於相對比較）
    實際周轉率 = volume / shares_outstanding
    """
    if close <= 0 or volume <= 0:
        return 0.0
    # 極簡近似：交易量 / (股價 × 100000) → 約等於周轉率×100
    proxy = volume / (close * 100)
    return round(min(proxy, 100.0), 4)


# ================================================================
# v8 評分層：五維評分函數（真實 RSI/MA/ATR）
# ================================================================

def score_technical(d: Dict) -> float:
    """
    技術面 40% 權重
    使用真實 RSI(7) + MA5/MA10/MA20 多空排列 + K 線位置 + ATR 波動
    """
    close = d.get('close', 0)
    if close <= 0:
        return 0.0
    history = d.get('history', [])
    score = 50.0  # 基準

    if history and len(history) >= 8:
        closes = [h['close'] for h in history]
        highs = [h['high'] for h in history]
        lows = [h['low'] for h in history]

        # RSI(7) 評分
        rsi = compute_rsi(closes, RSI_PERIOD)
        if rsi >= 75:
            score += 15  # 強勢但注意超買
        elif rsi >= 60:
            score += 20   # 多頭動能最佳區
        elif rsi >= 45:
            score += 5    # 中性偏多
        elif rsi >= 30:
            score -= 5    # 中性偏空
        else:
            score -= 10   # 超賣 → 可能反彈，不扣太多

        # MA 多空排列
        ma5 = compute_ma(closes, 5)
        ma10 = compute_ma(closes, 10)
        ma20 = compute_ma(closes, 20)
        if ma5 and ma10 and ma20:
            if ma5 > ma10 > ma20:
                score += 15  # 多頭排列
            elif ma5 < ma10 < ma20:
                score -= 10  # 空頭排列
            elif ma5 > ma10:
                score += 5   # 短期轉強

            # MA 乖離
            if ma20 and ma20 > 0:
                deviation = (close - ma20) / ma20 * 100
                if 3 <= deviation <= 10:
                    score += 5
                elif deviation > 15:
                    score -= 10  # 乖離過大

        # ATR 波動
        atr = compute_atr(highs, lows, closes, ATR_PERIOD)
        atr_pct = atr / close * 100 if close > 0 else 0
        if 2 <= atr_pct <= 5:
            score += 5   # 適度波動有利交易
        elif atr_pct < 1:
            score -= 5   # 太冷

    else:
        # fallback：只用當日數據
        chg = d.get('change_pct', 0)
        score += chg * 2  # 溫和代理

    # K 線位置（收盤在高低範圍的位置）
    high = d.get('high', close)
    low = d.get('low', close)
    rng = high - low
    if rng > 0:
        pos = (close - low) / rng
        score += (pos - 0.3) * 15  # 收在上方加分

    # 量能加分
    vol = d.get('volume', 0)
    if vol >= 10000:
        score += 10
    elif vol >= 3000:
        score += 5

    return max(0.0, min(100.0, score))


def score_chips(d: Dict) -> float:
    """
    籌碼面 25% 權重
    量價突破 + 動能強度
    """
    vol = d.get('volume', 0)
    chg = d.get('change_pct', 0)
    history = d.get('history', [])
    score = 40.0  # 基準稍低，讓極端值更突出

    # 爆量突破
    if history and len(history) >= 5:
        avg_vol_5 = sum(h['volume'] for h in history[-6:-1]) / 5 if len(history) >= 6 else vol
        vol_ratio = vol / avg_vol_5 if avg_vol_5 > 0 else 1
        if vol_ratio >= 2.5 and chg >= 3:
            score += 35   # 爆量突破
        elif vol_ratio >= 1.5 and chg >= 2:
            score += 20   # 放量上攻
        elif vol_ratio >= 1.2:
            score += 8

    # 絕對量能
    if vol >= 20000 and chg >= 2:
        score += 25
    elif vol >= 5000 and chg >= 1:
        score += 15
    elif vol >= 1000:
        score += 5

    # 漲幅
    if chg >= 7:
        score += 20
    elif chg >= 3:
        score += 10
    elif chg < -5:
        score -= 15
    elif chg < -3:
        score -= 8

    return max(0.0, min(100.0, score))


def score_fundamental(d: Dict) -> float:
    """基本面 15% 權重（沿用既有邏輯，穩定可靠）"""
    f = d.get('fundamentals', {})
    pe = f.get('pe', 0)
    pb = f.get('pb', 0)
    dy = f.get('dy', 0)
    score = 50.0

    if 0 < pe <= 10:
        score += 20
    elif 0 < pe <= 15:
        score += 10
    elif pe > 40 or pe < 0:
        score -= 15

    if 0 < pb <= 1:
        score += 15
    elif 0 < pb <= 2:
        score += 8
    elif pb > 5:
        score -= 10

    if dy >= 5:
        score += 15
    elif dy >= 3:
        score += 8
    elif dy >= 1:
        score += 3

    return max(0.0, min(100.0, score))


def score_news(d: Dict) -> float:
    """
    消息面 10% 權重 (v8 重寫)
    改為：同產業板塊連動評分
    如果同族群股票普遍上漲，表示有產業級消息支撐（如政策、供需）
    """
    sector_stats = d.get('_sector_stats', {})
    sector_name = d.get('sector_name', '')
    chg = d.get('change_pct', 0)
    score = 50.0

    if sector_name and sector_name in sector_stats:
        s = sector_stats[sector_name]
        avg = s.get('avg_chg', 0)
        up_ratio = s.get('up_ratio', 0)

        # 產業板塊強勢
        if avg > 2 and up_ratio > 0.6:
            score += 25
        elif avg > 1:
            score += 15
        elif avg < -2 and up_ratio < 0.4:
            score -= 15

        # 相對板塊強弱
        if chg > avg + 2:
            score += 15  # 領漲同族群
        elif chg < avg - 2:
            score -= 10  # 落後同族群
        elif abs(chg - avg) <= 1:
            score += 5   # 穩定跟隨
    else:
        # 無板塊數據 fallback
        score += chg

    return max(0.0, min(100.0, score))


def score_sentiment(d: Dict) -> float:
    """
    市場情緒 10% 權重 (v8 重寫)
    改為：周轉率代理 + 振幅情緒
    高周轉率 = 散戶參與熱絡 = 市場情緒高
    """
    vol = d.get('volume', 0)
    close = d.get('close', 0)
    chg = d.get('change_pct', 0)
    high = d.get('high', close)
    low = d.get('low', close)
    history = d.get('history', [])
    score = 50.0

    # 周轉率代理（相對於歷史均量）
    if history and len(history) >= 5:
        avg_vol_5 = sum(h['volume'] for h in history[-6:-1]) / 5 if len(history) >= 6 else vol
        volume_ratio = vol / avg_vol_5 if avg_vol_5 > 0 else 1
        if volume_ratio >= 3:
            score += 20  # 極度熱絡
        elif volume_ratio >= 2:
            score += 12
        elif volume_ratio >= 1.3:
            score += 6
        elif volume_ratio < 0.5:
            score -= 10  # 極度冷清
    else:
        # fallback: 絕對量
        if vol >= 10000:
            score += 10
        elif vol >= 3000:
            score += 5

    # 振幅情緒
    rng = high - low
    if rng > 0 and close > 0:
        pos = (close - low) / rng
        score += (pos - 0.5) * 15  # 收高=買氣強

    # 漲跌方向
    if chg > 3:
        score += 8
    elif chg < -3:
        score -= 10

    return max(0.0, min(100.0, score))


def compute_composite_score(d: Dict) -> Dict:
    """五維加權總分"""
    scores = {
        'technical': score_technical(d),
        'chips': score_chips(d),
        'fundamental': score_fundamental(d),
        'news': score_news(d),
        'sentiment': score_sentiment(d),
    }
    w = DIMENSION_WEIGHTS
    total = (
        scores['technical'] * w['tech'] +
        scores['chips'] * w['chips'] +
        scores['fundamental'] * w['fundamental'] +
        scores['news'] * w['news'] +
        scores['sentiment'] * w['sentiment']
    )
    # 強勢族群額外加分：當日產業板塊漲幅達一定水準即加分（動態，不須硬編）
    sector_name = d.get('sector_name', '')
    sector_stats = d.get('_sector_stats', {})
    if sector_name and sector_name in sector_stats:
        s = sector_stats[sector_name]
        avg = s.get('avg_chg', 0)
        up_ratio = s.get('up_ratio', 0)
        if avg >= 2 and up_ratio >= 0.6:
            total += 5   # 產業全面強漲
        elif avg >= 1:
            total += 3   # 產業溫和偏多
        if d.get('change_pct', 0) > avg + 2:
            total += 2   # 個股領漲同族群
    scores['total'] = round(total, 2)
    return scores


# ================================================================
# ML 爆漲預測 (v8 修正：使用歷史 lagged 特徵)
# ================================================================

def predict_explode_top5(candidates: List[Dict]) -> List[Dict]:
    """
    使用歷史日 K 建立 lagged 特徵集：
    對每檔有足夠歷史數據的候選股，取前 N 日特徵 → 隔日漲標籤
    訓練 RF，然後對當日候選股做預測
    """
    try:
        import numpy as np
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.calibration import CalibratedClassifierCV
    except ImportError:
        return []

    if len(candidates) < 20:
        return []

    # 建立訓練集：從每檔股票的歷史中提取 lagged 樣本
    X_train, y_train = [], []
    X_today, today_ids = [], []

    for c in candidates:
        history = c.get('_history', [])
        close_today = c.get('close', 0)
        high_today = c.get('high', close_today)
        low_today = c.get('low', close_today)
        vol_today = c.get('volume', 0)
        chg_today = c.get('change_pct', 0)

        if history and len(history) >= 10:
            # 從歷史 K 線建立 lagged 樣本
            for i in range(5, len(history) - 1):
                prev = history[i]
                next_day = history[i + 1]
                prev_close = prev['close']
                if prev_close <= 0:
                    continue
                next_chg = (next_day['close'] - prev_close) / prev_close * 100

                # 特徵：前一日漲跌幅、量比（近5日均量）、RSI(7)、振幅
                closes_win = [h['close'] for h in history[max(0, i - 9):i + 1]]
                rsi_val = compute_rsi(closes_win, RSI_PERIOD) if len(closes_win) >= RSI_PERIOD + 1 else 50
                prev_high = prev['high']
                prev_low = prev['low']
                amp = (prev_high - prev_low) / prev_close * 100 if prev_close > 0 else 0

                # 量比（近5日均量）
                vol_win = [h['volume'] for h in history[max(0, i - 4):i + 1]]
                avg_vol = sum(vol_win) / len(vol_win) if vol_win else prev['volume']
                vol_ratio = prev['volume'] / avg_vol if avg_vol > 0 else 1

                prev_chg = (prev_close - history[i - 1]['close']) / history[i - 1]['close'] * 100 if i > 0 else 0

                X_train.append([prev_chg, np.log1p(prev['volume']), rsi_val, amp, vol_ratio])
                y_train.append(1 if next_chg >= 9.5 else 0)

            # 當日特徵（用於預測明天）
            closes_full = [h['close'] for h in history]
            rsi_today = compute_rsi(closes_full, RSI_PERIOD)
            amp_today = (high_today - low_today) / close_today * 100 if close_today > 0 else 0

            vol_win_today = [h['volume'] for h in history[-6:-1]] if len(history) >= 6 else [vol_today]
            avg_vol_today = sum(vol_win_today) / len(vol_win_today) if vol_win_today else vol_today
            vol_ratio_today = vol_today / avg_vol_today if avg_vol_today > 0 else 1

            X_today.append([chg_today, np.log1p(vol_today), rsi_today, amp_today, vol_ratio_today])
            today_ids.append(c)
        else:
            # 無歷史 fallback
            amp = (high_today - low_today) / close_today * 100 if close_today > 0 else 0
            X_today.append([chg_today, np.log1p(vol_today), 50, amp, 1.0])
            today_ids.append(c)

    if len(X_train) < 20 or sum(y_train) < 2:
        return []

    X_train_arr = np.array(X_train, dtype=float)
    y_train_arr = np.array(y_train, dtype=int)
    X_today_arr = np.array(X_today, dtype=float)

    try:
        base_rf = RandomForestClassifier(n_estimators=50, max_depth=8, min_samples_split=10, min_samples_leaf=5, class_weight='balanced', random_state=42)
        # sigmoid 比 isotonic 更穩定，尤其當正樣本極少時（isotonics 會產生 0.0/1.0 極端值）
        cv_folds = min(5, max(2, sum(y_train_arr)))
        rf = CalibratedClassifierCV(estimator=base_rf, method='sigmoid', cv=cv_folds)
        rf.fit(X_train_arr, y_train_arr)
        probs = rf.predict_proba(X_today_arr)[:, 1]
        top_idx = np.argsort(probs)[::-1][:TOP_EXPLODE]
        result = []
        for i in top_idx:
            c = today_ids[i]
            result.append({
                'stock_id': c.get('stock_id', ''),
                'name': c.get('name', c.get('stock_id', '')),
                'close': c.get('close', 0),
                'volume': c.get('volume', 0),
                'change_pct': c.get('change_pct', 0),
                'explode_prob': round(max(0.05, min(0.95, float(probs[i]))), 3),
            })
        return result
    except Exception:
        return []


# ================================================================
# 主流程
# ================================================================

def run_scan(scan_date: str = None) -> Dict:
    if scan_date is None:
        scan_date = os.environ.get('SCAN_DATE') or datetime.now(_TW_TZ).strftime('%Y%m%d')
    print(f"[掃描] 日期: {scan_date} (v8: 真實 RSI/MA/ATR + 板塊 + 周轉率)")

    tse = fetch_listed_stocks()
    tpex = fetch_tpex_stocks()
    print(f"[清單] TSE={len(tse)}, TPEx={len(tpex)}")

    # 載入產業分類對照
    stock_industry = load_stock_industry()

    all_stocks: Dict[str, Dict] = {}
    for s in tse:
        sid = str(s.get('Code', '')).strip()
        name = str(s.get('Name', '')).strip()
        if sid:
            sector = stock_industry.get(sid, '')
            all_stocks[sid] = {'name': name, 'market': 'TSE', 'sector_name': sector}
    for s in tpex:
        sid = str(s.get('Code', '')).strip()
        name = str(s.get('Name', '')).strip()
        if sid and sid not in all_stocks:
            ind_code = str(s.get('IndustryCode', '')).strip()
            sector = TPEX_INDUSTRY_MAP.get(ind_code, '') or stock_industry.get(sid, '')
            all_stocks[sid] = {'name': name, 'market': 'TPEx', 'sector_name': sector}

    print(f"[掃描] 總股數: {len(all_stocks)}")

    # ---- Phase 1: 預先抓取全市場數據 ----

    # 1. 基本面
    all_fundamentals = {}
    try:
        print("[下載] 預先下載全市場基本面數據 (BWIBBU_ALL)...")
        resp = _http_get(FUND_URL, timeout=30)
        data = resp.json()
        rows = data if isinstance(data, list) else data.get('data', [])
        for row in rows:
            # BWIBBU_ALL returns list of lists: [Code, Name, PE, DY, PB, ...]
            code = str(row[0]).strip()
            if code:
                try:
                    pe = float(str(row[2]).replace(',', '').replace('-', '0') or '0')
                    dy = float(str(row[3]).replace(',', '').replace('-', '0') or '0')
                    pb = float(str(row[4]).replace(',', '').replace('-', '0') or '0')
                    all_fundamentals[code] = {'pe': pe, 'pb': pb, 'dy': dy}
                except Exception:
                    all_fundamentals[code] = {'pe': 0.0, 'pb': 0.0, 'dy': 0.0}
        print(f"[下載] 成功下載 {len(all_fundamentals)} 筆基本面數據")
    except Exception as e:
        print(f"[下載] 預先下載基本面失敗: {e}")

    # 2. 上櫃日 K（全市場）
    all_tpex_quotes = {}
    fetch_errors = set()
    try:
        print("[下載] 預先下載全市場上櫃日K數據...")
        data = _tpex_get(TPEX_DAILY_URL, timeout=30)
        if not data:
            print("[警告] TPEx daily_close_quotes URL 傳回空資料，嘗試 Fallback...")
            data = _tpex_get(TPEX_LISTED_URL, timeout=30)
            # fallback only returns list of stocks, the rest of data won't exist in all_tpex_quotes
            # but we won't fail here and let the later parallel process handle history fetch

        rows = data if isinstance(data, list) else data.get('data', [])
        for row in rows:
            # TPEX_LISTED_URL format vs TPEX_DAILY_URL
            code = str(row.get('SecuritiesCompanyCode', '')).strip()
            if code:
                try:
                    def _f(key):
                        return float(str(row.get(key, '0') or '0').replace(',', '').strip() or '0')
                    close = _f('Close')
                    if close <= 0:
                        continue
                    volume = _f('TradingShares')
                    open_p = _f('Open')
                    high = _f('High')
                    low = _f('Low')
                    chg_str = str(row.get('Change', '0') or '0').replace(',', '').strip()
                    chg = 0.0 if chg_str in ('+', '-', '', 'X', '--') else float(chg_str)
                    prev = close - chg
                    chg_pct = round(chg / prev * 100, 2) if prev != 0 else 0.0
                    all_tpex_quotes[code] = {
                        'stock_id': code, 'close': close, 'volume': volume,
                        'open': open_p, 'high': high, 'low': low,
                        'change': chg, 'change_pct': chg_pct, 'market': 'TPEx'
                    }
                except (ValueError, KeyError):
                    continue
        print(f"[下載] 成功下載 {len(all_tpex_quotes)} 筆上櫃日K數據")
    except Exception as e:
        print(f"[下載] 預先下載上櫃日K失敗: {e}")
        fetch_errors.add(f"TPEx Bulk Fetch Failed: {e}")

    # 2b. 上櫃歷史日K（yfinance 批量下載，補 TPEx API 不含歷史的問題）
    tpex_history_cache: Dict[str, List[Dict]] = {}
    tpex_ids_with_history = set()
    if HAS_YFINANCE:
        tpex_ids = [sid for sid, info in all_stocks.items() if info.get('market') == 'TPEx']
        if tpex_ids:
            try:
                print(f"[下載] yfinance 批量下載 {len(tpex_ids)} 檔上櫃股歷史日K...")
                # yfinance batch download with .TWO suffix
                ticker_str = ' '.join([f"{sid}.TWO" for sid in tpex_ids])
                yf_data = yf.download(ticker_str, period='3mo', group_by='ticker',
                                      progress=False, threads=True, auto_adjust=True)

                for sid in tpex_ids:
                    ticker_key = f"{sid}.TWO"
                    if ticker_key in yf_data:
                        df = yf_data[ticker_key]
                        if df is not None and len(df) >= 8:
                            history = []
                            for idx, row in df.iterrows():
                                try:
                                    history.append({
                                        'date': idx.strftime('%Y-%m-%d') if hasattr(idx, 'strftime') else str(idx),
                                        'open': float(row.get('Open', 0)),
                                        'high': float(row.get('High', 0)),
                                        'low': float(row.get('Low', 0)),
                                        'close': float(row.get('Close', 0)),
                                        'volume': int(row.get('Volume', 0)),
                                    })
                                except Exception:
                                    continue
                            if history:
                                tpex_history_cache[sid] = history
                                tpex_ids_with_history.add(sid)

                print(f"[下載] yfinance 成功取得 {len(tpex_history_cache)} 檔上櫃歷史日K")
            except Exception as e:
                print(f"[下載] yfinance 批量下載失敗: {e}，將使用單股查詢備援")
                # Fallback: per-stock download
                for sid in tpex_ids[:50]:  # limit to avoid rate-limiting
                    try:
                        ticker = yf.Ticker(f"{sid}.TWO")
                        hist = ticker.history(period='3mo')
                        if hist is not None and len(hist) >= 8:
                            history = []
                            for idx, row in hist.iterrows():
                                try:
                                    history.append({
                                        'date': idx.strftime('%Y-%m-%d') if hasattr(idx, 'strftime') else str(idx),
                                        'open': float(row.get('Open', 0)),
                                        'high': float(row.get('High', 0)),
                                        'low': float(row.get('Low', 0)),
                                        'close': float(row.get('Close', 0)),
                                        'volume': int(row.get('Volume', 0)),
                                    })
                                except Exception:
                                    continue
                            if history:
                                tpex_history_cache[sid] = history
                                tpex_ids_with_history.add(sid)
                    except Exception:
                        continue
                print(f"[下載] yfinance 單股備援取得 {len(tpex_history_cache)} 檔上櫃歷史")
    else:
        print("[警告] yfinance 未安裝，上櫃股將使用簡化評分")

    # 3. 上市日 K（全市場）
    # STOCK_DAY_ALL returns list of lists: [Code, Name, Volume, Value, Open, High, Low, Close, Change(+/-/X), TxCount]
    STOCK_DAY_ALL_URL = "https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=json"
    all_tse_quotes = {}
    try:
        print("[下載] 預先下載全市場上市日K數據 (STOCK_DAY_ALL)...")
        resp = _http_get(STOCK_DAY_ALL_URL, timeout=30)
        resp_text = resp.text
        # TWSE sometimes returns CSV instead of JSON (depends on IP/session); parse both
        if resp_text.strip().startswith('{'):
            data = json.loads(resp_text)
            rows = data if isinstance(data, list) else data.get('data', [])
        else:
            # CSV fallback: 日期,證券代號,證券名稱,成交股數,成交金額,開盤價,最高價,最低價,收盤價,漲跌價差,成交筆數
            import csv, io
            reader = csv.DictReader(io.StringIO(resp_text))
            rows = []
            for r in reader:
                rows.append([
                    r.get('證券代號', ''),    # 0: code
                    r.get('證券名稱', ''),    # 1: name
                    r.get('成交股數', ''),    # 2: volume
                    r.get('成交金額', ''),    # 3: value
                    r.get('開盤價', ''),      # 4: open
                    r.get('最高價', ''),      # 5: high
                    r.get('最低價', ''),      # 6: low
                    r.get('收盤價', ''),      # 7: close
                    r.get('漲跌價差', ''),    # 8: change
                    r.get('成交筆數', ''),    # 9: tx_count
                ])
            print(f"[下載] TWSE 回傳 CSV 格式，解析 {len(rows)} 筆")
        for row in rows:
            code = str(row[0]).strip()
            if code and len(code) == 4:
                try:
                    close = float(str(row[7]).replace(',', ''))
                    if close <= 0:
                        continue
                    volume = float(str(row[2]).replace(',', ''))
                    open_p = float(str(row[4]).replace(',', ''))
                    high = float(str(row[5]).replace(',', ''))
                    low = float(str(row[6]).replace(',', ''))
                    chg_str = str(row[8]).replace(',', '').strip()
                    chg = 0.0 if chg_str in ('+', '-', '', 'X', '--') else float(chg_str)
                    prev = close - chg
                    chg_pct = round(chg / prev * 100, 2) if prev != 0 else 0.0
                    all_tse_quotes[code] = {
                        'stock_id': code, 'close': close, 'volume': volume,
                        'open': open_p, 'high': high, 'low': low,
                        'change': chg, 'change_pct': chg_pct, 'market': 'TSE'
                    }
                except (ValueError, KeyError):
                    continue
        print(f"[下載] 成功下載 {len(all_tse_quotes)} 筆上市日K數據")
    except Exception as e:
        print(f"[下載] 預先下載上市日K失敗: {e}")

    # Phase 2: 計算產業板塊統計（用於消息面評分）
    print("[分析] 計算產業板塊統計...")
    sector_data: Dict[str, Dict] = {}
    for sid, info in all_stocks.items():
        day = all_tse_quotes.get(sid) or all_tpex_quotes.get(sid)
        if day and day.get('close', 0) > 0:
            sector_data[sid] = {
                'change_pct': day.get('change_pct', 0),
                'sector_name': info.get('sector_name', ''),
                'close': day['close'],
                'volume': day['volume'],
            }
    sector_stats = compute_sector_stats(sector_data)
    print(f"[分析] 板塊統計完成: {len(sector_stats)} 個產業")

    # Phase 3: 平行處理每檔股票（含歷史抓取）
    results = []
    # 快取歷史抓取結果（避免同股票重複請求）
    history_cache: Dict[str, Dict] = {}

    def process_one(sid: str, info: Dict) -> Optional[Dict]:
        market = info['market']
        name = info['name']
        sector = info.get('sector_name', '')
        try:
            # 取得當日數據
            if market == 'TSE':
                if sid in all_tse_quotes:
                    day = all_tse_quotes[sid]
                else:
                    return None
            else:
                if sid in all_tpex_quotes:
                    day = all_tpex_quotes[sid]
                else:
                    return None

            if day is None or day.get('close', 0) <= 0:
                return None

            close = day['close']
            vol = day['volume']

            # ── 成交量門檻篩選：過濾流動性不佳的冷門股 ──
            if vol < MIN_VOLUME:
                return None

            # 僅對成交量 > 100 張 且 股價 > 0 的股票抓取歷史（節省 API 請求）
            history = []
            if vol >= 100 and close > 0:
                cache_key = f"{sid}_{market}"
                if cache_key in history_cache:
                    history = history_cache[cache_key].get('history', [])
                else:
                    # 上市股：用 STOCK_DAY 抓取歷史
                    if market == 'TSE':
                        hist_result = fetch_stock_day_history(sid, scan_date)
                        if hist_result and hist_result.get('history'):
                            history = hist_result['history']
                            history_cache[cache_key] = hist_result
                    # 上櫃股歷史：優先用 yfinance 快取，fallback 到 TSE API
                    else:
                        if sid in tpex_history_cache:
                            history = tpex_history_cache[sid]
                        else:
                            try:
                                hist_result = fetch_stock_day_history(sid, scan_date)
                                if hist_result and hist_result.get('history'):
                                    history = hist_result['history']
                                    history_cache[cache_key] = hist_result
                            except Exception:
                                history = []

            # 使用已獲得的歷史數據改寫 day['change_pct']（更精確）
            if history and len(history) >= 2:
                day['change_pct'] = round(
                    (history[-1]['close'] - history[-2]['close']) / history[-2]['close'] * 100, 2
                )

            # 基本面
            if sid in all_fundamentals:
                fund = all_fundamentals[sid]
            else:
                fund = fetch_fundamentals(sid)

            # 計算技術指標
            atr_val = close * 0.02  # default 2%
            if history:
                closes_h = [h['close'] for h in history]
                highs_h = [h['high'] for h in history]
                lows_h = [h['low'] for h in history]
                atr_val = compute_atr(highs_h, lows_h, closes_h, ATR_PERIOD)

            # 組合數據
            d = {
                **day,
                'fundamentals': fund,
                'name': name,
                'sector_name': sector,
                '_sector_stats': sector_stats,
                'history': history.copy() if history else [],
                '_history': history.copy() if history else [],
            }

            # 評分
            scores = compute_composite_score(d)

            # ATR 目標價
            targets = compute_targets(close, atr_val, day.get('change_pct', 0))

            rec = '強烈推薦' if scores['total'] >= 75 else (
                '推薦' if scores['total'] >= 60 else (
                '觀察' if scores['total'] >= 45 else '迴避'))

            return {
                'stock_id': sid,
                'name': name,
                'market': market,
                'sector_name': sector,
                'close': close,
                'change_pct': day.get('change_pct', 0),
                'volume': vol,
                'scores': scores,
                'total_score': scores['total'],
                'recommendation': rec,
                'entry_low': targets['entry_low'],
                'entry_high': targets['entry_high'],
                'stop_loss': targets['stop_loss'],
                'targets': targets,
                'fundamentals': fund,
                'rsi': compute_rsi([h['close'] for h in history], RSI_PERIOD) if history and len(history) >= 8 else None,
                'vol_ratio': (vol / (sum(h['volume'] for h in history[-6:-1]) / 5) if history and len(history) >= 6 and sum(h['volume'] for h in history[-6:-1]) > 0 else None),
                '_history': history,  # 保留歷史數據供 ML 使用
            }
        except Exception as e:
            return {'error': True, 'stock_id': sid, 'reason': str(e)}

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {ex.submit(process_one, sid, info): sid for sid, info in all_stocks.items()}
        for fut in as_completed(futures):
            r = fut.result()
            if r is not None:
                if r.get('error'):
                    fetch_errors.add(f"Failed to process {r['stock_id']}: {r['reason']}")
                else:
                    results.append(r)

    results.sort(key=lambda x: x.get('total_score', 0), reverse=True)
    scanned_count = len(results)
    failed_count = len(all_stocks) - scanned_count
    fail_rate = (failed_count / len(all_stocks)) * 100 if all_stocks else 0
    print(f"[結果] 總股數: {len(all_stocks)}, 有效掃描: {scanned_count}, 失敗: {failed_count}, 失敗率: {fail_rate:.1f}%")

    # 診斷：分市場統計，定位哪個 API 在掉資料
    tse_results = [r for r in results if r.get('market') == 'TSE']
    tpex_results = [r for r in results if r.get('market') == 'TPEx']
    tse_total = sum(1 for s in all_stocks.values() if s.get('market') == 'TSE')
    tpex_total = sum(1 for s in all_stocks.values() if s.get('market') == 'TPEx')
    print(f"[診斷] TSE: {len(tse_results)}/{tse_total}, TPEx: {len(tpex_results)}/{tpex_total}")
    print(f"[診斷] TSE quote 覆蓋率: {len(all_tse_quotes)}, TPEx quote 覆蓋率: {len(all_tpex_quotes)}")

    if scanned_count < 1500:
        print(f"⚠️ [警告] 掃描數異常偏低 ({scanned_count} < 1500)")
        if len(all_tse_quotes) < 900:
            print(f"⚠️ [根因] TSE quote API 僅回傳 {len(all_tse_quotes)} 筆（預期 ~1000），TWSE STOCK_DAY_ALL 可能 timeout/被擋")
        if len(all_tpex_quotes) < 700:
            print(f"⚠️ [根因] TPEx quote API 僅回傳 {len(all_tpex_quotes)} 筆（預期 ~800），TPEx API 可能 timeout/被擋")
    
    if fetch_errors:
        print(f"\n[錯誤統計] 共有 {min(len(fetch_errors), 10)} 種失敗原因 (顯示前10筆):")
        for err in list(fetch_errors)[:10]:
            print(f"  - {err}")

    # Phase 4: ML 爆漲預測
    explode_top5 = predict_explode_top5(results)
    top10 = results[:TOP_N]

    # 清除每個 stock 的內部資料（_history 體積過大，不應寫入 JSON）
    for r in results:
        r.pop('_history', None)
        r.pop('history', None)
        r.pop('_sector_stats', None)
    for r in top10:
        r.pop('_history', None)
        r.pop('history', None)
        r.pop('_sector_stats', None)

    return {
        'scan_date': scan_date,
        'scanned_count': len(results),
        'top_stocks': top10,
        'all_stock_scores': results,
        'explode_top5': explode_top5,
        'generated_at': datetime.now(_TW_TZ).isoformat(),
    }


def save_results(result: Dict, output_dir: str = None) -> Dict[str, str]:
    """儲存掃描結果"""
    if output_dir is None:
        output_dir = os.path.dirname(os.path.abspath(__file__))

    scan_date = result.get('scan_date', datetime.now(_TW_TZ).strftime('%Y%m%d'))
    paths = {}

    dated_path = os.path.join(output_dir, f'scan_result_{scan_date}.json')
    with open(dated_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    paths['dated'] = dated_path

    latest_path = os.path.join(output_dir, 'scan_result.json')
    with open(latest_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    paths['latest'] = latest_path

    print(f"[儲存] dated={dated_path}")
    print(f"[儲存] latest={latest_path}")
    return paths


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--date', default=None, help='scan date YYYYMMDD')
    parser.add_argument('--output', default=None, help='output directory')
    args = parser.parse_args()

    result = run_scan(args.date)
    paths = save_results(result, args.output)

    top10 = result.get('top_stocks', [])
    print(f"\n{'='*50}")
    print(f"Top 10 推薦 (v8 真實 RSI/MA/ATR)")
    print(f"{'='*50}")
    for i, s in enumerate(top10, 1):
        sc = s.get('scores', {})
        print(f"  #{i} {s['stock_id']} {s['name']} "
              f"| {s.get('total_score', 0):.1f}分 "
              f"| T:{sc.get('technical', 0):.0f} C:{sc.get('chips', 0):.0f} "
              f"F:{sc.get('fundamental', 0):.0f} N:{sc.get('news', 0):.0f} "
              f"S:{sc.get('sentiment', 0):.0f}")

    explode = result.get('explode_top5', [])
    if explode:
        print(f"\n爆漲 Top 5:")
        for i, s in enumerate(explode, 1):
            print(f"  #{i} {s['stock_id']} {s['name']} "
                  f"| prob={s.get('explode_prob', 0):.1%} "
                  f"| ${s.get('close', 0):.1f}")
