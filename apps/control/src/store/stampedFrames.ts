import {
  isOnline,
  stampOf,
  type Drawable,
  type FrameSource,
  type FrameStamp,
  type SourceFrame,
  type StampDomain,
} from '../lib/frameStamp';
import { boundaryOf, MjpegParser, type MjpegOptions } from '../lib/mjpeg';

export type { Drawable, FrameSource, FrameStamp, SourceFrame } from '../lib/frameStamp';

/**
 * The camera server's own stream, read by the page itself so that every picture comes with the stamp the Pi put on it
 * (`lib/frameStamp.ts` says which header that is and what is known of its clock). This is a second connection to the
 * server next to the `<img>` that shows the picture: a camera that serves a single client (an ESP32-CAM) does not
 * answer it – which is found out at the opening, by a deadline, and the scan then goes the way it always went.
 *
 * While the stream runs **only bytes and stamps are copied**: the parts come from `lib/mjpeg.ts` as views, a repeat of
 * a picture is told by its stamp (by its bytes in the wall clock, where the stamp is the time of sending and so is new
 * every time), the pictures closer to the one kept before than `minSpacingS` are not kept, and only a picture that is
 * kept is copied – into a ring bounded by count and by bytes. Nothing is decoded, no canvas is touched; `decode` makes
 * pixels of one picture on request, which the scan does after the run, a picture at a time.
 */

/**
 * Most pictures kept – a ring, the oldest go first. At the default spacing (20 pictures a second) a run of 400 mm at 50 mm/s
 * would be 160, the slowest ("Sanft", 40 % of that speed) 400, more than the ring holds; the scan therefore sets the
 * spacing from what it needs (`setMinSpacing`: a picture every 30 % of the field of view, whatever the speed – about
 * 400 / (0.3 × field) pictures for a run of 400 mm, 21 for a field of 64 mm), and the ring is only a bound.
 * **Nothing refuses a run for `evicted`**: if pictures were pushed out (a run that overflows the ring, or a long wait at rest
 * after the run with the spacing back at 0.05 s and big pictures), the start of the run is the part missing from the
 * ring – by the solver's design it places what the chain from the end anchor reaches and the refill by stops covers the rest
 * (untested: the simulator never overflows). The count
 * goes into the recording's `stamped-pictures` note, so a file shows it.
 */
export const MAX_FRAMES = 300;
/** Most bytes kept (a 720p JPEG of a camera is 50–150 kB, a 1080p one a few hundred) */
export const MAX_BYTES = 64 * 1024 * 1024;
/**
 * Pictures closer than this to the one kept before (by their stamps), s, are left out: the solver takes a picture about
 * every 30 % of the field of view – at the dearest a picture every 0.2 s – and wants a few to choose from, not 30 a second.
 */
export const MIN_FRAME_SPACING_S = 0.05;
/** How long the server may take to answer, ms – a camera that serves one client leaves a second one waiting */
export const RESPONSE_TIMEOUT_MS = 5000;
/** How long after the answer the first usable picture may take, ms */
export const FIRST_STAMP_TIMEOUT_MS = 4000;
/** Pictures with a stamp that must have come for the stream to count as open */
export const PROBE_FRAMES = 1;
/** Parts without a usable stamp (or empty, or placeholders) after which the stream counts as one that has none */
export const PROBE_PARTS = 5;

/**
 * A stamp has a millisecond; a double holding 1.78e9 s (the wall clock) has a quarter of a microsecond. The spacing is
 * compared with this much give, so that two stamps 50 ms apart are 50 ms apart.
 */
const EPSILON_S = 1e-6;

/** Why a stream is not available – stable codes, the panel words them */
export type StampedFailure =
  /** This browser has no `fetch` */
  | 'no-fetch'
  /** The request failed: the server is not there, or the browser refuses to let the page read it (CORS) – it does not say which */
  | 'unreachable'
  /** No answer within `RESPONSE_TIMEOUT_MS` */
  | 'no-response'
  /** The server answered with an error status (`detail`) */
  | 'http-status'
  /** The answer has no body that can be read piece by piece (some Safari versions) */
  | 'no-body-stream'
  /** The answer is no `multipart` type with a usable boundary (`detail`: the Content-Type) */
  | 'not-multipart'
  /** The stream is not what the parser takes it for (`detail`: its failure code) */
  | 'bad-stream'
  /** Nothing at all came within `FIRST_STAMP_TIMEOUT_MS` */
  | 'silent'
  /** Only placeholder pictures came (the camera is away) */
  | 'offline'
  /** Pictures came, none with a stamp that can be read (`X-Timestamp` or a grab time) */
  | 'no-stamp'
  /** The server closed the stream */
  | 'ended'
  /** Reading failed (`detail`) */
  | 'read-failed'
  /** `close()` was called */
  | 'closed';

/** A picture as it came: its stamp, when the page got it, its bytes (a copy of its own) and its number */
export interface StampedFrame extends SourceFrame {
  bytes: Uint8Array;
  /** 1, 2, 3 … in the order they were kept (not reset by `clear()`) */
  index: number;
}

/** What the stream did with the parts it got, for the recording and for finding out why there are few pictures */
export interface StampedStats {
  /** Parts read, whatever became of them */
  parts: number;
  kept: number;
  /** The same picture again (ustreamer sends the last one when no new one came for a second) */
  repeats: number;
  /** Left out for being closer to the picture kept before than the spacing */
  thinned: number;
  /** Placeholder pictures (`X-UStreamer-Online: false`) */
  offline: number;
  /** Parts with no usable stamp */
  unstamped: number;
  /** Parts without a body */
  empty: number;
  /** Parts stamped from another header than the first picture's: never mixed in */
  mixed: number;
  /** A single picture bigger than the ring may hold */
  oversize: number;
  /** Kept pictures pushed out of the ring by newer ones since the stream began (a run that lost its start shows in the recording) */
  evicted: number;
  heldFrames: number;
  heldBytes: number;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface StampedOptions {
  /** The way to fetch (the tests' own) – the browser's `fetch` where not given */
  fetch?: FetchLike;
  /** The page's clock, ms – `performance.now()` where not given */
  now?: () => number;
  /** Pixels of a JPEG – `createImageBitmap` where not given */
  createBitmap?: (blob: Blob) => Promise<ImageBitmap>;
  maxFrames?: number;
  maxBytes?: number;
  minSpacingS?: number;
  responseTimeoutMs?: number;
  firstStampTimeoutMs?: number;
  probeFrames?: number;
  /** Limits of the parser */
  parser?: MjpegOptions;
  /** Called with the stream before it is opened: whoever opened it can close it while the server has not answered yet */
  onCreate?: (stream: StampedStream) => void;
}

/**
 * The stream URL with `extra_headers=1` (what makes ustreamer put its grab time into every part): an existing query stays
 * as it is, an `extra_headers` already there is replaced, a fragment stays last.
 */
export function withExtraHeaders(streamUrl: string): string {
  const hashAt = streamUrl.indexOf('#');
  const hash = hashAt < 0 ? '' : streamUrl.slice(hashAt);
  const rest = hashAt < 0 ? streamUrl : streamUrl.slice(0, hashAt);
  const queryAt = rest.indexOf('?');
  const path = queryAt < 0 ? rest : rest.slice(0, queryAt);
  const others = (queryAt < 0 ? '' : rest.slice(queryAt + 1))
    .split('&')
    .filter((pair) => pair !== '' && pair.split('=')[0] !== 'extra_headers');
  return `${path}?${[...others, 'extra_headers=1'].join('&')}${hash}`;
}

/** A 32-bit FNV-1a of the bytes with their length: two pictures with both the same are the same picture */
function fingerprint(bytes: Uint8Array): { length: number; hash: number } {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) hash = Math.imul(hash ^ bytes[i]!, 0x01000193);
  return { length: bytes.length, hash: hash >>> 0 };
}

/** Lets go of an answer that is not used, so the server is not kept sending it */
function discard(response: Response) {
  try {
    Promise.resolve(response.body?.cancel?.()).catch(() => undefined);
  } catch {
    // nothing to let go of
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class StampedStream implements FrameSource<StampedFrame> {
  private readonly now: () => number;
  private readonly make: ((blob: Blob) => Promise<ImageBitmap>) | null;
  private readonly maxFrames: number;
  private readonly maxBytes: number;
  private spacing: number;
  private readonly responseTimeout: number;
  private readonly firstTimeout: number;
  private readonly probeFrames: number;
  private readonly parserOptions: MjpegOptions;
  private readonly fetchFn: FetchLike | null;
  private controller: AbortController | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private parser: MjpegParser | null = null;
  private failed: { reason: StampedFailure; detail?: string } | null = null;
  /** Called when the opening is decided, either way (null: it is decided) */
  private decided: (() => void) | null = null;
  private lock: { domain: StampDomain; source: string } | null = null;
  private kept: StampedFrame[] = [];
  private heldBytes = 0;
  private seq = 0;
  /** The stamp of the last picture seen, in a clock that only goes forward (a repeat has the same or an older one) */
  private lastT = -Infinity;
  /** The last picture seen, in a clock where the stamp says nothing of that */
  private lastPrint: { length: number; hash: number } | null = null;
  private lastKeptT = -Infinity;
  private stamped = 0;
  private readonly counts = {
    parts: 0,
    kept: 0,
    repeats: 0,
    thinned: 0,
    offline: 0,
    unstamped: 0,
    empty: 0,
    mixed: 0,
    oversize: 0,
    evicted: 0,
  };

  constructor(options: StampedOptions = {}) {
    this.now = options.now ?? (() => performance.now());
    this.make =
      options.createBitmap ??
      (typeof createImageBitmap === 'function' ? (blob) => createImageBitmap(blob) : null);
    this.maxFrames = options.maxFrames ?? MAX_FRAMES;
    this.maxBytes = options.maxBytes ?? MAX_BYTES;
    this.spacing = options.minSpacingS ?? MIN_FRAME_SPACING_S;
    this.responseTimeout = options.responseTimeoutMs ?? RESPONSE_TIMEOUT_MS;
    this.firstTimeout = options.firstStampTimeoutMs ?? FIRST_STAMP_TIMEOUT_MS;
    this.probeFrames = options.probeFrames ?? PROBE_FRAMES;
    this.parserOptions = options.parser ?? {};
    this.fetchFn =
      options.fetch ??
      (typeof fetch === 'function' ? (input, init) => globalThis.fetch(input, init) : null);
  }

  /** Live: false from the moment no more pictures can come (and from the start where the opening failed) */
  get ok(): boolean {
    return this.failed === null;
  }

  get reason(): StampedFailure | undefined {
    return this.failed?.reason;
  }

  /**
   * What more is known of the reason (a status, a Content-Type, a parser's code) – or the text of an exception, which
   * can name the address of the camera: for the screen at most, never into the log or a recording
   */
  get detail(): string | undefined {
    return this.failed?.detail;
  }

  /** The clock the pictures are stamped in – known from the first one */
  get domain(): StampDomain | null {
    return this.lock?.domain ?? null;
  }

  /** The header the stamps are read from – known from the first picture */
  get source(): string | null {
    return this.lock?.source ?? null;
  }

  frames(): readonly StampedFrame[] {
    return this.kept.slice();
  }

  stats(): StampedStats {
    return { ...this.counts, heldFrames: this.kept.length, heldBytes: this.heldBytes };
  }

  /** Forgets the pictures kept – the start of a strip. What was seen last stays known, so a repeat is still a repeat. */
  clear() {
    this.kept = [];
    this.heldBytes = 0;
    this.lastKeptT = -Infinity;
  }

  /** Kept pictures pushed out of the ring by newer ones since the stream began (the scan notes it in the recording, nothing more) */
  get evicted(): number {
    return this.counts.evicted;
  }

  /** The least distance between two pictures kept, s – the scan knows how many it wants per strip */
  setMinSpacing(seconds: number) {
    if (Number.isFinite(seconds) && seconds >= 0) this.spacing = seconds;
  }

  close() {
    this.fail('closed');
  }

  /** Pixels of one picture, on request: the JPEG decoded by the browser, or null where that fails. */
  async decode(frame: StampedFrame): Promise<Drawable | null> {
    if (!this.make) return null;
    try {
      return await this.make(new Blob([frame.bytes as BlobPart], { type: 'image/jpeg' }));
    } catch {
      return null;
    }
  }

  /**
   * Opens the stream and waits until the first picture with a stamp has come – or until it is clear that none will.
   * Never throws: the answer is `ok` and `reason`.
   */
  async open(streamUrl: string): Promise<void> {
    if (this.failed) return;
    if (!this.fetchFn) return this.fail('no-fetch');
    const controller = (this.controller = new AbortController());
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.responseTimeout);
    let response: Response;
    try {
      // a plain GET: no header of our own, so the browser asks the server nothing beforehand
      response = await this.fetchFn(withExtraHeaders(streamUrl), {
        signal: controller.signal,
        credentials: 'omit',
        mode: 'cors',
      });
    } catch (e) {
      return this.fail(timedOut ? 'no-response' : 'unreachable', message(e));
    } finally {
      clearTimeout(timer);
    }
    if (this.failed) return discard(response); // closed while it was waiting
    if (!response.ok) return this.refuse(response, 'http-status', String(response.status));
    const body = response.body;
    if (!body || typeof body.getReader !== 'function')
      return this.refuse(response, 'no-body-stream');
    const type = response.headers.get('content-type');
    const boundary = boundaryOf(type);
    if (boundary === null) return this.refuse(response, 'not-multipart', type ?? '');
    this.parser = new MjpegParser(boundary, this.parserOptions);
    this.reader = body.getReader();
    const decided = new Promise<void>((resolve) => (this.decided = resolve));
    const guard = setTimeout(() => {
      const { parts, offline } = this.counts;
      this.fail(parts === 0 ? 'silent' : offline === parts ? 'offline' : 'no-stamp');
    }, this.firstTimeout);
    void this.pump(this.reader);
    await decided;
    clearTimeout(guard);
  }

  /** An answer that cannot be used: let go of it, and say why */
  private refuse(response: Response, reason: StampedFailure, detail?: string) {
    discard(response);
    this.fail(reason, detail);
  }

  /** The first failure stays; it stops the reading and settles the opening if that is still waiting */
  private fail(reason: StampedFailure, detail?: string) {
    if (this.failed) return;
    this.failed = detail === undefined ? { reason } : { reason, detail };
    this.controller?.abort();
    this.reader?.cancel().catch(() => undefined);
    this.settle();
  }

  private settle() {
    const decided = this.decided;
    this.decided = null;
    decided?.();
  }

  private async pump(reader: ReadableStreamDefaultReader<Uint8Array>) {
    const parser = this.parser!;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (this.failed) return;
        if (done) {
          this.fail('ended', parser.finish() === 'truncated' ? 'truncated' : undefined);
          return;
        }
        if (!ArrayBuffer.isView(value) || value.byteLength === 0) continue;
        const arrival = this.now();
        const chunk = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        for (const part of parser.feed(chunk)) this.take(part.headers, part.bytes, arrival);
        if (parser.failure) return this.fail('bad-stream', parser.failure);
      }
    } catch (e) {
      // a close() aborts the read: that is no failure of the stream (the first reason stays)
      this.fail('read-failed', message(e));
    }
  }

  /** One part: told a repeat, thinned, or kept – in that order, so a picture that is not kept is not copied */
  private take(headers: Record<string, string>, view: Uint8Array, arrival: number) {
    const counts = this.counts;
    counts.parts++;
    if (!isOnline(headers)) {
      counts.offline++;
      return this.notStamped();
    }
    if (view.length === 0) {
      counts.empty++;
      return this.notStamped();
    }
    const stamp = stampOf(headers);
    if (!stamp) {
      counts.unstamped++;
      return this.notStamped();
    }
    // the source of the first stamp is the one for the whole stream: two headers are two different times
    this.lock ??= { domain: stamp.domain, source: stamp.source };
    if (stamp.source !== this.lock.source) {
      counts.mixed++;
      return;
    }
    if (stamp.domain === 'mono') {
      // a grab time goes forward; a repeat has the one it had, a stale one an older
      if (stamp.t <= this.lastT) {
        counts.repeats++;
        return;
      }
      this.lastT = stamp.t;
    } else {
      // the time of sending is new every time, also for a picture sent again: its bytes tell
      const print = fingerprint(view);
      const last = this.lastPrint;
      this.lastPrint = print;
      if (last && last.length === print.length && last.hash === print.hash) {
        counts.repeats++;
        return;
      }
    }
    this.stamped++;
    if (this.stamped >= this.probeFrames) this.settle();
    if (stamp.t - this.lastKeptT < this.spacing - EPSILON_S) {
      counts.thinned++;
      return;
    }
    if (view.length > this.maxBytes) {
      counts.oversize++;
      return;
    }
    this.lastKeptT = stamp.t;
    this.kept.push({ stamp, arrival, bytes: view.slice(), index: ++this.seq });
    this.heldBytes += view.length;
    counts.kept++;
    while (this.kept.length > this.maxFrames || this.heldBytes > this.maxBytes) {
      this.heldBytes -= this.kept.shift()!.bytes.length;
      counts.evicted++;
    }
  }

  /** A part that cannot be used: while the stream is being opened, enough of them settle it as one that has no stamp */
  private notStamped() {
    const c = this.counts;
    if (this.decided && this.stamped === 0 && c.unstamped + c.offline + c.empty >= PROBE_PARTS) {
      this.fail(c.unstamped + c.empty > 0 ? 'no-stamp' : 'offline');
    }
  }
}

/**
 * Opens the camera server's stream with the stamps asked for (`extra_headers=1`). The handle is there either way:
 * `ok` false and a `reason` where the stream is not available (and then it is closed), otherwise it keeps running and
 * collecting pictures until `close()` – or until it ends, which turns `ok` false.
 */
export async function openStampedStream(
  streamUrl: string,
  options: StampedOptions = {},
): Promise<StampedStream> {
  const stream = new StampedStream(options);
  options.onCreate?.(stream);
  await stream.open(streamUrl);
  return stream;
}
