#!/usr/bin/env python3
"""
Generate public/data/backtest_map.json from public/data/backtest.json.
Structure:
{
  "dates": ["2026/05/05", ...],
  "stocks": {
    "2026/05/05": ["4807", "4585", ...]
  }
}
"""
import json
import os

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO_ROOT, "public", "data", "backtest.json")
DST = os.path.join(REPO_ROOT, "public", "data", "backtest_map.json")

with open(SRC, "r", encoding="utf-8") as f:
    backtest = json.load(f)

history = backtest.get("history", [])

dates = []
stocks = {}

for entry in history:
    date = entry.get("date", "")
    results = entry.get("results", {})
    stock_ids = list(results.keys())
    dates.append(date)
    stocks[date] = stock_ids

# Sort dates ascending
dates.sort()

backtest_map = {
    "dates": dates,
    "stocks": stocks,
}

with open(DST, "w", encoding="utf-8") as f:
    json.dump(backtest_map, f, ensure_ascii=False, indent=2)

print(f"Written {DST}")
print(f"  dates: {dates}")
for d in dates:
    print(f"  {d}: {len(stocks[d])} stocks -> {stocks[d][:5]}...")
