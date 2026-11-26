import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMachine } from '../src/store/machine';
import { stampedCollector } from '../src/store/photomap';
import { openStampedStream, type FetchLike } from '../src/store/stampedFrames';
import { bytesOf, chunked, jpegLike, randomSizes, rng, sameBytes, stream } from './mjpegFixtures';

/**
 * The whole chain a strip scan on the Pi's clock runs, from the bytes of the camera server to the pixels the solver gets:
 * a synthetic ustreamer stream (several versions' header names) → `openStampedStream` (the real fetch reader, the real
 * parser) → `stampedCollector` (the real one: its store subscription, its span of Jog reports, `pickStripFrames`) →
 * `decodeStamped` → `source.decode` with a fake `createImageBitmap` → `readFrame` on a fake canvas.
 *
 * **What stays untested here:** a real browser's `fetch` and CORS, a real JPEG through a real `createImageBitmap`, the
 * pixels of `readFrame` (the fake canvas holds none), the recording's branch (`tracing()`), and the real ustreamer's bytes.
 */

const TYPE = 'multipart/x-mixed-replace;boundary=boundarydonotcross';
const tick = (ms = 5) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The two Pi clocks, s: the reports carry both, the pictures one – a picture read in the wrong one would be hours away */
const MONO_BASE = 5000;
const WALL_BASE = 1_779_800_000;

/** The browser the collector reads pixels with: a canvas that keeps nothing, and the element classes `sizeOf` asks about */
class FakeVideo {}
class FakeImage {}
const canvas = {
  width: 0,
  height: 0,
  getContext: () => ({
    imageSmoothingQuality: '',
    drawImage() {},
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
    }),
  }),
};

beforeEach(() => {
  vi.stubGlobal('HTMLVideoElement', FakeVideo);
  vi.stubGlobal('HTMLImageElement', FakeImage);
  vi.stubGlobal('document', { createElement: () => canvas });
  useMachine.setState({ status: null, statusStamp: null });
});
afterEach(() => vi.unstubAllGlobals());

/** What a version of ustreamer says about a picture taken `t` seconds into the run */
interface Version {
  name: string;
  headers: (t: number) => Record<string, string>;
  domain: 'mono' | 'wall';
  source: string;
}

const six = (n: number) => n.toFixed(6);
const VERSIONS: Version[] = [
  {
    name: 'v4.13 … v6.20: X-Timestamp and X-UStreamer-Grab-Time',
    headers: (t) => ({
      'X-Timestamp': six(WALL_BASE + t + 0.02),
      'X-UStreamer-Online': 'true',
      'X-UStreamer-Grab-Time': six(MONO_BASE + t),
      'X-UStreamer-Send-Time': six(MONO_BASE + t + 0.01),
    }),
    domain: 'mono',
    source: 'x-ustreamer-grab-time',
  },
  {
    name: 'the same names in lower case and in upper case (a proxy in between)',
    headers: (t) => ({
      'x-timestamp': six(WALL_BASE + t + 0.02),
      'x-ustreamer-online': 'TRUE',
      'X-USTREAMER-GRAB-TIME': six(MONO_BASE + t),
    }),
    domain: 'mono',
    source: 'x-ustreamer-grab-time',
  },
  {
    name: 'master: Grab-Begin-Time and Grab-End-Time',
    headers: (t) => ({
      'X-Timestamp': six(WALL_BASE + t + 0.03),
      'X-UStreamer-Online': 'true',
      'X-UStreamer-Grab-Begin-Time': six(MONO_BASE + t),
      'X-UStreamer-Grab-End-Time': six(MONO_BASE + t + 0.012),
    }),
    domain: 'mono',
    source: 'x-ustreamer-grab-begin-time',
  },
  {
    name: 'master with a driver that gives no begin time (0.000000): the end time is used',
    headers: (t) => ({
      'X-Timestamp': six(WALL_BASE + t + 0.03),
      'X-UStreamer-Online': 'true',
      'X-UStreamer-Grab-Begin-Time': six(0),
      'X-UStreamer-Grab-End-Time': six(MONO_BASE + t),
    }),
    domain: 'mono',
    source: 'x-ustreamer-grab-end-time',
  },
  {
    name: 'X-Timestamp only (no extra_headers): the time of sending, in the wall clock',
    headers: (t) => ({ 'X-Timestamp': six(WALL_BASE + t) }),
    domain: 'wall',
    source: 'x-timestamp',
  },
];

/** The pictures of a run, seconds into it: at rest before, on the move, at rest after – and one close behind another (thinned) */
const AT = [0.3, 0.9, 1.5, 1.6, 2.1, 2.7, 3.45, 4.05];
/** The run: from 1.0 s to 3.0 s the machine jogs along X at 20 mm/s, a report every 0.1 s, before and after it rests */
const JOG = { from: 1.0, to: 3.0, speed: 20 };

function pipe() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    response: new Response(body, { status: 200, headers: { 'content-type': TYPE } }),
    push: (bytes: Uint8Array) => controller.enqueue(bytes),
    get cancelled() {
      return cancelled;
    },
  };
}

/** What the relay does for every report of FluidNC: the position, and the stamp in both of the Pi's clocks */
function report(t: number) {
  const along = t < JOG.from ? 0 : Math.min(t, JOG.to) - JOG.from;
  const state = t >= JOG.from && t <= JOG.to ? 'Jog' : 'Idle';
  useMachine.setState({
    status: { state, mpos: [along * JOG.speed, 0, 0] } as never,
    statusStamp: { mono: (MONO_BASE + t) * 1000, wall: (WALL_BASE + t) * 1000 },
  });
}

describe.each(VERSIONS)('a run on the Pi’s clock – $name', (version) => {
  it('picks the pictures the camera took while it jogged, and decodes exactly their bytes', async () => {
    const p = pipe();
    const fetchFn = vi.fn<FetchLike>(async () => p.response);
    const bitmaps: ImageBitmap[] = [];
    const seen: Blob[] = [];
    const createBitmap = vi.fn(async (blob: Blob) => {
      seen.push(blob);
      const bitmap = { width: 1280, height: 720, close: vi.fn() } as unknown as ImageBitmap;
      bitmaps.push(bitmap);
      return bitmap;
    });
    let page = 1000;
    const now = () => (page += 7);

    // the stream opens on a first picture (one before the run), as at the start of a scan
    const opening = openStampedStream('http://pi:8081/stream', {
      fetch: fetchFn,
      createBitmap,
      now,
    });
    await tick();
    p.push(
      stream([{ headers: version.headers(-1), body: jpegLike(900, 1200) }], {
        length: true,
        trailing: 'none',
      }),
    );
    p.push(bytesOf('\r\n--boundarydonotcross\r\n'));
    const source = await opening;
    expect(source).toMatchObject({ ok: true, domain: version.domain, source: version.source });
    expect(fetchFn.mock.calls[0]![0]).toBe('http://pi:8081/stream?extra_headers=1');

    // the scan's collector for one strip: the real one, on the real stream
    const timing = {
      clock: { kind: 'pi' as const, domain: version.domain, source: version.source },
      source,
    };
    const collector = stampedCollector(timing, {} as never, {
      along: (mpos) => mpos[0] ?? 0,
      startAlong: 0,
      every: 0.5,
    });

    // the camera runs: parts of the sizes the network gives them, bodies full of what looks like boundaries
    const bodies = AT.map((_, i) => jpegLike(100 + i, 1500 + i * 37));
    const bytes = stream(
      AT.map((t, i) => ({ headers: version.headers(t), body: bodies[i]! })),
      { length: true },
    );
    for (const piece of chunked(bytes, randomSizes(rng(7), 900))) p.push(piece);
    // …and the controller reports as it goes (stamped by the relay): rest, the jog, rest again
    for (let t = 0.5; t <= 3.5 + 1e-9; t += 0.1) report(t);
    await vi.waitFor(() => expect(source.frames()).toHaveLength(AT.length - 1));

    collector.stop();
    const taken = await collector.harvest();

    // The picture 0.1 s behind another is thinned (the run asks for one every 0.25 s while the lag is not known). Of the others only
    // those the camera took while the machine jogged (the span of the Jog reports, the lag allowed for) and ≥ 3 mm from
    // where it began: 1.5, 2.1 and 2.7 s – and nothing from the rests before and after
    expect(source.stats()).toMatchObject({ thinned: 1, unstamped: 0, mixed: 0, repeats: 0 });
    const t0 = version.domain === 'mono' ? MONO_BASE : WALL_BASE;
    expect(taken.map((c) => c.t)).toHaveLength(3);
    taken.forEach((c, i) => expect(c.t).toBeCloseTo(t0 + [1.5, 2.1, 2.7][i]!, 6));
    for (const c of taken) {
      expect(c.stamp).toMatchObject({ domain: version.domain, source: version.source });
      expect(Number.isFinite(c.arrival)).toBe(true);
      // the picture as the solver gets it: shrunk to 640 px wide, from a 1280 px one
      expect(c.read).toMatchObject({ k: 0.5, frame: { width: 640, height: 360 } });
    }
    // oldest first, and each arrival is when the page read the piece that completed it
    expect(taken[0]!.arrival!).toBeLessThan(taken[2]!.arrival!);

    // what reached the decoder: the bytes of the picked pictures out of the stream, nothing else, as a JPEG
    expect(createBitmap).toHaveBeenCalledTimes(3);
    expect(seen.map((b) => b.type)).toEqual(['image/jpeg', 'image/jpeg', 'image/jpeg']);
    const decoded = await Promise.all(seen.map(async (b) => new Uint8Array(await b.arrayBuffer())));
    // the pictures at 1.5, 2.1 and 2.7 s are the third, fifth and sixth of the stream
    [2, 4, 5].forEach((pictureIndex, i) =>
      expect(sameBytes(decoded[i]!, bodies[pictureIndex]!)).toBe(true),
    );
    // every pixel picture is let go of once it is read
    expect(bitmaps).toHaveLength(3);
    for (const bitmap of bitmaps)
      expect((bitmap as unknown as { close: () => void }).close).toHaveBeenCalledTimes(1);

    // the stream is the scan's to close; closing lets go of the reader
    source.close();
    expect(source.ok).toBe(false);
    await tick(10);
    expect(p.cancelled).toBe(true);
  });
});
