#!/usr/bin/env python3
"""
regenerate_latest_v3.py
Reads scan_market.py's latest.json (with all_stock_scores), filters to real
4-digit listed stocks (>=1101), maps 'name' -> 'stock_name', deduplicates
by stock_id keeping highest total_score, and writes a clean latest.json.
"""
import json, datetime, os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(SCRIPT_DIR, 'latest.json')  # from scan_market.py
DST = os.path.join(SCRIPT_DIR, 'latest_clean.json')

today = datetime.date.today().strftime('%Y%m%d')
today_slash = datetime.date.today().strftime('%Y/%m/%d')
now = datetime.datetime.now().isoformat()

# Load source
with open(SRC, 'r', encoding='utf-8') as f:
    data = json.load(f)

all_scores = data.get('all_stock_scores', data.get('stocks', []))

# === Filter: only valid 4-digit stock IDs >= 1101, <= 9999 ===
# Exclude ETFs (00xxx), warrants (0xxxx/xxxxxx), etc.
def is_real_stock(sid: str) -> bool:
    try:
        sid_int = int(sid)
    except (ValueError, TypeError):
        return False
    return 1000 < sid_int <= 9999 and len(str(sid_int)) == 4

stocks = [s for s in all_scores if is_real_stock(s.get('stock_id', ''))]

# === Deduplicate: keep highest total_score per stock_id ===
seen = {}
for s in stocks:
    sid = s['stock_id']
    score = s.get('total_score', s.get('scores', {}).get('total', 0))
    if sid not in seen or score > seen[sid].get('total_score', 0):
        seen[sid] = s
stocks = list(seen.values())

print(f"Filtered: {len(all_scores)} -> {len(stocks)} real stocks")

# === Enrich with dimensions, stock_name, sector ===
for s in stocks:
    # Map 'name' -> 'stock_name' for frontend compatibility
    s['stock_name'] = s.get('name', '')
    
    # Standardize sector
    s['sector'] = s.get('sector_name', s.get('sector', '其他'))
    
    # Build dimensions from scores
    sc = s.get('scores', {})
    if isinstance(sc, dict):
        s['dimensions'] = {
            'technical': sc.get('technical', 0),
            'fundamental': sc.get('fundamental', 0),
            'news': sc.get('news', 0),
            'sentiment': sc.get('sentiment', 0),
            'chips': sc.get('chips', 0),
        }
    else:
        s['dimensions'] = {}
    
    s.setdefault('signals', [])
    s.setdefault('strategy', '五維強勢')

# === Sort by total_score descending ===
stocks.sort(key=lambda s: s.get('total_score', 0), reverse=True)

# === Build top10 ===
top10 = stocks[:10]
explode_top5 = data.get('explode_top5', [])
if not explode_top5 and stocks:
    explode_top5 = [
        {**s, 'explode_prob': round(min(0.98, max(0.02, (s.get('total_score', 50) - 30) / 70)), 3)}
        for s in stocks[:5]
    ]

# === Build market_summary ===
sectors = {}
for s in stocks:
    sec = s.get('sector', s.get('sector_name', '其他'))
    sectors.setdefault(sec, []).append(s.get('total_score', 0))
sector_detail = {sec: {'count': len(v), 'avg_score': round(sum(v)/len(v), 1) if v else 0}
                 for sec, v in sectors.items()}

avg_score = round(sum(s.get('total_score', 0) for s in stocks) / len(stocks), 1) if stocks else 0
market_summary = {
    'avg_score': avg_score,
    'sectors': len(sectors),
    'sector_detail': sector_detail,
}

# === Output ===
latest = {
    'scan_date': today,
    'scan_date_slash': today_slash,
    'scanned_count': len(stocks),
    'generated_at': now,
    'top10': top10,
    'explode_top5': explode_top5,
    'all_stock_scores': stocks,
    'market_summary': market_summary,
}

with open(DST, 'w', encoding='utf-8') as f:
    json.dump(latest, f, ensure_ascii=False)
print(f"Written {DST}: {len(stocks)} stocks")

# === Validate ===
missing_name = [s['stock_id'] for s in stocks if not s.get('stock_name', '').strip()]
missing_close = [s['stock_id'] for s in stocks if s.get('close') is None or s.get('close') == 0]
print(f"Missing stock_name: {len(missing_name)}")
print(f"Missing close: {len(missing_close)}")
if missing_name:
    print(f"  IDs: {missing_name[:10]}")
if missing_close:
    print(f"  IDs: {missing_close[:10]}")

# Show top 3
for s in stocks[:3]:
    print(f"  {s['stock_id']} {s.get('stock_name','?')} close={s.get('close','?')} score={s.get('total_score','?')}")
