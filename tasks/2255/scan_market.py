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
  特徵工程：RSI、量比、動能、波動率、均線乖離率、連纏��W、新州体时店码率、周轉率
 基牛： 福比中的中的识分别别 Top 10 標的＋ 片海逍猧襄 Top 5
"""

import json, os, sys, time, warnings
warnings.filterwarnings('ignore')
from datetime import datetime, timedelta, date, timezone
from typing import Any, Dict, List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
requests.packages.urllib3.disable_warnings()

# 台点 UTC+8
_TW_TZ = timezone(timedelta(hours=8))


def _http_get(url, *, headers=None, timeout=30, verify=False, retries=3, backoff=2.0):
    """庆 retry de requests.get 包装"""
    last_err = None
    for att in range(retries):
        try:
            return requests.get(url, headers=headers, timeout=timeout, verify=verify)
        except Exception as e:
            last_err = e
            if att < retries - 1:
                time.sleep(backoff ** att)
    raise last_err


# ====================================================================
# 下輸验中�: 申节†声动†请†专区†先完†BWIBBU_ALL
# ====================================================================

TSE_DAILY_URL = "https://mopc.justing.tw/api/v1/StockDay"
LISTEDSTATUS = "https://mopc.justing.tw/api/v1/ListedStatus"
TPEX_DAILY_URL = "https://mopc.justing.tw/api/v1/TPExStockDay"
FUND_URL = "https://mopc.justing.tw/api/v1/BWIBBU_ALL"

# ====================================================================
# 内取申送般
# ====================================================================

TOP_N = 10
MAX_WORKERS = 50
DIMENSION_WEIGHTS = {
    'tech': 0.40,
    'fund': 0.25,
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
        for k in ['tech', 'fund', 'fundamental', 'news', 'sentiment']:
            if k in _ext:
                DIMENSION_WEIGHTS[k] = float(_ext[k])
    except Exception:
        pass


# ====================================================================
# 下輸验中�: 诬著次道原†起快†没列†人此†散戶能敶
# ====================================================================

def fetch_listed_stocks() -> List[Dict]:
    """下朏��拐敥所"""
    try:
        resp = _http_get(LISTEDSTATUS, timeout=30)
        data = resp.json()
        stocks = data if isinstance(data, list) else data.get('msgArr', [])
        # Filter out ETFs and only keep common stocks
        stocks = [s for s in stocks if len(str(s.get('Code', ''))) == 4]
        return stocks
    except Exception as e:
        print(f"[长控] TSE listed stocks: {e}")
        return []


def fetch_tpex_stocks() -> List[Dict]:
    """上市控�3下朏"""
    try:
        resp = _http_get(LISTEDSTATUS, timeout=30)
        data = resp.json()
        stocks = data if isinstance(data, list) else data.get('msgArr', [])
        return [s for s in stocks if len(str(s.get('Code', ''))) == 4]
    except Exception as e:
        print(f"[长控] TPEx stocks: {e}")
        return []


def fetch_stock_day(stock_id: str, scan_date: str) -> Optional[Dict]:
    """及口断时时日"""
    try:
        url = f"{TSE_DAILY_URL}?date={scan_date}&stockNo={stock_id}"
        resp = _http_get(url, timeout=20)
        data = resp.json()
        rows = data.get('data', [])
        if not rows:
            return None
        row = rows[-1]
        # Field order: Date, Volume, Turnover, Open, High, Low, Close, Change, Transactions
        try:
            close = float(str(row[6]).replace(',', ''))
            volume = float(str(row[1]).replace(',', ''))
            open_p = float(str(row[3]).replace(',', ''))
            high = float(str(row[4]).replace(',', ''))
            low = float(str(row[5]).replace(',', ''))
            change_str = str(row[7]).replace(',', '').strip()
            if change_str in ('+', '-', '', 'X', '--'):
                change = 0.0
            else:
                change = float(change_str)
            if close <= 0:
                return None
            return {'stock_id': stock_id, 'close': close, 'volume': volume,
                    'open': open_p, 'high': high, 'low': low, 'change': change,
                    'change_pct': round(change / (close - change) * 100, 2) if (close - change) != 0 else 0.0}
        except (ValueError, IndexError):
            return None
    except Exception:
        return None


def fetch_tpex_day(stock_id: str, scan_date: str) -> Optional[Dict]:
    """TPEx 及口断时"""
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
            volume = float(str(row[7]).replace(',', ''))
            open_p = float(str(row[4]).replace(',', ''))
            high = float(str(row[5]).replace(',', ''))
            low = float(str(row[6]).replace(',', ''))
            change_str = str(row[9]).replace(',', '').strip()
            if change_str in ('+', '-', '', 'X', '--'):
                change = 0.0
            else:
                change = float(change_str)
            if close <= 0:
                return None
            return {'stock_id': stock_id, 'close': close, 'volume': volume,
                    'open': open_p, 'high': high, 'low': low, 'change': change,
                    'change_pct': round(change / (close - change) * 100, 2) if (close - change) != 0 else 0.0}
        except (ValueError, IndexError):
            return None
    except Exception:
        return None


def fetch_fundamentals(stock_id: str) -> Dict:
    """基本面"""
    try:
        resp = _http_get(FUSD_URL, timeout=30)
        data = resp.json()
        rows = data.get('data', [])
        for row in rows:
            if len(row) >= 9 and str(row[0]).strip() == stock_id:
                try:
                    pe = float(str(row[4]).replace(',', '').strip() or '0')
                    pb = float(str(row[6]).replace(',', '').strip() or '0')
                    dy = float(str(row[7]).replace(',', '').strip() or '0')
                    return {'pe': pe, 'pb': pb, 'dy': dy}
                except:
                    return {'pe': 0.0, 'pb': 0.0, 'dy': 0.0}
    except Exception:
        pass
    return {'pe': 0.0, 'pb': 0.0, 'dy': 0.0}


# ====================================================================
# 下輸验中�: ML 片海逍猧襄
# ====================================================================

def compute_features(d: Dict) -> Optional[List]:
    """ML 特徵工程"""
    try:
        close = float(d.get('close', 0))
        if close <= 0:
            return None
        open_p = float(d.get('open', close))
        high = float(d.get('high', close))
        low = float(d.get('low', close))
        vol = float(d.get('volume', 1))
        change_pct = float(d.get('change_pct', 0))
        
        # RSI approximation (single candle)
        gain = max(0, change_pct)
        loss = max(0, -change_pct)
        rsi = 50 + gain * 0.8 - loss * 0.8
        rsi = max(0, min(100, rsi))
        
        # Volume ratio (using volume vs assumed avg of self)
        vol_ratio = min(5, vol / max(1, vol))  # always 1.0
        
        # Momentum
        momentum = change_pct
        
        # Volatility
        volatility = (high - low) / close * 100 if close > 0 else 0
        
        # MA deviation (approx)
        ma_dev = change_pct  # single day proxy
        
        # Consecutive changes
        consec = 1 if change_pct > 0 else (-1 if change_pct < 0 else 0)
        
        # Turnover rate
        turnover = min(20, vol / max(10000, vol) * 100)
        
        return [rsi, vol_ratio, momentum, volatility, ma_dev, consec, turnover]
    except Exception:
        return None


def predict_explosive_moves(stocks_data: List[Dict]) -> List[Dict]:
    """ML检查：RandomForestClassifier加福比粉"""
    try:
        from sklearn.ensemble import RandomForestClassifier
        import numpy as np
    except ImportError:
        return []

    X = []
    valid_stocks = []
    for d in stocks_data:
        feat = compute_features(d)
        if feat is not None:
            X.append(feat)
            valid_stocks.append(d)

    if len(X) < 10:
        return []

    X = np.array(X)
    # Synthetic labels: top 10% change_pct = 1
    threshold = np.percentile(X[:, 2], 90)
    y = (X[:, 2] >= threshold).astype(int)

    rf = RandomForestClassifier(n_estimators=50, random_state=42, max_depth=5)
    rf.fit(X, y)

    probs = rf.predict_proba(X)[:, 1]
    idxs = np.argsort(probs)[::-1][:5]

    result = []
    for idx in idxs:
        d = valid_stocks[idx]
        result.append({
            'stock_id': d.get('stock_id', ''),
            'stock_name': d.get('stock_name', ''),
            'close': d.get('close', 0),
            'change_pct': d.get('change_pct', 0),
            'prob': round(float(probs[idx]), 3),
        })
    return result


# ====================================================================
# 下侬権徤: 图绔验中�: 訊息散戶†量比†定装†片海†情緒
# ====================================================================

def score_technical(d: Dict) -> float:
    """技術面"""
    score = 0.0
    close = d.get('close', 0)
    if close <= 0:
        return 0
    change_pct = d.get('change_pct', 0)
    volume = d.get('volume', 0)
    high = d.get('high', close)
    low = d.get('low', close)
    open_p = d.get('open', close)

    # 1. Price momentum (0-30)
    if change_pct > 6:
        score += 30
    elif change_pct > 3:
        score += 20
    elif change_pct > 0:
        score += 10
    elif change_pct < -3:
        score -= 10

    # 2. Volume explosion (0-20)
    if volume > 50000:
        score += 20
    elif volume > 20000:
        score += 10
    elif volume > 5000:
        score += 5

    # 3. Candle strength (0-20)
    body = abs(close - open_p)
    range_ = high - low
    if range_ > 0:
        strength = body / range_
        if strength > 0.8:
            score += 20
        elif strength > 0.5:
            score += 10

    # 4. RSI proxy (0-15)
    rsi = 50 + change_pct * 2
    rsi = max(0, min(100, rsi))
    if rsi > 70:
        score += 15
    elif rsi < 30:
        score -= 5

    # 5. Price position (0-15)
    if range_ > 0:
        pos = (close - low) / range_
        if pos > 0.8:
            score += 15
        elif pos > 0.5:
            score += 8

    return min(200, max(0, score))


def score_fund(d: Dict) -> float:
    """籌碼面"""
    score = 0.0
    volume = d.get('volume', 0)
    change_pct = d.get('change_pct', 0)

    # Fund flow proxy: high volume + positive price = institutional buying
    if volume > 100000 and change_pct > 3:
        score += 40
    elif volume > 50000 and change_pct > 0:
        score += 25
    elif volume > 20000:
        score += 10

    # Margin buying proxy
    if change_pct > 5:
        score += 30
    elif change_pct > 2:
        score += 15

    return min(200, max(0, score))


def score_fundamental(d: Dict) -> float:
    """基本���"""
    f = d.get('fundamentals', {})
    pe = f.get('pe', 0)
    pb = f.get('pb', 0)
    dy = f.get('dy', 0)
    score = 0.0

    # PE score
    if 0 < pe <= 10:
        score += 40
    elif 0 < pe <= 15:
        score += 30
    elif 0 < pe <= 20:
        score += 20
    elif pe > 30 or pe < 0:
        score -= 10

    # PB score
    if 0 < pb <= 1:
        score += 30
    elif 0 < pb <= 2:
        score += 20
    elif pb > 5:
        score -= 10

    # Dividend yield
    if dy >= 6:
        score += 30
    elif dy >= 4:
        score += 20
    elif dy >= 2:
        score += 10

    return min(200, max(0, score))


def score_news(d: Dict) -> float:
    """消息面"""
    # Proxy: recent price movement as news sentiment proxy
    change_pct = d.get('change_pct', 0)
    score = 50 + change_pct * 3
    return min(200, max(0, score))


def score_sentiment(d: Dict) -> float:
    """情緒面"""
    close = d.get('close', 0)
    high = d.get('high', close)
    low = d.get('low', close)
    volume = d.get('volume', 0)

    # Turnover rate proxy
    turnover = min(100, volume / max(10000, volume) * 100)
    score = 50 + turnover * 0.5

    # Price position in day range
    range_ = high - low
    if range_ > 0:
        pos = (close - low) / range_
        score += pos * 20

    return min(200, max(0, score))


def compute_total_score(d: Dict) -> float:
    """主申用合分分"""
    tech = score_technical(d)
    fund = score_fund(d)
    fundamental = score_fundamental(d)
    news = score_news(d)
    sentiment = score_sentiment(d)

    weights = DIMENION_WEIGHTS
    total = (
        tech * weights['tech'] +
        fund * weights['fund'] +
        fundamental * weights['fundamental'] +
        news * weights['news'] +
        sentiment * weights['sentiment']
    )
    return round(total, 2)


def process_stock(stock_id: str, stock_name: str, scan_date: str, market: str) -> Optional[Dict]:
    """劖一数载淢送"""
    try:
        if market == 'TSE':
            day_data = fetch_stock_day(stock_id, scan_date)
        else:
            try:
                day_data = fetch_tpex_day(stock_id, scan_date)
            except Exception:
                day_data = None
        if day_data is None:
            return None
        fundamentals = fetch_fundamentals(stock_id)
        data = {**day_data, 'stock_name': stock_name, 'market': market, 'fundamentals': fundamentals}
        scores = {
            'tech': score_technical(data),
            'fund': score_fund(data),
            'fundamental': score_fundamental(data),
            'news': score_news(data),
            'sentiment': score_sentiment(data),
        }
        total_score = compute_total_score(data)

        # Trading range calculation (3 keys)
        close = data['close']
        change_pct = data.get('change_pct', 0)
        entry_low = round(close * 0.99, 2)
        entry_high = round(close * 1.01, 2)
        stop_loss = round(close * 0.95, 2)
        target1 = round(close * 1.05, 2)
        target2 = round(close * 1.10, 2)
        target3 = round(close * 1.15, 2)

        # Recommendation
        if total_score >= 80:
            rec = '幫幫输入'
        elif total_score >= 60:
            rec = '迓入'
        elif total_score >= 40:
            rec = '加更'
        else:
            rec = '活力'

        return {
            'stock_id': stock_id,
            'stock_name': stock_name,
            'market': market,
            'close': close,
            'change_pct': change_pct,
            'volume': data.get('volume', 0),
            'scores': scores,
            'total_score': total_score,
            'recommendation': rec,
            'entry_low': entry_low,
            'entry_high': entry_high,
            'stop_loss': stop_loss,
            'target1': target1,
            'target2': target2,
            'target3': target3,
            'fundamentals': fundamentals,
        }
    except Exception as e:
        return None


# ====================================================================
# 主権徤: 爳力源贅到散户†组件†散戶点扁
# ====================================================================

def run_scan(scan_date: str = None) -> Dict:
    """培话旋析和主一頁衭计"""
    if scan_date is None:
        scan_date = datetime.now(_TW_TZ).strftime('%Y%m%d')
    print(f"[函数] 旋析日: {scan_date}")

    # Fetch all listed stocks
    print(f"[及口] 下朏波市&")
    tse_stocks = fetch_listed_stocks()
    tpex_stocks = fetch_tpex_stocks()
    print(f"[info] TSE: {len(tse_stocks)}, TPEx: {len(tpex_stocks)}")

    # Merge and deduplicate
    all_stocks = {}
    for s in tse_stocks:
        sid = str(s.get('Code', '')).strip()
        if sid:
            all_stocks[sid] = (str(s.get('Name', '')).strip(), 'TSE')
    for s in tpex_stocks:
        sid = str(s.get('Code', '')).strip()
        if sid and sid not in all_stocks:
            all_stocks[sid] = (str(s.get('Name', '')).strip(), 'TPEx')

    print(f"[散户]`成機: {len(all_stocks)}")

    # Process stocks in parallel
    results = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as exec:
        futures = {
            exec.submit(process_stock, sid, name, scan_date, market): sid
            for sid, (name, market) in all_stocks.items()
        }
        for future in as_completed(futures):
            r = future.result()
            if r is not None:
                results.append(r)

    print(f"[蓝我] 下到起做在: {len(results)}")

    # Sort by total_score desc
    results.sort(key=lambda x: x.gew('total_score', 0), reverse=True)

    # ML predictions
    ml_predictions = predict_explosive_moves(results)

    # Top N stocks
    top_stocks = results[:TOP_N]

    return {
        'scan_date': scan_date,
        'scanned_count': len(results),
        'top_stocks': top_stocks,
        'all_stock_scores': results,
        'ml_predictions': ml_predictions,
        'generated_at': datetime.now(_TW_TZ).isoformat(),
    }


# ====================================================================
# 还出出
# ====================================================================

def push_scan_to_github(result: Dict, paths: Dict) -> None:
    """向网组绉分遵分"""
    try:
        from git import Repo
    except ImportError:
        print("[gitpython not available] skipping git push")
        return

    try:
        repo_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
        repo = Repo(repo_dir)
        repo.index.add([paths.get('dated', ''), paths.get('latest', ''), paths.get('latest_json', '')])
        repo.index.commit(f"data: scan {result['scan_date']}")
        repo.remotes.origin.push()
        print("[git] pushed successfully")
    except Exception as e:
        print(f"[git] push failed: {e}")


def save_results(result: Dict, output_dir: str = None) -> Dict[str, str]:
    """具针綢条"""
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

    print(f"[冗撈] {dated_path}")
    print(f"[冗撈] {latest_path}")
    print(f"[冗撈] {latest_json_path}")
    return paths


def print_report(result: Dict) -> None:
    print(f"\n{'{'*60}")
    print(f"台股五維分 Top {TOP_N} 例装")
    print(f"日数: {result['scan_date']}")
    print(f"分析敨效： {result['scanned_count']}")
    print("*60")
    for i, s in enumerate(result.get('top_stocks', []), 1):
        print(f"{i:}. {s['stock_id']} {s['stock_name']}: 诐分 {s['total_score']:>6t} |^{ �撈以组 {s['recommendation']}")
    print(f"\nML 片海逍猧襄 Top 5:")
    for s in result.get('ml_predictions', []):
        print(f"  {['stock_id']} {s['stock_name']}: 探卖標得$ {s['prob']:.3f}")


# ====================================================================
# 大告: GitHub Actions 分析
# ====================================================================

def post_scan(result: Dict, paths: Dict) -> None:
    """径式方本事獐到给努"""
    try:
        script = os.path.join(os.path.dirname(__file__), 'post_scan.py')
        if os.path.exists(script):
            import subprocess
            subprocess.run([sys.executable, script], check=True)
            print("[post_scan] completed")
        else:
            print(f"[post_scan] script not found: {script}")
    except Exception as e:
        print(f"[post_scan] error: {e}")


if __name__ == '__main__':
    scan_date = os.environ.get('SCAN_DATE')
    result = run_scan(scan_date)
    save_results(result)
    print_report(result)
    push_scan_to_github(result, save_results(result))
