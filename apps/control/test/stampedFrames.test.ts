import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FIRST_STAMP_TIMEOUT_MS,
  MAX_BYTES,
  MAX_FRAMES,
  MIN_FRAME_SPACING_S,
  openStampedStream,
  PROBE_PARTS,
  RESPONSE_TIMEOUT_MS,
  StampedStream,
  withExtraHeaders,
  type FetchLike,
  type StampedOptions,
} from '../src/store/stampedFrames';
import {
  bytesOf,
  chunked,
  concat,
  jpegLike,
  randomSizes,
  rng,
  sameBytes,
  stream as mjpeg,
} from './mjpegFixtures';

const TYPE = 'multipart/x-mixed-replace;boundary=boundarydonotcross';
const tick = (ms = 5) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** What the camera server says about one picture grabbed at `t` seconds (its own clock) */
function grabbed(t: number, extra: Record<string, string> = {}): Record<string, string> {
  return {
    'X-Timestamp': (1779800000 + t).toFixed(6),
    'X-UStreamer-Online': 'true',
    'X-UStreamer-Grab-Time': t.toFixed(6),
    ...extra,
  };
}

/** An answer whose body the test feeds piece by piece */
function pipe(init: { status?: number; type?: string | null; body?: boolean } = {}) {
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
  const headers: Record<string, string> = {};
  if (init.type !== null) headers['content-type'] = init.type ?? TYPE;
  const response = new Response(init.body === false ? null : body, {
    status: init.status ?? 200,
    headers,
  });
  return {
    response,
    push: (bytes: Uint8Array) => controller.enqueue(bytes),
    end: () => controller.close(),
    fail: (e: Error) => controller.error(e),
    get cancelled() {
      return cancelled;
    },
  };
}

function serve(p: ReturnType<typeof pipe>) {
  const fetchFn = vi.fn<FetchLike>(async () => p.response);
  return fetchFn;
}

/** The bytes of `n` pictures 40 ms apart, from `t0` */
function pictures(n: number, t0 = 5000, step = 0.04, size = 1500, seedBase = 0) {
  return Array.from({ length: n }, (_, i) => ({
    headers: grabbed(t0 + i * step),
    body: jpegLike(seedBase + i + 1, size),
  }));
}

async function opened(
  p: ReturnType<typeof pipe>,
  options: StampedOptions = {},
  first = pictures(1),
) {
  const fetchFn = serve(p);
  const promise = openStampedStream('http://pi:8081/stream', { fetch: fetchFn, ...options });
  await tick();
  p.push(mjpeg(first, { length: true, trailing: 'none' }));
  p.push(bytesOf('\r\n--boundarydonotcross\r\n'));
  const handle = await promise;
  return { handle, fetchFn };
}

afterEach(() => vi.unstubAllGlobals());

describe('the address of the stamped stream', () => {
  it('adds extra_headers=1 to a plain address and keeps the rest', () => {
    expect(withExtraHeaders('http://pi:8081/stream')).toBe('http://pi:8081/stream?extra_headers=1');
    expect(withExtraHeaders('http://pi:8081/stream?')).toBe(
      'http://pi:8081/stream?extra_headers=1',
    );
    expect(withExtraHeaders('/stream')).toBe('/stream?extra_headers=1');
  });

  it('keeps an existing query as it is, and puts its own value in place of an old one', () => {
    expect(withExtraHeaders('http://pi:8081/stream?key=a%2Fb&fps=15')).toBe(
      'http://pi:8081/stream?key=a%2Fb&fps=15&extra_headers=1',
    );
    expect(withExtraHeaders('http://pi:8081/stream?extra_headers=0&fps=15')).toBe(
      'http://pi:8081/stream?fps=15&extra_headers=1',
    );
    expect(withExtraHeaders('http://pi/s?a=1&&extra_headers&b=2')).toBe(
      'http://pi/s?a=1&b=2&extra_headers=1',
    );
    expect(withExtraHeaders('http://pi:8081/stream?x=1#frag')).toBe(
      'http://pi:8081/stream?x=1&extra_headers=1#frag',
    );
    expect(withExtraHeaders('http://pi:8081/stream#frag')).toBe(
      'http://pi:8081/stream?extra_headers=1#frag',
    );
  });
});

describe('opening the stream', () => {
  it('asks with a plain GET, no header of its own, and is open when the first stamped picture is in', async () => {
    const p = pipe();
    const fetchFn = serve(p);
    let done = false;
    const promise = openStampedStream('http://pi:8081/stream?fps=15', { fetch: fetchFn }).then(
      (h) => {
        done = true;
        return h;
      },
    );
    await tick();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://pi:8081/stream?fps=15&extra_headers=1');
    expect(init).toMatchObject({ credentials: 'omit', mode: 'cors' });
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    expect(init!.headers).toBeUndefined();
    expect(init!.method).toBeUndefined();
    // the answer is there but no picture yet: not open
    expect(done).toBe(false);
    p.push(mjpeg(pictures(1), { length: true }));
    const handle = await promise;
    expect(handle.ok).toBe(true);
    expect(handle.reason).toBeUndefined();
    expect(handle.domain).toBe('mono');
    expect(handle.source).toBe('x-ustreamer-grab-time');
    expect(handle.frames()).toHaveLength(1);
    handle.close();
  });

  it('is open with the time of sending where only that comes – in the wall clock', async () => {
    const p = pipe();
    const { handle } = await opened(p, {}, [
      { headers: { 'X-Timestamp': '1779800000.500000' }, body: jpegLike(1, 800) },
    ]);
    expect(handle.ok).toBe(true);
    expect(handle.domain).toBe('wall');
    expect(handle.source).toBe('x-timestamp');
    expect(handle.frames()[0]!.stamp).toEqual({
      domain: 'wall',
      t: 1779800000.5,
      source: 'x-timestamp',
    });
    handle.close();
  });

  it('is not open without fetch, and says so without throwing', async () => {
    vi.stubGlobal('fetch', undefined);
    const h = await openStampedStream('http://pi:8081/stream');
    expect(h.ok).toBe(false);
    expect(h.reason).toBe('no-fetch');
    expect(h.frames()).toEqual([]);
  });

  it('uses the browser fetch where none is given', async () => {
    const p = pipe();
    const fetchFn = serve(p);
    vi.stubGlobal('fetch', fetchFn);
    const promise = openStampedStream('http://pi:8081/stream');
    await tick();
    p.push(mjpeg(pictures(1), { length: true }));
    const h = await promise;
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(h.ok).toBe(true);
    h.close();
  });

  it('says it is unreachable where the request fails – the network or the CORS check, the browser does not say which', async () => {
    const h = await openStampedStream('http://pi:8081/stream', {
      fetch: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    expect(h.ok).toBe(false);
    expect(h.reason).toBe('unreachable');
    expect(h.detail).toBe('Failed to fetch');
    expect(
      await openStampedStream('x', { fetch: async () => Promise.reject('plain') }),
    ).toMatchObject({
      reason: 'unreachable',
      detail: 'plain',
    });
  });

  it('gives up on a server that does not answer – a camera that serves one client leaves a second waiting', async () => {
    let aborted = false;
    const waiting: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    const h = await openStampedStream('http://pi:8081/stream', {
      fetch: waiting,
      responseTimeoutMs: 15,
    });
    expect(h.ok).toBe(false);
    expect(h.reason).toBe('no-response');
    expect(aborted).toBe(true);
    expect(RESPONSE_TIMEOUT_MS).toBeGreaterThan(0);
    expect(FIRST_STAMP_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('says why the answer is no use: a status, no body to read in pieces, no multipart', async () => {
    const status = pipe({ status: 404 });
    const a = await openStampedStream('x', { fetch: serve(status) });
    expect(a).toMatchObject({ ok: false, reason: 'http-status', detail: '404' });

    const noBody = pipe({ body: false });
    const b = await openStampedStream('x', { fetch: serve(noBody) });
    expect(b).toMatchObject({ ok: false, reason: 'no-body-stream' });

    const html = pipe({ type: 'text/html' });
    const c = await openStampedStream('x', { fetch: serve(html) });
    expect(c).toMatchObject({ ok: false, reason: 'not-multipart', detail: 'text/html' });
    expect(html.cancelled).toBe(true);

    const noBoundary = pipe({ type: 'multipart/x-mixed-replace' });
    expect(await openStampedStream('x', { fetch: serve(noBoundary) })).toMatchObject({
      reason: 'not-multipart',
    });
    const noType = pipe({ type: null });
    expect(await openStampedStream('x', { fetch: serve(noType) })).toMatchObject({
      reason: 'not-multipart',
      detail: '',
    });
  });

  it('says a body without getReader is no stream (a browser that cannot read it piece by piece)', async () => {
    const odd = { ok: true, status: 200, body: {}, headers: new Headers({ 'content-type': TYPE }) };
    const h = await openStampedStream('x', { fetch: async () => odd as unknown as Response });
    expect(h).toMatchObject({ ok: false, reason: 'no-body-stream' });
  });

  it('says there is no stamp where pictures come and none has a time that can be read', async () => {
    const p = pipe();
    const promise = openStampedStream('x', { fetch: serve(p) });
    await tick();
    const plain = Array.from({ length: PROBE_PARTS }, (_, i) => ({ body: jpegLike(i + 1, 500) }));
    p.push(mjpeg(plain, { length: true }));
    const h = await promise;
    expect(h).toMatchObject({ ok: false, reason: 'no-stamp' });
    expect(h.stats().unstamped).toBe(PROBE_PARTS);
    expect(p.cancelled).toBe(true);
  });

  it('says it is offline where only placeholders come', async () => {
    const p = pipe();
    const promise = openStampedStream('x', { fetch: serve(p) });
    await tick();
    const placeholders = Array.from({ length: PROBE_PARTS }, (_, i) => ({
      headers: grabbed(10 + i, { 'X-UStreamer-Online': 'false' }),
      body: jpegLike(i + 1, 500),
    }));
    p.push(mjpeg(placeholders, { length: true }));
    expect(await promise).toMatchObject({ ok: false, reason: 'offline' });
  });

  it('says there is no stamp for parts that are all empty, and for a mixture of nothing usable', async () => {
    const p = pipe();
    const promise = openStampedStream('x', { fetch: serve(p) });
    await tick();
    const empty = Array.from({ length: PROBE_PARTS }, (_, i) => ({
      headers: grabbed(1 + i),
      body: new Uint8Array(0),
    }));
    p.push(mjpeg(empty, { length: true }));
    expect(await promise).toMatchObject({ ok: false, reason: 'no-stamp' });
    const q = pipe();
    const mixed = openStampedStream('x', { fetch: serve(q) });
    await tick();
    q.push(
      mjpeg(
        [
          { headers: grabbed(1, { 'X-UStreamer-Online': 'false' }), body: jpegLike(1, 300) },
          { headers: {}, body: jpegLike(2, 300) },
          { headers: grabbed(3, { 'X-UStreamer-Online': 'false' }), body: jpegLike(3, 300) },
          { headers: grabbed(4, { 'X-UStreamer-Online': 'false' }), body: jpegLike(4, 300) },
          { headers: grabbed(5, { 'X-UStreamer-Online': 'false' }), body: jpegLike(5, 300) },
        ],
        { length: true },
      ),
    );
    expect(await mixed).toMatchObject({ ok: false, reason: 'no-stamp' });
  });

  it('says there is no stamp, too, for empty parts, and offline when the first picture is a placeholder and the deadline comes', async () => {
    const p = pipe();
    const promise = openStampedStream('x', { fetch: serve(p), firstStampTimeoutMs: 20 });
    await tick();
    p.push(mjpeg([{ headers: grabbed(1), body: new Uint8Array(0) }], { length: true }));
    expect(await promise).toMatchObject({ ok: false, reason: 'no-stamp' });
    const q = pipe();
    const later = openStampedStream('x', { fetch: serve(q), firstStampTimeoutMs: 20 });
    await tick();
    q.push(
      mjpeg([{ headers: grabbed(1, { 'X-UStreamer-Online': 'false' }), body: jpegLike(1, 300) }], {
        length: true,
      }),
    );
    expect(await later).toMatchObject({ ok: false, reason: 'offline' });
  });

  it('gives up on a server that answers and then says nothing', async () => {
    const p = pipe();
    const h = await openStampedStream('x', { fetch: serve(p), firstStampTimeoutMs: 20 });
    expect(h).toMatchObject({ ok: false, reason: 'silent' });
    expect(p.cancelled).toBe(true);
  });

  it('gives up on a stream that is not a multipart stream, by what the parser says', async () => {
    const p = pipe();
    const promise = openStampedStream('x', { fetch: serve(p) });
    await tick();
    p.push(bytesOf('<html>'.repeat(3000)));
    expect(await promise).toMatchObject({ ok: false, reason: 'bad-stream', detail: 'garbage' });
  });

  it('says the stream ended where it ends before a picture came – and where it was cut off', async () => {
    const p = pipe();
    const promise = openStampedStream('x', { fetch: serve(p) });
    await tick();
    p.end();
    expect(await promise).toMatchObject({ ok: false, reason: 'ended' });
    const q = pipe();
    const cut = openStampedStream('x', { fetch: serve(q) });
    await tick();
    q.push(bytesOf('--boundarydonotcross\r\nX-Timestamp: 5\r\n'));
    q.end();
    expect(await cut).toMatchObject({ ok: false, reason: 'ended', detail: 'truncated' });
  });

  it('is closed at once if it was closed before it began, and fetches nothing', async () => {
    const p = pipe();
    const fetchFn = serve(p);
    const handle = new StampedStream({ fetch: fetchFn });
    handle.close();
    await handle.open('x');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(handle).toMatchObject({ ok: false, reason: 'closed' });
  });

  it('lets go of an answer that comes after the close, and has no clock before the first picture', async () => {
    const p = pipe();
    const late: FetchLike = async () => {
      await tick(20);
      return p.response;
    };
    const handle = new StampedStream({ fetch: late });
    const opening = handle.open('x');
    await tick();
    handle.close();
    await opening;
    expect(handle).toMatchObject({ ok: false, reason: 'closed', domain: null, source: null });
    expect(p.cancelled).toBe(true);
  });

  it('can be closed while the server has not answered, and while no picture has come', async () => {
    let aborted = false;
    const waiting: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    const handle = new StampedStream({ fetch: waiting });
    const opening = handle.open('x');
    await tick();
    handle.close();
    await opening;
    expect(aborted).toBe(true);
    expect(handle).toMatchObject({ ok: false, reason: 'closed' });

    const p = pipe();
    const second = new StampedStream({ fetch: serve(p) });
    const waitingForPicture = second.open('x');
    await tick();
    second.close();
    await waitingForPicture;
    expect(second).toMatchObject({ ok: false, reason: 'closed' });
    expect(p.cancelled).toBe(true);
  });
});

describe('collecting pictures while the stream runs', () => {
  it('keeps the pictures with their stamps and arrival times, whatever the size of the pieces they come in', async () => {
    let clockMs = 1000;
    const q = pipe();
    const promise = openStampedStream('x', {
      fetch: serve(q),
      now: () => (clockMs += 10),
      minSpacingS: 0,
    });
    await tick();
    const list = pictures(40, 5000, 0.04, 2500);
    const data = mjpeg(list, { length: true });
    for (const piece of chunked(data, randomSizes(rng(5), 700))) q.push(piece);
    const h = await promise;
    await tick(20);
    const frames = h.frames();
    expect(frames).toHaveLength(40);
    frames.forEach((f, i) => {
      expect(sameBytes(f.bytes, list[i]!.body)).toBe(true);
      expect(f.stamp.t).toBeCloseTo(5000 + i * 0.04, 6);
      expect(f.stamp.domain).toBe('mono');
      expect(f.index).toBe(i + 1);
    });
    // the page's clock was read for every piece, so a picture's arrival is the moment its last piece came
    const arrivals = frames.map((f) => f.arrival);
    expect(arrivals.every((a, i) => i === 0 || a >= arrivals[i - 1]!)).toBe(true);
    expect(arrivals[0]).toBeGreaterThan(1000);
    expect(h.stats()).toMatchObject({
      parts: 40,
      kept: 40,
      repeats: 0,
      thinned: 0,
      heldFrames: 40,
    });
    h.close();
  });

  it('keeps pictures intact: bytes copied at the start are right after many more have gone through', async () => {
    const p = pipe();
    const { handle } = await opened(p, { minSpacingS: 0 }, pictures(1, 5000, 0.04, 4000, 900));
    const first = jpegLike(901, 4000);
    expect(sameBytes(handle.frames()[0]!.bytes, first)).toBe(true);
    const more = pictures(120, 5001, 0.04, 6000, 1000);
    for (const piece of chunked(
      mjpeg(more, { length: true, trailing: 'none' }),
      randomSizes(rng(9), 900),
    ))
      p.push(piece);
    await tick(30);
    expect(handle.stats().kept).toBeGreaterThan(100);
    expect(sameBytes(handle.frames()[0]!.bytes, first)).toBe(true);
    handle.frames().forEach((f, i) => {
      if (i > 0) expect(sameBytes(f.bytes, more[i - 1]!.body)).toBe(true);
    });
    handle.close();
  });

  it('knows a repeat by its grab time: the same picture sent again with a new X-Timestamp is one picture', async () => {
    const p = pipe();
    const { handle } = await opened(p, { minSpacingS: 0 });
    const body = jpegLike(77, 1000);
    for (let i = 0; i < 3; i++) {
      // a second without news: ustreamer sends the exposed picture again, the same grab time and a newer X-Timestamp
      p.push(
        mjpeg(
          [{ headers: grabbed(5000.04, { 'X-Timestamp': (1779805001 + i).toFixed(6) }), body }],
          { length: true },
        ),
      );
    }
    p.push(mjpeg([{ headers: grabbed(5000.08), body: jpegLike(78, 1000) }], { length: true }));
    await tick(20);
    expect(handle.frames().map((f) => f.stamp.t)).toEqual([5000, 5000.04, 5000.08]);
    expect(handle.stats().repeats).toBe(2);
    handle.close();
  });

  it('knows a repeat by its bytes where the stamp is the time of sending, which is new every time', async () => {
    const p = pipe();
    const sent = (t: number, body: Uint8Array) => ({
      headers: { 'X-Timestamp': t.toFixed(6) },
      body,
    });
    const { handle } = await opened(p, { minSpacingS: 0 }, [sent(1779800000.1, jpegLike(1, 900))]);
    const again = jpegLike(2, 900);
    p.push(
      mjpeg([sent(1779800001.2, again), sent(1779800002.3, again), sent(1779800003.4, again)], {
        length: true,
      }),
    );
    // the same size, not the same bytes: another picture
    const other = again.slice();
    other[500] = other[500]! ^ 0xff;
    p.push(mjpeg([sent(1779800004.5, other)], { length: true }));
    await tick(20);
    expect(handle.frames()).toHaveLength(3);
    expect(handle.stats().repeats).toBe(2);
    handle.close();
  });

  it('thins by stamp spacing: only what is far enough from the last one kept is kept – and the caller sets the spacing', async () => {
    const p = pipe();
    const { handle } = await opened(p, {}, pictures(1, 5000, 0.01));
    expect(MIN_FRAME_SPACING_S).toBe(0.05);
    // a picture every 10 ms: one in five is kept at 50 ms
    p.push(mjpeg(pictures(30, 5000.01, 0.01), { length: true }));
    await tick(20);
    const kept = handle.frames().map((f) => f.stamp.t);
    expect(kept).toHaveLength(7);
    kept.forEach((t, i) => i > 0 && expect(t - kept[i - 1]!).toBeGreaterThanOrEqual(0.05 - 1e-9));
    expect(handle.stats()).toMatchObject({ parts: 31, kept: 7, thinned: 24 });
    // the scan wants more: spacing 0 keeps all of them
    handle.setMinSpacing(0);
    p.push(mjpeg(pictures(5, 5001, 0.001), { length: true }));
    await tick(20);
    expect(handle.stats().kept).toBe(12);
    // not a number: stays
    handle.setMinSpacing(NaN);
    handle.setMinSpacing(-1);
    p.push(mjpeg(pictures(5, 5002, 0.001), { length: true }));
    await tick(20);
    expect(handle.stats().kept).toBe(17);
    handle.close();
  });

  it('holds a ring: the oldest go when there are too many pictures or too many bytes, and it is counted', async () => {
    const p = pipe();
    const { handle } = await opened(p, { maxFrames: 5, minSpacingS: 0 });
    p.push(mjpeg(pictures(20, 5000.04, 0.04), { length: true }));
    await tick(20);
    const frames = handle.frames();
    expect(frames).toHaveLength(5);
    expect(frames.map((f) => f.index)).toEqual([17, 18, 19, 20, 21]);
    expect(handle.stats()).toMatchObject({
      kept: 21,
      evicted: 16,
      heldFrames: 5,
      heldBytes: 5 * 1500,
    });
    handle.close();

    const q = pipe();
    const { handle: byBytes } = await opened(q, { maxBytes: 10_000, minSpacingS: 0 });
    q.push(mjpeg(pictures(10, 5000.04, 0.04, 3000), { length: true }));
    await tick(20);
    expect(byBytes.stats().heldBytes).toBeLessThanOrEqual(10_000);
    expect(byBytes.stats().heldFrames).toBe(3);
    expect(byBytes.stats().evicted).toBe(11 - 3);
    // a picture bigger than the whole ring is left out, not kept
    q.push(mjpeg([{ headers: grabbed(6000), body: jpegLike(5, 12_000) }], { length: true }));
    await tick(20);
    expect(byBytes.stats().oversize).toBe(1);
    expect(byBytes.frames()).toHaveLength(3);
    byBytes.close();
    expect(MAX_FRAMES).toBeGreaterThan(100);
    expect(MAX_BYTES).toBeGreaterThan(1e7);
  });

  it('forgets what it holds on clear(), keeps counting the pictures, and keeps the first one that comes at once', async () => {
    const p = pipe();
    const { handle } = await opened(p, {}, pictures(1, 5000, 0.04));
    p.push(mjpeg(pictures(3, 5000.04, 0.04), { length: true }));
    await tick(20);
    expect(handle.frames().length).toBeGreaterThan(0);
    handle.clear();
    expect(handle.frames()).toEqual([]);
    expect(handle.stats().heldBytes).toBe(0);
    // 10 ms after the last one kept before: kept anyway, it is the start of a new strip
    p.push(mjpeg(pictures(1, 5000.13, 0.04, 1500, 50), { length: true }));
    await tick(20);
    expect(handle.frames()).toHaveLength(1);
    expect(handle.frames()[0]!.index).toBeGreaterThan(1);
    // a repeat of the last picture is a repeat still
    p.push(mjpeg([{ headers: grabbed(5000.13), body: jpegLike(51, 1500) }], { length: true }));
    await tick(20);
    expect(handle.frames()).toHaveLength(1);
    handle.close();
  });

  it('never mixes stamps from two headers: the first picture decides, the others are counted', async () => {
    const p = pipe();
    const { handle } = await opened(p, { minSpacingS: 0 });
    // the same server, a picture without its grab time: only the time of sending is there
    p.push(
      mjpeg([{ headers: { 'X-Timestamp': '1779805000.100000' }, body: jpegLike(5, 800) }], {
        length: true,
      }),
    );
    p.push(mjpeg([{ headers: grabbed(5000.2), body: jpegLike(6, 800) }], { length: true }));
    await tick(20);
    expect(handle.frames()).toHaveLength(2);
    expect(handle.stats().mixed).toBe(1);
    expect(handle.domain).toBe('mono');
    handle.close();
  });

  it('counts the placeholders and the empty parts and the pictures with no stamp that come later, and goes on', async () => {
    const p = pipe();
    const { handle } = await opened(p, { minSpacingS: 0 });
    p.push(
      mjpeg(
        [
          { headers: grabbed(5000.1, { 'X-UStreamer-Online': 'false' }), body: jpegLike(1, 700) },
          { headers: grabbed(5000.2), body: new Uint8Array(0) },
          { headers: { 'Content-Type': 'image/jpeg' }, body: jpegLike(2, 700) },
          { headers: grabbed(5000.3), body: jpegLike(3, 700) },
        ],
        { length: true },
      ),
    );
    await tick(20);
    expect(handle.ok).toBe(true);
    expect(handle.stats()).toMatchObject({ parts: 5, offline: 1, empty: 1, unstamped: 1, kept: 2 });
    handle.close();
  });

  it('copies bytes and stamps and nothing else: nothing is decoded while the stream runs, a picture is on request', async () => {
    const p = pipe();
    const bitmap = { width: 4, height: 3, close: vi.fn() } as unknown as ImageBitmap;
    const createBitmap = vi.fn(async (_blob: Blob) => bitmap);
    const { handle } = await opened(p, { createBitmap, minSpacingS: 0 });
    p.push(mjpeg(pictures(30, 5000.04, 0.04), { length: true }));
    await tick(20);
    expect(handle.stats().kept).toBe(31);
    expect(createBitmap).not.toHaveBeenCalled();
    const frame = handle.frames()[3]!;
    const got = await handle.decode(frame);
    expect(got).toBe(bitmap);
    expect(createBitmap).toHaveBeenCalledTimes(1);
    const blob = createBitmap.mock.calls[0]![0];
    expect(blob.type).toBe('image/jpeg');
    expect(sameBytes(new Uint8Array(await blob.arrayBuffer()), frame.bytes)).toBe(true);
    handle.close();
    // after the stream is closed the pictures can still be decoded – that is what the scan does after the run
    expect(await handle.decode(frame)).toBe(bitmap);
  });

  it('gives null for a picture that cannot be decoded, and where the browser cannot decode at all', async () => {
    const p = pipe();
    const { handle } = await opened(p, {
      createBitmap: async () => {
        throw new Error('corrupt');
      },
    });
    expect(await handle.decode(handle.frames()[0]!)).toBeNull();
    handle.close();
    vi.stubGlobal('createImageBitmap', undefined);
    const q = pipe();
    const { handle: none } = await opened(q);
    expect(await none.decode(none.frames()[0]!)).toBeNull();
    none.close();
  });

  it('uses the browser createImageBitmap where none is given', async () => {
    const bitmap = { close: vi.fn() };
    const create = vi.fn(async () => bitmap);
    vi.stubGlobal('createImageBitmap', create);
    const p = pipe();
    const { handle } = await opened(p);
    expect(await handle.decode(handle.frames()[0]!)).toBe(bitmap);
    expect(create).toHaveBeenCalledTimes(1);
    handle.close();
  });
});

describe('a stream that stops being one', () => {
  it('turns ok to false when the server ends it – and keeps what it has', async () => {
    const p = pipe();
    const { handle } = await opened(p, { minSpacingS: 0 });
    p.push(mjpeg(pictures(3, 5000.04, 0.04), { length: true }));
    await tick(20);
    expect(handle.ok).toBe(true);
    p.end();
    await tick(20);
    expect(handle).toMatchObject({ ok: false, reason: 'ended' });
    expect(handle.frames()).toHaveLength(4);
  });

  it('turns ok to false when reading fails', async () => {
    const p = pipe();
    const { handle } = await opened(p);
    p.fail(new Error('connection reset'));
    await tick(20);
    expect(handle).toMatchObject({ ok: false, reason: 'read-failed', detail: 'connection reset' });
  });

  it('turns ok to false when the stream stops being a multipart stream, and reads no more', async () => {
    const p = pipe();
    const { handle } = await opened(p, { minSpacingS: 0 });
    // a Content-Length that is wrong: what follows the body is not a boundary
    p.push(
      bytesOf(
        '--boundarydonotcross\r\nContent-Length: 5\r\nX-Timestamp: 1779800009.5\r\n\r\nabcdefghij',
      ),
    );
    await tick(20);
    expect(handle).toMatchObject({ ok: false, reason: 'bad-stream', detail: 'bad-framing' });
    expect(p.cancelled).toBe(true);
  });

  it('turns ok to false when it is closed, and a close is no failure of the stream: the first reason stays', async () => {
    const p = pipe();
    const { handle } = await opened(p);
    handle.close();
    expect(handle).toMatchObject({ ok: false, reason: 'closed' });
    await tick(10);
    expect(handle.reason).toBe('closed');
    expect(p.cancelled).toBe(true);
    // closing twice, and after an end, changes nothing
    handle.close();
    const q = pipe();
    const { handle: ended } = await opened(q);
    q.end();
    await tick(20);
    ended.close();
    expect(ended.reason).toBe('ended');
  });

  it('ignores pieces that are empty or no bytes', async () => {
    const p = pipe();
    const { handle } = await opened(p, { minSpacingS: 0 });
    p.push(new Uint8Array(0));
    p.push(concat());
    (p as unknown as { push(x: unknown): void }).push('text');
    p.push(mjpeg(pictures(1, 5000.04), { length: true }));
    await tick(20);
    expect(handle.stats().kept).toBe(2);
    expect(handle.ok).toBe(true);
    handle.close();
  });
});
