#!/usr/bin/env bash
# health_check.sh — 環境健康檢查
# 執行方式: bash /home/sprite/taiwan-stock-radar/scripts/health_check.sh
# 每次對話開始時先跑這個，確認環境是否正常

set -euo pipefail

PASS=0
FAIL=0
WARN=0

green() { printf '\033[0;32m✅ OK\033[0m  %s\n' "$*"; }
red()   { printf '\033[0;31m❌ FAIL\033[0m %s\n' "$*"; }
yellow(){ printf '\033[0;33m⚠️  WARN\033[0m %s\n' "$*"; }

check() {
  local label="$1"
  local cmd="$2"
  if eval "$cmd" &>/dev/null; then
    green "$label"
    PASS=$((PASS+1))
  else
    red "$label"
    FAIL=$((FAIL+1))
  fi
}

echo ''
echo '=== Taiwan Stock Radar — 環境健康檢查 ==='
echo "執行時間: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo ''

# ── 1. Bash ──────────────────────────────────────────────────────────────────
echo '[ 1/6 ] Bash 環境'
check 'bash 可執行'     'bash --version'
check 'HOME 目錄存在'   'test -d "$HOME"'
check '/home/sprite 存在' 'test -d /home/sprite'

# ── 2. Python ────────────────────────────────────────────────────────────────
echo ''
echo '[ 2/6 ] Python'
check 'python3 可用'    'python3 --version'
check 'python 可用'     'python --version'
check 'httpx 已安裝'    'python3 -c "import httpx"'
check 'requests 已安裝' 'python3 -c "import requests"'
check 'pandas 已安裝'   'python3 -c "import pandas"'

# ── 3. Git ───────────────────────────────────────────────────────────────────
echo ''
echo '[ 3/6 ] Git'
check 'git 可用'        'git --version'
check 'git 設定 user'   'git config --global user.name'
check 'git 設定 email'  'git config --global user.email'
check 'SSH key 存在'    'test -f ~/.ssh/taiwan_stock_radar_key'
check 'SSH key 權限正確' 'test $(stat -c %a ~/.ssh/taiwan_stock_radar_key 2>/dev/null || echo 0) -eq 600 2>/dev/null || stat -f %Lp ~/.ssh/taiwan_stock_radar_key 2>/dev/null | grep -q 600'

# ── 4. Repo ──────────────────────────────────────────────────────────────────
echo ''
echo '[ 4/6 ] Repo 狀態'
REPO_DIR="/home/sprite/taiwan-stock-radar"
check 'repo 目錄存在'   "test -d $REPO_DIR"
check 'repo 是 git repo' "test -d $REPO_DIR/.git"
if [ -d "$REPO_DIR" ]; then
  BRANCH=$(git -C "$REPO_DIR" branch --show-current 2>/dev/null || echo '')
  if [ "$BRANCH" = 'main' ]; then
    green "目前分支: main"
    PASS=$((PASS+1))
  else
    yellow "目前分支: $BRANCH（非 main）"
    WARN=$((WARN+1))
  fi
  DIRTY=$(git -C "$REPO_DIR" status --porcelain 2>/dev/null | wc -l)
  if [ "$DIRTY" -gt 0 ]; then
    yellow "工作區有 $DIRTY 個未提交變更"
    WARN=$((WARN+1))
  else
    green 'working tree clean'
    PASS=$((PASS+1))
  fi
fi

# ── 5. Network ───────────────────────────────────────────────────────────────
echo ''
echo '[ 5/6 ] 網路連線'
check 'GitHub API 可達'  'curl -sf --max-time 5 https://api.github.com/zen'
check 'TWSE openapi 可達' 'curl -sf --max-time 5 https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL | head -c 10'
check 'GitHub Pages 可達' 'curl -sf --max-time 10 https://juststarlight66-oss.github.io/taiwan-stock-radar/data/latest.json | head -c 10'

# ── 6. Env Vars ──────────────────────────────────────────────────────────────
echo ''
echo '[ 6/6 ] 環境變數'
check 'GITHUB_TOKEN 已設定' 'test -n "${GITHUB_TOKEN:-}"'
check 'NEBULA_PROXY_URL 已設定' 'test -n "${NEBULA_PROXY_URL:-}"'
check 'SANDBOX_AUTH_TOKEN 已設定' 'test -n "${SANDBOX_AUTH_TOKEN:-}"'

# ── 總結 ─────────────────────────────────────────────────────────────────────
echo ''
echo '=== 檢查完成 ==='
echo "✅ PASS: $PASS  ❌ FAIL: $FAIL  ⚠️  WARN: $WARN"
echo ''
if [ "$FAIL" -eq 0 ]; then
  echo '🟢 環境狀態：正常，可以開始工作'
  exit 0
else
  echo '🔴 環境狀態：有問題，請修復後再執行任務'
  exit 1
fi
