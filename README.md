# FREE-STU — 免費開源 AI 學習站

![MIT](https://img.shields.io/badge/license-MIT-green)

貼上筆記就能問、能測驗、能抽閃卡、能聽播客、能排複習。對標 ThetaWave / Astra AI / NotebookLM 的自架單人版：**站方零成本，你零月費**——模型用你自己的 Key（BYOK），資料只存你的電腦（SQLite）。

> 現況（2026-10-20，`main`）：Batch1（複習持久化＋計畫融合＋空狀態無障礙）與 Batch2/3（podcast 重試＋弱項轉測驗＋備份還原＋列印＋Tailwind codemod）已合併；DeepTutor Top-1（判前不洩答案）與 Top-3（四檔 SM-2）施工中。

## 功能

### 對話
- 指定單份筆記或跨筆記 TF 检索（RAG），回答帶 `[pN]`（本筆記段落）/ `[sN]`（跨筆記）引用 chip，可點開溯源
- SSE 串流輸出（`POST /api/chat/stream`），可中途停止；中文輸入法 Enter 不誤送
- Markdown 渲染（表格/清單/程式碼/引用）；多輪 sources 逐則獨立不互蓋
- BYOK：10 家 OpenAI-compatible preset，主 key＋視覺 key＋全域系統提示詞（設定頁）

### 筆記
- 貼文字 / 上傳 `.txt` / `.md` / `.docx` / `.pdf`；多選合併、追加來源、刪除（連帶清音檔＋複習卡＋FTS）
- 掃描版 PDF 自動 OCR 雙軌：本地 tesseract（`chi_tra+eng`，免費）或視覺模型（高精度）
- 標籤＋全文檢索（FTS）；雙向來源追蹤（段落被哪些生成/聊天引用）

### 生成（Tab 式，建列＋輪詢）
- **閃卡**：3D 翻面＋自評（記得/模糊/忘了）＋進度條
- **測驗**：信心標記（有把握/不確定/瞎猜）＋即時批改＋解析＋三角度解釋（白話/反例/類比）
  - Top-1 卡片協議：互動走 `generation.quizInteract`（去答案版，只有 `question/options`），判分在 server（`attempt.log` 只收 `picked`，回 `{correct, answer}` 判後釋放單題）；列印/匯出走 `generation.quizPrintable`（完整版）
- **心智圖**：markmap 渲染＋節點來源映射＋改名/刪除/已理解/自測模式/節點出題
- **播客**：原文朗讀（免費，聚焦挑段）/ 雙人對談（花 token）；自帶 Edge TTS 客戶端，可下載 MP3＋瀏覽器試聽；失敗可同參重試
- **自訂三層制**：簡易（方式/長度/先提示）/ 範本（蘇格拉底/費曼/考前衝刺＋我的模板）/ 編輯器（六變數＋預覽＋存多版）
- **學習計畫**：選天數/難度/語言 → AI 生成每日排程；每 task 可釘成複習卡（`plan.pinTask`）
- 出題數按筆記字數自動縮放，也可自訂 1–50；難度/語言（繁/簡/英）/主題聚焦全吃
- 管線：`generation.start` 建 pending row → 前端 poll `getStatus` → 第一 poll CAS 搶鎖 inline 執行（無 WebSocket、無外部 queue）

### 複習（SM-2 四檔，DeepTutor 照搬）
- `ReviewCard` 一題一行，key `(genId, qIndex)` 唯一；`recordAttempt` 每次作答 upsert，`listDue` 只掃到期卡（O(due)）
- 排程引擎 `server/review/queue.ts`：`scheduleSm2(state, rating)` —— Again=10 分鐘 / Hard=×1.2 / Good=3 天起 / Easy=×1.3，ease 限 1.3–3.0，上限 365 天；`ratingOf(correct, confidence)` 映射信心→四檔
- 複習頁可原地作答（quiz 選項 / 閃卡自評），答錯丟隊尾（`lib/answer-session.ts` `next()`）；全部答完顯示本輪完成空狀態
- 複習儀表板：30 天每日答對率曲線＋連續天數＋弱點主題＋信心校準率；弱點可一鍵轉測驗（`?gen=` 直達 quiz tab）

### 分析（全 SQL，零 token）
- 盲點分析：高信心錯題標出（`attempt.stats`）；知識衝突偵測：生成時標 ⚠️＋橘卡＋重生成
- `review.summary`：每天答對率/平均信心/作答數、弱點筆記 Top8、信心校準率、總覽＋連續天數

### 全域 / PWA / 手機
- 深色模式（系統/淺/深三段，防閃白）；全域系統提示詞（新生成/對話全吃，自訂模板除外）
- PWA：manifest＋圖示＋離線頁；Service Worker（API 不緩存，靜態殼 cache-first，改殼記得 bump `CACHE` 名）
- 左側可折疊側邊欄＋浮動聊天 widget；手機連線卡（LAN IP 自動抓＋Tailscale 主推＋Tunnel 備選）
- 匯出：閃卡/測驗 MD（含答案鑰）、心智圖 MD/SVG/PNG、筆記 MD、播客 MP3；Quiz/Flashcards 列印 CSS（只印題目區）
- 備份還原：設定頁下載備份（zip）＋上傳還原（含二次確認＋還原前自動留底）；用量記賬（token 數＋每日/總計）

## 快速開始（Windows）

```bash
npm install
npx prisma migrate dev   # SQLite，免裝資料庫
npm run dev              # 寫代碼用：http://localhost:3000
```

正式用跑 prod（A 槽慢速碟、dev 首編譯要幾分鐘，日常使用走這邊）：

```bash
npm run build
npx next start -p 3001   # http://localhost:3001
```

> `prisma/.env` 的 `DATABASE_URL` 必須是**絕對路徑**（`file:A:/HSHSA/prisma/dev.db`），相對路徑在 Turbopack worker 下會炸。改完記得重啟 dev；migrate 時 dev 跑著的話 client 是舊的，也要重啟。

驗證：

```bash
npm test        # vitest run（lib/** + server/**）
npm run typecheck  # tsc --noEmit
```

## 手機連線

電腦的 prod 開著（`:3001`），手機三選一（站內設定頁有「手機連線」卡，會顯示電腦 LAN IP、一鍵複製）：

1. **同 WiFi 直開**：手機瀏覽器開 `http://<電腦IP>:3001`，零設定（只能用主畫面書籤，非正式 PWA）
2. **Tailscale（主推）**：兩邊裝 App 登入同一帳號，手機開 `http://<電腦Tailnet-IP>:3001`，出門也能用
3. **Cloudflare Tunnel**：`cloudflared tunnel --url http://localhost:3001`，免費 HTTPS，可正式安裝 PWA

連不上先放行防火牆（管理員 PowerShell）：`New-NetFirewallRule -DisplayName "FREE-STU" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow`

## 技術棧

| 層 | 技術 |
|---|---|
| 前端 | Next.js 16（Turbopack, cacheComponents）+ React 19 + Tailwind v4 + lucide-react + markmap |
| 後端 | tRPC v11 + superjson + TanStack Query v5 |
| 資料庫 | Prisma 6 + SQLite（絕對路徑 `file:A:/HSHSA/prisma/dev.db`） |
| AI | OpenAI-compatible chat completions（10 家 BYOK preset） |
| 生成管線 | 建列 → poll → CAS 搶鎖 inline 執行（無 WebSocket、無外部 queue） |
| 串流 | 對話走 SSE（`/api/chat/stream`），生成走輪詢 |
| 原生套件 | pdfjs-dist + @napi-rs/canvas + tesseract.js（`serverExternalPackages`） |

```
app/(marketing)/page.tsx        主頁（產品 mockup + 功能卡 + CTA）
app/(saas)/app/
  chat/{page,ChatBox,AiMessage}.tsx   對話頁（SSE + 引用 chip）
  notes/page.tsx              筆記列表（貼文/上傳/合併/刪除）
  notes/[id]/NoteDetail.tsx   筆記詳情主腦（tab + 生成管線 + regen）
  notes/[id]/{QuizView,FlashcardsView,MindmapView,PodcastView,CustomView,PlanView,BlindSpots}.tsx
  review/{page,ReviewDashboard,ReviewAnswerRow}.tsx  複習（原地作答 + 儀表板）
  settings/page.tsx           設定（主/視覺 key + 系統提示 + 備份還原 + 手機連線）
  offline/page.tsx            離線頁（SW fallback）
app/api/{trpc/[trpc]/route,upload/route,chat/stream/route,podcast/[id]/route,backup/route}
server/routers/{attempt,chat,generation,link,note,plan,review,search,system,template,usage,user}.ts
server/{llm,ocr,edgeTts,podcast,custom,style}.ts
server/generation/{options,runners,explain,prompts,validate}.ts
server/review/{queue.ts,scheduleSm2/ratingOf/replaySm2, cards.ts/recordAttempt/listDue, answer-session.ts/next}
server/plan/due.ts  planDueAt（本地08:00）+ planQIndex
server/backup/{zip,unzip,restore}.ts
lib/{quiz.ts/stripQuizForInteract/gradeQuiz/parseQuizItems, answer-session, counts, paras, retrieval, mindmap, export, trpc, db}.ts
prisma/{schema.prisma, migrations/（13 個，最新 sm2_four_grade）}
```

## 資料表

| 表 | 用途 |
|---|---|
| UserKey | 主 key＋視覺 key＋全域系統提示詞（單行 `id="default"`） |
| Note | 筆記（title + rawText + tags） |
| Generation | 生成結果（type + status + result JSON + options JSON） |
| Attempt | 作答紀錄（genId + qIndex + picked + correct + confidence） |
| ReviewCard | 複習卡（`(genId,qIndex)` 唯一；`intervalDays Float` + `ease` + `streak` + `lapses` + `reviewCount` + `dueAt` + `question` 快照；無 FK） |
| Usage / UsageLink | token 記賬 / 雙向來源追蹤（paraId ↔ genId/kind） |
| CustomTemplate | 自訂 prompt 模板 |
| StudyPlan | 學習計畫（AI 每日排程 result JSON） |

## 注意事項

- OCR 繁中語言包第一次跑自動下載到 `%LOCALAPPDATA%\free-stu\tessdata`（標準版，非 fast），不在 repo 裡
- 播客音檔在 `data/podcasts/`（gitignore），刪筆記會連帶清掉
- 發版若改了靜態殼，記得 bump `public/sw.js` 的 `CACHE` 名，否則手機吃舊殼
- Edge TTS 是非官方接口，微軟改版會掛（2026-10-10 搬過一次家，見 `server/edgeTts.ts`）；掛了就用頁面上的瀏覽器試聽
- Next 16：`params` 是 Promise、cacheComponents 三件套、`usePathname` 的 nav 要包 Suspense；前台不能 import `@/server/*`（純函數放 `lib/`）
- 測試寫 `dueAt` 必須用 Prisma `updateMany`（raw SQL 無時區格式比不到 `lte`）；`card.test.ts` 用獨立 tmp 檔，Windows EBUSY 重試刪檔即可
- 絕不用 PowerShell 改源碼文字（編碼會爛，只用 edit/write）；測試 key 用專用腳本，不要清使用者真 key

## 進度文件

- `PROGRESS.md` —— 壓縮接續點（讀完即可接手）
- `BATCH1.md` —— Batch1 規格鎖定（A1 答題會話＋B1 計畫融合＋D2 空狀態）
- `BATCH23.md` —— Batch2/3 施工紀錄（C1 重試＋A3 弱項 quiz＋C2 備份還原＋B2 列印＋D1 codemod）
- `DEEPTUTOR.md` —— DeepTutor 分析＋ HSHSA Top-5（§9）
- `TOP13.md` —— Top-1＋Top-3 實作進度（每做一點記一點）
- `LIST.md` —— 架構與功能清單；`HANDOFF.md` —— 舊會話交接（鐵律＋檔案地圖）

## 授權

MIT，完全開放——自己用、改完發、拿去賣都行，保留 LICENSE 署名即可。
