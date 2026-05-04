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
    """Fetch ALL stocks' daily history in one STOCK_DAY_ALL call. Returns dict keyed by stock Code.
    Tries today first; if empty (e.g. holiday/weekend), falls back to prior month.
    """
    result: dict[str, list[dict]] = {}
    now_tw = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))
    prev_month = (now_tw.replace(day=1) - datetime.timedelta(days=1)).strftime("%Y%m01")
    date_candidates = [date, prev_month]
    for d in date_candidates:
        for api_path in [
            f"exchangeReport/STOCK_DAY_ALL?date={d}",
        ]:
            url = TWSE_OPENAPI + api_path
            try:
                data = fetch_json(url, timeout=30)
                if isinstance(data, list):
                    for item in data:
                        sid = item.get("Code") or ""
                        if sid:
                            if sid not in result:
                                result[sid] = []
                            result[sid].append(item)
            except Exception as e:
                log(f"  STOCK_DAY_ALL error ({d}): {e}")
        if result:
            log(f"  history loaded from date={d}")
            break
    return result


def compute_score(sid: str, quote: dict, hist: list[dict]) -> tuple[float, dict]:
    """Score a stock for intraday 隔日沖 potential (0-100)."""
    score = 0.0
    details = {}

    cur = quote.get("current")
    prev_close = quote.get("prev_close")
    volume = quote.get("volume", 0)
    open_price = quote.get("open")

    if not cur or not prev_close or prev_close <= 0:
        return 0.0, details

    change_pct = (cur - prev_close) / prev_close * 100

    # 1. Intraday momentum (0-30)
    if change_pct >= 5:
        score += 30
        details["momentum"] = "极强"
    elif change_pct >= 3:
        score += 22
        details["momentum"] = "强"
    elif change_pct >= 1:
        score += 12
        details["momentum"] = "偏强"
    elif change_pct >= 0:
        score += 4
        details["momentum"] = "微涨"

    # 2. Volume surge (0-25)
    avg_vol = None
    if len(hist) >= 5:
        recent = [_safe_int(h.get("Volume")) or 0 for h in hist[-5:]]
        avg_vol = sum(recent) / len(recent)
        if avg_vol > 0 and volume:
            vol_ratio = volume / ((avg_vol or 1) * 1.3)
            if vol_ratio >= 2.5:
                score += 25
                details["vol_ratio"] = "爆發"
            elif vol_ratio >= 1.8:
                score += 18
                details["vol_ratio"] = "放大"
            elif vol_ratio >= 1.2:
                score += 10
                details["vol_ratio"] = "溫和"
            else:
                details["vol_ratio"] = "正常"

    # 3. Breakout pattern (0-25)
    if len(hist) >= 20:
        closes = [_safe_float(h.get("Close")) or 0 for h in hist[-20:]]
        high_20 = max(closes) if closes else 0
        if high_20 > 0:
            dist = (cur - high_20) / high_20 * 100
            if dist >= -1:
                score += 25
                details["breakout"] = "突破20日高"
            elif dist <= 5:
                score += 15
                details["breakout"] = "接近高點"
            else:
                details["breakout"] = "偏低"

    # 4. Gap-up quality (0-20)
    if open_price and prev_close and open_price > prev_close:
        gap_pct = (open_price - prev_close) / prev_close * 100
        if gap_pct >= 1.0 and change_pct > 0:
            score += 20
            details["gap"] = "開高走高"
        elif gap_pct >= 0.5:
            score += 12
            details["gap"] = "小跳空"
        elif gap_pct >= 0:
            score += 5
            details["gap"] = "微跳空"
    else:
        details["gap"] = "無跳空"

    return score, details


def scan_intraday_top5(history_bulk: dict[str, list[dict]]) -> list[dict]:
    """Full intraday scan: fetch live quotes + score + return Top 5."""
    log("Fetching market breadth...")
    all_ids = fetch_market_breadth()
    log(f"  found {len(all_ids)} stocks")

    # Fetch all live quotes in one batch
    log("Fetching live quotes from TWSE/TPEx...")
    quotes = fetch_twse_quotes(all_ids)
    log(f"  got {len(quotes)} quotes")

    # Score each stock
    log("Scoring stocks...")
    scored = []
    for sid, q in quotes.items():
        if not q.get("current") or not q.get("volume"):
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
    log(f"  {len(scored)} qualifying stocks, returning Top 5")
    return scored[:5]


def fetch_twse_quotes(stock_ids: list[str]) -> dict[str, dict]:
    """Fetch live quotes from TWSE mis API in batches. Returns dict keyed by stock_id."""
    results = {}
    if not stock_ids:
        return results

    BATCH_SIZE = 120

    # Split into batches to avoid HTTP 414 (URI Too Large)
    batches = [stock_ids[i:i+BATCH_SIZE] for i in range(0, len(stock_ids), BATCH_SIZE)]

    for batch_idx, batch in enumerate(batches):
        # Try TSE first
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

        # Retry missing with OTC
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


def git_commit_push(repo_dir: Path, message: str):
    """Pull latest, add intraday.json, commit, and push."""
    env = os.environ.copy()
    env["GIT_SSH_COMMAND"] = "ssh -i ~/.ssh/taiwan_stock_radar_key -o IdentitiesOnly=yes"
    cmds = [
        ["git", "stash", "--include-untracked"],  # clean working tree for rebase
        ["git", "pull", "--rebase", "origin", "main"],
        ["git", "stash", "pop"],                    # restore any stashed changes
        ["git", "add", "public/data/intraday.json"],
    ]
    for cmd in cmds:
        r = subprocess.run(cmd, cwd=repo_dir, capture_output=True, text=True, env=env)
        if r.returncode != 0:
            log(f"  git {cmd[1]} warning: {r.stderr.strip()}")
        else:
            log(f"  git {cmd[1]}: OK")
    # Commit only if there are staged changes
    r = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=repo_dir, env=env)
    if r.returncode != 0:
        subprocess.run(["git", "commit", "-m", message], cwd=repo_dir, env=env)
        subprocess.run(["git", "push", "origin", "main"], cwd=repo_dir, env=env)
        log("  git commit + push: OK")
    else:
        log("  nothing to commit")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    now_tw = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))
    today_str = now_tw.strftime("%Y%m%d")
    log(f"盤中隔日沖掃描開始 ({now_tw.strftime('%Y-%m-%d %H:%M:%S')} TWN)")

    # 0. Fetch bulk history once
    log("Fetching bulk history from STOCK_DAY_ALL...")
    history_bulk = fetch_day_history_bulk(today_str)
    log(f"  got history for {len(history_bulk)} stocks")

    # 1. Fresh intraday scan → Top 5
    top5 = scan_intraday_top5(history_bulk)

    # 2. Build output (same schema, with live already populated)
    stocks_out = []
    for s in top5:
        q = s["quote"]
        cur = q.get("current") or 0
        # entry = current price; target +8%; stop_loss -5%
        entry = round(cur, 2)
        target = round(cur * 1.08, 2) if cur else 0
        stop_loss = round(cur * 0.95, 2) if cur else 0
        det = s["details"]
        stocks_out.append({
            "stock_id": s["stock_id"],
            "name": s["name"],
            "sector": "",
            # Legacy fields (kept for backward compat)
            "score": s["score"],
            "details": det,
            # Frontend-expected fields
            "total_score": s["score"],
            "entry": entry,
            "target": target,
            "stop_loss": stop_loss,
            "change_pct": q.get("change_pct"),
            "dimensions": {
                "momentum": det.get("momentum", ""),
                "vol_ratio": det.get("vol_ratio", ""),
                "breakout": det.get("breakout", ""),
                "gap": det.get("gap", ""),
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

    # 3. Write output
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)
    log(f"Written: {OUTPUT_JSON}")

    # 4. Git commit & push
    log("Committing and pushing intraday.json...")
    commit_msg = (
        f"data(intraday): 隔日沖盤中掃描 Top5 {now_tw.strftime('%Y-%m-%d %H:%M')}\n\n"
        f"Co-Authored-By: Nebula <noreply@nebula.gg>"
    )
    git_commit_push(REPO_DIR, commit_msg)
    log("Done.")


if __name__ == "__main__":
    main()
