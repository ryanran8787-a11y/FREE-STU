"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { CustomSimple } from "./CustomSimple";
import { CustomTemplates } from "./CustomTemplates";
import { CustomEditor } from "./CustomEditor";

/** Studio 自訂區：三層（簡易選項 / 範本 / 完整編輯器），全走 type=custom 管線。Section 只做管線 + tab 切換。 */
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
  const [tab, setTab] = useState<"simple" | "templates" | "editor">("simple");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edName, setEdName] = useState("");
  const [edBody, setEdBody] = useState("");
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

  function loadEditor(id: string | null, name: string, body: string) {
    setEditingId(id);
    setEdName(name);
    setEdBody(body);
    setTab("editor");
    setMsg("");
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

      {tab === "simple" && <CustomSimple running={running} fire={fire} />}

      {tab === "templates" && <CustomTemplates running={running} fire={fire} loadEditor={loadEditor} />}

      {tab === "editor" && (
        <CustomEditor
          state={{ editingId, edName, edBody }}
          ctl={{
            setEditingId,
            setEdName,
            setEdBody,
            onSavedNew: (id) => setEditingId(id),
            setMsg,
          }}
          running={running}
          fire={fire}
          focus={focus}
          level={level}
          lang={lang}
          rawText={rawText}
        />
      )}
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
