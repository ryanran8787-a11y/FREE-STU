# 審核報告 — 三修批次（86aaefa / 143cac9 / 31b37d8）

- 審核人：審核（邏輯正確性＋需求符合度）
- 日期：2026-10-23
- 範圍：僅 HEAD `31b37d8` 起回溯三個 commit，工作樹未提交變更（package.json/lock，屬副工程師進行中）不在本審範圍
- 對照規格：`DEEPTUTOR.md` §3（四檔公式，T3-1 鎖定來源）、`TOP13.md` 設計鎖定、`LIST.md`、各 commit message 自述驗收

---

## 結論

**需修正 1 項（編號 A1，push 前必修）；另 1 建議項。無阻斷問題。**

三個 commit 的產品行為全部正確、最終 HEAD 本地（台北）143/143 綠。但 A1 是測試的時區假設問題：push 到 GitHub 後 CI（ubuntu-latest = UTC）必紅，紅在 WRITE 明確聲明「不會紅」的那條對照組斷言。

---

## 分級清單

### 阻斷

無。

### 重要（該修，push 前必修）

**A1 · 對照組測試在 UTC 環境必紅 → push 後 CI `npm test` 必炸**
- 位置：`lib/local-day.test.ts:52-53`
- 問題：`expect(utcKey).not.toBe(localDayKey(d))` 這條「證明 toISOString 會錯」的對照組，只在「本地時區 ≠ UTC」時成立。CI 是 ubuntu-latest（TZ=UTC）：`new Date(2026,9,23,1,30,0)` 解析為 UTC 01:30，`localDayKey` 與 `toISOString().slice(0,10)` 同為 `"2026-10-23"`，`not.toBe` 直接失敗。其餘 11 條在 UTC 下全綠（都用本地時間建 Date + 本地取值，自洽），僅此 1 條紅。
- 重現（已實測）：`TZ=UTC node -e "..."`
  - `TZ=UTC`：`localDayKey=2026-10-23, toISOString=2026-10-23, equal=true` → 斷言炸
  - `TZ=Asia/Taipei`：`localDayKey=2026-10-23, toISOString=2026-10-22, equal=false` → 綠
- 為什麼是錯的：86aaefa commit message 與 WRITE 交付說明都聲稱「用本地時間建 Date，CI 跑在哪個時區都不會紅」——對 11 條成立，對這條對照組不成立。本專案鐵律「改完 → push」，push 那刻 CI 就紅，會被誤判為「升級/改動造成」而浪費一輪排查。
- 建議修法（WRITE 執行）：對照組改條件式——
  `if (d.getTimezoneOffset() !== 0) { expect(utcKey).not.toBe(localDayKey(d)); }`
  並補一行註解說明 UTC CI 下對照組數學上不可能相異、跳過斷言；或改用 `expect(utcKey === localDayKey(d)).toBe(d.getTimezoneOffset() === 0)` 一條恆真式釘住「何時相等、何時不等」的契約。兩者都保留「非 UTC 環境下證明 bug 存在」的證據力。

### 建議（不阻斷，記錄給下批）

**B1 · `143cac9` 單獨 checkout 必紅：N+1 守門測試比實作早一個 commit 進場**
- 位置：`server/review/card.test.ts`（143cac9 引入「P1：listDue 的 N+1 守門」describe 與 mock 的 query log 設定；批次實作在 31b37d8 才有，已用 `git show 143cac9:server/review/cards.ts` 確認當時仍是迴圈內逐卡 `findMany`）
- 問題：在 143cac9 的樹上單獨跑 `npx vitest run`，守門測試必紅（逐卡版 7 張到期卡 ≥ 8 次 Attempt 查詢 > 門檻 2）。WRITE 回報的「143/143」是對最終 HEAD 31b37d8 說的，沒有謊報；但 commit 拆分上「測試先行於實作、跨了 commit」，`git bisect` 落在 143cac9 會踩紅燈。
- 建議修法：本次不必重寫歷史；往後「測試與它守的實作」進同一個 commit。若要重排，互換 143cac9 與 31b37d8 內 card.test.ts 的歸屬即可（143cac9 只留修 2 那兩處）。

---

## 軸線A · 需求符合度（逐條對規格）

### 修 1（86aaefa）時區切日 — 符合
- 規格：修 review.ts 三處 `toISOString().slice(0,10)`（byDay key、streak 起點、往回一天），統一本地時區。**已驗**：diff 三處全換；grep 全 codebase 僅剩 `lib/local-day.ts` 的說明註解與測試對照組使用 `toISOString().slice`，業務碼零殘留。
- `lib/local-day.ts` 三個純函數依規格實作；「不改動傳入 Date」有測試釘住（`addLocalDays`、`startOfLocalDay` 各一條）。
- 12 條測試俱在且非恆真（00:00/23:59:59.999 邊界、跨月、跨年、補零、字典序）。唯一例外是 A1 那條對照組的可移植性，見上。
- 超出規格的多餘行為：無。

### 修 2（143cac9）intervalDays<=0 視同冷啟動 — 符合
- 規格：只改呼叫端，`queue.ts` 公式（T3-1 鎖定）一行不動。**已驗**：三個 commit 都未碰 `queue.ts`；改動僅 `cards.ts` 組 state 一處 + 測試。
- 測試把原「釘住 1.0 現況」的 case 改斷言 1.2，並與「冷啟動 Hard = 1.2」那條配對（card.test.ts:203-218 與 220-241），「兩條路徑結果相同」的契約有被守住。
- 影響面聲稱「只有 Hard 會變」——數學上成立（見軸線B-2）。

### 修 3（31b37d8）listDue 批次撈 — 符合
- 規格：照同檔 backfill 的 byQ Map 模式、迴圈外批次撈、行為不變、加守門測試且驗證會紅。**已驗**：實作與模式一致；守門測試邏輯成立（1 張 vs 7 張、門檻 ≤2，WRITE 自述回退驗紅 37>20 → 測試有牙）。
- 超出規格：無（`dueGenIds.length === 0` 的空陣列保護是必要防禦，不算多餘）。

---

## 軸線B · 邏輯正確性

### 1. 修 1 streak 演算法：等價改寫，無新問題
新舊結構逐行對照：`while(true)` 主迴圈、「今天沒作答允許從昨天起算」的 `n===0` 分支、`break` 點完全同構，只有切日函數從 `toISOString().slice` 換成 `localDayKey`、起點從 `new Date()+setHours` 換成 `startOfLocalDay(new Date())`（內部複製，不 mutate）。byDay key 與 streak key 用同一個 `localDayKey`，基準自洽。`since` 邊界（`setDate(-days)+setHours(0,0,0,0)`，review.ts:10-12）本來就是本地零點，與新 key 同基準。前端 `fmtDate`（ReviewDashboard.tsx:13-16）用 `new Date(s+"T00:00:00")` 無 Z 後綴按本地解析，與本地日鍵相容，不需動。

### 2. 修 2 誤傷檢驗（Chief 的尖角問題）：不會誤傷
- **Again 不會被誤判**：Again 落庫值 = `Math.round(10/1440×1000)/1000 = 7/1000 = 0.007 > 0` → `prev.intervalDays > 0` 為真 → 正常增量，Hard 接 Again 給 `max(1, 0.007×1.2)=1.0` 天，語義合理（Again 十分鐘後 Hard 至少一天）。
- **intervalDays=0 的合法來源**只有兩個，均不受影響：(a) lazy backfill 冷卡（`s?.intervalDays ?? 0`）——正是本修要治的對象；(b) plan 卡（`kind="plan"`）——但 plan 卡的 genId=planId 不是 generation，`recordAttempt` 開頭 `findUnique(gen)` 得 null 直接 `return {card:false}`，永不進 scheduleSm2，與本修無關。
- **Good/Easy 不變**：`interval <= 1 || !reviewCount → 3.0`，0 與 undefined 都 ≤1，兩版本同結果。
- **舊資料**：既有 intervalDays=0 且 reviewCount>0 的卡，Hard 從 1.0 → 1.2。這是行為變化，但正是本修聲明的目的（統一冷啟動語義），且方向與規格一致。
- **混搭狀態**（interval=undefined 但 reviewCount=1）餵給 `scheduleSm2`：各欄位獨立 fallback（interval→1、reviewCount 用實值），Hard 走 1.2、Good/Easy 因 `!reviewCount` 為 false 且 interval(fallback)=1 ≤1 → 3 天。無分支錯位。
- **replay 遷移路徑**（reviewCount=0 且有歷史）：`state` 被 `replaySm2(prior)` 整個覆蓋，`prevInterval` 不參與，一致性不受影響。

### 3. 修 3 等價性（Chief 的另一尖角問題）：真等價
- 原：迴圈內逐卡 `findMany({genId, qIndex}, createdAt asc)`。新：迴圈外 `findMany({genId in dueGenIds}, createdAt asc)` 後按 `genId:qIndex` 分組。分組保留插入序 = 全局升序在各組的投影 = **組內升序**，`hist[hist.length-1]` 取 last 的語義不變。
- `quizDue` 只含非 plan 卡 → `dueGenIds` 不含 planId。迴圈內 plan 卡在到達 hist 查找前已 `continue`（cards.ts:286-305），孤兒卡亦先 `continue`（:283），與原版查找範圍一致，沒有「多撈了不該撈的」或「少撈該撈的」。
- 空 hist → `last = undefined` → `lastCorrect ?? true`、`lastConfidence = null`，與原版逐卡空結果完全相同。
- `dueGenIds.length === 0` 時跳過查詢，防呆正確。
- （`in` 上限與記憶體屬審核2 軸，不重複列；邏輯層面 dueGenIds ≤ 500 無爆點。）

### 4. 測試恆真性
除 A1（不是恆真、是環境耦合）外，抽查關鍵斷言均有鑑別力：修 2 配對 case 斷言 `toBeCloseTo(1.2, 4)` 對逐卡版代碼會紅（原釘 1.0）；N+1 守門門檻 ≤2 對逐卡版必紅（WRITE 實測 37）。未發現其他恆真斷言。

---

## 已知分工邊界
安全性 / 效能 / 邊界（Invalid Date、DST、`in` 子句上限、記憶體）/ 測試覆蓋完整性由審核2 軸線負責，本報告僅在其問題與邏輯正確性重疊處（A1 的重現已實證）出手。
