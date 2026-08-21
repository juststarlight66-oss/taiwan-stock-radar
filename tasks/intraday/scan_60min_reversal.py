#!/usr/bin/env python3
"""
60分K線翻紅掃描腳本 — v1

策略：找「快要由綠翻紅」的個股（底部反轉訊號）
      目標在低點介入，而非追漲，故只挑當日微跌（-4%~+0.5%）的標的

判斷條件（多指標共振）：
1. KD 金叉底部：K 值從低位上穿 D 值（偏好 K < 50 時發生）
2. MACD 底部翻揚：DIF 由負轉正，或 histogram 由負轉正
3. 量縮止跌：近 2 根 60minK 量能萎縮，收盤收高（下影線支撐）
4. 日內跌幅 -4% ~ +0.5%：尚未翻紅但接近（排除已漲轉強的）
5. 均線支撐：股價接近 MA20 (60min) 或日線 MA5

資料源：yfinance，60min interval，抓最近 5 天資料（共 ~36 根 K 棒）
輸出：public/data/reversal_60min.json
"""

import json
import os
import sys
import time
import warnings
from datetime import datetime, timezone, timedelta
from pathlib import Path

warnings.filterwarnings("ignore")

try:
    import yfinance as yf
    import pandas as pd
    import numpy as np
except ImportError:
    print("Installing required packages...")
    os.system("uv add yfinance pandas numpy")
    import yfinance as yf
    import pandas as pd
    import numpy as np

# ── Config ────────────────────────────────────────────────────────────────────

REPO_DIR = Path(os.environ.get("REPO_DIR", Path(__file__).resolve().parent.parent.parent))
TASKS_DIR = REPO_DIR / "tasks/2255"
OUT_PATH = REPO_DIR / "public/data/reversal_60min.json"
scan_result_path = TASKS_DIR / "scan_result.json"

TW_TZ = timezone(timedelta(hours=8))
now_tw = datetime.now(TW_TZ)

# Strategy parameters
MIN_SCORE = 40          # minimum composite score (0-100)
DAY_CHANGE_MIN = -4.0   # today's day change: at least -4% (not too beaten down)
DAY_CHANGE_MAX = 0.5    # at most +0.5% (hasn't turned green yet)
TOP_N = 20              # return top N candidates
BATCH_SIZE = 300        # yfinance batch size
BATCH_PAUSE = 2.0       # seconds between batches


def log(msg: str):
    ts = datetime.now(TW_TZ).strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ── Technical Indicators ─────────────────────────────────────────────────────

def compute_kdj(highs, lows, closes, period=9, k_period=3, d_period=3):
    """Compute KD (stochastic oscillator).
    Returns (K_values, D_values) as lists aligned with input length.
    """
    n = len(closes)
    if n < period:
        return [50.0] * n, [50.0] * n

    k_vals = []
    for i in range(n):
        start = max(0, i - period + 1)
        window_high = max(highs[start:i+1])
        window_low = min(lows[start:i+1])
        if window_high == window_low:
            rsv = 50.0
        else:
            rsv = (closes[i] - window_low) / (window_high - window_low) * 100
        k_vals.append(rsv)

    # Smooth K and D with EMA-like smoothing
    k_smooth = [50.0]
    for rsv in k_vals[1:]:
        k_smooth.append(k_smooth[-1] * (k_period - 1) / k_period + rsv / k_period)

    d_smooth = [50.0]
    for k in k_smooth[1:]:
        d_smooth.append(d_smooth[-1] * (d_period - 1) / d_period + k / d_period)

    return k_smooth, d_smooth


def compute_macd(closes, fast=12, slow=26, signal=9):
    """Compute MACD (DIF, DEA, histogram).
    Returns (dif, dea, histogram) as lists aligned with input length.
    """
    n = len(closes)
    if n < slow:
        return [0.0]*n, [0.0]*n, [0.0]*n

    # EMA helper
    def ema(data, period):
        result = []
        mult = 2 / (period + 1)
        result.append(data[0])
        for v in data[1:]:
            result.append(result[-1] * (1 - mult) + v * mult)
        return result

    ema_fast = ema(closes, fast)
    ema_slow = ema(closes, slow)
    dif = [f - s for f, s in zip(ema_fast, ema_slow)]
    dea = ema(dif, signal)
    hist = [2 * (d - s) for d, s in zip(dif, dea)]
    return dif, dea, hist


def compute_ma(closes, period):
    """Simple moving average, returns list same length as closes (NaN for insufficient data)."""
    result = []
    for i in range(len(closes)):
        if i < period - 1:
            result.append(float('nan'))
        else:
            result.append(sum(closes[i-period+1:i+1]) / period)
    return result


# ── Scoring ───────────────────────────────────────────────────────────────────

def score_reversal(df_60min: pd.DataFrame, day_change_pct: float) -> tuple[float, dict]:
    """
    Score a stock's 60min-K reversal probability (0-100).

    Signals checked:
    - KD 金叉底部     (0-30 pts)
    - MACD 底部翻揚   (0-25 pts)
    - 量縮止跌        (0-20 pts)
    - 均線支撐        (0-15 pts)
    - 日內跌幅位置    (0-10 pts)

    Returns (score, details_dict)
    """
    details = {}
    score = 0.0

    if df_60min is None or len(df_60min) < 10:
        return 0.0, {"error": "insufficient data"}

    closes = df_60min["Close"].tolist()
    highs = df_60min["High"].tolist()
    lows = df_60min["Low"].tolist()
    volumes = df_60min["Volume"].tolist()

    n = len(closes)

    # ── Signal 1: KD 金叉底部 (0-30 pts) ─────────────────────────────────────
    k_vals, d_vals = compute_kdj(highs, lows, closes)
    kd_score = 0

    if n >= 3:
        k_now = k_vals[-1]
        k_prev = k_vals[-2]
        d_now = d_vals[-1]
        d_prev = d_vals[-2]

        crossed_up = k_prev <= d_prev and k_now > d_now  # golden cross
        just_crossed = k_prev <= d_prev and k_now > d_now

        details["k_now"] = round(k_now, 1)
        details["d_now"] = round(d_now, 1)
        details["kd_cross"] = just_crossed

        if just_crossed and k_now < 30:
            kd_score = 30   # 低位金叉：最強訊號
            details["kd_signal"] = "低位金叉(K<30)"
        elif just_crossed and k_now < 50:
            kd_score = 25   # 中低位金叉
            details["kd_signal"] = "中低位金叉"
        elif just_crossed:
            kd_score = 15   # 高位金叉（意義較弱）
            details["kd_signal"] = "金叉(K>=50)"
        elif k_now < 20 and k_now > k_prev:
            kd_score = 20   # 超低位K值回升（尚未交叉）
            details["kd_signal"] = "超低位K回升"
        elif k_now < 30 and k_now > k_prev:
            kd_score = 12
            details["kd_signal"] = "低位K回升"
        else:
            kd_score = 0
            details["kd_signal"] = "無明顯KD訊號"

    score += kd_score

    # ── Signal 2: MACD 底部翻揚 (0-25 pts) ───────────────────────────────────
    dif, dea, hist = compute_macd(closes)
    macd_score = 0

    if n >= 3:
        hist_now = hist[-1]
        hist_prev = hist[-2]
        hist_prev2 = hist[-3] if n >= 3 else hist[-2]
        dif_now = dif[-1]
        dif_prev = dif[-2]

        details["macd_hist_now"] = round(hist_now, 4)
        details["dif_now"] = round(dif_now, 4)

        # histogram 由負轉正（死叉谷底翻揚）
        if hist_prev < 0 and hist_now > 0:
            macd_score = 25
            details["macd_signal"] = "histogram死叉翻揚"
        # histogram 持續從深負值收斂
        elif hist_prev < hist_prev2 < 0 and hist_now > hist_prev:
            macd_score = 20
            details["macd_signal"] = "histogram底部收斂"
        elif hist_now > hist_prev and hist_prev < 0:
            macd_score = 15
            details["macd_signal"] = "histogram負值回升"
        # DIF 從負值快速上升接近 0
        elif dif_now < 0 and dif_now > dif_prev and abs(dif_now) < abs(dif_prev) * 0.7:
            macd_score = 12
            details["macd_signal"] = "DIF快速收斂"
        elif dif_now < 0 and dif_now > dif_prev:
            macd_score = 8
            details["macd_signal"] = "DIF負值回升"
        # histogram 正值但抬升中（多頭趨勢加速，但K值低，代表短期修正後回升）
        elif hist_now > 0 and hist_now > hist_prev and hist_prev > hist_prev2:
            macd_score = 10
            details["macd_signal"] = "histogram正值持續抬升"
        elif hist_now > 0 and hist_now > hist_prev:
            macd_score = 7
            details["macd_signal"] = "histogram正值回升"
        else:
            macd_score = 0
            details["macd_signal"] = "無MACD底部訊號"

    score += macd_score

    # ── Signal 3: 量縮止跌 (0-20 pts) ────────────────────────────────────────
    vol_score = 0

    if n >= 4 and all(v > 0 for v in volumes[-4:]):
        vol_avg_4 = sum(volumes[-5:-1]) / 4 if n >= 5 else sum(volumes[-4:]) / 4
        vol_now = volumes[-1]
        vol_prev = volumes[-2]
        vol_prev2 = volumes[-3]

        # 量縮：最近 2 根量 < 前期均量
        vol_shrink = vol_now < vol_avg_4 * 0.8 and vol_prev < vol_avg_4 * 0.9

        # 止跌：收盤相比開盤有回升（下影線），或連跌減緩
        close_now = closes[-1]
        open_now = float(df_60min["Open"].iloc[-1]) if "Open" in df_60min.columns else closes[-1]
        lower_wick = close_now > open_now  # 陽線收盤（止跌）
        close_prev = closes[-2]
        not_falling_hard = close_now >= close_prev * 0.998  # 最後一根跌幅小於 0.2%

        details["vol_shrink"] = vol_shrink
        details["lower_wick"] = lower_wick

        if vol_shrink and lower_wick:
            vol_score = 20
            details["vol_signal"] = "量縮+陽線止跌"
        elif vol_shrink and not_falling_hard:
            vol_score = 15
            details["vol_signal"] = "量縮止跌"
        elif vol_shrink:
            vol_score = 10
            details["vol_signal"] = "量縮（仍下跌）"
        elif lower_wick and not_falling_hard:
            vol_score = 8
            details["vol_signal"] = "陽線止跌"
        else:
            vol_score = 0
            details["vol_signal"] = "無量縮訊號"

    score += vol_score

    # ── Signal 4: 均線支撐 (0-15 pts) ────────────────────────────────────────
    ma_score = 0

    ma20 = compute_ma(closes, 20)
    ma10 = compute_ma(closes, 10)
    cur_close = closes[-1]

    ma20_now = ma20[-1] if not (isinstance(ma20[-1], float) and ma20[-1] != ma20[-1]) else None
    ma10_now = ma10[-1] if not (isinstance(ma10[-1], float) and ma10[-1] != ma10[-1]) else None

    if ma20_now and ma20_now > 0:
        dist_ma20 = (cur_close - ma20_now) / ma20_now * 100
        details["dist_ma20"] = round(dist_ma20, 2)

        if -1.0 <= dist_ma20 <= 1.5:
            ma_score = 15  # 緊貼 MA20
            details["ma_signal"] = "緊貼MA20支撐"
        elif -2.0 <= dist_ma20 < -1.0:
            ma_score = 10  # 輕微跌破 MA20，可能反彈
            details["ma_signal"] = "輕跌MA20下方"
        elif 1.5 < dist_ma20 <= 3.0:
            ma_score = 8   # 略高於 MA20
            details["ma_signal"] = "MA20上方偏高"
        else:
            ma_score = 3
            details["ma_signal"] = "距MA20過遠"
    else:
        details["ma_signal"] = "MA資料不足"
        ma_score = 5

    score += ma_score

    # ── Signal 5: 日內跌幅位置 (0-10 pts) ────────────────────────────────────
    # 越接近翻紅（0%）但仍是負值，得分越高
    day_score = 0
    details["day_change_pct"] = round(day_change_pct, 2)

    if -0.5 <= day_change_pct <= 0.5:
        day_score = 10   # 幾乎平盤，隨時翻紅
        details["day_signal"] = "幾乎平盤"
    elif -1.5 <= day_change_pct < -0.5:
        day_score = 8
        details["day_signal"] = "微幅下跌"
    elif -3.0 <= day_change_pct < -1.5:
        day_score = 5
        details["day_signal"] = "小幅下跌"
    elif -4.0 <= day_change_pct < -3.0:
        day_score = 2
        details["day_signal"] = "中幅下跌"
    else:
        day_score = 0
        details["day_signal"] = "跌幅過大"

    score += day_score

    details["score_breakdown"] = {
        "kd": kd_score,
        "macd": macd_score,
        "volume": vol_score,
        "ma_support": ma_score,
        "day_position": day_score,
    }

    return round(score, 1), details


# ── Data Fetching ─────────────────────────────────────────────────────────────

def load_stock_list():
    """Load stocks from scan_result.json (TWSE + TPEx)."""
    if not scan_result_path.exists():
        log(f"WARNING: {scan_result_path} not found, scanning all known stocks")
        return []

    with open(scan_result_path) as f:
        data = json.load(f)

    stocks = []
    for s in data.get("all_stock_scores", []):
        sid = s["stock_id"]
        market = s.get("market", "").upper()
        suffix = ".TWO" if market == "TPEX" else ".TW"
        price = s.get("close") or s.get("current_price") or 0
        stocks.append({
            "stock_id": sid,
            "name": s.get("name", ""),
            "ticker": f"{sid}{suffix}",
            "sector_name": s.get("sector_name", ""),
            "prev_close": s.get("prev_close") or price,
            "day_close": s.get("close") or price,
            "day_change_pct": s.get("change_pct") or 0,
            "market": market,
        })
    return stocks


def fetch_60min_data_batch(tickers: list[str]) -> dict[str, pd.DataFrame]:
    """Fetch 60-minute K-line data for a list of tickers using yfinance."""
    results = {}
    for i in range(0, len(tickers), BATCH_SIZE):
        batch = tickers[i:i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        total = (len(tickers) + BATCH_SIZE - 1) // BATCH_SIZE
        log(f"  Fetching 60min data batch {batch_num}/{total} ({len(batch)} tickers)...")

        try:
            data = yf.download(
                batch,
                period="5d",
                interval="60m",
                progress=False,
                threads=True,
                timeout=30,
                auto_adjust=True,
            )
        except Exception as e:
            log(f"    Batch {batch_num} error: {e}")
            time.sleep(1)
            continue

        if data is None or data.empty:
            log(f"    Batch {batch_num}: no data returned")
            time.sleep(BATCH_PAUSE)
            continue

        for ticker in batch:
            try:
                if len(batch) == 1:
                    ticker_data = data
                else:
                    # Multi-ticker: columns are MultiIndex (field, ticker)
                    ticker_data = data.xs(ticker, level=1, axis=1)

                if ticker_data.empty:
                    continue

                # Keep only rows from today (TWN timezone)
                today_str = now_tw.strftime("%Y-%m-%d")
                # Cast to DatetimeIndex so .strftime is always available
                dt_index = pd.DatetimeIndex(ticker_data.index)
                date_strs = dt_index.strftime("%Y-%m-%d")
                ticker_today = ticker_data[date_strs == today_str]

                # Need at least 10 rows for reliable signal
                if len(ticker_today) >= 3:
                    results[ticker] = ticker_today
                elif len(ticker_data) >= 10:
                    # Fallback: use all available data
                    results[ticker] = ticker_data
            except Exception:
                pass

        if i + BATCH_SIZE < len(tickers):
            time.sleep(BATCH_PAUSE)

    log(f"  60min data fetched: {len(results)} tickers with data")
    return results


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    log(f"60分K翻紅掃描開始 ({now_tw.strftime('%Y-%m-%d %H:%M:%S')} TWN)")
    log(f"條件：日內跌幅 {DAY_CHANGE_MIN}%~{DAY_CHANGE_MAX}%，最低評分 {MIN_SCORE}")

    # 1. Load stock universe
    stock_list = load_stock_list()
    if not stock_list:
        log("ERROR: No stocks loaded")
        sys.exit(1)
    log(f"載入 {len(stock_list)} 檔標的")

    # 2. Pre-filter: only stocks with day change in target range (still red/flat)
    candidates_pre = [
        s for s in stock_list
        if DAY_CHANGE_MIN <= (s.get("day_change_pct") or 0) <= DAY_CHANGE_MAX
    ]
    log(f"日內跌幅篩選後：{len(candidates_pre)} 檔（{DAY_CHANGE_MIN}%~{DAY_CHANGE_MAX}%）")

    if not candidates_pre:
        log("無符合條件的標的（市場可能全面上漲或下跌）")
        output = {
            "scan_type": "reversal_60min",
            "scanned_at": now_tw.strftime("%Y-%m-%d %H:%M:%S"),
            "strategy": "60分K線翻紅底部反轉",
            "filter": f"日內跌幅 {DAY_CHANGE_MIN}%~{DAY_CHANGE_MAX}%",
            "scanned_count": len(stock_list),
            "pre_filtered": 0,
            "qualified_count": 0,
            "stocks": [],
        }
        OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(OUT_PATH, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        log(f"輸出：{OUT_PATH}（無候選）")
        return []

    # 3. Fetch 60min K data for pre-filtered stocks
    tickers = [s["ticker"] for s in candidates_pre]
    ticker_to_stock = {s["ticker"]: s for s in candidates_pre}

    log(f"抓取 {len(tickers)} 檔的 60 分 K 資料...")
    data_60min = fetch_60min_data_batch(tickers)

    # 4. Score each stock
    log("評分中...")
    scored = []
    for ticker, df in data_60min.items():
        s = ticker_to_stock.get(ticker)
        if not s:
            continue

        day_chg = s.get("day_change_pct") or 0
        cur_price = s.get("day_close") or 0

        score, details = score_reversal(df, day_chg)

        if score < MIN_SCORE:
            continue

        # Entry/target/stop
        entry = round(cur_price, 2) if cur_price else 0
        prev_close = s.get("prev_close") or cur_price
        stop_loss = round(entry * 0.97, 2)  # -3% stop
        target_1 = round(prev_close * 1.01, 2)  # 回平盤 +1%
        target_2 = round(prev_close * 1.03, 2)  # 翻紅 +3%

        # Signal summary for display
        kd_sig = details.get("kd_signal", "")
        macd_sig = details.get("macd_signal", "")
        vol_sig = details.get("vol_signal", "")
        ma_sig = details.get("ma_signal", "")

        signals = []
        if "金叉" in kd_sig or "超低" in kd_sig:
            signals.append("KD金叉")
        if "翻揚" in macd_sig or "收斂" in macd_sig:
            signals.append("MACD底部")
        if "量縮" in vol_sig:
            signals.append("量縮止跌")
        if "MA20" in ma_sig and ("支撐" in ma_sig or "輕跌" in ma_sig):
            signals.append("MA20支撐")

        scored.append({
            "stock_id": s["stock_id"],
            "name": s["name"],
            "sector": s["sector_name"],
            "market": s["market"],
            "score": score,
            "day_change_pct": round(day_chg, 2),
            "entry": entry,
            "target_1": target_1,  # 回平盤
            "target_2": target_2,  # 翻紅
            "stop_loss": stop_loss,
            "signals": signals,
            "signal_count": len(signals),
            "details": {
                "kd": {
                    "k": details.get("k_now"),
                    "d": details.get("d_now"),
                    "signal": kd_sig,
                    "score": details.get("score_breakdown", {}).get("kd", 0),
                },
                "macd": {
                    "hist": details.get("macd_hist_now"),
                    "dif": details.get("dif_now"),
                    "signal": macd_sig,
                    "score": details.get("score_breakdown", {}).get("macd", 0),
                },
                "volume": {
                    "shrink": details.get("vol_shrink"),
                    "lower_wick": details.get("lower_wick"),
                    "signal": vol_sig,
                    "score": details.get("score_breakdown", {}).get("volume", 0),
                },
                "ma_support": {
                    "dist_ma20": details.get("dist_ma20"),
                    "signal": ma_sig,
                    "score": details.get("score_breakdown", {}).get("ma_support", 0),
                },
                "day_position": {
                    "change_pct": round(day_chg, 2),
                    "signal": details.get("day_signal", ""),
                    "score": details.get("score_breakdown", {}).get("day_position", 0),
                },
                "score_breakdown": details.get("score_breakdown", {}),
            },
        })

    scored.sort(key=lambda x: (-x["signal_count"], -x["score"]))
    top = scored[:TOP_N]

    log(f"\n=== Top {len(top)} 60分K翻紅候選 ===")
    for i, s in enumerate(top[:10]):
        sigs = "+".join(s["signals"]) if s["signals"] else "無明顯訊號"
        log(f"  #{i+1} {s['stock_id']} {s['name']} 分={s['score']} "
            f"日漲跌={s['day_change_pct']:+.1f}% 訊號=[{sigs}]")

    output = {
        "scan_type": "reversal_60min",
        "scanned_at": now_tw.strftime("%Y-%m-%d %H:%M:%S"),
        "strategy": "60分K線翻紅底部反轉",
        "description": "篩選日內微跌（尚未翻紅）但60分K出現KD金叉+MACD底部+量縮止跌共振訊號的個股",
        "filter": f"日內跌幅 {DAY_CHANGE_MIN}%~{DAY_CHANGE_MAX}%，最低評分 {MIN_SCORE}",
        "scanned_count": len(stock_list),
        "pre_filtered": len(candidates_pre),
        "qualified_count": len(scored),
        "stocks": top,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    log(f"輸出：{OUT_PATH}（{len(top)} 檔）")
    return top


if __name__ == "__main__":
    main()
