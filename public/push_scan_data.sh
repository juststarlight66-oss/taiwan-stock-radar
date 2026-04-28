#!/bin/bash
# Called by 2255 trigger after scan completes
# Usage: ./push_scan_data.sh <scan_result.json_path> <date_YYYYMMDD>
set -e

SCAN_FILE="$1"
DATE="$2"
REPO_DIR="/home/sprite/projects/taiwan-stock-radar"

cd "$REPO_DIR"

# Copy scan result to data directory
cp "$SCAN_FILE" "public/data/scan_result_${DATE}.json"
cp "$SCAN_FILE" "public/data/scan_result.json"

# Update latest.json
cp "$SCAN_FILE" "public/data/latest.json"

# Git commit and push
git add public/data/
git commit -m "📊 Auto-update: Daily scan result ${DATE} ($(date '+%Y-%m-%d %H:%M:%S'))"
git push origin main

echo "Data published to GitHub Pages: https://juststarlight66-oss.github.io/taiwan-stock-radar/data/scan_result_${DATE}.json"
