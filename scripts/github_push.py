#!/usr/bin/env python3
"""
github_push.py — 通用 git push with GitHub Contents API fallback

用法（在其他腳本中 import）：
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent / 'scripts'))
    from github_push import git_push_with_fallback

    git_push_with_fallback(
        repo_dir=Path('/home/sprite/taiwan-stock-radar'),
        files_to_upload=[
            {'local_path': Path('/path/to/file.json'), 'repo_path': 'public/data/file.json'},
        ],
        commit_message='data: update file.json',
        ssh_key='~/.ssh/taiwan_stock_radar_key',
    )
"""

import base64
import json
import os
import subprocess
import urllib.error
import urllib.request
from pathlib import Path


GITHUB_OWNER = "juststarlight66-oss"
GITHUB_REPO  = "taiwan-stock-radar"
GITHUB_BRANCH = "main"


def _log(msg: str):
    import datetime
    ts = datetime.datetime.now(
        datetime.timezone(datetime.timedelta(hours=8))
    ).strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def _get_token() -> str:
    """取得 GITHUB_TOKEN，先從環境變數，再從 ~/.nebula-env"""
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


def _api_upload_file(
    token: str,
    local_path: Path,
    repo_path: str,
    commit_message: str,
    owner: str = GITHUB_OWNER,
    repo: str = GITHUB_REPO,
    branch: str = GITHUB_BRANCH,
) -> bool:
    """用 GitHub Contents API 上傳單一檔案，回傳是否成功"""
    api_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{repo_path}"
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
    }

    # 取得現有 SHA（更新時需要）
    sha = ""
    try:
        req = urllib.request.Request(api_url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            sha = json.loads(resp.read()).get("sha", "")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            _log(f"  [API] get SHA HTTP {e.code}: {repo_path}")
    except Exception as e:
        _log(f"  [API] get SHA error: {e}")

    # 讀取本地檔案
    try:
        content = local_path.read_bytes()
    except Exception as e:
        _log(f"  [API] 讀取本地檔案失敗: {e}")
        return False

    payload: dict = {
        "message": commit_message + "\n\nCo-Authored-By: Nebula <noreply@nebula.gg>",
        "content": base64.b64encode(content).decode("ascii"),
        "branch": branch,
    }
    if sha:
        payload["sha"] = sha

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(api_url, data=data, headers=headers, method="PUT")
        with urllib.request.urlopen(req, timeout=30) as resp:
            _log(f"  [API] ✅ {repo_path} uploaded (HTTP {resp.status})")
        return True
    except urllib.error.HTTPError as e:
        _log(f"  [API] ❌ {repo_path} HTTP {e.code}: {e.read()[:200]}")
        return False
    except Exception as e:
        _log(f"  [API] ❌ {repo_path}: {e}")
        return False


def git_push_with_fallback(
    repo_dir: Path,
    files_to_upload: list[dict],
    commit_message: str,
    ssh_key: str = "~/.ssh/taiwan_stock_radar_key",
    branch: str = "main",
    owner: str = GITHUB_OWNER,
    repo: str = GITHUB_REPO,
) -> bool:
    """
    嘗試 git push；失敗時改用 GitHub Contents API 逐檔上傳。

    files_to_upload: [
        {'local_path': Path(...), 'repo_path': 'public/data/xxx.json'},
        ...
    ]
    回傳: True = 至少有一個方法成功
    """
    ssh_key_expanded = os.path.expanduser(ssh_key)
    env = os.environ.copy()
    env["GIT_SSH_COMMAND"] = f"ssh -i {ssh_key_expanded} -o IdentitiesOnly=yes"

    # ── Step 1: git push ──────────────────────────────────────────────────────
    try:
        r = subprocess.run(
            ["git", "push", "origin", branch],
            cwd=repo_dir,
            capture_output=True,
            text=True,
            env=env,
            timeout=60,
        )
        if r.returncode == 0:
            _log("  git push: ✅ OK")
            return True
        else:
            _log(f"  git push FAILED: {r.stderr.strip()[:150]}")
    except Exception as e:
        _log(f"  git push exception: {e}")

    # ── Step 2: GitHub Contents API fallback ─────────────────────────────────
    _log("  切換至 GitHub Contents API fallback...")
    token = _get_token()
    if not token:
        _log("  [API] ❌ 找不到 GITHUB_TOKEN，放棄")
        return False

    all_ok = True
    for f in files_to_upload:
        local_path = Path(f["local_path"])
        repo_path  = f["repo_path"]
        ok = _api_upload_file(
            token=token,
            local_path=local_path,
            repo_path=repo_path,
            commit_message=commit_message,
            owner=owner,
            repo=repo,
            branch=branch,
        )
        if not ok:
            all_ok = False

    return all_ok


if __name__ == "__main__":
    # 語法自測
    print("github_push.py 語法正確 ✅")
    print(f"預設 repo: {GITHUB_OWNER}/{GITHUB_REPO} @ {GITHUB_BRANCH}")
