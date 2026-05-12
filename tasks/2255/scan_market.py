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
CACHE_TTL_HOURS = 24
MAX_CACHE_DAYS  = 90

os.makedirs(CACHE_DIR, exist_ok=True)

# ================================================================
# TWSE OpenAPI 端點
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

# TPEx (上櫃) OpenAPI 端點
URL_TPEX_CLOSE    = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"
URL_TPEX_PE       = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis"

# ==========================================================
# 全域常數
# ==========================================================
TOP_N          = 10
TOP_EXPLODE    = 5
MIN_PRICE      = 5.0
MIN_VOL        = 500
SCORE_WEIGHTS  = {
    'technical':   0.40,
    'chips':       0.25,
    'fundamental': 0.15,
    'news':        0.10,
    'sentiment':   0.10,
}

# 快取輔助函式
def _load_cache(path: str) -> Any:
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None

def _save_cache(path: str, data: Any) -> None:
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception as e:
        print(f"[CACHE] 寫入失敗 {path}: {e}")

# ==========================================================
# 股票清單取得
# ==========================================================

def fetch_stock_list() -> List[Dict]:
    cached = _load_cache(STOCK_LIST_CACHE)
    if cached and isinstance(cached, dict):
        ts = cached.get('timestamp', 0)
        if time.time() - ts < CACHE_TTL_HOURS * 3600:
            return cached['data']

    stocks = []
    try:
        r = _http_get(URL_STOCK_DAY_ALL, headers=TWSE_HEADERS)
        for row in r.json():
            sid = row.get('Code', '')
            if sid and sid.isdigit() and len(sid) == 4:
                stocks.append({'stock_id': sid, 'name': row.get('Name', ''), 'market': 'TWSE'})
    except Exception as e:
        print(f"[TWSE 清單] 失敗: {e}")

    try:
        r = _http_get(URL_TPEX_CLOSE, headers=TWSE_HEADERS)
        for row in r.json():
            sid = row.get('SecuritiesCompanyCode', '')
            if sid and sid.isdigit() and len(sid) == 4:
                stocks.append({'stock_id': sid, 'name': row.get('CompanyName', ''), 'market': 'TPEx'})
    except Exception as e:
        print(f"[TPEx 清單] 失敗: {e}")

    _save_cache(STOCK_LIST_CACHE, {'timestamp': time.time(), 'data': stocks})
    return stocks

# ==========================================================
# 當日 OHLCV 取得（TWSE + TPEx 合併）— v7.3 修復
# ==========================================================

def _load_previous_close(sid: str) -> Optional[float]:
    """從 daily_ohlcv 快取取得前日收盤價"""
    cache = _load_cache(DAILY_OHLCV_CACHE) or {}
    days = cache.get(sid, [])
    if days:
        prev = days[-1]
        prev_close = prev.get('close', 0)
        if prev_close > 0:
            return prev_close
    return None


def fetch_today_ohlcv() -> Dict[str, Dict]:
    """回傳 {stock_id: {open, high, low, close, volume, date, market}}"""
    result = {}
    today_str = datetime.now(_TW_TZ).strftime('%Y%m%d')

    # ── TWSE ──
    try:
        r = _http_get(URL_STOCK_DAY_ALL, headers=TWSE_HEADERS)
        for row in r.json():
            sid = row.get('Code', '')
            if not (sid and sid.isdigit() and len(sid) == 4):
                continue
            def _f(k):
                v = row.get(k, '0').replace(',', '')
                try: return float(v)
                except: return 0.0
            result[sid] = {
                'open': _f('OpeningPrice'), 'high': _f('HighestPrice'),
                'low': _f('LowestPrice'),   'close': _f('ClosingPrice'),
                'volume': _f('TradeVolume') / 1000,
                'date': today_str, 'market': 'TWSE',
            }
    except Exception as e:
        print(f"[TWSE OHLCV] 失敗: {e}")

    # ── TPEx — per-stock try/except + extended field fallback + cache fallback (v7.3) ──
    tpex_count = 0
    tpex_zero_close = 0
    tpex_cache_fallback = 0
    tpex_error = 0
    try:
        r = _http_get(URL_TPEX_CLOSE, headers=TWSE_HEADERS)
        raw_data = r.json()
        api_date = today_str
        if raw_data and isinstance(raw_data[0], dict):
            d = raw_data[0].get('Date', '') or raw_data[0].get('date', '')
            if d:
                api_date = d.replace('/', '').replace('-', '')

        for row in raw_data:
            sid = row.get('SecuritiesCompanyCode', '')
            if not (sid and sid.isdigit() and len(sid) == 4):
                continue
            try:
                def _g(k):
                    v = str(row.get(k, '0')).replace(',', '')
                    try: return float(v)
                    except: return 0.0

                # Extended field fallback for all known TPEx API field names
                close_val = (_g('Close') or _g('ClosingPrice') or
                             _g('ClosePrice') or _g('ClosingPricePerShare') or
                             _g('LastTradePrice') or _g('LastPrice') or
                             _g('close') or _g('closing_price') or
                             _g('last_price') or _g('last_trade_price') or 0.0)

                # Cache fallback: if API returned 0, try yesterday from cache
                if close_val <= 0:
                    tpex_zero_close += 1
                    fallback = _load_previous_close(sid)
                    if fallback:
                        close_val = fallback
                        tpex_cache_fallback += 1
                        if tpex_cache_fallback <= 5:
                            print(f"[TPEx fallback] {sid} -> prev close {close_val:.1f}")
                    else:
                        if tpex_zero_close <= 10:
                            print(f"[TPEx WARN] {sid} close=0, no cache fallback")

                open_val  = (_g('Open')  or _g('OpeningPrice')  or close_val)
                high_val  = (_g('High')  or _g('HighestPrice')  or close_val)
                low_val   = (_g('Low')   or _g('LowestPrice')   or close_val)
                vol_val   = (_g('TradeVolume') or _g('tradeVolume') or _g('Volume') or _g('volume') or 0.0) / 1000

                result[sid] = {
                    'open':   open_val,
                    'high':   high_val,
                    'low':    low_val,
                    'close':  close_val,
                    'volume': vol_val,
                    'date':   api_date,
                    'market': 'TPEx',
                }
                tpex_count += 1
            except Exception as perr:
                tpex_error += 1
                if tpex_error <= 5:
                    print(f"[TPEx skip] {sid} parse error: {perr}")

        print(f"[TPEx OHLCV] parsed {tpex_count}, zero_close={tpex_zero_close}, "
              f"cache_fallback={tpex_cache_fallback}, errors={tpex_error}")
    except Exception as e:
        print(f"[TPEx OHLCV] 全域失敗: {e}")

    return result

# ==========================================================
# 日線快取管理
# ==========================================================

def update_daily_cache(today_ohlcv: Dict[str, Dict]) -> Dict[str, List[Dict]]:
    cache = _load_cache(DAILY_OHLCV_CACHE) or {}
    today_str = datetime.now(_TW_TZ).strftime('%Y%m%d')

    for sid, ohlcv in today_ohlcv.items():
        days = cache.get(sid, [])
        if not days or days[-1].get('date') != today_str:
            days.append(ohlcv)
        if len(days) > MAX_CACHE_DAYS:
            days = days[-MAX_CACHE_DAYS:]
        cache[sid] = days

    _save_cache(DAILY_OHLCV_CACHE, cache)
    return cache

# ==========================================================
# 基本面資料
# ==========================================================

def fetch_fundamentals() -> Dict[str, Dict]:
    result = {}
    try:
        r = _http_get(URL_BWIBBU_ALL, headers=TWSE_HEADERS)
        for row in r.json():
            sid = row.get('Code', '')
            if not sid: continue
            def _fv(k):
                v = str(row.get(k, '')).replace(',', '')
                try: return float(v)
                except: return None
            result[sid] = {
                'pe': _fv('PEratio'), 'pb': _fv('PBratio'),
                'yield_pct': _fv('DividendYield'),
            }
    except Exception as e:
        print(f"[BWIBBU_ALL] 失敗: {e}")

    try:
        r = _http_get(URL_TPEX_PE, headers=TWSE_HEADERS)
        for row in r.json():
            sid = row.get('SecuritiesCompanyCode', '')
            if not sid: continue
            def _gv(k):
                v = str(row.get(k, '')).replace(',', '')
                try: return float(v)
                except: return None
            result[sid] = {
                'pe': _gv('PriceEarningRatio'),
                'pb': _gv('PriceBookRatio') or _gv('BookValueRatio'),
                'yield_pct': _gv('DividendYield'),
            }
    except Exception as e:
        print(f"[TPEx PE] 失敗: {e}")

    return result

# ==========================================================
# 籌碼面資料
# ==========================================================

def fetch_chips() -> Dict[str, Dict]:
    result = {}
    try:
        r = _http_get(URL_T86, headers=TWSE_HEADERS)
        for row in r.json():
            sid = row.get('Code', '')
            if not sid: continue
            def _iv(k):
                v = str(row.get(k, '0')).replace(',', '')
                try: return int(v)
                except: return 0
            result[sid] = {
                'foreign_net': _iv('ForeignInvestmentNetBuySell'),
                'trust_net':   _iv('InvestmentTrustNetBuySell'),
                'dealer_net':  _iv('DealerNetBuySell'),
                'margin_ratio': 0.0,
            }
    except Exception as e:
        print(f"[T86 法人] 失敗: {e}")

    try:
        r = _http_get(URL_MI_MARGN, headers=TWSE_HEADERS)
        for row in r.json():
            sid = row.get('StockNo', '') or row.get('Code', '')
            if not sid: continue
            try:
                margin = float(str(row.get('MarginPurchaseBalanceRatio', '0')).replace(',', ''))
            except:
                margin = 0.0
            if sid in result:
                result[sid]['margin_ratio'] = margin
            else:
                result[sid] = {'foreign_net': 0, 'trust_net': 0, 'dealer_net': 0, 'margin_ratio': margin}
    except Exception as e:
        print(f"[融資] 失敗: {e}")

    return result

# ==========================================================
# 技術面評分
# ==========================================================

def _calc_rsi(closes: List[float], period: int = 14) -> float:
    if len(closes) < period + 1:
        return 50.0
    deltas = [closes[i] - closes[i-1] for i in range(1, len(closes))]
    gains  = [d for d in deltas[-period:] if d > 0]
    losses = [-d for d in deltas[-period:] if d < 0]
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def score_technical(sid: str, history: List[Dict]) -> float:
    score = 0.0
    if not history:
        return score

    closes  = [d['close'] for d in history if d.get('close', 0) > 0]
    volumes = [d['volume'] for d in history if d.get('volume', 0) > 0]
    if not closes:
        return score

    n = len(closes)
    today_close = closes[-1]
    today_vol   = volumes[-1] if volumes else 0

    rsi = _calc_rsi(closes)
    if rsi < 30:
        score += 8
    elif rsi < 40:
        score += 5
    elif rsi > 70:
        score -= 3

    if n >= 20:
        ma5  = sum(closes[-5:])  / 5
        ma10 = sum(closes[-10:]) / 10
        ma20 = sum(closes[-20:]) / 20
        if today_close > ma5 > ma10 > ma20:
            score += 10
        elif today_close > ma5 and today_close > ma20:
            score += 6
        elif today_close > ma20:
            score += 3
        spread = (ma5 - ma20) / ma20 if ma20 else 0
        if abs(spread) < 0.02:
            score += 3
    elif n >= 5:
        ma5 = sum(closes[-5:]) / 5
        if today_close > ma5:
            score += 4

    if len(volumes) >= 5:
        avg_vol5 = sum(volumes[-6:-1]) / 5 if len(volumes) >= 6 else sum(volumes[:-1]) / max(len(volumes)-1, 1)
        if avg_vol5 > 0:
            vol_ratio = today_vol / avg_vol5
            if vol_ratio >= 3.0:
                score += 10
            elif vol_ratio >= 2.0:
                score += 7
            elif vol_ratio >= 1.5:
                score += 4

    if n >= 20 and today_close >= max(closes[-20:]):
        score += 7
    elif n >= 10 and today_close >= max(closes[-10:]):
        score += 4
    elif n >= 5 and today_close >= max(closes[-5:]):
        score += 2

    if n >= 2 and len(volumes) >= 2:
        if closes[-1] > closes[-2] and volumes[-1] > volumes[-2]:
            score += 5
        elif closes[-1] > closes[-2]:
            score += 2

    return min(score, 40.0)

# ==========================================================
# 籌碼面評分
# ==========================================================

def score_chips(sid: str, chip_data: Optional[Dict]) -> float:
    if not chip_data:
        return 5.0

    score = 5.0
    foreign = chip_data.get('foreign_net', 0)
    trust   = chip_data.get('trust_net', 0)
    dealer  = chip_data.get('dealer_net', 0)
    margin  = chip_data.get('margin_ratio', 0.0)

    if foreign > 5000:   score += 10
    elif foreign > 1000: score += 7
    elif foreign > 0:    score += 4
    elif foreign < -5000: score -= 5

    if trust > 1000:   score += 6
    elif trust > 200:  score += 4
    elif trust > 0:    score += 2
    elif trust < -500: score -= 3

    if dealer > 500:  score += 4
    elif dealer > 0:  score += 2
    elif dealer < -500: score -= 2

    if margin > 60:   score -= 4
    elif margin > 40: score -= 2
    elif margin < 20: score += 2

    return max(0.0, min(score, 25.0))

# ==========================================================
# 基本面評分
# ==========================================================

def score_fundamental(sid: str, fund_data: Optional[Dict]) -> float:
    if not fund_data:
        return 5.0

    score = 5.0
    pe    = fund_data.get('pe')
    pb    = fund_data.get('pb')
    dy    = fund_data.get('yield_pct')

    if pe and 0 < pe < 15:   score += 5
    elif pe and 15 <= pe < 25: score += 3
    elif pe and pe >= 25:    score += 1
    elif pe and pe < 0:      score -= 2

    if pb and pb < 1.5:  score += 3
    elif pb and pb < 3:  score += 1

    if dy and dy >= 5:  score += 2
    elif dy and dy >= 3: score += 1

    return max(0.0, min(score, 15.0))

# ==========================================================
# 消息面評分
# ==========================================================

def score_news(sid: str) -> float:
    return 5.0

# ==========================================================
# 情緒面評分
# ==========================================================

def score_sentiment(sid: str, history: List[Dict], today_ohlcv: Optional[Dict]) -> float:
    score = 4.0
    if not history or not today_ohlcv:
        return score

    closes  = [d['close'] for d in history if d.get('close', 0) > 0]
    volumes = [d['volume'] for d in history if d.get('volume', 0) > 0]
    today_vol = today_ohlcv.get('volume', 0)

    if len(volumes) >= 5:
        avg5 = sum(volumes[-6:-1]) / 5 if len(volumes) >= 6 else sum(volumes) / len(volumes)
        if avg5 > 0:
            ratio = today_vol / avg5
            if ratio >= 2.0:   score += 4
            elif ratio >= 1.3: score += 2
            elif ratio < 0.5:  score -= 2

    if len(closes) >= 3:
        streak = 0
        for i in range(len(closes)-1, 0, -1):
            if closes[i] > closes[i-1]:
                streak += 1
            else:
                break
        if streak >= 3:   score += 2
        elif streak >= 2: score += 1

    return max(0.0, min(score, 10.0))

# ==========================================================
# ML 爆漲股預測
# ==========================================================

def predict_explode(stocks_data: List[Dict]) -> List[Dict]:
    features, sids = [], []

    for s in stocks_data:
        hist = s.get('history', [])
        closes  = [d['close'] for d in hist if d.get('close', 0) > 0]
        volumes = [d['volume'] for d in hist if d.get('volume', 0) > 0]
        if len(closes) < 6 or len(volumes) < 6:
            continue

        rsi = _calc_rsi(closes)
        avg_vol5 = sum(volumes[-6:-1]) / 5
        vol_ratio = volumes[-1] / avg_vol5 if avg_vol5 > 0 else 1.0
        momentum = (closes[-1] - closes[-6]) / closes[-6] if closes[-6] > 0 else 0
        volatility = np.std(closes[-10:]) / np.mean(closes[-10:]) if len(closes) >= 10 else 0
        ma5 = sum(closes[-5:]) / 5
        ma_dev = (closes[-1] - ma5) / ma5 if ma5 > 0 else 0
        streak = 0
        for i in range(len(closes)-1, 0, -1):
            if closes[i] > closes[i-1]: streak += 1
            else: break
        turnover = volumes[-1] / (volumes[-1] + 1)

        features.append([rsi, vol_ratio, momentum, volatility, ma_dev, streak, turnover])
        sids.append(s['stock_id'])

    if len(features) < 10:
        return []

    X = np.array(features)
    y = np.array([1 if (features[i][1] > 2.0 and features[i][2] > 0.05) else 0
                  for i in range(len(features))])

    if y.sum() < 3:
        return []

    try:
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        clf = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
        clf.fit(X_scaled, y)
        probs = clf.predict_proba(X_scaled)[:, 1]
    except Exception as e:
        print(f"[ML] 訓練失敗: {e}")
        return []

    top_idx = np.argsort(probs)[::-1][:TOP_EXPLODE]
    results = []
    for i in top_idx:
        sid = sids[i]
        base = next((s for s in stocks_data if s['stock_id'] == sid), {})
        results.append({
            'stock_id':    sid,
            'name':        base.get('name', ''),
            'explode_prob': round(float(probs[i]), 4),
            'close':       base.get('close', 0),
            'volume':      base.get('volume', 0),
        })
    return results

# ==========================================================
# 主掃描流程 — v7.3 zero-price guard
# ==========================================================

def run_scan() -> Dict:
    start_time = time.time()
    tw_now = datetime.now(_TW_TZ)
    print(f"\n{'='*60}")
    print(f"台股五維分析掃描 v7.3")
    print(f"執行時間：{tw_now.strftime('%Y-%m-%d %H:%M:%S')} (台灣時間)")
    print(f"{'='*60}\n")

    print("[1/6] 取得今日 OHLCV（TWSE + TPEx）...")
    today_ohlcv = fetch_today_ohlcv()
    print(f"      → 取得 {len(today_ohlcv)} 檔股票")

    print("[2/6] 更新日線快取...")
    daily_cache = update_daily_cache(today_ohlcv)
    print(f"      → 快取共 {len(daily_cache)} 檔")

    print("[3/6] 取得基本面與籌碼面資料...")
    fundamentals = fetch_fundamentals()
    chips        = fetch_chips()
    print(f"      → 基本面 {len(fundamentals)} 檔，籌碼 {len(chips)} 檔")

    print("[4/6] 五維評分中...")
    scored = []
    skipped = 0
    zero_price_skipped = 0

    for sid, ohlcv in today_ohlcv.items():
        close  = ohlcv.get('close', 0)
        volume = ohlcv.get('volume', 0)

        # v7.3: guard against zero-price stocks
        if close <= 0 or close < MIN_PRICE or volume < MIN_VOL:
            skipped += 1
            if 0 < close < MIN_PRICE:
                pass
            elif close <= 0:
                zero_price_skipped += 1
                if zero_price_skipped <= 10:
                    print(f"[SKIP] {sid} close={close}, volume={volume}")
            continue

        history  = daily_cache.get(sid, [ohlcv])
        fund     = fundamentals.get(sid)
        chip     = chips.get(sid)

        t_score  = score_technical(sid, history)
        c_score  = score_chips(sid, chip)
        f_score  = score_fundamental(sid, fund)
        n_score  = score_news(sid)
        s_score  = score_sentiment(sid, history, ohlcv)

        total = (
            t_score * SCORE_WEIGHTS['technical'] +
            c_score * SCORE_WEIGHTS['chips'] +
            f_score * SCORE_WEIGHTS['fundamental'] +
            n_score * SCORE_WEIGHTS['news'] +
            s_score * SCORE_WEIGHTS['sentiment']
        )

        closes = [d['close'] for d in history if d.get('close', 0) > 0]
        atr = np.std(closes[-14:]) if len(closes) >= 14 else close * 0.02
        t1 = round(close * 1.03, 2)
        t2 = round(close * 1.06, 2)
        t3 = round(close * 1.10, 2)
        stop_loss = round(close * 0.95, 2)

        scored.append({
            'stock_id':   sid,
            'name':       next((s['name'] for s in fetch_stock_list() if s['stock_id'] == sid), ''),
            'market':     ohlcv.get('market', ''),
            'close':      close,
            'volume':     volume,
            'scores': {
                'technical':   round(t_score, 2),
                'chips':       round(c_score, 2),
                'fundamental': round(f_score, 2),
                'news':        round(n_score, 2),
                'sentiment':   round(s_score, 2),
                'total':       round(total, 2),
            },
            'targets': {'t1': t1, 't2': t2, 't3': t3, 'stop_loss': stop_loss},
            'history': history,
        })

    print(f"      → 評分 {len(scored)} 檔，過濾 {skipped} 檔"
          f"（zero-price: {zero_price_skipped}）")

    scored.sort(key=lambda x: x['scores']['total'], reverse=True)
    top10 = scored[:TOP_N]

    print("[5/6] ML 爆漲股預測...")
    explode_top5 = predict_explode(scored)
    print(f"      → 爆漲候選 {len(explode_top5)} 檔")

    print("[6/6] 個股回測...")
    for stock in top10:
        if _BACKTEST_AVAILABLE:
            bt = _run_per_stock_backtest(stock['stock_id'])
            stock['backtest'] = bt
        else:
            stock['backtest'] = {}
        stock.pop('history', None)

    elapsed = time.time() - start_time
    scan_date = tw_now.strftime('%Y%m%d')

    result = {
        'scan_date':     scan_date,
        'scan_time':     tw_now.strftime('%Y-%m-%d %H:%M:%S'),
        'elapsed_sec':   round(elapsed, 1),
        'scanned_count': len(scored) + skipped,
        'scored_count':  len(scored),
        'top10':         top10,
        'explode_top5':  explode_top5,
        'version':       'v7.3',
    }

    print(f"\n掃描完成！耗時 {elapsed:.1f}s，共評分 {len(scored)} 檔")
    return result


# ==========================================================
# 輸出函式
# ==========================================================

def save_results(result: Dict, output_dir: str = None) -> Dict[str, str]:
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

    print(f"[儲存] {dated_path}")
    print(f"[儲存] {latest_path}")
    return paths


def print_report(result: Dict) -> None:
    print(f"\n{'='*60}")
    print(f"台股五維分析 Top {TOP_N} 推薦")
    print(f"掃描日期：{result.get('scan_date')}  版本：{result.get('version')}")
    print(f"掃描範圍：{result.get('scanned_count')} 檔  評分：{result.get('scored_count')} 檔")
    print(f"{'='*60}")

    for i, s in enumerate(result.get('top10', []), 1):
        sc = s['scores']
        tg = s['targets']
        print(f"\n#{i:2d} {s['stock_id']} {s['name']} [{s['market']}]")
        print(f"     收盤：{s['close']:.2f}  成交量：{s['volume']:.0f}張")
        print(f"     綜合分：{sc['total']:.2f}  "
              f"技術:{sc['technical']:.1f} 籌碼:{sc['chips']:.1f} "
              f"基本:{sc['fundamental']:.1f} 消息:{sc['news']:.1f} 情緒:{sc['sentiment']:.1f}")
        print(f"     目標：T1={tg['t1']}  T2={tg['t2']}  T3={tg['t3']}  停損={tg['stop_loss']}")

    print(f"\n{'─'*60}")
    print(f"ML 爆漲預測 Top {TOP_EXPLODE}")
    print(f"{'─'*60}")
    for i, s in enumerate(result.get('explode_top5', []), 1):
        print(f"#{i} {s['stock_id']} {s['name']}  爆漲機率：{s['explode_prob']*100:.1f}%  "
              f"收盤：{s['close']:.2f}  量：{s['volume']:.0f}張")


if __name__ == '__main__':
    result = run_scan()
    save_results(result)
    print_report(result)
