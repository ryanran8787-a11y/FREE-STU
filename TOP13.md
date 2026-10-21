# Top-1 + Top-3 實作進度（DeepTutor §9）

> 規則：每做一點就記一點，防止失憶。完成一項勾一項。

## 範圍鎖定
- **Top-1 卡片協議：判前不洩答案**（DEEPTUTOR.md §9.97）
  - 互動 API 回傳不夾帶 `answer`；判分在 server；列印/匯出走專用通道。
  - 洩漏縫：`note.get` / `generation.getStatus` 回完整 `result`；`QuizView`、`ReviewAnswerRow` 前端 `JSON.parse` + 自行判分。
- **Top-3 四檔排程照搬**（DEEPTUTOR.md §9.99，`practice/scheduler.py` 60 行）
  - `interval / ease / streak / lapses` 四欄；Again=10分鐘 / Hard=×1.2 / Good=3天起 / Easy=×1.3；上限 365 天。
  - 現況：`server/review/queue.ts` 是 STEPS 二檔簡化版；`ReviewCard` 只有 `intervalDays/dueAt/lapses`，缺 `ease/streak`。

## 步驟
- [x] 範圍鎖定 + 洩漏縫盤點（2026-10-20）
- [x] T1-1：`attempt.log` 伺服器判分（quiz 用 `picked` 在 server 算 `correct`，不再信前端）
- [x] T1-2：`generation.quizCard` 去答案互動端點（不含 `answer/explanation`）+ `getPrintable` 列印通道
- [x] T1-3：`QuizView` / `ReviewAnswerRow` 改吃去答案端點，判分結果由 server 回
- [x] T1-4：舊 `correct` 直傳相容（flashcards 自評保留；quiz 若同時傳以 server 算為準）——T1-1 已內含，無需另改
- [x] T3-1：`queue.ts` 四檔 `scheduleSm2(state, rating)` 純函數（Again/Hard/Good/Easy + ease/streak/lapses）+ `ratingOf()` 映射
- [x] T3-2：`ReviewCard` 加 `ease/streak/reviewCount` 欄位 + migration，`recordAttempt` 改走四檔（confidence→rating 映射）
- [x] T3-3：新舊排程測試（queue.test.ts + card.test.ts 補四檔 case）—— commit `40e0880`，+18 case，vitest 126/126 綠
- [x] 收尾：`vitest` + `tsc` 全綠 → commit `40e0880`（未 push，待使用者決定）

## 設計（鎖定，不再改）
- Top-1：新增 `lib/quiz.ts`（純函數，可前後端共用）：
  - `stripQuizForInteract(items)` → 去 `answer/explanation`，只留 `question/options`。
  - `gradeQuiz(items, qIndex, picked)` → server 判分回 `{correct, answer}`（判後才釋放，DeepTutor `build_grade_result` 語義）。
  - `attempt.log` 改：quiz 作答只收 `picked`，`correct` 由 server 算；flashcards 自評保留 `correct`。
  - `generation.getStatus` 加 `strip` 選項？不——新增 `generation.quizInteract {id}` 回去答案版；`note.get` 不動（深層改動太大，互動頁改吃新端點即可）。
  - 列印/匯出：走 `generation.quizPrintable {id}`（完整版，含答案）或沿用既有 `result`（列印專用通道，保留）。
- Top-3：`queue.ts` 新增四檔 `scheduleSm2(state, rating)`，`ReviewCard` 加 `ease/streak`，`recordAttempt` 改走四檔（confidence→rating：high+對=Easy/high+錯=Again，med+對=Good/med+錯=Hard，low+對=Hard/low+錯=Again）。

## Log
- 2026-10-20：開工，建檔。`main` HEAD `67162d0`（Batch2/3 已合併推送）。
- 2026-10-20：接縫確認完。`QuizView:17,40,44-46,98` 前端判分；`attempt.log:36,50` 信前端 `correct`；`getStatus:68` 回完整 result。
- 2026-10-20 T1-1 完：新增 `lib/quiz.ts`（strip/grade/parse 純函數）；`attempt.log` quiz 只收 `picked` server 判分回 `{correct, answer}`，flashcards 自評保留；`tsc` + `vitest（pure/card/queue 29）` 全綠。
- 2026-10-20 T1-4 確認：已由 T1-1 內含（attempt.ts:49-57），quiz 無視舊 correct、flashcards 續用；無碼改。
- 2026-10-20 Top-1 收：互動通道零 answer，server 判、判後釋放單題；列印走 printable。
- 2026-10-20 T3-1 完：`queue.ts` 新增 `scheduleSm2()`（Again=10/1440 天、Hard=×1.2、Good=3 天起/Easy=×1.3、ease 限 1.3–3.0、上限 365 天）+ `ratingOf()`（med+錯=Hard 其餘錯=Again）；`tsc` 綠。舊 `scheduleOne` 保留給 T3-2 切換用。

## T3-2 完成记录（2026-10-21）
- schema：`ReviewCard.intervalDays` Int→Float、新增 `ease Float @default(2.5)`、`streak Int @default(0)`、`reviewCount Int @default(0)`。
- migration：`prisma/migrations/20261020122018_sm2_four_grade/`（SQLite RedefineTables，REAL/INTEGER 新列）。
- `recordAttempt` 改走增量四档：读卡上 interval/ease/streak/lapses/reviewCount 当 state → `scheduleSm2` 一步。
- `replaySm2(events)`：旧卡迁移用，把整段历史从冷启动重播成 SM-2 结果；`listDue` 的 lazy backfill 走它。
- `plan.ts` upsert 补齐新列默认值（ease 2.5 / streak 0 / reviewCount 0）。

### 关键 bug：Again 被套用两次（ease 2.5→2.1 而非 2.3）
- 根因：`attempt.log` 是「先写 Attempt，再调 recordAttempt」，而 `recordAttempt` 的旧卡迁移守卫用
  `createdAt < now` 判断「当次之前的歷史」——now 晚几毫秒，挡不住，当次那笔被一起重播，Again 走两步。
- 触发路径：测试 1 先调 queue → lazy backfill 替 q1 建了 reviewCount=0 的冷卡 → 测试 2 的 recordAttempt 误判为「旧卡」。
- 修法：`recordAttempt` 新增 `attemptId` 参数，重播时显式排除当次那笔；`attempt.log` 传 `created.id`。
- 教训：拿时间戳切分「当次 vs 之前」在毫秒级不可靠，要用主键。

### CI 红灯根因修复（上次推上去红的原因）
- `app/generated/prisma` 与 `.next/types` 都被 gitignore，fresh clone/CI 不存在。
- CI 原本只跑 `npm ci → typecheck → test → build`，缺 codegen，于是红在：
  `TS2307 Cannot find module '@/app/generated/prisma/client'`、`TS2304 Cannot find name 'LayoutProps'`（Next 16 route type helper）。
- 修法：`package.json` 加 `prepare:codegen`（`prisma generate && next typegen`），CI 在 typecheck 前跑它。
- 又发现：`prisma.config.ts` 用 `env("DATABASE_URL")`，无 `.env` 时直接抛 `PrismaConfigEnvError`，
  而 CI 正没有 `.env`（被 gitignore）。改成 `process.env.DATABASE_URL ?? "file:./prisma/dev.db"` 惰性 fallback。
- 顺手修 `server/search/index.test.ts` afterAll 的 EBUSY（Windows 暂存 DB 未释放），加重试，与 card.test.ts 一致。

### 验证（模拟 fresh clone：删掉 app/generated/prisma 与 .next 后跑）
- `npm run prepare:codegen` → EXIT 0（无 .env 也过）
- `npm run typecheck` → EXIT 0
- `npm test` → 108 passed / 11 files，EXIT 0
- `npm run build` → EXIT 0
