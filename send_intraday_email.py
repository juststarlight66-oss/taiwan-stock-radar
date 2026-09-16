import json, smtplib, os, sys
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

BASE = "/home/nebula/projects/juststarlight66-oss/taiwan-stock-radar"

with open(os.path.join(BASE, "public/data/intraday.json"), encoding="utf-8") as f:
    intraday = json.load(f)
with open(os.path.join(BASE, "public/data/reversal_60min.json"), encoding="utf-8") as f:
    rev = json.load(f)

top5 = intraday.get("stocks", [])
rev_stocks = rev.get("stocks", [])
scanned = intraday.get("scanned_count", 1958)
qualified = intraday.get("qualified_count", 0)

# MM/DD from scanned_at
scanned_at = intraday.get("scanned_at", "2026-09-16")
date_mmd = scanned_at[5:10].replace("-", "/")

def f1(v):
    return f"{float(v):.1f}"

top5_rows = ""
for s in top5:
    sid = s["stock_id"]
    name = s["name"]
    score = f"{s['score']:.1f}"
    chg = f"+{s['change_pct']:.1f}%"
    sector = f"{s['sector']}({s['sector_momentum']})"
    entry = f1(s["entry"])
    target = f1(s["target"])
    stop = f1(s["stop_loss"])
    top5_rows += (
        f"<tr><td>{sid}</td><td>{name}</td><td>{score}</td>"
        f"<td style='color:#c0392b;font-weight:600'>{chg}</td>"
        f"<td>{sector}</td><td>{entry}</td><td>{target}</td><td>{stop}</td></tr>"
    )

if rev_stocks:
    rev_rows = ""
    for s in rev_stocks:
        kd = s.get("kd", s.get("kd_value", ""))
        macd = s.get("macd_state", s.get("macd", ""))
        rev_rows += (
            f"<tr><td>{s['stock_id']}</td><td>{s['name']}</td><td>{s.get('score', '')}</td>"
            f"<td>{s.get('day_change_pct', '')}</td><td>{kd}</td><td>{macd}</td></tr>"
        )
    rev_body = (
        "<table style='width:100%;border-collapse:collapse;font-size:13px;min-width:560px;'>"
        "<thead><tr style='background:#fff4e6;color:#a05a00;'>"
        "<th>股號</th><th>股名</th><th>評分</th><th>日內漲跌幅%</th><th>KD值</th><th>MACD狀態</th>"
        "</tr></thead><tbody>" + rev_rows + "</tbody></table>"
    )
else:
    rev_body = "<p style='text-align:center;color:#888;padding:18px 0;margin:0'>今日無 60 分 K 翻紅訊號</p>"

subject = f"【盤中掃描】{date_mmd} 12:30 | 隔日衝 Top5 + 60分K翻紅訊號"
if not top5 and not rev_stocks:
    subject = f"【盤中掃描】{date_mmd} | 今日無強勢標的（市場整理）"

html = f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>盤中掃描 {date_mmd} 12:30</title>
</head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:'Segoe UI','微軟正黑體',Arial,sans-serif;color:#2c3e50;">
<div style="max-width:640px;margin:0 auto;padding:20px 12px;">

  <!-- 隔日衝 Top5 -->
  <div style="border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#6a11cb,#2575fc);padding:16px 20px;">
      <h2 style="margin:0;color:#fff;font-size:18px;">隔日衝 Top5</h2>
      <p style="margin:4px 0 0;color:#e3e3ff;font-size:12px;">掃描 {scanned:,} 檔 | 合格 {qualified} 檔 | {date_mmd} 12:29</p>
    </div>
    <div style="background:#fff;overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:600px;">
        <thead>
          <tr style="background:#f0f2ff;color:#4a4a8a;">
            <th style="padding:10px 8px;border-bottom:2px solid #ddd;">股號</th>
            <th style="padding:10px 8px;border-bottom:2px solid #ddd;">股名</th>
            <th style="padding:10px 8px;border-bottom:2px solid #ddd;">評分</th>
            <th style="padding:10px 8px;border-bottom:2px solid #ddd;">漲幅%</th>
            <th style="padding:10px 8px;border-bottom:2px solid #ddd;">族群</th>
            <th style="padding:10px 8px;border-bottom:2px solid #ddd;">建議進場</th>
            <th style="padding:10px 8px;border-bottom:2px solid #ddd;">目標</th>
            <th style="padding:10px 8px;border-bottom:2px solid #ddd;">停損</th>
          </tr>
        </thead>
        <tbody>
          {top5_rows}
        </tbody>
      </table>
    </div>
  </div>

  <div style="height:16px;"></div>

  <!-- 60分K翻紅候選 -->
  <div style="border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#f7971e,#ffd200);padding:16px 20px;">
      <h2 style="margin:0;color:#fff;font-size:18px;text-shadow:0 1px 1px rgba(0,0,0,0.15);">60分K翻紅候選</h2>
      <p style="margin:4px 0 0;color:#fff8e0;font-size:12px;">KD金叉 + MACD底部 + 量縮止跌</p>
    </div>
    <div style="background:#fff;overflow-x:auto;">
      {rev_body}
    </div>
  </div>

  <p style="text-align:center;color:#9aa0a6;font-size:11px;margin:18px 0 0;">
    本掃描於台灣時間 12:30 盤中執行，資料來源 yfinance，僅供參考。
  </p>
</div>
</body>
</html>"""

# Send via Gmail SMTP
gmail_user = os.environ.get("GMAIL_USER", "")
app_pw = os.environ.get("GMAIL_APP_PASSWORD", "")
from_addr = gmail_user if ("@" in gmail_user) else (gmail_user + "@gmail.com")
to_addr = "juststarlight66@gmail.com"

# Dump final payload for the email-capable agent to send
payload = {"to": to_addr, "subject": subject, "html": html}
with open("/home/nebula/intraday_email_payload.json", "w", encoding="utf-8") as pf:
    json.dump(payload, pf, ensure_ascii=False, indent=2)
print("PAYLOAD_WRITTEN html_chars:", len(html))

msg = MIMEMultipart("alternative")
msg["Subject"] = subject
msg["From"] = from_addr
msg["To"] = to_addr
msg.attach(MIMEText(html, "html", "utf-8"))

try:
    server = smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=60)
    server.login(gmail_user, app_pw)
    server.sendmail(from_addr, [to_addr], msg.as_string())
    server.quit()
    print("EMAIL_SENT_OK")
    print("subject:", subject)
    print("top5_count:", len(top5), "rev_count:", len(rev_stocks), "html_chars:", len(html))
except Exception as e:
    print("EMAIL_SENT_FAIL:", repr(e))
    sys.exit(1)
