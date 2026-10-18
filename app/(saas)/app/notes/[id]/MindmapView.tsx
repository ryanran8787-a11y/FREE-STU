"use client";

import { useRef, useState } from "react";
import type { Para } from "@/lib/paras";
import { parseHeadings } from "@/lib/mindmap";
import { useMarkmapSvg } from "./useMarkmapSvg";
import { useMindmapNodes } from "./useMindmapNodes";
import { useMindmapExport } from "./MindmapExport";
import { MindmapNodePanel } from "./MindmapNodePanel";

export function MindmapView({
  result,
  sources,
  paras,
  onGenerate,
  title,
  genId,
  masteredInit,
  onSaved,
}: {
  result: string;
  sources: Record<string, string[]>;
  paras: Para[];
  onGenerate?: (type: "flashcards" | "quiz", focus: string) => void;
  title: string;
  genId: string;
  masteredInit: string[];
  onSaved: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [showList, setShowList] = useState(false);
  const [selftest, setSelftest] = useState(false);

  const { titles, selected, setSelected } = useMarkmapSvg(result, svgRef);
  const nodes = useMindmapNodes({ result, sources, genId, masteredInit, titles, selected, setSelected, onSaved });
  const exp = useMindmapExport(title, result, svgRef);

  return (
    <div className="flex flex-col gap-2">
      <div className={`card overflow-hidden ${selftest ? "selftest" : ""}`}>
        <svg ref={svgRef} className="h-[420px] w-full bg-card md:h-[520px]" />
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2 text-xs text-muted">
          <span>可縮放 · 點圖上節點收合/看來源</span>
          <span className="ml-auto flex items-center gap-1">
            <button onClick={exp.exportMd} className="rounded border border-line px-2 py-0.5 font-semibold hover:border-muted">MD</button>
            <button onClick={exp.exportSvg} className="rounded border border-line px-2 py-0.5 font-semibold hover:border-muted">SVG</button>
            <button onClick={exp.exportPng} title="圖太大會自動降解析度，終極保底改存 SVG" className="rounded border border-line px-2 py-0.5 font-semibold hover:border-muted">PNG</button>
          </span>
          <button
            onClick={() => setSelftest((v) => !v)}
            title="遮住葉節點文字，自己回想再展開對答案"
            className={`rounded-full border px-2.5 py-1 font-semibold transition-colors ${selftest ? "invert-chip border-ink" : "border-line hover:border-muted"}`}
          >
            {selftest ? "自測中…點我結束" : "自測模式"}
          </button>
          <button onClick={() => setShowList((v) => !v)} className="font-semibold text-accent hover:underline">
            {showList ? "收起節點列表" : `節點列表（${titles.length}）▾`}
          </button>
        </div>
        {exp.exportMsg && <p className="border-t border-line px-4 py-1.5 text-xs text-muted">{exp.exportMsg}</p>}
        {showList && (
          <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto border-t border-line p-3">
            {titles.map((t) => (
              <button
                key={t}
                onClick={() => setSelected(selected === t ? null : t)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${selected === t ? "invert-chip border-ink" : "border-line hover:border-muted"} ${nodes.mastered.has(t) ? "line-through opacity-60" : ""}`}
              >
                {nodes.mastered.has(t) ? "✓ " : ""}{t}
              </button>
            ))}
          </div>
        )}
      </div>
      {selected && (
        <MindmapNodePanel
          selected={selected}
          paras={paras}
          sources={sources}
          onGenerate={onGenerate}
          onClose={() => setSelected(null)}
          nodes={nodes}
        />
      )}
    </div>
  );
}

export function countMindmapNodes(md: string): number {
  return parseHeadings(md).length;
}
