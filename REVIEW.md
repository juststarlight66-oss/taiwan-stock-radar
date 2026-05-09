# 部署審核紀錄 (REVIEW LOG)

> **規則：所有分身（AI Agent）在觸發部署 / 發佈前，必須先提交本文件更新，並等待 Software Engineer 確認無誤後方可執行。**

---

## 2026-05-09 今日更新摘要

### 前端元件變更

| 檔案 | 變更說明 | 狀態 |
|------|----------|------|
| `components/StockDetailModal.tsx` | AI 白話文摘要強化（ `aiSummary` 欄位）；動態持有期間顯示（T+1/T+3/T+5）；新增 `scanDate` prop 傳遞 | ✅ 已 revert |
| `components/Top10Table.tsx` | 新增 `scanDate` prop 並傳入 `StockDetailModal`；調整 badge / 評分列布局 | ✅ 已 revert |

### Commit 紀錄

| Commit SHA | 說明 |
|------------|------|
| `dd75389` (`dd7538950e35...`) | 今日前端更新（StockDetailModal + Top10Table） |
| `85bc026` (`85bc0265c95f...`) | Revert：還原至今日更新前版本（blob `c52dda6` / `3fe2d0a`） |

### 系統/流程變更

| 項目 | 說明 |
|------|------|
| 部署審核 SOP | 新增本文件（REVIEW.md）與 AGENTS.md 規範，要求所有分身部署前須經 SE 審核 |
| GitHub Pages | 由 `main` branch 自動觸發，Build #234 執行後已回滾 |

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
| GitHub Agent | 讀取 repo、建立 branch、建立 PR | push to main、觸發 workflow、更新觸發器 |
| AI (飆股獵手) | 掃描、產出報告、寄送 Email | 修改 public JSON 結構、新增掃描邏輯 |
| Nebula (Orchestrator) | 排程觸發器讀取 | 新增/修改/刪除觸發器 |

---

## 審核記錄

| 日期 | 審核人 | 項目 | 結果 | 備註 |
|------|--------|------|------|------|
| 2026-05-09 | Darren（Software Engineer） | 建立審核機制 + 今日 revert | APPROVED | 首次建立 SOP |
