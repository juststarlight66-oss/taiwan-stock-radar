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

# --- Update backtest.json ---
backtest_path = os.path.join(data_dir, 'backtest.json')
if os.path.exists(backtest_path):
    with open(backtest_path, encoding='utf-8') as f:
        backtest = json.load(f)
else:
    backtest = {"history": []}

scan_path = os.path.join(script_dir, 'scan_result.json')
if os.path.exists(scan_path):
    with open(scan_path, encoding='utf-8') as f:
        scan = json.load(f)

    top10 = scan.get('top10', [])[:10]
    stocks_map = {}
    for s in top10:
        sid = s.get('stock_id', s.get('code', ''))
        stocks_map[sid] = {
            "name": s.get('name', ''),
            "score": s.get('total_score', s.get('score', 0)),
            "close": s.get('close', 0)
        }

    new_entry = {"date": date_slash, "results": stocks_map}
    history = backtest.get('history', [])
    history = [h for h in history if h.get('date') != date_slash]
    history.append(new_entry)
    history.sort(key=lambda x: x['date'], reverse=True)
    backtest['history'] = history[:90]

    with open(backtest_path, 'w', encoding='utf-8') as f:
        json.dump(backtest, f, ensure_ascii=False, indent=2)
    print(f"Updated backtest.json ({len(backtest['history'])} history entries)")
else:
    print("WARNING: scan_result.json not found, backtest.json not updated")

print("post_scan.py complete.")
