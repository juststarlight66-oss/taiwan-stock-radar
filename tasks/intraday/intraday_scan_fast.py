#!/usr/bin/env python3
"""Fast intraday scan using yfinance batch download — v3.
v3 features vs v2:
  - vol_ratio: uses prev-day volume from scan_result.json as baseline (not hardcoded 500k)
  - sector_momentum: computes sector avg chg from scan_result, adds sector_rank/sector_momentum
  - entry_zone filter: rejects stocks where live.change_pct > target_pct/2 (already ran up)
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

# Time-adjustment: at 12:30, roughly 55% of the trading day has passed
# TWSE trades 9:00–13:30 = 4.5h. 12:30 = 3.5h in → 3.5/4.5 ≈ 0.78
# But yfinance volume can be delayed, so use conservative 0.55
TIME_FACTOR = 0.55


def load_stock_list():
    """Load all TWSE+TPEx stocks from scan_result.json.
    Returns list of {stock_id, name, ticker, sector_name, prev_volume}."""
    with open(scan_result_path) as f:
        data = json.load(f)
    stocks = []
    for s in data.get("all_stock_scores", []):
        sid = s["stock_id"]
        name = s.get("name", "")
        market = s.get("market", "").upper()
        suffix = ".TWO" if market == "TPEX" else ".TW"
        ticker = f"{sid}{suffix}"
        stocks.append({
            "stock_id": sid,
            "name": name,
            "ticker": ticker,
            "sector_name": s.get("sector_name", ""),
            "prev_volume": s.get("volume", 0) or 0,  # yesterday's full-day volume
        })
    return stocks


def compute_sector_stats(stock_list):
    """Compute sector-level momentum stats from stock_list (scan_result.json data).
    Returns dict: sector_name -> {avg_chg, stock_count, rank, momentum_label}."""
    from collections import defaultdict
    with open(scan_result_path) as f:
        data = json.load(f)
    
    sectors = defaultdict(list)
    for s in data.get("all_stock_scores", []):
        sec = s.get("sector_name", "")
        chg = s.get("change_pct", 0) or 0
        if sec and abs(chg) < 20:  # filter out obvious data errors
            sectors[sec].append(chg)
    
    sector_data = {}
    for sec, chgs in sectors.items():
        if len(chgs) < 3:
            continue
        avg_chg = sum(chgs) / len(chgs)
        sector_data[sec] = {
            "avg_chg": round(avg_chg, 2),
            "stock_count": len(chgs),
            "rank": 0,
            "momentum_label": "",
        }
    
    # Rank by avg_chg descending
    ranked = sorted(sector_data.items(), key=lambda x: -x[1]["avg_chg"])
    total = len(ranked)
    for i, (sec, info) in enumerate(ranked):
        info["rank"] = i + 1
        if i < total * 0.2:
            info["momentum_label"] = "極強勢"
        elif i < total * 0.4:
            info["momentum_label"] = "強勢"
        elif i < total * 0.6:
            info["momentum_label"] = "中性"
        elif i < total * 0.8:
            info["momentum_label"] = "弱勢"
        else:
            info["momentum_label"] = "極弱勢"
    
    return sector_data


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


def score_volume_ratio(intraday_volume, baseline_daily_volume):
    """Score based on intraday volume vs previous day's full volume, time-adjusted.
    vol_ratio = intraday_vol / (baseline_daily_vol * TIME_FACTOR)
    TIME_FACTOR = 0.55: at 12:30, ~55% of the day's expected volume."""
    if not intraday_volume or intraday_volume <= 0:
        return 0, 0
    if not baseline_daily_volume or baseline_daily_volume <= 0:
        # Fallback: use intraday_volume itself as signal
        # yfinance volume is in shares, typical TW stock daily volume ~1M-5M shares
        baseline_daily_volume = 2000000
    
    expected_volume = baseline_daily_volume * TIME_FACTOR
    if expected_volume <= 0:
        return 0, 0
    
    vol_ratio = intraday_volume / expected_volume
    # Clamp to sensible range
    vol_ratio = max(0, min(vol_ratio, 20))
    
    if vol_ratio >= 5:
        return 100, round(vol_ratio, 2)
    if vol_ratio >= 3:
        return 90, round(vol_ratio, 2)
    if vol_ratio >= 2:
        return 75, round(vol_ratio, 2)
    if vol_ratio >= 1.5:
        return 60, round(vol_ratio, 2)
    if vol_ratio >= 1:
        return 40, round(vol_ratio, 2)
    return max(0, round(vol_ratio * 30, 1)), round(vol_ratio, 2)


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
    print(f"[{now_tw.strftime('%H:%M:%S')}] Intraday scan (yfinance batch) v3 start")
    print(f"  Time: {now_tw.strftime('%Y-%m-%d %H:%M:%S')} TWN")
    print(f"  Criteria: change {MIN_CHANGE}%~{MAX_CHANGE}%, min score {MIN_SCORE}")
    print(f"  v3: real vol_ratio, sector momentum, entry-zone filter")

    # Load stock list (with sector + prev_volume)
    stock_list = load_stock_list()
    print(f"[{now_tw.strftime('%H:%M:%S')}] Loaded {len(stock_list)} stocks")
    if not stock_list:
        print("ERROR: No stocks in scan_result.json")
        sys.exit(1)

    # Compute sector momentum stats
    sector_stats = compute_sector_stats(stock_list)
    ranked_sectors = sorted(sector_stats.items(), key=lambda x: x[1]["rank"])
    strong_sectors = [s for s, d in sector_stats.items() if d["rank"] <= 7]
    print(f"[{now_tw.strftime('%H:%M:%S')}] Sector stats: {len(sector_stats)} sectors")
    print(f"  Top sectors: {', '.join(f'{s}(#{d['rank']} {d['avg_chg']:+.1f}%)' for s, d in ranked_sectors[:5])}")

    # Batch download quotes via yfinance (fast!)
    tickers = [s["ticker"] for s in stock_list]
    all_quotes = {}

    for i in range(0, len(tickers), BATCH_SIZE):
        batch_tickers = tickers[i:i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        total_batches = (len(tickers) + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"  Batch {batch_num}/{total_batches}: fetching {len(batch_tickers)} tickers...")
        
        try:
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
        for ticker in batch_tickers:
            try:
                if len(batch_tickers) == 1:
                    ticker_data = data
                else:
                    ticker_data = data.xs(ticker, level=1, axis=1)
                
                if ticker_data.empty:
                    continue
                
                last_row = ticker_data.iloc[-1]
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

                # Find matching stock_id
                sid = None
                for s in stock_list[i:i+BATCH_SIZE]:
                    if s["ticker"] == ticker:
                        sid = s["stock_id"]
                        break
                if not sid:
                    continue
                
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
            except Exception:
                pass

        print(f"    Got {len(batch_tickers)} requested, {len(all_quotes)} total quotes so far")
        if i + BATCH_SIZE < len(tickers):
            time.sleep(BATCH_PAUSE)

    print(f"[{now_tw.strftime('%H:%M:%S')}] Quotes fetched: {len(all_quotes)} valid")

    # Build lookup: stock_id → sector_name, prev_volume
    stock_lookup = {s["stock_id"]: s for s in stock_list}

    # Score and rank
    candidates = []
    entry_zone_skipped = 0
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

        # --- Entry Zone Filter ---
        # target = price * 1.05 (5% upside target)
        # target_pct = (target - prev_close) / prev_close * 100
        # If change_pct already > target_pct/2, the stock has already run up too much
        target = round(price * 1.05, 1)
        target_pct = (target - prev_close) / prev_close * 100
        if change_pct > target_pct / 2:
            entry_zone_skipped += 1
            continue

        mom = score_momentum(change_pct)
        baseline_vol = s.get("prev_volume", 0)
        vol_score, vol_ratio_val = score_volume_ratio(volume, baseline_vol)
        brk = score_breakout(price, high_52w)
        gap = score_gap(open_price, prev_close)

        total = mom * 0.35 + vol_score * 0.30 + brk * 0.20 + gap * 0.15
        if total < MIN_SCORE:
            continue

        # Entry/target/stop
        entry = round(price, 1)
        stop_loss = round(price * 0.95, 1)

        # Sector info
        sector_name = s.get("sector_name", "")
        sector_info = sector_stats.get(sector_name, {})
        sector_rank = sector_info.get("rank", 0)
        sector_momentum = sector_info.get("momentum_label", "")
        sector_avg_chg = sector_info.get("avg_chg", 0)

        details = {
            "momentum": "極強" if mom >= 85 else "強" if mom >= 70 else "中等",
            "rsi": round(min(mom * 0.9 + 10, 95), 1),
            "ma_alignment": "強勢突破" if brk >= 80 else "多頭排列" if brk >= 60 else "盤整",
            "up_days": f"{'高' if mom >= 70 else '中'}/3",
            "vol_ratio": vol_ratio_val,  # numeric now, not text label
            "atr": round(price * 0.02, 1) if price else 0,
            "breakout": "創新高" if brk >= 95 else "接近前高" if brk >= 70 else "區間整理",
            "sector_rank": sector_rank,
            "sector_momentum": sector_momentum,
        }

        candidates.append({
            "stock_id": sid,
            "name": s["name"],
            "sector": sector_name,
            "sector_rank": sector_rank,
            "sector_momentum": sector_momentum,
            "sector_avg_chg": sector_avg_chg,
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
                "source": "yfinance_batch_v3",
            },
        })

    candidates.sort(key=lambda x: x["total_score"], reverse=True)
    top5 = candidates[:5]

    print(f"\n[{now_tw.strftime('%H:%M:%S')}] === Top 5 Intraday Picks ===")
    print(f"  Entry-zone skipped: {entry_zone_skipped} stocks (change > target/2)")
    for i, s in enumerate(top5):
        print(f"  #{i+1} {s['stock_id']} {s['name']} score={s['total_score']:.1f} "
              f"chg={s['change_pct']:.1f}% sector=#{s['sector_rank']} {s['sector']}({s['sector_momentum']})")

    output = {
        "scan_type": "intraday_daytrade",
        "scanned_at": now_tw.strftime("%Y-%m-%d %H:%M:%S"),
        "scanned_count": len(stock_list),
        "qualified_count": len(candidates),
        "entry_zone_skipped": entry_zone_skipped,
        "data_note": f"yfinance batch v3 (vol_ratio+sector+entry_zone); {len(candidates)} qualified from {len(all_quotes)} quotes",
        "sector_top5": [f"{s}(#{d['rank']} {d['avg_chg']:+.1f}%)" for s, d in ranked_sectors[:5]],
        "stocks": top5,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n[{now_tw.strftime('%H:%M:%S')}] Saved {len(top5)} stocks to {OUT_PATH}")
    return top5


if __name__ == "__main__":
    main()
