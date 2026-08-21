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

# Load reversal_60min.json (next-day prediction)
reversal_path = os.path.join(data_dir, 'reversal_60min.json')
reversal_next_stocks = []
reversal_scanned_at = ""
try:
    if os.path.exists(reversal_path):
        with open(reversal_path, encoding='utf-8') as f:
            rv = json.load(f)
        reversal_next_stocks = rv.get('next_day', {}).get('stocks', [])
        reversal_scanned_at = rv.get('scanned_at', '')
except Exception as e:
    print(f"Warning: could not load reversal_60min.json: {e}")

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
# Build next-day reversal rows
def build_reversal_rows(stocks):
    if not stocks:
        return '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:20px;">今日無符合條件的次日翻紅候選</td></tr>'
    rows = []
    for i, s in enumerate(stocks[:10]):
        rank = i + 1
        name = s.get('name', '')
        sid  = s.get('stock_id', '')
        score= s.get('score', 0)
        dc   = s.get('prev_day_change_pct', 0)
        sigs = ' + '.join(s.get('signals', [])) or '綜合訊號'
        price= s.get('current_price', 0)
        t1   = s.get('target_1', 0)
        stop = s.get('stop_loss', 0)
        note = s.get('strategy_note', '')
        score_color = '#27ae60' if score >= 50 else '#e67e22' if score >= 35 else '#95a5a6'
        dc_color = '#e74c3c' if dc < 0 else '#27ae60'
        rows.append(f'''<tr style="background:{'#fff' if rank%2==0 else '#f9f9f9'}">
          <td style="padding:8px;text-align:center;font-weight:bold;color:#555;">{rank}</td>
          <td style="padding:8px;"><strong>{sid}</strong><br><span style="font-size:11px;color:#666;">{name}</span></td>
          <td style="padding:8px;text-align:center;color:{score_color};font-weight:bold;">{score}</td>
          <td style="padding:8px;text-align:center;color:{dc_color};">{dc:+.1f}%</td>
          <td style="padding:8px;font-size:11px;color:#2980b9;">{sigs}</td>
          <td style="padding:8px;font-size:11px;">進:{price:.1f} 目標:{t1:.1f} 止:{stop:.1f}</td>
        </tr>''')
    return '\n'.join(rows)

reversal_rows = build_reversal_rows(reversal_next_stocks)
reversal_count = len(reversal_next_stocks)
reversal_note = f"共 {reversal_count} 檔候選，掃描於 {reversal_scanned_at}" if reversal_count > 0 else "今日無符合條件標的"

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

  <!-- 次日翻紅預測區塊 -->
  <div style="background:#fff;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,0.06);border-left:4px solid #8e44ad;">
    <h2 style="color:#8e44ad;margin:0 0 4px;font-size:18px;">🔮 次日翻紅觀察名單</h2>
    <p style="color:#888;font-size:12px;margin:0 0 14px;">{reversal_note} | 昨日尾盤底部訊號共振，明日開盤留意</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#8e44ad;color:#fff;">
          <th style="padding:8px;width:40px;">#</th>
          <th style="padding:8px;text-align:left;">股票</th>
          <th style="padding:8px;width:60px;">評分</th>
          <th style="padding:8px;width:70px;">昨跌幅</th>
          <th style="padding:8px;text-align:left;">訊號</th>
          <th style="padding:8px;text-align:left;">進出場</th>
        </tr>
      </thead>
      <tbody>
        {reversal_rows}
      </tbody>
    </table>
    <p style="color:#aaa;font-size:10px;margin:10px 0 0;">⚠️ 次日翻紅預測基於昨日60分K指標，僅供參考，開盤確認後再進場</p>
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
    "subject": (
        f"【台股掃描報告】{date_display} | Top {len(top_stocks)} 推薦"
        + (f" | 🔮次日翻紅{len(reversal_next_stocks)}檔" if reversal_next_stocks else "")
        + f" | 掃描{scanned_count}檔"
    ),
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

# ── 輸出 60分K 翻紅獨立 Email 資料 ─────────────────────────────────────────
try:
    import json as _json, os as _os

    _rv_path = reversal_path  # already loaded above
    _rv_data = {}
    if _os.path.exists(_rv_path):
        with open(_rv_path, encoding='utf-8') as _f:
            _rv_data = _json.load(_f)

    _scanned = _rv_data.get('scanned_count', 0)
    _pre = _rv_data.get('pre_filtered', 0)
    _qualified = _rv_data.get('qualified_count', 0)
    _next_stocks = _rv_data.get('next_day', {}).get('stocks', [])
    _next_count = len(_next_stocks)
    _scan_time = _rv_data.get('scanned_at', '')
    _date_disp = (_scan_time[5:10].replace('-', '/') if _scan_time else
                  __import__('datetime').date.today().strftime('%m/%d'))

    if _next_count > 0:
        _subj = f'【60分K翻紅策略】{_date_disp} | 次日翻紅{_next_count}檔 | 掃描{_scanned}檔'
    elif _qualified > 0:
        _subj = f'【60分K翻紅策略】{_date_disp} | 當日{_qualified}檔底部訊號 | 掃描{_scanned}檔'
    else:
        _subj = f'【60分K翻紅策略】{_date_disp} | 今日無訊號（大漲/大跌日）| 掃描{_scanned}檔'

    if _pre == 0:
        _mkt = '今日市場全面大漲或大跌，跌幅 -4%~+0.5% 範圍內無標的，底部反轉策略不適用。'
    elif _qualified == 0 and _next_count == 0:
        _mkt = f'今日 {_pre} 檔進入跌幅篩選，但均未達底部共振門檻。大漲日資金全面進場，底部訊號難以形成。'
    else:
        _mkt = ''

    def _rows(stocks):
        if not stocks:
            return ''
        rs = ''.join(
            f"<tr><td style='padding:6px 12px;border-bottom:1px solid #eee;font-weight:bold'>{s.get('stock_id','')} {s.get('name','')}</td>"
            f"<td style='padding:6px 12px;border-bottom:1px solid #eee;text-align:center'>{s.get('score',0):.0f}</td>"
            f"<td style='padding:6px 12px;border-bottom:1px solid #eee;color:#e53e3e'>{s.get('day_change_pct', s.get('prev_day_change_pct', 0)):+.1f}%</td>"
            f"<td style='padding:6px 12px;border-bottom:1px solid #eee;font-size:12px'>{'+'.join(s.get('signals', [])) or '—'}</td>"
            f"<td style='padding:6px 12px;border-bottom:1px solid #eee'>{s.get('entry_price', s.get('entry', '—'))}</td>"
            f"<td style='padding:6px 12px;border-bottom:1px solid #eee;color:#38a169'>{s.get('target_2', s.get('target_1', '—'))}</td>"
            f"<td style='padding:6px 12px;border-bottom:1px solid #eee;color:#e53e3e'>{s.get('stop_loss', '—')}</td></tr>"
            for s in stocks[:15]
        )
        return f"""<table style='width:100%;border-collapse:collapse;font-size:13px'>
          <tr style='background:#f5f0ff;font-weight:bold'>
            <th style='padding:8px 12px;text-align:left'>股票</th><th style='padding:8px 12px'>評分</th>
            <th style='padding:8px 12px'>跌幅</th><th style='padding:8px 12px;text-align:left'>觸發訊號</th>
            <th style='padding:8px 12px'>進場</th><th style='padding:8px 12px'>目標</th><th style='padding:8px 12px'>停損</th>
          </tr>{rs}</table>"""

    _today_sec = (f"<h3 style='color:#6b46c1'>🔔 當日底部共振訊號</h3>{_rows(_rv_data.get('stocks',[]))}"
                  if _rv_data.get('stocks') else '')
    _next_sec = (f"<h3 style='color:#6b46c1'>🔮 次日翻紅預測（昨日底部共振）</h3>{_rows(_next_stocks)}"
                 if _next_stocks else '')
    _no_sig = (f"""<div style='background:#fff8e1;border-left:4px solid #f6c000;padding:16px;margin:20px 0;border-radius:4px'>
        <strong>今日無底部反轉訊號</strong><br>{_mkt}<br><br>
        <strong>策略說明：</strong>60分K翻紅策略尋找「當日微跌但盤中出現底部共振」的標的，
        篩選跌幅 -4%~+0.5% 且達 KD金叉／MACD底部／量縮止跌共振的個股。<br>
        大漲日或大跌日均不適用，請等待盤整日或震盪日。
      </div>""" if not _today_sec and not _next_sec else '')

    _html = f"""<html><body style='font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;color:#333'>
      <div style='background:linear-gradient(135deg,#6b46c1,#9f7aea);padding:20px;border-radius:8px;color:white;margin-bottom:20px'>
        <h1 style='margin:0;font-size:22px'>🔮 60分K線翻紅底部反轉策略</h1>
        <p style='margin:8px 0 0;opacity:0.9'>{_scan_time[:10] if _scan_time else ''} | 掃描 {_scanned} 檔 | 篩選 {_pre} 檔 | 當日訊號 {_qualified} 檔 | 次日預測 {_next_count} 檔</p>
      </div>
      {_no_sig}{_today_sec}{_next_sec}
      <div style='margin-top:32px;padding:12px;background:#f8f8f8;border-radius:4px;font-size:11px;color:#888'>
        本報告由台股飆股獵手 AI 自動生成 | 60分K翻紅策略 v1.0 | 每日 19:00 自動執行 | 掃描時間 {_scan_time}
      </div>
    </body></html>"""

    _meta_path = _os.path.join(data_dir, 'reversal_email_meta.json')
    with open(_meta_path, 'w', encoding='utf-8') as _mf:
        _json.dump({'subject': _subj, 'body': _html, 'generated_at': _scan_time,
                    'next_count': _next_count, 'qualified_count': _qualified}, _mf, ensure_ascii=False)
    print(f'[reversal_email] meta written: {_subj}')
except Exception as _e:
    print(f'[reversal_email] 生成失敗（非致命）: {_e}')
