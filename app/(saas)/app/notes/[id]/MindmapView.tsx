"use client";

import { useEffect, useRef } from "react";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";

const transformer = new Transformer();

export function MindmapView({ result }: { result: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const mmRef = useRef<Markmap | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const { root } = transformer.transform(result);
    mmRef.current?.destroy();
    mmRef.current = Markmap.create(svgRef.current, { autoFit: true, duration: 300 }, root);
    return () => {
      mmRef.current?.destroy();
      mmRef.current = null;
    };
  }, [result]);

  return (
    <div className="card overflow-hidden">
      <svg ref={svgRef} className="h-[420px] w-full bg-card md:h-[520px]" />
      <p className="border-t border-line px-4 py-2 text-xs text-muted">可縮放 · 點節點收合/展開</p>
    </div>
  );
}

export function countMindmapNodes(md: string): number {
  return md.split("\n").filter((l) => /^#{1,6}\s/.test(l.trim())).length;
}
