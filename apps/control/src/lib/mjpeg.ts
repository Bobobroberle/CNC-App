/**
 * An incremental reader for `multipart/x-mixed-replace` – the way a camera server (ustreamer, mjpg-streamer, an
 * ESP32-CAM) sends motion JPEG: one HTTP response that never ends, a part per picture,
 *
 *     --boundarydonotcross CRLF
 *     Content-Type: image/jpeg CRLF  Content-Length: 41210 CRLF  X-Timestamp: … CRLF  CRLF
 *     <the JPEG>  CRLF
 *     --boundarydonotcross CRLF  …
 *
 * `feed(chunk)` takes the bytes as they arrive (any size, a boundary may be cut anywhere) and gives back the parts
 * that are complete: the headers (names in lower case) and the body. Pure bytes, no DOM, no decoding.
 *
 * What it accepts: a boundary with or without a leading `--`; CRLF or LF; an optional preamble before the first
 * boundary (short – a few KiB); a part with a `Content-Length` (used – the part is given as soon as its bytes are
 * there, and what follows must be the boundary: anything else is a failure, not a guess) or without (the body ends at
 * the next line that starts with the boundary); a body of zero bytes; the closing `--boundary--`. What it will not do is grow without limit: a header block over
 * `MAX_HEADER_BYTES`, a body over `MAX_PART_BYTES` or more than a preamble's worth of garbage puts the parser into the
 * failed state (`failure` says why) and it gives nothing more. A part cut off by the end of the stream is never
 * returned (`finish()` says so).
 *
 * **The lifetime of `bytes`:** it is a view into the parser's own buffer and is valid **only until the next call of
 * `feed()`** (which compacts the buffer). Whoever keeps a part copies it (`bytes.slice()`) – and only then, so the pictures
 * that are thrown away (thinned, repeated) cost nothing but the pass over their bytes. The headers object is the
 * caller's to keep.
 */

/** A header block (boundary line excluded, blank line included) is at most this long, bytes */
export const MAX_HEADER_BYTES = 8 * 1024;
/** A body is at most this long, bytes (a 1080p JPEG is a few hundred kB) */
export const MAX_PART_BYTES = 8 * 1024 * 1024;
/** Garbage before the first boundary is at most this long, bytes */
export const MAX_PREAMBLE_BYTES = 8 * 1024;

export type MjpegFailure =
  /** No boundary within `maxPreambleBytes` of the start */
  | 'garbage'
  | 'header-too-large'
  | 'part-too-large'
  /** What follows a body (or a part) is not the boundary: a wrong `Content-Length`, or not a multipart stream */
  | 'bad-framing';

export type MjpegState = 'preamble' | 'delimiter' | 'headers' | 'body' | 'done' | 'failed';

/**
 * How the stream ended (`finish()`): `done` – the closing boundary came; `clean` – it stopped between two parts;
 * `truncated` – a part (or a boundary) was cut off and is lost; `failed` – the parser had given up before.
 */
export type MjpegEnd = 'done' | 'clean' | 'truncated' | 'failed';

export interface MjpegPart {
  /** Names in lower case, values trimmed; a name that comes twice keeps its last value */
  headers: Record<string, string>;
  /** The body – a view valid until the next `feed()` (see the top of the file) */
  bytes: Uint8Array;
}

export interface MjpegOptions {
  maxHeaderBytes?: number;
  maxPartBytes?: number;
  maxPreambleBytes?: number;
}

/** The boundary without its leading `--` (a header may carry it either way), or null where it is not usable. */
export function normalizeBoundary(boundary: string): string | null {
  const bare = boundary.startsWith('--') ? boundary.slice(2) : boundary;
  // printable ASCII only, no space at the ends: it goes into the search as bytes
  if (bare.length === 0 || bare.length > 200) return null;
  if (!/^[\x21-\x7e]([\x20-\x7e]*[\x21-\x7e])?$/.test(bare)) return null;
  return bare;
}

/** The boundary of a `multipart/*` Content-Type (quoted or not), or null where it is no multipart type or has none. */
export function boundaryOf(contentType: string | null | undefined): string | null {
  if (!contentType || !/^\s*multipart\/[\w.+-]+\s*(;|$)/i.test(contentType)) return null;
  const m = /;\s*boundary\s*=\s*(?:"([^"]*)"|([^\s;]+))/i.exec(contentType);
  if (!m) return null;
  return normalizeBoundary(m[1] ?? m[2] ?? '');
}

const LF = 0x0a;
const CR = 0x0d;
const DASH = 0x2d;
const SPACE = 0x20;
const TAB = 0x09;
/** Spaces or tabs allowed after a boundary before the line ends */
const MAX_PADDING = 64;
/** A header name: the characters of an HTTP token */
const NAME = /^[!#$%&'*+.^_`|~0-9a-z-]+$/;
const latin1 = new TextDecoder('latin1');

type Delimiter =
  | { kind: 'part'; next: number }
  | { kind: 'final' }
  | { kind: 'wait' }
  | { kind: 'no' };

export class MjpegParser {
  private readonly token: Uint8Array;
  private readonly maxHeader: number;
  private readonly maxPart: number;
  private readonly maxPreamble: number;
  private buf = new Uint8Array(64 * 1024);
  /** The unread bytes are `buf[start, end)` */
  private start = 0;
  private end = 0;
  /** Where the search goes on after the last look (≥ `start`): a body is never searched twice */
  private scan = 0;
  private phase: MjpegState = 'preamble';
  private ended: MjpegEnd | null = null;
  private reason: MjpegFailure | null = null;
  private headers: Record<string, string> = {};
  /** The declared length of the part being read, or null */
  private length: number | null = null;
  /** Whether the body of this part was already tested for starting with the boundary (an empty body) */
  private emptyChecked = false;

  constructor(boundary: string, options: MjpegOptions = {}) {
    const bare = normalizeBoundary(boundary);
    if (bare === null) throw new RangeError(`unusable multipart boundary: ${boundary}`);
    this.token = new Uint8Array(bare.length + 2);
    this.token[0] = DASH;
    this.token[1] = DASH;
    for (let i = 0; i < bare.length; i++) this.token[i + 2] = bare.charCodeAt(i);
    this.maxHeader = options.maxHeaderBytes ?? MAX_HEADER_BYTES;
    this.maxPart = options.maxPartBytes ?? MAX_PART_BYTES;
    this.maxPreamble = options.maxPreambleBytes ?? MAX_PREAMBLE_BYTES;
  }

  get state(): MjpegState {
    return this.phase;
  }

  /** Why the parser gave up (null while it did not) */
  get failure(): MjpegFailure | null {
    return this.reason;
  }

  /** Takes the next bytes of the stream; returns the parts that became complete with them (none after a failure). */
  feed(chunk: Uint8Array): MjpegPart[] {
    const parts: MjpegPart[] = [];
    if (this.phase === 'failed' || this.phase === 'done' || chunk.length === 0) return parts;
    this.reserve(chunk.length);
    this.buf.set(chunk, this.end);
    this.end += chunk.length;
    while (this.step(parts));
    return parts;
  }

  /**
   * The stream ended: whether it ended where a stream may – between two parts (nothing of the next one was read)
   * or after the closing boundary. Nothing more is parsed afterwards; asking again gives the same answer.
   */
  finish(): MjpegEnd {
    if (this.ended) return this.ended;
    const phase = this.phase;
    const between = this.start === this.end && phase !== 'body';
    this.ended =
      phase === 'failed' ? 'failed' : phase === 'done' ? 'done' : between ? 'clean' : 'truncated';
    if (phase !== 'failed') this.phase = 'done';
    return this.ended;
  }

  /** Makes room for `extra` more bytes: compacts what was consumed away, grows when that is not enough. */
  private reserve(extra: number) {
    if (this.end + extra <= this.buf.length) return;
    const live = this.end - this.start;
    if (this.start > 0) {
      this.buf.copyWithin(0, this.start, this.end);
      this.scan -= this.start;
      this.start = 0;
      this.end = live;
    }
    if (live + extra > this.buf.length) {
      const grown = new Uint8Array(Math.max(live + extra, this.buf.length * 2));
      grown.set(this.buf.subarray(0, live));
      this.buf = grown;
    }
  }

  /** Gives up for good; false, so a step can `return this.fail(…)` */
  private fail(reason: MjpegFailure): false {
    this.phase = 'failed';
    this.reason = reason;
    return false;
  }

  /** The bytes read so far, from the start of the buffer – one view per step, the native search runs on it */
  private live(): Uint8Array {
    return this.buf.subarray(0, this.end);
  }

  /** What the bytes from `i` on say about a boundary there: a part follows, the stream ends, more bytes are needed, or no */
  private delimiterAt(i: number): Delimiter {
    const { buf, token, end } = this;
    const have = end - i;
    const n = Math.min(have, token.length);
    for (let k = 0; k < n; k++) if (buf[i + k] !== token[k]) return { kind: 'no' };
    if (have < token.length) return { kind: 'wait' };
    let j = i + token.length;
    if (j >= end) return { kind: 'wait' };
    if (buf[j] === DASH) {
      if (j + 1 >= end) return { kind: 'wait' };
      return buf[j + 1] === DASH ? { kind: 'final' } : { kind: 'no' };
    }
    const padFrom = j;
    while (j < end && (buf[j] === SPACE || buf[j] === TAB)) {
      j++;
      if (j - padFrom > MAX_PADDING) return { kind: 'no' };
    }
    if (j >= end) return { kind: 'wait' };
    if (buf[j] === LF) return { kind: 'part', next: j + 1 };
    if (buf[j] === CR) {
      if (j + 1 >= end) return { kind: 'wait' };
      return buf[j + 1] === LF ? { kind: 'part', next: j + 2 } : { kind: 'no' };
    }
    return { kind: 'no' };
  }

  /** One move of the state machine; true while it may go on with the bytes it has. */
  private step(parts: MjpegPart[]): boolean {
    switch (this.phase) {
      case 'preamble':
        return this.stepPreamble();
      case 'delimiter':
        return this.stepDelimiter();
      case 'headers':
        return this.stepHeaders();
      case 'body':
        return this.stepBody(parts);
    }
    return false; // done, failed
  }

  /** Before the first boundary: anything up to a short preamble is skipped */
  private stepPreamble(): boolean {
    const live = this.live();
    let from = Math.max(this.scan, this.start);
    for (;;) {
      const i = live.indexOf(DASH, from);
      if (i < 0) {
        this.scan = this.end;
        break;
      }
      const d = this.delimiterAt(i);
      if (d.kind === 'part') {
        this.begin(d.next);
        return true;
      }
      if (d.kind === 'final') {
        this.phase = 'done';
        return false;
      }
      if (d.kind === 'wait') {
        this.scan = i;
        break;
      }
      from = i + 1;
    }
    if (this.scan - this.start > this.maxPreamble) return this.fail('garbage');
    return false;
  }

  /** Right after a body: an optional line break and then the boundary – nothing else */
  private stepDelimiter(): boolean {
    let i = this.start;
    if (i < this.end && this.buf[i] === CR) {
      if (i + 1 >= this.end) return false;
      if (this.buf[i + 1] !== LF) return this.fail('bad-framing');
      i += 2;
    } else if (i < this.end && this.buf[i] === LF) {
      i += 1;
    }
    if (i >= this.end) return false;
    const d = this.delimiterAt(i);
    if (d.kind === 'part') {
      this.begin(d.next);
      return true;
    }
    if (d.kind === 'final') {
      this.phase = 'done';
      return false;
    }
    return d.kind === 'no' ? this.fail('bad-framing') : false;
  }

  /** A boundary line was read: the headers of a part begin at `at` */
  private begin(at: number) {
    this.start = at;
    this.scan = at;
    this.phase = 'headers';
    this.length = null;
    this.emptyChecked = false;
  }

  private stepHeaders(): boolean {
    const { buf, start, end } = this;
    // the header block ends with a blank line – also right at its start (no headers at all)
    let headEnd = -1;
    let bodyAt = -1;
    if (start < end && buf[start] === LF) {
      headEnd = start;
      bodyAt = start + 1;
    } else if (start < end && buf[start] === CR) {
      if (start + 1 >= end) return false;
      if (buf[start + 1] === LF) {
        headEnd = start;
        bodyAt = start + 2;
      }
    }
    const live = this.live();
    let from = Math.max(this.scan, start);
    while (bodyAt < 0) {
      const i = live.indexOf(LF, from);
      if (i < 0) {
        this.scan = end;
        break;
      }
      if (i + 1 >= end) {
        this.scan = i;
        break;
      }
      if (buf[i + 1] === LF) {
        headEnd = i;
        bodyAt = i + 2;
      } else if (buf[i + 1] === CR) {
        if (i + 2 >= end) {
          this.scan = i;
          break;
        }
        if (buf[i + 2] === LF) {
          headEnd = i;
          bodyAt = i + 3;
        } else from = i + 1;
      } else from = i + 1;
    }
    if (bodyAt < 0) return end - start > this.maxHeader ? this.fail('header-too-large') : false;
    if (bodyAt - start > this.maxHeader) return this.fail('header-too-large');
    this.headers = parseHeaders(buf.subarray(start, headEnd));
    const declared = this.headers['content-length'];
    this.length = null;
    if (declared !== undefined && /^\d+$/.test(declared)) {
      const n = Number(declared);
      if (n > this.maxPart) return this.fail('part-too-large');
      this.length = n;
    }
    this.start = bodyAt;
    this.scan = bodyAt;
    this.phase = 'body';
    return true;
  }

  private stepBody(parts: MjpegPart[]): boolean {
    const { buf, start, end } = this;
    if (this.length !== null) {
      if (end - start < this.length) return false;
      parts.push({ headers: this.headers, bytes: buf.subarray(start, start + this.length) });
      this.start = start + this.length;
      this.phase = 'delimiter';
      return true;
    }
    // no length: the body ends where a line starts with the boundary – an empty body may have it at its very start
    if (!this.emptyChecked) {
      const d = this.delimiterAt(start);
      if (d.kind === 'wait') return false;
      this.emptyChecked = true;
      if (d.kind === 'part' || d.kind === 'final') {
        parts.push({ headers: this.headers, bytes: buf.subarray(start, start) });
        this.phase = 'delimiter';
        return true;
      }
    }
    const live = this.live();
    let from = Math.max(this.scan, start);
    for (;;) {
      const i = live.indexOf(LF, from);
      if (i < 0) {
        this.scan = end;
        break;
      }
      const d = this.delimiterAt(i + 1);
      if (d.kind === 'part' || d.kind === 'final') {
        const bodyEnd = i > start && buf[i - 1] === CR ? i - 1 : i;
        if (bodyEnd - start > this.maxPart) return this.fail('part-too-large');
        parts.push({ headers: this.headers, bytes: buf.subarray(start, bodyEnd) });
        this.start = i + 1;
        this.phase = 'delimiter';
        return true;
      }
      if (d.kind === 'wait') {
        this.scan = i;
        break;
      }
      from = i + 1;
    }
    if (this.scan - start > this.maxPart + 2) return this.fail('part-too-large');
    return false;
  }
}

/** The header lines of a part into an object with lower-case names; a line that is no `name: value` is skipped. */
function parseHeaders(block: Uint8Array): Record<string, string> {
  const headers: Record<string, string> = Object.create(null);
  for (const raw of latin1.decode(block).split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    if (NAME.test(name)) headers[name] = line.slice(colon + 1).trim();
  }
  return headers;
}
