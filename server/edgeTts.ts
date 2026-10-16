// Edge TTS 客戶端（自帶，不依賴外部包）。
// 背景：2026-10-10 起微軟把 Read Aloud 合成搬到 api.msedgeservices.com，
// 舊 speech.platform.bing.com 握手直接 403（rany2/edge-tts#490）。新端點要 v2 Sec-MS-GEC。
// 演算法移植自 readest（MIT）對 rany2/edge-tts#492 的引用實作，僅取 handshake 所需最小集。
import { WebSocket } from "ws";

const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_FULL = "143.0.3650.75";
const CHROMIUM_MAJOR = CHROMIUM_FULL.split(".")[0];
const NEW_URL = "wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1";
const LEGACY_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";

// ---- v2 Sec-MS-GEC ----

const GEC_PREFIX_WORDS = [
  0x79706f43, 0x68676972, 0x43282074, 0x694d2029, 0x736f7263, 0x2074666f, 0x70726f43,
  0x7461726f, 0x2e6e6f69, 0x6c6c4120, 0x67697220, 0x20737468, 0x65736572, 0x64657672,
  0x0000002e,
];
const GEC_PREFIX_LENGTH = 57;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function rol16(x: number): number {
  return ((x << 16) | (x >>> 16)) >>> 0;
}

function toWords(bytes: Uint8Array): number[] {
  const padded = new Uint8Array(Math.ceil(bytes.length / 8) * 8);
  padded.set(bytes);
  const view = new DataView(padded.buffer);
  return Array.from({ length: padded.length / 4 }, (_, i) => view.getUint32(i * 4, true));
}

function cs64WordSwap(words: number[], a: number, b: number): [number, number] {
  let acc = 0;
  let last = 0;
  for (let i = 0; i < words.length; i += 2) {
    const x = words[i] ?? 0;
    const y = words[i + 1] ?? 0;
    let t = rol16((Math.imul(rol16(x), 0xef0569fb) + Math.imul(x, a)) >>> 0);
    let q = Math.imul(t, 0x76f50f34) >>> 0;
    acc = (acc + Math.imul(rol16(q), 0xc3efea97) + q) >>> 0;
    t = rol16((Math.imul(rol16(y), 0xc31713db) + Math.imul(y, b)) >>> 0);
    q = Math.imul(t, 0x1881ce3c) >>> 0;
    last = (Math.imul(rol16(q), 0x35bd1ec9) + q) >>> 0;
    acc = (acc + last) >>> 0;
  }
  return [last, acc];
}

function cs64Reversible(words: number[], a: number, b: number): [number, number] {
  let state = 0;
  let acc = 0;
  for (let i = 0; i < words.length; i += 2) {
    state = Math.imul(state + (words[i] ?? 0), a) >>> 0;
    for (const c of [0xcf98b111, 0x87085b9f, 0x12ceb96d, 0x257e1d83]) {
      state = Math.imul(rol16(state), c) >>> 0;
    }
    let t = Math.imul((words[i + 1] ?? 0) + state, b) >>> 0;
    t = Math.imul(rol16(t), 0xa27416f5) >>> 0;
    t = rol16(Math.imul(rol16(t), 0xd38396ff) >>> 0);
    acc = (acc + state) >>> 0;
    state = Math.imul(rol16(Math.imul(t, 0x7c932b89) >>> 0), 0xbfa49f69) >>> 0;
    acc = (acc + state) >>> 0;
  }
  return [state, acc];
}

async function generateSecMsGec(now = Date.now()): Promise<string> {
  let ticks = Math.floor(now / 1000);
  ticks += 11644473600; // Windows file time epoch
  ticks -= ticks % 300; // 無條件捨去到 5 分鐘
  ticks *= 1000000000 / 100;
  const suffix = new TextEncoder().encode(`${ticks.toFixed(0)}${TOKEN}`);
  const data = new Uint8Array(GEC_PREFIX_LENGTH + suffix.length);
  const view = new DataView(data.buffer);
  GEC_PREFIX_WORDS.forEach((word, i) => view.setUint32(i * 4, word, true));
  data.set(suffix, GEC_PREFIX_LENGTH);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  const words = toWords(data);
  const [key0, key1] = toWords(digest);
  const a = ((key0 ?? 0) | 1) >>> 0;
  const b = ((key1 ?? 0) | 1) >>> 0;
  const [s0, s1] = cs64WordSwap(words, a, b);
  const [r0, r1] = cs64Reversible(words, a, b);
  const cs64 = new DataView(new ArrayBuffer(8));
  cs64.setUint32(0, s0 ^ r0, true);
  cs64.setUint32(4, s1 ^ r1, true);
  return `${toHex(new Uint8Array(cs64.buffer))}-${toHex(digest)}`;
}

function generateMuid(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return toHex(arr);
}

function uuid(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

// ---- 合成 ----

function extractAudio(raw: Buffer): Buffer | null {
  if (raw.length > 2) {
    const headerLen = new DataView(raw.buffer.slice(raw.byteOffset, raw.byteOffset + 2)).getInt16(0);
    if (headerLen >= 0 && raw.length > headerLen + 2) {
      return raw.subarray(2 + headerLen);
    }
  }
  // 舊端點格式保底：找 Path:audio 標記
  const sep = "Path:audio\r\n";
  const idx = raw.indexOf(sep);
  return idx >= 0 ? raw.subarray(idx + sep.length) : null;
}

function once(text: string, voice: string, url: string, params: URLSearchParams): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      fn();
    };
    const connectId = params.get("ConnectionId") ?? uuid();
    const date = new Date().toString();
    const headers = {
      "User-Agent":
        `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ` +
        `Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR}.0.0.0`,
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Accept-Language": "en-US,en;q=0.9",
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      Cookie: `muid=${generateMuid()};`,
    };
    const ws = new WebSocket(`${url}?${params.toString()}`, { headers });
    const parts: Buffer[] = [];
    ws.on("message", (raw: Buffer, isBinary: boolean) => {
      if (!isBinary) {
        const s = raw.toString("utf8");
        if (s.includes("turn.end")) finish(() => resolve(Buffer.concat(parts)));
        return;
      }
      const audio = extractAudio(raw as Buffer);
      if (audio && audio.length > 0) parts.push(audio);
    });
    ws.on("error", (e) => finish(() => reject(e)));
    ws.on("close", () => {
      if (!done) finish(() => reject(new Error("語音連線意外關閉（可能被限流，稍後重試）")));
    });
    ws.on("open", () => {
      const headerOf = (h: Record<string, string>) =>
        Object.entries(h).map(([k, v]) => `${k}: ${v}\r\n`).join("");
      const config =
        headerOf({ "Content-Type": "application/json; charset=utf-8", Path: "speech.config", "X-Timestamp": date }) +
        `\r\n${JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3",
              },
            },
          },
        })}`;
      ws.send(config, (err) => {
        if (err) {
          finish(() => reject(err));
          return;
        }
        const ssml =
          headerOf({
            "Content-Type": "application/ssml+xml",
            Path: "ssml",
            "X-RequestId": connectId,
            "X-Timestamp": `${date}Z`,
          }) +
          `\r\n<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
          `<voice name='${voice}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${text}</prosody></voice></speak>`;
        ws.send(ssml, (err2) => {
          if (err2) finish(() => reject(err2));
        });
      });
    });
  });
}

/** 單段合成：新端點優先，失敗降級舊端點（部分地區舊的還能用）。 */
export async function edgeTts(text: string, voice: string): Promise<Buffer> {
  const connectId = uuid();
  const gec = await generateSecMsGec();
  const fresh = new URLSearchParams({
    ConnectionId: connectId,
    "Ocp-Apim-Subscription-Key": TOKEN,
    "Sec-MS-GEC": gec,
    "Sec-MS-GEC-Version": `2-${CHROMIUM_FULL}`,
  });
  try {
    return await once(text, voice, NEW_URL, fresh);
  } catch (e) {
    const legacy = new URLSearchParams({ ConnectionId: connectId, TrustedClientToken: TOKEN });
    try {
      return await once(text, voice, LEGACY_URL, legacy);
    } catch {
      throw e; // 丟新端點的錯（比較有代表性）
    }
  }
}
