"use client";

import { useEffect, useRef, useState } from "react";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";
import type { Para } from "@/lib/paras";

const transformer = new Transformer();

function headingsOf(md: string): string[] {
  return md
    .split("\n")
    .map((l) => l.match(/^#{1,6}\s+(.*)$/)?.[1].trim())
    .filter((t): t is string => !!t);
}

export function MindmapView({
  result,
  sources,
  paras,
}: {
  result: string;
  sources: Record<string, string[]>;
  paras: Para[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const mmRef = useRef<Markmap | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const titles = useRef<string[]>([]);

  useEffect(() => {
    if (!svgRef.current) return;
    titles.current = headingsOf(result);
    const { root } = transformer.transform(result);
    mmRef.current?.destroy();
    const svg = svgRef.current;
    mmRef.current = Markmap.create(svg, { autoFit: true, duration: 300 }, root);
    const onClick = (e: MouseEvent) => {
      const g = (e.target as Element).closest?.("g.markmap-node");
      if (!g) return;
      const text = (g.textContent ?? "").trim().replace(/\s+/g, " ");
      const hit = titles.current.find((t) => text === t || text.startsWith(t) || t.startsWith(text.slice(0, 40)));
      setSelected(hit ?? null);
    };
    svg.addEventListener("click", onClick);
    return () => {
      svg.removeEventListener("click", onClick);
      mmRef.current?.destroy();
      mmRef.current = null;
    };
  }, [result]);

  const paraById = new Map(paras.map((p) => [p.id, p.text]));
  const refs = selected ? (sources[selected] ?? []) : [];

  return (
    <div className="flex flex-col gap-2">
      <div className="card overflow-hidden">
        <svg ref={svgRef} className="h-[420px] w-full bg-card md:h-[520px]" />
        <p className="border-t border-line px-4 py-2 text-xs text-muted">可縮放 · 點節點收合/展開，再點一次看來源</p>
      </div>
      {selected && (
        <div className="card rise p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">{selected}</span>
            {refs.length === 0 ? (
              <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-muted">尚未驗證來源</span>
            ) : (
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-deep">
                {refs.length} 段來源
              </span>
            )}
            <button onClick={() => setSelected(null)} className="ml-auto text-xs text-muted hover:text-ink">
              關閉
            </button>
          </div>
          {refs.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {refs.map((id) => (
                <div key={id} className="rounded-md bg-paper px-3 py-2 text-xs leading-relaxed">
                  <span className="mr-2 font-mono font-bold text-muted">[{id}]</span>
                  {paraById.get(id) ?? "（段落已不存在）"}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function countMindmapNodes(md: string): number {
  return headingsOf(md).length;
}
