import { db } from "@/lib/db";

/**
 * 全域系統提示詞（設定頁寫入，影響所有新生成與對話，不追溯舊的）。
 * 由使用者自訂模板/原文（custom template/raw）不吃這個——那裡使用者的 prompt 最大。
 */
export async function globalStyle(): Promise<string> {
  try {
    const row = await db.userKey.findUnique({ where: { id: "default" } });
    return row?.systemPrompt?.trim() ?? "";
  } catch {
    return "";
  }
}

/** 把風格拼進 prompt 尾巴。structured=true 時加防呆：風格不能破壞輸出格式。 */
export function withStyle(base: string, style: string, structured: boolean): string {
  if (!style) return base;
  const guard = structured ? "（風格只管口吻與用詞，上面的輸出格式必須原樣遵守）" : "";
  return `${base}\n風格要求：${style.slice(0, 2000)}${guard}`;
}
