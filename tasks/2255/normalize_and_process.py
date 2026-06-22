#!/usr/bin/env python3
"""
normalize_and_process.py
Steps 2-5 post-processing:
1. Normalize scan_result.json (add top10, dimensions, signals, strategy fields)
2. Update scan_date to 20260608
3. Run T+N backtest for previous day's top 5
4. Archive scan_result_20260608.json
5. Generate public/data/latest.json, all_scores.json, index.json, backtest.json
"""
import json, os, shutil, datetime, pytz, requests, time

tz = pytz.timezone('Asia/Taipei')
now = datetime.datetime.now(tz)
TODAY = "20260608"
TODAY_SLASH = "2026/06/08"
TODAY_ISO = "2026-06-08"
PREV_DATE = "20260605"  # last trading day (Friday)

script_dir = os.path.dirname(os.path.abspath(__file__))
repo_root = os.path.abspath(os.path.join(script_dir, '..', '..'))
data_dir = os.path.join(repo_root, 'public', 'data')
os.makedirs(data_dir, exist_ok=True)

# ── Load scan_result.json ──────────────────────────────────────────────────────
scan_path = os.path.join(script_dir, 'scan_result.json')
with open(scan_path, encoding='utf-8') as f:
    scan = json.load(f)

# Use actual scan_date from the scan result (dynamic, not hardcoded)
SCAN_DATE = scan.get('scan_date', datetime.datetime.now(tz).strftime('%Y%m%d'))
TODAY = SCAN_DATE
# Derive date variants
try:
    today_dt = datetime.datetime.strptime(TODAY, '%Y%m%d')
    TODAY_SLASH = today_dt.strftime('%Y/%m/%d')
    TODAY_ISO = today_dt.strftime('%Y-%m-%d')
except ValueError:
    today_dt = datetime.datetime.now(tz)
    TODAY_SLASH = today_dt.strftime('%Y/%m/%d')
    TODAY_ISO = today_dt.strftime('%Y-%m-%d')

# Find previous trading day (skip weekends)
prev_dt = today_dt - datetime.timedelta(days=1)
while prev_dt.weekday() >= 5:  # 5=Sat, 6=Sun
    prev_dt -= datetime.timedelta(days=1)
PREV_DATE = prev_dt.strftime('%Y%m%d')

# ── Normalize top_stocks → top10 with dimensions/signals/strategy ─────────────
def normalize_stock(s):
    """Convert raw scan stock entry to standardized format."""
    scores = s.get('scores', {})
    close = float(s.get('close', 0) or 0)
    targets = s.get('targets', {})
    entry_low = float(s.get('entry_low', close * 0.98) or close * 0.98)
    entry_high = float(s.get('entry_high', close * 1.02) or close * 1.02)
    stop_loss = float(s.get('stop_loss', close * 0.93) or close * 0.93)

    # Map scores to dimensions (raw 0-100 → pass through as-is; frontend expects 0-100 scale)
    tech_raw = float(scores.get('technical', scores.get('tech', 0)) or 0)
    chips_raw = float(scores.get('chips', 0) or 0)
    fund_raw = float(scores.get('fundamental', 0) or 0)
    news_raw = float(scores.get('news', 0) or 0)
    sent_raw = float(scores.get('sentiment', 0) or 0)

    # All dimensions 0-100 raw (v8: real RSI/MA/ATR scoring, no false scaling)
    dimensions = {
        "technical": round(tech_raw, 2),
        "fundamental": round(fund_raw, 2),
        "news": round(news_raw, 2),
        "sentiment": round(sent_raw, 2),
        "chips": round(chips_raw, 2),
    }

    # Generate signals based on scores
    signals = []
    if tech_raw >= 70:
        signals.append("技術面強勢突破")
    if tech_raw >= 50:
        signals.append("均線多頭排列")
    if chips_raw >= 70:
        signals.append("籌碼集中法人買超")
    elif chips_raw >= 50:
        signals.append("主力悄然布局")
    if news_raw >= 70:
        signals.append("消息面題材發酵")
    if sent_raw >= 70:
        signals.append("市場情緒熱絡")
    if fund_raw >= 70:
        signals.append("基本面優質")
    change_pct = float(s.get('change_pct', 0) or 0)
    if change_pct >= 5:
        signals.append("強勢漲停鎖板")
    elif change_pct >= 3:
        signals.append("量價齊揚")
    if not signals:
        signals.append("多維度共振")

    # Strategy
    strategy = {
        "entry_low": round(entry_low, 2),
        "entry_high": round(entry_high, 2),
        "stop_loss": round(stop_loss, 2),
        "target1": round(float(targets.get('t1', close * 1.05) or close * 1.05), 2),
        "target2": round(float(targets.get('t2', close * 1.10) or close * 1.10), 2),
        "target3": round(float(targets.get('t3', close * 1.15) or close * 1.15), 2),
        "advice": s.get('recommendation', '觀察'),
        "hold_days": "3-5日",
        "risk_reward": f"1:{round((float(targets.get('t1', close*1.05) or close*1.05) - entry_low) / max(entry_low - stop_loss, 0.01), 1)}",
    }

    # Ensure scores array format for the frontend exactly matching what's expected
    scores_array = [
        {"type": "technical", "score": dimensions["technical"], "max": 100},
        {"type": "fundamental", "score": dimensions["fundamental"], "max": 100},
        {"type": "news", "score": dimensions["news"], "max": 100},
        {"type": "sentiment", "score": dimensions["sentiment"], "max": 100},
        {"type": "chips", "score": dimensions["chips"], "max": 100},
    ]

    return {
        "stock_id": s.get('stock_id', ''),
        "name": s.get('name', ''),
        "market": s.get('market', 'TWSE'),
        "sector": s.get('sector_name', s.get('sector', s.get('industry', '其他'))),
        "close": close,
        "change_pct": change_pct,
        "volume": float(s.get('volume', 0) or 0),
        "total_score": float(s.get('total_score', 0) or 0),
        "dimensions": dimensions,
        "scores": scores_array,
        "signals": signals,
        "strategy": strategy,
        "entry_low": round(entry_low, 2),
        "entry_high": round(entry_high, 2),
        "stop_loss": round(stop_loss, 2),
        "targets": {
            "t1": strategy["target1"],
            "t2": strategy["target2"],
            "t3": strategy["target3"],
            "stop_loss": round(stop_loss, 2),
        },
        "fundamentals": s.get('fundamentals', {}),
        "recommendation": s.get('recommendation', '觀察'),
    }

top_stocks_raw = scan.get('top_stocks', [])
all_scores_raw = scan.get('all_stock_scores', [])

top10_normalized = [normalize_stock(s) for s in top_stocks_raw[:10]]
all_normalized = [normalize_stock(s) for s in all_scores_raw]

print(f"Normalized top10: {len(top10_normalized)} stocks")
print(f"Normalized all_scores: {len(all_normalized)} stocks")

# ── T+N Backtest: check previous day Top 5 vs today's prices ─────────────────
# Load previous scan
prev_scan_path = os.path.join(script_dir, f'scan_result_{PREV_DATE}.json')
prev_top5 = []
if os.path.exists(prev_scan_path):
    with open(prev_scan_path, encoding='utf-8') as f:
        prev_scan = json.load(f)
    prev_top10 = prev_scan.get('top10', prev_scan.get('top_stocks', []))
    prev_top5 = prev_top10[:5]
    print(f"Loaded prev scan top5: {len(prev_top5)} stocks")
else:
    print(f"WARNING: {prev_scan_path} not found, using dummy backtest")

def get_current_price(stock_id):
    """Try to get today's closing price from today's scan data."""
    # First look in today's all_scores
    for s in all_scores_raw:
        if s.get('stock_id') == stock_id:
            return float(s.get('close', 0) or 0)
    return None

backtest_records = []
for s in prev_top5:
    sid = s.get('stock_id', s.get('code', ''))
    name = s.get('name', '')
    entry_price = float(s.get('close', 0) or 0)
    current_price = get_current_price(sid)

    if entry_price > 0 and current_price and current_price > 0:
        ret_pct = round((current_price - entry_price) / entry_price * 100, 2)
        hit_target = current_price >= float((s.get('targets') or {}).get('t1', entry_price * 1.05))
        hit_stop = current_price <= float(s.get('stop_loss', entry_price * 0.93))
    else:
        ret_pct = None
        hit_target = None
        hit_stop = None
        current_price = current_price or 0

    backtest_records.append({
        "stock_id": sid,
        "name": name,
        "entry_price": entry_price,
        "current_price": round(current_price, 2),
        "return_pct": ret_pct,
        "hit_target": hit_target,
        "hit_stoploss": hit_stop,
        "pending": ret_pct is None,
    })
    print(f"  T+1 {sid} {name}: entry={entry_price} current={current_price} ret={ret_pct}%")

valid_returns = [r['return_pct'] for r in backtest_records if r['return_pct'] is not None]
avg_return = round(sum(valid_returns) / len(valid_returns), 2) if valid_returns else None
wins = [r for r in valid_returns if r > 0]
win_rate = round(len(wins) / len(valid_returns) * 100, 1) if valid_returns else None

backtest_section = {
    "date": TODAY_ISO,
    "prev_date": PREV_DATE,
    "records": backtest_records,
    "avg_return_pct": avg_return,
    "win_rate_pct": win_rate,
    "count": len(backtest_records),
}
print(f"Backtest: avg_return={avg_return}% win_rate={win_rate}% count={len(backtest_records)}")

# ── Update scan_result.json with normalized fields ────────────────────────────
scan['scan_date'] = TODAY
scan['top10'] = top10_normalized
scan['top_stocks'] = top_stocks_raw  # keep original
scan['all_stock_scores'] = all_normalized  # normalized
scan['backtest'] = backtest_section
scan['generated_at'] = now.isoformat()

with open(scan_path, 'w', encoding='utf-8') as f:
    json.dump(scan, f, ensure_ascii=False, indent=2)
print("Updated scan_result.json with normalized fields")

# ── Step 4: Archive ───────────────────────────────────────────────────────────
archive_path = os.path.join(script_dir, f'scan_result_{TODAY}.json')
shutil.copy2(scan_path, archive_path)
print(f"Archived to scan_result_{TODAY}.json")

# Also copy to public/data
shutil.copy2(archive_path, os.path.join(data_dir, f'scan_result_{TODAY}.json'))
print(f"Copied to public/data/scan_result_{TODAY}.json")

# ── Step 5: Generate public/data/latest.json ─────────────────────────────────
latest = {
    "scan_date": TODAY,
    "scan_date_slash": TODAY_SLASH,
    "scanned_count": scan.get('scanned_count', 0),
    "generated_at": now.isoformat(),
    "top10": top10_normalized,
    "explode_top5": scan.get('explode_top5', []),
    "market_summary": {
        "avg_score": round(sum(s.get('total_score', 0) for s in all_normalized) / max(len(all_normalized), 1), 2),
        "bullish_count": sum(1 for s in all_normalized if s.get('change_pct', 0) > 0),
        "bearish_count": sum(1 for s in all_normalized if s.get('change_pct', 0) < 0),
        "flat_count": sum(1 for s in all_normalized if s.get('change_pct', 0) == 0),
    }
}
latest_path = os.path.join(data_dir, 'latest.json')
with open(latest_path, 'w', encoding='utf-8') as f:
    json.dump(latest, f, ensure_ascii=False, indent=2)
# Also keep local copy
with open(os.path.join(script_dir, 'latest.json'), 'w', encoding='utf-8') as f:
    json.dump(latest, f, ensure_ascii=False, indent=2)
print(f"Generated latest.json: {len(top10_normalized)} top stocks")

# ── Step 5: Generate public/data/all_scores.json ────────────────────────────
all_scores_out = {
    "scan_date": TODAY,
    "generated_at": now.isoformat(),
    "total_stocks": len(all_normalized),
    "stocks": all_normalized,
}
all_scores_path = os.path.join(data_dir, 'all_scores.json')
with open(all_scores_path, 'w', encoding='utf-8') as f:
    json.dump(all_scores_out, f, ensure_ascii=False, indent=2)
with open(os.path.join(script_dir, 'all_scores.json'), 'w', encoding='utf-8') as f:
    json.dump(all_scores_out, f, ensure_ascii=False, indent=2)
print(f"Generated all_scores.json: {len(all_normalized)} stocks")

# ── Step 5: Update public/data/index.json ────────────────────────────────────
index_path = os.path.join(data_dir, 'index.json')
if os.path.exists(index_path):
    with open(index_path, encoding='utf-8') as f:
        index = json.load(f)
else:
    index = {"scans": []}

entry = {
    "date": TODAY,
    "file": f"scan_result_{TODAY}.json",
    "scan_time": now.strftime('%H:%M:%S'),
    "scanned_count": scan.get('scanned_count', 0),
}
scans = index.get("scans", [])
scans = [s for s in scans if s.get("date") != TODAY]
scans.append(entry)
scans.sort(key=lambda x: x["date"], reverse=True)
index["scans"] = scans[:60]
index["updated_at"] = now.isoformat()

with open(index_path, 'w', encoding='utf-8') as f:
    json.dump(index, f, ensure_ascii=False, indent=2)
print(f"Updated index.json: {len(index['scans'])} entries")

# ── Step 5: Update public/data/backtest.json ─────────────────────────────────
backtest_pub_path = os.path.join(data_dir, 'backtest.json')
if os.path.exists(backtest_pub_path):
    with open(backtest_pub_path, encoding='utf-8') as f:
        backtest_pub = json.load(f)
else:
    backtest_pub = {"version": 2, "grouped_records": [], "history": []}

if "grouped_records" not in backtest_pub:
    backtest_pub["grouped_records"] = []

# Build stocks for grouped_records (today's top10 as pending T+1/T+3/T+5)
stocks_list = [{
    "stock_id": s.get('stock_id', ''),
    "name": s.get('name', ''),
    "entry": s.get('close', 0),
    "close": None,
    "return_pct": None,
    "hit_target": None,
    "hit_stoploss": None,
    "pending": True,
} for s in top10_normalized]

new_gr_entry = {
    "scan_date": TODAY_ISO,
    "periods": {
        "T1": {"label": "T+1", "backtest_date": None, "win_rate": None, "avg_return": None, "pending": True, "stocks": [dict(s) for s in stocks_list]},
        "T3": {"label": "T+3", "backtest_date": None, "win_rate": None, "avg_return": None, "pending": True, "stocks": [dict(s) for s in stocks_list]},
        "T5": {"label": "T+5", "backtest_date": None, "win_rate": None, "avg_return": None, "pending": True, "stocks": [dict(s) for s in stocks_list]},
    }
}

# Update T+1 for prev date entry if exists
prev_iso = prev_dt.strftime('%Y-%m-%d')
grouped = backtest_pub.get("grouped_records", [])
if isinstance(grouped, dict):
    grouped = list(grouped.values())
for gr in grouped:
    if isinstance(gr, dict) and gr.get("scan_date") == prev_iso:
        t1 = gr.get("periods", {}).get("T1", {})
        if t1.get("pending"):
            # Fill in T+1 results
            t1_stocks = t1.get("stocks", [])
            for bs in backtest_records:
                for ts in t1_stocks:
                    if ts.get("stock_id") == bs.get("stock_id"):
                        ts["close"] = bs.get("current_price")
                        ts["return_pct"] = bs.get("return_pct")
                        ts["hit_target"] = bs.get("hit_target")
                        ts["hit_stoploss"] = bs.get("hit_stoploss")
                        ts["pending"] = bs.get("pending", True)
            valid = [ts["return_pct"] for ts in t1_stocks if ts.get("return_pct") is not None]
            t1["win_rate"] = round(sum(1 for r in valid if r > 0) / max(len(valid), 1) * 100, 1) if valid else None
            t1["avg_return"] = round(sum(valid) / max(len(valid), 1), 2) if valid else None
            t1["pending"] = len([ts for ts in t1_stocks if ts.get("pending")]) > 0
            t1["backtest_date"] = TODAY_ISO
            print(f"Updated T+1 for prev_date {prev_iso}: win_rate={t1['win_rate']}% avg={t1['avg_return']}%")

# Upsert today's new entry
grouped = [g for g in grouped if isinstance(g, dict) and g.get("scan_date") != TODAY_ISO]
grouped.append(new_gr_entry)
grouped.sort(key=lambda x: x.get("scan_date", ""), reverse=True)
backtest_pub["grouped_records"] = grouped[:90]

# Legacy history
stocks_map = {s['stock_id']: {"name": s['name'], "score": s['total_score'], "close": s['close']} for s in top10_normalized}
legacy_entry = {"date": TODAY_SLASH, "results": stocks_map}
history = backtest_pub.get('history', [])
history = [h for h in history if h.get('date') != TODAY_SLASH]
history.append(legacy_entry)
history.sort(key=lambda x: x['date'], reverse=True)
backtest_pub['history'] = history[:90]
backtest_pub["last_updated"] = now.isoformat()
backtest_pub["version"] = 2

with open(backtest_pub_path, 'w', encoding='utf-8') as f:
    json.dump(backtest_pub, f, ensure_ascii=False, indent=2)
with open(os.path.join(script_dir, 'backtest.json'), 'w', encoding='utf-8') as f:
    json.dump(backtest_pub, f, ensure_ascii=False, indent=2)
print(f"Updated backtest.json: {len(grouped)} grouped_records")

print("\n=== SUMMARY ===")
print(f"scan_date: {TODAY}")
print(f"scanned_count: {scan.get('scanned_count')}")
print(f"top10 count: {len(top10_normalized)}")
print("Top 10:")
for i, s in enumerate(top10_normalized, 1):
    print(f"  {i}. {s['stock_id']} {s['name']} score={s['total_score']} close={s['close']} "
          f"entry={s['entry_low']}-{s['entry_high']} stop={s['stop_loss']} "
          f"T1={s['targets']['t1']} T2={s['targets']['t2']} T3={s['targets']['t3']}")
print(f"Backtest: avg_return={avg_return}% win_rate={win_rate}% ({len(backtest_records)} stocks verified)")
print("All public JSON files generated successfully.")
