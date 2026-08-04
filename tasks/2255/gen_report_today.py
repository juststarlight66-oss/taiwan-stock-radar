#!/usr/bin/env python3
"""
gen_report_today.py - Generate report_v5.html and email_metadata.json from latest.json
"""
import json
import os
import datetime
import pytz

tz = pytz.timezone('Asia/Taipei')
now = datetime.datetime.now(tz)

script_dir = os.path.dirname(os.path.abspath(__file__))
repo_root = os.path.abspath(os.path.join(script_dir, '..', '..'))
data_dir = os.path.join(repo_root, 'public', 'data')

# Load latest.json
latest_path = os.path.join(data_dir, 'latest.json')
with open(latest_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

scan_date = data.get('scan_date', now.strftime('%Y%m%d'))
scanned_count = data.get('scanned_count', 0)
top_stocks = data.get('top_stocks', [])
explode_top5 = data.get('explode_top5', [])
generated_at = data.get('generated_at', now.isoformat())

# Load backtest data
backtest_path = os.path.join(data_dir, 'backtest.json')
backtest_data = {}
backtest_avg_return = 0
backtest_win_rate = 0
if os.path.exists(backtest_path):
    with open(backtest_path, 'r', encoding='utf-8') as f:
        backtest_data = json.load(f)
    history = backtest_data.get('history', [])
    if history:
        returns = [h.get('avg_return', 0) for h in history[-10:] if h.get('avg_return') is not None]
        wins = [h.get('win_rate', 0) for h in history[-10:] if h.get('win_rate') is not None]
        if returns:
            backtest_avg_return = round(sum(returns) / len(returns), 2)
        if wins:
            backtest_win_rate = round(sum(wins) / len(wins), 2)

# Format date for display
date_display = f"{scan_date[:4]}/{scan_date[4:6]}/{scan_date[6:8]}"

# Dimension labels
DIM_LABELS = {
    'technical': '技術面',
    'fundamental': '基本面',
    'news': '消息面',
    'sentiment': '情緒面',
    'chips': '籌碼面'
}

def score_bar(score, max_score=100):
    pct = min(100, max(0, (score / max_score) * 100))
    color = '#e74c3c' if pct < 40 else '#f39c12' if pct < 60 else '#27ae60' if pct < 80 else '#2ecc71'
    return f'<div style="background:#e9ecef;border-radius:4px;height:8px;"><div style="width:{pct:.0f}%;background:{color};height:8px;border-radius:4px;"></div></div>'

def format_pct(v):
    if v is None:
        return '-'
    return f"+{v:.1f}%" if v > 0 else f"{v:.1f}%"

def rec_badge(rec):
    colors = {
        '強力買進': ('#c0392b', '#fff'),
        '買進': ('#27ae60', '#fff'),
        '觀望': ('#7f8c8d', '#fff'),
        '減碼': ('#2c3e50', '#fff'),
    }
    bg, fg = colors.get(rec, ('#95a5a6', '#fff'))
    return f'<span style="background:{bg};color:{fg};padding:2px 8px;border-radius:12px;font-size:12px;font-weight:bold;">{rec}</span>'

# Build Top 10 table rows
top10_rows = ''
for i, s in enumerate(top_stocks[:10], 1):
    sid = s.get('stock_id', '')
    name = s.get('name', '')
    score = s.get('total_score', 0)
    close = s.get('close', '-')
    change_pct = s.get('change_pct', 0)
    rec = s.get('recommendation', '觀望')
    targets = s.get('targets', {})
    if isinstance(targets, dict):
        entry_low = targets.get('entry_low', s.get('entry_low', '-'))
        entry_high = targets.get('entry_high', s.get('entry_high', '-'))
        stop_loss = targets.get('stop_loss', s.get('stop_loss', '-'))
        t1 = targets.get('t1', '-')
        t2 = targets.get('t2', '-')
        t3 = targets.get('t3', '-')
    else:
        entry_low = s.get('entry_low', '-')
        entry_high = s.get('entry_high', '-')
        stop_loss = s.get('stop_loss', '-')
        t1 = targets[0] if len(targets) > 0 else '-'
        t2 = targets[1] if len(targets) > 1 else '-'
        t3 = targets[2] if len(targets) > 2 else '-'
    scores = s.get('scores', {})

    change_color = '#e74c3c' if change_pct > 0 else '#27ae60' if change_pct < 0 else '#666'
    change_str = format_pct(change_pct)

    dim_bars = ''
    for dk, dl in DIM_LABELS.items():
        dv = scores.get(dk, 0)
        dim_bars += f'<div style="margin:2px 0;"><span style="font-size:10px;color:#666;display:inline-block;width:45px;">{dl}</span>{score_bar(dv)}</div>'

    top10_rows += f'''
    <tr style="border-bottom:1px solid #f0f0f0;">
      <td style="padding:12px 8px;text-align:center;font-weight:bold;color:#666;">#{i}</td>
      <td style="padding:12px 8px;">
        <div style="font-weight:bold;font-size:15px;">{name}</div>
        <div style="color:#888;font-size:12px;">{sid}</div>
      </td>
      <td style="padding:12px 8px;text-align:center;">
        <div style="font-size:20px;font-weight:bold;color:#2c3e50;">{score:.1f}</div>
        {score_bar(score)}
      </td>
      <td style="padding:12px 8px;text-align:center;">
        <div style="font-size:16px;font-weight:bold;">{close}</div>
        <div style="color:{change_color};font-size:13px;">{change_str}</div>
      </td>
      <td style="padding:12px 8px;">
        {dim_bars}
      </td>
      <td style="padding:12px 8px;text-align:center;font-size:13px;">
        <div>進場: {entry_low}~{entry_high}</div>
        <div style="color:#e74c3c;">停損: {stop_loss}</div>
      </td>
      <td style="padding:12px 8px;text-align:center;font-size:13px;">
        <div style="color:#27ae60;">T1: {t1}</div>
        <div style="color:#2980b9;">T2: {t2}</div>
        <div style="color:#8e44ad;">T3: {t3}</div>
      </td>
      <td style="padding:12px 8px;text-align:center;">{rec_badge(rec)}</td>
    </tr>'''

# Build explode prediction cards
explode_cards = ''
for i, s in enumerate(explode_top5[:5], 1):
    sid = s.get('stock_id', '')
    name = s.get('name', '')
    prob = s.get('explode_prob', 0)
    score = s.get('total_score', 0)
    close = s.get('close', '-')
    change_pct = s.get('change_pct', 0)
    prob_pct = prob * 100
    prob_color = '#e74c3c' if prob_pct >= 70 else '#f39c12' if prob_pct >= 50 else '#3498db'
    change_str = format_pct(change_pct)
    change_color = '#e74c3c' if change_pct > 0 else '#27ae60' if change_pct < 0 else '#666'

    explode_cards += f'''
    <div style="background:#fff;border:1px solid #e9ecef;border-radius:10px;padding:16px;margin:8px;flex:1;min-width:160px;max-width:200px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <div style="font-size:28px;font-weight:bold;color:{prob_color};">{prob_pct:.0f}%</div>
      <div style="font-size:11px;color:#888;margin-bottom:8px;">爆漲機率</div>
      <div style="font-weight:bold;font-size:15px;">{name}</div>
      <div style="color:#888;font-size:12px;margin-bottom:6px;">{sid}</div>
      <div style="font-size:16px;font-weight:bold;">{close}</div>
      <div style="color:{change_color};font-size:12px;">{change_str}</div>
      <div style="margin-top:8px;font-size:11px;color:#999;">五維評分: {score:.1f}</div>
    </div>'''

# Build backtest summary
def fmt_r(v):
    if v is None:
        return '<span style="color:#aaa">待驗證</span>'
    color = '#e74c3c' if v > 0 else '#27ae60' if v < 0 else '#666'
    return f'<span style="color:{color}">{format_pct(v)}</span>'

grouped = backtest_data.get('grouped_records', [])
backtest_rows = ''
if grouped and isinstance(grouped, list):
    recent = sorted(grouped, key=lambda x: x.get('scan_date', ''), reverse=True)[:5]
    for grp in recent:
        scan_date_bt = grp.get('scan_date', '-')
        periods = grp.get('periods', {})
        # periods may have t1/t3/t5 data per stock
        if isinstance(periods, dict):
            for period_key, period_data in list(periods.items())[:3]:
                if isinstance(period_data, list):
                    for rec in period_data[:2]:
                        sid = rec.get('stock_id', '')
                        name = rec.get('name', '')
                        t1r = rec.get('t1_return') or rec.get('return')
                        t3r = rec.get('t3_return')
                        t5r = rec.get('t5_return')
                        backtest_rows += f'''<tr style="border-bottom:1px solid #f5f5f5;">
                          <td style="padding:8px;">{scan_date_bt}</td>
                          <td style="padding:8px;">{sid} {name}</td>
                          <td style="padding:8px;text-align:center;">{fmt_r(t1r)}</td>
                          <td style="padding:8px;text-align:center;">{fmt_r(t3r)}</td>
                          <td style="padding:8px;text-align:center;">{fmt_r(t5r)}</td>
                        </tr>'''
        else:
            backtest_rows += f'''<tr style="border-bottom:1px solid #f5f5f5;">
              <td style="padding:8px;">{scan_date_bt}</td>
              <td colspan="4" style="padding:8px;color:#aaa;">資料處理中</td>
            </tr>'''
elif isinstance(grouped, dict):
    recent = sorted(grouped.items(), reverse=True)[:5]
    for date_key, records in recent:
        for rec in (records[:3] if isinstance(records, list) else []):
            sid = rec.get('stock_id', '')
            name = rec.get('name', '')
            t1r = rec.get('t1_return')
            t3r = rec.get('t3_return')
            t5r = rec.get('t5_return')
            backtest_rows += f'''<tr style="border-bottom:1px solid #f5f5f5;">
              <td style="padding:8px;">{date_key}</td>
              <td style="padding:8px;">{sid} {name}</td>
              <td style="padding:8px;text-align:center;">{fmt_r(t1r)}</td>
              <td style="padding:8px;text-align:center;">{fmt_r(t3r)}</td>
              <td style="padding:8px;text-align:center;">{fmt_r(t5r)}</td>
            </tr>'''

# Full HTML report
html = f'''<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>【台股掃描報告】{date_display}</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:#f8f9fa; margin:0; padding:0; color:#2c3e50; }}
  .container {{ max-width:1100px; margin:0 auto; padding:20px; }}
  .header {{ background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460); color:#fff; padding:32px; border-radius:12px; margin-bottom:24px; text-align:center; }}
  .header h1 {{ margin:0 0 8px; font-size:24px; }}
  .header .subtitle {{ opacity:.8; font-size:14px; }}
  .stats {{ display:flex; gap:16px; margin-bottom:24px; flex-wrap:wrap; }}
  .stat-card {{ flex:1; min-width:140px; background:#fff; border-radius:10px; padding:20px; text-align:center; box-shadow:0 2px 8px rgba(0,0,0,0.06); }}
  .stat-card .value {{ font-size:28px; font-weight:bold; color:#2c3e50; }}
  .stat-card .label {{ font-size:12px; color:#888; margin-top:4px; }}
  .section {{ background:#fff; border-radius:12px; padding:24px; margin-bottom:24px; box-shadow:0 2px 8px rgba(0,0,0,0.06); }}
  .section h2 {{ margin:0 0 20px; font-size:18px; color:#2c3e50; border-bottom:2px solid #e9ecef; padding-bottom:10px; }}
  table {{ width:100%; border-collapse:collapse; }}
  th {{ background:#f8f9fa; padding:10px 8px; text-align:left; font-size:13px; color:#666; font-weight:600; }}
  .explode-grid {{ display:flex; flex-wrap:wrap; gap:8px; }}
  .footer {{ text-align:center; color:#888; font-size:12px; padding:20px; }}
  @media(max-width:600px) {{ .stats {{ flex-direction:column; }} }}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>🎯 台股五維分析掃描報告</h1>
    <div class="subtitle">{date_display} | 掃描 {scanned_count} 檔 | 生成時間: {now.strftime("%H:%M")} TWN</div>
  </div>

  <div class="stats">
    <div class="stat-card">
      <div class="value">{scanned_count}</div>
      <div class="label">掃描股票數</div>
    </div>
    <div class="stat-card">
      <div class="value">{len(top_stocks)}</div>
      <div class="label">Top 推薦數</div>
    </div>
    <div class="stat-card">
      <div class="value">{backtest_win_rate:.0f}%</div>
      <div class="label">近期勝率</div>
    </div>
    <div class="stat-card">
      <div class="value">{format_pct(backtest_avg_return)}</div>
      <div class="label">近期平均報酬</div>
    </div>
  </div>

  <div class="section">
    <h2>🚀 爆漲股預測 Top 5</h2>
    <div class="explode-grid">
      {explode_cards}
    </div>
  </div>

  <div class="section">
    <h2>📊 Top 10 五維評分排行</h2>
    <div style="overflow-x:auto;">
      <table>
        <thead>
          <tr>
            <th>排名</th>
            <th>股票</th>
            <th>總評分</th>
            <th>股價</th>
            <th>五維分析</th>
            <th>進出場</th>
            <th>目標價</th>
            <th>建議</th>
          </tr>
        </thead>
        <tbody>
          {top10_rows}
        </tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <h2>📈 T+N 歷史驗證</h2>
    <p style="color:#888;font-size:13px;margin-bottom:16px;">最近推薦標的的實際績效追蹤（T+1/T+3/T+5）</p>
    <div style="overflow-x:auto;">
      <table>
        <thead>
          <tr>
            <th>掃描日期</th>
            <th>股票</th>
            <th>T+1 報酬</th>
            <th>T+3 報酬</th>
            <th>T+5 報酬</th>
          </tr>
        </thead>
        <tbody>
          {backtest_rows if backtest_rows else '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:20px;">尚無驗證資料</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

  <div class="footer">
    <p>此報告由台股雷達自動生成 | {generated_at} | <a href="https://juststarlight66-oss.github.io/taiwan-stock-radar/" style="color:#3498db;">線上版本</a></p>
    <p style="color:#aaa;font-size:11px;">⚠️ 本報告僅供參考，不構成投資建議。投資有風險，請審慎評估。</p>
  </div>
</div>
</body>
</html>'''

# Write report
report_path = os.path.join(script_dir, 'report_v5.html')
with open(report_path, 'w', encoding='utf-8') as f:
    f.write(html)
print(f"Written: {report_path} ({len(html)} bytes)")

# Write email_metadata.json
meta = {
    "to": "juststarlight66@gmail.com",
    "subject": f"【台股掃描報告】{date_display} | Top {len(top_stocks)} 推薦 | 掃描{scanned_count}檔",
    "html_path": report_path,
    "scan_date": scan_date,
    "scanned_count": scanned_count,
    "top10_count": len(top_stocks),
    "backtest_avg_return": backtest_avg_return,
    "backtest_win_rate": backtest_win_rate,
    "generated_at": now.isoformat()
}
meta_path = os.path.join(script_dir, 'email_metadata.json')
with open(meta_path, 'w', encoding='utf-8') as f:
    json.dump(meta, f, ensure_ascii=False, indent=2)
print(f"Written: {meta_path}")
print(f"Subject: {meta['subject']}")
print(f"Top stocks: {[s.get('name') for s in top_stocks[:5]]}")
