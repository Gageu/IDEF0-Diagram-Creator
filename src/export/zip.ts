/**
 * A minimal ZIP writer: files are stored without compression, which is all a
 * handful of text files needs and keeps the tool free of a dependency. The
 * output follows the PKWARE format closely enough for every common unzipper.
 */
export interface ZipEntry {
  readonly name: string;
  readonly content: string;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A fixed timestamp (1980-01-01, the earliest ZIP allows) keeps the archive identical for identical input. */
const DOS_TIME = 0;
const DOS_DATE = 0x21;
/** Bit 11: file names are UTF-8. */
const UTF8_FLAG = 0x0800;

function header(signature: number, fields: readonly (readonly [size: 2 | 4, value: number])[]): Uint8Array {
  const bytes = new Uint8Array(4 + fields.reduce((sum, [size]) => sum + size, 0));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, signature, true);
  let offset = 4;
  for (const [size, value] of fields) {
    if (size === 2) view.setUint16(offset, value, true);
    else view.setUint32(offset, value, true);
    offset += size;
  }
  return bytes;
}

export function zipFiles(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.content);
    const shared: (readonly [2 | 4, number])[] = [
      [2, 20], // version needed
      [2, UTF8_FLAG],
      [2, 0], // stored
      [2, DOS_TIME],
      [2, DOS_DATE],
      [4, crc32(data)],
      [4, data.length],
      [4, data.length],
      [2, name.length],
      [2, 0], // extra field length
    ];
    const localHeader = header(0x04034b50, shared);
    local.push(localHeader, name, data);
    // Central entry: version made by, the shared fields, then comment length, disk, attributes and the local header's offset.
    central.push(header(0x02014b50, [[2, 20], ...shared, [2, 0], [2, 0], [2, 0], [4, 0], [4, offset]]), name);
    offset += localHeader.length + name.length + data.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = header(0x06054b50, [[2, 0], [2, 0], [2, entries.length], [2, entries.length], [4, centralSize], [4, offset], [2, 0]]);
  const parts = [...local, ...central, end];
  const zip = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    zip.set(part, at);
    at += part.length;
  }
  return zip;
}
