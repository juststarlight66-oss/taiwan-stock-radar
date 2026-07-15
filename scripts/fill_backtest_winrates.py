#!/usr/bin/env python3
"""Fill pending win rates in backtest.json using yfinance for T+N close prices.

Reads public/data/backtest.json, for each grouped_record with pending=True
periods, fetches T+N close prices via yfinance batch download, computes
win rates, and writes back.

Usage: uv run python scripts/fill_backtest_winrates.py
"""

import json
import os
import sys
from datetime import date, datetime, timedelta, timezone

import yfinance as yf
import pandas as pd

TW_TZ = timezone(timedelta(hours=8))


def date_from_str(s: str) -> date:
    s = s.strip()
    if "-" in s:
        return datetime.strptime(s, "%Y-%m-%d").date()
    return datetime.strptime(s, "%Y%m%d").date()


def get_nth_trading_close(stock_ids: list[str], scan_dt: date, n: int) -> dict[str, tuple[float | None, str | None]]:
    """Batch fetch T+N close prices for multiple stocks.

    Tries market suffixes TWSE (.TW) and TPEx (.TWO) for each stock.
    Returns {stock_id: (close_price, check_date_str)}.
    """
    results = {}
    end_dt = scan_dt + timedelta(days=21)

    # Build ticker lists for each market
    for suffix in [".TW", ".TWO"]:
        tickers = [f"{sid.strip().zfill(4)}{suffix}" for sid in stock_ids]
        try:
            data = yf.download(
                tickers,
                start=scan_dt.isoformat(),
                end=end_dt.isoformat(),
                progress=False,
                auto_adjust=True,
                group_by="ticker",
            )
            if data.empty:
                continue

            for ticker in tickers:
                if ticker not in data.columns.levels[0] if hasattr(data.columns, 'levels') and len(data.columns.levels) > 1 else data.columns:
                    continue
                try:
                    # yfinance multi-ticker: data[ticker]['Close'] or data[ticker].Close
                    if hasattr(data.columns, 'levels'):
                        df = data[ticker]
                    else:
                        df = data
                    if df.empty:
                        continue
                    # Find Nth trading day after scan_dt
                    trading = df.index[(df["Volume"] > 0) & (df.index.date > scan_dt)]
                    if len(trading) < n:
                        continue
                    target = trading[n - 1]
                    close_px = float(df.loc[target, "Close"])
                    check_date = target.date().strftime("%Y%m%d")
                    sid = ticker.split(".")[0]
                    results[sid] = (close_px, check_date)
                except Exception:
                    continue
        except Exception as e:
            print(f"  [WARN] batch download failed for suffix {suffix}: {e}")

    return results


def fill_pending():
    backtest_path = "public/data/backtest.json"
    if not os.path.exists(backtest_path):
        print(f"ERROR: {backtest_path} not found")
        return

    with open(backtest_path, "r", encoding="utf-8") as f:
        bt = json.load(f)

    grouped = bt.get("grouped_records", [])
    today = date.today()
    updated = 0

    for rec in grouped:
        if "periods" not in rec:
            continue

        scan_str = rec["scan_date"]
        try:
            scan_dt = date_from_str(scan_str)
        except Exception:
            print(f"  [SKIP] {scan_str}: bad date format")
            continue

        # Collect all stock_ids across all pending periods
        period_stocks = {}
        for period_key in ["T1", "T3", "T5"]:
            period = rec["periods"].get(period_key, {})
            if period.get("pending") and period.get("win_rate") is None:
                stocks = period.get("stocks", [])
                if stocks:
                    period_stocks[period_key] = [s["stock_id"] for s in stocks]

        if not period_stocks:
            continue

        print(f"  [{scan_str}] checking {list(period_stocks.keys())} periods...")

        # For each period, batch-fetch T+N closes
        for period_key, sids in period_stocks.items():
            n = {"T1": 1, "T3": 3, "T5": 5}[period_key]
            period = rec["periods"][period_key]
            stocks = period["stocks"]

            # Check if T+N date has elapsed
            # Rough estimate: skip if scan_dt + n trading days > today
            closes = get_nth_trading_close(sids, scan_dt, n)

            wins = []
            total = 0
            any_fail = False
            check_date = None

            for stock in stocks:
                sid = stock["stock_id"]
                total += 1
                result = closes.get(sid)
                if result is None:
                    any_fail = True
                    continue

                close_px, cd = result
                check_date = cd
                entry = stock.get("entry", stock.get("entry_price", 0))
                if entry <= 0:
                    continue

                ret_pct = round((close_px - entry) / entry * 100, 2)
                stock["close"] = round(close_px, 2)
                stock["return_pct"] = ret_pct
                stock["hit_target"] = ret_pct > 0
                stock.pop("pending", None)
                if ret_pct > 0:
                    wins.append(stock)

            if any_fail:
                print(f"    {period_key}: data not yet available for some stocks")
                continue

            win_rate = round(len(wins) / total * 100, 1) if total > 0 else 0
            avg_return = round(sum(s.get("return_pct", 0) for s in stocks) / len(stocks), 2) if stocks else 0

            period["win_rate"] = win_rate
            period["avg_return"] = avg_return
            period["backtest_date"] = check_date
            period["pending"] = False
            period["winners"] = len(wins)
            period["total"] = total

            print(f"    {period_key}: win_rate={win_rate}% avg={avg_return:+.2f}% date={check_date}")
            updated += 1

    bt["grouped_records"] = grouped
    bt["last_updated"] = datetime.now(TW_TZ).isoformat()

    with open(backtest_path, "w", encoding="utf-8") as f:
        json.dump(bt, f, ensure_ascii=False, indent=2)

    print(f"\nDone — {updated} period(s) updated in {backtest_path}")
    return updated > 0


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    fill_pending()
