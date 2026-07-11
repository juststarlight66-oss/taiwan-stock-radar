#!/usr/bin/env python3
"""
weekly_report.py -- Generate HTML weekly report from all prediction tracking sources.
Modes: generate (save HTML), send (generate + email via Gmail SMTP).
"""
import json, os, sys, warnings
from datetime import datetime, timedelta, date
from collections import defaultdict
from urllib.request import urlopen, Request

warnings.filterwarnings("ignore")

BASE = "https://juststarlight66-oss.github.io/taiwan-stock-radar"
DATA_FILES = {
    "daily": f"{BASE}/data/predictions_history.json",
    "intraday": f"{BASE}/data/intraday_predictions_history.json",
    "uptrend": f"{BASE}/data/uptrend_predictions_history.json",
}
SCAN_LABELS = {"daily": "Daily Top 10", "intraday": "Intraday Top 5", "uptrend": "Uptrend Top 40"}
SCAN_COLORS = {"daily": "#0ea5e9", "intraday": "#f59e0b", "uptrend": "#10b981"}
TOP_KEYS = {"daily": "top10", "intraday": "top5", "uptrend": "top40"}

EM_DASH = "\u2014"


def fetch_json(url):
    try:
        req = Request(url, headers={"User-Agent": "weekly-report/1.0"})
        with urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  [WARN] Cannot fetch {url}: {e}")
        return []


def week_range(ref=None):
    today = ref or date.today()
    monday = today - timedelta(days=today.weekday())
    return monday, monday + timedelta(days=4)


def filter_week(records, monday, friday):
    result = []
    for r in records:
        sd = r.get("scan_date", "")
        try:
            if len(sd) == 8:
                d = date(int(sd[:4]), int(sd[4:6]), int(sd[6:8]))
            elif "T" in sd:
                d = datetime.fromisoformat(sd).date()
            else:
                d = datetime.strptime(sd[:10], "%Y-%m-%d").date()
        except Exception:
            continue
        if monday <= d <= friday:
            result.append(r)
    return result


def safe_pct(val):
    if val is None:
        return EM_DASH
    return f"{val:+.2f}%"


def compute_stats(records, top_key, has_state=False):
    completed = [r for r in records if r.get("win") is not None]
    pending = [r for r in records if r.get("win") is None]
    n_total = len(records)
    n_complete = len(completed)
    wins = sum(1 for r in completed if r.get("win"))
    losses = n_complete - wins
    wr = wins / n_complete * 100 if n_complete > 0 else None
    avg_t1 = sum(r.get("t1_return") or 0 for r in completed) / n_complete if n_complete > 0 else None
    avg_t3 = sum(r.get("t3_return") or 0 for r in completed) / n_complete if n_complete > 0 else None
    avg_t5 = sum(r.get("t5_return") or 0 for r in completed) / n_complete if n_complete > 0 else None
    best_day = max(completed, key=lambda r: r.get("t1_return") or -999) if completed else None
    worst_day = min(completed, key=lambda r: r.get("t1_return") or 999) if completed else None
    state_counts = defaultdict(int)
    if has_state:
        for r in completed:
            state_counts[r.get("state", "N/A")] += 1
    return {
        "n_total": n_total, "n_complete": n_complete, "n_pending": len(pending),
        "wins": wins, "losses": losses, "win_rate": wr,
        "avg_t1": avg_t1, "avg_t3": avg_t3, "avg_t5": avg_t5,
        "best_day": best_day, "worst_day": worst_day,
        "state_counts": dict(state_counts),
    }


def td(style, text):
    return f'<td style="{style}">{text}</td>'


def render_section(label, color, stats, top_key):
    wr = stats["win_rate"]
    wr_str = f"{wr:.1f}%" if wr is not None else EM_DASH
    wr_color = "#16a34a" if (wr or 0) >= 50 else "#dc2626"
    t1c = "#16a34a" if (stats["avg_t1"] or 0) >= 0 else "#dc2626"
    t3c = "#16a34a" if (stats["avg_t3"] or 0) >= 0 else "#dc2626"
    t5c = "#16a34a" if (stats["avg_t5"] or 0) >= 0 else "#dc2626"

    rows = []
    # Header
    rows.append(f'<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">')
    rows.append(f'<tr><td style="padding:16px 20px;background:{color};border-radius:8px 8px 0 0;"><span style="color:#fff;font-size:16px;font-weight:700;">{label}</span></td></tr>')
    rows.append('<tr><td style="padding:16px 20px;">')

    # KPI row
    rows.append('<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;"><tr>')
    kpis = [
        ("Scans", str(stats["n_total"])),
        ("Verified", str(stats["n_complete"])),
        ("Win Rate", wr_str),
        ("W / L", f'{stats["wins"]}W / {stats["losses"]}L'),
    ]
    for title, val in kpis:
        rows.append(f'<td width="25%" style="text-align:center;padding:8px;"><div style="font-size:11px;color:#6b7280;">{title}</div><div style="font-size:20px;font-weight:700;color:#111827;">{val}</div></td>')
    rows.append('</tr></table>')

    # T+N returns
    rows.append('<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;border:1px solid #f3f4f6;border-radius:6px;">')
    rows.append('<tr style="background:#f9fafb;">')
    for label_tn in ["T+1 avg", "T+3 avg", "T+5 avg"]:
        rows.append(f'<td style="padding:6px 12px;font-size:12px;color:#6b7280;text-align:center;">{label_tn}</td>')
    rows.append('</tr><tr>')
    rows.append(f'<td style="padding:6px 12px;font-size:14px;font-weight:600;text-align:center;color:{t1c};">{safe_pct(stats["avg_t1"])}</td>')
    rows.append(f'<td style="padding:6px 12px;font-size:14px;font-weight:600;text-align:center;color:{t3c};">{safe_pct(stats["avg_t3"])}</td>')
    rows.append(f'<td style="padding:6px 12px;font-size:14px;font-weight:600;text-align:center;color:{t5c};">{safe_pct(stats["avg_t5"])}</td>')
    rows.append('</tr></table>')

    # Best / Worst day
    best = stats.get("best_day")
    worst = stats.get("worst_day")
    if best or worst:
        rows.append('<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f3f4f6;border-radius:6px;">')
        if best:
            bd = best.get("scan_date", "?")[:10]
            bt1 = safe_pct(best.get("t1_return"))
            btop = best.get(top_key, [])
            bstocks = ", ".join(f'{s.get("name","?")}({s.get("stock_id","?")})' for s in btop[:3])
            rows.append(f'<tr><td width="80" style="padding:6px 12px;font-size:12px;color:#16a34a;font-weight:600;">Best</td><td style="padding:6px 12px;font-size:12px;color:#374151;">{bd} T+1=<b style="color:#16a34a;">{bt1}</b> {bstocks}</td></tr>')
        if worst:
            wd = worst.get("scan_date", "?")[:10]
            wt1 = safe_pct(worst.get("t1_return"))
            wtop = worst.get(top_key, [])
            wstocks = ", ".join(f'{s.get("name","?")}({s.get("stock_id","?")})' for s in wtop[:3])
            rows.append(f'<tr><td width="80" style="padding:6px 12px;font-size:12px;color:#dc2626;font-weight:600;">Worst</td><td style="padding:6px 12px;font-size:12px;color:#374151;">{wd} T+1=<b style="color:#dc2626;">{wt1}</b> {wstocks}</td></tr>')
        rows.append('</table>')

    # Market state
    if stats.get("state_counts"):
        sc = stats["state_counts"]
        rows.append(f'<div style="margin-top:8px;font-size:11px;color:#6b7280;">Market: {", ".join(f"{k}: {v}" for k, v in sorted(sc.items()))}</div>')

    rows.append('</td></tr></table>')
    return "\n".join(rows)


def build_html(daily, intraday, uptrend, monday, friday):
    total_n = sum(s["n_total"] for s in [daily, intraday, uptrend])
    total_complete = sum(s["n_complete"] for s in [daily, intraday, uptrend])
    total_wins = sum(s["wins"] for s in [daily, intraday, uptrend])
    total_losses = sum(s["losses"] for s in [daily, intraday, uptrend])
    total_wr = total_wins / total_complete * 100 if total_complete > 0 else None

    week_str = f'{monday.strftime("%m/%d")} ~ {friday.strftime("%m/%d")}'
    now_str = datetime.now().strftime("%Y/%m/%d %H:%M")
    wr_ok = "#16a34a" if (total_wr or 0) >= 50 else "#dc2626"
    wr_disp = f"{total_wr:.1f}%" if total_wr is not None else EM_DASH

    return f"""<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
<tr><td align="center" style="padding:24px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

<tr><td style="padding:24px 24px 16px;background:linear-gradient(135deg,#0f172a,#1e293b);">
<div style="font-size:20px;font-weight:700;color:#fff;">Taiwan Stock Radar Weekly</div>
<div style="font-size:12px;color:#94a3b8;margin-top:4px;">{week_str} | {now_str}</div>
</td></tr>

<tr><td style="padding:16px 24px;border-bottom:1px solid #e5e7eb;">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="33%" style="text-align:center;padding:4px;"><div style="font-size:11px;color:#6b7280;">Total Scans</div><div style="font-size:22px;font-weight:700;color:#111827;">{total_n}</div></td>
<td width="33%" style="text-align:center;padding:4px;"><div style="font-size:11px;color:#6b7280;">Win Rate</div><div style="font-size:22px;font-weight:700;color:{wr_ok};">{wr_disp}</div></td>
<td width="33%" style="text-align:center;padding:4px;"><div style="font-size:11px;color:#6b7280;">W / L</div><div style="font-size:22px;font-weight:700;color:#111827;"><span style="color:#16a34a;">{total_wins}</span> / <span style="color:#dc2626;">{total_losses}</span></div></td>
</tr></table>
</td></tr>

<tr><td style="padding:20px 24px 8px;">
{render_section(SCAN_LABELS["daily"], SCAN_COLORS["daily"], daily, "top10")}
{render_section(SCAN_LABELS["intraday"], SCAN_COLORS["intraday"], intraday, "top5")}
{render_section(SCAN_LABELS["uptrend"], SCAN_COLORS["uptrend"], uptrend, "top40")}
</td></tr>

<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;text-align:center;">
<div style="font-size:11px;color:#9ca3af;">
Auto-generated by Taiwan Stock Radar | For reference only<br>
<a href="https://juststarlight66-oss.github.io/taiwan-stock-radar/" style="color:#0ea5e9;text-decoration:none;">View Dashboard</a>
</div></td></tr>

</table></td></tr></table></body></html>"""


def send_email(html, to_email, week_label):
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    gmail_user = os.environ.get("GMAIL_USER", "juststarlight66@gmail.com")
    gmail_pass = os.environ.get("GMAIL_APP_PASSWORD", "")
    if not gmail_pass:
        print("[ERROR] GMAIL_APP_PASSWORD not set")
        sys.exit(1)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Taiwan Stock Radar Weekly {week_label}"
    msg["From"] = gmail_user
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as s:
            s.login(gmail_user, gmail_pass)
            s.sendmail(gmail_user, [to_email], msg.as_string())
        print(f"[OK] Sent to {to_email}")
    except Exception as e:
        print(f"[ERROR] {e}")
        sys.exit(1)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "generate"
    ref_date = None
    for i, a in enumerate(sys.argv):
        if a == "--week" and i + 1 < len(sys.argv):
            ref_date = datetime.strptime(sys.argv[i + 1], "%Y-%m-%d").date()

    monday, friday = week_range(ref_date)
    week_label = f'{monday.strftime("%m/%d")} ~ {friday.strftime("%m/%d")}'
    print(f"=== Weekly Report {week_label} ===")

    stats = {}
    for key in ["daily", "intraday", "uptrend"]:
        print(f"Fetching {key}...")
        records = fetch_json(DATA_FILES[key])
        week_records = filter_week(records, monday, friday)
        has_state = (key == "daily")
        stats[key] = compute_stats(week_records, TOP_KEYS[key], has_state)
        print(f"  {len(week_records)} records, {stats[key]['n_complete']} verified")

    html = build_html(stats["daily"], stats["intraday"], stats["uptrend"], monday, friday)

    out_path = os.environ.get("WEEKLY_REPORT_PATH", "weekly_report.html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"[OK] Saved to {out_path} ({len(html)} bytes)")

    if mode == "send":
        to_email = os.environ.get("REPORT_TO_EMAIL", "juststarlight66@gmail.com")
        send_email(html, to_email, week_label)

    # Print summary
    print()
    for key, label in SCAN_LABELS.items():
        s = stats[key]
        wr = f"{s['win_rate']:.1f}%" if s["win_rate"] is not None else "--"
        print(f"  {label}: {s['wins']}W/{s['losses']}L ({wr}), T+1={safe_pct(s['avg_t1'])}")


if __name__ == "__main__":
    main()
