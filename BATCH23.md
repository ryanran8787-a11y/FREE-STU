# BATCH2/BATCH3 — 施工紀錄（2026-10-19 開工，HEAD `7cfec00`）

> 用途：避免重複盤點、防止壓縮後失憶。每做完一步就更新這份，不再重讀已確認的東西。
> 前置已讀：`PROGRESS.md` + `BATCH1.md` 已鎖定，不再重讀。

## 0. 基線（已確認，不重跑）
- `npx vitest run`：9 files / 95 tests 全綠（2026-10-19）
- `npx tsc --noEmit`：EXIT 0，只有 npm notice 噪音
- `git status --short`：乾淨，分支 `main`，HEAD `7cfec00`（PROGRESS.md 寫 `bdc7e0b`，已漂移，以實際為準）
- Goal：`goal-489be985` rev 1 active — Batch2+Batch3 vitest+tsc+build 全綠並 push

## 1. 範圍鎖定（用戶已確認，不再討論）
- [ ] C1：Podcast 韌性 — 失敗後同參數重試按鈕（PodcastView + NoteDetail regen 鏈路）
- [ ] A3：弱項→quiz — ReviewDashboard weakNotes 全部可一鍵轉 quiz（無門檻）
- [ ] C2：備份還原 — restore API + 設定頁上傳還原，含二次確認 + 還原前自動備份
- [ ] B2：Quiz + Flashcards 列印 CSS（`@media print`，只印題目區）
- [ ] D1：Tailwind `!x` → `x!` codemod，全 33 處（16 檔）

## 2. 缺口現況（已盤點，不再重讀）
- C1：`PodcastView.tsx` 只有 browser speechSynthesis 降級試聽，無重試 UI；`NoteDetail.tsx` regen() 已有同參重跑能力，缺的是 podcast error 態的「重試」按鈕。
- A3：`ReviewDashboard.tsx` L111-125 weakNotes 只有 Link + wrong 數，無 quiz action；`BlindSpots.tsx` 已有單題 regen quiz（`onRegen(b.question)`），A3 是把整筆記弱項一鍵轉 quiz。
- C2：`app/api/backup/route.ts` 只有 GET 下載；`server/backup/index.ts` 只有 createBackup，無 restore；`settings/page.tsx` L441-453 只有下載卡。
- B2：`QuizView.tsx`（138行）/`FlashcardsView.tsx`（66行）無 print CSS；`lib/export.ts` 已有 MD 匯出。
- D1：grep `className="[^"]*!` 共 33 處，16 檔（chat/page、ChatBox、marketing/page、CustomSimple、CustomEditor、ConflictsCard、BlindSpots、TagsEditor、notes/page、StudioPanel、SourcesPanel、ResultCard、NoteDetail、PlanView、MindmapNodePanel、FlashcardsView）。

## 3. 施工 log（每步追加）
- 2026-10-19 22:18 開檔：基線+範圍+缺口一次寫死，後續只追加 log，不重盤。
- （完）C1 落地：`NoteDetail` 新增 `lastPodArgs`（gen 成功起 podcast 即記住全參，error 條出現「用相同設定重試」按鈕直調 `gen(lastPodArgs)`），順手把 `!border-l-red-400` 換成 `border-l-red-400`（D1 先行一處）。
- （完）A3 落地：`ReviewDashboard` 弱點行加「出一份測驗」按鈕（`generation.start type=quiz` → `router.push(/app/notes/[id]?gen=)`）；`NoteShell` 透傳 `searchParams.gen` → `NoteDetail initialGenId` 掛上 polling、`liveType=quiz`，done 自動切 quiz tab。tsc EXIT 0。
- （待）C2 落地：
- （待）B2 落地：
- （待）D1 落地：
- （待）verify：vitest + tsc + build 全綠 → 更新 PROGRESS.md HEAD → commit+push
- C2 done 22:36: server/backup/unzip.ts + unzip.test.ts(4) + restore.ts + restore.test.ts(6) + POST /api/backup + settings upload UI(two-step confirm). backup tests 16/16 green, tsc EXIT 0.
- B2 done 22:45: QuizView print title + answer key + plain options list + break-inside-avoid; FlashcardsView print full Q/A list; interactive controls print:hidden. tsc EXIT 0.
- D1 done 22:44: regex codemod '!util' -> 'util!' across app/*.tsx, 53 replacements in 17 files, grep zero residual, tsc EXIT 0, vitest 11 files / 105 tests green.
- Verify done: vitest 11 files / 105 tests green, tsc EXIT 0, next build EXIT 0. Committed 65d3765 (Batch2+Batch3 code). .gitignore += /.vitest/.
