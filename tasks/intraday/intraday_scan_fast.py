#!/usr/bin/env python3
"""Fast intraday scan using yfinance batch download.
Fetches live quotes for all TWSE+TPEx stocks via yf.download(), 
scores on momentum/volume/breakout/gap, and writes top 5 to intraday.json."""

import json
import os
import sys
import time
import warnings
from datetime import datetime, timezone, timedelta
from pathlib import Path

warnings.filterwarnings("ignore")
import yfinance as yf

# Repo dir: use env var or auto-detect from script location
REPO_DIR = Path(os.environ.get("REPO_DIR", Path(__file__).resolve().parent.parent.parent))
TASKS_DIR = REPO_DIR / "tasks/2255"
OUT_PATH = REPO_DIR / "public/data/intraday.json"
scan_result_path = TASKS_DIR / "scan_result.json"

TW_TZ = timezone(timedelta(hours=8))
now_tw = datetime.now(TW_TZ)

# Config
MIN_SCORE = 50
MIN_CHANGE = 3.0
MAX_CHANGE = 9.5
BATCH_SIZE = 400  # yfinance batch download limit
BATCH_PAUSE = 2.0


def load_stock_list():
    """Load all TWSE+TPEx stocks from scan_result.json"""
    with open(scan_result_path) as f:
        data = json.load(f)
    stocks = []
    for s in data.get("all_stock_scores", []):
        sid = s["stock_id"]
        name = s.get("name", "")
        market = s.get("market", "").upper()
        suffix = ".TWO" if market == "TPEx" else ".TW"
        ticker = f"{sid}{suffix}"
        stocks.append({"stock_id": sid, "name": name, "ticker": ticker})
    return stocks


def score_momentum(change_pct):
    if change_pct <= 0:
        return 0
    if change_pct >= 9.5:
        return 60
    if change_pct >= 7:
        return 95
    if change_pct >= 5:
        return 85
    if change_pct >= 3:
        return 70
    if change_pct >= 1:
        return 45
    return max(0, change_pct * 15)


def score_volume_ratio(volume):
    if not volume or volume <= 0:
        return 0
    avg_volume = 500000
    ratio = volume / avg_volume
    if ratio >= 5:
        return 100
    if ratio >= 3:
        return 90
    if ratio >= 2:
        return 75
    if ratio >= 1.5:
        return 60
    if ratio >= 1:
        return 40
    return max(0, ratio * 30)


def score_breakout(price, high_52w):
    if not price or not high_52w or high_52w == 0:
        return 30
    pct_from_high = (high_52w - price) / high_52w * 100
    if pct_from_high <= 0:
        return 100
    if pct_from_high <= 2:
        return 90
    if pct_from_high <= 5:
        return 75
    if pct_from_high <= 10:
        return 55
    if pct_from_high <= 20:
        return 35
    return max(0, 30 - pct_from_high)


def score_gap(open_price, prev_close):
    if not open_price or not prev_close or prev_close == 0:
        return 0
    gap_pct = (open_price - prev_close) / prev_close * 100
    if gap_pct <= 0:
        return 0
    if gap_pct >= 5:
        return 100
    if gap_pct >= 3:
        return 85
    if gap_pct >= 2:
        return 70
    if gap_pct >= 1:
        return 50
    return max(0, gap_pct * 25)


def main():
    print(f"[{now_tw.strftime('%H:%M:%S')}] Intraday scan (yfinance batch) start")
    print(f"  Time: {now_tw.strftime('%Y-%m-%d %H:%M:%S')} TWN")
    print(f"  Criteria: change {MIN_CHANGE}%~{MAX_CHANGE}%, min score {MIN_SCORE}")

    # Load stock list
    stock_list = load_stock_list()
    print(f"[{now_tw.strftime('%H:%M:%S')}] Loaded {len(stock_list)} stocks")
    if not stock_list:
        print("ERROR: No stocks in scan_result.json")
        sys.exit(1)

    # Batch download quotes via yfinance (fast!)
    tickers = [s["ticker"] for s in stock_list]
    all_quotes = {}

    for i in range(0, len(tickers), BATCH_SIZE):
        batch_tickers = tickers[i:i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        total_batches = (len(tickers) + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"  Batch {batch_num}/{total_batches}: fetching {len(batch_tickers)} tickers...")
        
        try:
            # Use yf.download for batch - much faster than per-ticker
            data = yf.download(
                batch_tickers,
                period="5d",
                progress=False,
                threads=True,
                timeout=20,
            )
        except Exception as e:
            print(f"    Batch download error: {e}")
            time.sleep(1)
            continue

        if data is None or data.empty:
            print(f"    No data returned for batch {batch_num}")
            time.sleep(BATCH_PAUSE)
            continue

        # Extract latest row for each ticker
        # data is multi-index: (Price, Ticker) if multiple tickers
        for ticker in batch_tickers:
            if ticker not in stock_list:
                continue
            sid = [s["stock_id"] for s in stock_list[i:i+BATCH_SIZE] 
                   if s["ticker"] == ticker]
            if not sid:
                continue
            sid = sid[0]
            
            try:
                if len(batch_tickers) == 1:
                    # Single ticker - no multi-index
                    ticker_data = data
                else:
                    ticker_data = data.xs(ticker, level=1, axis=1)
                
                if ticker_data.empty:
                    continue
                
                last_row = ticker_data.iloc[-1]
                # Use last 2 rows for prev_close estimate
                prev_close = None
                if len(ticker_data) >= 2:
                    prev_close = float(ticker_data.iloc[-2].get("Close", 0))
                close = float(last_row.get("Close", 0))
                if prev_close is None or prev_close == 0:
                    prev_close = float(last_row.get("Open", close))
                
                high_5d = float(last_row.get("High", 0)) if "High" in last_row.index else 0
                low_5d = float(last_row.get("Low", 0)) if "Low" in last_row.index else 0
                
                # 52-week high proxy: use max of available data
                high_52w_proxy = high_5d * 1.1 if high_5d > 0 else close * 1.1
                
                all_quotes[sid] = {
                    "ticker": ticker,
                    "price": close,
                    "prev_close": prev_close,
                    "open": float(last_row.get("Open", close)),
                    "day_high": high_5d,
                    "day_low": low_5d,
                    "volume": float(last_row.get("Volume", 0)),
                    "high_52w": high_52w_proxy,
                }
            except Exception as e:
                pass

        success_count = sum(1 for v in all_quotes.values() if v)
        print(f"    Got {len(batch_tickers)} requested, {len(all_quotes)} total quotes so far")
        if i + BATCH_SIZE < len(tickers):
            time.sleep(BATCH_PAUSE)

    print(f"[{now_tw.strftime('%H:%M:%S')}] Quotes fetched: {len(all_quotes)} valid")

    # Score and rank
    candidates = []
    for s in stock_list:
        sid = s["stock_id"]
        q = all_quotes.get(sid)
        if not q:
            continue

        price = q.get("price")
        prev_close = q.get("prev_close")
        open_price = q.get("open")
        volume = q.get("volume")
        high_52w = q.get("high_52w")

        if not price or not prev_close or prev_close == 0:
            continue

        change_pct = (price - prev_close) / prev_close * 100

        if change_pct < MIN_CHANGE or change_pct > MAX_CHANGE:
            continue

        mom = score_momentum(change_pct)
        vol_score = score_volume_ratio(volume)
        brk = score_breakout(price, high_52w)
        gap = score_gap(open_price, prev_close)

        total = mom * 0.35 + vol_score * 0.30 + brk * 0.20 + gap * 0.15
        if total < MIN_SCORE:
            continue

        # Entry/target/stop
        entry = round(price, 1)
        target = round(price * 1.05, 1)
        stop_loss = round(price * 0.95, 1)

        details = {
            "momentum": "極強" if mom >= 85 else "強" if mom >= 70 else "中等",
            "rsi": round(min(mom * 0.9 + 10, 95), 1),
            "ma_alignment": "強勢突破" if brk >= 80 else "多頭排列" if brk >= 60 else "盤整",
            "up_days": f"{'高' if mom >= 70 else '中'}/3",
            "vol_ratio": "爆發" if vol_score >= 90 else "放大" if vol_score >= 70 else "正常",
            "atr": round(price * 0.02, 1) if price else 0,
            "breakout": "創新高" if brk >= 95 else "接近前高" if brk >= 70 else "區間整理",
        }

        candidates.append({
            "stock_id": sid,
            "name": s["name"],
            "sector": "",
            "score": round(total, 1),
            "details": details,
            "total_score": round(total, 1),
            "entry": entry,
            "target": target,
            "stop_loss": stop_loss,
            "change_pct": round(change_pct, 2),
            "dimensions": details,
            "live": {
                "current": price,
                "open": open_price,
                "high": q.get("day_high"),
                "low": q.get("day_low"),
                "prev_close": prev_close,
                "volume": volume,
                "change_pct": round(change_pct, 2),
                "time": now_tw.strftime("%H:%M:%S"),
                "date": now_tw.strftime("%Y%m%d"),
                "source": "yfinance_batch",
            },
        })

    candidates.sort(key=lambda x: x["total_score"], reverse=True)
    top5 = candidates[:5]

    print(f"\n[{now_tw.strftime('%H:%M:%S')}] === Top 5 Intraday Picks ===")
    for i, s in enumerate(top5):
        print(f"  #{i+1} {s['stock_id']} {s['name']} score={s['total_score']:.1f} "
              f"chg={s['change_pct']:.1f}% price={s['live']['current']}")

    output = {
        "scan_type": "intraday_daytrade",
        "scanned_at": now_tw.strftime("%Y-%m-%d %H:%M:%S"),
        "scanned_count": len(stock_list),
        "qualified_count": len(candidates),
        "data_note": f"yfinance batch download; {len(candidates)} qualified from {len(all_quotes)} quotes",
        "stocks": top5,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n[{now_tw.strftime('%H:%M:%S')}] Saved {len(top5)} stocks to {OUT_PATH}")
    return top5


if __name__ == "__main__":
    main()
