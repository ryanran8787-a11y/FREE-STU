// 極簡 zip 解開器：只讀 STORE（method 0），跟 backup/zip.ts 的寫入器對稱，零依賴。
//
// 為什麼自己寫：備份 zip 是我們自己用 zipFiles() 產的（全部 STORE），還原只需要解開
// 這一種格式；自己解析 local file header 約 60 行，不用裝 jszip/adm-zip。
// 其他工具壓的 DEFLATE 備份會明確報錯，不靜默產生壞資料。

import zlib from "zlib";

export type UnzippedEntry = { name: string; data: Buffer };

const LOCAL_SIG = 0x04034b50;

/** 解開 STORE-only zip，逐 local header 掃描；central directory 略過不讀。 */
export function unzipStore(buf: Buffer): UnzippedEntry[] {
  const entries: UnzippedEntry[] = [];
  let off = 0;
  while (off + 30 <= buf.length) {
    const sig = buf.readUInt32LE(off); // 0-3 sig；4-5 ver；flags 6-7，method 8-9
    if (sig !== LOCAL_SIG) break; // 進 central directory / EOCD，結束
    const flags = buf.readUInt16LE(off + 6);
    const method = buf.readUInt16LE(off + 8);
    if (flags & 0x1) throw new Error("不支援加密的 zip 備份");
    if (flags & 0x8) throw new Error("不支援 Data Descriptor 格式的 zip（請用本站下載的備份）");
    if (method !== 0) {
      throw new Error("只支援本站備份的 STORE 格式（method 0），這個 zip 有壓縮條目");
    }
    const crc = buf.readUInt32LE(off + 14);
    const compSize = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const nameStart = off + 30;
    const nameEnd = nameStart + nameLen;
    const dataStart = nameEnd + extraLen;
    if (nameLen === 0 || nameLen > 512) throw new Error("zip 檔名長度異常");
    if (dataStart + compSize > buf.length) throw new Error("zip 檔案截斷或損壞");
    const name = buf.subarray(nameStart, nameEnd).toString("ascii");
    if (!/^[\x20-\x7e]+$/.test(name)) throw new Error(`zip 檔名只支援 ASCII：${JSON.stringify(name)}`);
    const data = Buffer.from(buf.subarray(dataStart, dataStart + compSize));
    if ((zlib.crc32(data) >>> 0) !== crc) throw new Error(`zip 內容校驗失敗：${name}`);
    entries.push({ name, data });
    off = dataStart + compSize;
  }
  if (entries.length === 0) throw new Error("zip 內沒有可用檔案");
  return entries;
}
