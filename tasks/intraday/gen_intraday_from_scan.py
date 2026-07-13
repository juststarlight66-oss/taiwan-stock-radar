#!/usr/bin/env python3
"""
Generate intraday.json from scan_result (latest.json) as a fallback
when yfinance is blocked from the cloud sandbox.

Filter: 3-9.5% change, score by momentum/volume/breakout/gap 4-dimensions.
Output: Top 5 stocks for intraday daytrade.
"""
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from typing import Any

# Config
MIN_CHANGE_PCT = 3.0
MAX_CHANGE_PCT = 9.5
DATA_SOURCE = os.environ.get("SCAN_DATA", "latest.json")

def load_scan_data():
    """Load scan result from latest.json or scan_result.json."""
    base = "/home/nebula/projects/juststarlight66-oss/taiwan-stock-radar/public/data"

    # Try latest.json first
    path = os.path.join(base, "latest.json")
    if not os.path.exists(path):
        # Fall back to scan_result.json
        path = os.path.join(base, "scan_result.json")
    if not os.path.exists(path):
        # Try to find the most recent scan_result_YYYYMMDD.json
        import glob
        files = sorted(glob.glob(os.path.join(base, "scan_result_*.json")), reverse=True)
        if files:
            path = files[0]
        else:
            raise FileNotFoundError("No scan result files found")

    print(f"Loading scan data from: {path}")
    with open(path) as f:
        data = json.load(f)

    # Extract stocks list
    stocks = data.get("all_stock_scores", data.get("stocks", []))
    if isinstance(stocks, dict):
        stocks = list(stocks.values())
    print(f"Loaded {len(stocks)} stocks")
    return stocks, data.get("scan_date", data.get("generated_at", "unknown"))


def score_intraday(stock: dict) -> dict:
    """
    4-dimensional intraday scoring: momentum, volume, breakout, gap.
    Returns enriched stock dict with intraday score.
    """
    change_pct = stock.get("change_pct", 0) or 0
    close = stock.get("close", 0) or 0
    rsi = stock.get("rsi", 50) or 50
    vol_ratio = stock.get("vol_ratio", 1.0) or 1.0
    scores = stock.get("scores", stock.get("dimensions", {}))

    # 1. Momentum score (0-100): based on change_pct and RSI
    if change_pct >= 8:
        momentum = 95
    elif change_pct >= 6:
        momentum = 85
    elif change_pct >= 4:
        momentum = 70
    elif change_pct >= 3:
        momentum = 55
    else:
        momentum = 30

    # Adjust with RSI
    if rsi > 80:
        momentum = max(momentum - 10, 20)
    elif rsi > 70:
        momentum = min(momentum + 5, 100)
    elif rsi > 60:
        momentum = min(momentum + 2, 100)

    # 2. Volume score (0-100)
    if vol_ratio >= 5:
        vol_score = 95
    elif vol_ratio >= 3:
        vol_score = 85
    elif vol_ratio >= 2:
        vol_score = 75
    elif vol_ratio >= 1.5:
        vol_score = 60
    elif vol_ratio >= 1.0:
        vol_score = 40
    else:
        vol_score = 20

    # 3. Breakout score (0-100): based on technical score from scan
    tech_score = scores.get("technical", 50)
    if isinstance(tech_score, (int, float)):
        breakout = tech_score
    else:
        breakout = 50

    # 4. Gap score (0-100): based on change magnitude
    if change_pct >= 8:
        gap = 90
    elif change_pct >= 6:
        gap = 75
    elif change_pct >= 4:
        gap = 60
    else:
        gap = 40

    # Weighted total (momentum: 30%, volume: 25%, breakout: 25%, gap: 20%)
    total = (momentum * 0.30 + vol_score * 0.25 + breakout * 0.25 + gap * 0.20)

    # Momentum label
    if momentum >= 85:
        mom_label = "極強"
    elif momentum >= 70:
        mom_label = "強"
    elif momentum >= 50:
        mom_label = "中"
    else:
        mom_label = "弱"

    # Volume label
    if vol_ratio and vol_ratio >= 3:
        vol_label = "極度放大"
    elif vol_ratio and vol_ratio >= 2:
        vol_label = "放大"
    elif vol_ratio and vol_ratio >= 1.5:
        vol_label = "略增"
    else:
        vol_label = "正常"

    # Breakout label
    if breakup_score := scores.get("technical", 50):
        if breakout >= 85:
            brk_label = "強勢突破"
        elif breakout >= 70:
            brk_label = "多頭排列"
        elif breakout >= 55:
            brk_label = "接近前高"
        else:
            brk_label = "區間整理"
    else:
        brk_label = "區間整理"

    # Entry / target / stop_loss
    entry = close
    target = round(close * 1.03, 2)
    stop_loss = round(close * 0.97, 2)
    if close > 100:
        target = round(close * 1.02, 2)
        stop_loss = round(close * 0.98, 2)

    # Dimensions dict
    dimensions = {
        "technical": round(breakout, 2),
        "chips": scores.get("chips", 50),
        "fundamental": scores.get("fundamental", 50),
        "news": scores.get("news", 50),
        "sentiment": scores.get("sentiment", 50),
        "profit_space": scores.get("profit_space", 50) if "profit_space" in scores else 50,
        "total": round(total, 2),
    }

    return {
        **stock,
        "intra_score": round(total, 2),
        "entry": entry,
        "target": target,
        "stop_loss": stop_loss,
        "details": {
            "momentum": mom_label,
            "vol_ratio": vol_label,
            "breakout": brk_label,
        },
        "dimensions": dimensions,
    }


def main():
    tz_taipei = timezone(timedelta(hours=8))
    now = datetime.now(tz_taipei)
    scan_date = now.strftime("%Y%m%d")
    scan_time = now.strftime("%H:%M:%S")

    # Load scan data
    stocks, source_date = load_scan_data()

    # Filter by change_pct
    qualified = []
    for s in stocks:
        cp = s.get("change_pct", 0) or 0
        if MIN_CHANGE_PCT <= cp <= MAX_CHANGE_PCT:
            qualified.append(s)

    print(f"Qualified: {len(qualified)} stocks ({MIN_CHANGE_PCT}-{MAX_CHANGE_PCT}% change)")

    # Score each qualified stock
    scored = [score_intraday(s) for s in qualified]

    # Sort by intra_score descending
    scored.sort(key=lambda x: x["intra_score"], reverse=True)

    # Build output stocks list (all qualified, sorted)
    output_stocks = []
    for s in scored:
        stock = s
        name = stock.get("stock_name", stock.get("name", ""))
        # Normalize name: strip trailing 股份有限公司
        if name.endswith("股份有限公司"):
            name = name[:-6]

        entry = stock.get("entry", stock.get("close", 0))
        close_val = stock.get("close", 0) or 0
        cp_val = stock.get("change_pct", 0) or 0
        # Compute prev_close from close + change_pct so the two are distinct
        if cp_val != 0 and close_val != 0:
            prev_close_val = round(close_val / (1 + cp_val / 100), 2)
        else:
            prev_close_val = close_val

        output_stocks.append({
            "stock_id": str(stock.get("stock_id", "")),
            "name": name,
            "sector": stock.get("sector_name", stock.get("sector", "")),
            "score": stock["intra_score"],
            "total_score": stock["intra_score"],
            "entry": entry,
            "target": stock.get("target", round(entry * 1.03, 2)),
            "stop_loss": stock.get("stop_loss", round(entry * 0.97, 2)),
            "change_pct": cp_val,
            "details": stock.get("details", {}),
            "dimensions": stock.get("dimensions", {}),
            "live": {
                "current": close_val,
                "open": close_val,  # fallback: same as close
                "high": close_val,
                "low": close_val,
                "prev_close": prev_close_val,
                "volume": stock.get("volume", 0),
                "change_pct": cp_val,
                "time": scan_time,
                "date": scan_date,
                "source": "scan_fallback",
            },
        })

    # Build output
    output = {
        "scan_type": "intraday_daytrade",
        "scanned_at": now.strftime("%Y-%m-%d %H:%M:%S"),
        "scanned_count": len(stocks),
        "qualified_count": len(output_stocks),  # total qualified
        "data_note": f"scan_result.json fallback (TWSE API + yfinance blocked); Top 5 from {len(output_stocks)} qualified stocks; {MIN_CHANGE_PCT}-{MAX_CHANGE_PCT}% change filter",
        "stocks": output_stocks[:5],
    }

    # Write output
    out_dir = "/home/nebula/projects/juststarlight66-oss/taiwan-stock-radar/public/data"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "intraday.json")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Written {len(output_stocks)} stocks to {out_path}")
    print(f"Top 5:")
    for i, s in enumerate(output_stocks[:5]):
        print(f"  {i+1}. {s['stock_id']} {s['name']} score={s['score']} change={s['change_pct']}%")

    # Deploy to gh-pages
    deploy_to_gh_pages(out_path, now)

    return 0


def deploy_to_gh_pages(local_path: str, now: datetime):
    """Commit intraday.json to main branch. deploy.yml handles gh-pages push."""
    import subprocess
    import shutil

    repo_dir = "/home/nebula/projects/juststarlight66-oss/taiwan-stock-radar"
    target_rel = "public/data/intraday.json"

    try:
        # The file is already at the right path (same file). Just commit.
        subprocess.run(
            ["git", "-C", repo_dir, "add", target_rel],
            capture_output=True, text=True, timeout=10
        )
        commit_result = subprocess.run(
            ["git", "-C", repo_dir, "commit", "-m",
             f"intraday scan {now.strftime('%Y-%m-%d %H:%M')} CST"],
            capture_output=True, text=True, timeout=10
        )

        # Only push if there were changes
        if "nothing to commit" in commit_result.stdout + commit_result.stderr:
            print("[deploy] No changes to commit (intraday.json unchanged)")
            return

        push_result = subprocess.run(
            ["git", "-C", repo_dir, "push", "origin", "main"],
            capture_output=True, text=True, timeout=60
        )

        if push_result.returncode == 0:
            print(f"[deploy] Pushed to main branch -> deploy.yml will handle gh-pages")
        else:
            print(f"[deploy] Push failed: {push_result.stderr.strip()}")

    except Exception as e:
        print(f"[deploy] ERROR: {e}")


if __name__ == "__main__":
    sys.exit(main())
