"use client";

import { useEffect, useRef, useState } from "react";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";
import { downloadBlob, downloadText, safeName, serializeSvg } from "@/lib/export";
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
  onGenerate,
  title,
}: {
  result: string;
  sources: Record<string, string[]>;
  paras: Para[];
  onGenerate?: (type: "flashcards" | "quiz", focus: string) => void;
  title: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const mmRef = useRef<Markmap | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [selftest, setSelftest] = useState(false);
  const [titles, setTitles] = useState<string[]>([]);
  const titlesRef = useRef<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const found = headingsOf(result);
    titlesRef.current = found;
    setTitles(found);
    const { root } = transformer.transform(result);
    mmRef.current?.destroy();
    const svg = svgRef.current;
    mmRef.current = Markmap.create(svg, { autoFit: true, duration: 300 }, root);
    // capture 期監聽：markmap 內部會 stopPropagation，bubble 期到不了 svg。
    // 只讀直屬 foreignObject 的文字（不含子孫），才能精確對上標題。
    const onClick = (e: MouseEvent) => {
      const el = e.target as Element | null;
      const g = el?.closest?.("g.markmap-node");
      if (typeof console !== "undefined") console.debug("[mindmap] click", (el as Element)?.tagName, !!g);
      if (!g) return;
      const fo = g.querySelector(":scope > foreignObject");
      const label = ((fo?.textContent ?? g.textContent ?? "") as string).trim().replace(/\s+/g, " ");
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
  }, [result]);

  const paraById = new Map(paras.map((p) => [p.id, p.text]));
  const refs = selected ? (sources[selected] ?? []) : [];
  const [exportMsg, setExportMsg] = useState("");

  function exportMd() {
    downloadText(`${safeName(title)}-心智圖.md`, result);
  }

  function exportSvg() {
    if (!svgRef.current) return;
    try {
      downloadText(`${safeName(title)}-心智圖.svg`, serializeSvg(svgRef.current), "image/svg+xml;charset=utf-8");
    } catch {
      setExportMsg("SVG 匯出失敗");
    }
  }

  async function exportPng() {
    if (!svgRef.current) return;
    setExportMsg("轉 PNG 中…");
    const { toPng } = await import("html-to-image");
    const shot = async (pixelRatio: number) => {
      const dataUrl = await toPng(svgRef.current as unknown as HTMLElement, {
        backgroundColor: "#ffffff",
        pixelRatio,
        cacheBust: true,
      });
      return await (await fetch(dataUrl)).blob();
    };
    try {
      try {
        downloadBlob(`${safeName(title)}-心智圖.png`, await shot(2));
        setExportMsg("");
      } catch {
        // 圖太大 2x 會爆 canvas 上限，降到 1x 再試
        downloadBlob(`${safeName(title)}-心智圖.png`, await shot(1));
        setExportMsg("圖太大，已降為 1x 解析度。要無限放大請用 SVG。");
      }
    } catch {
      // 還是太大：保底改存 SVG（向量無限放大不失真）
      try {
        downloadText(`${safeName(title)}-心智圖.svg`, serializeSvg(svgRef.current), "image/svg+xml;charset=utf-8");
        setExportMsg("圖太大 PNG 裝不下，已改存 SVG（向量可無限放大）。");
      } catch {
        setExportMsg("匯出失敗，改用 SVG 或 MD 試試。");
      }
    }
  }

  useEffect(() => {
    if (selected) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected]);

  return (
    <div className="flex flex-col gap-2">
      <div className={`card overflow-hidden ${selftest ? "selftest" : ""}`}>
        <svg ref={svgRef} className="h-[420px] w-full bg-card md:h-[520px]" />
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2 text-xs text-muted">
          <span>可縮放 · 點圖上節點收合/看來源</span>
          <span className="ml-auto flex items-center gap-1">
            <button onClick={exportMd} className="rounded border border-line px-2 py-0.5 font-semibold hover:border-muted">MD</button>
            <button onClick={exportSvg} className="rounded border border-line px-2 py-0.5 font-semibold hover:border-muted">SVG</button>
            <button onClick={exportPng} title="圖太大會自動降解析度，終極保底改存 SVG" className="rounded border border-line px-2 py-0.5 font-semibold hover:border-muted">PNG</button>
          </span>
          <button
            onClick={() => setSelftest((v) => !v)}
            title="遮住葉節點文字，自己回想再展開對答案"
            className={`rounded-full border px-2.5 py-1 font-semibold transition-colors ${selftest ? "border-ink bg-ink text-white" : "border-line hover:border-muted"}`}
          >
            {selftest ? "自測中…點我結束" : "自測模式"}
          </button>
          <button onClick={() => setShowList((v) => !v)} className="font-semibold text-accent hover:underline">
            {showList ? "收起節點列表" : `節點列表（${titles.length}）▾`}
          </button>
        </div>
        {exportMsg && <p className="border-t border-line px-4 py-1.5 text-xs text-muted">{exportMsg}</p>}
        {showList && (
          <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto border-t border-line p-3">
            {titles.map((t) => (
              <button
                key={t}
                onClick={() => setSelected((prev) => (prev === t ? null : t))}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${selected === t ? "border-ink bg-ink text-white" : "border-line hover:border-muted"}`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
      {selected && (
        <div ref={panelRef} className="card rise scroll-mt-24 p-4">
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
          {onGenerate && (
            <div className="mt-3 flex gap-2">
              <button onClick={() => onGenerate("flashcards", selected)} className="btn-ghost !px-3 !py-1.5 text-xs">
                以「{selected.length > 12 ? selected.slice(0, 12) + "…" : selected}」出閃卡
              </button>
              <button onClick={() => onGenerate("quiz", selected)} className="btn-ghost !px-3 !py-1.5 text-xs">
                出測驗
              </button>
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
