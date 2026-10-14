"use client";

import { useEffect, useRef, useState } from "react";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";
import { trpc } from "@/lib/trpc";
import { downloadBlob, downloadText, safeName, serializeSvg } from "@/lib/export";
import { deleteNodeFromMd, renameNodeInMd } from "@/lib/mindmap";
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
  const mmRef = useRef<Markmap | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [selftest, setSelftest] = useState(false);
  const [titles, setTitles] = useState<string[]>([]);
  const titlesRef = useRef<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const [mastered, setMastered] = useState<Set<string>>(new Set(masteredInit));
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [exportMsg, setExportMsg] = useState("");
  const saveResult = trpc.generation.saveResult.useMutation();
  const setMasteredMut = trpc.generation.setMastered.useMutation();

  useEffect(() => {
    if (!svgRef.current) return;
    const found = headingsOf(result);
    titlesRef.current = found;
    setTitles(found);
    setSelected(null);
    setRenaming(false);
    setConfirmDelete(false);
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
  }, [result]);

  const paraById = new Map(paras.map((p) => [p.id, p.text]));
  const refs = selected ? (sources[selected] ?? []) : [];

  useEffect(() => {
    if (selected) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected]);

  async function persist(newMd: string, newSources: Record<string, string[]>) {
    setSaveMsg("儲存中…");
    try {
      await saveResult.mutateAsync({ id: genId, result: newMd, sourceMap: newSources });
      setSaveMsg("");
      onSaved();
    } catch (e) {
      setSaveMsg(`儲存失敗：${e instanceof Error ? e.message : "未知錯誤"}`);
    }
  }

  function doRename() {
    if (!selected) return;
    const name = newName.trim();
    const next = renameNodeInMd(result, selected, name);
    if (!next) {
      setSaveMsg("改名失敗（名稱為空）");
      return;
    }
    const map = { ...sources };
    if (map[selected]) {
      map[name] = map[selected];
      delete map[selected];
    }
    const mNext = new Set(mastered);
    if (mNext.delete(selected)) mNext.add(name);
    setMastered(mNext);
    setMasteredMut.mutate({ id: genId, titles: [...mNext] });
    setRenaming(false);
    setSelected(name);
    persist(next, map);
  }

  function doDelete() {
    if (!selected) return;
    const next = deleteNodeFromMd(result, selected);
    if (!next) {
      setSaveMsg("刪除失敗（不能刪根節點）");
      setConfirmDelete(false);
      return;
    }
    const map = { ...sources };
    delete map[selected];
    setConfirmDelete(false);
    persist(next, map);
  }

  function toggleMastered() {
    if (!selected) return;
    const next = new Set(mastered);
    if (next.has(selected)) next.delete(selected);
    else next.add(selected);
    setMastered(next);
    setMasteredMut.mutate({ id: genId, titles: [...next] });
  }

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
        downloadBlob(`${safeName(title)}-心智圖.png`, await shot(1));
        setExportMsg("圖太大，已降為 1x 解析度。要無限放大請用 SVG。");
      }
    } catch {
      try {
        downloadText(`${safeName(title)}-心智圖.svg`, serializeSvg(svgRef.current!), "image/svg+xml;charset=utf-8");
        setExportMsg("圖太大 PNG 裝不下，已改存 SVG（向量可無限放大）。");
      } catch {
        setExportMsg("匯出失敗，改用 SVG 或 MD 試試。");
      }
    }
  }

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
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${selected === t ? "border-ink bg-ink text-white" : "border-line hover:border-muted"} ${mastered.has(t) ? "line-through opacity-60" : ""}`}
              >
                {mastered.has(t) ? "✓ " : ""}{t}
              </button>
            ))}
          </div>
        )}
      </div>
      {selected && (
        <div ref={panelRef} className="card rise scroll-mt-24 p-4">
          <div className="flex items-center gap-2">
            {renaming ? (
              <>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") doRename();
                    if (e.key === "Escape") setRenaming(false);
                  }}
                  autoFocus
                  className="field !w-auto flex-1 text-sm"
                />
                <button onClick={doRename} className="rounded border border-line px-2.5 py-1 text-xs font-semibold hover:border-muted">確定</button>
                <button onClick={() => setRenaming(false)} className="rounded border border-line px-2.5 py-1 text-xs text-muted hover:border-muted">取消</button>
              </>
            ) : (
              <>
                <span className="text-sm font-bold">{selected}</span>
                {refs.length === 0 ? (
                  <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-muted">尚未驗證來源</span>
                ) : (
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-deep">
                    {refs.length} 段來源
                  </span>
                )}
                {mastered.has(selected) && (
                  <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-white">✓ 已理解</span>
                )}
                <span className="ml-auto flex items-center gap-1">
                  <button onClick={toggleMastered} title="標記已理解 / 取消" className="rounded border border-line px-2 py-0.5 text-xs font-semibold hover:border-muted">
                    {mastered.has(selected) ? "取消已理解" : "已理解"}
                  </button>
                  <button
                    onClick={() => {
                      setNewName(selected);
                      setRenaming(true);
                    }}
                    className="rounded border border-line px-2 py-0.5 text-xs font-semibold hover:border-muted"
                  >
                    改名
                  </button>
                  {confirmDelete ? (
                    <>
                      <button onClick={doDelete} className="rounded border border-red-400 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                        確認刪除整支
                      </button>
                      <button onClick={() => setConfirmDelete(false)} className="rounded border border-line px-2 py-0.5 text-xs text-muted hover:border-muted">
                        取消
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDelete(true)} className="rounded border border-line px-2 py-0.5 text-xs text-muted hover:border-red-400 hover:text-red-600">
                      刪除
                    </button>
                  )}
                  <button onClick={() => setSelected(null)} className="rounded border border-line px-2 py-0.5 text-xs text-muted hover:border-muted">
                    關閉
                  </button>
                </span>
              </>
            )}
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
          {saveMsg && <p className="mt-2 text-xs text-muted">{saveMsg}</p>}
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
