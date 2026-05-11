#!/usr/bin/env bash
# health_check.sh — 環境健康檢查腳本
# 每次對話開始或觸發器執行前先跑此腳本，確認環境正常
# 輸出 OK / FAIL 報告，最後 exit 0（全 OK）或 exit 1（有 FAIL）

set -euo pipefail
PASS=0
FAIL=0

check() {
  local label="$1"
  local cmd="$2"
  if eval "$cmd" > /dev/null 2>&1; then
    echo "  [OK]   $label"
    PASS=$((PASS+1))
  else
    echo "  [FAIL] $label"
    FAIL=$((FAIL+1))
  fi
}

echo "============================================"
echo " 環境健康檢查 $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"

echo ""
echo "── 基礎工具 ──"
check "bash"        "bash --version"
check "python3"     "python3 --version"
check "git"         "git --version"
check "curl"        "curl --version"
check "ssh"         "ssh -V"

echo ""
echo "── Git 設定 ──"
check "git user.name"   "git config --global user.name"
check "git user.email"  "git config --global user.email"
check "SSH key exists"  "test -f /home/sprite/.ssh/taiwan_stock_radar_key"
check "Git SSH push"    "GIT_SSH_COMMAND='ssh -i /home/sprite/.ssh/taiwan_stock_radar_key -o IdentitiesOnly=yes -o BatchMode=yes' ssh -T git@github.com 2>&1 | grep -q 'successfully authenticated'"

echo ""
echo "── Python 套件 ──"
check "requests"   "python3 -c 'import requests'"
check "httpx"      "python3 -c 'import httpx'"
check "pandas"     "python3 -c 'import pandas'"
check "numpy"      "python3 -c 'import numpy'"

echo ""
echo "── 網路連線 ──"
check "TWSE OpenAPI"    "curl -sf --max-time 10 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL' -o /dev/null"
check "GitHub API"      "curl -sf --max-time 10 'https://api.github.com' -o /dev/null"
check "GitHub Pages"    "curl -sf --max-time 10 'https://juststarlight66-oss.github.io/taiwan-stock-radar/' -o /dev/null"

echo ""
echo "── Repo 狀態 ──"
check "Repo dir exists" "test -d /home/sprite/taiwan-stock-radar"
check "Repo is git"     "test -d /home/sprite/taiwan-stock-radar/.git"
check "latest.json"     "test -f /home/sprite/taiwan-stock-radar/public/data/latest.json"
check "intraday.json"   "test -f /home/sprite/taiwan-stock-radar/public/data/intraday.json"

echo ""
echo "── Nebula 環境變數 ──"
check "NEBULA_PROXY_URL"    "test -n '${NEBULA_PROXY_URL:-}'"
check "SANDBOX_AUTH_TOKEN"  "test -n '${SANDBOX_AUTH_TOKEN:-}'"
check "OAUTH_APPS"          "test -n '${OAUTH_APPS:-}'"

echo ""
echo "============================================"
echo " 結果：PASS=$PASS  FAIL=$FAIL"
if [ "$FAIL" -eq 0 ]; then
  echo " 狀態：✅ 全部通過"
  echo "============================================"
  exit 0
else
  echo " 狀態：❌ 有 $FAIL 項失敗，請檢查上方 FAIL 項目"
  echo "============================================"
  exit 1
fi
