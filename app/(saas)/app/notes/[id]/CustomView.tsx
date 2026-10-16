"use client";

import { downloadText, safeName } from "@/lib/export";
import { AiMessage } from "@/app/(saas)/app/chat/AiMessage";

const EMPTY_SOURCES = new Map<string, { title: string; text: string }>();

/** 自訂生成結果：自由 Markdown，附匯出。[pN] 照樣可點溯源（paras 傳進來就有）。 */
export function CustomView({
  result,
  title,
  paras,
}: {
  result: string;
  title: string;
  paras: { id: string; text: string }[];
}) {
  const parasMap = new Map(paras.map((p) => [p.id.replace(/^p/, ""), p.text]));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center">
        <span className="rounded border border-line px-1.5 py-0.5 text-xs font-semibold text-muted">自訂</span>
        <button
          onClick={() => downloadText(`${safeName(title)}-自訂.md`, `# ${title}（自訂）\n\n${result}`)}
          className="ml-auto rounded border border-line px-2 py-0.5 text-xs font-semibold text-muted hover:border-muted hover:text-ink"
        >
          匯出 MD
        </button>
      </div>
      <AiMessage text={result} paras={parasMap} sources={EMPTY_SOURCES} />
    </div>
  );
}
