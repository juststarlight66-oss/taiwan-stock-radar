#!/usr/bin/env python3
"""
track_intraday_predictions.py — T+1/T+3/T+5 tracking for intraday scan picks.

Modes:
  capture — Read intraday.json from gh-pages, capture today's top 5 picks
  verify  — Check pending predictions against yfinance close prices
  stats   — Print win-rate summary

Data file: data/intraday_predictions_history.json on gh-pages
"""

import json, os, sys, warnings
from datetime import datetime, timedelta, timezone, date
from urllib.request import urlretrieve, urlopen, Request
warnings.filterwarnings("ignore")

TW_TZ = timezone(timedelta(hours=8))

try:
    import yfinance as yf
except ImportError:
    yf = None

GH_PAGES = "https://juststarlight66-oss.github.io/taiwan-stock-radar"

# ── Helpers ────────────────────────────────────────────────────────────

def today_tw() -> date:
    return datetime.now(TW_TZ).date()

def date_from_str(s: str) -> date:
    return datetime.strptime(s.strip(), "%Y%m%d").date()

def date_to_str(d: date) -> str:
    return d.strftime("%Y%m%d")

def yf_ticker(stock_id: str) -> str:
    return f"{stock_id.strip().zfill(6)}.TW"

def http_get(url: str, retries: int = 3):
    for attempt in range(retries):
        try:
            req = Request(url, headers={"User-Agent": "Nebula/intraday-tracker"})
            with urlopen(req, timeout=20) as resp:
                return json.loads(resp.read().decode())
        except Exception as e:
            if attempt == retries - 1:
                print(f"  [WARN] Failed {url}: {e}")
                return None
            import time
            time.sleep(2 ** attempt)
    return None

def get_nth_trading_close(stock_id: str, scan_dt: date, n: int):
    """Return (close_price, date_str) for Nth trading day after scan_dt."""
    if yf is None:
        return None, None
    ticker_str = yf_ticker(stock_id)
    end_dt = scan_dt + timedelta(days=14)
    try:
        t = yf.Ticker(ticker_str)
        df = t.history(start=scan_dt.isoformat(), end=end_dt.isoformat(), auto_adjust=True)
        if df.empty:
            return None, None
        trading = df.index[(df["Volume"] > 0) & (df.index.date > scan_dt)]
        if len(trading) < n:
            return None, None
        target = trading[n - 1]
        return float(df.loc[target, "Close"]), target.date().strftime("%Y%m%d")
    except Exception as e:
        print(f"  [WARN] yfinance {ticker_str}: {e}")
        return None, None

def trim_name(name: str) -> str:
    """Strip common suffixes."""
    for suffix in ("股份有限公司", "科技股份有限公司", "電信股份有限公司"):
        if name.endswith(suffix):
            name = name[:-len(suffix)]
    return name

# ── Mode: capture ──────────────────────────────────────────────────────

def cmd_capture(intraday_path="public/data/intraday.json",
                history_path="public/data/intraday_predictions_history.json"):
    """Capture top 5 picks from intraday.json."""
    # Try local file first, then gh-pages
    data = None
    if os.path.exists(intraday_path):
        with open(intraday_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = http_get(f"{GH_PAGES}/data/intraday.json")

    if not data:
        print("[capture] ERROR: no intraday data found")
        return False

    stocks = data.get("stocks", [])
    top5 = stocks[:5]
    if not top5:
        print("[capture] ERROR: no stocks in intraday data")
        return False

    # Derive scan_date from scanned_at
    scanned_at = data.get("scanned_at", "")
    scan_date = scanned_at[:10].replace("-", "") if scanned_at else date_to_str(today_tw())

    print(f"[capture] scan_date={scan_date}, top5={len(top5)} stocks")

    entry = {
        "scan_date": scan_date,
        "captured_at": datetime.now(TW_TZ).isoformat(),
        "scan_type": "intraday_daytrade",
        "top5": [
            {
                "stock_id": s.get("stock_id", ""),
                "name": trim_name(s.get("name", "")),
                "entry_price": s.get("entry", 0),
                "change_pct": round(s.get("change_pct", 0), 2),
                "sector": s.get("sector", ""),
                "total_score": round(s.get("total_score", 0), 2),
            }
            for s in top5
        ],
        "t1_return": None, "t1_check_date": None,
        "t3_return": None, "t3_check_date": None,
        "t5_return": None, "t5_check_date": None,
        "win": None,
    }

    # Read existing history
    history = []
    if os.path.exists(history_path):
        with open(history_path, "r", encoding="utf-8") as f:
            history = json.load(f)

    # Dedup by scan_date
    history = [h for h in history if h.get("scan_date") != scan_date]
    history.append(entry)
    history.sort(key=lambda x: x.get("scan_date", ""), reverse=True)

    os.makedirs(os.path.dirname(history_path) or ".", exist_ok=True)
    with open(history_path, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)

    print(f"[capture] OK — {len(history)} total records, appended {scan_date}")


# ── Mode: verify ───────────────────────────────────────────────────────

def cmd_verify(history_path="public/data/intraday_predictions_history.json",
               output_path="intraday_predictions_history.json"):
    """Check pending predictions against yfinance close prices."""
    real_path = history_path
    if not os.path.exists(real_path):
        # Try gh-pages checkout path (CI)
        alt = "../gh-pages-data/data/intraday_predictions_history.json"
        if os.path.exists(alt):
            real_path = alt
        else:
            print(f"[verify] No history at {history_path} or {alt} — nothing to verify")
            return True

    with open(real_path, "r", encoding="utf-8") as f:
        history = json.load(f)

    today = today_tw()
    updated_count = 0

    for rec in history:
        scan_dt = date_from_str(rec["scan_date"])

        if rec.get("win") is not None:
            continue  # Already fully verified
        if scan_dt >= today:
            continue  # No T+1 data yet

        top5 = rec.get("top5", [])

        for n, key, label in [(1, "t1", "T+1"), (3, "t3", "T+3"), (5, "t5", "T+5")]:
            if rec.get(f"{key}_check_date") is not None:
                continue

            print(f"  [{rec['scan_date']}] checking {label} for {len(top5)} stocks...")
            returns = []
            any_fail = False

            for stock in top5:
                entry_price = stock.get("entry_price", 0)
                if entry_price <= 0:
                    any_fail = True
                    break
                sid = stock["stock_id"]
                close_px, check_date = get_nth_trading_close(sid, scan_dt, n)

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
            rec[f"{key}_return"] = avg_return
            rec[f"{key}_check_date"] = check_date or date_to_str(today)
            print(f"    → avg: {avg_return:+.2f}% ({check_date})")
            updated_count += 1

        # Win: T+1 return > 0 (intraday weighting: T+1 dominant at 60%)
        if rec.get("t1_return") is not None:
            t1 = rec["t1_return"] or 0
            t3 = rec.get("t3_return") or t1
            t5 = rec.get("t5_return") or t3
            composite = 0.6 * t1 + 0.25 * t3 + 0.15 * t5
            rec["win"] = composite > 0
            print(f"  [{rec['scan_date']}] WIN={rec['win']} composite={composite:+.2f}%")

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)

    print(f"[verify] OK — {updated_count} slots updated → {output_path}")
    return True


# ── Mode: stats ────────────────────────────────────────────────────────

def cmd_stats(history_path="public/data/intraday_predictions_history.json"):
    if not os.path.exists(history_path):
        alt = "../gh-pages-data/data/intraday_predictions_history.json"
        if os.path.exists(alt):
            history_path = alt
        else:
            print("[stats] No history found.")
            return

    with open(history_path, "r", encoding="utf-8") as f:
        history = json.load(f)

    completed = [r for r in history if r.get("win") is not None]
    pending = [r for r in history if r.get("win") is None]
    wins = [r for r in completed if r["win"]]

    print("=== Intraday Prediction Tracking Summary ===")
    print(f"Total scan days: {len(history)}")
    print(f"  Completed (verified): {len(completed)}")
    print(f"  Pending: {len(pending)}")
    if completed:
        rate = len(wins) / len(completed) * 100
        avg_t1 = round(sum((r.get("t1_return") or 0) for r in completed) / len(completed), 2)
        print(f"  Win rate: {len(wins)}/{len(completed)} = {rate:.1f}%")
        print(f"  Avg T+1: {avg_t1:+.2f}%")
    if pending:
        print(f"  Pending dates: {[r['scan_date'] for r in pending]}")


# ── CLI ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "capture"

    if mode == "capture":
        intraday_path = sys.argv[2] if len(sys.argv) > 2 else "public/data/intraday.json"
        hist_path = sys.argv[3] if len(sys.argv) > 3 else "public/data/intraday_predictions_history.json"
        cmd_capture(intraday_path, hist_path)

    elif mode == "verify":
        hist_path = sys.argv[2] if len(sys.argv) > 2 else "../gh-pages-data/data/intraday_predictions_history.json"
        out_path = sys.argv[3] if len(sys.argv) > 3 else "intraday_predictions_history.json"
        cmd_verify(hist_path, out_path)

    elif mode == "stats":
        hist_path = sys.argv[2] if len(sys.argv) > 2 else "public/data/intraday_predictions_history.json"
        cmd_stats(hist_path)

    else:
        print(f"Usage: {sys.argv[0]} [capture|verify|stats] [args...]")
        sys.exit(1)
