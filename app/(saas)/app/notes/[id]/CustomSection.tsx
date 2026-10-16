"use client";

import { useMemo, useState } from "react";
import {
  BUILTIN_TEMPLATES,
  CUSTOM_VARS,
  SIMPLE_LENGTHS,
  SIMPLE_METHODS,
  type SimpleLength,
  type SimpleMethod,
} from "@/server/custom";
import { trpc } from "@/lib/trpc";

/** Studio 自訂區：三層（簡易選項 / 範本 / 完整編輯器），全走 type=custom 管線。 */
export function CustomSection({
  noteId,
  focus,
  count,
  level,
  lang,
  rawText,
  busy,
  onStart,
}: {
  noteId: string;
  focus: string;
  count: "less" | "standard" | "more";
  level: "easy" | "medium" | "hard";
  lang: "zh-Hant" | "zh-Hans" | "en";
  rawText: string;
  busy: boolean;
  onStart: (id: string) => void;
}) {
  const start = trpc.generation.start.useMutation();
  const tpls = trpc.template.list.useQuery();
  const createTpl = trpc.template.create.useMutation();
  const updateTpl = trpc.template.update.useMutation();
  const removeTpl = trpc.template.remove.useMutation();
  const [tab, setTab] = useState<"simple" | "templates" | "editor">("simple");
  const [method, setMethod] = useState<SimpleMethod>("explain");
  const [length, setLength] = useState<SimpleLength>("standard");
  const [hintFirst, setHintFirst] = useState(false);
  const [edName, setEdName] = useState("");
  const [edBody, setEdBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [msg, setMsg] = useState("");

  const running = start.isPending || busy;

  async function fire(payload: Record<string, unknown>) {
    setMsg("");
    try {
      const res = await start.mutateAsync({
        noteId,
        type: "custom",
        count,
        difficulty: level,
        language: lang,
        focus,
        customKind: "simple",
        customMethod: "explain",
        customLength: "standard",
        customHintFirst: false,
        customTemplateId: "",
        customBody: "",
        ...payload,
      });
      onStart(res.id);
    } catch (e) {
      setMsg(`失敗：${e instanceof Error ? e.message : "未知錯誤"}`);
    }
  }

  // 第三層預覽：照 server 規則近似替換（僅供參考，以實際執行為準）
  const preview = useMemo(() => {
    if (!showPreview) return "";
    try {
      const unknown = new Set<string>();
      const out = edBody.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (m, name: string) => {
        switch (name) {
          case "note":
            return rawText.slice(0, 500) + (rawText.length > 500 ? "…（預覽截斷，實際送全文）" : "");
          case "paras":
            return "（編號段落，實際執行時帶入）";
          case "focus":
            return focus.trim() ? `（主題聚焦：${focus.trim().slice(0, 100)}）` : "";
          case "count":
            return "（按字數公式/自訂算出的數量）";
          case "difficulty":
            return level === "easy" ? "簡單" : level === "hard" ? "困難" : "中等";
          case "language":
            return lang === "zh-Hans" ? "简体中文" : lang === "en" ? "English" : "繁體中文";
          default:
            unknown.add(name);
            return m;
        }
      });
      if (unknown.size > 0) return `未知變數：{{${[...unknown].join("}}、{{")}}}（執行會報錯）\n\n${out}`;
      return out;
    } catch {
      return "";
    }
  }, [showPreview, edBody, rawText, focus, level, lang]);

  function loadEditor(id: string | null, name: string, body: string) {
    setEditingId(id);
    setEdName(name);
    setEdBody(body);
    setTab("editor");
    setMsg("");
  }

  async function save() {
    setMsg("");
    try {
      if (editingId) {
        await updateTpl.mutateAsync({ id: editingId, name: edName.trim(), body: edBody.trim() });
        setMsg("已更新。");
      } else {
        const r = await createTpl.mutateAsync({ name: edName.trim() || "未命名模板", body: edBody.trim() });
        setEditingId(r.id);
        setMsg("已儲存。");
      }
      tpls.refetch();
    } catch (e) {
      setMsg(`儲存失敗：${e instanceof Error ? e.message : "未知錯誤"}`);
    }
  }

  function Tab({ v, label }: { v: typeof tab; label: string }) {
    return (
      <button
        onClick={() => setTab(v)}
        className={`rounded px-2 py-1 text-xs font-medium ${tab === v ? "invert-chip" : "text-muted hover:text-ink"}`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <div className="flex items-center gap-1">
        <span className="text-xs font-semibold text-muted">自訂</span>
        <span className="ml-auto flex gap-0.5">
          <Tab v="simple" label="簡易" />
          <Tab v="templates" label="範本" />
          <Tab v="editor" label="編輯器" />
        </span>
      </div>

      {tab === "simple" && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1">
            {(Object.keys(SIMPLE_METHODS) as SimpleMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`rounded border px-2 py-1 text-xs ${method === m ? "invert-chip border-ink" : "border-line text-muted hover:border-muted"}`}
              >
                {SIMPLE_METHODS[m].label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(SIMPLE_LENGTHS) as SimpleLength[]).map((l) => (
              <button
                key={l}
                onClick={() => setLength(l)}
                className={`rounded border px-2 py-1 text-xs ${length === l ? "invert-chip border-ink" : "border-line text-muted hover:border-muted"}`}
              >
                {SIMPLE_LENGTHS[l].label}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={hintFirst} onChange={(e) => setHintFirst(e.target.checked)} className="accent-[#059669]" />
            先提示再公布答案
          </label>
          <button
            onClick={() => fire({ customKind: "simple", customMethod: method, customLength: length, customHintFirst: hintFirst })}
            disabled={running}
            className="btn-ghost w-full !justify-start text-sm disabled:opacity-50"
          >
            生成自訂
          </button>
        </div>
      )}

      {tab === "templates" && (
        <div className="flex flex-col gap-2">
          {BUILTIN_TEMPLATES.map((t) => (
            <div key={t.id} className="rounded-md border border-line p-2">
              <div className="text-xs font-bold">{t.name}</div>
              <div className="mt-0.5 text-[11px] text-muted">{t.desc}</div>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  onClick={() => fire({ customKind: "template", customTemplateId: t.id })}
                  disabled={running}
                  className="rounded border border-line px-2 py-0.5 text-xs font-semibold hover:border-muted disabled:opacity-50"
                >
                  直接生成
                </button>
                <button
                  onClick={() => loadEditor(null, `${t.name}（我的）`, t.body)}
                  className="rounded border border-line px-2 py-0.5 text-xs text-muted hover:border-muted hover:text-ink"
                >
                  複製成我的再改
                </button>
              </div>
            </div>
          ))}
          <div className="text-xs font-semibold text-muted">我的模板{tpls.data && tpls.data.length > 0 && `（${tpls.data.length}）`}</div>
          {!tpls.data ? (
            <p className="text-xs text-muted">讀取中…</p>
          ) : tpls.data.length === 0 ? (
            <p className="text-xs text-muted">還沒有，去編輯器寫第一個吧。</p>
          ) : (
            tpls.data.map((t) => (
              <div key={t.id} className="flex items-center gap-1.5 rounded-md border border-line p-2">
                <span className="min-w-0 flex-1 truncate text-xs font-bold">{t.name}</span>
                <button
                  onClick={() => fire({ customKind: "template", customTemplateId: t.id })}
                  disabled={running}
                  className="shrink-0 rounded border border-line px-2 py-0.5 text-xs font-semibold hover:border-muted disabled:opacity-50"
                >
                  生成
                </button>
                <button
                  onClick={() => loadEditor(t.id, t.name, t.body)}
                  className="shrink-0 rounded border border-line px-2 py-0.5 text-xs text-muted hover:border-muted hover:text-ink"
                >
                  改
                </button>
                <button
                  onClick={async () => {
                    await removeTpl.mutateAsync({ id: t.id });
                    tpls.refetch();
                  }}
                  className="shrink-0 rounded border border-transparent px-1.5 py-0.5 text-xs text-muted hover:border-red-400 hover:text-red-600"
                >
                  刪
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "editor" && (
        <div className="flex flex-col gap-1.5">
          <input
            value={edName}
            onChange={(e) => setEdName(e.target.value)}
            placeholder="模板名稱（例如：我的口訣法）"
            className="field text-xs"
          />
          <textarea
            value={edBody}
            onChange={(e) => setEdBody(e.target.value)}
            rows={7}
            placeholder={"寫指令，用 {{變數}} 插筆記，例如：\n把以下筆記整理成表格：\n\n{{note}}"}
            className="field resize-y font-mono text-xs"
          />
          <div className="flex flex-wrap gap-1">
            {CUSTOM_VARS.map((v) => (
              <button
                key={v}
                onClick={() => setEdBody((b) => b + `{{${v}}}`)}
                title="點我插入"
                className="rounded bg-paper px-1.5 py-0.5 font-mono text-[11px] text-accent hover:underline"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
          <button onClick={() => setShowPreview((s) => !s)} className="self-start text-xs font-semibold text-accent hover:underline">
            {showPreview ? "收起預覽" : "預覽實際送出的 Prompt"}
          </button>
          {showPreview && (
            <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-paper p-2 font-mono text-[11px] leading-relaxed">
              {preview || "（空的）"}
            </pre>
          )}
          <div className="flex gap-1.5">
            <button
              onClick={save}
              disabled={createTpl.isPending || updateTpl.isPending || !edBody.trim()}
              className="btn-ghost flex-1 !px-3 !py-1.5 text-xs disabled:opacity-50"
            >
              {editingId ? "更新儲存" : "儲存成模板"}
            </button>
            <button
              onClick={() => fire({ customKind: "raw", customBody: edBody.trim() })}
              disabled={running || !edBody.trim()}
              className="btn-ghost flex-1 !px-3 !py-1.5 text-xs disabled:opacity-50"
            >
              直接生成（不存）
            </button>
          </div>
          {editingId && (
            <button onClick={() => loadEditor(null, "", "")} className="self-start text-[11px] text-muted hover:text-ink">
              寫新的（清空）
            </button>
          )}
        </div>
      )}
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
