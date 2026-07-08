#!/usr/bin/env python3
"""
gen_intraday_from_scan.py - Fallback intraday.json generator
Reads scan_result.json, filters 3-9.5% gainers, scores on 4 dimensions
(momentum/volume/breakout/gap), outputs top 5 intraday.json
"""

import json
import os
import sys
from datetime import datetime

REPO_DIR = os.environ.get(
    "REPO_DIR", "/home/nebula/projects/juststarlight66-oss/taiwan-stock-radar"
)
PUBLIC_DATA = os.path.join(REPO_DIR, "public", "data")
SCAN_RESULT = os.path.join(PUBLIC_DATA, "scan_result.json")
OUTPUT_PATH = os.path.join(PUBLIC_DATA, "intraday.json")

# Filter: only stocks with 3% - 9.5% change (avoid limit-up outliers for day trade)
CHANGE_MIN = 3.0
CHANGE_MAX = 9.5
TOP_N = 5


def momentum_score(rsi, vol_ratio):
    """Score momentum based on RSI and volume ratio (0-100)."""
    score = 0
    # RSI component (0-50)
    if rsi is None:
        rsi = 50
    if rsi >= 75:
        score += 50
    elif rsi >= 65:
        score += 40
    elif rsi >= 55:
        score += 30
    elif rsi >= 45:
        score += 20
    else:
        score += 10

    # Volume ratio component (0-50)
    if vol_ratio is None:
        vol_ratio = 1.0
    if vol_ratio >= 3.0:
        score += 50
    elif vol_ratio >= 2.0:
        score += 40
    elif vol_ratio >= 1.5:
        score += 30
    elif vol_ratio >= 1.0:
        score += 20
    else:
        score += 10
    return score


def volume_score(vol_ratio):
    """Score volume expansion (0-100)."""
    if vol_ratio is None:
        return 40
    if vol_ratio >= 5.0:
        return 100
    elif vol_ratio >= 3.0:
        return 85
    elif vol_ratio >= 2.0:
        return 70
    elif vol_ratio >= 1.5:
        return 55
    elif vol_ratio >= 1.0:
        return 40
    else:
        return 25


def breakout_score(scores):
    """Score breakout based on existing scores (0-100)."""
    if scores is None:
        return 40
    # Weighted from existing dimensions
    technical = scores.get("technical", 50)
    chips = scores.get("chips", 50)
    return (technical * 0.6 + chips * 0.4)


def gap_score(change_pct, rsi):
    """Score gap/day-trade potential (0-100)."""
    score = 0
    # Change component (0-60)
    if change_pct >= 7:
        score += 60
    elif change_pct >= 5:
        score += 50
    elif change_pct >= 4:
        score += 40
    else:
        score += 30

    # RSI component (0-40): moderate-high RSI is good for day trade
    if rsi is None:
        rsi = 50
    if 65 <= rsi <= 80:
        score += 40
    elif 55 <= rsi <= 85:
        score += 30
    elif rsi > 85:
        score += 15  # overbought -> risk
    else:
        score += 15
    return score


def classify_momentum(rsi):
    """Classify momentum as 強/中/弱."""
    if rsi is None:
        return "中"
    if rsi >= 70:
        return "強"
    elif rsi >= 50:
        return "中"
    return "弱"


def classify_breakout(scores):
    """Classify breakout pattern."""
    if scores is None:
        return "區間整理"
    technical = scores.get("technical", 50)
    if technical >= 85:
        return "強勢突破"
    elif technical >= 70:
        return "多頭排列"
    elif technical >= 55:
        return "區間整理"
    return "弱勢"


def calculate_profit_space(entry, stop_loss, target):
    """Calculate profit space as (target - entry) / (entry - stop_loss)."""
    risk = entry - stop_loss
    reward = target - entry
    if risk <= 0:  # invalid
        return 30.0
    ratio = reward / risk
    if ratio >= 3:
        return 80.0
    elif ratio >= 2:
        return 60.0
    elif ratio >= 1.5:
        return 50.0
    elif ratio >= 1.0:
        return 40.0
    return 30.0


def main():
    if not os.path.exists(SCAN_RESULT):
        print(f"ERROR: scan_result.json not found at {SCAN_RESULT}", file=sys.stderr)
        sys.exit(1)

    with open(SCAN_RESULT) as f:
        data = json.load(f)

    all_stocks = data.get("all_stock_scores", [])
    print(f"Loaded {len(all_stocks)} stocks from scan_result.json")

    # Filter by change_pct (positive only - day trade "強勢股")
    qualified = []
    for s in all_stocks:
        cp = s.get("change_pct", 0)
        if cp is None or cp <= 0:
            continue
        if CHANGE_MIN <= cp <= CHANGE_MAX:
            qualified.append(s)

    print(f"Qualified (3-9.5% change): {len(qualified)} stocks")

    # Score and rank
    scored = []
    for s in qualified:
        rsi = s.get("rsi", 50)
        vol_ratio = s.get("vol_ratio", 1.0)
        change_pct = s.get("change_pct", 0)
        scores = s.get("scores", {})

        m_score = momentum_score(rsi, vol_ratio)
        v_score = volume_score(vol_ratio)
        b_score = breakout_score(scores)
        g_score = gap_score(change_pct, rsi)

        # Weighted total: momentum 30%, volume 25%, breakout 25%, gap 20%
        total = m_score * 0.30 + v_score * 0.25 + b_score * 0.25 + g_score * 0.20

        entry = s.get("entry_low") or s.get("close", 0)
        t1 = (s.get("targets") or {}).get("t1") or s.get("close", 0) * 1.03
        stop = s.get("stop_loss") or s.get("close", 0) * 0.95

        profit_space = calculate_profit_space(entry, stop, t1)

        scored.append({
            "stock_id": s["stock_id"],
            "name": s["name"],
            "sector": s.get("sector_name", ""),
            "score": round(total, 2),
            "total_score": round(total, 2),
            "entry": entry,
            "target": t1,
            "stop_loss": stop,
            "change_pct": change_pct,
            "details": {
                "momentum": classify_momentum(rsi),
                "vol_ratio": vol_ratio,
                "breakout": classify_breakout(scores),
            },
            "dimensions": {
                "technical": round(b_score, 1),
                "chips": round(scores.get("chips", 50), 1),
                "fundamental": round(scores.get("fundamental", 50), 1),
                "news": round(scores.get("news", 50), 1),
                "sentiment": round(scores.get("sentiment", 50), 1),
                "profit_space": round(profit_space, 1),
                "total": round(total, 2),
            },
            "live": {
                "current": s.get("close", 0),
                "open": s.get("close", 0),  # fallback (no intraday OHLC available)
                "high": s.get("close", 0),
                "low": s.get("close", 0),
                "prev_close": s.get("close", 0),
                "volume": s.get("volume", 0),
                "change_pct": change_pct,
                "time": datetime.now().strftime("%H:%M:%S"),
                "date": datetime.now().strftime("%Y%m%d"),
                "source": "scan_fallback",
            },
        })

    # Sort by total_score descending
    scored.sort(key=lambda x: x["total_score"], reverse=True)

    top = scored[:TOP_N]
    print(f"Top {TOP_N}:")
    for i, s in enumerate(top):
        print(
            f"  {i+1}. {s['stock_id']} {s['name']} "
            f"score={s['total_score']} change={s['change_pct']}%"
        )

    output = {
        "scan_type": "intraday_daytrade",
        "scanned_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "scanned_count": len(all_stocks),
        "qualified_count": len(scored),
        "data_note": (
            f"scan_result.json fallback (TWSE API + yfinance blocked); "
            f"{len(scored)} qualified from {len(all_stocks)} stocks; "
            f"{CHANGE_MIN}-{CHANGE_MAX}% change filter"
        ),
        "stocks": top,
    }

    os.makedirs(PUBLIC_DATA, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\nSaved {len(top)} stocks to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
