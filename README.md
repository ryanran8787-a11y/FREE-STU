# NEXT（FREE-STU）— 免費開源 AI 學習站

貼上筆記就能問、能測驗、能抽閃卡、能聽播客。對標 ThetaWave、Astra AI、NotebookLM 的自架單人版：**站方零成本，你零月費**——模型用你自己的 Key（BYOK），資料只存你的電腦。

## 功能

- **對話**：指定單份筆記或跨筆記檢索（TF召回），回答帶 `[pN]` / `[sN]` 段落引用，可點開溯源；SSE 串流輸出，可中途停止
- **閃卡 / 測驗**：出題數按筆記字數自動縮放，也可自訂 1–50；難度、語言（繁/簡/英）、主題聚焦
- **心智圖**：markmap 渲染，節點帶來源映射（點節點看依據段落），可改名、刪節點、標已理解、自測模式、節點直接出題
- **播客**：原文朗讀（免費）或雙人對談（花一點 token，NotebookLM 式），Edge 高品質語音，可下載 MP3
- **上傳**：`.txt` / `.md` / `.docx` / `.pdf`；掃描版 PDF 自動 OCR（本地 tesseract 免費鏈，或填視覺模型走高精度）
- **手機 PWA**：深色模式、可安裝到主畫面（HTTPS 環境下），同 WiFi / Tailscale / Cloudflare Tunnel 連回電腦

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

> `prisma/.env` 的 `DATABASE_URL` 必須是**絕對路徑**（`file:A:/HSHSA/prisma/dev.db`），相對路徑在 Turbopack worker 下會炸。改完記得重啟 dev。

## 手機連線

電腦的 prod 開著（`:3001`），手機三選一（站內設定頁有「手機連線」卡，會顯示電腦 LAN IP、一鍵複製）：

1. **同 WiFi 直開**：手機瀏覽器開 `http://<電腦IP>:3001`，零設定（只能用主畫面書籤，非正式 PWA）
2. **Tailscale（主推）**：兩邊裝 App 登入同一帳號，手機開 `http://<電腦Tailnet-IP>:3001`，出門也能用
3. **Cloudflare Tunnel**：`cloudflared tunnel --url http://localhost:3001`，免費 HTTPS，可正式安裝 PWA

連不上先放行防火牆（管理員 PowerShell）：`New-NetFirewallRule -DisplayName "FREE-STU" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow`

## 技術棧

Next.js 16（Turbopack、cacheComponents）+ React 19 + Tailwind v4 + tRPC v11 + Prisma 6 + SQLite。無 WebSocket（生成走建列＋輪詢 CAS 搶鎖，對話走 SSE）。原生 addon（canvas/tesseract）走 `serverExternalPackages`。

```
app/(saas)/app/{chat,notes,settings}  三欄工作台＋對話＋設定
app/api/{trpc,upload,chat/stream,podcast}  API
server/routers/{chat,generation,note,usage,user,system}  tRPC
server/{llm,ocr,edgeTts,podcast}.ts  模型／OCR／TTS 引擎
lib/{counts,paras,retrieval,mindmap,export}.ts  前後端共用純函數
```

## 注意事項

- OCR 繁中語言包第一次跑自動下載到 `%LOCALAPPDATA%\free-stu\tessdata`（標準版，非 fast），不在 repo 裡
- 播客音檔在 `data/podcasts/`（gitignore），刪筆記會連帶清掉
- 發版若改了靜態殼，記得 bump `public/sw.js` 的 `CACHE` 名，否則手機吃舊殼
- Edge TTS 是非官方接口，微軟改版會掛（2026-10-10 搬過一次家，見 `server/edgeTts.ts`）；掛了就用頁面上的瀏覽器試聽
