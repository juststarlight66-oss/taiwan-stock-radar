#!/usr/bin/env python3
"""
Next Week Top5 Scan
===================
Reads latest.json top10, selects top 5 by score, calculates stop-loss/target/risk-reward,
and predicts next week's layout picks.

Usage: python next_week_scan.py [--output PATH] [--repo ROOT]
"""

import argparse, json, os, sys, shutil
from datetime import datetime, timedelta


def find_repo_root():
    """Auto-detect repo root."""
    for start in [os.path.dirname(os.path.abspath(__file__)), os.getcwd(),
                  os.environ.get('REPO_DIR', '')]:
        if not start:
            continue
        path = start
        for _ in range(5):
            if os.path.isdir(os.path.join(path, 'public', 'data')):
                return os.path.abspath(path)
            if os.path.isdir(os.path.join(path, '..', 'public', 'data')):
                return os.path.abspath(os.path.join(path, '..'))
            path = os.path.join(path, '..')
    for candidate in ['/home/nebula/projects/juststarlight66-oss/taiwan-stock-radar',
                      '/home/nebula/taiwan-stock-radar']:
        if os.path.isdir(os.path.join(candidate, 'public', 'data')):
            return candidate
    raise RuntimeError("Cannot find repo root with public/data/")


def load_latest(repo_root):
    """Load latest.json."""
    latest_path = os.path.join(repo_root, 'public', 'data', 'latest.json')
    with open(latest_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def next_monday(scan_date_str):
    """Given a scan_date YYYYMMDD, find the next Monday."""
    dt = datetime.strptime(scan_date_str, "%Y%m%d")
    days_ahead = 0 - dt.weekday()
    if days_ahead <= 0:
        days_ahead += 7
    monday = dt + timedelta(days=days_ahead)
    return monday.strftime("%Y-%m-%d")


def compute_risk_params(entry_price, stop_loss_pct=2.0, target_pct=12.0):
    """Compute stop-loss, target, and risk-reward ratio."""
    stop_loss = round(entry_price * (1 - stop_loss_pct / 100), 2)
    target = round(entry_price * (1 + target_pct / 100), 2)
    risk = entry_price - stop_loss
    reward = target - entry_price
    risk_reward = round(reward / risk, 2) if risk > 0 else 0
    return stop_loss, target, risk_reward


def extract_dimension_scores(stock, data):
    """Extract dimension-level scores from all_stock_scores if available."""
    all_scores = data.get('all_stock_scores', [])
    stock_id = stock.get('stock_id', '')

    momentum = 0
    volume_score = 0
    breakout = 0
    fundamental_score = 0

    for s in all_scores:
        if s.get('stock_id') == stock_id:
            momentum = s.get('momentum_score', s.get('momentum', 0))
            volume_score = s.get('volume_score', s.get('volume', 0))
            breakout = s.get('breakout_score', s.get('breakout', 0))
            fundamental_score = s.get('fundamental_score', s.get('fundamental', 0))
            break

    return momentum, volume_score, breakout, fundamental_score


def main():
    parser = argparse.ArgumentParser(description="Next Week Top5 Scan")
    parser.add_argument("--output", default="", help="Output JSON path")
    parser.add_argument("--repo", default="", help="Repo root path")
    args = parser.parse_args()

    repo_root = args.repo or find_repo_root()
    print(f"Repo root: {repo_root}")

    data = load_latest(repo_root)
    top10 = data.get('top10', [])
    scan_date = data.get('scan_date', '')
    scanned_count = data.get('scanned_count', 0)

    print(f"Scan date: {scan_date}, Top10: {len(top10)}, Scanned: {scanned_count}")

    # Determine strategy week (next Monday)
    strategy_week = next_monday(scan_date)
    print(f"Strategy week: {strategy_week}")

    # Take top 5 by total_score
    sorted_top10 = sorted(top10, key=lambda x: x.get('total_score', 0), reverse=True)
    top5 = sorted_top10[:5]

    # Compute avg score
    avg_score = round(sum(s.get('total_score', 0) for s in top10) / len(top10), 2) if top10 else 0

    # Build next_week picks
    picks = []
    for stock in top5:
        entry_price = stock.get('close', stock.get('entry_price', 0))
        stop_loss, target, rr_ratio = compute_risk_params(entry_price)
        momentum, vol_score, brk, fund = extract_dimension_scores(stock, data)

        picks.append({
            "stock_id": stock.get("stock_id", ""),
            "name": stock.get("name", ""),
            "scan_date": scan_date,
            "strategy_week": strategy_week,
            "entry_price": entry_price,
            "stop_loss": stop_loss,
            "target": target,
            "risk_reward_ratio": rr_ratio,
            "total_score": stock.get("total_score", 0),
            "sector": stock.get("sector", ""),
            "sector_boost": stock.get("sector_boost", 0),
            "momentum": stock.get("momentum_score", momentum),
            "volume_score": stock.get("volume_score", vol_score),
            "breakout": stock.get("breakout_score", brk),
            "fundamental_score": stock.get("fundamental_score", fund),
            "signal": "BUY",
        })

    # Build report
    now = datetime.now()
    report = {
        "report_date": scan_date,
        "report_type": "next_week_scan",
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%S+08:00"),
        "strategy_week": strategy_week,
        "market_condition": {
            "scan_date": scan_date,
            "scanned_stocks": scanned_count,
            "avg_score": avg_score,
        },
        "next_week_top5": picks,
        "risk_disclaimer": "本報告僅供參考，投資決策應自行評估風險。停損務必嚴格執行。"
    }

    # Output
    out_path = args.output
    if not out_path:
        out_path = os.path.join(repo_root, 'tasks', '2255', f'next_week_top5_{scan_date}.json')

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    # Also copy to gh-pages/data
    gh_pages_data = os.path.join(repo_root, 'gh-pages', 'data')
    if not os.path.isdir(gh_pages_data):
        gh_pages_data = os.path.join(repo_root, 'public', 'data')
    dest = os.path.join(gh_pages_data, os.path.basename(out_path))
    shutil.copy2(out_path, dest)

    print(f"\nNext Week Top5 Report: {out_path}")
    for i, p in enumerate(picks, 1):
        print(f"  #{i} {p['stock_id']} {p['name']}: score={p['total_score']}, "
              f"entry={p['entry_price']}, stop={p['stop_loss']}, "
              f"target={p['target']}, R:R={p['risk_reward_ratio']}")


if __name__ == "__main__":
    main()
