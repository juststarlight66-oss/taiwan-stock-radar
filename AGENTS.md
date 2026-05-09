<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:deployment-review-rules -->
## 部署審核規範（所有 AI 分身必須遵守）

> **在執行以下任何操作前，必須先取得 Software Engineer（@Darren）的明確書面確認（APPROVED）：**

### 需要審核的操作
- Push / commit 至 `main` branch
- 觸發或手動啟動 GitHub Actions workflow
- 新增、修改、刪除任何觸發器（triggers / cron jobs）
- 修改 `public/data/` 下的 JSON 資料結構（新增欄位除外，但須備註）
- 修改掃描核心邏輯（`lib/scanTypes.ts`、`scripts/`、`gen_report_html.py` 等）

### 審核流程
1. 更新 `REVIEW.md`，列出本次變更摘要
2. 通知 Software Engineer 進行審核
3. 等待 APPROVED 回覆後才可執行部署
4. 若收到 REJECT，修正後重新提交

### 不需要審核的操作（可自主執行）
- 讀取 repo 內容、搜尋檔案
- 建立 feature branch 或 PR（不 merge）
- 產出報告、寄送 Email（不修改 main branch）
- 在 REVIEW.md 補充紀錄

詳細 SOP 請參閱 [REVIEW.md](./REVIEW.md)。
<!-- END:deployment-review-rules -->
