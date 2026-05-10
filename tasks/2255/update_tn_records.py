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
    "grouped_records": [\
      {\
        "scan_date": "2026-05-02",\
        "periods": {\
          "T1": { "label": "T+1", "backtest_date": "2026-05-05", "win_rate": 80.0,\
                  "avg_return": 4.05, "pending": false,\
                  "stocks": [{"stock_id": "...", "name": "...", "entry": 100.0,\
                              "close": 105.0, "return_pct": 5.0,\
                              "hit_target": true, "hit_stoploss": false,\
                              "pending": false}] },\
          "T3": { ... },\
          "T5": { ... }\
        }\
      }\
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
from datetime import datetime, timedelta, timezone
from collections import defaultdict

# 台灣時區 UTC+8
_TW_TZ = timezone(timedelta(hours=8))

try:
    import httpx as _httpx
except ImportError:
    _httpx = None

try:
    import requests as _requests
except ImportError:
    _requests = None

# ── Paths ─────────────────────────────────────────────────────────────────────
TASK_DIR       = os.path.dirname(os.path.abspath(__file__))
LATEST_JSON    = os.path.join(TASK_DIR, 'latest.json')
BACKTEST       = os.path.join(TASK_DIR, 'backtest.json')
PUBLIC_BACKTEST = os.path.join(os.path.dirname(os.path.dirname(TASK_DIR)), 'taiwan-stock-radar', 'public', 'data', 'backtest.json')
OHLCV          = os.path.join(TASK_DIR, '.cache', 'daily_ohlcv.json')

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


def push_file_to_github(path_in_repo: str, content_str: str, commit_msg: str, token: str) -> bool:
    """Push a file to GitHub via the Contents API."""
    if not token:
        print('[WARN] No GitHub token — skipping push')
        return False
    sha = _get_file_sha(path_in_repo, token)
    url = f'https://api.github.com/repos/{OWNER}/{REPO}/contents/{path_in_repo}'
    payload: dict = {
        'message': commit_msg,
        'content': base64.b64encode(content_str.encode()).decode(),
        'branch': BRANCH,
    }
    if sha:
        payload['sha'] = sha
    try:
        client = _http()
        r = client.put(url, headers=_github_headers(token), json=payload, timeout=30)
        if hasattr(r, 'status_code'):
            if r.status_code in (200, 201):
                print(f'[OK] Pushed {path_in_repo}')
                return True
            else:
                print(f'[ERR] Push failed {r.status_code}: {r.text}')
    except Exception as e:
        print(f'[ERR] push_file_to_github: {e}')
    return False


# ── Trading calendar helpers ──────────────────────────────────────────────────

def _is_trading_day(d: datetime.date) -> bool:
    """Rough check: weekday Mon-Fri, not a public holiday (simplified)."""
    return d.weekday() < 5


def _nth_trading_day_after(start_date_str: str, n: int) -> str:
    """Return the date string of the n-th trading day after start_date_str."""
    try:
        d = datetime.strptime(start_date_str, '%Y-%m-%d').date()
    except ValueError:
        return ''
    count = 0
    while count < n:
        d += timedelta(days=1)
        if _is_trading_day(d):
            count += 1
    return d.strftime('%Y-%m-%d')


# ── OHLCV cache helpers ───────────────────────────────────────────────────────

def _load_ohlcv() -> dict:
    if os.path.exists(OHLCV):
        try:
            with open(OHLCV) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _get_close(ohlcv: dict, date_str: str, stock_id: str) -> float | None:
    date_key = date_str.replace('-', '')
    day_data = ohlcv.get(date_key, {})
    stock_data = day_data.get(stock_id, {})
    close = stock_data.get('close')
    if close is not None:
        try:
            return float(close)
        except (TypeError, ValueError):
            pass
    return None


# ── Step 1: Add today's Top10 to records ─────────────────────────────────────

def step1_add_today_top10(backtest: dict, latest: dict) -> bool:
    """
    從 latest.json 取出今日 Top10，append 到 backtest['records']。
    Returns True if new records were added.
    """
    scan_date = latest.get('scan_date', '')
    if not scan_date:
        print('[WARN] latest.json missing scan_date')
        return False

    stocks = latest.get('top10', latest.get('stocks', []))
    if not stocks:
        print('[WARN] latest.json has no top10/stocks')
        return False

    records: list = backtest.setdefault('records', [])
    existing_dates = {r['entry_date'] for r in records}
    if scan_date in existing_dates:
        print(f'[INFO] {scan_date} already in records — skipping step1')
        return False

    added = 0
    for s in stocks:
        sid = s.get('stock_id') or s.get('id') or s.get('code', '')
        if not sid:
            continue
        # entry_low 是 scan_market.py 算出的建議進場價（技術面低點），優先使用
        # fallback 順序: entry_low → entry_price → close → price
        entry_price = (
            s.get('entry_low') or
            s.get('entry_price') or
            s.get('close') or
            s.get('price')
        )
        stop_loss = s.get('stop_loss') or s.get('stop') or None
        records.append({
            'stock_id': sid,
            'name': s.get('name', ''),
            'entry_date': scan_date,
            'entry_price': entry_price,
            'stop_loss': stop_loss,
            't1': {'pct': None, 'win': None},
            't3': {'pct': None, 'win': None},
            't5': {'pct': None, 'win': None},
        })
        added += 1

    print(f'[INFO] step1: added {added} records for {scan_date}')
    return added > 0


# ── Step 2: Fill T+N returns ──────────────────────────────────────────────────

def step2_fill_tn(backtest: dict, ohlcv: dict) -> int:
    """
    For each record with null T+N, compute the return if OHLCV data is available.
    Returns number of fields updated.
    """
    today = datetime.now(_TW_TZ).date()
    updated = 0
    records = backtest.get('records', [])

    for rec in records:
        entry_date = rec.get('entry_date', '')
        entry_price = rec.get('entry_price')
        sid = rec.get('stock_id', '')

        if not entry_date or not entry_price or not sid:
            continue

        for tn_key, n_days in TN_DAYS.items():
            tn = rec.get(tn_key, {})
            if tn.get('pct') is not None:
                continue  # already filled

            target_date_str = _nth_trading_day_after(entry_date, n_days)
            if not target_date_str:
                continue

            target_date = datetime.strptime(target_date_str, '%Y-%m-%d').date()
            if target_date > today:
                continue  # future — skip

            close = _get_close(ohlcv, target_date_str, sid)
            if close is None:
                continue

            try:
                ep = float(entry_price)
                if ep <= 0:
                    continue
                pct = round((close - ep) / ep * 100, 2)
                win = pct > 0
            except (TypeError, ValueError):
                continue

            rec[tn_key] = {'pct': pct, 'win': win, 'close': close, 'date': target_date_str}
            updated += 1

    print(f'[INFO] step2: updated {updated} T+N fields')
    return updated


# ── Step 3: Rebuild grouped_records ──────────────────────────────────────────

def step3_rebuild_grouped(backtest: dict) -> None:
    """
    Group records by entry_date → build grouped_records[] for front-end.
    """
    records = backtest.get('records', [])
    by_date: dict[str, list] = defaultdict(list)
    for rec in records:
        by_date[rec['entry_date']].append(rec)

    grouped = []
    for scan_date in sorted(by_date.keys(), reverse=True):
        recs = by_date[scan_date]
        periods: dict = {}
        for tn_key, label in [('t1', 'T+1'), ('t3', 'T+3'), ('t5', 'T+5')]:
            TN_KEY = tn_key.upper()  # T1 / T3 / T5
            stocks_out = []
            wins = []
            returns = []
            all_pending = True
            backtest_date = ''

            for rec in recs:
                tn = rec.get(tn_key, {})
                pct = tn.get('pct')
                win = tn.get('win')
                close_price = tn.get('close')
                tn_date = tn.get('date', '')
                pending = pct is None
                if not pending:
                    all_pending = False
                    if tn_date:
                        backtest_date = tn_date
                    if win is not None:
                        wins.append(win)
                    if pct is not None:
                        returns.append(pct)

                entry_val = rec.get('entry_price')
                try:
                    entry_float = float(entry_val) if entry_val is not None else 0.0
                except (TypeError, ValueError):
                    entry_float = 0.0

                if close_price is None and entry_float and pct is not None:
                    close_price = round(entry_float * (1 + pct / 100), 2)

                stocks_out.append({
                    'stock_id':    rec.get('stock_id', ''),
                    'name':        rec.get('name', ''),
                    'entry':       entry_float,
                    'entry_price': entry_float,
                    'close':       close_price,
                    'return_pct':  pct,
                    'hit_target':  win if win else False,
                    'hit_stoploss': False,
                    'pending':     pending,
                })

            win_rate  = round(sum(wins) / len(wins) * 100, 1) if wins else None
            avg_return = round(sum(returns) / len(returns), 2) if returns else None

            periods[TN_KEY] = {
                'label':        label,
                'backtest_date': backtest_date,
                'win_rate':     win_rate,
                'avg_return':   avg_return,
                'pending':      all_pending,
                'stocks':       stocks_out,
            }

        grouped.append({'scan_date': scan_date, 'periods': periods})

    backtest['grouped_records'] = grouped
    print(f'[INFO] step3: rebuilt {len(grouped)} grouped_records entries')


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print('=== update_tn_records.py ===')

    # Load latest.json
    if not os.path.exists(LATEST_JSON):
        print(f'[ERR] latest.json not found at {LATEST_JSON}')
        return
    with open(LATEST_JSON) as f:
        latest = json.load(f)

    # Load or init backtest.json
    if os.path.exists(BACKTEST):
        with open(BACKTEST) as f:
            backtest = json.load(f)
    else:
        backtest = {'version': 2, 'grouped_records': [], 'records': []}

    # Step 1
    step1_add_today_top10(backtest, latest)

    # Step 2
    ohlcv = _load_ohlcv()
    step2_fill_tn(backtest, ohlcv)

    # Step 3
    step3_rebuild_grouped(backtest)

    # Write local
    with open(BACKTEST, 'w') as f:
        json.dump(backtest, f, ensure_ascii=False, indent=2)
    print(f'[OK] Wrote {BACKTEST}')

    # Also write to repo path if exists
    for candidate in REPO_BACKTEST_CANDIDATES:
        candidate = os.path.normpath(candidate)
        if os.path.exists(os.path.dirname(candidate)):
            try:
                with open(candidate, 'w') as f:
                    json.dump(backtest, f, ensure_ascii=False, indent=2)
                print(f'[OK] Also wrote {candidate}')
                break
            except Exception as e:
                print(f'[WARN] Could not write {candidate}: {e}')

    # Push to GitHub
    token = _get_github_token()
    content_str = json.dumps(backtest, ensure_ascii=False, indent=2)
    push_file_to_github(
        GH_BACKTEST_PATH,
        content_str,
        f'chore(backtest): update T+N records {latest.get("scan_date", "")}',
        token,
    )
    print('=== done ===')


if __name__ == '__main__':
    main()
