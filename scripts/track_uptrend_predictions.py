#!/usr/bin/env python3
"""
track_uptrend_predictions.py — T+1/T+3/T+5 tracking for main-uptrend scan picks.

Modes:
  capture — Read main_uptrend_result.json from gh-pages, capture today's Top 40
  verify  — Check pending predictions against yfinance close prices
  stats   — Print win-rate summary

Data file: data/uptrend_predictions_history.json on gh-pages
"""
import json, os, sys, warnings
from datetime import datetime, timedelta, timezone, date
from urllib.request import urlopen, Request
from collections import OrderedDict
warnings.filterwarnings("ignore")

try:
    import yfinance as yf
except ImportError:
    yf = None

TW_TZ = timezone(timedelta(hours=8))
DATA_URL = "https://juststarlight66-oss.github.io/taiwan-stock-radar/data/main_uptrend_result.json"
OUT_DIR = "public/data"
HISTORY_FILE = "uptrend_predictions_history.json"

# ── Helpers ──────────────────────────────────────────────────────────────

def today_tw(): return datetime.now(TW_TZ).date()
def date_from_str(s):
    s = s.strip()
    if "-" in s and len(s) == 10:
        s = s.replace("-", "")
    return datetime.strptime(s, "%Y%m%d").date()
def date_to_str(d): return d.strftime("%Y%m%d")

def http_get_json(url, retries=3):
    for i in range(retries):
        try:
            req = Request(url, headers={"User-Agent": "Nebula/uptrend-tracker"})
            with urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            if i == retries - 1:
                print(f"  [WARN] Failed {url}: {e}")
                return None
            import time; time.sleep(2**i)
    return None

def yf_ticker(stock_id):
    """Infer yfinance ticker from TW stock ID. Try .TW first, fallback .TWO."""
    sid = stock_id.strip()
    if sid.endswith(".TW") or sid.endswith(".TWO"):
        return sid
    return f"{sid}.TW"  # default TSE

def get_nth_trading_close(stock_id, scan_dt, n):
    """Get close on Nth trading day after scan_dt. Returns (price, date_str)."""
    if yf is None:
        return None, None
    ticker = yf_ticker(stock_id)
    end_dt = scan_dt + timedelta(days=14)
    try:
        t = yf.Ticker(ticker)
        df = t.history(start=scan_dt.isoformat(), end=end_dt.isoformat(), auto_adjust=True)
        if df.empty:
            return None, None
        trading = df.index[(df["Volume"] > 0) & (df.index.date > scan_dt)]
        if len(trading) < n:
            return None, None
        target = trading[n - 1]
        return float(df.loc[target, "Close"]), target.date().strftime("%Y%m%d")
    except Exception as e:
        # Try TWO fallback
        if ticker == f"{stock_id}.TW":
            try:
                t2 = yf.Ticker(f"{stock_id}.TWO")
                df2 = t2.history(start=scan_dt.isoformat(), end=end_dt.isoformat(), auto_adjust=True)
                if df2.empty:
                    return None, None
                trading2 = df2.index[(df2["Volume"] > 0) & (df2.index.date > scan_dt)]
                if len(trading2) < n:
                    return None, None
                target2 = trading2[n - 1]
                return float(df2.loc[target2, "Close"]), target2.date().strftime("%Y%m%d")
            except Exception:
                pass
        return None, None


# ── Mode: capture ────────────────────────────────────────────────────────

def cmd_capture():
    data = http_get_json(DATA_URL)
    if not data:
        print("[capture] ERROR: Failed to fetch main_uptrend_result.json")
        return False

    top40 = data.get("top40", data.get("stocks", []))[:40]
    if not top40:
        print("[capture] ERROR: no top40 in data")
        return False

    scan_date = data.get("scan_date", date_to_str(today_tw())).replace("-", "")
    print(f"[capture] scan_date={scan_date}, top40={len(top40)} stocks")

    entry = OrderedDict([
        ("scan_date", scan_date),
        ("captured_at", datetime.now(TW_TZ).isoformat()),
        ("scan_type", "main_uptrend"),
        ("top40", [
            {
                "stock_id": s.get("stock_id", ""),
                "name": (s.get("name", "") or "").replace("股份有限公司", ""),
                "entry_price": s.get("close", 0),
                "change_pct": s.get("change_pct", 0),
                "total_score": s.get("total_score", 0),
                "signal_3": s.get("signal_3", False),
                "signal_1": s.get("signal_1", False),
                "chg_30d": s.get("chg_30d", 0),
                "capital_yi": s.get("capital_yi", 0),
            }
            for s in top40
        ]),
        ("t1_return", None), ("t1_check_date", None),
        ("t3_return", None), ("t3_check_date", None),
        ("t5_return", None), ("t5_check_date", None),
        ("win", None),
    ])

    os.makedirs(OUT_DIR, exist_ok=True)
    hist_path = os.path.join(OUT_DIR, HISTORY_FILE)
    history = []
    if os.path.exists(hist_path):
        with open(hist_path, "r", encoding="utf-8") as f:
            history = json.load(f)
    # Normalize existing entries with YYYY-MM-DD dates
    for h in history:
        if "-" in h.get("scan_date", ""):
            h["scan_date"] = h["scan_date"].replace("-", "")

    history = [h for h in history if h.get("scan_date") != scan_date]
    history.append(entry)
    history.sort(key=lambda x: x.get("scan_date", ""), reverse=True)

    with open(hist_path, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)

    print(f"[capture] OK — {len(history)} total records, appended {scan_date}")
    return True


# ── Mode: verify ─────────────────────────────────────────────────────────

def cmd_verify(hist_path=None, output_path=None):
    if hist_path is None:
        hist_path = os.path.join(OUT_DIR, HISTORY_FILE)
    if output_path is None:
        output_path = hist_path

    if not os.path.exists(hist_path):
        print(f"[verify] No history at {hist_path}")
        return True

    with open(hist_path, "r", encoding="utf-8") as f:
        history = json.load(f)

    today = today_tw()
    updated = 0

    for rec in history:
        sd = date_from_str(rec["scan_date"])
        if rec.get("win") is not None:
            continue
        if sd >= today:
            continue

        top40 = rec.get("top40", rec.get("top_stocks", []))
        for n, key, label in [(1, "t1", "T+1"), (3, "t3", "T+3"), (5, "t5", "T+5")]:
            if rec.get(f"{key}_check_date") is not None:
                continue
            returns = []
            any_fail = False
            for stock in top40:
                entry = stock.get("entry_price", 0)
                if entry <= 0:
                    continue
                close_px, check_date = get_nth_trading_close(stock["stock_id"], sd, n)
                if close_px is None:
                    any_fail = True
                    break
                ret = round((close_px - entry) / entry * 100, 2)
                returns.append(ret)
                stock[f"{key}_close"] = round(close_px, 2)
                stock[f"{key}_return"] = ret
            if any_fail:
                continue
            avg = round(sum(returns) / len(returns), 2) if returns else 0
            rec[f"{key}_return"] = avg
            rec[f"{key}_check_date"] = check_date or date_to_str(today)
            print(f"  [{rec['scan_date']}] {label} avg={avg:+.2f}% ({len(returns)} stocks)")
            updated += 1

        # Win: weighted composite > 0
        if rec.get("t1_return") is not None and rec.get("t3_return") is not None:
            t1 = rec["t1_return"] or 0
            t3 = rec["t3_return"] or t1
            t5 = rec.get("t5_return") or t3
            rec["win"] = (0.5*t1 + 0.3*t3 + 0.2*t5) > 0
            print(f"  [{rec['scan_date']}] WIN={rec['win']} composite={0.5*t1+0.3*t3+0.2*t5:+.2f}%")

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)

    print(f"[verify] OK — {updated} slots updated → {output_path}")
    return True


# ── Mode: stats ──────────────────────────────────────────────────────────

def cmd_stats(hist_path=None):
    if hist_path is None:
        hist_path = os.path.join(OUT_DIR, HISTORY_FILE)
    if not os.path.exists(hist_path):
        print("[stats] No history found.")
        return

    with open(hist_path, "r", encoding="utf-8") as f:
        history = json.load(f)

    completed = [r for r in history if r.get("win") is not None]
    pending = [r for r in history if r.get("win") is None]
    wins = [r for r in completed if r["win"]]

    print("=== Uptrend Prediction Tracking ===")
    print(f"Total scan days: {len(history)}")
    print(f"  Completed: {len(completed)}")
    print(f"  Pending: {len(pending)}")
    if completed:
        wr = len(wins)/len(completed)*100
        print(f"  Win rate: {len(wins)}/{len(completed)} = {wr:.1f}%")
        avg = lambda key: round(sum(r.get(key, 0) or 0 for r in completed)/len(completed), 2)
        print(f"  Avg T+1: {avg('t1_return'):+.2f}%  T+3: {avg('t3_return'):+.2f}%  T+5: {avg('t5_return'):+.2f}%")
        # Signal breakdown
        for sig in ("signal_3", "signal_1"):
            sub = [r for r in completed if any(s.get(sig) for s in r.get("top40", [])[:10])]
            if sub:
                w = [r for r in sub if r["win"]]
                print(f"    {sig}: {len(w)}/{len(sub)} = {len(w)/len(sub)*100:.1f}%")


# ── CLI ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "capture"
    if mode == "capture":
        cmd_capture()
    elif mode == "verify":
        hist = sys.argv[2] if len(sys.argv) > 2 else None
        out = sys.argv[3] if len(sys.argv) > 3 else None
        cmd_verify(hist, out)
    elif mode == "stats":
        hist = sys.argv[2] if len(sys.argv) > 2 else None
        cmd_stats(hist)
    else:
        print(f"Usage: {sys.argv[0]} [capture|verify|stats] [args...]")
        sys.exit(1)
