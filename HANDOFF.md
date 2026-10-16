# FREE-STU 會話交接（2026-10-16）

> 給新的會話／compact 後的自己：讀完這個 + `git log` 就能無縫接手。

## 一句話
免費開源 AI 學習站（對標 ThetaWave / Astra / NotebookLM）。Next.js 16 全端 + tRPC + SQLite，自架單人版（A 路線），BYOK（使用者自帶 key，站方零成本）。

## 技術棧（鎖死）
- Next 16 (Turbopack, cacheComponents) + React 19 + Tailwind v4 + lucide-react + markmap
- tRPC v11 + superjson + TanStack Query v5 + Prisma 6 + SQLite + zod
- 生成管線：async 風格但無外部 queue——`generation.start` 建 pending row，前端 poll `getStatus`，第一個 poll 到的請求 CAS 搶鎖 inline 執行。**無 WebSocket**（三家對標也都沒用，見 `C:\Users\User\AppData\Local\Temp\opencode\` 下三份分析報告）
- 對話是 SSE 串流（`POST /api/chat/stream`），生成是輪詢，兩條路並存

## 已落地功能
對話（BYOK 10 家 preset、筆記選擇器、段落引用 `[pN]` chip、跨筆記 RAG `[sN]`、Markdown 渲染、SSE 串流+停止鈕）／筆記（貼文、上傳 txt/md/docx/pdf、刪除、追加來源、多選合併）／生成（閃卡翻卡、測驗+解析+ABCD、數量公式按字數+自訂、難度/語言/主題聚焦、心智圖 markmap+來源映射+點擊溯源+改名刪除+已理解+自測+節點出題）／用量記賬／匯出（MD/SVG/PNG 降級）／OCR 雙軌（本地 tesseract chi_tra+eng／視覺 key）／設定頁（主 key + 視覺 key）／三欄工作台＋全幅

## 剛做完（HEAD `11a9dbe`）
播客 TTS（Phase 2 直上）：`podcast` generation type，朗讀（免費）/對談（花主 Key token）雙模式，預設大陸腔，自帶 Edge 客戶端 `server/edgeTts.ts`。
**大坑**：2026-10-10 起微軟搬遷端點，舊 speech.platform.bing.com 握手 403 → 改打 `wss://api.msedgeservices.com/.../websocket/v1` + v2 Sec-MS-GEC（演算法 port 自 readest），舊 URL 留作降級。Turbopack 吃不下 `.ts` 主入口的 npm 包（edge-tts 已卸載）。
音檔 `data/podcasts/<genId>.mp3`（gitignore），`/api/podcast/[id]` 播+Range+下載，刪筆記連帶清檔。
OCR 雙軌 + Word 上傳 + 視覺設定卡。語言包在 `%LOCALAPPDATA%\free-stu\tessdata`（標準版，非 fast）。待使用者實測中文掃描 PDF（20 份）。

## 下一步（按順序）
1. 等使用者 OCR 實測回饋
2. 播客 TTS（Phase1 speechSynthesis 預覽 → Phase2 Edge-TTS 雙聲＋前端接力播，不碰 ffmpeg）
3. RAG 已做（TF）；pgvector 是以後的事
4. 登入/多用戶：A 路線刻意不做，別碰

## 鐵律（血淚換的）
1. **3000 寫代碼（dev），3001 看效果（prod）**。每次改完：`npm run build` → commit → push → 殺 3001 → `npx next start -p 3001`。push ≠ 部署！
2. **DATABASE_URL 必須絕對路徑**（`file:A:/HSHSA/prisma/dev.db`），相對路徑在 Turbopack worker 下必炸（code 14）。改 `.env` 後**重啟 dev**（Prisma singleton 緩存舊 URL）。
3. **migrate 時 dev 跑著的話，生成的 client 是舊的** → migrate 完重啟 dev。
4. **絕不用 PowerShell 改源碼文字**（編碼會爛，只用 edit/write；`generation.ts` 爛過一次）。
5. curl 測 tRPC 要把 JSON body 寫檔案再 `--data @file`（PowerShell 引號地獄）。
6. Next 16 cacheComponents：`params` 是 Promise（server 用 `await`，client 用 `use()`）；動態頁正規寫法 = server 殼（`await connection()` 放 Suspense 內層子組件）+ client 體；`export const dynamic` 和 `instant=false` 沒用；`export const runtime` 非法。
7. `usePathname` 的 nav 要包 Suspense，否則 build 炸。
8. pdfjs v6 render 傳 `canvas` 不傳 `canvasContext`；原生 addon（canvas/tesseract）進 `serverExternalPackages`；pdf-parse 太老別用；tesseract 頂層 require 會讀自帶測試檔（已棄用，改走 pdfjs+@napi-rs/canvas）。
9. 測試 key 專用腳本，**絕對不要再跑 `cleankey.py`**（清掉使用者真 key 兩次了）。
10. A 盤是慢速磁碟：首次編譯幾分鐘正常；HMR 會空轉重載（之前無限刷新就是它）。
11. 不要用 `head`（Windows 沒這指令），用 `Select-Object`。
12. push 被拒通常是遠端有東西（issue templates 那次），`git pull --rebase` 再推。壞 commit 用 `reset --soft + force-with-lease`  squash，保持 main 乾淨。

## 檔案地圖
- `server/routers/{chat,user,note,generation,usage}.ts`、`server/{trpc,llm,ocr}.ts`
- `lib/{db,trpc,counts,paras,mindmap,retrieval,export}.ts`
- `app/(saas)/app/{chat/{page,ChatBox,AiMessage},notes/{page,[id]/{page,NoteDetail,NoteShell,NoteDetail子件,MindmapView}},settings/page}`
- `app/api/{trpc/[trpc]/route,upload/route,chat/stream/route}`
- 分析報告在 `C:\Users\User\AppData\Local\Temp\opencode\`（thetawave/astra/notebooklm-analysis.md, mvp-plan.md）
- repo: https://github.com/ryanran8787-a11y/FREE-STU

## DB（prisma/dev.db，不進 git）
UserKey（主 key + vision 四欄）/ Note / Generation（含 options JSON：選項/resolvedCount/sourceMap/mastered）/ Usage
