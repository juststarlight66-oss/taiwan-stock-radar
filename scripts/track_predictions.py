#!/usr/bin/env python3
"""
track_predictions.py — T+1/T+3/T+5 prediction tracking pipeline.

Modes:
  capture  — Read latest.json, record today's top 10 picks + market state
  verify   — Check pending predictions against actual yfinance close prices

predictions_history.json schema:
[
  {
    "scan_date": "20260711",
    "captured_at": "2026-07-11T13:30:00+08:00",
    "state": "bull",
    "weights": {"tech": 0.30, "chips": 0.20, ...},
    "top10": [
      {"stock_id": "1615", "name": "大山", "entry_price": 46.4, "change_pct": 2.32, "sector": "電器電纜"}
    ],
    "t1_close": null, "t1_return": null, "t1_check_date": null,
    "t3_close": null, "t3_return": null, "t3_check_date": null,
    "t5_close": null, "t5_return": null, "t5_check_date": null,
    "win": null
  }
]
"""

import json, os, sys, warnings
from datetime import datetime, timedelta, timezone, date
from collections import OrderedDict
warnings.filterwarnings("ignore")

TW_TZ = timezone(timedelta(hours=8))

try:
    import yfinance as yf
except ImportError:
    yf = None

# ── Helpers ────────────────────────────────────────────────────────────────

def today_tw() -> date:
    return datetime.now(TW_TZ).date()

def date_from_str(s: str) -> date:
    return datetime.strptime(s.strip(), "%Y%m%d").date()

def date_to_str(d: date) -> str:
    return d.strftime("%Y%m%d")

def is_trading_day(dt: date) -> bool:
    """Check by TAIEX volume (most reliable)."""
    if yf is None:
        return dt.weekday() < 5
    try:
        end = dt + timedelta(days=1)
        df = yf.download("^TWII", start=dt.isoformat(), end=end.isoformat(),
                         progress=False, auto_adjust=True)
        # yfinance returns multi-index columns for single ticker
        if isinstance(df.columns, type(pd.Index([]))):
            vol_col = df.columns.get_level_values(0)[0]  # fallback
        if df.empty:
            return False
        vol = df["Volume"].iloc[0] if "Volume" in df.columns else df.iloc[:, 5].iloc[0]
        return float(vol) > 0
    except Exception:
        return dt.weekday() < 5

import pandas as pd

def yf_ticker(stock_id: str, market: str) -> str:
    """Map market → yfinance suffix."""
    sid = stock_id.strip().zfill(6)
    if market in ("TSE", "TWSE"):
        return f"{sid}.TW"
    return f"{sid}.TWO"

def get_nth_trading_close(stock_id: str, market: str, scan_dt: date, n: int):
    """Get close price on the Nth trading day after scan_dt.
    n=1 → T+1, n=3 → T+3, n=5 → T+5.
    Returns (close_price, actual_date_str) or (None, None).
    """
    if yf is None:
        return None, None
    ticker_str = yf_ticker(stock_id, market)
    end_dt = scan_dt + timedelta(days=14)
    try:
        t = yf.Ticker(ticker_str)
        df = t.history(start=scan_dt.isoformat(), end=end_dt.isoformat(),
                       auto_adjust=True)
        if df.empty:
            return None, None
        # Find Nth trading day after scan_dt (exclude scan_dt itself)
        trading = df.index[(df["Volume"] > 0) & (df.index.date > scan_dt)]
        if len(trading) < n:
            return None, None
        target = trading[n - 1]
        return float(df.loc[target, "Close"]), target.date().strftime("%Y%m%d")
    except Exception as e:
        print(f"  [WARN] yfinance failed for {ticker_str}: {e}")
        return None, None


# ── Market State ────────────────────────────────────────────────────────────

try:
    # scan_market.py imports market_state; this path works when run from repo root
    sys.path.insert(0, "tasks/2255")
    from market_state import detect_market_state
    _HAS_MARKET_STATE = True
except ImportError:
    _HAS_MARKET_STATE = False

def get_market_state():
    if _HAS_MARKET_STATE:
        try:
            ms = detect_market_state()
            return ms.state, ms.weights
        except Exception:
            pass
    return "unknown", {}


# ── Mode: capture ──────────────────────────────────────────────────────────

def cmd_capture(latest_path="public/data/latest.json", history_path="public/data/predictions_history.json"):
    """Capture today's top 10 picks from latest.json."""
    if not os.path.exists(latest_path):
        print(f"[capture] ERROR: {latest_path} not found")
        return False

    with open(latest_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    top10 = data.get("top10", data.get("stocks", []))[:10]
    if not top10:
        print(f"[capture] ERROR: no top10 in {latest_path}")
        return False

    scan_date = data.get("scan_date", date_to_str(today_tw()))
    print(f"[capture] scan_date={scan_date}, top10={len(top10)} stocks")

    state, weights = get_market_state()
    print(f"[capture] market_state={state}  weights={weights}")

    entry = OrderedDict([
        ("scan_date", scan_date),
        ("captured_at", datetime.now(TW_TZ).isoformat()),
        ("state", state),
        ("weights", weights),
        ("top10", [
            {
                "stock_id": s.get("stock_id", ""),
                "name": s.get("stock_name", s.get("name", "")),
                "entry_price": s.get("close", s.get("entry_high", 0)),
                "change_pct": s.get("change_pct", 0),
                "sector": s.get("sector_name", s.get("sector", "")),
                "market": s.get("market", ""),
                "total_score": s.get("total_score", 0),
            }
            for s in top10
        ]),
        ("t1_close", None), ("t1_return", None), ("t1_check_date", None),
        ("t3_close", None), ("t3_return", None), ("t3_check_date", None),
        ("t5_close", None), ("t5_return", None), ("t5_check_date", None),
        ("win", None),
    ])

    # Read existing history
    history = []
    if os.path.exists(history_path):
        with open(history_path, "r", encoding="utf-8") as f:
            history = json.load(f)

    # Dedup by scan_date
    history = [h for h in history if h.get("scan_date") != scan_date]
    history.append(entry)

    # Sort by scan_date descending
    history.sort(key=lambda x: x.get("scan_date", ""), reverse=True)

    with open(history_path, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)

    print(f"[capture] OK — {len(history)} total records, appended {scan_date}")


# ── Mode: verify ───────────────────────────────────────────────────────────

def cmd_verify(history_path="public/data/predictions_history.json", output_path="predictions_history.json"):
    """Check pending predictions against market close prices.
    
    In CI (verify-predictions.yml): history_path points to gh-pages checkout,
    output_path is where the workflow expects the result.
    """
    if not os.path.exists(history_path):
        print(f"[verify] No history at {history_path} — nothing to verify")
        return True

    with open(history_path, "r", encoding="utf-8") as f:
        history = json.load(f)

    today = today_tw()
    updated_count = 0

    for rec in history:
        scan_dt = date_from_str(rec["scan_date"])

        # Skip if already fully verified (win is True/False)
        if rec.get("win") is not None:
            continue

        # Skip if scan_date is today (no T+1 data yet)
        if scan_dt >= today:
            continue  # too recent

        state_desc = rec.get("state", "?")
        top10 = rec.get("top10", [])

        for n, key, label in [
            (1, "t1", "T+1"),
            (3, "t3", "T+3"),
            (5, "t5", "T+5"),
        ]:
            if rec.get(f"{key}_check_date") is not None:
                continue  # already checked

            print(f"  [{rec['scan_date']}] checking {label} for {len(top10)} stocks...")

            returns = []
            any_fail = False
            for stock in top10:
                entry_price = stock.get("entry_price", 0)
                if entry_price <= 0:
                    continue
                sid = stock["stock_id"]
                market = stock.get("market", "TSE")
                close_px, check_date = get_nth_trading_close(sid, market, scan_dt, n)

                if close_px is None:
                    any_fail = True
                    break

                ret = round((close_px - entry_price) / entry_price * 100, 2)
                returns.append(ret)
                stock[f"{key}_close"] = round(close_px, 2)
                stock[f"{key}_return"] = ret

            if any_fail:
                print(f"    → data not available yet, deferring")
                continue

            avg_return = round(sum(returns) / len(returns), 2) if returns else 0
            rec[f"{key}_close"] = avg_return  # average close (for display)
            rec[f"{key}_return"] = avg_return
            rec[f"{key}_check_date"] = check_date or date_to_str(today)

            print(f"    → avg return: {avg_return:+.2f}% ({check_date})")
            updated_count += 1

        # Win check: T+1 return > 0
        if rec.get("t1_return") is not None and rec.get("t3_return") is not None:
            # Weighted: T+1 is more important (50%), T+3 (30%), T+5 (20%)
            t1 = rec["t1_return"] or 0
            t3 = rec["t3_return"] or t1  # fallback to t1 if t3 not computed
            t5 = rec["t5_return"] or t3
            composite = 0.5 * t1 + 0.3 * t3 + 0.2 * t5
            rec["win"] = composite > 0
            print(f"  [{rec['scan_date']}] WIN={rec['win']} composite={composite:+.2f}%")

    # Write output where the workflow expects it
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)

    print(f"[verify] OK — {updated_count} prediction slots updated → {output_path}")
    return True


# ── Stats mode ─────────────────────────────────────────────────────────────

def cmd_stats(history_path="public/data/predictions_history.json"):
    """Print win-rate summary from predictions history."""
    if not os.path.exists(history_path):
        print("[stats] No predictions history found.")
        return

    with open(history_path, "r", encoding="utf-8") as f:
        history = json.load(f)

    completed = [r for r in history if r.get("win") is not None]
    pending = [r for r in history if r.get("win") is None]
    wins = [r for r in completed if r["win"]]

    print(f"=== Prediction Tracking Summary ===")
    print(f"Total scan days tracked: {len(history)}")
    print(f"  Completed (verified): {len(completed)}")
    print(f"  Pending (not yet T+1): {len(pending)}")
    if completed:
        print(f"  Win rate: {len(wins)}/{len(completed)} = {len(wins)/len(completed)*100:.1f}%")
        # By market state
        for state in ("bull", "range", "bear"):
            subset = [r for r in completed if r.get("state") == state]
            if subset:
                w = [r for r in subset if r["win"]]
                avg_t1 = round(sum(r.get("t1_return", 0) or 0 for r in subset) / len(subset), 2)
                print(f"    {state}: {len(w)}/{len(subset)} = {len(w)/len(subset)*100:.1f}%  avg T+1={avg_t1:+.2f}%")

    if pending:
        print(f"\nPending dates: {[r['scan_date'] for r in pending]}")


# ── CLI ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "capture"

    if mode == "capture":
        latest_path = sys.argv[2] if len(sys.argv) > 2 else "public/data/latest.json"
        hist_path = sys.argv[3] if len(sys.argv) > 3 else "public/data/predictions_history.json"
        cmd_capture(latest_path, hist_path)

    elif mode == "verify":
        hist_path = sys.argv[2] if len(sys.argv) > 2 else "../gh-pages-data/data/predictions_history.json"
        out_path = sys.argv[3] if len(sys.argv) > 3 else "predictions_history.json"
        cmd_verify(hist_path, out_path)

    elif mode == "stats":
        hist_path = sys.argv[2] if len(sys.argv) > 2 else "public/data/predictions_history.json"
        cmd_stats(hist_path)

    elif mode == "test":
        # Quick test: capture from gh-pages latest.json then stats
        import urllib.request
        import subprocess
        url = "https://juststarlight66-oss.github.io/taiwan-stock-radar/data/latest.json"
        print(f"[test] Fetching {url} ...")
        urllib.request.urlretrieve(url, "/tmp/_test_latest.json")
        cmd_capture("/tmp/_test_latest.json", "/tmp/_test_history.json")
        cmd_stats("/tmp/_test_history.json")

    else:
        print(f"Usage: {sys.argv[0]} [capture|verify|stats|test] [args...]")
        sys.exit(1)
