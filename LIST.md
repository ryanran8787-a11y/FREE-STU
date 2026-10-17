# FREE-STU 架構與功能清單

## 一句話
免費開源 AI 學習站（BYOK 自架單人版），對標 ThetaWave / Astra AI / NotebookLM。Next.js 16 全端 + tRPC + SQLite，模型用你自己的 Key，站方零成本。

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

## 目錄結構

```
app/
  (marketing)/page.tsx        主頁（產品 mockup + 功能卡 + CTA）
  (saas)/
    layout.tsx                左側可折疊側邊欄 + 主題切換 + Key 狀態燈
    app/
      chat/{page,ChatBox,AiMessage}.tsx   對話頁（SSE 串流 + 引用 chip）
      notes/
        page.tsx              筆記列表（貼文/上傳/合併/刪除）
        [id]/
          page.tsx → NoteShell.tsx → NoteDetail.tsx
          NoteDetail.tsx      筆記詳情主腦（tab 式 + 生成管線）
          MindmapView.tsx     心智圖（markmap + 來源映射 + 自測）
          PodcastView.tsx     播客（播放器 + 逐字稿 + 瀏覽器試聽）
          CustomView.tsx      自訂結果（Markdown + 匯出）
          CustomSection.tsx   自訂三層制（簡易/範本/編輯器）
          PlanView.tsx        學習計畫（每日排程）
          BlindSpots.tsx      盲點分析卡
          ConflictsCard.tsx   知識衝突卡
          FloatingChat.tsx    浮動聊天 widget
          ResultCard.tsx      共用元件（EmptyState/LoadingSkeleton/ResultCard）
      review/{page,ReviewDashboard}.tsx   複習儀表板
      settings/page.tsx      設定（主 key/視覺 key/全域系統提示/手機連線）
    offline/page.tsx         離線頁（SW fallback）
    ThemeToggle.tsx          三段主題（系統/淺/深）
    SwRegister.tsx           SW 註冊（prod + 安全上下文）
    manifest.ts              PWA manifest
  api/
    trpc/[trpc]/route.ts     tRPC endpoint
    upload/route.ts         檔案上傳（txt/md/docx/pdf + OCR）
    chat/stream/route.ts     SSE 對話串流
    podcast/[id]/route.ts   播客音檔（Range + 下載）
  layout.tsx                 根（theme-boot 防閃白 + SW + viewport）
  sw.js                      Service Worker（API 不緩存）
  globals.css                設計系統（tokens + invert-chip + 動畫）
server/
  routers/
    index.ts                appRouter 聚合
    chat.ts                 對話（SSE）
    generation.ts           生成管線（閃卡/測驗/心智圖/播客/自訂/解釋）
    note.ts                 筆記 CRUD
    usage.ts                token 記賬
    user.ts                 主 key + 視覺 key + 全域系統提示
    system.ts               本機 LAN IP
    attempt.ts              信心標記 + 盲點統計
    review.ts               複習儀表板（每日曲線 + 校準 + 弱點）
    template.ts             自訂模板 CRUD
    link.ts                 雙向來源追蹤
    plan.ts                 學習計畫生成
  llm.ts                     chatCompletion + parseJsonArray + logUsage
  ocr.ts                     OCR 雙鏈（pdfjs 渲染 + tesseract/視覺）
  edgeTts.ts                自帶 Edge TTS 客戶端（新端點 + v2 GEC）
  podcast.ts                TTS 管線（切段 + 合成 + MP3 串接）
  custom.ts                 自訂 prompt（三層 + 變數渲染）
  style.ts                  全域系統提示詞
prisma/
  schema.prisma             UserKey / Note / Generation / Attempt / Usage / UsageLink / CustomTemplate / StudyPlan
  migrations/               7 個 migration
public/
  sw.js / icons/            PWA 圖示（canvas 自繪）
lib/
  counts.ts                 出題數量公式（前後端共用）
  paras.ts                  段落切分 + 心智圖來源映射
  retrieval.ts              TF 檢索（跨筆記 RAG）
  mindmap.ts                Markdown 樹操作
  export.ts                 前端匯出（MD/SVG/PNG）
  trpc.ts                   tRPC client
  db.ts                     Prisma singleton
HANDOFF.md                   會話交接檔（鐵律 + 檔案地圖）
README.md                    專案說明
LICENSE                      MIT
```

## 功能清單

### 對話
- [x] 指定單份筆記或跨筆記檢索（TF 召回），引用 `[pN]` / `[sN]` chip 可點溯源
- [x] SSE 串流輸出 + 中途停止
- [x] Markdown 渲染（表格/清單/程式碼/引用）
- [x] 引用分流（s 只查跨筆記、p 只查本筆記，不交叉）
- [x] 多輪對話 sources 逐則独立（不互蓋）
- [x] 中文輸入法 Enter 不誤送

### 筆記
- [x] 貼文字 / 上傳 .txt / .md / .docx / .pdf
- [x] 掃描版 PDF 自動 OCR（本地 tesseract chi_tra+eng / 視覺模型）
- [x] 追加來源、刪除筆記（連帶清音檔）
- [x] 多選合併

### 生成（Tab 式）
- [x] 閃卡：3D 翻面 + 自評（記得/模糊/忘了）+ 進度條
- [x] 測驗：信心標記（有把握/不確定/瞎猜）+ 即時批改 + 解析 + 三角度解釋（白話/反例/類比）
- [x] 心智圖：markmap 渲染 + 節點來源映射 + 改名/刪除/已理解/自測模式/節點出題
- [x] 播客：原文朗讀（免費，聚焦挑段）/ 雙人對談（花 token）+ MP3 下載 + 瀏覽器試聽
- [x] 自訂三層制：簡易（方式/長度/先提示）/ 範本（蘇格拉底/費曼/考前衝刺 + 我的模板）/ 編輯器（六變數 + 預覽 + 存多版）
- [x] 學習計畫：選天數/難度/語言 → AI 生成每日排程（主題 + 任務 + 段落引用）

### 分析
- [x] 盲點分析：高信心錯題標出 + 信心校準率
- [x] 知識衝突偵測：生成時標 ⚠️ 衝突 + 橘卡 + 重生成
- [x] 複習儀表板：30 天每日答對率曲線 + 連續天數 + 弱點主題
- [x] 雙向來源追蹤：段落被哪些生成/聊天引用

### 全域
- [x] 深色模式（系統/淺/深三段，localStorage 記憶，防閃白）
- [x] 全域系統提示詞（設定頁，影響所有新生成/對話，自訂模板除外）
- [x] 主題聚焦（閃卡/測驗/心智圖/對談/朗讀全吃）
- [x] 出題數量公式（按字數縮放 + 自訂 1-50）

### PWA / 手機
- [x] manifest + 圖示 + 離線頁
- [x] Service Worker（API 不緩存，靜態殼 cache-first）
- [x] 左側可折疊側邊欄（圖示模式 w-14 ↔ 展開 w-52）
- [x] 浮動聊天 widget（FAB + backdrop + Esc 關閉）
- [x] 手機連線卡（LAN IP 自動抓 + Tailscale 主推 + Tunnel 備選）

### 其他
- [x] 匯出：閃卡/測驗 MD、心智圖 MD/SVG/PNG、筆記 MD、播客 MP3
- [x] 用量記賬（token 數 + 每日/總計）
- [x] MIT 授權

## 設計系統

- **Tokens**：paper/card/ink/muted/line/primary/accent/sun（`.dark` 翻轉）
- **invert-chip**：反白小件（logo/選中段/使用者氣泡）
- **動畫**：rise（進場）/ ping（生成中）/ 彈跳點 / 卡片 hover 浮起 / 按壓 scale / 主題平滑過渡
- **卡片**：統一 `card` class + `ResultCard` 外殼 + `EmptyState` + `LoadingSkeleton`

## 資料表

| 表 | 用途 |
|---|---|
| UserKey | 主 key + 視覺 key + 全域系統提示詞 |
| Note | 筆記（title + rawText） |
| Generation | 生成結果（type + status + result + options JSON） |
| Attempt | 作答紀錄（genId + qIndex + correct + confidence） |
| Usage | token 記賬 |
| UsageLink | 雙向來源追蹤（paraId ↔ genId/kind） |
| CustomTemplate | 自訂 prompt 模板 |
| StudyPlan | 學習計畫 |

## 鐵律（HANDOFF.md 摘要）

1. 3000 寫碼（dev）、3001 看效果（prod）；每次改完 build → push → 重啟 3001
2. DATABASE_URL 必須絕對路徑
3. migrate 時 dev 跑著的話 client 是舊的 → 重啟 dev
4. 絕不用 PowerShell 改源碼文字（用 edit/write）
5. 測試 key 專用腳本，絕不再跑 cleankey.py
6. Next 16：params 是 Promise、cacheComponents 三件套、usePathname 要 Suspense
7. Turbopack 吃不下 `.ts` 主入口的 npm 包 → 自帶協議或 serverExternalPackages
