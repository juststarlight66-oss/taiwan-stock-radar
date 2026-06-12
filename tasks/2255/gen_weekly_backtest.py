#!/usr/bin/env python3
"""
gen_weekly_backtest.py - Generate weekly_backtest_YYYYMMDD.json
equivalent to weekly_backtest.py but adapted for top_stocks field name.
"""
import json
import os
import datetime
import math

script_dir = os.path.dirname(os.path.abspath(__file__))
tz = datetime.timezone(datetime.timedelta(hours=8))  # Asia/Taipei
now = datetime.datetime.now(tz)
date_str = now.strftime("%Y%m%d")
date_iso = now.strftime("%Y-%m-%d")

# --- Load latest scan ---
latest_path = os.path.join(script_dir, "latest.json")
with open(latest_path, encoding="utf-8") as f:
    latest = json.load(f)

top_stocks = latest.get("top_stocks", [])[:10]
explode_top5 = latest.get("explode_top5", [])[:5]
scan_date = latest.get("scan_date", date_str)
scanned_count = latest.get("scanned_count", 0)

# --- Load backtest for historical performance ---
backtest_path = os.path.join(script_dir, "backtest.json")
historical_records = []
if os.path.exists(backtest_path):
    with open(backtest_path, encoding="utf-8") as f:
        bt = json.load(f)
    for gr in bt.get("grouped_records", []):
        historical_records.append(gr)

# --- Calculate POWER COMBO indicators from historical T+N records ---
def calc_power_combo(records):
    """Calculate three-lamp indicators from verified grouped_records."""
    t1_wins = []
    t3_wins = []
    t5_wins = []
    t5_returns = []
    stop_loss_count = 0
    total_valid = 0

    for gr in records:
        periods = gr.get("periods", {})
        for pk in ["T1", "T3", "T5"]:
            p = periods.get(pk, {})
            if p.get("pending", True):
                continue
            stocks = p.get("stocks", [])
            for s in stocks:
                rp = s.get("return_pct")
                hit_stoploss = s.get("hit_stoploss", False)
                if hit_stoploss:
                    stop_loss_count += 1
                if rp is not None:
                    total_valid += 1
                    win = rp > 0
                    if pk == "T1":
                        t1_wins.append(win)
                    elif pk == "T3":
                        t3_wins.append(win)
                    elif pk == "T5":
                        t5_wins.append(win)
                        t5_returns.append(rp)

    return {
        "t1_win_rate": round(sum(t1_wins) / len(t1_wins) * 100, 2) if t1_wins else None,
        "t3_win_rate": round(sum(t3_wins) / len(t3_wins) * 100, 2) if t3_wins else None,
        "t5_win_rate": round(sum(t5_wins) / len(t5_wins) * 100, 2) if t5_wins else None,
        "avg_t5_return": round(sum(t5_returns) / len(t5_returns), 2) if t5_returns else None,
        "stop_loss_triggers": stop_loss_count,
        "total_valid_records": total_valid,
        "t1_count": len(t1_wins),
        "t3_count": len(t3_wins),
        "t5_count": len(t5_wins),
    }

power_combo = calc_power_combo(historical_records)

# --- Build weekly_top10 from top_stocks ---
weekly_top10 = []
for s in top_stocks:
    close_price = s.get("close", 0)
    entry_low = s.get("entry_low", s.get("entry_zone_low", close_price * 0.97))
    stop_loss = s.get("stop_loss", close_price * 0.95)

    # Calculate stop_loss_pct
    if close_price and stop_loss:
        sl_pct = round(abs(close_price - stop_loss) / close_price * 100, 2)
    else:
        sl_pct = 4.0

    entry = {
        "stock_id": s.get("stock_id", ""),
        "name": s.get("name", ""),
        "entry_date": scan_date,
        "entry_price": close_price,
        "stop_loss": stop_loss,
        "stop_loss_pct": sl_pct,
        "t1": {"pct": None, "win": None},
        "t3": {"pct": None, "win": None},
        "t5": {"pct": None, "win": None},
        "total_score": s.get("total_score", s.get("score", 0)),
        "close": close_price,
        "change_pct": s.get("change_pct", 0),
        "sector": s.get("sector", ""),
        "market": s.get("market", ""),
    }
    weekly_top10.append(entry)

# --- Build next_week_top5 from explode_top5 ---
next_week_top5 = []
for e in explode_top5:
    close_price = e.get("close", 0)
    entry_zone_low = round(close_price * 0.97, 2)
    entry_zone_high = round(close_price * 1.03, 2)
    stop_loss = round(close_price * 0.92, 2)

    nw = {
        "stock_id": e.get("stock_id", ""),
        "name": e.get("name", ""),
        "close": close_price,
        "explode_prob": e.get("explode_prob", 1.0),
        "change_pct": e.get("change_pct", 0),
        "entry_zone_low": e.get("entry_zone_low", entry_zone_low) or entry_zone_low,
        "entry_zone_high": e.get("entry_zone_high", entry_zone_high) or entry_zone_high,
        "stop_loss": e.get("stop_loss", stop_loss) or stop_loss,
        "catalyst": e.get("catalyst", "量能突破候選") or "量能突破候選",
        "total_score": e.get("total_score"),
    }
    next_week_top5.append(nw)

# --- Determine top sectors ---
sectors = {}
for s in top_stocks:
    sec = s.get("sector", s.get("market", "Unknown"))
    sectors[sec] = sectors.get(sec, 0) + 1
top_sectors = sorted(sectors, key=sectors.get, reverse=True)[:5]

# --- Calculate avg stop_loss_pct ---
sl_pcts = [x["stop_loss_pct"] for x in weekly_top10 if x["stop_loss_pct"]]
avg_sl = round(sum(sl_pcts) / len(sl_pcts), 2) if sl_pcts else 4.0

# --- Build report ---
report = {
    "report_date": date_str,
    "report_type": "weekly_backtest",
    "generated_at": now.isoformat(),
    "week_ending": date_iso,
    "scan_days_this_week": [date_str],
    "summary": {
        "total_recommendations": len(top_stocks),
        "scanned_stocks": scanned_count,
        "top_sectors": top_sectors,
        "avg_score": round(sum(x["total_score"] for x in weekly_top10) / len(weekly_top10), 2) if weekly_top10 else 0,
    },
    "power_combo_indicators": {
        "description": "三燈號指標 - T+N 追蹤框架",
        "t1_win_rate": power_combo.get("t1_win_rate"),
        "t3_win_rate": power_combo.get("t3_win_rate"),
        "t5_win_rate": power_combo.get("t5_win_rate"),
        "avg_t5_return": power_combo.get("avg_t5_return"),
        "stop_loss_triggers": power_combo.get("stop_loss_triggers", 0),
        "total_valid_records": power_combo.get("total_valid_records", 0),
        "note": "基於歷史 backtest.json grouped_records 計算" if power_combo.get("total_valid_records", 0) > 0 else "尚無歷史驗證數據",
    },
    "weekly_top10": weekly_top10,
    "next_week_top5": next_week_top5,
    "risk_metrics": {
        "avg_stop_loss_pct": avg_sl,
        "max_position_pct": 10.0,
        "recommended_cash_reserve_pct": 30.0,
    },
}

output_path = os.path.join(script_dir, f"weekly_backtest_{date_str}.json")
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)

print(f"[OK] Generated {output_path}")
print(f"  weekly_top10: {len(weekly_top10)} stocks")
print(f"  next_week_top5: {len(next_week_top5)} stocks")
print(f"  POWER COMBO: T1={power_combo.get('t1_win_rate')}% T3={power_combo.get('t3_win_rate')}% T5={power_combo.get('t5_win_rate')}% avgT5={power_combo.get('avg_t5_return')}%")
print(f"  Historical valid records: {power_combo.get('total_valid_records', 0)}")
print(f"  Stop-loss triggers: {power_combo.get('stop_loss_triggers', 0)}")
print(f"  Top sectors: {top_sectors}")
