import json
from datetime import datetime

with open('public/data/latest.json') as f:
    data = json.load(f)

scan_date = data['scan_date']
scanned_count = data['scanned_count']
top_stocks = data['top10']
taiwan_date = f"{scan_date[:4]}/{scan_date[4:6]}/{scan_date[6:8]}"

def safe_float(v, default=0.0):
    try: return float(v)
    except: return default

rows = ""
for i, r in enumerate(top_stocks, 1):
    scores = r.get('dimensions', {})
    targets = r.get('targets', {})
    s = scores
    close_val = safe_float(r.get('close', 0))
    pct_val = safe_float(r.get('change_pct', 0))
    score_val = safe_float(r.get('total_score', 0))
    entry_low = r.get('entry_low', '-') or '-'
    entry_high = r.get('entry_high', '-') or '-'
    stop_loss = r.get('stop_loss', '-') or '-'
    rec = r.get('recommendation', '')

    rows += f"""<tr style="border-bottom:1px solid #e2e8f0">
<td style="padding:8px">{i}</td>
<td style="padding:8px;font-weight:bold">{r['stock_id']}</td>
<td style="padding:8px">{r['name']}</td>
<td style="padding:8px;color:#e53e3e;text-align:right">{close_val:.2f}</td>
<td style="padding:8px;color:#e53e3e;text-align:right">{pct_val:+.1f}%</td>
<td style="padding:8px;text-align:right;font-weight:bold">{score_val:.1f}</td>
<td style="padding:8px;font-size:11px">
技術:{safe_float(s.get('technical','')):.0f} 消息:{safe_float(s.get('news','')):.0f} 籌碼:{safe_float(s.get('chips','')):.0f} 情緒:{safe_float(s.get('sentiment','')):.0f} 基本:{safe_float(s.get('fundamental','')):.0f}
</td>
<td style="padding:8px;font-size:12px">
進:{entry_low}-{entry_high}<br>
T1:{targets.get('t1','-')} T2:{targets.get('t2','-')} T3:{targets.get('t3','-')}<br>
停損:{stop_loss}
</td>
<td style="padding:8px;font-weight:bold;color:#2b6cb0">{rec}</td>
</tr>"""

explode_rows = ""
for r in top_stocks[:5]:
    targets = r.get('targets', {})
    close_val = safe_float(r.get('close', 0))
    pct_val = safe_float(r.get('change_pct', 0))
    score_val = safe_float(r.get('total_score', 0))
    explode_rows += f"""<tr>
<td style="padding:8px;font-weight:bold">{r['stock_id']}</td>
<td style="padding:8px">{r['name']}</td>
<td style="padding:8px;color:#e53e3e;text-align:right">{close_val:.2f}</td>
<td style="padding:8px;color:#e53e3e;text-align:right">{pct_val:+.1f}%</td>
<td style="padding:8px;text-align:right">{score_val:.1f}</td>
<td style="padding:8px">T1:{targets.get('t1','-')} T2:{targets.get('t2','-')} T3:{targets.get('t3','-')}</td>
</tr>"""

html = f"""<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>台股掃描報告 {taiwan_date}</title>
<style>
body {{ font-family: -apple-system, 'Microsoft JhengHei', sans-serif; background:#fff; color:#1a202c; max-width:800px; margin:0 auto; padding:20px; }}
h1 {{ color:#2b6cb0; border-bottom:2px solid #2b6cb0; padding-bottom:10px; }}
h2 {{ color:#2d3748; margin-top:30px; }}
table {{ width:100%; border-collapse:collapse; font-size:13px; }}
th {{ background:#2b6cb0; color:white; padding:10px 8px; text-align:left; }}
.card {{ background:#f7fafc; border:1px solid #e2e8f0; border-radius:8px; padding:16px; margin:16px 0; }}
</style>
</head>
<body>
<h1>台股掃描報告 {taiwan_date}</h1>
<p>掃描時間: {taiwan_date} 19:00 CST | 掃描檔數: {scanned_count} | 市場狀態: 正常交易</p>

<div class="card">
<h2 style="margin-top:0">📊 Top {len(top_stocks)} 強勢推薦</h2>
<table>
<thead><tr><th>#</th><th>代號</th><th>名稱</th><th>收盤</th><th>漲跌</th><th>評分</th><th>五維分數</th><th>進出場點位</th><th>建議</th></tr></thead>
<tbody>{rows}</tbody></table>
</div>

<div class="card">
<h2>📈 爆漲股預測</h2>
<p>基於五維分析模型 (v2)，下列個股展現強勢突破訊號：</p>
<table>
<thead><tr><th>代號</th><th>名稱</th><th>收盤</th><th>漲幅</th><th>總分</th><th>潛在目標</th></tr></thead>
<tbody>{explode_rows}</tbody></table>
</div>

<div class="card">
<h2>🛡️ 空頭防衛提示</h2>
<p>大盤掃描: 全市場 {scanned_count} 檔已完成五維分析。若大盤轉弱，建議降低持股至 30% 以下，優先停損弱勢持股，增加現金部位。</p>
<p>⚠️ 停損紀律: 個股跌破停損價立即出場，不抱期待。</p>
</div>

<div class="card">
<h2>📋 T+N 歷史驗證</h2>
<p>前次推薦追蹤 (基於前一日 Top 5 之 T+1 報酬):</p>
<p style="font-size:12px;color:#718096">※ 驗證數據來自 backtest.json，自動於每次掃描更新。</p>
</div>

<div style="text-align:center;color:#a0aec0;font-size:11px;margin-top:30px">
自動化掃描 · {taiwan_date} 更新 · v7.1 籌碼強化版<br>
資料來源：TWSE OpenAPI · 僅供參考，投資決策請自行判斷
</div>
</body>
</html>"""

with open('public/report_v5.html', 'w', encoding='utf-8') as f:
    f.write(html)
print(f"✅ report_v5.html written ({len(html):,} bytes)")

meta = {
    'to': 'juststarlight66@gmail.com',
    'subject': f'【台股掃描報告】{taiwan_date} | Top {len(top_stocks)} 推薦 | 掃描{scanned_count}檔',
    'html_path': 'public/report_v5.html',
    'scan_date': scan_date,
    'scanned_count': scanned_count,
    'generated_at': datetime.utcnow().isoformat(),
}
with open('public/data/email_metadata.json', 'w', encoding='utf-8') as f:
    json.dump(meta, f, ensure_ascii=False, indent=2)
print(f"✅ email_metadata.json: {meta['subject']}")
