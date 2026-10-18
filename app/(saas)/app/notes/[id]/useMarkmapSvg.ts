"use client";

import { useEffect, useRef, useState } from "react";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";

const transformer = new Transformer();

function headingsOf(md: string): string[] {
  return md
    .split("\n")
    .map((l) => l.match(/^#{1,6}\s+(.*)$/)?.[1].trim())
    .filter((t): t is string => !!t);
}

/** markmap SVG 生命週期：result 變了就重建、點節點選中/取消、卸載銷毀。 */
export function useMarkmapSvg(result: string, svgRef: React.RefObject<SVGSVGElement | null>) {
  const mmRef = useRef<Markmap | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [titles, setTitles] = useState<string[]>([]);
  const titlesRef = useRef<string[]>([]);

  useEffect(() => {
    if (!svgRef.current) return;
    const found = headingsOf(result);
    titlesRef.current = found;
    setTitles(found);
    setSelected(null);
    const { root } = transformer.transform(result);
    mmRef.current?.destroy();
    const svg = svgRef.current;
    mmRef.current = Markmap.create(svg, { autoFit: true, duration: 300 }, root);
    const onClick = (e: MouseEvent) => {
      const el = e.target as Element | null;
      const g = el?.closest?.("g.markmap-node");
      if (!g) return;
      const fo = g.querySelector(":scope > foreignObject");
      const label = (((fo?.textContent ?? g.textContent) as string | null) ?? "").trim().replace(/\s+/g, " ");
      if (!label) return;
      const hit = titlesRef.current.find((t) => label === t || label.startsWith(t) || t.startsWith(label));
      if (!hit) return;
      setSelected((prev) => (prev === hit ? null : hit));
    };
    svg.addEventListener("click", onClick, true);
    return () => {
      svg.removeEventListener("click", onClick, true);
      mmRef.current?.destroy();
      mmRef.current = null;
    };
  }, [result, svgRef]);

  return { titles, selected, setSelected };
}
