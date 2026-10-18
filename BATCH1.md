# Batch1 定義（鎖定版，壓縮也不丟）

> 來源：A2 已落地（ReviewCard 持久化 + listDue O(due) + lazy backfill）。
> Batch1 = A1 + B1 + D2。C2 放第三批（pre-restore auto-backup guard）。

## A1 — 答題會話深模組（answer-session）
- 位置：`app/(saas)/app/review/answer-session.ts`（純函數，無 React、無 tRPC，可單測）
- 介面：`next(due: DueCard[], result: { qIndex: number; genId: string; correct: boolean }) → DueCard[]`
  - 語意：答完一題，把該題從「本輪待答」移除；答錯的題排到隊尾（本輪稍後再練一次），答對直接移除。
  - 不碰 DB、不調 scheduleOne（排程是 A2 recordAttempt 的事，這裡只管會話順序）。
- UI：`ReviewDashboard` 的「今日複習」卡片變成可原地作答（in-place answering）：
  - 每題展開題目 + 選項（quiz）或翻卡自評（flashcards），作答打 `attempt.log`，成功後呼叫 `next()` 更新本地待答列，不跳轉筆記頁。
  - 全部答完顯示「本輪完成」空狀態（接 D2 的 EmptyState）。
- 測試 seam：純函數 `next()`（server/review 或 app 同目錄 `answer-session.test.ts`，vitest 现行 include `lib/**` + `server/**`，放 `server/review/answer-session.test.ts` 測純邏輯，UI 不測）。

## B1 — 計畫→佇列融合（plan-to-queue）
- 现状：`PlanView` 生成 `StudyPlan.result = [{day,title,tasks[]}]` 純文字；`review.queue` 只吃 quiz/flashcards 的 ReviewCard。兩條線無交集。
- 做法：Plan 每個 task 可「釘成複習提醒」→ 寫一張 `kind="plan"` 的 ReviewCard（genId = planId，qIndex = dayIndex*100+taskIndex，question = task 文字，noteId 照抄，dueAt = 計畫日當天 08:00，intervalDays = 0）。
  - `recordAttempt` 不管 plan 卡（quiz/flashcards 才 upsert）；`listDue` 要能回 plan 卡（parseQuestions 對 plan 卡直接用 question 快照，不解析 generation）。
  - `note.remove` 清卡時一併清 plan 卡（現有 `deleteMany({noteId})` 已涵蓋）。
  - PlanView 每個 task 旁加「釘選」按鈕（已釘選顯示已釘），打新 router `plan.pinTask { planId, day, taskIndex }`。
- 測試 seam：due-date 純函數 `planDueAt(dayOffset, now) → Date`（零時區地雷：用本地 08:00），或 pin→queue 的 tRPC 介面測試（二選一，先做純函數）。

## D2 — 無障礙 + 空狀態（aria/empty-state）
- 复用 `ResultCard.tsx` 的 `EmptyState` / `LoadingSkeleton`：
  - `ReviewDashboard` 三處：loading 用 LoadingSkeleton；空佇列（有作答但今日無到期）與全空（無作答）用 EmptyState + 行動按鈕（去筆記頁）。
  - `QuizView` / `FlashcardsView` 空結果（result 解析出 0 題）用 EmptyState。
- aria：答題按鈕 `aria-pressed`（已選/翻面狀態）、信心按鈕群 `role="radiogroup"` + `aria-checked`、佇列列表 `role="list"`、完成提示 `role="status"`。
- 不新增測試（a11y 目檢 + tsc），或最多一個 EmptyState 渲染快照——先不寫，當收尾活。

## 順序
A2(已落地) → A1(純函數+in-place) → B1(pin+queue) → D2(收尾) → tsc+vitest+build → commit+push。
