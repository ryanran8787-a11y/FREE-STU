"use client";

import { BUILTIN_TEMPLATES } from "@/server/custom";
import { trpc } from "@/lib/trpc";
import type { CustomFire } from "./CustomSimple";

export type CustomLoadEditor = (id: string | null, name: string, body: string) => void;

/** 自訂第二層：範本（內建直接生成/複製 + 我的模板生成/改/刪）。 */
export function CustomTemplates({
  running,
  fire,
  loadEditor,
}: {
  running: boolean;
  fire: CustomFire;
  loadEditor: CustomLoadEditor;
}) {
  const tpls = trpc.template.list.useQuery();
  const removeTpl = trpc.template.remove.useMutation();

  return (
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
  );
}
