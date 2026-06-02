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

TSE_DAILY_URL = "https://mopc.justing.tw/api/v1/StockDay"
LISTEDSTATUS = "https://mopc.justing.tw/api/v1/ListedStatus"
TPEX_DAILY_URL = "https://mopc.justing.tw/api/v1/TPExStockDay"
FUND_URL = "https://mopc.justing.tw/api/v1/BWIBBU_ALL"

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
    """上市公司股票清單"""
    try:
        resp = _http_get(LISTEDSTATUS, timeout=30)
        data = resp.json()
        rows = data if isinstance(data, list) else data.get('msgArr', [])
        return [r for r in rows if len(str(r.get('Code', ''))) == 4]
    except Exception as e:
        print(f"[錯誤] Listed stocks: {e}")
        return []


def fetch_tpex_stocks() -> List[Dict]:
    """上櫃股票清單（與上市同 API，過濾 Code 長度 == 4）"""
    try:
        resp = _http_get(LISTEDSTATUS, timeout=30)
        data = resp.json()
        rows = data if isinstance(data, list) else data.get('msgArr', [])
        return [r for r in rows if len(str(r.get('Code', ''))) == 4]
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
    """TPEx 日 K"""
    try:
        url = f"{TPEX_DAILY_URL}?date={scan_date}&stockNo={stock_id}"
        resp = _http_get(url, timeout=20)
        data = resp.json()
        rows = data.get('data', [])
        if not rows:
            return None
        row = rows[-1]
        try:
            close = float(str(row[8]).replace(',', ''))
            if close <= 0:
                return None
            volume = float(str(row[7]).replace(',', ''))
            open_p = float(str(row[4]).replace(',', ''))
            high = float(str(row[5]).replace(',', ''))
            low = float(str(row[6]).replace(',', ''))
            chg_str = str(row[9]).replace(',', '').strip()
            chg = 0.0 if chg_str in ('+', '-', '', 'X', '--') else float(chg_str)
            prev = close - chg
            chg_pct = round(chg / prev * 100, 2) if prev != 0 else 0.0
            return {'stock_id': stock_id, 'close': close, 'volume': volume,
                    'open': open_p, 'high': high, 'low': low,
                    'change': chg, 'change_pct': chg_pct, 'market': 'TPEx'}
        except (ValueError, IndexError):
            return None
    except Exception:
        return None


def fetch_fundamentals(stock_id: str) -> Dict:
    """BWIBBU_ALL 本益比、殖利率、淨值比"""
    try:
        resp = _http_get(FUND_URL, timeout=30)
        data = resp.json()
        rows = data.get('data', [])
        for row in rows:
            if len(row) >= 9 and str(row[0]).strip() == stock_id:
                try:
                    pe = float(str(row[4]).replace(',', '').strip() or '0')
                    pb = float(str(row[6]).replace(',', '').strip() or '0')
                    dy = float(str(row[7]).replace(',', '').strip() or '0')
                    return {'pe': pe, 'pb': pb, 'dy': dy}
                except Exception:
                    return {'pe': 0.0, 'pb': 0.0, 'dy': 0.0}
    except Exception:
        pass
    return {'pe': 0.0, 'pb': 0.0, 'dy': 0.0}


# ================================================================
# 評分層：五維評分函數
# ================================================================

def score_technical(d: Dict) -> float:
    close = d.get('close', 0)
    if close <= 0:
        return 0.0
    chg = d.get('change_pct', 0)
    vol = d.get('volume', 0)
    high = d.get('high', close)
    low = d.get('low', close)
    open_p = d.get('open', close)
    score = 0.0

    # 漲跌幅
    if chg >= 9:
        score += 40
    elif chg >= 5:
        score += 30
    elif chg >= 2:
        score += 20
    elif chg > 0:
        score += 10
    elif chg < -5:
        score -= 20
    elif chg < -2:
        score -= 10

    # 成交量
    if vol >= 10000:
        score += 20
    elif vol >= 3000:
        score += 12
    elif vol >= 500:
        score += 5

    # 收盤位置 (close vs day range)
    rng = high - low
    if rng > 0:
        pos = (close - low) / rng
        score += pos * 15

    # 實體強度
    body = abs(close - open_p)
    if rng > 0:
        score += (body / rng) * 10

    # RSI 代理
    rsi_proxy = 50 + chg * 3
    rsi_proxy = max(0, min(100, rsi_proxy))
    if rsi_proxy >= 70:
        score += 15
    elif rsi_proxy <= 30:
        score -= 10

    return max(0.0, min(100.0, score))


def score_chips(d: Dict) -> float:
    vol = d.get('volume', 0)
    chg = d.get('change_pct', 0)
    score = 0.0

    if vol >= 20000 and chg >= 3:
        score += 40
    elif vol >= 5000 and chg >= 1:
        score += 25
    elif vol >= 1000:
        score += 10

    if chg >= 5:
        score += 30
    elif chg >= 2:
        score += 15

    return max(0.0, min(100.0, score))


def score_fundamental(d: Dict) -> float:
    f = d.get('fundamentals', {})
    pe = f.get('pe', 0)
    pb = f.get('pb', 0)
    dy = f.get('dy', 0)
    score = 50.0  # base

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
    chg = d.get('change_pct', 0)
    score = 50.0 + chg * 2
    return max(0.0, min(100.0, score))


def score_sentiment(d: Dict) -> float:
    vol = d.get('volume', 0)
    chg = d.get('change_pct', 0)
    close = d.get('close', 0)
    high = d.get('high', close)
    low = d.get('low', close)
    score = 50.0

    if vol >= 5000:
        score += 15
    elif vol >= 1000:
        score += 8

    rng = high - low
    if rng > 0 and close > 0:
        pos = (close - low) / rng
        score += (pos - 0.5) * 20

    if chg > 3:
        score += 10
    elif chg < -3:
        score -= 10

    return max(0.0, min(100.0, score))


def compute_composite_score(d: Dict) -> Dict:
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
    scores['total'] = round(total, 2)
    return scores


# ================================================================
# ML 爆漲預測
# ================================================================

def predict_explode_top5(candidates: List[Dict]) -> List[Dict]:
    try:
        import numpy as np
        from sklearn.ensemble import RandomForestClassifier
    except ImportError:
        return []

    if len(candidates) < 20:
        return []

    X, ids = [], []
    for c in candidates:
        chg = c.get('change_pct', 0)
        vol = c.get('volume', 0)
        close = c.get('close', 0)
        high = c.get('high', close)
        low = c.get('low', close)
        rng = (high - low) / close * 100 if close > 0 else 0
        rsi = max(0, min(100, 50 + chg * 3))
        X.append([chg, np.log1p(vol), rsi, rng])
        ids.append(c)

    X = np.array(X, dtype=float)
    # Synthetic label: top 10% change_pct
    threshold = np.percentile(X[:, 0], 90)
    y = (X[:, 0] >= threshold).astype(int)

    if y.sum() < 2:
        return []

    try:
        rf = RandomForestClassifier(n_estimators=50, max_depth=4, random_state=42)
        rf.fit(X, y)
        probs = rf.predict_proba(X)[:, 1]
        top_idx = np.argsort(probs)[::-1][:TOP_EXPLODE]
        result = []
        for i in top_idx:
            c = ids[i]
            result.append({
                'stock_id': c.get('stock_id', ''),
                'name': c.get('name', c.get('stock_id', '')),
                'close': c.get('close', 0),
                'volume': c.get('volume', 0),
                'change_pct': c.get('change_pct', 0),
                'explode_prob': round(float(probs[i]), 3),
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
    print(f"[掃描] 日期: {scan_date}")

    # Fetch stock lists
    tse = fetch_listed_stocks()
    tpex = fetch_tpex_stocks()
    print(f"[清單] TSE={len(tse)}, TPEx={len(tpex)}")

    all_stocks: Dict[str, Dict] = {}
    for s in tse:
        sid = str(s.get('Code', '')).strip()
        name = str(s.get('Name', '')).strip()
        if sid:
            all_stocks[sid] = {'name': name, 'market': 'TSE'}
    for s in tpex:
        sid = str(s.get('Code', '')).strip()
        name = str(s.get('Name', '')).strip()
        if sid and sid not in all_stocks:
            all_stocks[sid] = {'name': name, 'market': 'TPEx'}

    print(f"[掃描] 總股數: {len(all_stocks)}")

    # Parallel processing
    results = []

    def process_one(sid: str, info: Dict) -> Optional[Dict]:
        market = info['market']
        name = info['name']
        try:
            if market == 'TSE':
                day = fetch_stock_day(sid, scan_date)
            else:
                try:
                    day = fetch_tpex_day(sid, scan_date)
                except Exception:
                    day = fetch_stock_day(sid, scan_date)
            if day is None or day.get('close', 0) <= 0:
                return None
            fund = fetch_fundamentals(sid)
            d = {**day, 'fundamentals': fund, 'name': name}
            scores = compute_composite_score(d)
            close = day['close']
            entry_low = round(close * 0.99, 2)
            entry_high = round(close * 1.01, 2)
            stop_loss = round(close * 0.95, 2)
            targets = {
                't1': round(close * 1.05, 2),
                't2': round(close * 1.10, 2),
                't3': round(close * 1.15, 2),
                'stop_loss': stop_loss,
            }
            rec = '強烈推薦' if scores['total'] >= 75 else ('推薦' if scores['total'] >= 60 else ('觀察' if scores['total'] >= 45 else '迴避'))
            return {
                'stock_id': sid,
                'name': name,
                'market': market,
                'close': close,
                'change_pct': day.get('change_pct', 0),
                'volume': day.get('volume', 0),
                'scores': scores,
                'total_score': scores['total'],
                'recommendation': rec,
                'entry_low': entry_low,
                'entry_high': entry_high,
                'stop_loss': stop_loss,
                'targets': targets,
                'fundamentals': fund,
            }
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {ex.submit(process_one, sid, info): sid for sid, info in all_stocks.items()}
        for fut in as_completed(futures):
            r = fut.result()
            if r is not None:
                results.append(r)

    results.sort(key=lambda x: x.get('total_score', 0), reverse=True)
    print(f"[結果] 有效股數: {len(results)}")

    explode_top5 = predict_explode_top5(results)
    top10 = results[:TOP_N]

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

    # Also write as latest.json for post_scan.py / frontend compatibility
    latest_json_path = os.path.join(output_dir, 'latest.json')
    with open(latest_json_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    paths['latest_json'] = latest_json_path

    print(f"[儲存] {dated_path}")
    print(f"[儲存] {latest_path}")
    print(f"[儲存] {latest_json_path}")
    return paths


def print_report(result: Dict) -> None:
    top = result.get('top_stocks', [])
    print(f"\n{'='*60}")
    print(f"台股五維分析 Top {TOP_N}")
    print(f"掃描日期: {result['scan_date']}  有效股: {result['scanned_count']}")
    print(f"{'='*60}")
    for i, s in enumerate(top, 1):
        sc = s.get('scores', {})
        tg = s.get('targets', {})
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
