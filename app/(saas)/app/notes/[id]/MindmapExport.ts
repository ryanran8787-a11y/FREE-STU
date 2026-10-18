"use client";

import { useState } from "react";
import { downloadBlob, downloadText, safeName, serializeSvg } from "@/lib/export";

function pngName(title: string) {
  return `${safeName(title)}-心智圖.png`;
}

/** MindmapView 匯出列：MD/SVG/PNG。PNG 用 html-to-image 動態載入，太大自動降 1x 再保底 SVG。 */
export function useMindmapExport(title: string, result: string, svgRef: React.RefObject<SVGSVGElement | null>) {
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
        downloadBlob(pngName(title), await shot(2));
        setExportMsg("");
      } catch {
        downloadBlob(pngName(title), await shot(1));
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

  return { exportMsg, exportMd, exportSvg, exportPng };
}
