#!/usr/bin/env python3
"""
post_scan.py - Run after scan_market.py to copy results to public/data/
and update index.json and backtest.json
"""
import json
import os
import datetime
import shutil
import glob
import pytz

tz = pytz.timezone('Asia/Taipei')
now = datetime.datetime.now(tz)
date_str = now.strftime('%Y%m%d')
date_slash = now.strftime('%Y/%m/%d')
date_iso = now.strftime('%Y-%m-%d')

script_dir = os.path.dirname(os.path.abspath(__file__))
repo_root = os.path.abspath(os.path.join(script_dir, '..', '..'))
data_dir = os.path.join(repo_root, 'public', 'data')
os.makedirs(data_dir, exist_ok=True)

print(f"Post-scan processing for date: {date_str}")

# --- Copy core result files ---
files_to_copy = [
    ('scan_result.json', f'scan_result_{date_str}.json'),
    ('latest.json', 'latest.json'),
    ('all_scores.json', 'all_scores.json'),
]

for src_name, dst_name in files_to_copy:
    src = os.path.join(script_dir, src_name)
    dst = os.path.join(data_dir, dst_name)
    if os.path.exists(src):
        shutil.copy2(src, dst)
        print(f"Copied {src_name} -> public/data/{dst_name}")
    else:
        print(f"WARNING: {src_name} not found, skipping")

# --- Update index.json ---
index_path = os.path.join(data_dir, 'index.json')
if os.path.exists(index_path):
    with open(index_path, encoding='utf-8') as f:
        index = json.load(f)
else:
    index = {"scans": []}

entry = {
    "date": date_str,
    "file": f"scan_result_{date_str}.json",
    "scan_time": now.strftime('%H:%M:%S')
}

scans = index.get("scans", [])
existing_dates = [s["date"] for s in scans]
if date_str not in existing_dates:
    scans.append(entry)
else:
    for s in scans:
        if s["date"] == date_str:
            s.update(entry)

scans.sort(key=lambda x: x["date"], reverse=True)
index["scans"] = scans[:60]
index["updated_at"] = now.isoformat()

with open(index_path, 'w', encoding='utf-8') as f:
    json.dump(index, f, ensure_ascii=False, indent=2)
print(f"Updated index.json ({len(index['scans'])} entries)")

# --- Update backtest.json (grouped_records + periods format) ---
backtest_path = os.path.join(data_dir, 'backtest.json')
if os.path.exists(backtest_path):
    with open(backtest_path, encoding='utf-8') as f:
        backtest = json.load(f)
else:
    backtest = {"version": 2, "grouped_records": [], "history": []}

# Ensure version 2 structure exists
if "grouped_records" not in backtest:
    backtest["grouped_records"] = []
if "version" not in backtest:
    backtest["version"] = 2

scan_path = os.path.join(script_dir, 'scan_result.json')
if os.path.exists(scan_path):
    with open(scan_path, encoding='utf-8') as f:
        scan = json.load(f)

    top10 = scan.get('top10', [])[:10]

    # Build stocks list for grouped_records entry
    stocks_list = []
    for s in top10:
        sid = s.get('stock_id', s.get('code', ''))
        close_price = float(s.get('close', 0) or 0)
        stocks_list.append({
            "stock_id": sid,
            "name": s.get('name', ''),
            "entry": close_price,
            "close": None,
            "return_pct": None,
            "hit_target": None,
            "hit_stoploss": None,
            "pending": True
        })

    # Build new grouped_records entry (T+1/T+3/T+5 all pending)
    new_gr_entry = {
        "scan_date": date_iso,
        "periods": {
            "T1": {
                "label": "T+1",
                "backtest_date": None,
                "win_rate": None,
                "avg_return": None,
                "pending": True,
                "stocks": [dict(s) for s in stocks_list]
            },
            "T3": {
                "label": "T+3",
                "backtest_date": None,
                "win_rate": None,
                "avg_return": None,
                "pending": True,
                "stocks": [dict(s) for s in stocks_list]
            },
            "T5": {
                "label": "T+5",
                "backtest_date": None,
                "win_rate": None,
                "avg_return": None,
                "pending": True,
                "stocks": [dict(s) for s in stocks_list]
            }
        }
    }

    # Upsert: replace existing entry for today, or append
    grouped = backtest.get("grouped_records", [])
    grouped = [g for g in grouped if g.get("scan_date") != date_iso]
    grouped.append(new_gr_entry)
    grouped.sort(key=lambda x: x["scan_date"], reverse=True)
    backtest["grouped_records"] = grouped[:90]

    # Also keep legacy history[] for backward compat
    stocks_map = {}
    for s in top10:
        sid = s.get('stock_id', s.get('code', ''))
        stocks_map[sid] = {
            "name": s.get('name', ''),
            "score": s.get('total_score', s.get('score', 0)),
            "close": s.get('close', 0)
        }
    legacy_entry = {"date": date_slash, "results": stocks_map}
    history = backtest.get('history', [])
    history = [h for h in history if h.get('date') != date_slash]
    history.append(legacy_entry)
    history.sort(key=lambda x: x['date'], reverse=True)
    backtest['history'] = history[:90]

    backtest["last_updated"] = now.isoformat()

    with open(backtest_path, 'w', encoding='utf-8') as f:
        json.dump(backtest, f, ensure_ascii=False, indent=2)
    print(f"Updated backtest.json: {len(backtest['grouped_records'])} grouped_records, {len(backtest['history'])} history entries")
else:
    print("WARNING: scan_result.json not found, backtest.json not updated")

print("post_scan.py complete.")
