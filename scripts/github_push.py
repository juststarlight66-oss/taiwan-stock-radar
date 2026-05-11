"""
github_push.py — 通用 git push with GitHub API fallback
=========================================================
用法（在任何腳本中 import）：

    import sys
    sys.path.insert(0, "/home/sprite/scripts")
    from github_push import push_files

    result = push_files([
        {"path": "public/data/latest.json", "content": json.dumps(data)},
        {"path": "public/data/backtest.json", "content": json.dumps(bt)},
    ], commit_message="chore: update scan data")

    if result["success"]:
        print(f"上傳成功，方式：{result['method']}")
    else:
        print(f"上傳失敗：{result['error']}")

流程：
1. 先嘗試 git add / git commit / git push（SSH）
2. 若 git push 失敗，自動切換為 GitHub Contents API 逐檔上傳
3. 回傳 {"method": "git"|"api"|"none", "success": bool, "error": str|None}
"""

import os
import json
import base64
import subprocess
import logging
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ── 設定 ──────────────────────────────────────────────────────────────────────

REPO_PATH   = Path(os.environ.get("TAIWAN_STOCK_REPO", "/home/sprite/taiwan-stock-radar"))
SSH_KEY     = Path(os.environ.get("GIT_SSH_KEY", str(Path.home() / ".ssh/taiwan_stock_radar_key")))
GITHUB_REPO = os.environ.get("GITHUB_REPO", "juststarlight66-oss/taiwan-stock-radar")
BRANCH      = os.environ.get("GITHUB_BRANCH", "main")

PROXY_URL   = os.environ.get("NEBULA_PROXY_URL", "")
AUTH_TOKEN  = os.environ.get("SANDBOX_AUTH_TOKEN", "")

def _load_oauth_apps() -> dict:
    raw = os.environ.get("OAUTH_APPS", "{}")
    try:
        return json.loads(raw)
    except Exception:
        return {}

# ── GitHub OAuth proxy helper ─────────────────────────────────────────────────

def _github_account_id() -> Optional[str]:
    try:
        apps = _load_oauth_apps()
        accounts = apps.get("github", {}).get("accounts", [])
        return accounts[0]["account_id"] if accounts else None
    except Exception:
        return None


def _proxy_request(method: str, url: str, body: Optional[dict] = None) -> dict:
    """透過 Nebula OAuth proxy 呼叫 GitHub API，自動 refresh token on 401。"""
    global AUTH_TOKEN

    account_id = _github_account_id()
    if not account_id:
        raise RuntimeError("GitHub OAuth 帳號未設定，無法使用 API fallback")
    if not PROXY_URL:
        raise RuntimeError("NEBULA_PROXY_URL 未設定")

    def _do_request(token: str) -> httpx.Response:
        payload: dict = {
            "app": "github",
            "method": method,
            "url": url,
            "account_id": account_id,
        }
        if body:
            payload["body"] = body
        return httpx.post(
            f"{PROXY_URL}/internal/proxy/oauth",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
            timeout=30,
        )

    resp = _do_request(AUTH_TOKEN)

    # Token refresh on 401
    if resp.status_code == 401:
        logger.info("Token 過期，嘗試 refresh...")
        refresh = httpx.post(
            f"{PROXY_URL}/internal/proxy/token/refresh",
            headers={"Authorization": f"Bearer {AUTH_TOKEN}"},
            timeout=10,
        )
        refresh.raise_for_status()
        AUTH_TOKEN = refresh.json()["token"]
        resp = _do_request(AUTH_TOKEN)

    resp.raise_for_status()
    result = resp.json()
    if not result.get("success"):
        raise RuntimeError(f"GitHub API error: {result.get('error')}")
    return result.get("data", {})


# ── Git push（SSH）────────────────────────────────────────────────────────────

def _git_push(files: list, commit_message: str) -> bool:
    """
    在 REPO_PATH 執行 git add / commit / push。
    files: [{"path": "相對於 repo 根目錄的路徑", "content": "字串內容"}]
    回傳 True 代表成功。
    """
    if not REPO_PATH.exists():
        logger.warning(f"Repo 路徑不存在：{REPO_PATH}")
        return False

    env = os.environ.copy()
    if SSH_KEY.exists():
        env["GIT_SSH_COMMAND"] = (
            f"ssh -i {SSH_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no"
        )
    else:
        logger.warning(f"SSH key 不存在：{SSH_KEY}，將嘗試預設 SSH 設定")

    def run(cmd: list) -> subprocess.CompletedProcess:
        return subprocess.run(
            cmd, cwd=str(REPO_PATH), env=env,
            capture_output=True, text=True
        )

    try:
        # 寫入檔案到 repo
        for f in files:
            dest = REPO_PATH / f["path"]
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(f["content"], encoding="utf-8")
            logger.info(f"寫入：{dest}")

        # git add
        r = run(["git", "add"] + [f["path"] for f in files])
        if r.returncode != 0:
            logger.warning(f"git add 失敗：{r.stderr.strip()}")
            return False

        # 確認有變更
        status = run(["git", "status", "--porcelain"])
        if not status.stdout.strip():
            logger.info("git：無變更，跳過 commit")
            return True

        # git commit
        full_message = commit_message + "\n\nCo-Authored-By: Nebula <noreply@nebula.gg>"
        r = run(["git", "commit", "-m", full_message])
        if r.returncode != 0:
            logger.warning(f"git commit 失敗：{r.stderr.strip()}")
            return False

        # git push
        r = run(["git", "push", "origin", BRANCH])
        if r.returncode != 0:
            logger.warning(f"git push 失敗：{r.stderr.strip()}")
            return False

        logger.info("git push 成功")
        return True

    except Exception as e:
        logger.warning(f"git push exception：{e}")
        return False


# ── GitHub Contents API fallback ──────────────────────────────────────────────

def _get_file_sha(path: str) -> Optional[str]:
    """取得檔案目前的 blob SHA（PUT 時需要）。不存在回傳 None。"""
    try:
        url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{path}?ref={BRANCH}"
        data = _proxy_request("GET", url)
        return data.get("sha")
    except Exception:
        return None  # 檔案不存在 → 新增


def _api_upload_file(path: str, content: str, commit_message: str) -> bool:
    """用 GitHub Contents API 上傳單一檔案。"""
    sha = _get_file_sha(path)
    encoded = base64.b64encode(content.encode("utf-8")).decode("ascii")
    url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{path}"
    body: dict = {
        "message": commit_message + "\n\nCo-Authored-By: Nebula <noreply@nebula.gg>",
        "content": encoded,
        "branch": BRANCH,
    }
    if sha:
        body["sha"] = sha
    try:
        _proxy_request("PUT", url, body=body)
        logger.info(f"API upload 成功：{path}")
        return True
    except Exception as e:
        logger.error(f"API upload 失敗 {path}：{e}")
        return False


def _api_push(files: list, commit_message: str) -> bool:
    """逐檔用 GitHub Contents API 上傳。全部成功才回傳 True。"""
    results = [_api_upload_file(f["path"], f["content"], commit_message) for f in files]
    return all(results)


# ── 公開介面 ──────────────────────────────────────────────────────────────────

def push_files(
    files: list,
    commit_message: str = "chore: update data",
    force_api: bool = False,
) -> dict:
    """
    上傳檔案到 GitHub，優先用 git push，失敗自動改用 API。

    參數：
        files           : [{"path": "repo 內路徑", "content": "字串"}]
        commit_message  : commit 訊息（自動附加 Co-Authored-By trailer）
        force_api       : True 則跳過 git，直接用 API

    回傳：
        {"method": "git"|"api"|"none", "success": bool, "error": str|None}
    """
    if not files:
        return {"method": "none", "success": True, "error": None}

    # 嘗試 git push
    if not force_api:
        logger.info("嘗試 git push（SSH）...")
        if _git_push(files, commit_message):
            return {"method": "git", "success": True, "error": None}
        logger.warning("git push 失敗，切換到 GitHub API fallback")

    # API fallback
    logger.info("使用 GitHub Contents API 上傳...")
    if _api_push(files, commit_message):
        return {"method": "api", "success": True, "error": None}

    err = "git push 和 GitHub API fallback 都失敗"
    logger.error(err)
    return {"method": "api", "success": False, "error": err}


# ── CLI 自我測試 ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")

    print("=" * 40)
    print("  github_push.py 自我測試")
    print("=" * 40)

    ok_count = 0
    warn_count = 0

    def chk(label, cond, is_warn=False):
        global ok_count, warn_count
        if cond:
            print(f"  [OK]   {label}")
            ok_count += 1
        elif is_warn:
            print(f"  [WARN] {label}")
            warn_count += 1
        else:
            print(f"  [FAIL] {label}")

    chk("模組語法正確，可 import", True)
    chk(f"REPO_PATH 設定：{REPO_PATH}", True)
    chk(f"GITHUB_REPO 設定：{GITHUB_REPO}", True)
    chk("NEBULA_PROXY_URL 已設定", bool(PROXY_URL), is_warn=True)
    chk("SANDBOX_AUTH_TOKEN 已設定", bool(AUTH_TOKEN), is_warn=True)
    chk("GitHub OAuth 帳號已連接", bool(_github_account_id()), is_warn=True)
    chk(f"Repo 路徑存在：{REPO_PATH}", REPO_PATH.exists(), is_warn=True)
    chk(f"SSH key 存在：{SSH_KEY}", SSH_KEY.exists(), is_warn=True)

    print("=" * 40)
    print(f"  OK {ok_count}  WARN {warn_count}")
    print("=" * 40)
    sys.exit(0)
