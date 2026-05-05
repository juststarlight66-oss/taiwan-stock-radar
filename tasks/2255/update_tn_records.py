#!/usr/bin/env python3
"""
update_tn_records.py
====================
每日盤後執行（排程在 scan_market.py 之後）：

  1. 讀取 latest.json → 將今日 Top10 推薦加入 backtest.json records
     （若已存在則跳過，避免重複）
  2. 掃描所有 records 中 T+N 仍為 null 的欄位 → 從 OHLCV 快取補齊
  3. 將更新後的 backtest.json 寫回本機
  4. Push backtest.json 到 GitHub Pages repo

backtest.json schema（records 區塊）:
  {
    "history": [...],          # 舊格式，保留不動
    "records": [
      {
        "stock_id":    "6412",
        "name":        "群電",
        "entry_date":  "2026/05/05",   # YYYY/MM/DD（scan_date）
        "entry_price": 89.1,
        "t1": {"pct": 3.2,  "win": true},
        "t3": {"pct": null, "win": null},
        "t5": {"pct": null, "win": null}
      },
      ...
    ]
  }

T+N 定義：以 entry_date 後的第 N 個交易日收盤價計算報酬率。
OHLCV 快取路徑：.cache/daily_ohlcv.json（結構：{YYYYMMDD: {stock_id: {close:...}}}）
"""

import json
import os
import re
import base64
from datetime import datetime

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
OHLCV       = os.path.join(TASK_DIR, '.cache', 'daily_ohlcv.json')

# GitHub
OWNER  = 'juststarlight66-oss'
REPO   = 'taiwan-stock-radar'
BRANCH = 'main'
GH_BACKTEST_PATH = 'public/data/backtest.json'


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _http():
    if _httpx is not None:
        return _httpx
    if _requests is not None:
        return _requests
    raise ImportError('Neither httpx nor requests available')


def _get_github_token() -> str:
    """Read GITHUB_TOKEN from env or ~/.nebula-env."""
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
    """Get existing file SHA for update (returns '' if file doesn't exist)."""
    url = f'https://api.github.com/repos/{OWNER}/{REPO}/contents/{path_in_repo}'
    try:
        client = _http()
        r = client.get(url, headers=_github_headers(token), timeout=15)
        if hasattr(r, 'status_code'):
            if r.status_code == 200:
                return r.json().get('sha', '')
        else:
            data = r
            if isinstance(data, dict):
                return data.get('sha', '')
    except Exception as e:
        print(f'[WARN] get_sha failed for {path_in_repo}: {e}')
    return ''


def push_file_to_github(path_in_repo: str, content_str: str, commit_msg: str) -> bool:
    """Push a single file to GitHub. Returns True on success."""
    token = _get_github_token()
    if not token:
        print(f'[GitHub Push] SKIP — no GITHUB_TOKEN found')
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
            print(f'[GitHub Push] OK  {path_in_repo}')
            return True
        else:
            body = r.text[:300] if hasattr(r, 'text') else str(r)
            print(f'[GitHub Push] ERR {path_in_repo} -> HTTP {status}: {body}')
            return False
    except Exception as e:
        print(f'[GitHub Push] ERR {path_in_repo}: {e}')
        return False


# ── OHLCV helpers ─────────────────────────────────────────────────────────────

def load_ohlcv() -> dict:
    """Load daily OHLCV cache: {YYYYMMDD: {stock_id: {close, ...}}}."""
    if not os.path.exists(OHLCV):
        print(f'[WARN] OHLCV cache not found: {OHLCV}')
        return {}
    with open(OHLCV) as f:
        return json.load(f)


def trading_dates_sorted(ohlcv: dict) -> list:
    """Return sorted list of YYYYMMDD trading date strings."""
    return sorted(ohlcv.keys())


def nth_trading_day_after(scan_date_yyyymmdd: str, n: int, trading_dates: list):
    """
    Return the YYYYMMDD of the Nth trading day after scan_date.
    Returns None if not yet available (future).
    """
    # Find scan_date index (or nearest prior date)
    idx = None
    for i, d in enumerate(trading_dates):
        if d == scan_date_yyyymmdd:
            idx = i
            break
    if idx is None:
        # scan date may be a weekend/holiday — find nearest prior
        for i, d in enumerate(trading_dates):
            if d > scan_date_yyyymmdd:
                idx = i - 1
                break
        if idx is None or idx < 0:
            return None

    target_idx = idx + n
    if target_idx >= len(trading_dates):
        return None  # not yet available
    return trading_dates[target_idx]


def get_close(ohlcv: dict, date_yyyymmdd: str, stock_id: str):
    """Return close price for stock on date, or None."""
    day = ohlcv.get(date_yyyymmdd, {})
    data = day.get(str(stock_id))
    if data is None:
        return None
    if isinstance(data, dict):
        return data.get('close')
    if isinstance(data, (int, float)):
        return data
    return None


def make_perf(entry_price: float, close_price) -> dict:
    """Compute {pct, win} from entry_price and close_price."""
    if close_price is None:
        return {'pct': None, 'win': None}
    pct = round((close_price - entry_price) / entry_price * 100, 2)
    return {'pct': pct, 'win': pct > 0}


# ── backtest.json I/O ─────────────────────────────────────────────────────────

def load_backtest() -> dict:
    if os.path.exists(BACKTEST):
        try:
            with open(BACKTEST) as f:
                data = json.load(f)
            data.setdefault('history', [])
            data.setdefault('records', [])
            return data
        except Exception as e:
            print(f'[WARN] backtest.json parse error: {e} — starting fresh')
    return {'history': [], 'records': []}


def save_backtest(data: dict):
    with open(BACKTEST, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    r_count = len(data.get('records', []))
    h_count = len(data.get('history', []))
    print(f'[INFO] backtest.json saved locally ({r_count} records, {h_count} history)')


def dedup_key(stock_id: str, entry_date: str) -> str:
    return f'{stock_id}|{entry_date}'


# ── Core logic ────────────────────────────────────────────────────────────────

def ingest_latest(backtest_data: dict) -> int:
    """
    Read latest.json and add today's Top10 as new pending records.
    Returns count of new records added.
    """
    if not os.path.exists(LATEST_JSON):
        print(f'[WARN] latest.json not found: {LATEST_JSON}')
        return 0

    with open(LATEST_JSON) as f:
        latest = json.load(f)

    scan_date = latest.get('scan_date', '')  # e.g. "2026/05/05"
    top10 = latest.get('top10', [])

    if not scan_date or not top10:
        print(f'[WARN] latest.json missing scan_date or top10')
        return 0

    # Build existing dedup set
    existing_keys = {
        dedup_key(str(r['stock_id']), r['entry_date'])
        for r in backtest_data.get('records', [])
    }

    added = 0
    for stock in top10:
        sid = str(stock.get('stock_id', ''))
        if not sid:
            continue

        strategy = stock.get('strategy') or {}
        entry_price = strategy.get('entry') or stock.get('close')
        if not entry_price:
            continue

        key = dedup_key(sid, scan_date)
        if key in existing_keys:
            continue  # already recorded today

        record = {
            'stock_id':    sid,
            'name':        stock.get('name', ''),
            'entry_date':  scan_date,
            'entry_price': float(entry_price),
            't1': {'pct': None, 'win': None},
            't3': {'pct': None, 'win': None},
            't5': {'pct': None, 'win': None},
        }
        backtest_data['records'].append(record)
        existing_keys.add(key)
        added += 1

    print(f'[INFO] ingest_latest: added {added} new records from {scan_date} (top10={len(top10)})')
    return added


def _scan_date_to_yyyymmdd(scan_date: str) -> str:
    """Convert '2026/05/05' or '2026-05-05' to '20260505'."""
    return re.sub(r'\D', '', scan_date)


def fill_pending_tn(backtest_data: dict, ohlcv: dict) -> int:
    """
    For every record with null T+N values, try to fill from OHLCV cache.
    Returns count of (record, period) pairs updated.
    """
    trading_dates = trading_dates_sorted(ohlcv)
    updated = 0

    for rec in backtest_data.get('records', []):
        sid = str(rec.get('stock_id', ''))
        entry_price = rec.get('entry_price')
        entry_date_disp = rec.get('entry_date', '')  # YYYY/MM/DD

        if not sid or not entry_price or not entry_date_disp:
            continue

        scan_yyyymmdd = _scan_date_to_yyyymmdd(entry_date_disp)

        for period, n in [('t1', 1), ('t3', 3), ('t5', 5)]:
            existing = rec.get(period, {})
            if existing and existing.get('pct') is not None:
                continue  # already filled

            target_date = nth_trading_day_after(scan_yyyymmdd, n, trading_dates)
            if target_date is None:
                continue  # not yet available

            close = get_close(ohlcv, target_date, sid)
            perf = make_perf(float(entry_price), close)

            if perf['pct'] is not None:
                rec[period] = perf
                updated += 1

    print(f'[INFO] fill_pending_tn: filled {updated} T+N slots from OHLCV cache')
    return updated


def sort_records(records: list) -> list:
    """Sort records by entry_date descending, then stock_id ascending."""
    return sorted(records, key=lambda r: (r.get('entry_date', ''), r.get('stock_id', '')), reverse=True)


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    print('=' * 60)
    print('update_tn_records.py  — daily T+N backtest updater')
    print(f'Run time: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    print('=' * 60)

    # 1. Load OHLCV cache
    ohlcv = load_ohlcv()
    if not ohlcv:
        print('[WARN] OHLCV cache empty — T+N fill will be skipped')

    # 2. Load existing backtest.json
    backtest_data = load_backtest()
    print(f'[INFO] Loaded backtest.json: {len(backtest_data["records"])} existing records')

    # 3. Add today's Top10 from latest.json (new pending records)
    added = ingest_latest(backtest_data)

    # 4. Fill pending T+N slots from OHLCV cache
    filled = 0
    if ohlcv:
        filled = fill_pending_tn(backtest_data, ohlcv)
    else:
        print('[WARN] Skipping T+N fill — no OHLCV data')

    # 5. Sort and save locally
    backtest_data['records'] = sort_records(backtest_data['records'])
    save_backtest(backtest_data)

    # 6. Push to GitHub if anything changed
    if added > 0 or filled > 0:
        today_key = datetime.now().strftime('%Y%m%d')
        content_str = json.dumps(backtest_data, ensure_ascii=False, indent=2)
        commit_msg = f'chore: update backtest T+N records {today_key} (+{added} new, {filled} filled)'
        ok = push_file_to_github(GH_BACKTEST_PATH, content_str, commit_msg)
        if ok:
            print('[DONE] backtest.json pushed to GitHub.')
        else:
            print('[WARN] GitHub push failed — local file is updated.')
    else:
        print('[INFO] No changes — skipping GitHub push.')

    print(f'[DONE] update_tn_records complete. records={len(backtest_data["records"])}')


if __name__ == '__main__':
    main()
