// 播客 TTS：Edge 線上語音（免 key，非官方接口，掛了就降級前端 speechSynthesis）。
// 客戶端是自帶的 server/edgeTts.ts（WS 協議直連），同一 encoder 設定的 MP3 可直接串接，不需 ffmpeg。
import { edgeTts } from "@/server/edgeTts";

export type VoicePairId = "cn" | "tw";

export const VOICE_PAIRS: Record<VoicePairId, { label: string; host: string; guest: string }> = {
  cn: { label: "大陸腔", host: "zh-CN-XiaoxiaoNeural", guest: "zh-CN-YunxiNeural" },
  tw: { label: "台灣腔", host: "zh-TW-HsiaoChenNeural", guest: "zh-TW-YunJheNeural" },
};

export type PodLine = { speaker: "A" | "B"; text: string };

/** 朗讀模式上限（約 12 分鐘，超了截斷） */
export const READ_CHAR_CAP = 3000;
/** 對話稿上限（約 8 分鐘） */
export const DIALOGUE_CHAR_CAP = 2000;

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 按句讀切段，每段不超過 max，避免單次 SSML 過長被拒 */
export function splitChunks(text: string, max = 450): string[] {
  const sens = text
    .replace(/\r/g, "")
    .split(/(?<=[。！？!?；;\n])/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const s of sens) {
    if ((cur + s).length > max && cur) {
      out.push(cur);
      cur = s;
    } else {
      cur += s;
    }
  }
  if (cur) out.push(cur);
  // 單句超長的硬切（罕見，保底）
  return out.flatMap((c) => (c.length > max * 2 ? c.match(new RegExp(`.{1,${max}}`, "g")) ?? [c] : [c]));
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}逾時（${ms / 1000} 秒）`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** 單段合成（重試 1 次）。失敗多半是 Edge 接口抽風，訊息寫明白讓前端顯示降級提示。 */
export async function synthesize(text: string, voice: string): Promise<Buffer> {
  const clean = escapeXml(text.trim()).slice(0, 600);
  if (!clean) return Buffer.alloc(0);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const buf = await withTimeout(edgeTts(clean, voice), 90000, "Edge 語音合成");
      if (!buf || buf.length === 0) throw new Error("回傳空音檔");
      return Buffer.from(buf);
    } catch (e) {
      if (attempt === 1) {
        throw new Error(
          `語音合成失敗（Edge 免費接口不穩，稍後重試，或改用頁面上的瀏覽器試聽）：${e instanceof Error ? e.message.slice(0, 120) : "未知錯誤"}`,
        );
      }
    }
  }
  throw new Error("語音合成失敗");
}

/** 整份稿子逐段合成後串接（同編碼 MP3 直接接）。 */
export async function synthesizeLines(lines: PodLine[], pair: VoicePairId): Promise<Buffer> {
  const voices = VOICE_PAIRS[pair] ?? VOICE_PAIRS.cn;
  const parts: Buffer[] = [];
  for (const line of lines) {
    const chunks = splitChunks(line.text);
    for (const c of chunks) {
      const buf = await synthesize(c, line.speaker === "A" ? voices.host : voices.guest);
      if (buf.length > 0) parts.push(buf);
    }
  }
  if (parts.length === 0) throw new Error("沒有合成出任何音檔");
  return Buffer.concat(parts);
}
