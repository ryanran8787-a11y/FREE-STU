// 純前端匯出：下載檔案，不經後端。

export function downloadText(filename: string, text: string, mime = "text/markdown;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function safeName(s: string): string {
  return (s || "未命名").replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) || "未命名";
}

export function flashcardsToMd(title: string, cards: { front: string; back: string }[]): string {
  const body = cards.map((c, i) => `## ${i + 1}. ${c.front}\n\n${c.back}\n`).join("\n");
  return `# ${title}（閃卡，共 ${cards.length} 張）\n\n${body}`;
}

export function quizToMd(
  title: string,
  qs: { question: string; options: string[]; answer: number; explanation?: string }[],
): string {
  const letters = "ABCD";
  const body = qs
    .map((q, i) => {
      const opts = q.options.map((op, oi) => `- ${letters[oi]}. ${op}`).join("\n");
      const exp = q.explanation ? `\n\n解析：${q.explanation}` : "";
      return `## ${i + 1}. ${q.question}\n\n${opts}\n\n答案：${letters[q.answer]}${exp}\n`;
    })
    .join("\n");
  return `# ${title}（測驗，共 ${qs.length} 題）\n\n${body}`;
}

export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const rect = svg.getBoundingClientRect();
  const w = Math.max(800, Math.floor(rect.width) || 1200);
  const h = Math.max(600, Math.floor(rect.height) || 800);
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "100%");
  bg.setAttribute("height", "100%");
  bg.setAttribute("fill", "#ffffff");
  clone.insertBefore(bg, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
