#!/usr/bin/env python3
"""
push_with_fallback.py
通用 git push + GitHub Contents API fallback 工具

用法（命令列）：
  python3 scripts/push_with_fallback.py <repo_dir> <file1> [file2 ...]

用法（import）：
  from scripts.push_with_fallback import push_files
  push_files(repo_dir='/home/sprite/taiwan-stock-radar',
             files=['public/data/latest.json'],
             commit_msg='update data')

邏輯：
  1. git add + git commit + git push
  2. 若 git push 失敗 → 對每個 file 用 GitHub Contents API 上傳
  3. 回傳 True/False
"""

import base64
import json
import os
import subprocess
import sys
from pathlib import Path


# ── 設定 ──────────────────────────────────────────────────────────────────────

GITHUB_OWNER = "juststarlight66-oss"
GITHUB_REPO  = "taiwan-stock-radar"
GITHUB_BRANCH = "main"


def _get_github_token() -> str:
    """從環境變數取 GitHub token（優先用 GITHUB_TOKEN，次用 NEBULA OAuth proxy）"""
    token = os.environ.get("GITHUB_TOKEN", "")
    if token:
        return token
    # 若無直接 token，嘗試從 OAUTH_APPS 取
    try:
        import httpx
        proxy  = os.environ["NEBULA_PROXY_URL"]
        stoken = os.environ["SANDBOX_AUTH_TOKEN"]
        apps   = json.loads(os.environ["OAUTH_APPS"])
        acct   = apps["github"]["accounts"][0]["account_id"]
        resp = httpx.post(
            f"{proxy}/internal/proxy/oauth",
            headers={"Authorization": f"Bearer {stoken}"},
            json={"app": "github", "method": "GET",
                  "url": "https://api.github.com/user",
                  "account_id": acct},
            timeout=15,
        ).json()
        # proxy 成功就返回空字串，讓 api_push 直接用 proxy
        return ""
    except Exception:
        return ""


def _git_push(repo_dir: str, files: list[str], commit_msg: str,
              ssh_key: str = "") -> bool:
    """執行 git add / commit / push，回傳是否成功。"""
    env = os.environ.copy()
    if ssh_key and os.path.exists(ssh_key):
        env["GIT_SSH_COMMAND"] = f"ssh -i {ssh_key} -o IdentitiesOnly=yes"

    def run(cmd):
        r = subprocess.run(cmd, cwd=repo_dir, env=env,
                           capture_output=True, text=True)
        return r.returncode == 0, r.stdout + r.stderr

    # stage
    ok, out = run(["git", "add"] + files)
    print(f"[git add] {'OK' if ok else 'FAIL'}: {out.strip()[:200]}")

    # commit (忽略 nothing to commit)
    ok, out = run(["git", "commit", "-m", commit_msg,
                   "--trailer", "Co-Authored-By: Nebula <noreply@nebula.gg>"])
    if not ok and "nothing to commit" in out:
        print("[git commit] nothing to commit — skip push")
        return True
    print(f"[git commit] {'OK' if ok else 'FAIL'}: {out.strip()[:200]}")

    # push
    ok, out = run(["git", "push", "origin", GITHUB_BRANCH])
    print(f"[git push] {'OK' if ok else 'FAIL'}: {out.strip()[:200]}")
    return ok


def _api_push(repo_dir: str, files: list[str], commit_msg: str) -> bool:
    """用 GitHub Contents API 上傳每個 file，回傳是否全部成功。"""
    try:
        import httpx
    except ImportError:
        import subprocess as _sp
        _sp.run([sys.executable, "-m", "pip", "install", "httpx", "-q"])
        import httpx

    proxy  = os.environ.get("NEBULA_PROXY_URL", "")
    stoken = os.environ.get("SANDBOX_AUTH_TOKEN", "")
    apps   = json.loads(os.environ.get("OAUTH_APPS", "{}"))
    acct   = apps.get("github", {}).get("accounts", [{}])[0].get("account_id", "")

    if not (proxy and stoken and acct):
        print("[api_push] 缺少 NEBULA_PROXY_URL / SANDBOX_AUTH_TOKEN / OAUTH_APPS")
        return False

    all_ok = True
    for rel_path in files:
        abs_path = Path(repo_dir) / rel_path
        if not abs_path.exists():
            print(f"[api_push] 檔案不存在: {abs_path}")
            all_ok = False
            continue

        content_b64 = base64.b64encode(abs_path.read_bytes()).decode()

        # 取現有 SHA（用於 update；不存在則 create）
        get_url = (f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}"
                   f"/contents/{rel_path}?ref={GITHUB_BRANCH}")
        get_resp = httpx.post(
            f"{proxy}/internal/proxy/oauth",
            headers={"Authorization": f"Bearer {stoken}"},
            json={"app": "github", "method": "GET",
                  "url": get_url, "account_id": acct},
            timeout=20,
        ).json()
        existing_sha = ""
        if get_resp.get("success") and isinstance(get_resp.get("data"), dict):
            existing_sha = get_resp["data"].get("sha", "")

        body = {
            "message": commit_msg + "\n\nCo-Authored-By: Nebula <noreply@nebula.gg>",
            "content": content_b64,
            "branch": GITHUB_BRANCH,
        }
        if existing_sha:
            body["sha"] = existing_sha

        put_url = (f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}"
                   f"/contents/{rel_path}")
        put_resp = httpx.post(
            f"{proxy}/internal/proxy/oauth",
            headers={"Authorization": f"Bearer {stoken}"},
            json={"app": "github", "method": "PUT",
                  "url": put_url, "account_id": acct,
                  "body": body},
            timeout=30,
        ).json()

        if put_resp.get("success"):
            print(f"[api_push] OK: {rel_path}")
        else:
            print(f"[api_push] FAIL: {rel_path} — {put_resp.get('error')}")
            all_ok = False

    return all_ok


def push_files(
    repo_dir: str,
    files: list[str],
    commit_msg: str = "chore: update data files",
    ssh_key: str = "/home/sprite/.ssh/taiwan_stock_radar_key",
) -> bool:
    """
    主入口：先嘗試 git push，失敗時 fallback 到 GitHub Contents API。
    repo_dir : 本地 repo 根目錄（絕對路徑）
    files    : 相對於 repo_dir 的檔案路徑清單
    commit_msg: git commit 訊息
    ssh_key  : SSH private key 路徑（可選）
    """
    print(f"[push_files] 嘗試 git push，共 {len(files)} 個檔案...")
    git_ok = _git_push(repo_dir, files, commit_msg, ssh_key)
    if git_ok:
        print("[push_files] git push 成功 ✅")
        return True

    print("[push_files] git push 失敗，切換 GitHub API fallback...")
    api_ok = _api_push(repo_dir, files, commit_msg)
    if api_ok:
        print("[push_files] GitHub API fallback 成功 ✅")
    else:
        print("[push_files] GitHub API fallback 也失敗 ❌")
    return api_ok


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("用法: python3 push_with_fallback.py <repo_dir> <file1> [file2 ...]")
        sys.exit(1)
    _repo  = sys.argv[1]
    _files = sys.argv[2:]
    _msg   = os.environ.get("COMMIT_MSG", "chore: update data files")
    ok = push_files(_repo, _files, _msg)
    sys.exit(0 if ok else 1)
