# 部署審核紀錄 (REVIEW LOG)

> **規則：所有分身（AI Agent）在觸發部署 / 發佈前，必須先提交本文件更新，並等待 Software Engineer 確認無誤後方可執行。**

---

## 2026-05-09 今日更新摘要

### 前端元件變更

| 檔案 | 變更說明 | 狀態 |
|------|----------|------|
| `components/StockDetailModal.tsx` | AI 白話文摘要強化（`aiSummary` 欄位）；動態持有期間顯示（T+1/T+3/T+5）；新增 `scanDate` prop 傳遞 | ✅ 已 revert |
| `components/Top10Table.tsx` | 新增 `scanDate` prop 並傳入 `StockDetailModal`；調整 badge / 評分列布局 | ✅ 已 revert |

### Commit 紀錄

| Commit SHA | 說明 |
|------------|------|
| `dd75389` (`dd7538950e35...`) | 今日前端更新（StockDetailModal + Top10Table） |
| `85bc026` (`85bc0265c95f...`) | Revert：還原至今日更新前版本（blob `c52dda6` / `3fe2d0a`） |
| `5a6fe33` | chore: scan-daily.yml 加入 cron schedule（TW 19:00 = UTC 11:00，週一至週五） |

### 系統/流程變更

| 項目 | 說明 |
|------|------|
| 部署審核 SOP | 新增本文件（REVIEW.md）與 AGENTS.md 規範，要求所有分身部署前須經 SE 審核 |
| GitHub Pages | 由 `main` branch 自動觸發，Build #234 執行後已回滾 |
| 每日 19:00 自動掃描 | Darren 指示：每日台灣交易日 19:00 觸發掃描，更新主頁與所有子頁。@trigger:1900 已 active；scan-daily.yml 已補上 cron 備援 |

---

## 📢 全分身廣播通知（2026-05-09）

### Darren 指令
> 「每日台灣交易日的時間 19:00 記得觸發每日推薦掃描，並且更新在主頁以及其他子頁上。」

### SE 審核決定：**APPROVED**

### 各分身執行 SOP

#### 🤖 AI Agent（飆股獵手）
- **觸發時機**：每日週一至週五 台灣時間 19:00（UTC 11:00）
- **執行任務**：
  1. 執行全市場五維分析掃描（scan_market.py）
  2. 執行 post_scan.py 更新所有 public JSON
  3. 更新以下資料檔案：
     - `public/data/latest.json`（主頁資料）
     - `public/data/all_scores.json`（所有評分）
     - `public/data/index.json`（首頁索引）
     - `public/data/scan_result_YYYYMMDD.json`（每日快照）
     - `public/data/backtest.json`（回測資料）
  4. git push 至 main
  5. 觸發 deploy.yml → GitHub Pages 自動部署
  6. Email 寄送完整報告給 Darren（juststarlight66@gmail.com）
- **不可自主**：修改掃描邏輯、改動 JSON 結構 → 須 SE 審核

#### 🐙 GitHub Agent
- **觸發時機**：同上，或由 AI Agent 呼叫後處理
- **執行任務**：
  1. 確認 workflow run 成功
  2. 若失敗，回報 SE 並發出 Email 告警
  3. 更新 REVIEW.md 記錄每次執行結果
- **不可自主**：push to main（已由 GitHub Actions 處理）、修改 workflow 檔案 → 須 SE 審核

#### 🌐 Nebula（Orchestrator）
- **觸發時機**：@trigger:1900（cron `0 11 * * 1-5`，已 active）
- **執行任務**：
  1. 呼叫 AI Agent 執行掃描任務
  2. 備援：若 Nebula trigger 失效，GitHub Actions cron 自動接手
- **雙重保險機制**：
  - 主觸發：@trigger:1900（Nebula cron）
  - 備援觸發：scan-daily.yml schedule（GitHub Actions cron）

#### 📊 頁面更新範圍

| 頁面 | 對應資料來源 | 更新方式 |
|------|-------------|----------|
| 主頁（/） | `latest.json` | GitHub Pages 自動部署 |
| 個股詳情 | `all_scores.json` | 同上 |
| 歷史掃描 | `scan_result_YYYYMMDD.json` | 同上 |
| 回測報告 | `backtest.json` | 同上 |
| 盤中快照 | `intraday.json` | @trigger:intraday-1300（13:00）另行觸發 |

---

## 審核 SOP

### 觸發部署前的標準流程

```
1. AI Agent 完成程式碼變更
2. AI Agent 更新 REVIEW.md，列出變更摘要
3. AI Agent 通知 Software Engineer（@Darren / 負責人）
4. Software Engineer 審核 REVIEW.md 與 diff
5. Software Engineer 確認「APPROVED」後，AI Agent 才可執行：
   - git push / commit to main
   - 觸發 GitHub Actions workflow
   - 更新觸發器（triggers）
6. 若 Software Engineer 回覆「REJECT」，AI Agent 必須修正後重新提交審核
```

### 緊急回滾程序

```
1. 立即通知 Software Engineer
2. 使用 Git Data API 找到前一版 blob SHA
3. 建立新 tree → 新 commit → 更新 main ref（不強制 push，保留 parent chain）
4. 確認 GitHub Pages 重新部署成功
5. 在本文件補充 revert 記錄
```

### 各分身權限說明

| 分身 | 允許自主操作 | 需 SE 審核 |
|------|-------------|------------|
| GitHub Agent | 讀取 repo、建立 branch、建立 PR、確認 workflow 狀態 | push to main、觸發 workflow、更新觸發器、修改 workflow 檔案 |
| AI（飆股獵手） | 掃描、產出報告、寄送 Email、更新 public JSON（例行掃描） | 修改 JSON 結構、新增掃描邏輯、異動 scan_market.py |
| Nebula（Orchestrator） | 排程觸發器讀取、呼叫分身執行例行任務 | 新增/修改/刪除觸發器 |

---

## 審核記錄

| 日期 | 審核人 | 項目 | 結果 | 備註 |
|------|--------|------|------|------|
| 2026-05-09 | Darren（Software Engineer） | 建立審核機制 + 今日 revert | APPROVED | 首次建立 SOP |
| 2026-05-09 | Darren（Software Engineer） | 每日 19:00 自動掃描排程啟用 + 全分身廣播 SOP | APPROVED | scan-daily.yml 加入 cron；@trigger:1900 確認 active |
