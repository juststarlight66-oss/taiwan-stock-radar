#!/usr/bin/env bash
# health_check.sh — 執行環境健康檢查
# 用法：bash /home/sprite/scripts/health_check.sh
# 每次對話開始時執行，確認環境正常再進行工作

PASS=0
FAIL=0
WARN=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}[OK]${NC}   $1"; PASS=$((PASS+1)); }
fail() { echo -e "  ${RED}[FAIL]${NC} $1"; FAIL=$((FAIL+1)); }
warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; WARN=$((WARN+1)); }

echo "======================================"
echo "  環境健康檢查 $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================"
echo ""

# ── 1. Bash ───────────────────────────────────
echo "▶ Bash 環境"
if echo "ok" | grep -q "ok" 2>/dev/null; then
  ok "bash 可執行"
else
  fail "bash 異常"
fi

# ── 2. Python ─────────────────────────────────
echo ""
echo "▶ Python"
if python3 --version >/dev/null 2>&1; then
  ver=$(python3 --version 2>&1)
  ok "python3 可用 ($ver)"
else
  fail "python3 不可用"
fi

if python3 -c "import httpx, json, os" 2>/dev/null; then
  ok "關鍵套件 httpx / json / os 可 import"
else
  warn "httpx 缺失（執行 uv add httpx 安裝）"
fi

# ── 3. Git ────────────────────────────────────
echo ""
echo "▶ Git"
if git --version >/dev/null 2>&1; then
  ok "git 可用 ($(git --version))"
else
  fail "git 不可用"
fi

REPO=/home/sprite/taiwan-stock-radar
if [ -d "$REPO/.git" ]; then
  ok "taiwan-stock-radar repo 存在"
  branch=$(git -C "$REPO" branch --show-current 2>/dev/null || echo "unknown")
  ok "目前分支：$branch"
  KEY=~/.ssh/taiwan_stock_radar_key
  if [ -f "$KEY" ]; then
    ok "SSH deploy key 存在"
  else
    warn "SSH deploy key 不存在，git push 將使用 API fallback"
  fi
else
  fail "taiwan-stock-radar repo 不存在於 $REPO"
fi

# ── 4. Network ────────────────────────────────
echo ""
echo "▶ Network"
if curl -sf --max-time 5 https://api.github.com/zen >/dev/null 2>&1; then
  ok "GitHub API 可連線"
else
  fail "GitHub API 無法連線"
fi

if curl -sf --max-time 5 https://openapi.twse.com.tw/v1/opendata/t187ap03_L >/dev/null 2>&1; then
  ok "TWSE OpenAPI 可連線"
else
  warn "TWSE OpenAPI 暫時無法連線（可能為非交易時段）"
fi

# ── 5. 環境變數 ───────────────────────────────
echo ""
echo "▶ 環境變數"
if [ -n "${NEBULA_PROXY_URL:-}" ]; then
  ok "NEBULA_PROXY_URL 已設定"
else
  warn "NEBULA_PROXY_URL 未設定"
fi

if [ -n "${SANDBOX_AUTH_TOKEN:-}" ]; then
  ok "SANDBOX_AUTH_TOKEN 已設定"
else
  warn "SANDBOX_AUTH_TOKEN 未設定"
fi

if [ -n "${OAUTH_APPS:-}" ]; then
  ok "OAUTH_APPS 已設定"
  if echo "$OAUTH_APPS" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'github' in d" 2>/dev/null; then
    ok "GitHub OAuth 帳號已連接"
  else
    warn "OAUTH_APPS 中無 github 帳號"
  fi
else
  warn "OAUTH_APPS 未設定"
fi

# ── 6. 關鍵腳本 ───────────────────────────────
echo ""
echo "▶ 關鍵腳本"
scripts=(
  "/home/sprite/scripts/github_push.py"
  "/home/sprite/tasks/2255/scan_market.py"
  "/home/sprite/tasks/intraday/fetch_intraday.py"
  "/home/sprite/taiwan-stock-radar/tasks/2255/update_tn_records.py"
)
for s in "${scripts[@]}"; do
  if [ -f "$s" ]; then
    ok "$(basename $s) 存在"
  else
    warn "$(basename $s) 不存在：$s"
  fi
done

# ── 總結 ──────────────────────────────────────
echo ""
echo "======================================"
echo -e "  結果：${GREEN}OK ${PASS}${NC}  ${YELLOW}WARN ${WARN}${NC}  ${RED}FAIL ${FAIL}${NC}"
echo "======================================"

if [ $FAIL -gt 0 ]; then
  echo -e "  ${RED}⚠ 環境有嚴重問題，請確認後再執行任務${NC}"
  exit 1
elif [ $WARN -gt 0 ]; then
  echo -e "  ${YELLOW}△ 環境基本正常，部分功能可能受限${NC}"
  exit 0
else
  echo -e "  ${GREEN}✓ 環境完全正常，可以開始工作${NC}"
  exit 0
fi
