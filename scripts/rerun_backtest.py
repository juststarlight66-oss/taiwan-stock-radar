#!/usr/bin/env python3
"""
rerun_backtest.py — Prediction backtest re-run engine.

Three modes:
  refresh  — Fill missing T+1/T+3/T+5 returns in predictions_history.json
  simulate — Re-score historical picks with alternative weight profiles
  report   — Generate backtest_comparison.json summary

All data fetched from gh-pages; outputs go to public/data/ for CI to commit.

Usage:
  python3 scripts/rerun_backtest.py refresh
  python3 scripts/rerun_backtest.py simulate
  python3 scripts/rerun_backtest.py report
"""

import json, os, sys, warnings, time
from datetime import datetime, timedelta, timezone, date
from urllib.request import urlretrieve, urlopen, Request
from typing import Dict, List, Optional, Tuple

warnings.filterwarnings("ignore")

try:
    import yfinance as yf
except ImportError:
    yf = None

TW_TZ = timezone(timedelta(hours=8))

BASE = "https://juststarlight66-oss.github.io/taiwan-stock-radar"
DATA  = f"{BASE}/data"
OUT_DIR = "public/data"

# ── Weight profiles to compare ──────────────────────────────────────────

BASELINE_WEIGHTS = {
    "bull":   {"tech": 0.30, "chips": 0.20, "fundamental": 0.15, "news": 0.20, "sentiment": 0.15},
    "range":  {"tech": 0.20, "chips": 0.30, "fundamental": 0.20, "news": 0.15, "sentiment": 0.15},
    "bear":   {"tech": 0.15, "chips": 0.15, "fundamental": 0.35, "news": 0.15, "sentiment": 0.20},
}

# Alternative profiles (same state labels, different weight ideas)
ALT_PROFILES = {
    "baseline": BASELINE_WEIGHTS,
    "tech-heavy": {
        "bull":  {"tech": 0.40, "chips": 0.15, "fundamental": 0.10, "news": 0.20, "sentiment": 0.15},
        "range": {"tech": 0.35, "chips": 0.20, "fundamental": 0.15, "news": 0.15, "sentiment": 0.15},
        "bear":  {"tech": 0.20, "chips": 0.15, "fundamental": 0.30, "news": 0.15, "sentiment": 0.20},
    },
    "chips-heavy": {
        "bull":  {"tech": 0.20, "chips": 0.35, "fundamental": 0.10, "news": 0.20, "sentiment": 0.15},
        "range": {"tech": 0.15, "chips": 0.40, "fundamental": 0.15, "news": 0.15, "sentiment": 0.15},
        "bear":  {"tech": 0.10, "chips": 0.25, "fundamental": 0.30, "news": 0.15, "sentiment": 0.20},
    },
    "fundamental-heavy": {
        "bull":  {"tech": 0.25, "chips": 0.15, "fundamental": 0.25, "news": 0.20, "sentiment": 0.15},
        "range": {"tech": 0.15, "chips": 0.15, "fundamental": 0.35, "news": 0.15, "sentiment": 0.20},
        "bear":  {"tech": 0.10, "chips": 0.10, "fundamental": 0.45, "news": 0.15, "sentiment": 0.20},
    },
    "balanced": {
        "bull":  {"tech": 0.20, "chips": 0.20, "fundamental": 0.20, "news": 0.20, "sentiment": 0.20},
        "range": {"tech": 0.20, "chips": 0.20, "fundamental": 0.20, "news": 0.20, "sentiment": 0.20},
        "bear":  {"tech": 0.20, "chips": 0.20, "fundamental": 0.20, "news": 0.20, "sentiment": 0.20},
    },
}

# ── Helpers ──────────────────────────────────────────────────────────────

def today_tw() -> date:
    return datetime.now(TW_TZ).date()

def date_from_str(s: str) -> date:
    return datetime.strptime(s.strip(), "%Y%m%d").date()

def http_get_json(url: str, retries: int = 3):
    for attempt in range(retries):
        try:
            req = Request(url, headers={"User-Agent": "Nebula/backtest"})
            with urlopen(req, timeout=20) as resp:
                return json.loads(resp.read().decode())
        except Exception as e:
            if attempt == retries - 1:
                print(f"  [WARN] Failed to fetch {url}: {e}")
                return None
            time.sleep(2 ** attempt)
    return None

def fetch_predictions_history() -> List[dict]:
    return http_get_json(f"{DATA}/predictions_history.json") or []

def fetch_scan_result(date_str: str) -> Optional[dict]:
    return http_get_json(f"{DATA}/scan_result_{date_str}.json")

def yf_ticker(stock_id: str) -> str:
    sid = stock_id.strip().zfill(6)
    return f"{sid}.TW"

def get_close_price(stock_id: str, target_date: date, lookback: int = 5) -> Optional[float]:
    """Get close price ON or nearest AFTER target_date. Returns None if not found."""
    if yf is None:
        return None
    ticker_str = yf_ticker(stock_id)
    start = target_date - timedelta(days=30)
    end = target_date + timedelta(days=lookback + 5)
    try:
        t = yf.Ticker(ticker_str)
        df = t.history(start=start.isoformat(), end=end.isoformat(), auto_adjust=True)
        if df.empty:
            return None
        # Find first trading day on or after target_date
        after = df.index[df.index.date >= target_date]
        if len(after) == 0:
            return None
        return float(df.loc[after[0], "Close"])
    except Exception:
        return None

def get_nth_trading_close(stock_id: str, scan_dt: date, n: int) -> Optional[Tuple[float, str]]:
    """Get close on Nth trading day after scan_dt. Returns (price, date_str)."""
    if yf is None:
        return None
    ticker_str = yf_ticker(stock_id)
    end = scan_dt + timedelta(days=14)
    try:
        t = yf.Ticker(ticker_str)
        df = t.history(start=scan_dt.isoformat(), end=end.isoformat(), auto_adjust=True)
        if df.empty:
            return None
        trading = df.index[(df["Volume"] > 0) & (df.index.date > scan_dt)]
        if len(trading) < n:
            return None
        target = trading[n - 1]
        return float(df.loc[target, "Close"]), target.date().strftime("%Y%m%d")
    except Exception:
        return None


# ── Re-score ─────────────────────────────────────────────────────────────

def score_stock(dims: dict, weights: dict) -> float:
    """Compute weighted total score from dimension dict and weight dict."""
    total = 0.0
    for key, w in weights.items():
        # Maps weight keys to dimension keys
        dim_key = {
            "tech": "technical", "chips": "chips",
            "fundamental": "fundamental", "news": "news",
            "sentiment": "sentiment",
        }.get(key, key)
        val = dims.get(dim_key, dims.get(key, 0)) or 0
        total += val * w
    return round(total, 2)

def re_rank_stocks(all_stocks: list, wt_profile: dict, market_state: str) -> list:
    """Re-score all stocks with given weight profile, return top-10."""
    state_weights = wt_profile.get(market_state, wt_profile.get("range", {}))
    if not state_weights:
        return []
    scored = []
    for s in all_stocks:
        dims = s.get("scores", s.get("dimensions", s))
        stock_id = s.get("stock_id", "")
        if not stock_id:
            continue
        ts = score_stock(dims, state_weights)
        scored.append({
            "stock_id": stock_id,
            "name": s.get("stock_name", s.get("name", "")),
            "total_score": ts,
            "close": s.get("close", 0),
            "sector": s.get("sector_name", s.get("sector", "")),
            "market": s.get("market", "TSE"),
        })
    scored.sort(key=lambda x: x["total_score"], reverse=True)
    return scored[:10]


# ── Mode: refresh ────────────────────────────────────────────────────────

def cmd_refresh():
    """Re-fetch all missing T+N prices in predictions_history.json."""
    history = fetch_predictions_history()
    if not history:
        print("[refresh] No predictions_history.json found on gh-pages.")
        return

    today = today_tw()
    updated = 0

    for rec in history:
        scan_dt = date_from_str(rec["scan_date"])
        if scan_dt >= today:
            continue
        if rec.get("win") is not None:
            continue  # already complete

        top10 = rec.get("top10", [])
        for n, key in [(1, "t1"), (3, "t3"), (5, "t5")]:
            if rec.get(f"{key}_check_date") is not None:
                continue
            returns = []
            for stock in top10:
                entry = stock.get("entry_price", 0)
                if entry <= 0:
                    continue
                result = get_nth_trading_close(stock["stock_id"], scan_dt, n)
                if result is None:
                    break
                close_px, check_date = result
                ret = round((close_px - entry) / entry * 100, 2)
                returns.append(ret)
                stock[f"{key}_close"] = round(close_px, 2)
                stock[f"{key}_return"] = ret
            else:
                if returns:
                    avg = round(sum(returns)/len(returns), 2)
                    rec[f"{key}_close"] = avg
                    rec[f"{key}_return"] = avg
                    rec[f"{key}_check_date"] = check_date
                    updated += 1
                    continue
            # Not all data available — stop at this T+N level
            break

        # Win check
        if rec.get("t1_return") is not None and rec.get("t3_return") is not None:
            t1 = rec["t1_return"] or 0
            t3 = rec["t3_return"] or t1
            t5 = rec.get("t5_return") or t3
            rec["win"] = (0.5*t1 + 0.3*t3 + 0.2*t5) > 0

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, "predictions_history.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)
    print(f"[refresh] OK — {updated} T+N slots filled → {out_path}")


# ── Mode: simulate ───────────────────────────────────────────────────────

def cmd_simulate():
    """Re-score historical picks with ALL alt profiles, compute win rates."""
    history = fetch_predictions_history()
    if not history:
        print("[simulate] No predictions_history.json — nothing to simulate")
        return

    # Collect scan dates where we have scan_result data too
    scan_dates = []
    for rec in history:
        if rec.get("win") is not None:
            sd = rec["scan_date"]
            scan_dates.append(sd)

    if not scan_dates:
        print("[simulate] No completed prediction days to simulate against")
        return

    print(f"[simulate] {len(scan_dates)} completed scan dates to simulate")

    # For each profile, for each scan date: re-score, pick top-10, fetch returns
    results = {}
    all_results = []  # flat list of {profile, scan_date, win, avg_return, ...}

    for profile_name, wt_profile in ALT_PROFILES.items():
        print(f"\n  Profile: {profile_name}")
        profile_wins = 0
        profile_total = 0
        profile_returns = []

        for sd in scan_dates[:30]:  # Cap at 30 to keep CI runtime reasonable
            scan_result = fetch_scan_result(sd)
            if scan_result is None:
                continue

            all_stocks = (scan_result.get("all_stock_scores")
                          or scan_result.get("stocks")
                          or scan_result.get("all_stocks", []))
            if not all_stocks:
                continue

            # Determine market state — use what was recorded
            hist_entry = next((r for r in history if r["scan_date"] == sd), {})
            state = hist_entry.get("state", "range")
            if state not in ("bull", "bear"):
                state = "range"

            new_top10 = re_rank_stocks(all_stocks, wt_profile, state)
            if len(new_top10) < 3:
                continue

            # Fetch T+1 returns for each pick
            scan_dt = date_from_str(sd)
            t1_returns = []
            for stock in new_top10:
                entry = stock.get("close", 0)
                if entry <= 0:
                    continue
                result = get_nth_trading_close(stock["stock_id"], scan_dt, 1)
                if result is None:
                    continue
                close_px, _ = result
                t1_returns.append(round((close_px - entry) / entry * 100, 2))

            if len(t1_returns) < 5:
                continue

            avg_t1 = round(sum(t1_returns) / len(t1_returns), 2)
            win = avg_t1 > 0
            if win:
                profile_wins += 1
            profile_total += 1
            profile_returns.append(avg_t1)

        if profile_total > 0:
            win_rate = round(profile_wins / profile_total * 100, 1)
            avg_return = round(sum(profile_returns) / len(profile_returns), 2)
            results[profile_name] = {"win_rate": win_rate, "avg_return": avg_return,
                                     "total": profile_total, "wins": profile_wins}
            print(f"    win_rate={win_rate}%  avg_return={avg_return:+.2f}%  n={profile_total}")

    # Build comparison output
    comparison = {
        "generated_at": datetime.now(TW_TZ).isoformat(),
        "scan_dates_used": len(scan_dates[:30]),
        "profiles": [
            {"name": name, **stats}
            for name, stats in sorted(results.items(), key=lambda x: x[1]["win_rate"], reverse=True)
        ],
        "baseline": results.get("baseline", {}),
        "top_profile": max(results, key=lambda p: results[p]["win_rate"]) if results else None,
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, "backtest_comparison.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(comparison, f, ensure_ascii=False, indent=2)
    print(f"\n[simulate] OK — saved to {out_path}")
    print(f"  Top profile: {comparison['top_profile']}")


# ── Mode: report ─────────────────────────────────────────────────────────

def cmd_report():
    """Generate a consolidated backtest report JSON."""
    history = fetch_predictions_history()
    if not history:
        print("[report] No predictions_history.json")
        return

    completed = [r for r in history if r.get("win") is not None]
    wins = [r for r in completed if r["win"]]

    # Overall stats
    report = {
        "generated_at": datetime.now(TW_TZ).isoformat(),
        "total_days": len(history),
        "completed_days": len(completed),
        "pending_days": len(history) - len(completed),
        "overall_win_rate": round(len(wins)/len(completed)*100, 1) if completed else 0,
        "avg_t1_return": round(sum(r.get("t1_return", 0) or 0 for r in completed)/len(completed), 2) if completed else 0,
        "avg_t3_return": round(sum(r.get("t3_return", 0) or 0 for r in completed)/len(completed), 2) if completed else 0,
        "avg_t5_return": round(sum(r.get("t5_return", 0) or 0 for r in completed)/len(completed), 2) if completed else 0,
        "by_state": {},
        "daily_returns": [],
        "best_day": None,
        "worst_day": None,
    }

    for state in ("bull", "range", "bear"):
        sub = [r for r in completed if r.get("state") == state]
        if sub:
            w = [r for r in sub if r["win"]]
            report["by_state"][state] = {
                "days": len(sub),
                "wins": len(w),
                "win_rate": round(len(w)/len(sub)*100, 1),
                "avg_t1": round(sum(r.get("t1_return", 0) or 0 for r in sub)/len(sub), 2),
            }

    for r in completed:
        report["daily_returns"].append({
            "scan_date": r["scan_date"],
            "state": r.get("state", "?"),
            "t1": r.get("t1_return"),
            "t3": r.get("t3_return"),
            "t5": r.get("t5_return"),
            "win": r["win"],
        })

    if report["daily_returns"]:
        best = max(report["daily_returns"], key=lambda x: x["t1"] or -999)
        worst = min(report["daily_returns"], key=lambda x: x["t1"] or 999)
        report["best_day"] = best["scan_date"]
        report["worst_day"] = worst["scan_date"]

    # Progress toward 70% target
    target = 70.0
    current = report["overall_win_rate"]
    report["target_gap"] = round(target - current, 1)
    report["on_track"] = current >= target

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, "backtest_report.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"[report] OK — saved to {out_path}")
    print(f"  Win rate: {report['overall_win_rate']}%  Target gap: {report['target_gap']}%")


# ── CLI ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "report"
    if mode == "refresh":
        cmd_refresh()
    elif mode == "simulate":
        cmd_simulate()
    elif mode == "report":
        cmd_report()
    elif mode == "all":
        cmd_refresh()
        cmd_simulate()
        cmd_report()
    else:
        print(f"Usage: {sys.argv[0]} [refresh|simulate|report|all]")
        sys.exit(1)
