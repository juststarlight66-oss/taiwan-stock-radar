#!/usr/bin/env python3
"""
E3 Periodic Backtest Engine
============================
Backtests 3 strategies (MA Crossover, Breakout, Pattern Recognition)
over 12 months of Taiwan stock data.
Outputs: e3_backtest_YYYYMMDD.json with per-stock + aggregate metrics.

Usage: python backtest_engine.py --strategy all --days 252 --output e3_backtest_20260515.json
"""
import argparse, json, os, sys, time
from datetime import datetime, timedelta
import urllib.request
import urllib.error

# ============================================================
# Configuration
# ============================================================
DEFAULT_UNIVERSE = [
    "2330", "2317", "2454", "2308", "2382", "2327", "2345", "2379",
    "3034", "3008", "3045", "2303", "2881", "2882", "2886", "2891",
    "2603", "2615", "2609", "2610", "2002", "1301", "1303", "1326",
    "2498", "2357", "2353", "2383", "3231", "3711", "3481", "2409",
    "3576", "3537", "3515", "3443", "3406", "3356", "3324", "3264",
    "3189", "3042", "3037", "3017", "2344", "2368", "2449", "2489",
    "8210", "8299", "8069", "8046", "6415", "6510", "6531", "6547",
]
YAHOO_QUERY1 = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?period1={p1}&period2={p2}&interval=1d"

# ============================================================
# Data Fetching
# ============================================================
def fetch_yahoo(symbol, days_back):
    """Fetch OHLCV data from Yahoo Finance query1 API."""
    tw_symbol = f"{symbol}.TW"
    now = int(time.time())
    start = now - days_back * 86400
    
    url = YAHOO_QUERY1.format(symbol=tw_symbol, p1=start, p2=now)
    
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
    except Exception as e:
        # Try TWO suffix
        tw_symbol2 = f"{symbol}.TWO"
        url2 = YAHOO_QUERY1.format(symbol=tw_symbol2, p1=start, p2=now)
        try:
            req2 = urllib.request.Request(url2, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req2, timeout=15) as resp2:
                data = json.loads(resp2.read().decode())
        except Exception as e2:
            return None
    
    result = data.get("chart", {}).get("result", [])
    if not result:
        return None
    
    meta = result[0].get("meta", {})
    quotes = result[0].get("indicators", {}).get("quote", [{}])[0]
    timestamps = result[0].get("timestamp", [])
    
    if not timestamps or not quotes.get("close"):
        return None
    
    closes = quotes["close"]
    opens = quotes["open"]
    highs = quotes["high"]
    lows = quotes["low"]
    volumes = quotes["volume"]
    
    records = []
    for i in range(len(timestamps)):
        if closes[i] is not None:
            records.append({
                "date": datetime.utcfromtimestamp(timestamps[i]).strftime("%Y-%m-%d"),
                "open": opens[i] if opens[i] else closes[i],
                "high": highs[i] if highs[i] else closes[i],
                "low": lows[i] if lows[i] else closes[i],
                "close": closes[i],
                "volume": volumes[i] if volumes[i] else 0,
            })
    
    return {"symbol": symbol, "name": meta.get("symbol", symbol), "records": records}


# ============================================================
# Technical Indicators
# ============================================================
def sma(values, period):
    if len(values) < period:
        return [None] * len(values)
    result = []
    for i in range(len(values)):
        if i < period - 1:
            result.append(None)
        else:
            result.append(sum(values[i-period+1:i+1]) / period)
    return result

def ema(values, period):
    if len(values) < 2:
        return [None] * len(values)
    result = [None] * len(values)
    multiplier = 2.0 / (period + 1)
    # First EMA = SMA
    for i in range(len(values)):
        if values[i] is None:
            continue
        if result.count(None) == len(result):
            # Find first period values
            vals = [v for v in values[:i+1] if v is not None]
            if len(vals) >= period:
                result[i] = sum(vals[-period:]) / period
            continue
        prev = None
        for j in range(i-1, -1, -1):
            if result[j] is not None:
                prev = result[j]
                break
        if prev is not None and values[i] is not None:
            result[i] = (values[i] - prev) * multiplier + prev
    return result

def macd(closes):
    ema12 = ema(closes, 12)
    ema26 = ema(closes, 26)
    macd_line = []
    for i in range(len(closes)):
        if ema12[i] is not None and ema26[i] is not None:
            macd_line.append(ema12[i] - ema26[i])
        else:
            macd_line.append(None)
    signal = ema([x if x is not None else 0 for x in macd_line], 9)
    histogram = []
    for i in range(len(macd_line)):
        if macd_line[i] is not None and signal[i] is not None:
            histogram.append(macd_line[i] - signal[i])
        else:
            histogram.append(None)
    return macd_line, signal, histogram

def bollinger(closes, period=20, std_dev=2):
    ma = sma(closes, period)
    upper = [None] * len(closes)
    lower = [None] * len(closes)
    for i in range(period-1, len(closes)):
        window = closes[i-period+1:i+1]
        mean = ma[i]
        std = (sum((x - mean)**2 for x in window) / period) ** 0.5
        upper[i] = mean + std_dev * std
        lower[i] = mean - std_dev * std
    return upper, lower, ma

def rsi(closes, period=14):
    if len(closes) < period + 1:
        return [None] * len(closes)
    result = [None] * len(closes)
    gains = []
    losses = []
    for i in range(1, len(closes)):
        if closes[i] is None or closes[i-1] is None:
            gains.append(0)
            losses.append(0)
        else:
            diff = closes[i] - closes[i-1]
            gains.append(max(diff, 0))
            losses.append(max(-diff, 0))
    
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    
    for i in range(period, len(closes)):
        if avg_loss == 0:
            result[i] = 100.0
        else:
            rs = avg_gain / avg_loss
            result[i] = 100.0 - (100.0 / (1.0 + rs))
        if i < len(gains):
            avg_gain = (avg_gain * (period-1) + gains[i]) / period
            avg_loss = (avg_loss * (period-1) + losses[i]) / period
    
    return result


# ============================================================
# Strategies
# ============================================================
def strategy_ma_crossover(closes, volumes):
    """MA Crossover Strategy (均線交叉策略)."""
    if len(closes) < 60:
        return []
    
    ma5 = sma(closes, 5)
    ma20 = sma(closes, 20)
    ma60 = sma(closes, 60)
    macd_line, signal_line, histogram = macd(closes)
    
    trades = []
    position = None  # None, 'long'
    entry_idx = None
    entry_price = None
    
    for i in range(60, len(closes)):
        if None in [ma5[i], ma20[i], macd_line[i], signal_line[i]]:
            continue
        
        # Golden Cross signal: MA5 crosses above MA20 + MACD confirmation
        golden_cross = (ma5[i-1] <= ma20[i-1] and ma5[i] > ma20[i] and 
                       macd_line[i] > signal_line[i])
        # Death Cross signal: MA5 crosses below MA20
        death_cross = (ma5[i-1] >= ma20[i-1] and ma5[i] < ma20[i])
        
        if position is None and golden_cross:
            position = 'long'
            entry_idx = i
            entry_price = closes[i]
        elif position == 'long' and (death_cross or i - entry_idx >= 20):
            exit_price = closes[i]
            pct = (exit_price - entry_price) / entry_price * 100
            trades.append({
                "type": "ma_crossover",
                "entry_idx": entry_idx,
                "exit_idx": i,
                "entry_price": round(entry_price, 2),
                "exit_price": round(exit_price, 2),
                "return_pct": round(pct, 2),
                "win": pct > 0,
                "hold_days": i - entry_idx,
            })
            position = None
            entry_idx = None
            entry_price = None
    
    return trades


def strategy_breakout(closes, highs, lows, volumes):
    """Breakout Strategy (突破策略)."""
    if len(closes) < 60:
        return []
    
    upper_bb, lower_bb, ma20 = bollinger(closes, 20, 2)
    rsi_vals = rsi(closes, 14)
    vol_ma20 = sma(volumes if volumes else [0]*len(closes), 20)
    
    trades = []
    position = None
    entry_idx = None
    entry_price = None
    
    for i in range(60, len(closes)):
        if None in [upper_bb[i], ma20[i], rsi_vals[i], vol_ma20[i]]:
            continue
        
        # Breakout signal: Close above upper Bollinger + volume > 1.5x avg + RSI 50-70
        breakout_up = (closes[i] > upper_bb[i-1] and 
                      volumes[i] > vol_ma20[i] * 1.5 and
                      50 < (rsi_vals[i] or 50) < 75)
        
        # Exit: Close below MA20 or RSI > 80
        exit_signal = (closes[i] < ma20[i] or (rsi_vals[i] is not None and rsi_vals[i] > 80))
        
        if position is None and breakout_up:
            position = 'long'
            entry_idx = i
            entry_price = closes[i]
        elif position == 'long' and (exit_signal or i - entry_idx >= 15):
            exit_price = closes[i]
            pct = (exit_price - entry_price) / entry_price * 100
            trades.append({
                "type": "breakout",
                "entry_idx": entry_idx,
                "exit_idx": i,
                "entry_price": round(entry_price, 2),
                "exit_price": round(exit_price, 2),
                "return_pct": round(pct, 2),
                "win": pct > 0,
                "hold_days": i - entry_idx,
            })
            position = None
            entry_idx = None
            entry_price = None
    
    return trades


def strategy_pattern(closes, highs, lows):
    """Pattern Recognition Strategy (形態策略)."""
    if len(closes) < 40:
        return []
    
    trades = []
    position = None
    entry_idx = None
    entry_price = None
    
    for i in range(40, len(closes)):
        if None in [closes[i], closes[i-1], closes[i-2], highs[i], lows[i], highs[i-1], lows[i-1]]:
            continue
        
        # Hammer pattern: small body, long lower shadow
        body = abs(closes[i-1] - closes[i-2])
        lower_shadow = min(closes[i-2], closes[i-1]) - lows[i-1]
        is_hammer = (lower_shadow > body * 2 and body > 0 and 
                    (highs[i-1] - max(closes[i-2], closes[i-1])) < body * 0.5)
        
        # Double bottom: two similar lows within 2% over 5-20 days
        double_bottom = False
        for lookback in range(5, min(21, i)):
            if lows[i-lookback] and lows[i]:
                diff_pct = abs(lows[i] - lows[i-lookback]) / lows[i-lookback] * 100
                if diff_pct < 2.0 and closes[i] > closes[i-lookback]:
                    double_bottom = True
                    break
        
        # Doji: open ~= close
        o_val = closes[i-2]
        is_doji = abs(closes[i-1] - o_val) / o_val * 100 < 0.1 if o_val else False
        
        # RSI oversold
        rsi_vals = rsi(closes, 14)
        rsi_oversold = rsi_vals[i-1] is not None and rsi_vals[i-1] < 35
        
        # Entry signals
        pattern_signal = (is_hammer and rsi_oversold) or double_bottom or (is_doji and closes[i] > closes[i-1])
        
        # Exit: 10 days hold or 8% stop loss
        if position is None and pattern_signal:
            position = 'long'
            entry_idx = i
            entry_price = closes[i]
        elif position == 'long':
            exit_price = closes[i]
            pct = (exit_price - entry_price) / entry_price * 100
            stop_loss_hit = pct <= -8.0
            time_exit = i - entry_idx >= 10
            
            if stop_loss_hit or time_exit:
                trades.append({
                    "type": "pattern",
                    "entry_idx": entry_idx,
                    "exit_idx": i,
                    "entry_price": round(entry_price, 2),
                    "exit_price": round(exit_price, 2),
                    "return_pct": round(pct, 2),
                    "win": pct > 0,
                    "hold_days": i - entry_idx,
                    "signal": "hammer" if is_hammer else "double_bottom" if double_bottom else "doji",
                })
                position = None
                entry_idx = None
                entry_price = None
    
    return trades


# ============================================================
# Metrics
# ============================================================
def compute_metrics(trades, closes=None):
    """Compute backtest metrics from trade list."""
    if not trades:
        return {
            "total_trades": 0,
            "win_rate": 0.0,
            "loss_rate": 0.0,
            "profit_loss_ratio": 0.0,
            "avg_return_pct": 0.0,
            "max_return_pct": 0.0,
            "min_return_pct": 0.0,
            "sharpe_ratio": 0.0,
            "max_drawdown_pct": 0.0,
            "avg_hold_days": 0.0,
        }
    
    wins = [t for t in trades if t["win"]]
    losses = [t for t in trades if not t["win"]]
    returns = [t["return_pct"] for t in trades]
    
    win_rate = len(wins) / len(trades) * 100
    avg_win = sum(t["return_pct"] for t in wins) / len(wins) if wins else 0
    avg_loss = abs(sum(t["return_pct"] for t in losses) / len(losses)) if losses else 0
    plr = abs(avg_win / avg_loss) if avg_loss else 999
    
    avg_return = sum(returns) / len(returns)
    
    # Sharpe ratio (simplified: mean(return) / std(return), annualized)
    if len(returns) > 1:
        mean_r = avg_return
        std_r = (sum((r - mean_r)**2 for r in returns) / (len(returns)-1)) ** 0.5
        sharpe = (mean_r / std_r * (252**0.5)) if std_r > 0 else 0
    else:
        sharpe = 0
    
    # Max drawdown from cumulative returns
    cumulative = 0
    peak = 0
    max_dd = 0
    for r in returns:
        cumulative += r
        peak = max(peak, cumulative)
        dd = peak - cumulative
        max_dd = max(max_dd, dd)
    
    hold_days = [t["hold_days"] for t in trades]
    
    return {
        "total_trades": len(trades),
        "win_count": len(wins),
        "loss_count": len(losses),
        "win_rate": round(win_rate, 2),
        "loss_rate": round(100 - win_rate, 2),
        "profit_loss_ratio": round(plr, 2),
        "avg_return_pct": round(avg_return, 2),
        "max_return_pct": round(max(returns), 2),
        "min_return_pct": round(min(returns), 2),
        "sharpe_ratio": round(sharpe, 2),
        "max_drawdown_pct": round(max_dd, 2),
        "avg_hold_days": round(sum(hold_days)/len(hold_days), 1) if hold_days else 0,
    }


# ============================================================
# Main
# ============================================================
def main():
    parser = argparse.ArgumentParser(description="E3 Periodic Backtest Engine")
    parser.add_argument("--strategy", default="all", 
                       choices=["all", "ma_crossover", "breakout", "pattern"])
    parser.add_argument("--symbols", default="", help="Comma-separated stock symbols")
    parser.add_argument("--days", type=int, default=252, help="Lookback days (default: 252 = ~1 year)")
    parser.add_argument("--output", default="", help="Output JSON file path")
    args = parser.parse_args()
    
    # Determine universe
    if args.symbols:
        symbols = [s.strip() for s in args.symbols.split(",") if s.strip()]
    else:
        symbols = DEFAULT_UNIVERSE
    
    strategies = ["ma_crossover", "breakout", "pattern"] if args.strategy == "all" else [args.strategy]
    
    print(f"E3 Backtest: {len(symbols)} stocks, {args.days}d lookback, strategies={strategies}")
    
    all_stock_results = {}
    all_aggregate_trades = {s: [] for s in strategies}
    fetch_errors = 0
    
    for idx, symbol in enumerate(symbols):
        print(f"  [{idx+1}/{len(symbols)}] Fetching {symbol}...", end=" ", flush=True)
        data = fetch_yahoo(symbol, args.days)
        
        if not data or not data.get("records"):
            print("NO DATA")
            fetch_errors += 1
            continue
        
        records = data["records"]
        closes = [r["close"] for r in records]
        opens = [r["open"] for r in records]
        highs = [r["high"] for r in records]
        lows = [r["low"] for r in records]
        volumes = [r["volume"] for r in records]
        
        print(f"{len(records)} days")
        
        stock_result = {"symbol": symbol, "name": data.get("name", symbol), "strategies": {}}
        
        for strat in strategies:
            if strat == "ma_crossover":
                trades = strategy_ma_crossover(closes, volumes)
            elif strat == "breakout":
                trades = strategy_breakout(closes, highs, lows, volumes)
            elif strat == "pattern":
                trades = strategy_pattern(closes, highs, lows)
            else:
                trades = []
            
            metrics = compute_metrics(trades, closes)
            stock_result["strategies"][strat] = {
                "metrics": metrics,
                "trade_count": len(trades),
            }
            all_aggregate_trades[strat].extend(trades)
        
        all_stock_results[symbol] = stock_result
        
        # Be nice to the API
        time.sleep(0.15)
    
    # Compute aggregate metrics
    aggregate = {}
    top_performers = []
    
    for strat in strategies:
        agg_metrics = compute_metrics(all_aggregate_trades[strat])
        aggregate[strat] = agg_metrics
    
    # Find top performers (by combined score across strategies)
    for symbol, result in all_stock_results.items():
        total_score = 0
        strat_count = 0
        for strat in strategies:
            m = result["strategies"].get(strat, {}).get("metrics", {})
            if m.get("total_trades", 0) > 0:
                score = m["win_rate"] * 0.4 + m["sharpe_ratio"] * 0.3 + min(m["profit_loss_ratio"], 5) * 6
                total_score += score
                strat_count += 1
        
        if strat_count > 0:
            top_performers.append({
                "symbol": symbol,
                "name": result.get("name", symbol),
                "score": round(total_score / strat_count, 2),
                "strategies": {
                    s: result["strategies"].get(s, {}).get("metrics", {})
                    for s in strategies
                }
            })
    
    top_performers.sort(key=lambda x: x["score"], reverse=True)
    
    # Build output
    output = {
        "meta": {
            "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "date": datetime.utcnow().strftime("%Y%m%d"),
            "lookback_days": args.days,
            "strategies": strategies,
            "universe_size": len(symbols),
            "stocks_with_data": len(all_stock_results),
            "fetch_errors": fetch_errors,
        },
        "aggregate": aggregate,
        "top_performers": top_performers[:20],
        "stock_results": all_stock_results,
    }
    
    # Write output
    out_path = args.output
    if not out_path:
        date_str = datetime.utcnow().strftime("%Y%m%d")
        out_path = f"e3_backtest_{date_str}.json"
    
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"\nDone. Output: {out_path}")
    print(f"Stocks processed: {len(all_stock_results)}, errors: {fetch_errors}")
    for strat in strategies:
        m = aggregate[strat]
        print(f"  {strat}: trades={m['total_trades']}, win_rate={m['win_rate']}%, "
              f"sharpe={m['sharpe_ratio']}, plr={m['profit_loss_ratio']}, "
              f"max_dd={m['max_drawdown_pct']}%")
    
    # Also print top 5
    print("\nTop 5 Performers:")
    for tp in top_performers[:5]:
        print(f"  {tp['symbol']} {tp['name']}: score={tp['score']}")


if __name__ == "__main__":
    main()