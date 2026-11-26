/** Synthetic motion-JPEG streams for the tests of the parser and of the stamped stream. */

const enc = new TextEncoder();

export function bytesOf(text: string): Uint8Array {
  return enc.encode(text);
}

export function concat(...arrays: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of arrays) {
    out.set(a, at);
    at += a.length;
  }
  return out;
}

/** A small deterministic random generator (mulberry32) */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Something that looks like a JPEG to a parser that must not be fooled by it: begins FF D8, ends FF D9, and in between
 * bytes that are full of line breaks, dashes and pieces of the boundary.
 */
export function jpegLike(seed: number, size: number, boundary = 'boundarydonotcross'): Uint8Array {
  const rand = rng(seed);
  const out = new Uint8Array(Math.max(size, 4));
  const decoys = [
    bytesOf('\r\n--'),
    bytesOf(`\n--${boundary.slice(0, 7)}`),
    bytesOf(`\r\n--${boundary.slice(0, -1)}`),
    bytesOf('--'),
    bytesOf('\r\n\r\n'),
    bytesOf('\n'),
  ];
  for (let i = 0; i < out.length; i++) out[i] = Math.floor(rand() * 256);
  for (let i = 2; i < out.length - 2; i += 1 + Math.floor(rand() * 60)) {
    const d = decoys[Math.floor(rand() * decoys.length)]!;
    if (i + d.length < out.length - 2) out.set(d, i);
  }
  out[0] = 0xff;
  out[1] = 0xd8;
  out[out.length - 2] = 0xff;
  out[out.length - 1] = 0xd9;
  return out;
}

export interface FixturePart {
  headers?: Record<string, string>;
  body: Uint8Array;
}

export interface StreamOptions {
  boundary?: string;
  eol?: '\r\n' | '\n';
  /** Send a Content-Length (ustreamer does) */
  length?: boolean;
  preamble?: string;
  /**
   * What follows the last part: `open` – the boundary line of the next part, as ustreamer writes it (the last part is
   * complete); `closing` – the closing `--boundary--`; `none` – nothing (the last part has no end)
   */
  trailing?: 'open' | 'closing' | 'none';
  /** Bytes after the boundary on its line (transport padding) */
  padding?: string;
}

/** The bytes of a stream the way ustreamer sends it: `--b CRLF headers CRLF body CRLF --b CRLF …` */
export function stream(parts: FixturePart[], options: StreamOptions = {}): Uint8Array {
  const boundary = options.boundary ?? 'boundarydonotcross';
  const eol = options.eol ?? '\r\n';
  const pad = options.padding ?? '';
  const chunks: Uint8Array[] = [bytesOf(options.preamble ?? '')];
  parts.forEach((part, i) => {
    chunks.push(bytesOf(`--${boundary}${pad}${eol}`));
    const headers = { 'Content-Type': 'image/jpeg', ...part.headers };
    let head = '';
    for (const [k, v] of Object.entries(headers)) head += `${k}: ${v}${eol}`;
    if (options.length) head += `Content-Length: ${part.body.length}${eol}`;
    chunks.push(bytesOf(head + eol), part.body);
    const last = i === parts.length - 1;
    if (!last || options.trailing !== 'none') chunks.push(bytesOf(eol));
  });
  const trailing = options.trailing ?? 'open';
  if (trailing === 'open') chunks.push(bytesOf(`--${boundary}${eol}`));
  if (trailing === 'closing') chunks.push(bytesOf(`--${boundary}--${eol}`));
  return concat(...chunks);
}

/** Cuts `data` into pieces of the given sizes (the last piece takes the rest) */
export function chunked(data: Uint8Array, sizes: Iterable<number>): Uint8Array[] {
  const out: Uint8Array[] = [];
  let at = 0;
  for (const size of sizes) {
    if (at >= data.length) break;
    out.push(data.slice(at, at + size));
    at += size;
  }
  if (at < data.length) out.push(data.slice(at));
  return out;
}

/** An endless sequence of random piece sizes between 1 and `max` */
export function* randomSizes(rand: () => number, max: number): Generator<number> {
  for (;;) yield 1 + Math.floor(rand() * max);
}

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
