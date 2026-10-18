// 極簡 zip 寫入器：零依賴（Node 內建 zlib），給備份下載用。
//
// 為什麼不裝 jszip/archiver：這個專案的哲學是「自架單人版、能不裝就不裝」，
// 而備份只需要「把幾個檔案夾進一個 zip」這一個動作，59 行的 STORE 模式就夠了
// （SQLite db 與 mp3 本來就壓不動，DEFLATE 只是浪費 CPU）。
//
// 介面只有一個：zipFiles([{ name, data }]) → Buffer。
// 格式參考 PKWARE APPNOTE：local file header + central directory + EOCD。
// 檔名只支援 ASCII（備份檔名我們自己控制）；Data Descriptor 不使用（長度先寫死）。

import zlib from "zlib";

export type ZipEntry = { name: string; data: Buffer | Uint8Array; mtime?: Date };

/** DOS 時間：秒只有 5 bit（2 秒粒度），年從 1980 起算。 */
function dosTime(d: Date): { date: number; time: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
  };
}

/** little-endian 寫入輔助。 */
function u16(v: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(v & 0xffff, 0);
  return b;
}
function u32(v: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v >>> 0, 0);
  return b;
}

/**
 * 把檔案清單打包成 zip（全部 STORE，不壓縮）。
 * 檔名含非 ASCII 字元會拋錯——呼叫端（備份）自己控制檔名。
 */
export function zipFiles(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    if (!/^[\x20-\x7e]+$/.test(e.name)) {
      throw new Error(`zip 檔名只支援 ASCII：${JSON.stringify(e.name)}`);
    }
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data);
    const nameBuf = Buffer.from(e.name, "ascii");
    const { date, time } = dosTime(e.mtime ?? new Date());
    const crc = zlib.crc32(data) >>> 0;

    // local file header
    localParts.push(
      Buffer.concat([
        u32(0x04034b50), // signature
        u16(20), // version needed (2.0)
        u16(0), // flags: no data descriptor
        u16(0), // method: STORE
        u16(time),
        u16(date),
        u32(crc),
        u32(data.length), // compressed size
        u32(data.length), // uncompressed size
        u16(nameBuf.length),
        u16(0), // extra length
        nameBuf,
        data,
      ]),
    );

    // central directory record
    centralParts.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20), // version made by
        u16(20), // version needed
        u16(0), // flags
        u16(0), // method
        u16(time),
        u16(date),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBuf.length),
        u16(0), // extra
        u16(0), // comment
        u16(0), // disk number
        u16(0), // internal attrs
        u32(0), // external attrs
        u32(offset), // relative local header offset
        nameBuf,
      ]),
    );

    offset += 30 + nameBuf.length + data.length;
  }

  const central = Buffer.concat(centralParts);
  return Buffer.concat([
    Buffer.concat(localParts),
    central,
    // EOCD
    Buffer.concat([
      u32(0x06054b50),
      u16(0), // this disk
      u16(0), // disk with central dir
      u16(entries.length),
      u16(entries.length),
      u32(central.length),
      u32(offset), // central dir offset
      u16(0), // comment length
    ]),
  ]);
}
