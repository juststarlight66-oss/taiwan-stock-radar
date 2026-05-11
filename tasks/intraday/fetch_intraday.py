#!/usr/bin/env python3
"""
盤中即時隔日沖掃描腳本
每日 13:00 執行，重新掃描盤中強勢股與高爆發標的，產出 Top 5 隔日沖候選 + 即時報價，
並 git commit+push 至 GitHub Pages。

用法：python3 fetch_intraday.py
"""

import json
import os
import sys
import subprocess
import datetime
import time
import urllib.request
import urllib.parse
import urllib.error
import ssl
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

REPO_DIR = Path("/tmp/taiwan-stock-radar")
OUTPUT_JSON = REPO_DIR / "public/data/intraday.json"
TWSE_API = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp"
TWSE_OPENAPI = "https://openapi.twse.com.tw/v1/"

# ── Helpers ───────────────────────────────────────────────────────────────────

def log(msg: str):
    ts = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def fetch_url(url: str, timeout: int = 15) -> bytes:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 TaiwanStockRadar/1.0"})
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
        return resp.read()


def fetch_json(url: str, timeout: int = 15) -> dict | list:
    raw = fetch_url(url, timeout)
    return json.loads(raw)


def _safe_float(v) -> float | None:
    try:
        f = float(v)
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None


def _safe_int(v, default: int | None = None):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


# ── TWSE market breadth via the scan API (same as the backend uses) ──────────

def fetch_market_breadth() -> list[str]:
    """Get all actively traded stock IDs from TWSE/TPEx."""
    now_tw = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))
    today_str = now_tw.strftime("%Y%m%d")
    all_ids = set()
    for api_path in [
        f"exchangeReport/STOCK_DAY_ALL?date={today_str}",  # TWSE today (dynamic)
        "otcService/otc/getStockInfo?tseIndex=1",           # TPEx fallback
    ]:
        url = TWSE_OPENAPI + api_path
        try:
            data = fetch_json(url, timeout=20)
            if isinstance(data, list):
                for item in data:
                    sid = item.get("Code") or item.get("Symbol") or ""
                    if sid:
                        all_ids.add(sid)
        except Exception as e:
            log(f"  breadth fetch skipped via {api_path}: {e}")
    if all_ids:
        return sorted(all_ids)
    # If OpenAPI fails, fall back to the MIS API (which returns all stocks)
    data = fetch_json(f"{TWSE_API}?ex_ch=tse_tse.tw&json=1&delay=0", timeout=20)
    ids = []
    for m in data.get("msgArray", []):
        sid = m.get("c", "")
        if sid:
            ids.append(sid)
    return ids


def fetch_day_history_bulk(date: str) -> dict[str, list[dict]]:
    """Fetch ALL stocks' monthly aggregate data across 5 months from STOCK_DAY_ALL."""
    months_back = 5
    now_tw = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))
    results: dict[str, list[dict]] = {}
    for i in range(months_back):
        dt = now_tw - datetime.timedelta(days=30 * i)
        date_str = dt.strftime("%Y%m%d")
        url = TWSE_OPENAPI + f"exchangeReport/STOCK_DAY_ALL?date={date_str}"
        try:
            data = fetch_json(url, timeout=30)
            if isinstance(data, list):
                for item in data:
                    sid = item.get("Code", "")
                    if sid:
                        results.setdefault(sid, []).append(item)
            log(f"  history {date_str}: {len(data) if isinstance(data, list) else 0} records")
        except Exception as e:
            log(f"  history fetch skipped {date_str}: {e}")
    return results


# ── Scoring ───────────────────────────────────────────────────────────────────

def compute_score(stock_id: str, quote: dict, hist: list[dict]) -> tuple[float, dict]:
    """Five-dimension intraday score (0-100)."""
    score = 0.0
    details: dict = {}

    cur   = quote.get("current") or 0
    prev  = quote.get("prev_close") or 0
    high  = quote.get("high") or 0
    low   = quote.get("low") or 0
    open_ = quote.get("open") or 0
    volume = quote.get("volume") or 0

    if prev <= 0:
        return 0.0, details

    change_pct = (cur - prev) / prev * 100

    # ── Dimension 1: Momentum (0-30) ──────────────────────────────────────────
    if change_pct >= 8.0:
        dim1 = 30
        details["momentum"] = "極強"
    elif change_pct >= 6.0:
        dim1 = 25
        details["momentum"] = "強勢"
    elif change_pct >= 4.5:
        dim1 = 20
        details["momentum"] = "偏強"
    elif change_pct >= 3.0:
        dim1 = 15
        details["momentum"] = "溫和"
    else:
        dim1 = 5
        details["momentum"] = "弱"
    score += dim1

    # ── Dimension 2: Intraday RSI proxy (0-20) ────────────────────────────────
    if open_ > 0 and high > 0 and low > 0:
        intraday_range = high - low
        if intraday_range > 0:
            rsi_proxy = (cur - low) / intraday_range * 100
        else:
            rsi_proxy = 50
    else:
        rsi_proxy = 50

    if rsi_proxy >= 80:
        dim2 = 20
        details["rsi"] = round(rsi_proxy, 1)
    elif rsi_proxy >= 60:
        dim2 = 15
        details["rsi"] = round(rsi_proxy, 1)
    elif rsi_proxy >= 40:
        dim2 = 10
        details["rsi"] = round(rsi_proxy, 1)
    else:
        dim2 = 3
        details["rsi"] = round(rsi_proxy, 1)
    score += dim2

    # ── Dimension 3: MA5 status (0-15) ────────────────────────────────────────
    closes_hist = []
    for h in hist:
        c = h.get("ClosingPrice") or h.get("closing_price") or ""
        try:
            closes_hist.append(float(str(c).replace(",", "")))
        except (ValueError, TypeError):
            pass

    if len(closes_hist) >= 2:
        ma5_bars = closes_hist[-5:] if len(closes_hist) >= 5 else closes_hist
        ma5 = sum(ma5_bars) / len(ma5_bars)
        if cur > ma5 * 1.02:
            dim3 = 15
            details["ma5_status"] = "強勢突破"
        elif cur > ma5:
            dim3 = 10
            details["ma5_status"] = "站上均線"
        elif cur > ma5 * 0.98:
            dim3 = 5
            details["ma5_status"] = "貼近均線"
        else:
            dim3 = 2
            details["ma5_status"] = "跌破均線"
    else:
        dim3 = 5
        details["ma5_status"] = "資料不足"
    score += dim3

    # ── Dimension 4: Volume Surge (0-15) ─────────────────────────────────────
    vols_hist = [(_safe_int(h.get("TradeVolume")) or 0) // 20 for h in hist if h.get("TradeVolume")]
    if len(vols_hist) >= 2 and volume:
        avg_5d_vol = sum(vols_hist[-5:]) / min(len(vols_hist), 5)
        if avg_5d_vol > 0:
            estimated_full_day_vol = volume * 1000 * 1.5
            vol_ratio = estimated_full_day_vol / avg_5d_vol
            if vol_ratio >= 2.5:
                dim4 = 15
                details["vol_ratio"] = "爆發"
            elif vol_ratio >= 1.8:
                dim4 = 12
                details["vol_ratio"] = "明顯放大"
            elif vol_ratio >= 1.3:
                dim4 = 8
                details["vol_ratio"] = "溫和放量"
            elif vol_ratio >= 1.0:
                dim4 = 5
                details["vol_ratio"] = "持平"
            else:
                dim4 = 2
                details["vol_ratio"] = "量縮"
        else:
            dim4 = 2
            details["vol_ratio"] = "量縮"
    else:
        dim4 = 5
        details["vol_ratio"] = "資料不足"
    score += dim4

    # ── Dimension 5: New High Proximity (0-20) ────────────────────────────────
    if len(closes_hist) >= 2:
        recent_closes = closes_hist[-20:] if len(closes_hist) >= 20 else closes_hist
        high_20 = max(recent_closes)
        if high_20 > 0:
            dist_pct = (cur - high_20) / high_20 * 100
            if dist_pct >= 0:
                dim5 = 20
                details["breakout"] = "創新高"
            elif dist_pct >= -1.0:
                dim5 = 15
                details["breakout"] = "逼近前高"
            elif dist_pct >= -3.0:
                dim5 = 10
                details["breakout"] = "接近高點"
            elif dist_pct >= -5.0:
                dim5 = 5
                details["breakout"] = "區間偏高"
            else:
                dim5 = 2
                details["breakout"] = "偏低"
        else:
            dim5 = 2
            details["breakout"] = "偏低"
    else:
        dim5 = 5
        details["breakout"] = "資料不足"
    score += dim5

    return round(score, 1), details


def scan_intraday_top5(history_bulk: dict[str, list[dict]]) -> list[dict]:
    """Full intraday scan: fetch live quotes + score + return Top 5."""
    log("Fetching market breadth...")
    all_ids = fetch_market_breadth()
    log(f"  found {len(all_ids)} stocks")

    log("Fetching live quotes from TWSE/TPEx...")
    quotes = fetch_twse_quotes(all_ids)
    log(f"  got {len(quotes)} quotes")

    log("Scoring stocks...")
    scored = []
    etf_skipped = 0
    weak_skipped = 0
    limitup_skipped = 0
    for sid, q in quotes.items():
        if not q.get("current") or not q.get("volume"):
            continue
        if sid.startswith("00") or any(c.isalpha() for c in sid):
            etf_skipped += 1
            continue
        cur = q.get("current") or 0
        prev = q.get("prev_close") or 0
        if prev <= 0:
            continue
        change_pct = (cur - prev) / prev * 100
        if change_pct < 3.0:
            weak_skipped += 1
            continue
        if change_pct >= 9.5:
            limitup_skipped += 1
            continue
        hist = history_bulk.get(sid, [])
        score, details = compute_score(sid, q, hist)
        if score >= 20:
            scored.append({
                "stock_id": sid,
                "name": q.get("name", sid),
                "quote": q,
                "score": score,
                "details": details,
            })

    scored.sort(key=lambda x: x["score"], reverse=True)
    log(f"  ETFs skipped: {etf_skipped} | weak (<3%): {weak_skipped} | limit-up (>=9.5%): {limitup_skipped}")
    log(f"  {len(scored)} qualifying stocks, returning Top 5")
    return scored[:5]


def fetch_twse_quotes(stock_ids: list[str]) -> dict[str, dict]:
    """Fetch live quotes from TWSE mis API in batches."""
    results = {}
    if not stock_ids:
        return results

    BATCH_SIZE = 120
    batches = [stock_ids[i:i+BATCH_SIZE] for i in range(0, len(stock_ids), BATCH_SIZE)]

    for batch_idx, batch in enumerate(batches):
        tse_query = "|".join(f"tse_{sid}.tw" for sid in batch)
        url = f"{TWSE_API}?ex_ch={urllib.parse.quote(tse_query)}&json=1&delay=0"
        try:
            raw = fetch_url(url, timeout=20)
            data = json.loads(raw)
            for m in data.get("msgArray", []):
                sid = m.get("c", "")
                if not sid:
                    continue
                z = m.get("z") or m.get("pz") or ""
                y = m.get("y", "")
                cur = _safe_float(z)
                prev = _safe_float(y)
                results[sid] = {
                    "stock_id": sid,
                    "name": m.get("n", sid),
                    "current": cur,
                    "open": _safe_float(m.get("o")),
                    "high": _safe_float(m.get("h")),
                    "low": _safe_float(m.get("l")),
                    "prev_close": prev,
                    "volume": _safe_int(m.get("v")),
                    "time": m.get("t", ""),
                    "date": m.get("d", ""),
                    "change_pct": round((cur - prev) / prev * 100, 2)
                        if cur and prev and prev > 0 else None,
                    "source": "tse",
                }
        except Exception as e:
            log(f"  TSE batch {batch_idx+1}/{len(batches)} error: {e}")

        missing = [sid for sid in batch if sid not in results]
        if missing:
            otc_query = "|".join(f"otc_{sid}.two" for sid in missing)
            url2 = f"{TWSE_API}?ex_ch={urllib.parse.quote(otc_query)}&json=1&delay=0"
            try:
                raw2 = fetch_url(url2, timeout=20)
                data2 = json.loads(raw2)
                for m in data2.get("msgArray", []):
                    sid = m.get("c", "")
                    if not sid or sid in results:
                        continue
                    z = m.get("z") or m.get("pz") or ""
                    y = m.get("y", "")
                    cur = _safe_float(z)
                    prev = _safe_float(y)
                    results[sid] = {
                        "stock_id": sid,
                        "name": m.get("n", sid),
                        "current": cur,
                        "open": _safe_float(m.get("o")),
                        "high": _safe_float(m.get("h")),
                        "low": _safe_float(m.get("l")),
                        "prev_close": prev,
                        "volume": _safe_int(m.get("v")),
                        "time": m.get("t", ""),
                        "date": m.get("d", ""),
                        "change_pct": round((cur - prev) / prev * 100, 2)
                            if cur and prev and prev > 0 else None,
                        "source": "otc",
                    }
            except Exception as e:
                log(f"  OTC batch {batch_idx+1}/{len(batches)} error: {e}")

    return results


def _api_fallback_intraday(repo_dir: Path, json_path: Path):
    """git push 失敗時，改用 GitHub Contents API 直接上傳 intraday.json"""
    import base64, json as _json, urllib.request as _req, urllib.error as _err

    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        env_file = os.path.expanduser("~/.nebula-env")
        if os.path.exists(env_file):
            with open(env_file) as f:
                for line in f:
                    if line.strip().startswith("GITHUB_TOKEN="):
                        token = line.strip().split("=", 1)[1].strip().strip('"').strip("'")
                        break
    if not token:
        log("  [API fallback] 找不到 GITHUB_TOKEN，放棄")
        return

    owner, repo, branch = "juststarlight66-oss", "taiwan-stock-radar", "main"
    path_in_repo = "public/data/intraday.json"
    api_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path_in_repo}"
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
    }

    sha = ""
    try:
        req = _req.Request(api_url, headers=headers)
        with _req.urlopen(req, timeout=15) as resp:
            sha = _json.loads(resp.read())["sha"]
    except Exception as e:
        log(f"  [API fallback] get SHA: {e}")

    try:
        content = json_path.read_bytes()
    except Exception as e:
        log(f"  [API fallback] 讀取 {json_path} 失敗: {e}")
        return

    payload = {
        "message": "chore: API fallback — update intraday.json\n\nCo-Authored-By: Nebula <noreply@nebula.gg>",
        "content": base64.b64encode(content).decode("ascii"),
        "branch": branch,
    }
    if sha:
        payload["sha"] = sha

    try:
        data = _json.dumps(payload).encode("utf-8")
        req = _req.Request(api_url, data=data, headers=headers, method="PUT")
        with _req.urlopen(req, timeout=30) as resp:
            status = resp.status
        log(f"  [API fallback] ✅ intraday.json uploaded via API (HTTP {status})")
    except _err.HTTPError as e:
        log(f"  [API fallback] ❌ HTTP {e.code}: {e.read()[:200]}")
    except Exception as e:
        log(f"  [API fallback] ❌ {e}")


def git_commit_push(repo_dir: Path, message: str):
    """Pull latest, add intraday.json, commit, and push.

    Uses stash-based rebase to avoid merge conflicts.
    On stash-pop conflict: aborts the merge and skips push to prevent
    corrupted JSON from being deployed to the dashboard.
    """
    env = os.environ.copy()
    env["GIT_SSH_COMMAND"] = "ssh -i ~/.ssh/taiwan_stock_radar_key -o IdentitiesOnly=yes"

    cmds = [
        ["git", "stash", "--include-untracked"],
        ["git", "pull", "--rebase", "origin", "main"],
    ]
    for cmd in cmds:
        r = subprocess.run(cmd, cwd=repo_dir, capture_output=True, text=True, env=env)
        if r.returncode != 0:
            log(f"  git {cmd[1]} warning: {r.stderr.strip()}")
        else:
            log(f"  git {cmd[1]}: OK")

    r_pop = subprocess.run(["git", "stash", "pop"], cwd=repo_dir, capture_output=True, text=True, env=env)
    if r_pop.returncode != 0:
        log(f"  git stash pop FAILED: {r_pop.stderr.strip()}")
        r_grep = subprocess.run(
            ["grep", "-rl", "^<<<<<<< ", "public/data/intraday.json"],
            cwd=repo_dir, capture_output=True, text=True, env=env
        )
        if r_grep.returncode == 0:
            log("  CONFLICT detected in intraday.json — aborting merge and skipping push")
            subprocess.run(["git", "checkout", "--", "public/data/intraday.json"], cwd=repo_dir, env=env)
            subprocess.run(["git", "stash", "drop"], cwd=repo_dir, capture_output=True, text=True, env=env)
            return
        else:
            log("  stash pop failed but no conflict markers — continuing with caution")
    else:
        log("  git stash pop: OK")

    r_add = subprocess.run(["git", "add", "public/data/intraday.json"], cwd=repo_dir, capture_output=True, text=True, env=env)
    if r_add.returncode != 0:
        log(f"  git add failed: {r_add.stderr.strip()}")
        return
    log("  git add intraday.json: OK")

    r = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=repo_dir, env=env)
    if r.returncode != 0:
        subprocess.run(["git", "commit", "-m", message], cwd=repo_dir, env=env)
        r_push = subprocess.run(
            ["git", "push", "origin", "main"],
            cwd=repo_dir, capture_output=True, text=True, env=env
        )
        if r_push.returncode == 0:
            log("  git commit + push: OK")
        else:
            log(f"  git push FAILED ({r_push.stderr.strip()[:120]}), falling back to GitHub API...")
            _api_fallback_intraday(repo_dir, OUTPUT_JSON)
    else:
        log("  nothing to commit")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    now_tw = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))
    today_str = now_tw.strftime("%Y%m%d")
    log(f"盤中隔日沖掃描開始 ({now_tw.strftime('%Y-%m-%d %H:%M:%S')} TWN)")

    log("Fetching bulk history from STOCK_DAY_ALL...")
    history_bulk = fetch_day_history_bulk(today_str)
    log(f"  got history for {len(history_bulk)} stocks")

    top5 = scan_intraday_top5(history_bulk)

    stocks_out = []
    for s in top5:
        q = s["quote"]
        cur = q.get("current") or 0
        entry = round(cur, 2)
        target = round(cur * 1.08, 2) if cur else 0
        stop_loss = round(cur * 0.95, 2) if cur else 0
        det = s["details"]
        stocks_out.append({
            "stock_id": s["stock_id"],
            "name": s["name"],
            "sector": "",
            "score": s["score"],
            "details": det,
            "total_score": s["score"],
            "entry": entry,
            "target": target,
            "stop_loss": stop_loss,
            "change_pct": q.get("change_pct"),
            "dimensions": {
                "momentum": det.get("momentum", ""),
                "rsi": det.get("rsi"),
                "ma5_status": det.get("ma5_status", ""),
                "vol_ratio": det.get("vol_ratio", ""),
                "breakout": det.get("breakout", ""),
            },
            "live": {
                "current": q.get("current"),
                "open": q.get("open"),
                "high": q.get("high"),
                "low": q.get("low"),
                "prev_close": q.get("prev_close"),
                "volume": q.get("volume"),
                "change_pct": q.get("change_pct"),
                "time": q.get("time"),
                "date": q.get("date"),
                "source": q.get("source"),
            },
        })

    snapshot = {
        "scan_type": "intraday_daytrade",
        "scanned_at": now_tw.strftime("%Y-%m-%d %H:%M:%S"),
        "stocks": stocks_out,
    }

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)
    log(f"Written: {OUTPUT_JSON}")

    log("Committing and pushing intraday.json...")
    commit_msg = (
        f"data(intraday): 隔日沖盤中掃描 Top5 {now_tw.strftime('%Y-%m-%d %H:%M')}\n\n"
        f"Co-Authored-By: Nebula <noreply@nebula.gg>"
    )
    git_commit_push(REPO_DIR, commit_msg)
    log("Done.")


if __name__ == "__main__":
    main()
