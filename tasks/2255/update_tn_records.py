#!/usr/bin/env python3
"""
update_tn_records.py
====================
每日盤後執行（排程在 scan_market.py 之後）：

  1. 讀取 latest.json → 將今日 Top10 推薦加入 backtest.json records
     （若已存在則跳過，避免重複）
  2. 掃描所有 records 中 T+N 仍為 null 的欄位 → 從 OHLCV 快取補齊
  3. 從 records[] 生成 grouped_records[]（前端 HistoryBrowser/TrackingDashboard 需要）
  4. 將更新後的 backtest.json 寫回本機
  5. Push backtest.json 到 GitHub Pages repo

backtest.json schema:
  {
    "version": 2,
    "grouped_records": [
      {
        "scan_date": "2026-05-02",
        "periods": {
          "T1": { "label": "T+1", "backtest_date": "2026-05-05", "win_rate": 80.0,
                  "avg_return": 4.05, "pending": false,
                  "stocks": [{"stock_id": "...", "name": "...", "entry": 100.0,
                              "close": 105.0, "return_pct": 5.0,
                              "hit_target": true, "hit_stoploss": false,
                              "pending": false}] },
          "T3": { ... },
          "T5": { ... }
        }
      }
    ],
    "records": [...],   # legacy flat format kept for backward compat
    "history": [...]    # old format, kept as-is
  }

T+N 定義：以 entry_date 後的第 N 個交易日收盤價計算報酬率。
OHLCV 快取路徑：.cache/daily_ohlcv.json（結構：{YYYYMMDD: {stock_id: {close:...}}}）
"""

import json
import os
import re
import base64
from datetime import datetime, timedelta
from collections import defaultdict

try:
    import httpx as _httpx
except ImportError:
    _httpx = None

try:
    import requests as _requests
except ImportError:
    _requests = None

# ── Paths ─────────────────────────────────────────────────────────────────────
TASK_DIR    = os.path.dirname(os.path.abspath(__file__))
LATEST_JSON = os.path.join(TASK_DIR, 'latest.json')
BACKTEST    = os.path.join(TASK_DIR, 'backtest.json')
PUBLIC_BACKTEST = os.path.join(os.path.dirname(os.path.dirname(TASK_DIR)), 'taiwan-stock-radar', 'public', 'data', 'backtest.json')
OHLCV       = os.path.join(TASK_DIR, '.cache', 'daily_ohlcv.json')

# Also try the repo-relative path
REPO_BACKTEST_CANDIDATES = [
    '/home/sprite/taiwan-stock-radar/public/data/backtest.json',
    '/home/sprite/projects/taiwan-stock-radar/public/data/backtest.json',
    os.path.join(os.path.dirname(TASK_DIR), '..', 'public', 'data', 'backtest.json'),
]

# GitHub
OWNER  = 'juststarlight66-oss'
REPO   = 'taiwan-stock-radar'
BRANCH = 'main'
GH_BACKTEST_PATH = 'public/data/backtest.json'

TN_DAYS = {'t1': 1, 't3': 3, 't5': 5}


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _http():
    if _httpx is not None:
        return _httpx
    if _requests is not None:
        return _requests
    raise ImportError('Neither httpx nor requests available')


def _get_github_token() -> str:
    token = os.environ.get('GITHUB_TOKEN', '')
    if token:
        return token
    env_file = os.path.expanduser('~/.nebula-env')
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line.startswith('GITHUB_TOKEN='):
                    return line.split('=', 1)[1].strip().strip('"').strip("'")
    return ''


def _github_headers(token: str) -> dict:
    return {
        'Authorization': f'token {token}',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
    }


def _get_file_sha(path_in_repo: str, token: str) -> str:
    url = f'https://api.github.com/repos/{OWNER}/{REPO}/contents/{path_in_repo}'
    try:
        client = _http()
        r = client.get(url, headers=_github_headers(token), timeout=15)
        if hasattr(r, 'status_code'):
            if r.status_code == 200:
                return r.json().get('sha', '')
    except Exception as e:
        print(f'[WARN] get_sha failed for {path_in_repo}: {e}')
    return ''


def push_file_to_github(path_in_repo: str, content_str: str, commit_msg: str) -> bool:
    token = _get_github_token()
    if not token:
        print(f'[GitHub Push] SKIP -- no GITHUB_TOKEN found')
        return False

    encoded = base64.b64encode(content_str.encode('utf-8')).decode('ascii')
    sha = _get_file_sha(path_in_repo, token)

    payload = {'message': commit_msg, 'content': encoded, 'branch': BRANCH}
    if sha:
        payload['sha'] = sha

    url = f'https://api.github.com/repos/{OWNER}/{REPO}/contents/{path_in_repo}'
    try:
        client = _http()
        r = client.put(url, headers=_github_headers(token), json=payload, timeout=30)
        status = r.status_code if hasattr(r, 'status_code') else 200
        if status in (200, 201):
            print(f'[GitHub Push] OK: {path_in_repo}')
            return True
        else:
            print(f'[GitHub Push] FAIL {status}: {r.text[:200] if hasattr(r, "text") else ""}')
    except Exception as e:
        print(f'[GitHub Push] ERROR: {e}')
    return False


# ── OHLCV helpers ─────────────────────────────────────────────────────────────

def load_ohlcv() -> dict:
    if not os.path.exists(OHLCV):
        return {}
    try:
        with open(OHLCV) as f:
            return json.load(f)
    except Exception:
        return {}


def trading_days_sorted(ohlcv: dict) -> list:
    days = sorted(ohlcv.keys())
    return days


def get_close_after_n_days(ohlcv: dict, entry_date_str: str, stock_id: str, n: int) -> float | None:
    """Return close price on T+N trading day after entry_date_str (YYYY/MM/DD or YYYY-MM-DD)."""
    entry_date_str = entry_date_str.replace('/', '-')
    try:
        entry_dt = datetime.strptime(entry_date_str, '%Y-%m-%d')
    except ValueError:
        return None
    entry_ymd = entry_dt.strftime('%Y%m%d')
    days = trading_days_sorted(ohlcv)
    if not days:
        return None
    # Find entry date index
    try:
        idx = days.index(entry_ymd)
    except ValueError:
        # Find nearest day after entry
        idx = next((i for i, d in enumerate(days) if d >= entry_ymd), None)
        if idx is None:
            return None
        idx = idx - 1  # entry is not a trading day, use prev day as entry
    target_idx = idx + n
    if target_idx >= len(days):
        return None
    target_day = days[target_idx]
    day_data = ohlcv.get(target_day, {})
    stock_data = day_data.get(stock_id, {})
    if isinstance(stock_data, dict):
        return stock_data.get('close')
    return None


# ── Trading day calendar helper ───────────────────────────────────────────────

def add_trading_days(entry_date_str: str, n: int, ohlcv: dict) -> str | None:
    """Return the date string (YYYY-MM-DD) of T+N trading day."""
    entry_date_str = entry_date_str.replace('/', '-')
    try:
        entry_dt = datetime.strptime(entry_date_str, '%Y-%m-%d')
    except ValueError:
        return None
    entry_ymd = entry_dt.strftime('%Y%m%d')
    days = trading_days_sorted(ohlcv)
    if not days:
        # Fallback: assume 5 calendar days per trading week
        delta = timedelta(days=int(n * 1.5))
        return (entry_dt + delta).strftime('%Y-%m-%d')
    try:
        idx = days.index(entry_ymd)
    except ValueError:
        idx = next((i for i, d in enumerate(days) if d >= entry_ymd), None)
        if idx is None:
            return None
    target_idx = idx + n
    if target_idx >= len(days):
        # Estimate: last known day + n*2 calendar days
        last = datetime.strptime(days[-1], '%Y%m%d')
        remaining = target_idx - len(days) + 1
        return (last + timedelta(days=remaining * 2)).strftime('%Y-%m-%d')
    return datetime.strptime(days[target_idx], '%Y%m%d').strftime('%Y-%m-%d')


# ── Core logic ────────────────────────────────────────────────────────────────

def load_backtest() -> dict:
    if os.path.exists(BACKTEST):
        try:
            with open(BACKTEST) as f:
                return json.load(f)
        except Exception:
            pass
    return {'version': 2, 'grouped_records': [], 'records': [], 'history': []}


def save_backtest(data: dict):
    with open(BACKTEST, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'[save] backtest.json written ({os.path.getsize(BACKTEST)} bytes)')
    # Also write to repo public/data/ if accessible
    for candidate in REPO_BACKTEST_CANDIDATES:
        path = os.path.normpath(candidate)
        if os.path.exists(os.path.dirname(path)):
            try:
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                print(f'[save] also written to {path}')
                break
            except Exception as e:
                print(f'[WARN] could not write to {path}: {e}')


def load_latest() -> dict:
    if not os.path.exists(LATEST_JSON):
        print(f'[WARN] latest.json not found at {LATEST_JSON}')
        return {}
    try:
        with open(LATEST_JSON) as f:
            return json.load(f)
    except Exception as e:
        print(f'[WARN] could not load latest.json: {e}')
        return {}


def normalize_date(d: str) -> str:
    """Normalize date to YYYY-MM-DD."""
    return d.replace('/', '-') if d else d


def step1_add_today_top10(backtest: dict, latest: dict) -> int:
    """Add today's Top10 to records if not already present. Returns count added."""
    records = backtest.setdefault('records', [])
    scan_date = latest.get('scan_date', '')
    if not scan_date:
        print('[step1] No scan_date in latest.json, skipping')
        return 0
    scan_date_norm = normalize_date(scan_date)
    existing_keys = {(r['stock_id'], normalize_date(r['entry_date'])) for r in records}
    top10 = latest.get('top10', latest.get('stocks', []))[:10]
    added = 0
    for s in top10:
        sid = str(s.get('stock_id', s.get('id', '')))
        if not sid:
            continue
        key = (sid, scan_date_norm)
        if key in existing_keys:
            continue
        entry_price = s.get('close', s.get('price', s.get('entry_price')))
        records.append({
            'stock_id': sid,
            'name': s.get('name', ''),
            'entry_date': scan_date,
            'entry_price': entry_price,
            't1': {'pct': None, 'win': None},
            't3': {'pct': None, 'win': None},
            't5': {'pct': None, 'win': None},
        })
        existing_keys.add(key)
        added += 1
    print(f'[step1] Added {added} new records for {scan_date_norm}')
    return added


def step2_fill_tn_pcts(backtest: dict, ohlcv: dict) -> int:
    """Fill null T+N pcts from OHLCV cache. Returns count updated."""
    records = backtest.get('records', [])
    updated = 0
    for r in records:
        entry_date = r.get('entry_date', '')
        entry_price = r.get('entry_price')
        sid = r.get('stock_id', '')
        if not entry_price or not entry_date or not sid:
            continue
        for tn_key, n_days in TN_DAYS.items():
            tn = r.setdefault(tn_key, {'pct': None, 'win': None})
            if tn.get('pct') is not None:
                continue  # already filled
            close = get_close_after_n_days(ohlcv, entry_date, sid, n_days)
            if close is None:
                continue
            pct = round((close - entry_price) / entry_price * 100, 2)
            tn['pct'] = pct
            tn['win'] = pct > 0
            r[tn_key] = tn
            updated += 1
    print(f'[step2] Filled {updated} T+N pct values')
    return updated


def step3_build_grouped_records(backtest: dict, ohlcv: dict):
    """Build grouped_records[] from records[] for frontend HistoryBrowser/TrackingDashboard."""
    records = backtest.get('records', [])
    if not records:
        backtest['grouped_records'] = []
        return

    # Group by entry_date
    by_date = defaultdict(list)
    for r in records:
        d = normalize_date(r.get('entry_date', ''))
        if d:
            by_date[d].append(r)

    grouped = []
    for scan_date in sorted(by_date.keys(), reverse=True):
        recs = by_date[scan_date]
        periods = {}
        for tn_key, n_days, label in [('t1', 1, 'T+1'), ('t3', 3, 'T+3'), ('t5', 5, 'T+5')]:
            backtest_date = add_trading_days(scan_date, n_days, ohlcv)
            stocks = []
            pcts = []
            for r in recs:
                tn = r.get(tn_key, {})
                pct = tn.get('pct') if tn else None
                close_val = None
                ep = r.get('entry_price')
                if pct is not None and ep:
                    close_val = round(ep * (1 + pct / 100), 2)
                pending = pct is None
                stocks.append({
                    'stock_id': r.get('stock_id', ''),
                    'name': r.get('name', ''),
                    'entry': ep,
                    'close': close_val,
                    'return_pct': pct,
                    'hit_target': pct is not None and pct >= 3.0,
                    'hit_stoploss': pct is not None and pct <= -5.0,
                    'pending': pending,
                })
                if pct is not None:
                    pcts.append(pct)
            pending_period = len(pcts) == 0
            win_rate = None
            avg_return = None
            if pcts:
                wins = sum(1 for p in pcts if p > 0)
                win_rate = round(wins / len(pcts) * 100, 1)
                avg_return = round(sum(pcts) / len(pcts), 2)
            periods[tn_key.upper()] = {
                'label': label,
                'backtest_date': backtest_date or '',
                'win_rate': win_rate,
                'avg_return': avg_return,
                'pending': pending_period,
                'stocks': stocks,
            }
        grouped.append({'scan_date': scan_date, 'periods': periods})

    backtest['grouped_records'] = grouped
    backtest['version'] = 2
    print(f'[step3] Built grouped_records for {len(grouped)} scan dates')


def main():
    print('=== update_tn_records.py start ===')
    backtest = load_backtest()
    latest = load_latest()
    ohlcv = load_ohlcv()
    print(f'Loaded: {len(backtest.get("records", []))} records, '
          f'{len(ohlcv)} OHLCV days, '
          f'latest scan_date={latest.get("scan_date", "N/A")}')

    changed = 0
    if latest:
        changed += step1_add_today_top10(backtest, latest)
    changed += step2_fill_tn_pcts(backtest, ohlcv)
    step3_build_grouped_records(backtest, ohlcv)
    changed += 1  # grouped_records always regenerated

    save_backtest(backtest)

    content_str = json.dumps(backtest, ensure_ascii=False, separators=(',', ':'))
    today = datetime.now().strftime('%Y-%m-%d')
    push_file_to_github(
        GH_BACKTEST_PATH,
        content_str,
        f'fix(backtest): update T+N records + grouped_records [{today}]'
    )
    print('=== update_tn_records.py done ===')


if __name__ == '__main__':
    main()
