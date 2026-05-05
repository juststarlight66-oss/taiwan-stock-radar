#!/bin/bash
# Called by 2255 trigger after scan completes
# Usage: ./push_scan_data.sh <scan_result.json_path> <date_YYYYMMDD> [all_scores.json_path]
set -e

SCAN_FILE="$1"
DATE="$2"
ALL_SCORES_FILE="${3:-}"
REPO_DIR="/home/sprite/taiwan-stock-radar"

cd "$REPO_DIR"

# Copy scan result to data directory
cp "$SCAN_FILE" "public/data/scan_result_${DATE}.json"
cp "$SCAN_FILE" "public/data/scan_result.json"

# Update latest.json
cp "$SCAN_FILE" "public/data/latest.json"

# Copy all_scores.json if provided (powers the self-check tab)
if [ -n "$ALL_SCORES_FILE" ] && [ -f "$ALL_SCORES_FILE" ]; then
  cp "$ALL_SCORES_FILE" "public/data/all_scores.json"
  echo "all_scores.json copied to public/data/"
fi

# Update index.json to include the new date
python3 -c "
import json, sys
idx_path = 'public/data/index.json'
date_str = sys.argv[1]
try:
    with open(idx_path) as f:
        idx = json.load(f)
except Exception:
    idx = {'dates': []}
dates = idx.get('dates', [])
# Convert YYYYMMDD to YYYY-MM-DD
if len(date_str) == 8 and '-' not in date_str:
    date_iso = date_str[:4] + '-' + date_str[4:6] + '-' + date_str[6:]
else:
    date_iso = date_str
if date_iso not in dates:
    dates.insert(0, date_iso)
    dates.sort(reverse=True)
idx['dates'] = dates
with open(idx_path, 'w') as f:
    json.dump(idx, f, ensure_ascii=False, indent=2)
print(f'index.json updated: {dates}')
" "$DATE"

# Git commit and push
git add public/data/
git commit -m "📊 Auto-update: Daily scan result ${DATE} ($(date '+%Y-%m-%d %H:%M:%S'))

Co-Authored-By: Nebula <noreply@nebula.gg>"
git push origin main

echo "Data published to GitHub Pages: https://juststarlight66-oss.github.io/taiwan-stock-radar/data/scan_result_${DATE}.json"
