"use client";

import { useMemo, useState } from "react";
import { CUSTOM_VARS } from "@/server/custom";
import { trpc } from "@/lib/trpc";
import type { CustomFire } from "./CustomSimple";

export type CustomEditorState = {
  editingId: string | null;
  edName: string;
  edBody: string;
};

export type CustomEditorCtl = {
  setEditingId: (v: string | null) => void;
  setEdName: (v: string) => void;
  setEdBody: (v: React.SetStateAction<string>) => void;
  onSavedNew: (id: string) => void;
  setMsg: (v: string) => void;
};

/** 自訂第三層：完整編輯器（模板名稱/body + 變數插入 + 預覽 + 儲存/直接生成）。state 由 Section 持有，tab 切換不丟失。 */
export function CustomEditor({
  state,
  ctl,
  running,
  fire,
  focus,
  level,
  lang,
  rawText,
}: {
  state: CustomEditorState;
  ctl: CustomEditorCtl;
  running: boolean;
  fire: CustomFire;
  focus: string;
  level: "easy" | "medium" | "hard";
  lang: "zh-Hant" | "zh-Hans" | "en";
  rawText: string;
}) {
  const { editingId, edName, edBody } = state;
  const tpls = trpc.template.list.useQuery();
  const createTpl = trpc.template.create.useMutation();
  const updateTpl = trpc.template.update.useMutation();
  const [showPreview, setShowPreview] = useState(false);

  // 預覽：照 server 規則近似替換（僅供參考，以實際執行為準）
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

  async function save() {
    ctl.setMsg("");
    try {
      if (editingId) {
        await updateTpl.mutateAsync({ id: editingId, name: edName.trim(), body: edBody.trim() });
        ctl.setMsg("已更新。");
      } else {
        const r = await createTpl.mutateAsync({ name: edName.trim() || "未命名模板", body: edBody.trim() });
        ctl.onSavedNew(r.id);
        ctl.setMsg("已儲存。");
      }
      tpls.refetch();
    } catch (e) {
      ctl.setMsg(`儲存失敗：${e instanceof Error ? e.message : "未知錯誤"}`);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        value={edName}
        onChange={(e) => ctl.setEdName(e.target.value)}
        placeholder="模板名稱（例如：我的口訣法）"
        className="field text-xs"
      />
      <textarea
        value={edBody}
        onChange={(e) => ctl.setEdBody(e.target.value)}
        rows={7}
        placeholder={"寫指令，用 {{變數}} 插筆記，例如：\n把以下筆記整理成表格：\n\n{{note}}"}
        className="field resize-y font-mono text-xs"
      />
      <div className="flex flex-wrap gap-1">
        {CUSTOM_VARS.map((v) => (
          <button
            key={v}
            onClick={() => ctl.setEdBody((b) => b + `{{${v}}}`)}
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
          className="btn-ghost flex-1 px-3! py-1.5! text-xs disabled:opacity-50"
        >
          {editingId ? "更新儲存" : "儲存成模板"}
        </button>
        <button
          onClick={() => fire({ customKind: "raw", customBody: edBody.trim() })}
          disabled={running || !edBody.trim()}
          className="btn-ghost flex-1 px-3! py-1.5! text-xs disabled:opacity-50"
        >
          直接生成（不存）
        </button>
      </div>
      {editingId && (
        <button
          onClick={() => {
            ctl.setEditingId(null);
            ctl.setEdName("");
            ctl.setEdBody("");
          }}
          className="self-start text-[11px] text-muted hover:text-ink"
        >
          寫新的（清空）
        </button>
      )}
    </div>
  );
}
