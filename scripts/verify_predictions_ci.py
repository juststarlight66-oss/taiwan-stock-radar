#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CI 版本的預測驗證腳本
在 GitHub Actions 中執行，從 gh-pages 讀取 scan_result.json，
使用 yfinance 計算 T+1/T+3/T+5 實際報酬率。
"""

import json
import os
import sys
import warnings
warnings.filterwarnings('ignore')

from datetime import datetime, timedelta
from typing import Dict, List, Optional
import pathlib

try:
    import yfinance as yf
    import pandas as pd
    import numpy as np
except ImportError:
    import subprocess
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'yfinance', 'pandas', 'numpy', '-q'])
    import yfinance as yf
    import pandas as pd
    import numpy as np


# ── 路徑設定 ───────────────────────────────────
# GitHub Actions: gh-pages checkout at gh-pages-data/
GH_PAGES_DIR = pathlib.Path('gh-pages-data/data')
if not GH_PAGES_DIR.exists():
    # Fallback for local testing
    GH_PAGES_DIR = pathlib.Path('/home/sprite/tasks/2255')

OUTPUT_DIR = pathlib.Path('.')


def get_stock_ticker(symbol: str) -> str:
    """將 TWSE 代碼轉換為 yfinance 格式"""
    symbol = symbol.strip()
    if len(symbol) == 4 and symbol.isdigit():
        return f"{symbol}.TW"
    elif len(symbol) == 4:
        return f"{symbol}.TWO"
    return f"{symbol}.tw"


def fetch_historical_prices(symbol: str, start_date: datetime, end_date: datetime) -> Optional[pd.DataFrame]:
    """抓取歷史股價數據"""
    try:
        ticker = yf.Ticker(get_stock_ticker(symbol))
        df = ticker.history(start=start_date, end=end_date + timedelta(days=1))
        if df.empty:
            return None
        return df
    except Exception as e:
        print(f"  [WARN] {symbol} yfinance fail: {e}")
        return None


def calculate_returns(entry_price: float, prices: List[float]) -> Dict[str, Optional[float]]:
    """計算 T+1, T+3, T+5 報酬率"""
    returns = {}
    for period in [1, 3, 5]:
        if len(prices) >= period:
            ret = (prices[period - 1] - entry_price) / entry_price * 100
            returns[f'T+{period}'] = round(ret, 2)
        else:
            returns[f'T+{period}'] = None
    return returns


def load_scan_result() -> Optional[Dict]:
    """讀取掃描結果"""
    # 優先從環境變數指定的日期
    scan_date_input = os.environ.get('SCAN_DATE_INPUT', '')
    
    if scan_date_input:
        file_path = GH_PAGES_DIR / f'scan_result_{scan_date_input}.json'
        if file_path.exists():
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        print(f"[WARN] scan_result_{scan_date_input}.json not found, trying fallback")
    
    # 使用最近的日期檔案
    yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y%m%d')
    file_path = GH_PAGES_DIR / f'scan_result_{yesterday}.json'
    if file_path.exists():
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    # 嘗試 scan_result.json
    file_path = GH_PAGES_DIR / 'scan_result.json'
    if file_path.exists():
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        scan_date = data.get('scan_date', '')
        if scan_date:
            try:
                scan_dt = datetime.strptime(scan_date, '%Y/%m/%d')
                days_diff = (datetime.now() - scan_dt).days
                print(f"[INFO] scan_result.json date: {scan_date} ({days_diff} days ago)")
            except:
                pass
        return data
    
    print(f"[ERROR] No scan result found in {GH_PAGES_DIR}")
    return None


def extract_top_stocks(data: Dict, top_n: int = 10) -> List[Dict]:
    """從掃描結果提取 Top N 股票"""
    stocks = []
    
    # 嘗試多種可能的結構
    top10 = data.get('top10', [])
    if not top10:
        top10 = data.get('top_10', [])
    if not top10:
        all_stocks = data.get('stocks', data.get('all_stocks', []))
        # Sort by total_score descending
        all_stocks = sorted(all_stocks, key=lambda x: x.get('total_score', 0), reverse=True)
        top10 = all_stocks[:top_n]
    
    for s in top10[:top_n]:
        stocks.append({
            'symbol': s.get('symbol', s.get('stock_id', '')),
            'name': s.get('name', ''),
            'entry_price': s.get('entry_price', s.get('price', s.get('close', 0))),
            'total_score': s.get('total_score', 0),
            'dimensions': s.get('dimensions', s.get('scores', {})),
            'stop_loss': s.get('stop_loss', s.get('stop_loss_price')),
            'targets': s.get('targets', s.get('target_prices', [])),
        })
    
    return stocks


def load_dimension_accuracy_history() -> List[Dict]:
    """讀取歷史準確率記錄"""
    history_file = GH_PAGES_DIR / 'predictions_history.json'
    if history_file.exists():
        with open(history_file, 'r', encoding='utf-8') as f:
            try:
                return json.load(f)
            except:
                return []
    return []


def compute_dimension_accuracy(history: List[Dict]) -> Dict[str, float]:
    """從歷史記錄計算各維度平均準確率"""
    dim_hits = {}
    dim_counts = {}
    
    for record in history:
        for stock_result in record.get('stock_results', []):
            dims = stock_result.get('dimensions', {})
            t1 = stock_result.get('T+1')
            is_win = t1 is not None and t1 > 0
            for dim_name, score in dims.items():
                if dim_name not in dim_hits:
                    dim_hits[dim_name] = 0
                    dim_counts[dim_name] = 0
                dim_counts[dim_name] += 1
                if is_win:
                    dim_hits[dim_name] += 1
    
    accuracy = {}
    for dim in dim_hits:
        if dim_counts[dim] > 0:
            accuracy[dim] = round(dim_hits[dim] / dim_counts[dim] * 100, 1)
        else:
            accuracy[dim] = 0.0
    
    return accuracy


def main():
    print("=" * 60)
    print(f"  台股五維分析 - 預測驗證 (CI)")
    print(f"  執行時間：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    # 載入掃描結果
    data = load_scan_result()
    if not data:
        print("[FATAL] Cannot load scan result, aborting.")
        sys.exit(1)
    
    scan_date_str = data.get('scan_date', 'unknown')
    try:
        scan_date = datetime.strptime(scan_date_str, '%Y/%m/%d')
    except:
        scan_date = datetime.now() - timedelta(days=1)
    
    print(f"\n掃描日期：{scan_date_str}")
    print(f"全市場掃描數：{data.get('scanned_count', 'N/A')}")
    
    top_n = int(os.environ.get('TOP_N', '10'))
    stocks = extract_top_stocks(data, top_n)
    print(f"\n提取 Top {len(stocks)} 推薦標的：")
    for i, s in enumerate(stocks):
        print(f"  {i+1}. {s['symbol']} {s['name']} (進場: {s['entry_price']}, 評分: {s['total_score']})")
    
    # 計算實際報酬率
    print(f"\n{'='*60}")
    print(f"  計算實際報酬率 (T+1 / T+3 / T+5)")
    print(f"{'='*60}")
    
    end_date = datetime.now()
    start_date = scan_date - timedelta(days=5)
    
    stock_results = []
    holding_paths_updated = 0
    
    for stock in stocks:
        symbol = stock['symbol']
        entry_price = stock['entry_price']
        if not entry_price or entry_price <= 0:
            print(f"\n  {symbol} {stock['name']}: SKIP (no entry price)")
            continue
        
        print(f"\n  {symbol} {stock['name']}:")
        print(f"    進場價：{entry_price}")
        
        df = fetch_historical_prices(symbol, start_date, end_date)
        if df is None or df.empty:
            print(f"    [FAIL] 無法取得股價")
            continue
        
        # 找到掃描日之後的收盤價
        closes = []
        for idx, row in df.iterrows():
            if idx.date() > scan_date.date():
                closes.append(float(row['Close']))
        
        print(f"    取得 {len(closes)} 個交易日收盤價")
        
        returns = calculate_returns(entry_price, closes)
        for period, ret in returns.items():
            status = "✓" if ret is not None and ret > 0 else "✗" if ret is not None else "?"
            ret_str = f"{ret:+.2f}%" if ret is not None else "N/A"
            print(f"    {period}: {status} {ret_str}")
        
        stock_results.append({
            'symbol': symbol,
            'name': stock['name'],
            'entry_price': entry_price,
            'total_score': stock['total_score'],
            'dimensions': stock['dimensions'],
            'T+1': returns.get('T+1'),
            'T+3': returns.get('T+3'),
            'T+5': returns.get('T+5'),
            'closes_count': len(closes),
        })
        holding_paths_updated += 1
    
    # 計算各維度準確率
    dimension_accuracy = {}
    for result in stock_results:
        dims = result.get('dimensions', {})
        t1_win = result.get('T+1') is not None and result['T+1'] > 0
        for dim_name, score in dims.items():
            if dim_name not in dimension_accuracy:
                dimension_accuracy[dim_name] = {'hits': 0, 'total': 0}
            dimension_accuracy[dim_name]['total'] += 1
            if t1_win:
                dimension_accuracy[dim_name]['hits'] += 1
    
    dim_accuracy_pct = {}
    for dim, counts in dimension_accuracy.items():
        if counts['total'] > 0:
            dim_accuracy_pct[dim] = round(counts['hits'] / counts['total'] * 100, 1)
        else:
            dim_accuracy_pct[dim] = 0.0
    
    # 載入歷史 + 追加新記錄
    history = load_dimension_accuracy_history()
    current_record = {
        'scan_date': scan_date_str,
        'verify_date': datetime.now().strftime('%Y-%m-%d'),
        'verify_timestamp': datetime.now().isoformat(),
        'stock_results': stock_results,
        'dimension_accuracy': dim_accuracy_pct,
        'holding_paths_updated': holding_paths_updated,
    }
    history.append(current_record)
    
    # 整體準確率
    cumulative_accuracy = compute_dimension_accuracy(history)
    
    # 輸出結果
    output = {
        'verify_date': datetime.now().strftime('%Y-%m-%d'),
        'scan_date': scan_date_str,
        'actual_returns': [
            {
                'symbol': r['symbol'],
                'name': r['name'],
                'entry_price': r['entry_price'],
                'total_score': r['total_score'],
                'T+1': r['T+1'],
                'T+3': r['T+3'],
                'T+5': r['T+5'],
            }
            for r in stock_results
        ],
        'dimension_accuracy': dim_accuracy_pct,
        'cumulative_accuracy': cumulative_accuracy,
        'holding_paths_updated': holding_paths_updated,
        'stocks_verified': len(stock_results),
    }
    
    print(f"\n{'='*60}")
    print(f"  驗證結果摘要")
    print(f"{'='*60}")
    print(json.dumps(output, ensure_ascii=False, indent=2))
    
    # 儲存檔案
    with open('predictions_history.json', 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False, indent=2)
    print(f"\n[OK] predictions_history.json saved ({len(history)} records)")
    
    with open('holding_paths.json', 'w', encoding='utf-8') as f:
        json.dump({'last_updated': datetime.now().isoformat(), 'paths_updated': holding_paths_updated}, f, ensure_ascii=False, indent=2)
    print(f"[OK] holding_paths.json saved")
    
    print(f"\n完成！")


if __name__ == '__main__':
    main()
