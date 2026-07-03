#!/usr/bin/env python3
"""
Weekly K-Line Backtest Report
==============================
Reads latest.json top10, backtest.json history, verifies T+N returns via yfinance,
and computes POWER COMBO indicators (three-light signal framework).

Usage: python weekly_backtest.py [--output PATH] [--repo ROOT]
"""

import argparse, json, os, sys, time, urllib.request, urllib.error
from datetime import datetime, timedelta


def find_repo_root():
    """Auto-detect repo root."""
    for start in [os.path.dirname(os.path.abspath(__file__)), os.getcwd(),
                  os.environ.get('REPO_DIR', '')]:
        if not start:
            continue
        path = start
        for _ in range(5):
            if os.path.isdir(os.path.join(path, 'public', 'data')):
                return os.path.abspath(path)
            if os.path.isdir(os.path.join(path, '..', 'public', 'data')):
                return os.path.abspath(os.path.join(path, '..'))
            path = os.path.join(path, '..')
    # fallback
    for candidate in ['/home/nebula/projects/juststarlight66-oss/taiwan-stock-radar',
                      '/home/nebula/taiwan-stock-radar']:
        if os.path.isdir(os.path.join(candidate, 'public', 'data')):
            return candidate
    raise RuntimeError("Cannot find repo root with public/data/")


def fetch_yahoo_close(symbol, target_date_str):
    """Fetch close price for a specific date from Yahoo Finance.
    Returns (price, None) on success, or (None, error_msg) on failure.
    """
    target_dt = datetime.strptime(target_date_str, "%Y-%m-%d")
    target_ts = int(target_dt.timestamp())
    end_ts = target_ts + 86400 * 2
    start_ts = target_ts - 86400 * 5

    tw_symbol = f"{symbol}.TW"
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{tw_symbol}?period1={start_ts}&period2={end_ts}&interval=1d"

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
    except Exception as e:
        # Try .TWO
        tw_symbol2 = f"{symbol}.TWO"
        url2 = f"https://query1.finance.yahoo.com/v8/finance/chart/{tw_symbol2}?period1={start_ts}&period2={end_ts}&interval=1d"
        try:
            req2 = urllib.request.Request(url2, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req2, timeout=10) as resp2:
                data = json.loads(resp2.read().decode())
        except Exception as e2:
            return None, str(e2)

    result = data.get("chart", {}).get("result", [])
    if not result:
        return None, "no chart data"

    timestamps = result[0].get("timestamp", [])
    quotes = result[0].get("indicators", {}).get("quote", [{}])[0]
    closes = quotes.get("close", [])

    for i, ts in enumerate(timestamps):
        dt = datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")
        if dt == target_date_str and i < len(closes) and closes[i] is not None:
            return closes[i], None

    return None, f"no data for {target_date_str}"


def compute_trading_day_offset(base_date_str, days_offset, repo_root):
    """Compute a trading day date offset from base_date.
    Uses the scan_result files to find actual trading days.
    Falls back to calendar day offset + weekend skip.
    """
    from datetime import timedelta as td
    base_dt = datetime.strptime(base_date_str, "%Y%m%d")

    # Try to find scan files to map trading days
    data_dir = os.path.join(repo_root, 'public', 'data')
    trading_days = set()
    for fname in os.listdir(data_dir):
        if fname.startswith('scan_result_') and fname.endswith('.json'):
            d = fname.replace('scan_result_', '').replace('.json', '')
            if len(d) == 8:
                trading_days.add(d)

    if trading_days:
        sorted_days = sorted(trading_days)
        try:
            idx = sorted_days.index(base_date_str)
            target_idx = idx + days_offset
            if 0 <= target_idx < len(sorted_days):
                return sorted_days[target_idx]
        except ValueError:
            pass

    # Fallback: calendar date offset with weekend skip
    target = base_dt + td(days=days_offset)
    while target.weekday() >= 5:
        target += td(days=1)
    return target.strftime("%Y%m%d")


def load_latest_top10(repo_root):
    """Load latest.json and extract top10."""
    latest_path = os.path.join(repo_root, 'public', 'data', 'latest.json')
    with open(latest_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    top10 = data.get('top10', [])
    scan_date = data.get('scan_date', '')
    scanned_count = data.get('scanned_count', 0)

    return top10, scan_date, scanned_count, data.get('market_summary', {})


def load_backtest_history(repo_root):
    """Load backtest.json historical records."""
    bt_path = os.path.join(repo_root, 'public', 'data', 'backtest.json')
    if not os.path.exists(bt_path):
        return []
    with open(bt_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data.get('records', [])


def compute_power_combo(backtest_records):
    """Compute POWER COMBO indicators from historical T+N data."""
    t1_wins = 0
    t1_total = 0
    t3_wins = 0
    t3_total = 0
    t5_wins = 0
    t5_total = 0
    t5_returns = []
    stop_loss_triggers = 0

    for r in backtest_records:
        t1 = r.get('t1', {})
        if t1.get('pct') is not None:
            t1_total += 1
            if t1.get('win'):
                t1_wins += 1

        t3 = r.get('t3', {})
        if t3.get('pct') is not None:
            t3_total += 1
            if t3.get('win'):
                t3_wins += 1

        t5 = r.get('t5', {})
        if t5.get('pct') is not None:
            t5_total += 1
            if t5.get('win'):
                t5_wins += 1
            t5_returns.append(t5['pct'])

        # Stop loss: entry has stop_loss field and price fell below it
        stop_loss = r.get('stop_loss')
        if stop_loss and t5.get('pct') is not None and t5['pct'] < -4:
            stop_loss_triggers += 1

    return {
        "description": "三燈號指標 - T+N 追蹤框架",
        "t1_win_rate": round(t1_wins / t1_total * 100, 1) if t1_total else 0,
        "t1_samples": t1_total,
        "t3_win_rate": round(t3_wins / t3_total * 100, 1) if t3_total else None,
        "t3_samples": t3_total,
        "t5_win_rate": round(t5_wins / t5_total * 100, 1) if t5_total else None,
        "t5_samples": t5_total,
        "avg_t5_return": round(sum(t5_returns) / len(t5_returns), 2) if t5_returns else None,
        "stop_loss_triggers": stop_loss_triggers,
        "note": f"基於 {len(backtest_records)} 筆歷史推薦的 T+N 追蹤數據"
    }


def verify_tn_returns(top10, scan_date, repo_root):
    """Try to verify T+N returns for prior entries that have enough time elapsed."""
    today = datetime.now()
    scan_dt = datetime.strptime(scan_date, "%Y%m%d")

    results = []
    for stock in top10:
        entry = {
            "stock_id": stock.get("stock_id", ""),
            "name": stock.get("name", ""),
            "entry_date": scan_date,
            "entry_price": stock.get("close", stock.get("entry_price", 0)),
            "stop_loss": round(stock.get("close", 0) * 0.96, 2),
            "stop_loss_pct": 4.0,
            "t1": {"pct": None, "win": None},
            "t3": {"pct": None, "win": None},
            "t5": {"pct": None, "win": None},
            "total_score": stock.get("total_score", 0),
            "close": stock.get("close", 0),
            "change_pct": stock.get("change_pct", 0),
            "sector": stock.get("sector", ""),
            "sector_boost": stock.get("sector_boost", 0),
        }

        stock_id = entry["stock_id"]
        entry_price = entry["entry_price"]

        # T+1 verification
        t1_date = compute_trading_day_offset(scan_date, 1, repo_root)
        t1_dt = datetime.strptime(t1_date, "%Y%m%d")
        if t1_dt < today:
            close, err = fetch_yahoo_close(stock_id, t1_dt.strftime("%Y-%m-%d"))
            if close is not None:
                pct = round((close - entry_price) / entry_price * 100, 2)
                entry["t1"] = {"pct": pct, "win": pct > 0, "date": t1_date, "close": round(close, 2)}

        # T+3 verification
        t3_date = compute_trading_day_offset(scan_date, 3, repo_root)
        t3_dt = datetime.strptime(t3_date, "%Y%m%d")
        if t3_dt < today:
            close, err = fetch_yahoo_close(stock_id, t3_dt.strftime("%Y-%m-%d"))
            if close is not None:
                pct = round((close - entry_price) / entry_price * 100, 2)
                entry["t3"] = {"pct": pct, "win": pct > 0, "date": t3_date, "close": round(close, 2)}

        # T+5 verification
        t5_date = compute_trading_day_offset(scan_date, 5, repo_root)
        t5_dt = datetime.strptime(t5_date, "%Y%m%d")
        if t5_dt < today:
            close, err = fetch_yahoo_close(stock_id, t5_dt.strftime("%Y-%m-%d"))
            if close is not None:
                pct = round((close - entry_price) / entry_price * 100, 2)
                entry["t5"] = {"pct": pct, "win": pct > 0, "date": t5_date, "close": round(close, 2)}

        results.append(entry)
        time.sleep(0.2)  # rate limit

    return results


def main():
    parser = argparse.ArgumentParser(description="Weekly K-Line Backtest Report")
    parser.add_argument("--output", default="", help="Output JSON path")
    parser.add_argument("--repo", default="", help="Repo root path")
    args = parser.parse_args()

    repo_root = args.repo or find_repo_root()
    print(f"Repo root: {repo_root}")

    # Load data
    top10, scan_date, scanned_count, market_summary = load_latest_top10(repo_root)
    print(f"Scan date: {scan_date}, Top10: {len(top10)}, Scanned: {scanned_count}")

    backtest_history = load_backtest_history(repo_root)
    print(f"Backtest history: {len(backtest_history)} records")

    # Compute POWER COMBO from history
    power_combo = compute_power_combo(backtest_history)

    # Collect scan days for this week (Mon-Fri around scan_date)
    scan_dt = datetime.strptime(scan_date, "%Y%m%d")
    week_start = scan_dt - timedelta(days=scan_dt.weekday())
    scan_days_this_week = []
    data_dir = os.path.join(repo_root, 'public', 'data')
    for i in range(5):
        d = (week_start + timedelta(days=i)).strftime("%Y%m%d")
        fname = f"scan_result_{d}.json"
        if os.path.exists(os.path.join(data_dir, fname)):
            scan_days_this_week.append(d)
    if scan_date not in scan_days_this_week:
        scan_days_this_week.append(scan_date)
    scan_days_this_week.sort()

    # Verify T+N returns for top10
    print("Verifying T+N returns...")
    weekly_top10 = verify_tn_returns(top10, scan_date, repo_root)

    # Extract sector info from market_summary
    sectors = market_summary.get('sector_ranking', [])
    top_sectors = [{"name": s.get('name', ''), "change_pct": s.get('change_pct', 0)}
                   for s in (sectors[:3] if isinstance(sectors, list) else [])]

    # Build report
    now = datetime.now()
    report = {
        "report_date": scan_date,
        "report_type": "weekly_backtest",
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%S+08:00"),
        "week_ending": (week_start + timedelta(days=4)).strftime("%Y-%m-%d"),
        "scan_days_this_week": scan_days_this_week,
        "summary": {
            "total_recommendations": len(weekly_top10),
            "scanned_stocks": scanned_count,
            "top_sectors": top_sectors,
            "avg_score": round(sum(s["total_score"] for s in weekly_top10) / len(weekly_top10), 2) if weekly_top10 else 0,
        },
        "power_combo_indicators": power_combo,
        "weekly_top10": weekly_top10,
    }

    # Output
    out_path = args.output
    if not out_path:
        out_path = os.path.join(repo_root, 'tasks', '2255', f'weekly_backtest_{scan_date}.json')

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    # Also copy to gh-pages
    import shutil
    gh_pages_data = os.path.join(repo_root, 'gh-pages', 'data')
    if not os.path.isdir(gh_pages_data):
        gh_pages_data = os.path.join(repo_root, 'public', 'data')
    dest = os.path.join(gh_pages_data, os.path.basename(out_path))
    shutil.copy2(out_path, dest)

    print(f"\nWeekly Backtest Report: {out_path}")
    print(f"  Top10 stocks: {len(weekly_top10)}")
    print(f"  POWER COMBO - T1 win rate: {power_combo['t1_win_rate']}% ({power_combo['t1_samples']} samples)")
    print(f"  POWER COMBO - T3 win rate: {power_combo['t3_win_rate']}% ({power_combo['t3_samples']} samples)" if power_combo['t3_win_rate'] is not None else "  T3: insufficient data")
    print(f"  POWER COMBO - T5 win rate: {power_combo['t5_win_rate']}% avg return: {power_combo['avg_t5_return']}% ({power_combo['t5_samples']} samples)" if power_combo['t5_win_rate'] is not None else "  T5: insufficient data")
    print(f"  Stop loss triggers: {power_combo['stop_loss_triggers']}")


if __name__ == "__main__":
    main()
