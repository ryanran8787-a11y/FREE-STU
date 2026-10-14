"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** 把正文裡的 [p12] 轉成可點的引用 chip（跳過程式碼區塊） */
function rehypeParaRefs() {
  return (tree: any) => {
    const walk = (node: any) => {
      if (!node || !node.children) return;
      const out: any[] = [];
      for (const child of node.children) {
        if (child.type === "text") {
          const re = /\[p(\d+)\]/g;
          let last = 0;
          let m: RegExpExecArray | null;
          let matched = false;
          while ((m = re.exec(child.value))) {
            matched = true;
            if (m.index > last) out.push({ type: "text", value: child.value.slice(last, m.index) });
            out.push({
              type: "element",
              tagName: "cite",
              properties: { dataPara: m[1], className: ["cite-chip"] },
              children: [{ type: "text", value: `p${m[1]}` }],
            });
            last = m.index + m[0].length;
          }
          if (!matched) out.push(child);
          else if (last < child.value.length) out.push({ type: "text", value: child.value.slice(last) });
        } else {
          if (child.tagName !== "pre" && child.tagName !== "code") walk(child);
          out.push(child);
        }
      }
      node.children = out;
    };
    walk(tree);
  };
}

const mdComponents = {
  p: (props: any) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0" {...props} />,
  ul: (props: any) => <ul className="my-2 list-disc space-y-1 pl-5" {...props} />,
  ol: (props: any) => <ol className="my-2 list-decimal space-y-1 pl-5" {...props} />,
  li: (props: any) => <li className="leading-relaxed" {...props} />,
  h1: (props: any) => <h1 className="mb-2 mt-3 text-base font-bold first:mt-0" {...props} />,
  h2: (props: any) => <h2 className="mb-2 mt-3 text-base font-bold first:mt-0" {...props} />,
  h3: (props: any) => <h3 className="mb-1 mt-2 text-sm font-bold first:mt-0" {...props} />,
  blockquote: (props: any) => <blockquote className="my-2 border-l-2 border-line pl-3 text-muted" {...props} />,
  code: (props: any) => <code className="rounded bg-paper px-1 py-0.5 font-mono text-[13px]" {...props} />,
  pre: (props: any) => <pre className="my-2 overflow-x-auto rounded-md border border-line bg-paper p-3 text-[13px]" {...props} />,
  a: (props: any) => <a className="text-accent underline" target="_blank" rel="noreferrer" {...props} />,
  table: (props: any) => <div className="my-2 overflow-x-auto"><table className="w-full text-sm" {...props} /></div>,
  th: (props: any) => <th className="border border-line bg-paper px-2 py-1 text-left" {...props} />,
  td: (props: any) => <td className="border border-line px-2 py-1" {...props} />,
};

export function AiMessage({ text, paras }: { text: string; paras: Map<string, string> }) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  function onClick(e: React.MouseEvent) {
    const el = (e.target as Element).closest?.("[data-para]");
    const id = el?.getAttribute("data-para");
    if (!id) return;
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div onClick={onClick} className="max-w-[90%] whitespace-pre-wrap rounded-lg rounded-bl-sm border border-line bg-paper px-3.5 py-2.5 text-sm leading-relaxed">
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeParaRefs]} components={mdComponents}>
          {text}
        </Markdown>
      </div>
      {[...open].map(
        (id) =>
          paras.has(id) && (
            <div key={id} className="max-w-[90%] rounded-md bg-paper px-3 py-2 text-xs leading-relaxed">
              <span className="mr-2 font-mono font-bold text-muted">[p{id}]</span>
              {paras.get(id)}
            </div>
          ),
      )}
    </div>
  );
}
