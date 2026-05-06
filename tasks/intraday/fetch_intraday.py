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
    """Fetch ALL stocks' monthly aggregate data across 5 months from STOCK_DAY_ALL.

    STOCK_DAY_ALL returns ONE bar per stock per API call, each bar representing the
    last trading day of the queried month with fields:
      Date, Code, Name, TradeVolume, TradeValue, OpeningPrice, HighestPrice,
      LowestPrice, ClosingPrice, Change, Transaction

    By fetching 5 months we get up to 5 bars per stock (oldest → newest),
    which is enough for RSI(5), MA5, volume avg, and 20-bar high approximation.
    Bars are appended in chronological order (oldest month first).
    """
    result: dict[str, list[dict]] = {}
    now_tw = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))

    # Build list of the last 5 month-start dates in chronological order (oldest first)
    month_dates = []
    cursor = now_tw.replace(day=1)
    for _ in range(5):
        month_dates.append(cursor.strftime("%Y%m01"))
        cursor = (cursor - datetime.timedelta(days=1)).replace(day=1)
    month_dates.reverse()  # oldest first so bars accumulate chronologically

    for d in month_dates:
        url = TWSE_OPENAPI + f"exchangeReport/STOCK_DAY_ALL?date={d}"
        try:
            data = fetch_json(url, timeout=30)
            if isinstance(data, list):
                fetched = 0
                for item in data:
                    sid = item.get("Code") or ""
                    if sid:
                        if sid not in result:
                            result[sid] = []
                        result[sid].append(item)
                        fetched += 1
                log(f"  STOCK_DAY_ALL {d}: {fetched} rows")
        except Exception as e:
            log(f"  STOCK_DAY_ALL error ({d}): {e}")

    log(f"  history_bulk: {len(result)} stocks, up to {len(month_dates)} bars each")
    return result


def _calc_rsi(closes: list[float], period: int = 5) -> float | None:
    """Compute RSI over the last `period` closes using standard avg-gain/avg-loss formula."""
    if len(closes) < 2:
        return None
    # Use up to `period+1` most recent closes so we get `period` changes
    window = closes[-(period + 1):]
    gains, losses = [], []
    for i in range(1, len(window)):
        delta = window[i] - window[i - 1]
        if delta > 0:
            gains.append(delta)
            losses.append(0.0)
        else:
            gains.append(0.0)
            losses.append(abs(delta))
    if not gains:
        return 50.0
    avg_gain = sum(gains) / len(gains)
    avg_loss = sum(losses) / len(losses)
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 1)


def compute_score(sid: str, quote: dict, hist: list[dict]) -> tuple[float, dict]:
    """Score a stock for intraday 隔日沖 potential (0-100).

    Dimensions:
      1. Momentum Quality  0-25
      2. RSI(5) Trend      0-20
      3. MA5 Breakthrough  0-20
      4. Volume Surge      0-15
      5. New High Proximity 0-20
    Total max = 100
    """
    score = 0.0
    details = {}

    cur = quote.get("current")
    prev_close = quote.get("prev_close")
    volume = quote.get("volume", 0)

    if not cur or not prev_close or prev_close <= 0:
        return 0.0, details

    change_pct = (cur - prev_close) / prev_close * 100

    # ── Dimension 1: Momentum Quality (0-25) ─────────────────────────────────
    # 3-4.5% → 15  |  4.5-6% → 22  |  6-7.5% → 25 (peak)  |  7.5-9.5% → 18
    if 3.0 <= change_pct < 4.5:
        dim1 = 15
        details["momentum"] = "溫和強勢"
    elif 4.5 <= change_pct < 6.0:
        dim1 = 22
        details["momentum"] = "強勢推進"
    elif 6.0 <= change_pct < 7.5:
        dim1 = 25
        details["momentum"] = "最強動能"
    elif 7.5 <= change_pct < 9.5:
        dim1 = 18
        details["momentum"] = "近漲停警戒"
    else:
        dim1 = 0
        details["momentum"] = "不足"
    score = dim1  # start fresh; accumulate other dims below

    # ── Dimension 2: RSI(5) Trend (0-20) ─────────────────────────────────────
    # STOCK_DAY_ALL uses 'ClosingPrice' (not 'Close'); TradeVolume (not 'Volume')
    closes_hist = [_safe_float(h.get("ClosingPrice")) for h in hist if _safe_float(h.get("ClosingPrice"))]
    # Append today's current price so RSI reflects today's move
    if cur and closes_hist:
        closes_hist = closes_hist + [cur]
    rsi = _calc_rsi(closes_hist, period=5) if closes_hist else None
    details["rsi"] = rsi if rsi is not None else None
    if rsi is None:
        dim2 = 10  # neutral fallback when no history
    elif 50 <= rsi <= 65:
        dim2 = 20
    elif (40 <= rsi < 50) or (65 < rsi <= 70):
        dim2 = 14
    elif 30 <= rsi < 40:
        dim2 = 8
    else:  # rsi < 30 or rsi > 75
        dim2 = 4
    score += dim2

    # ── Dimension 3: MA5 Breakthrough (0-20) ─────────────────────────────────
    # Need >= 2 bars; use up to last 5 available for the moving average
    if len(closes_hist) >= 2:
        ma5 = sum(closes_hist[-5:]) / min(len(closes_hist[-5:]), 5)
        if ma5 > 0:
            diff_pct = (cur - ma5) / ma5 * 100
            if diff_pct >= 2.0:
                dim3 = 20
                details["ma5_status"] = "強勢突破"
            elif 0.5 <= diff_pct < 2.0:
                dim3 = 15
                details["ma5_status"] = "突破"
            elif 0 <= diff_pct < 0.5:
                dim3 = 10
                details["ma5_status"] = "站上"
            elif -1.0 <= diff_pct < 0:
                dim3 = 5
                details["ma5_status"] = "貼近"
            else:
                dim3 = 0
                details["ma5_status"] = "跌破"
        else:
            dim3 = 5
            details["ma5_status"] = "無法計算"
    else:
        dim3 = 5  # neutral fallback (< 2 bars)
        details["ma5_status"] = "資料不足"
    score += dim3

    # ── Dimension 4: Volume Surge (0-15) ─────────────────────────────────────
    # STOCK_DAY_ALL TradeVolume is the monthly cumulative total (not daily).
    # Divide by ~20 trading days/month to estimate average daily volume.
    vols_hist = [(_safe_int(h.get("TradeVolume")) or 0) // 20 for h in hist if h.get("TradeVolume")]
    if len(vols_hist) >= 2 and volume:
        avg_5d_vol = sum(vols_hist[-5:]) / min(len(vols_hist), 5)
        if avg_5d_vol > 0:
            # volume from live quote is in lots (張); STOCK_DAY_ALL TradeVolume is in shares
            # Convert: 1 lot = 1000 shares
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
        dim4 = 5  # neutral fallback
        details["vol_ratio"] = "資料不足"
    score += dim4

    # ── Dimension 5: New High Proximity (0-20) ────────────────────────────────
    # Need >= 2 bars; use all available (up to 20) for recent high
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
        dim5 = 5  # neutral fallback
        details["breakout"] = "資料不足"
    score += dim5

    return round(score, 1), details


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
    etf_skipped = 0
    weak_skipped = 0
    limitup_skipped = 0
    for sid, q in quotes.items():
        if not q.get("current") or not q.get("volume"):
            continue
        # ETF filter: skip codes starting with '00' or containing any letter
        if sid.startswith("00") or any(c.isalpha() for c in sid):
            etf_skipped += 1
            continue
        # Pre-filter: must have valid prev_close to compute change_pct
        cur = q.get("current") or 0
        prev = q.get("prev_close") or 0
        if prev <= 0:
            continue
        change_pct = (cur - prev) / prev * 100
        # Skip weak stocks (not strong enough for 隔日沖)
        if change_pct < 3.0:
            weak_skipped += 1
            continue
        # Skip limit-up stocks (locked, can't enter)
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
    """Pull latest, add intraday.json, commit, and push.

    Uses stash-based rebase to avoid merge conflicts.
    On stash-pop conflict: aborts the merge and skips push to prevent
    corrupted JSON from being deployed to the dashboard.
    """
    env = os.environ.copy()
    env["GIT_SSH_COMMAND"] = "ssh -i ~/.ssh/taiwan_stock_radar_key -o IdentitiesOnly=yes"

    # Step 1: stash local changes, pull latest
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

    # Step 2: pop stash and detect conflicts
    r_pop = subprocess.run(["git", "stash", "pop"], cwd=repo_dir, capture_output=True, text=True, env=env)
    if r_pop.returncode != 0:
        log(f"  git stash pop FAILED: {r_pop.stderr.strip()}")
        # Check for actual merge conflict markers in tracked files
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

    # Step 3: stage fresh output
    r_add = subprocess.run(["git", "add", "public/data/intraday.json"], cwd=repo_dir, capture_output=True, text=True, env=env)
    if r_add.returncode != 0:
        log(f"  git add failed: {r_add.stderr.strip()}")
        return
    log("  git add intraday.json: OK")

    # Step 4: commit only if there are staged changes
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
