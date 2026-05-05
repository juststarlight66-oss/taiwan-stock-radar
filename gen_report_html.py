#!/usr/bin/env python3
"""Generate updated report_v5.html from latest.json. DO NOT output index.html — that is Next.js App territory."""

import json
from datetime import datetime, date

# ── Load latest scan data ──
with open("public/data/latest.json") as f:
    data = json.load(f)

scan_date = data["scan_date"]
top10 = data["top10"]

# Taiwan date format
year = int(scan_date[:4])
month = int(scan_date[4:6])
day = int(scan_date[6:8])
scan_dt = date(year, month, day)
taiwan_date = f"{year-1911}/{month:02d}/{day:02d}"

# ── Dimension labels ──
DIM_NAMES = {
    "technical": "技術面", "fundamental": "基本面", "news": "消息面",
    "sentiment": "情緒面", "chips": "籌碼面"
}

# ── Recommendation tag colors ──
def rec_tag(rec: str) -> str:
    if "積極買進" in rec or "強力買進" in rec:
        return "#e53e3e", "#fed7d7"
    if "逢低佈局" in rec or "買進" in rec:
        return "#dd6b20", "#feebc8"
    if "小量試單" in rec or "觀望" in rec:
        return "#3182ce", "#bee3f8"
    return "#718096", "#e2e8f0"

def dim_bar(value, max_val=28):
    """Render a small color bar for dimension scores"""
    pct = min(value / max_val, 1.0)
    if pct >= 0.8:
        color = "#38a169"  # green
    elif pct >= 0.5:
        color = "#d69e2e"  # yellow
    else:
        color = "#e53e3e"  # red
    width = int(pct * 80)
    return f'<div style="width:{width}px;height:6px;background:{color};border-radius:3px;display:inline-block;"></div>'


# ── Build Top 10 table rows ──
def build_top10_tbody():
    rows = []
    for i, r in enumerate(top10, 1):
        dims = r["dimensions"]
        strat = r.get("strategy", {})
        rec = strat.get("recommendation", "")
        entry = strat.get("entry", "")
        stop = strat.get("stop_loss", "")
        bg, tag_bg = rec_tag(rec)

        # Medal for top 3
        medal = {1: "🥇", 2: "🥈", 3: "🥉"}.get(i, f"#{i}")

        dim_bars = " ".join(
            f'<span style="font-size:10px;color:#718096;">{DIM_NAMES.get(k,k)} {v:.0f}</span> {dim_bar(v)}'
            for k, v in dims.items()
        )

        row = f'''        <tr style="border-bottom:1px solid #edf2f7;">
          <td style="padding:10px 6px;vertical-align:top;">
            <span style="font-weight:700;font-size:15px;color:#1a202c;">{medal}</span>
          </td>
          <td style="padding:10px 6px;vertical-align:top;">
            <span style="font-weight:700;color:#2d3748;">{r['stock_id']}</span>
            <span style="color:#4a5568;font-size:13px;">{r['name']}</span>
          </td>
          <td style="padding:10px 6px;vertical-align:top;text-align:right;">
            <span style="font-weight:700;color:#2d3748;">{r['close']}</span>
          </td>
          <td style="padding:10px 6px;vertical-align:top;text-align:right;">
            <span style="color:{'#38a169' if r['change_pct']>0 else '#e53e3e'};font-weight:600;">{r['change_pct']:+.2f}%</span>
          </td>
          <td style="padding:10px 8px;vertical-align:top;">
            <span style="font-weight:700;font-size:16px;color:#e53e3e;">{r['total_score']:.1f}</span>
          </td>
          <td style="padding:10px 8px;vertical-align:top;font-size:11px;">
            {dim_bars}
          </td>
          <td style="padding:10px 8px;vertical-align:top;">
            <span style="background:{tag_bg};color:{bg};padding:2px 8px;border-radius:4px;
                         font-size:11px;font-weight:600;white-space:nowrap;">{rec}</span>
          </td>
          <td style="padding:10px 8px;vertical-align:top;font-size:11px;color:#718096;text-align:right;">
            {entry}<br><span style="color:#e53e3e;">停損 {stop}</span>
          </td>
        </tr>'''
        rows.append(row)
    return "\n".join(rows)


# ── Build Top 5 explosive prediction cards ──
def build_top5_cards():
    cards = []
    for i, r in enumerate(top10[:5], 1):
        dims = r["dimensions"]
        strat = r.get("strategy", {})
        rec = strat.get("recommendation", "")
        entry = strat.get("entry", "")
        stop = strat.get("stop_loss", "")
        bg, tag_bg = rec_tag(rec)

        # Find top dimension
        top_dim = max(dims.items(), key=lambda x: x[1])
        top_dim_name = DIM_NAMES.get(top_dim[0], top_dim[0])

        # price range
        if r['change_pct'] > 0:
            change_html = f'<span style="color:#38a169;font-weight:600;">+{r["change_pct"]:.2f}%</span>'
        else:
            change_html = f'<span style="color:#e53e3e;font-weight:600;">{r["change_pct"]:.2f}%</span>'

        card = f'''                     <tr>
                        <td style="padding:8px 0;vertical-align:top;width:28px;">
                          <span style="font-weight:800;font-size:16px;color:#e53e3e;">#{i}</span>
                        </td>
                        <td style="padding:8px 8px;vertical-align:top;">
                          <span style="font-weight:700;color:#2d3748;">{r['stock_id']} {r['name']}</span>
                        </td>
                        <td style="padding:8px 8px;vertical-align:top;text-align:right;">
                          <span style="font-weight:700;">{r['close']}</span><br>
                          {change_html}
                        </td>
                        <td style="padding:8px 8px;vertical-align:top;text-align:right;">
                          <span style="font-weight:700;font-size:16px;color:#e53e3e;">{r['total_score']:.1f}</span>
                          <br><span style="font-size:10px;color:#718096;">總分</span>
                        </td>
                        <td style="padding:8px 8px;vertical-align:top;">
                          <span style="background:{tag_bg};color:{bg};padding:2px 6px;border-radius:3px;
                                       font-size:10px;font-weight:600;">{rec}</span>
                          <br><span style="font-size:10px;color:#718096;">{top_dim_name}領先 · 進:{entry} 停:{stop}</span>
                        </td>
                      </tr>'''
        cards.append(card)
    return "\n".join(cards)


# ── Notes based on scan quality ──
def build_notes():
    notes = []
    scanned = data.get("scanned_count", 0)
    notes.append(f"📊 掃描 {scanned} 檔 · 籌碼強化 v7.1（T86 ≥ 500 張門檻 + 量 ≥ 1000 張排除 + 市值過濾）")
    
    # Count dimensions with strong scores
    strong_dims = []
    for d_name, d_label in DIM_NAMES.items():
        avg = sum(r["dimensions"][d_name] for r in top10) / len(top10)
        if avg >= 7:
            strong_dims.append(f"{d_label}領先")
    if strong_dims:
        notes.append(f"🎯 本日特徵：{' · '.join(strong_dims)}")

    return "\n".join(f'<li style="margin-bottom:4px;font-size:13px;color:#4a5568;">{n}</li>' for n in notes)


# ═══════════════════════════════════════════════════════════════
# Build full HTML
# ═══════════════════════════════════════════════════════════════

top10_tbody = build_top10_tbody()
top5_cards = build_top5_cards()
notes_html = build_notes()

HTML = f'''<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>台股掃描報告 {taiwan_date}</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Helvetica Neue',Arial,sans-serif;">

<!-- ── 外層包裝 ── -->
<table style="width:100%;border-collapse:collapse;background:#f0f4f8;">
  <tr>
    <td style="padding:20px 10px;">
      <table style="max-width:660px;width:100%;margin:0 auto;border-collapse:collapse;">

        <!-- ╔══════════════════════════════╗ -->
        <!-- ║  刊頭 (白底 + 紅底線)        ║ -->
        <!-- ╚══════════════════════════════╝ -->
        <tr>
          <td style="padding:0 0 2px 0;">
            <div style="background:#ffffff;border-bottom:3px solid #e53e3e;
                        border-radius:8px 8px 0 0;padding:20px 24px 16px;">
              <table style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="vertical-align:middle;padding:0;width:5px;">
                    <div style="width:5px;height:40px;background:#e53e3e;border-radius:3px;"></div>
                  </td>
                  <td style="vertical-align:middle;padding:0 0 0 14px;">
                    <div style="font-size:22px;font-weight:800;color:#1a202c;letter-spacing:0.5px;
                                line-height:1.2;">台股掃描報告</div>
                    <div style="font-size:14px;color:#718096;margin-top:2px;">{taiwan_date}</div>
                  </td>
                  <td style="vertical-align:middle;text-align:right;padding:0;">
                    <div style="background:#e53e3e;color:#fff;padding:6px 14px;border-radius:20px;
                                font-size:12px;font-weight:700;display:inline-block;">v7.1 · 籌碼強化</div>
                  </td>
                </tr>
              </table>
            </div>
          </td>
        </tr>

        <!-- ╔══════════════════════════════╗ -->
        <!-- ║  掃描摘要與統計              ║ -->
        <!-- ╚══════════════════════════════╝ -->
        <tr>
          <td style="padding:0 0 16px 0;">
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:0 0 8px 8px;
                        padding:16px 24px;">
              <div style="font-size:14px;font-weight:700;color:#1a202c;margin-bottom:8px;">
                📋 掃描摘要
              </div>
              <ul style="margin:0;padding:0 0 0 18px;">
                {notes_html}
              </ul>
            </div>
          </td>
        </tr>

        <!-- ╔══════════════════════════════╗ -->
        <!-- ║  爆漲股預測 Top 5            ║ -->
        <!-- ╚══════════════════════════════╝ -->
        <tr>
          <td style="padding:0 0 16px 0;">
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;
                        padding:20px 20px 8px;">
              <div style="border-left:4px solid #e53e3e;padding-left:10px;margin-bottom:16px;">
                <div style="font-size:14px;font-weight:700;color:#1a202c;">🔥 爆漲預測 Top 5</div>
                <div style="font-size:11px;color:#a0aec0;">五維綜合評分最高 · 依總分排序</div>
              </div>
              <table style="width:100%;border-collapse:collapse;">
                <thead>
                  <tr style="border-bottom:2px solid #e2e8f0;">
                    <th style="padding:6px 8px;text-align:left;font-size:11px;color:#a0aec0;">#</th>
                    <th style="padding:6px 8px;text-align:left;font-size:11px;color:#a0aec0;">股票</th>
                    <th style="padding:6px 8px;text-align:right;font-size:11px;color:#a0aec0;">收盤</th>
                    <th style="padding:6px 8px;text-align:right;font-size:11px;color:#a0aec0;">總分</th>
                    <th style="padding:6px 8px;text-align:left;font-size:11px;color:#a0aec0;">策略</th>
                  </tr>
                </thead>
                <tbody>
{top5_cards}
                </tbody>
              </table>
            </div>
          </td>
        </tr>

        <!-- ╔══════════════════════════════╗ -->
        <!-- ║  Top 10 綜合排行             ║ -->
        <!-- ╚══════════════════════════════╝ -->
        <tr>
          <td style="padding:0 0 16px 0;">
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;
                        padding:20px 20px 8px;">
              <div style="border-left:4px solid #e53e3e;padding-left:10px;margin-bottom:16px;">
                <div style="font-size:14px;font-weight:700;color:#1a202c;">📊 Top 10 綜合評分排行</div>
                <div style="font-size:11px;color:#a0aec0;">完整五維評估 · 含進出場策略建議</div>
              </div>
              <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                  <tr style="border-bottom:2px solid #e2e8f0;">
                    <th style="padding:6px 4px;text-align:left;font-size:11px;color:#a0aec0;">#</th>
                    <th style="padding:6px 4px;text-align:left;font-size:11px;color:#a0aec0;">股票</th>
                    <th style="padding:6px 4px;text-align:right;font-size:11px;color:#a0aec0;">收盤</th>
                    <th style="padding:6px 4px;text-align:right;font-size:11px;color:#a0aec0;">漲跌</th>
                    <th style="padding:6px 4px;text-align:center;font-size:11px;color:#a0aec0;">總分</th>
                    <th style="padding:6px 4px;text-align:left;font-size:11px;color:#a0aec0;">五維分佈</th>
                    <th style="padding:6px 4px;text-align:left;font-size:11px;color:#a0aec0;">策略</th>
                    <th style="padding:6px 4px;text-align:right;font-size:11px;color:#a0aec0;">進/停損</th>
                  </tr>
                </thead>
                <tbody>
{top10_tbody}
                </tbody>
              </table>
            </div>
          </td>
        </tr>

        <!-- ╔══════════════════════════════╗ -->
        <!-- ║  Footer                     ║ -->
        <!-- ╚══════════════════════════════╝ -->
        <tr>
          <td style="padding:10px 0 20px;text-align:center;">
            <div style="font-size:11px;color:#a0aec0;">
              自動化掃描 · {scan_dt.strftime('%Y/%m/%d')} 更新 · v7.1 籌碼強化版<br>
              資料來源：TWSE OpenAPI · 僅供參考，投資決策請自行判斷
            </div>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>'''

# ── Write report_v5.html ──
with open("public/report_v5.html", "w", encoding="utf-8") as f:
    f.write(HTML)
print(f"✅ report_v5.html written ({len(HTML):,} bytes)")

# ⚠️  DO NOT write index.html — it belongs to the Next.js App (npm run build).
# Writing public/index.html overwrites the interactive web app with a static email template.

print(f"\n📊 Top 10 summary:")
for i, r in enumerate(top10, 1):
    print(f"  {i}. {r['stock_id']} {r['name']:　<4s} | {r['total_score']:.1f} | {r.get('strategy',{}).get('recommendation','')}")
