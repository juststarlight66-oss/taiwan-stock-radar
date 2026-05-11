#!/usr/bin/env bash
# health_check.sh — 每次對話開始前執行，確認執行環境正常
# 用法: bash /home/sprite/scripts/health_check.sh

set -euo pipefail

PASS=0
FAIL=0
WARN=0

ok()   { echo "  ✅ OK   : $*"; ((PASS++)); }
fail() { echo "  ❌ FAIL : $*"; ((FAIL++)); }
warn() { echo "  ⚠️  WARN : $*"; ((WARN++)); }

echo "====================================="
echo " 台股雷達 — 環境健康檢查"
echo " $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "====================================="
echo ""

# ── 1. Bash ──────────────────────────────────────────────────────────────────
echo "[1] Bash"
if bash --version &>/dev/null; then
  BASH_VER=$(bash --version | head -1)
  ok "$BASH_VER"
else
  fail "bash 不可用"
fi

# ── 2. Python ────────────────────────────────────────────────────────────────
echo ""
echo "[2] Python"
if python3 --version &>/dev/null; then
  PY_VER=$(python3 --version)
  ok "$PY_VER"
  # 確認關鍵套件
  for pkg in json os subprocess pathlib urllib; do
    if python3 -c "import $pkg" &>/dev/null; then
      ok "  import $pkg"
    else
      fail "  import $pkg 失敗"
    fi
  done
else
  fail "python3 不可用"
fi

# ── 3. Git ───────────────────────────────────────────────────────────────────
echo ""
echo "[3] Git"
if git --version &>/dev/null; then
  GIT_VER=$(git --version)
  ok "$GIT_VER"
else
  fail "git 不可用"
fi

# SSH key
SSH_KEY="$HOME/.ssh/taiwan_stock_radar_key"
if [ -f "$SSH_KEY" ]; then
  ok "SSH key 存在: $SSH_KEY"
else
  fail "SSH key 不存在: $SSH_KEY"
fi

# Git repo
REPO_DIR="$HOME/taiwan-stock-radar"
if [ -d "$REPO_DIR/.git" ]; then
  ok "Repo 存在: $REPO_DIR"
  # 確認 remote
  REMOTE=$(GIT_SSH_COMMAND="ssh -i $SSH_KEY" git -C "$REPO_DIR" remote get-url origin 2>/dev/null || echo "")
  if [ -n "$REMOTE" ]; then
    ok "Remote: $REMOTE"
  else
    warn "無法取得 remote URL"
  fi
else
  warn "Repo 不存在: $REPO_DIR (可能在 /tmp/taiwan-stock-radar)"
  REPO_DIR="/tmp/taiwan-stock-radar"
  if [ -d "$REPO_DIR/.git" ]; then
    ok "Repo 存在 (tmp): $REPO_DIR"
  else
    fail "Repo 不存在: $REPO_DIR"
  fi
fi

# ── 4. Network ───────────────────────────────────────────────────────────────
echo ""
echo "[4] Network"

# GitHub API
if curl -sf --max-time 5 https://api.github.com/zen &>/dev/null; then
  ok "GitHub API 可連線"
else
  fail "GitHub API 無法連線"
fi

# TWSE OpenAPI
if curl -sf --max-time 8 https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL -o /dev/null; then
  ok "TWSE OpenAPI 可連線"
else
  warn "TWSE OpenAPI 無法連線（可能是非交易時間）"
fi

# GITHUB_TOKEN
if [ -n "${GITHUB_TOKEN:-}" ]; then
  ok "GITHUB_TOKEN 已設定"
else
  # 嘗試從 ~/.nebula-env 讀取
  if [ -f "$HOME/.nebula-env" ] && grep -q 'GITHUB_TOKEN' "$HOME/.nebula-env"; then
    ok "GITHUB_TOKEN 在 ~/.nebula-env 中"
  else
    warn "GITHUB_TOKEN 未設定（API fallback 將無法使用）"
  fi
fi

# ── 5. 關鍵腳本存在性 ────────────────────────────────────────────────────────
echo ""
echo "[5] 關鍵腳本"
for f in \
  "/home/sprite/taiwan-stock-radar/tasks/2255/scan_market.py" \
  "/home/sprite/taiwan-stock-radar/tasks/intraday/fetch_intraday.py" \
  "/home/sprite/taiwan-stock-radar/tasks/2255/update_tn_records.py" \
  "/home/sprite/taiwan-stock-radar/scripts/github_push.py"
do
  if [ -f "$f" ]; then
    ok "$f"
  else
    # 嘗試 /tmp 路徑
    TMP_PATH="/tmp${f#/home/sprite}"
    if [ -f "$TMP_PATH" ]; then
      warn "僅在 /tmp: $TMP_PATH"
    else
      fail "找不到: $f"
    fi
  fi
done

# ── 總結 ─────────────────────────────────────────────────────────────────────
echo ""
echo "====================================="
echo " 結果: ✅ $PASS OK  ❌ $FAIL FAIL  ⚠️  $WARN WARN"
echo "====================================="

if [ $FAIL -gt 0 ]; then
  echo " ❌ 環境有問題，請先修復後再執行掃描腳本"
  exit 1
elif [ $WARN -gt 0 ]; then
  echo " ⚠️  環境大致正常，但有警告項目需注意"
  exit 0
else
  echo " ✅ 環境完全正常，可以開始工作"
  exit 0
fi
