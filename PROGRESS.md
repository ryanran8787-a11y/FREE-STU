# PROGRESS — 壓縮接續點（2026-10-18 晚，HEAD `bdc7e0b`）

> 用途：把這段長對話壓掉後，從這一份直接接手。讀完這份 + `BATCH1.md`（規格鎖定版）即可開工。
> 工作區：`A:\HSHSA`，分支 `main`，乾淨（`git status --short` 無輸出），已 push（`5afb2eb..bdc7e0b main->main`）。

## 1. 現在是什麼狀態

- **Batch1 第一批閉環已交付並 push**：A1 複習頁原地作答 + B1 學習計畫融合 + A2 排程持久化 + D2 無障礙空狀態。
- 驗證全綠：**vitest 95/95（9 files），`npx tsc --noEmit` EXIT 0，`npm run build` EXIT 0**。
- 對應 goal `goal-b9241da1` 已 `complete`（rev 4）。下一批還沒開 goal、還沒開工。
- 最近一次對話：用戶說「D2 剩下的活我來收尾」，抱怨工具 status 訊息洗版（「何意味？重複大法？」）—— 經查是 UI/status 噪音，無循環調用；D2 已由我方顺手收完並驗證，用戶可直接目檢。

## 2. 本次做完的東西（按模組）

### A1 — 答題會話純函數（`lib/answer-session.ts`）
- `next<T extends SessionCard>(due, result)`：答對→從本輪移除；答錯→丟隊尾；找不到 key 原樣返回。
- key = `genId:qIndex`。只管順序，不管 DB/排程（排程是 A2 的事）。
- 放 `lib/` 是因為前台 `ReviewDashboard` 不能 import `@/server/*`；`server/review/answer-session.ts` 只是 re-export。
- 測試：`server/review/answer-session.test.ts` 3 例。

### A2 — 排程持久化（`server/review/cards.ts` + `server/review/queue.ts`）
- `ReviewCard` 表（migration `20261018094522_review_card`）：key `(genId,qIndex)` 唯一，**無 FK**，`question` 快照欄，`dueAt`/`noteId` 有 index。
- `recordAttempt()`：答對 interval 拉長（STEPS=[1,3,7,16,35,70] 類 SM-2），答錯 due 當天/明天；**qIndex 越界不建卡（quarantine），attempt 照寫**；plan 卡直接忽略（完成=刪卡）。
- `listDue()`：O(due) 只掃 `dueAt <= now`；gen 已刪→整批刪孤兒卡（plan 卡除外）；plan 卡用 `question` 快照回，不解析 generation。
- `attempt.log → review.queue` 整鏈打通；`note.remove` 會 `deleteMany({noteId})` 清卡；`plan.remove` 刪該 plan 的卡。
- 測試：`server/review/card.test.ts` A2 段 3 例 + `server/review/queue.test.ts` 7 例（舊）。

### B1 — 計畫→佇列融合（`server/plan/due.ts` + `plan` router）
- `planDueAt(dayIndex, now)`：**本地 08:00**（`setHours(8,0,0,0)` + `setDate(+dayIndex)`，不碰 UTC）。
- `planQIndex(day, taskIndex) = (day-1)*100 + taskIndex`（day 是 PlanView 1-based `d.day`）。
- `plan.pinTask {planId, day, taskIndex}` → upsert `kind="plan"` 卡（`genId=planId`，`question = "D{day} {title}：{task}"` 快照）；`unpinTask` = 完成刪卡；`pinnedTasks` 供 PlanView 顯示已釘。
- PlanView 每 task 有釘選按鈕，pin/unpin 後 `review.queue.invalidate()`。
- 測試：`server/plan/due.test.ts` 4 例 + `card.test.ts` B1 段 1 例（pin→queue 出現、重複釘冪等、unpin 消失）。

### D2 — 無障礙 + 空狀態（前台）
- `ResultCard.tsx` 的 `EmptyState` / `LoadingSkeleton` 已是共用元件。
- `ReviewDashboard`：loading→Skeleton；queue 空→EmptyState+行動按鈕（去筆記頁）。
- `QuizView` / `FlashcardsView`：0 題→EmptyState；`done = qs.length>0 && ...`（防空 quiz 誤判完成）。
- aria：Quiz 選項 `role="list"` + `aria-pressed`；自評用 `role="group"`（不是 radiogroup）；進度 `role="progressbar"`；完成 `role="status"`；翻卡 `role="button"` + `aria-pressed`。
- 無專屬測試（目檢 + tsc/build 覆蓋）。

## 3. 關鍵介面速查（新對話不用重讀原始碼）

| 檔案 | 介面 |
|---|---|
| `lib/answer-session.ts` | `next(due, {genId,qIndex,correct}) → due` |
| `server/plan/due.ts` | `planDueAt(dayIndex, now?) → Date`（本地08:00）、`planQIndex(day, taskIndex)` |
| `server/review/cards.ts` | `recordAttempt({genId,qIndex,noteId,kind,question,correct,confidence})`、`listDue(limit?, now?) → DueCard[]` |
| `server/review/queue.ts` | `scheduleOne(...)`、`computeDue(...)`（SM-2-like） |
| tRPC | `attempt.log`、`review.queue {limit}`、`review.summary`、`plan.pinTask/unpinTask/pinnedTasks`、`note.remove` |
| 前台 | `ReviewDashboard`（原地作答+EmptyState）、`ReviewAnswerRow`（DueItem 逐題作答）、`PlanView`（釘選按鈕）、`QuizView`/`FlashcardsView`（空狀態） |

## 4. 已知地雷（踩過，別再踩）

1. **前台不能 import `@/server/*`** → 純函數放 `lib/`，server 再 re-export。
2. **測試寫 dueAt 必須用 Prisma**（`updateMany({data:{dueAt: new Date(...)}})`）；raw SQL `'YYYY-MM-DD HH:mm:ss'` 無時區格式會讓 Prisma-SQLite 的 `lte` 比不到（B1 紅燈元兇，實作無辜）。
3. `card.test.ts` 用獨立 tmp 檔（`hs-hsa-reviewcard-test-<pid>.db`，`beforeAll` 建 DDL + `afterAll` 刪）；**Windows EBUSY**：`afterAll` 已加 5 次重試刪檔，仍失敗就放著（tmp 無害）。
4. `vitest.config.mts` 靠 `process.loadEnvFile(.env)` 補 `DATABASE_URL`；include 只有 `lib/**/*.test.ts` + `server/**/*.test.ts`。
5. PowerShell 注意：無 `head/tail/sed`（用 `Select-Object`）；`&&` 不通，分開下；`npx tsc` 噪音大，盯 `EXIT:$LASTEXITCODE`。
6. D2 aria：Quiz 選項是按鈕組不是 radio（`role="list"`）；自評信心組用 `role="group"`；空 quiz 的 `done` 必須先判 `length>0`。
7. AGENTS.md：`next dev` 會重加 block，commit 帶上保持乾淨。Hindsight memory 401 無 token——靠讀碼，別指望。

## 5. 還沒做的事（下一批候選，未開工、未承諾順序）

- **Batch2**：C1 podcast 韌性（重試/斷點續傳？當初只說增強）、A3 弱項→quiz（錯題再練）。
- **Batch3**：C2 備份還原（restore + **pre-restore auto-backup guard**，BATCH1.md 已定）、B2 匯出/列印、D1 Tailwind `!x`→`x!` 語法遷移。
- 不做：pgvector、多用戶、自建 TTS Phase2、換 DB。

## 6. 接手第一步（壓縮後照做）

1. `git pull --rebase`（或確認 HEAD 仍是 `bdc7e0b`），`git status --short` 應乾淨。
2. `npx vitest run`（期望 9 files / 95 tests 綠）+ `npx tsc --noEmit`。
3. 讀 `BATCH1.md`（規格）+ 本文件 §2–§4（實作現況），然後按用戶指示開下一批。
