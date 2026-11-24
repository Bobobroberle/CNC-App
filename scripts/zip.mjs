// A small zip writer for the release (`pnpm bundle`): the files of release/pi in one archive the operator
// can take to the PC and – with the in-app update – hand to the Pi. Deterministic: the same files and time
// give the same bytes (and so the same checksum). Read back strictly by apps/companion/src/zip.ts.
import * as zlib from 'node:zlib';

let table = null;
/** CRC-32 of zip; `zlib.crc32` where Node has it, a table where it does not (Node < 22.2). */
function crc32(data) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(data) >>> 0;
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date and time of a Date (zip has no time zone: the local clock of the maker, here UTC). */
function dosTime(date) {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

/**
 * @param {{ name: string, data?: Uint8Array, mode?: number }[]} entries a name ending in "/" is a directory
 * @param {{ at?: Date, store?: boolean }} [options]
 * @returns {Buffer}
 */
export function writeZip(entries, options = {}) {
  const { time, date } = dosTime(options.at ?? new Date(Date.UTC(2026, 0, 1)));
  const parts = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const directory = entry.name.endsWith('/');
    const data = directory ? Buffer.alloc(0) : Buffer.from(entry.data ?? []);
    const deflated =
      directory || options.store || data.length === 0 ? null : zlib.deflateRawSync(data);
    // A file that does not get smaller is stored
    const packed = deflated && deflated.length < data.length ? deflated : data;
    const method = packed === data ? 0 : 8;
    const crc = directory ? 0 : crc32(data);
    const mode = entry.mode ?? (directory ? 0o755 : 0o644);
    const external = ((directory ? 0o040000 : 0o100000) | mode) * 0x10000 + (directory ? 0x10 : 0);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // names are UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, packed);

    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(0x031e, 4); // made by unix, 3.0
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(0x0800, 8);
    head.writeUInt16LE(method, 10);
    head.writeUInt16LE(time, 12);
    head.writeUInt16LE(date, 14);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(packed.length, 20);
    head.writeUInt32LE(data.length, 24);
    head.writeUInt16LE(name.length, 28);
    head.writeUInt32LE(external >>> 0, 38);
    head.writeUInt32LE(offset, 42);
    central.push(head, name);
    offset += local.length + name.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}
