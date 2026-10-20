# DeepTutor 分析 — 文件層 + 原始碼層結論（2026-10-20）

來源：https://github.com/HKUDS/DeepTutor（main；practice 子代理實測 clone v1.6.15 commit a31d826）
狀態：文件層 + 原始碼層（memory / practice-scheduler / agents-workspace 四路子代理）皆完成

## 1. 專案定位
- Lifelong Personalized Tutoring，Python 3.11–3.14 + Node 22，`pip install deeptutor` 或源碼 `pip install -e .` + `web/ npm ci`
- Docker：`ghcr.io/hkuds/deeptutor:latest`，port 3782，volume `deeptutor-data`
- CLI：`deeptutor init / doctor / start / run <capability> / chat / kb / memory / book / partner …`（詳見 SKILL.md）
- 單機多工作區、檔案型學習資料夾 `.deeptutor/data/`，記憶帳號共享不按工作區隔離

## 2. 三層記憶（可檢視、可編輯，非隱藏向量庫）
- **L1**：workspace mirror + append-only event trace `trace/<surface>/<date>.jsonl`
- **L2**：per-surface 策展事實 `L2/<surface>.md`，帶 L1 實體引用
- **L3**：跨 surface 綜合 `L3/<profile|recent|scope|preferences>.md`，記錄貢獻的 L2 surface
- Memory Graph：L3 中央 → L2 中環 → L1 外環，L2→L1 證據邊、L3→貢獻 surface 鏈
- 追蹤 surface：`chat, notebook, quiz, kb, book, partner, cowriter`
- consolidator 的 Update / Audit / Dedup 預算在 Settings → Memory 調
- `deeptutor memory show/clear`：看 L2/L3 或清 L1 / 全部

HSHSA 對照：我們只有 `attempt.log` + `weakNotes`（30 天視窗），無 L1 trace、無跨 surface 綜合。
可借（待排期，不在本輪動工）：L1 追加式事件 trace；ReviewDashboard 加「歷史軌跡」視圖。

## 3. 練習/錯題/每日複習（精確公式，`deeptutor/services/practice/`）
- 入口：`學習空間 → 題庫 (/space/questions)` 管題庫+錯題；`個性化學習 → 練習 (/learning/practice)` 加統計+每日複習；兩入口共用題目與複習記錄
- 客觀題（單選/多選/判斷）服務端核對（`answers.py`：大小寫/空格折疊後精確鍵集比對，多選鍵按 `[,;，；\s]` 切）；填空/簡答/essay 用自評（`check_answer` 回 None）
- 錯題語義：答錯自動進錯題（`practice_capture_insert` trigger：`first_wrong_at=created_at, due=+86400`）；複習答對仍保留（`is_mistake` 不清，Good/Easy 不清除）；再答錯重開（`practice_capture_update`：`due=+86400, interval=1, streak=0`）；改題干/選項/答案觸發 `practice_invalidate_question`（`version+1`）
- 匯入：`.xlsx/.csv/.tsv/.json`，單次 ≤500 題/5MB/64 列；題庫 vs 錯題二選一；有一行不合法就不開確認；重複題（同題幹+題型+選項+答案）合併標籤；`practice_imports(token PK, filename, target, payload_json, created_at, result_json)`
- 四檔反饋 → 下次安排（`scheduler.py` 60 行，`DAY=86400`，初值 `interval=1, ease=2.5`）：
  - Again：`interval=10/1440`（約10分鐘），`streak=0`，`lapses+1`，`ease=max(1.3,ease-0.2)`
  - Hard：`interval=max(1.0, interval*1.2)`，`ease=max(1.3,ease-0.15)`，`streak=0`
  - Good/Easy：`interval=3.0`（若 `interval<=1` 或首輪）否則 `interval*ease`；Easy 另 `interval*=1.3, ease=min(3.0,ease+0.15)`；`streak+=1`
  - 上限：`interval=min(365.0, round(interval,3))`；`due_at=now+interval*DAY`；客觀題答錯只能選 Again（`review()` 強制 `check_answer` guard，否則 ValueError）
- 每日隊列（`storage.py`）：`WHERE _DUE_AT_SQL<=now ORDER BY _DUE_AT_SQL, id LIMIT 20`；`_DUE_AT_SQL` 對「已掌握/答對但 review_count==0」給 3 天冷啟動（`updated_at+259200`），否則用 `due_at`；`overview()` 給 total/mistakes/due/overdue/next_due_at/reviewed_today；`review()` 用 `BEGIN IMMEDIATE` + `request_id` 冪等 + `version` 樂觀檢查；`practice_review_events(request_id PK, entry_id, rating, answer, reviewed_at, outcome_json)`
- 「已掌握」無獨立暫停欄位：僅 `outcome_json.mastered` 布林；暫停效果 = Good/Easy 把 due_at 推遠（上限 365 天）自然掉出 `due<=now` 隊列；Again 重置約10分鐘 + `resolved=0` 立即重回隊列
- 明確聲明：不是 FSRS，只是可解釋可測試的 SM-2 風格規則

HSHSA 對照：我們 `dueAt = now + (correct ? 3d : 1d)` 二檔，無難度分級、無每日隊列上限、無掌握暫停。
可借（待排期）：四檔公式可幾乎照搬（`interval/ease/streak/lapses` 四欄 + `review()` 事務語義）；confidence→rating 映射（low→Hard、med→Good、high→Easy，欄位已有）；每日 20 題隊列；`request_id` 冪等值得學（防重複提交）。

## 4. 工作區（workspaces.md）
- 任務的資料/會話/進度/練習記錄/生成檔都跟工作區走；未選用預設工作區
- 預設工作區沿用歷史路徑；自建工作區資料在該資料夾 `.deeptutor/data/`；生成檔在 `outputs/<功能>/<會話>/<輪次>/`
- 模型工具不能經工作區檔案瀏覽讀 `.deeptutor` 內部 DB
- 工作區提示詞（≤10k 字）：對話/解題/提問/引導/閱讀/課程/可視化每輪開始時固定；Deep Research/出題/Manim 不用
- 資源分配：Skills / MCP / 知識庫 per-workspace 選「繼承」或「僅所選」；選後者零勾選 = 停用該類；MCP 連線與憑證仍帳號管，工作區只存引用不擴權
- Partner 綁定工作區：共享該區檔案/KB/skills/notebook，產物寫該區 `outputs/`；Soul/對話記錄/Partner 記憶保持獨立
- 遷移：SQLite 備份介面複製 DB + 內容校驗，全驗過才清源；中斷可在最近操作「恢復遷移」

HSHSA 對照：單機單用戶 SQLite，無工作區概念；備份/還原（C2/B1 已落地）是整庫 zip。
可借（待排期）：`outputs/` 按 generation 分類匯出；還原前自動留底（C2 已做）即其簡化版。

## 5. My Agents / Partner / CLI-Anything
- My Agents 可接外部 coding CLI（GrepCode/Gemini/Kimi/opencode/MiMo…），chat 中 `consult_subagent` 即時諮詢，各自私有記憶
- CLI Apps：Learning Space 統一管理，來自 CLI-Anything catalog，一鍵 MCP Services
- Skill 頁可切「帳戶共享」vs 工作區專屬（`skills/` 下，同名優先於共享/管理/內建）

## 6. 推理安全檢查清單（REASONING_SAFETY_CHECKLIST.md，診斷用）
- 四快問：原始約束？哪個 capability+工具實際調用？答案依賴哪個 KB/附件/選段？有引用還是純權威腔？
- 16 種檢索失敗模式：no retrieval / wrong scope / stale source / chunk 切半 / near-topic drift / keyword mismatch / translation mismatch / duplicated chunks / over-broad top-k / missing rerank / conflicting sources / unverified external / citation mismatch / locator mismatch / empty-or-filtered / hallucinated evidence
- Issue 模板：Capability / Model / 版本 / 問什麼 / 答什麼 / 為何錯 / 所選源 / 觀察到的 tool calls / 檢索片段或 citation ID / 復現步驟 / 預期 vs 實際 / 已試過什麼

HSHSA 可借（低成本）：quiz/flashcards 的 AI 解析若出現「聽起來對但與筆記矛盾」，用此清單的 16 模式逐項排查；出題 prompt 加 evidence-only 約束。

## 7. 知識中心（多檢索引擎）
- LlamaIndex 預設（hybrid vector+BM25 + cross-encoder rerank，FAISS exact-flat/HNSW）
- PageIndex（page級引用）、GraphRAG / LightRAG（含 Server 遠端版）、WeKnora、Tencent IMA、MarginNote 4、Kiwix ZIM、Obsidian vault 原地讀寫
- 每 KB 綁定一種引擎；GitHub repo（branch+glob）/ 文檔站 URL 可追蹤同步；`kb eval / eval-diff` 可比檢索效果

## 8. 原始碼層結論（四路子代理實查）

### 8.1 三層記憶原始碼（`deeptutor/services/memory/`，非頂層 memory/）
- 入口：`store.py` 無狀態單例 `get_memory_store()`；`paths.py` 由 `PathService.get_memory_dir()` 懶解析（contextvars 隔離多用戶）；partner 運行時用 `memory_path_service_override` 切 owner scope
- 佈局：`trace/<surface>/<YYYY-MM-DD>.jsonl`（L1 append-only）/ `L2/<surface>.md` / `L3/<recent|profile|scope|preferences>.md` / `backup/<timestamp>/`（v1 遷移歸檔）
- Surface = `chat|notebook|quiz|kb|book|partner|cowriter`；L3Slot = `recent|profile|scope|preferences`
- L1 `TraceEvent`：`{id(surface:ULID), ts(UTC iso), surface, kind, payload(dict), session_id?, turn_id?}`；按 UTC 日切檔、每 surface 一 asyncio.Lock、`to_thread` 寫、全 try 吞錯只 warn（永不打斷業務）；`iter_since` 按檔名日期粗篩+行內 ts 細篩，壞行跳過；`ids.py` 用 26 字 Crockford ULID（`m_<ULID>` 條目 / `surface:<ULID>` trace）
- L2/L3 格式（`document.py` 純函數，serialize(parse(x)) 冪等）：`# Title / ## section / "- text [^1],[^2] <!--m_xxx-->" / 末尾 "---" + "[^1]: notebook:abc"`；`<!--m_xxx-->` 為條目 id 錨點供 audit/dedup/DELETE；footnote label 按首次出現順序整數編號，同源共享；相容 legacy `- text[^m_xxx]`，下次保存遷移
- consolidator：`run_update`（分塊增量抽事實）/ `run_audit`（按行對 raw 證據改）/ `run_dedup`（整文逐行去重，預設最多 3 輪）/ `run_merge`（無 LLM 純重序列化：合併重複 footnote、重編號、遷移 legacy）；`runs.py` RunManager 進程單例，同 (layer,key) 至多一 active run（否則 RunBusyError），終態常駐可重連，超 200 FIFO 淘汰；**無定時 cron，由工作台/API 顯式觸發**；每次寫前 `push_undo_checkpoint()` 快照可回滾；prompts 分 en/zh × update_l2/update_l3/audit_l2/audit_l3/dedup yaml；`guards.py` 禁絕對化表述（中英 BANNED_PHRASES）+ ToolBudgets（read_entity=30、add/edit_entry=12 等）；`chunker.py` 按段落/句界切塊（overlap 0.10）；`ops.py` AddOp(text≤240)/EditOp/DeleteOp(reason∈contradicted|superseded|stale|low-signal) 整批原子 apply；`snapshot/adapters.py` 每 surface 純唯讀適配器回 `list[Entity]{穩定id+sha1}`，`diff.py` 指紋比對產出「新增自上次」；`meta.py` sidecar `*.meta.json` 存 seen-ids（L2 存 entity refs、L3 存各 surface entry id 集），增量 diff 不靠 mtime
- 讀路徑：`read_memory` 工具拼 4 個 L3 槽；缺省回 `"(No memory available — ...)"`；L3 profile 生成要求多 surface 多條目才寫，禁猜測

### 8.2 兩個排程器（注意區分！）
- **`deeptutor/services/practice/scheduler.py`**（§3 精確公式）：practice/錯題每日複習專用，四檔 Again/Hard/Good/Easy + ease 2.5 系 SM-2，`queue(limit=20)`。HSHSA 要借就借這個。
- **`deeptutor/learning/scheduler.py`**（550 行，通用 Mastery-Path 留存模型）：`INTERVAL_SEQUENCES={MEMORY:[0,1,3,7,14,30,60], CONCEPT:[3,7,14,30], PROCEDURE:[3,7,14], DESIGN:[14,28]}`（天）；核心 `retrievability=exp(-elapsed/stability)`、`stability=interval/-ln(retention)`；desired_retention 預設 0.9（`set_desired_retention` 按 `-ln(new)/-ln(old)` 縮放已排期）；失敗 `stability=max(0.05, prev*ret*diff)`（`ret=0.55-0.25*prev_retrievability`，`diff=1.0-0.25*difficulty`，`lapse+=1`）；成功 `growth=1+qs*learn*effort*bonus`（quality≥0.8 且連對≥2 再 ×1.15）；同會話保護（elapsed 過小只計數不漲 stability）；`forgetting_risk=1-recall+min(overdue/7,0.25)+錯題0.2+min(0.1*lapse,0.2)`；`review_sort_key=(-risk,-overdue,priority)`。HSHSA 暫不需要此級別複雜度。
- 通用層另有：`models.py`（`KnowledgeType={MEMORY,CONCEPT,PROCEDURE,DESIGN}`、`LearningStage` 七階段、`QuizAttempt.voided`、`RepetitionState`）；`question_card.py` 卡片協議（`build_question_card()` 永不帶 expected_answer，`build_grade_result()` 判後釋放）；`grading.py` 確定性判分（choice 精確 / short 相似度≥0.85 / open 關鍵詞覆蓋≥0.6）；`mastery.py` 掌握門檻定量 0.9（對標 Alpha School 90%）+ `_RECENCY_WEIGHTS=(0.5,0.7,0.85,0.95,1.0)` + 證據數封頂（1條→0.5，2條→0.8）；`service.py grade_and_record()` 唯一真相源（fail-closed）；`assessment.py` 身份鍵 `(origin_type,origin_ref,turn_id,question_id)` 跨面去重

### 8.3 Partner/consult_subagent/工作區原始碼
- `services/partners/workspace_binding.py`：`partner_content_context(partner_id, config)` 無 workspace_id 得 `partner_user` scope，否則釘 `user_context(workspace_owner)` + `data_activity()` lease + `workspace_context(workspace_id)` 整輪（含 async tools）
- `services/workspace/workspace.py`：`data/partners/<id>/workspace/` verbatim clone chat PathService（`knowledge_bases/<kb>/`、`user/workspace/SOUL.md`、`skills/<name>/SKILL.md`、`notebook/`、`memory/`）；provisioning 在 requester context 複製整個 KB 樹/skill 目錄/notebook json+index；pointer KB 登記 `kb_config.json`
- `consult_subagent` 調用鏈：`capabilities/subagent/capability.py`（name="subagent"，owned_tools，選中 KB 為 connected subagent 時 owns turn，`min_loop_rounds=budget+2`）→ `tools.py` `ConsultSubagentTool`（模型只給 `question: string`，server 注入連線/budget/session；`count>=budget` 拒絕，預設 budget=5、上限 12）→ `services/subagent/` registry 11 後端（claude/codex/grok/antigravity/kimi/opencode/mimo/hermes/hermes_remote/openclaw/deepseek_harness）；`sessions.py` 以 `chat_session::connection` 為鍵存 `subagent_sessions.json`，consult tool + sidebar 共享同一 live session
- Grok 後端（`grok.py`）：`grok --output-format streaming-json --permission-mode dontAsk --no-memory --verbatim [--model][--reasoning-effort][--rules]`；`detect` 驗 `--version`+`--help` 含 `--single/--resume/--permission-mode/--no-memory/--verbatim`；`end.sessionId` 供 `--resume`；thought/用量簽名不轉發
- `outputs/<capability>/<session>/<turn>/` 建造者：`services/workspace/service.py:298-339 create_runtime_context()`，`logical=PurePosixPath("outputs", safe(capability,"chat"), safe_session_or_hash, safe(turn_id,"turn"))`，`resolve(binding,logical,write=True)`（outputs 外寫入拒絕），`mkdir -p`；呼叫方 `services/session/turns/executor.py:919,946`，每 turn 一目錄、同 turn 共享
- 執行環境：`services/workspace/execution.py prepare_workspace_execution_env()` 建 `turn_root + .deeptutor/execution/{home,tmp,cache,…}`，注入 `HOME/TMPDIR/XDG_CACHE/PIP_TARGET/…` + `PYTHONUTF8/UNBUFFERED=1`；`DEEPTUTOR_WORKSPACE_ROOT` 穩定 handle
- 沙盒鏈：`DEEPTUTOR_SANDBOX_RUNNER_URL→RunnerSidecarBackend` > Linux+`bwrap→BwrapBackend` > `ALLOW_SUBPROCESS=1→RestrictedSubprocessBackend` 否則 None；`SandboxService.run` 限 `UserExecQuota(max_concurrent=2,max_per_minute=20)`；runner/server.py 純 stdlib：`POST /exec {command,argv,workdir,env,mounts,limits}`，argv 優先，workdir 限 `ALLOWED_WORKDIRS`，`setrlimit + RLIMIT_NOFILE=4096`
- 工作區提示詞注入點未取證（疑 `agents/loop/prompt_blocks.py`）

## 9. HSHSA 可借 Top-5（按成本/收益）
1. **卡片協議：判前不洩答案**（低成本高收益）— `build_question_card()` 永不帶 expected_answer，判後 `build_grade_result()` 才釋放。我們 QuizView 目前列印直接出正解是刻意需求，但**互動模式**應確保 API 回傳不夾帶答案（檢查 `generation.explain`/quiz options 是否有洩漏），列印專用通道另取。
2. **確定性判分 + voided 語義**（低成本）— choice 精確匹配、short 相似度≥0.85、open 關鍵詞覆蓋≥0.6；作廢 attempt 標 `voided` 排除統計。我們 `attempt.log` 可加 `voided` 欄位（重出題/誤觸作廢）。
3. **四檔排程公式照搬**（中低成本）— `services/practice/scheduler.py` 僅 60 行，`interval/ease/streak/lapses` 四欄 + Again=10分鐘/Hard=×1.2/Good=3天起/Easy=×1.3、上限365天；`review()` 的 `request_id` 冪等 + `version` 樂觀檢查值得同學。我們 `dueAt` 二檔升級至此即可，confidence→rating 映射欄位已有。
4. **L1 append-only trace**（中成本）— `trace/<surface>/<date>.jsonl`，寫入永不拋（try 吞錯 warn），壞行跳過，ULID 關聯。我們可先給 quiz/flashcards/podcast 加 `{ts, kind, payload, genId}` jsonl，ReviewDashboard 讀來畫「歷史軌跡」，不動現有表。
5. **掌握門檻 0.9 + 信心封頂**（中成本）— 定量需 mastery≥0.9，證據<3 封頂 confidence（1 條→0.5，2 條→0.8）。我們 `setMastered` 目前手動標記，可加自動門檻：同題連對≥2 且 confidence 高才建議掌握。

Partner 綁定 / consult_subagent / sandbox runner 與 HSHSA 單機單用戶定位不合，僅記錄不借用。通用留存模型（`learning/scheduler.py`）複雜度暫不需要，等四檔排程落地後再評估。
