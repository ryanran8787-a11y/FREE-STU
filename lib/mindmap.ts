// 心智圖 Markdown 樹操作：純函數，前後端共用。

export type MdNode = { level: number; title: string; line: number };

export function parseHeadings(md: string): MdNode[] {
  const out: MdNode[] = [];
  md.split("\n").forEach((line, i) => {
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) out.push({ level: m[1].length, title: m[2].trim(), line: i });
  });
  return out;
}

/** 子樹行範圍：從該標題行到下一個同級或更高級標題之前 */
function subtreeRange(lines: string[], nodes: MdNode[], index: number): [number, number] {
  const node = nodes[index];
  let end = lines.length;
  for (let i = index + 1; i < nodes.length; i++) {
    if (nodes[i].level <= node.level) {
      end = nodes[i].line;
      break;
    }
  }
  return [node.line, end];
}

function findNode(md: string, title: string): { lines: string[]; nodes: MdNode[]; index: number } | null {
  const lines = md.split("\n");
  const nodes = parseHeadings(md);
  const index = nodes.findIndex((n) => n.title === title);
  if (index === -1) return null;
  return { lines, nodes, index };
}

export function renameNodeInMd(md: string, oldTitle: string, newTitle: string): string | null {
  const found = findNode(md, oldTitle);
  if (!found || !newTitle.trim()) return null;
  const { lines, nodes, index } = found;
  const line = lines[nodes[index].line];
  const m = line.match(/^(#{1,6}\s+)(.*)$/);
  if (!m) return null;
  lines[nodes[index].line] = `${m[1]}${newTitle.trim()}`;
  return lines.join("\n");
}

export function deleteNodeFromMd(md: string, title: string): string | null {
  const found = findNode(md, title);
  if (!found) return null;
  const { lines, nodes, index } = found;
  if (nodes[index].level <= 1) return null; // 不刪根
  const [start, end] = subtreeRange(lines, nodes, index);
  lines.splice(start, end - start);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
