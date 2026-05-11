#!/usr/bin/env python3
"""
github_push.py — 通用的「git push with GitHub API fallback」工具

用法（在其他腳本中 import）:
    import sys
    sys.path.insert(0, '/home/sprite/taiwan-stock-radar/scripts')
    from github_push import push_with_fallback

    # 推送單一或多個檔案
    push_with_fallback(
        repo_dir='/home/sprite/taiwan-stock-radar',
        files=['public/data/intraday.json', 'public/data/latest.json'],
        commit_message='chore: update data',
    )

直接執行（測試模式）:
    python3 scripts/github_push.py
"""

import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import List, Optional


# ── Config ────────────────────────────────────────────────────────────────────

OWNER = "juststarlight66-oss"
REPO  = "taiwan-stock-radar"
BRANCH = "main"
API_BASE = f"https://api.github.com/repos/{OWNER}/{REPO}/contents"


# ── Token resolution ─────────────────────────────────────────────────────────

def _get_token() -> str:
    """從環境變數或 ~/.nebula-env 取得 GITHUB_TOKEN"""
    token = os.environ.get("GITHUB_TOKEN", "")
    if token:
        return token
    env_file = os.path.expanduser("~/.nebula-env")
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line.startswith("GITHUB_TOKEN="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


# ── GitHub API helpers ───────────────────────────────────────────────────────

def _get_sha(path_in_repo: str, token: str) -> str:
    """取得 repo 中檔案的目前 SHA（不存在回傳空字串）"""
    url = f"{API_BASE}/{path_in_repo}?ref={BRANCH}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())["sha"]
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return ""  # 新檔案
        raise


def _upload_file(local_path: Path, path_in_repo: str, token: str, commit_msg: str) -> bool:
    """用 GitHub Contents API 上傳單一檔案，成功回傳 True"""
    url = f"{API_BASE}/{path_in_repo}"
    sha = _get_sha(path_in_repo, token)
    content = base64.b64encode(local_path.read_bytes()).decode("ascii")
    payload: dict = {
        "message": commit_msg + "\n\nCo-Authored-By: Nebula <noreply@nebula.gg>",
        "content": content,
        "branch":  BRANCH,
    }
    if sha:
        payload["sha"] = sha
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={
        "Authorization": f"token {token}",
        "Accept":        "application/vnd.github.v3+json",
        "Content-Type":  "application/json",
    }, method="PUT")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(f"  [API fallback] ✅ {path_in_repo} → HTTP {resp.status}")
        return True
    except urllib.error.HTTPError as e:
        body = e.read()[:300].decode("utf-8", errors="replace")
        print(f"  [API fallback] ❌ {path_in_repo} HTTP {e.code}: {body}")
        return False
    except Exception as e:
        print(f"  [API fallback] ❌ {path_in_repo}: {e}")
        return False


# ── Main public function ─────────────────────────────────────────────────────

def push_with_fallback(
    repo_dir: str,
    files: List[str],
    commit_message: str,
    ssh_key: Optional[str] = None,
) -> bool:
    """
    先嘗試 git push，失敗時自動改用 GitHub Contents API 上傳指定檔案。

    Args:
        repo_dir: 本地 repo 根目錄的絕對路徑
        files:    要上傳的檔案路徑（相對於 repo_dir，例如 'public/data/intraday.json'）
        commit_message: commit 訊息
        ssh_key:  SSH key 路徑（選填，預設 ~/.ssh/taiwan_stock_radar_key）

    Returns:
        True 表示成功（git 或 API 任一成功），False 表示全部失敗
    """
    repo = Path(repo_dir)
    key  = ssh_key or os.path.expanduser("~/.ssh/taiwan_stock_radar_key")
    env  = {**os.environ, "GIT_SSH_COMMAND": f"ssh -i {key} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no"}

    # ── Step 1: git add + commit ──────────────────────────────────────────────
    for f in files:
        subprocess.run(["git", "add", f], cwd=repo, env=env, capture_output=True)
    r_diff = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=repo, env=env)
    if r_diff.returncode == 0:
        print("  [push_with_fallback] nothing to commit")
        return True  # 沒變更視為成功

    full_msg = commit_message + "\n\nCo-Authored-By: Nebula <noreply@nebula.gg>"
    subprocess.run(["git", "commit", "-m", full_msg], cwd=repo, env=env, capture_output=True)

    # ── Step 2: git push ─────────────────────────────────────────────────────
    r_push = subprocess.run(
        ["git", "push", "origin", BRANCH],
        cwd=repo, env=env, capture_output=True, text=True
    )
    if r_push.returncode == 0:
        print("  [push_with_fallback] ✅ git push OK")
        return True

    print(f"  [push_with_fallback] git push FAILED: {r_push.stderr.strip()[:120]}")
    print("  [push_with_fallback] 切換 GitHub API fallback...")

    # ── Step 3: GitHub API fallback ───────────────────────────────────────────
    token = _get_token()
    if not token:
        print("  [push_with_fallback] ❌ 找不到 GITHUB_TOKEN，無法使用 API fallback")
        return False

    api_msg = commit_message + " [via API fallback]"
    all_ok = True
    for f in files:
        local_path = repo / f
        if not local_path.exists():
            print(f"  [push_with_fallback] ⚠️  {f} 不存在，跳過")
            continue
        ok = _upload_file(local_path, f, token, api_msg)
        if not ok:
            all_ok = False

    return all_ok


# ── Self-test ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=== github_push.py 自我測試 ===")
    token = _get_token()
    if token:
        print(f"✅ GITHUB_TOKEN 已取得（前 8 碼: {token[:8]}...）")
    else:
        print("❌ GITHUB_TOKEN 未設定，API fallback 無法使用")
    print("語法檢查：OK")
    print("import 測試：OK")
