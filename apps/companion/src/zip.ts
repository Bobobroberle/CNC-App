import { inflateRawSync } from 'node:zlib';

/**
 * A reader for the one kind of zip file the update takes in: what it is given comes from outside, so it is
 * read strictly. Nothing is trusted that the format lets a file claim: sizes are bounded before anything is
 * inflated, every file is checked against its CRC, names are limited to plain relative paths, and anything
 * the update has no use for (zip64, encryption, symbolic links, a second disk, duplicate names) is refused.
 * It returns the bytes of each file by name – it never writes anything.
 */

export type ZipErrorCode =
  | 'not-a-zip'
  | 'unsupported'
  | 'too-large'
  | 'too-many'
  | 'bad-name'
  | 'duplicate'
  | 'corrupt'
  | 'encrypted'
  | 'link';

export class ZipError extends Error {
  constructor(
    readonly code: ZipErrorCode,
    detail: string,
  ) {
    super(`${code}: ${detail}`);
  }
}

export interface ZipLimits {
  /** Files in the archive */
  entries: number;
  /** Bytes of one file, uncompressed */
  fileBytes: number;
  /** Bytes of all files, uncompressed */
  totalBytes: number;
}

export const DEFAULT_LIMITS: ZipLimits = {
  entries: 200,
  fileBytes: 32 * 1024 * 1024,
  totalBytes: 64 * 1024 * 1024,
};

let table: Uint32Array | null = null;

/** CRC-32 (the one of zip): a table here rather than `zlib.crc32`, which older Node versions lack. */
export function crc32(data: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** A name the update can use as a key: relative, plain characters, no `.` or `..` parts, no empty parts. */
const PLAIN_NAME = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*\/?$/;

function validName(name: string): boolean {
  if (!PLAIN_NAME.test(name)) return false;
  return name
    .replace(/\/$/, '')
    .split('/')
    .every((part) => part !== '.' && part !== '..');
}

/** The files of a zip, by name (directories are left out). */
export function readZip(
  buffer: Uint8Array,
  limits: ZipLimits = DEFAULT_LIMITS,
): Map<string, Buffer> {
  const buf = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (buf.length < 22) throw new ZipError('not-a-zip', 'too short');
  // The end-of-central-directory record: at the end, before a comment of at most 65535 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('not-a-zip', 'no end record');
  const disk = buf.readUInt16LE(eocd + 4);
  const dirDisk = buf.readUInt16LE(eocd + 6);
  const onDisk = buf.readUInt16LE(eocd + 8);
  const count = buf.readUInt16LE(eocd + 10);
  const dirSize = buf.readUInt32LE(eocd + 12);
  const dirOffset = buf.readUInt32LE(eocd + 16);
  if (disk !== 0 || dirDisk !== 0 || onDisk !== count) {
    throw new ZipError('unsupported', 'a zip of several disks');
  }
  if (count === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) {
    throw new ZipError('unsupported', 'zip64');
  }
  if (count > limits.entries) throw new ZipError('too-many', `${count} entries`);
  if (dirOffset + dirSize > eocd)
    throw new ZipError('corrupt', 'the directory is outside the file');

  const files = new Map<string, Buffer>();
  let total = 0;
  let at = dirOffset;
  for (let n = 0; n < count; n++) {
    if (at + 46 > eocd || buf.readUInt32LE(at) !== CENTRAL) {
      throw new ZipError('corrupt', `directory entry ${n}`);
    }
    const flags = buf.readUInt16LE(at + 8);
    const method = buf.readUInt16LE(at + 10);
    const crc = buf.readUInt32LE(at + 16);
    const csize = buf.readUInt32LE(at + 20);
    const usize = buf.readUInt32LE(at + 24);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const external = buf.readUInt32LE(at + 38);
    const localAt = buf.readUInt32LE(at + 42);
    const end = at + 46 + nameLen + extraLen + commentLen;
    if (end > eocd) throw new ZipError('corrupt', `directory entry ${n} is cut off`);
    const name = buf.toString('latin1', at + 46, at + 46 + nameLen);
    at = end;

    if (flags & 1 || flags & 0x40) throw new ZipError('encrypted', name);
    if (csize === 0xffffffff || usize === 0xffffffff || localAt === 0xffffffff) {
      throw new ZipError('unsupported', `zip64 in ${name}`);
    }
    if (!validName(name)) throw new ZipError('bad-name', JSON.stringify(name).slice(0, 80));
    // The unix mode lives in the upper half of the external attributes: a link is mode 0120000
    if (((external >>> 16) & 0o170000) === 0o120000) throw new ZipError('link', name);
    if (name.endsWith('/')) continue;
    if (files.has(name)) throw new ZipError('duplicate', name);
    if (method !== 0 && method !== 8)
      throw new ZipError('unsupported', `method ${method} in ${name}`);
    if (usize > limits.fileBytes) throw new ZipError('too-large', name);
    total += usize;
    if (total > limits.totalBytes) throw new ZipError('too-large', 'all files together');

    // The local header says where the data starts (its name and extra field may differ in length).
    if (localAt + 30 > dirOffset || buf.readUInt32LE(localAt) !== LOCAL) {
      throw new ZipError('corrupt', `local header of ${name}`);
    }
    const dataAt = localAt + 30 + buf.readUInt16LE(localAt + 26) + buf.readUInt16LE(localAt + 28);
    if (dataAt + csize > dirOffset) throw new ZipError('corrupt', `data of ${name} is cut off`);
    const raw = buf.subarray(dataAt, dataAt + csize);
    let data: Buffer;
    if (method === 0) {
      if (csize !== usize) throw new ZipError('corrupt', `size of ${name}`);
      data = Buffer.from(raw);
    } else {
      try {
        // The bound on the output stops a small file that claims to inflate to gigabytes
        data = inflateRawSync(raw, { maxOutputLength: Math.max(1, usize) });
      } catch {
        throw new ZipError('corrupt', `${name} does not inflate to its size`);
      }
      if (data.length !== usize) throw new ZipError('corrupt', `size of ${name}`);
    }
    if (crc32(data) !== crc) throw new ZipError('corrupt', `checksum of ${name}`);
    files.set(name, data);
  }
  return files;
}
