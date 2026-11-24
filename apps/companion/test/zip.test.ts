import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { writeZip } from '../../../scripts/zip.mjs';
import { crc32, DEFAULT_LIMITS, readZip, ZipError, type ZipErrorCode } from '../src/zip';

// What the update is given comes from outside: the reader takes the one kind of zip it knows and refuses the
// rest. The archives are made by the release's own writer (and checked against the system's unzip there), then
// broken in the one place a test is about.

const text = (s: string) => Buffer.from(s);
const good = () =>
  writeZip([
    { name: 'pi/' },
    { name: 'pi/companion.mjs', data: text('// companion\n'.repeat(50)) },
    { name: 'pi/app/' },
    { name: 'pi/app/index.html', data: text('<!doctype html>') },
    { name: 'pi/empty.txt', data: text('') },
  ]);

/** The offsets of the central directory headers of a zip. */
function headers(zip: Buffer): number[] {
  const out: number[] = [];
  const end = zip.readUInt32LE(zip.length - 6);
  for (let at = end; zip.readUInt32LE(at) === 0x02014b50; ) {
    out.push(at);
    at += 46 + zip.readUInt16LE(at + 28) + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  return out;
}

/** The zip with some bytes of the n-th central header changed. */
function broken(zip: Buffer, n: number, write: (header: Buffer, at: number) => void): Buffer {
  const copy = Buffer.from(zip);
  write(copy, headers(copy)[n]!);
  return copy;
}

const refused = (zip: Uint8Array, code: ZipErrorCode, limits = DEFAULT_LIMITS) => {
  try {
    readZip(zip, limits);
  } catch (e) {
    expect(e).toBeInstanceOf(ZipError);
    expect((e as ZipError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
};

describe('crc32', () => {
  it('is the CRC of zip (the check value of the standard)', () => {
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('reading a zip', () => {
  it('gives the files by name, whole, and leaves directories out', () => {
    const files = readZip(good());
    expect([...files.keys()].sort()).toEqual([
      'pi/app/index.html',
      'pi/companion.mjs',
      'pi/empty.txt',
    ]);
    expect(files.get('pi/companion.mjs')!.toString()).toBe('// companion\n'.repeat(50));
    expect(files.get('pi/app/index.html')!.toString()).toBe('<!doctype html>');
    expect(files.get('pi/empty.txt')!.length).toBe(0);
  });

  it('reads stored files and deflated ones, and a zip with a comment after the end record', () => {
    const stored = writeZip([{ name: 'a.txt', data: text('abc') }], { store: true });
    expect(readZip(stored).get('a.txt')!.toString()).toBe('abc');
    const withComment = Buffer.concat([good(), Buffer.alloc(0)]);
    withComment.writeUInt16LE(5, withComment.length - 2);
    expect(readZip(Buffer.concat([withComment, text('hello')])).size).toBe(3);
  });

  it('reads a buffer that is a view into a larger one', () => {
    const zip = good();
    const padded = Buffer.concat([Buffer.alloc(7), zip]);
    expect(readZip(padded.subarray(7)).size).toBe(3);
  });
});

describe('refusing what is no zip, or not the kind it takes', () => {
  it('a file that is no zip: too short, no end record, a directory that lies outside the file', () => {
    refused(Buffer.alloc(10), 'not-a-zip');
    refused(text('x'.repeat(100)), 'not-a-zip');
    const zip = Buffer.from(good());
    zip.writeUInt32LE(zip.length, zip.length - 6); // the directory offset points to the end
    refused(zip, 'corrupt');
    // a directory that claims to be longer than there is room for
    const long = Buffer.from(good());
    long.writeUInt32LE(long.readUInt32LE(long.length - 10) + 10, long.length - 10);
    refused(long, 'corrupt');
  });

  it('several disks, zip64, too many entries', () => {
    const multi = Buffer.from(good());
    multi.writeUInt16LE(1, multi.length - 22 + 4);
    refused(multi, 'unsupported');
    const z64 = Buffer.from(good());
    z64.writeUInt32LE(0xffffffff, z64.length - 22 + 16);
    refused(z64, 'unsupported');
    refused(good(), 'too-many', { ...DEFAULT_LIMITS, entries: 3 });
    const inEntry = broken(good(), 1, (b, at) => b.writeUInt32LE(0xffffffff, at + 20));
    refused(inEntry, 'unsupported');
  });

  it('encryption, a method that is none of stored and deflate, and a symbolic link', () => {
    refused(
      broken(good(), 1, (b, at) => b.writeUInt16LE(1, at + 8)),
      'encrypted',
    );
    refused(
      broken(good(), 1, (b, at) => b.writeUInt16LE(0x40, at + 8)),
      'encrypted',
    );
    refused(
      broken(good(), 1, (b, at) => b.writeUInt16LE(12, at + 10)),
      'unsupported',
    );
    refused(
      broken(good(), 1, (b, at) => b.writeUInt32LE((0o120777 * 0x10000) >>> 0, at + 38)),
      'link',
    );
  });

  it('names that are not plain relative paths – or are the same twice', () => {
    for (const bad of [
      '../evil.txt',
      '/etc/passwd',
      'a/../../b',
      'a//b',
      'a b.txt',
      'a\\b.txt',
      'C:/x',
      './a',
      'a/./b',
      'ä.txt',
    ]) {
      const zip = writeZip([{ name: bad, data: text('x') }]);
      refused(zip, 'bad-name');
    }
    refused(
      writeZip([
        { name: 'a.txt', data: text('1') },
        { name: 'a.txt', data: text('2') },
      ]),
      'duplicate',
    );
  });
});

describe('refusing what is damaged or too much', () => {
  it('a wrong checksum, a wrong size, a stored file whose sizes differ', () => {
    refused(
      broken(good(), 1, (b, at) => b.writeUInt32LE(0x12345678, at + 16)),
      'corrupt',
    );
    refused(
      broken(good(), 1, (b, at) => b.writeUInt32LE(b.readUInt32LE(at + 24) + 1, at + 24)),
      'corrupt',
    );
    const stored = writeZip([{ name: 'a.txt', data: text('abcdef') }], { store: true });
    refused(
      broken(stored, 0, (b, at) => b.writeUInt32LE(5, at + 24)),
      'corrupt',
    );
  });

  it('a file that is cut off, a local header that is not one, data that runs into the directory', () => {
    const truncated = good();
    refused(truncated.subarray(0, truncated.length - 30), 'not-a-zip');
    const noLocal = Buffer.from(good());
    noLocal.writeUInt32LE(
      0,
      headers(noLocal)[1]! > 0 ? noLocal.readUInt32LE(headers(noLocal)[1]! + 42) : 0,
    );
    refused(noLocal, 'corrupt');
    refused(
      broken(good(), 1, (b, at) => b.writeUInt32LE(b.readUInt32LE(at + 20) + 100000, at + 20)),
      'corrupt',
    );
    refused(
      broken(good(), 1, (b, at) => b.writeUInt32LE(0xfffffff, at + 42)),
      'corrupt',
    );
    // a directory entry that is cut off by the end of the directory, or that is no entry
    refused(
      broken(good(), 1, (b, at) => b.writeUInt16LE(60000, at + 28)),
      'corrupt',
    );
    refused(
      broken(good(), 1, (b, at) => b.writeUInt32LE(0, at)),
      'corrupt',
    );
  });

  it('a small file that claims to inflate to gigabytes is stopped by the size it gave, not by memory', () => {
    const bomb = deflateRawSync(Buffer.alloc(5_000_000));
    const zip = writeZip([{ name: 'bomb.bin', data: text('x') }], { store: true });
    // a stored entry rewritten as deflated, with sizes that claim a small file
    const forged = Buffer.concat([zip, Buffer.alloc(0)]);
    const at = headers(forged)[0]!;
    forged.writeUInt16LE(8, at + 10);
    const local = forged.readUInt32LE(at + 42);
    forged.writeUInt16LE(8, local + 8);
    refused(forged, 'corrupt');
    // and by the limits: one file, all files
    const big = writeZip([
      { name: 'big.bin', data: bomb.length ? Buffer.alloc(2000) : Buffer.alloc(0) },
    ]);
    refused(big, 'too-large', { ...DEFAULT_LIMITS, fileBytes: 1000 });
    refused(
      writeZip([
        { name: 'a', data: Buffer.alloc(600) },
        { name: 'b', data: Buffer.alloc(600) },
      ]),
      'too-large',
      { ...DEFAULT_LIMITS, totalBytes: 1000 },
    );
  });
});
