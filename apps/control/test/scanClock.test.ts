import { describe, expect, it } from 'vitest';
import {
  BROWSER_CLOCK,
  clockBlocker,
  clockFromStream,
  clockKey,
  pickStripFrames,
  pooledNoise,
  reportSeconds,
  type ClockFacts,
  type PickOptions,
} from '../src/lib/scanClock';
import { PositionTrack } from '../src/lib/strips';

/** What a Pi that has been up for 34 hours says – the relay's stamp in ms, at the moment of a report */
const REPORT = { mono: 123_456_789, wall: 1_779_800_000_123 };
const piFacts: ClockFacts = { piConfigured: true, reportStamp: REPORT, streamAvailable: true };

describe("what rules the Pi's clock out before a stream is opened", () => {
  it("is nothing to say where no Pi is part of the connection: the browser's clock, and no reason", () => {
    expect(clockBlocker({ ...piFacts, piConfigured: false })).toBe(BROWSER_CLOCK);
    // whatever else is missing: without a Pi there is nothing to explain
    expect(
      clockBlocker({ piConfigured: false, reportStamp: null, streamAvailable: false }),
    ).toEqual({ kind: 'browser', reason: null });
  });

  it('is reports without a stamp first (an older companion), then a camera that is no stream', () => {
    expect(clockBlocker({ ...piFacts, reportStamp: null, streamAvailable: false })).toEqual({
      kind: 'browser',
      reason: 'relay',
    });
    expect(clockBlocker({ ...piFacts, streamAvailable: false })).toEqual({
      kind: 'browser',
      reason: 'device',
    });
  });

  it('is nothing where both are there: the stream is worth trying', () => {
    expect(clockBlocker(piFacts)).toBeNull();
  });
});

describe('what an opened stream decides', () => {
  const frame = (
    t: number,
    domain: 'mono' | 'wall' = 'mono',
    source = 'x-ustreamer-grab-time',
  ) => ({
    domain,
    t,
    source,
  });

  it("is the Pi's clock where the stamp of the picture lies within the window of the report's – in the picture's own clock", () => {
    expect(clockFromStream({ ok: true, frame: frame(123_456.7), reportStamp: REPORT })).toEqual({
      kind: 'pi',
      domain: 'mono',
      source: 'x-ustreamer-grab-time',
    });
    expect(
      clockFromStream({
        ok: true,
        frame: frame(1_779_800_000.2, 'wall', 'x-timestamp'),
        reportStamp: REPORT,
      }),
    ).toEqual({ kind: 'pi', domain: 'wall', source: 'x-timestamp' });
  });

  it('is the browser\'s clock with "window" where the stamp lies outside it – a driver that stamps with another clock', () => {
    // the wall clock's seconds where the reports' monotonic ones are
    expect(
      clockFromStream({ ok: true, frame: frame(1_779_800_000.1), reportStamp: REPORT }),
    ).toEqual({ kind: 'browser', reason: 'window' });
    // 3.5 s off is outside the default window of 3 s, inside a wider one
    expect(clockFromStream({ ok: true, frame: frame(123_460.3), reportStamp: REPORT }).kind).toBe(
      'browser',
    );
    expect(
      clockFromStream({ ok: true, frame: frame(123_460.3), reportStamp: REPORT, windowS: 5 }).kind,
    ).toBe('pi');
  });

  it('is the browser\'s clock with "stream" and the failure code where the stream gave nothing', () => {
    expect(
      clockFromStream({ ok: false, reason: 'unreachable', frame: null, reportStamp: REPORT }),
    ).toEqual({ kind: 'browser', reason: 'stream', detail: 'unreachable' });
    expect(clockFromStream({ ok: false, frame: null, reportStamp: REPORT })).toEqual({
      kind: 'browser',
      reason: 'stream',
    });
    // open, but no picture to read a stamp from
    expect(clockFromStream({ ok: true, frame: null, reportStamp: REPORT })).toEqual({
      kind: 'browser',
      reason: 'stream',
    });
  });

  it('is the browser\'s clock with "relay" where the reports lost their stamp while the stream opened', () => {
    expect(clockFromStream({ ok: true, frame: frame(123_456.7), reportStamp: null })).toEqual({
      kind: 'browser',
      reason: 'relay',
    });
  });
});

describe('the name of a clock and the seconds of a stamp', () => {
  it('is one name per clock, the same for the same stamps and another for any other – lags are kept under it', () => {
    const grab = { kind: 'pi', domain: 'mono', source: 'x-ustreamer-grab-time' } as const;
    expect(clockKey(grab)).toBe('pi:mono:x-ustreamer-grab-time');
    expect(clockKey({ ...grab, source: 'x-ustreamer-grab-begin-time' })).not.toBe(clockKey(grab));
    expect(clockKey({ kind: 'pi', domain: 'wall', source: 'x-timestamp' })).toBe(
      'pi:wall:x-timestamp',
    );
    expect(clockKey(BROWSER_CLOCK)).toBe('browser');
    expect(clockKey({ kind: 'browser', reason: 'window' })).toBe('browser');
  });

  it("is the relay's ms in the clock asked for, as seconds", () => {
    expect(reportSeconds(REPORT, 'mono')).toBe(123_456.789);
    expect(reportSeconds(REPORT, 'wall')).toBe(1_779_800_000.123);
  });
});

describe('the pictures of a run', () => {
  /** A camera moving at 50 mm/s from 100 mm, reports every 100 ms on the Pi's clock (starting at 1000 s) */
  function track(): PositionTrack {
    const t = new PositionTrack();
    for (let i = 0; i <= 60; i++) t.add(1000 + i * 0.1, 100 + 50 * i * 0.1);
    return t;
  }
  const options = (extra: Partial<PickOptions> = {}): PickOptions => ({
    track: track(),
    lag: 0,
    startAlong: 100,
    jogFrom: 1000,
    jogTo: 1006,
    max: 100,
    ...extra,
  });
  const pictures = (stamps: number[]) => stamps.map((t) => ({ stamp: { t } }));

  it('are those taken while the camera was jogging and at least 3 mm from where it began', () => {
    // 1000.0 is at the start (0 mm), 1000.05 is 2.5 mm on, 1000.08 is 4 mm on; 1007 is after the jog
    const picked = pickStripFrames(
      pictures([999, 1000, 1000.05, 1000.08, 1003, 1006, 1007]),
      options(),
    );
    expect(picked.map((f) => f.stamp.t)).toEqual([1000.08, 1003, 1006]);
  });

  it('allow for the lag: a picture stamped t shows where the camera was at t − lag', () => {
    // with a lag of 0.5 s the picture stamped 1000.5 shows the start (1000.0), the one at 1006.4 shows 1005.9
    const picked = pickStripFrames(
      pictures([1000.5, 1000.6, 1006.4, 1006.6]),
      options({ lag: 0.5 }),
    );
    expect(picked.map((f) => f.stamp.t)).toEqual([1000.6, 1006.4]);
    // a negative lag (the reports are stamped later than the pictures) works the other way
    const early = pickStripFrames(
      pictures([999.9, 1000.1, 1005.9, 1006.1]),
      options({ lag: -0.1 }),
    );
    expect(early.map((f) => f.stamp.t)).toEqual([1000.1, 1005.9]);
  });

  it('are none where the reports cannot place them: fewer than two, so the position would be a guess', () => {
    const one = new PositionTrack();
    one.add(1000, 100);
    expect(pickStripFrames(pictures([1001, 1002]), options({ track: one }))).toEqual([]);
  });

  it('are thinned evenly, first and last included, where there are more than are wanted', () => {
    const stamps = Array.from({ length: 41 }, (_, i) => 1001 + i * 0.1);
    const picked = pickStripFrames(pictures(stamps), options({ max: 5 }));
    expect(picked.map((f) => f.stamp.t)).toEqual([1001, 1002, 1003, 1004, 1005]);
    expect(pickStripFrames(pictures(stamps), options({ max: 1 })).map((f) => f.stamp.t)).toEqual([
      1001,
    ]);
    expect(pickStripFrames(pictures(stamps), options({ max: 100 }))).toHaveLength(41);
    // the minimum distance from the start is a parameter
    expect(
      pickStripFrames(pictures([1000.1, 1000.5]), options({ minFromStart: 10 })).map(
        (f) => f.stamp.t,
      ),
    ).toEqual([1000.5]);
  });
});

describe('the scatter of a whole scan', () => {
  it("is the strips' figures taken together, weighted by the pictures each was worked out from", () => {
    // 10 pictures at 6 ms and 30 at 2 ms: sqrt((10·36 + 30·4) / 40) = sqrt(12) ms
    expect(
      pooledNoise([
        { ms: 6, count: 10 },
        { ms: 2, count: 30 },
      ]),
    ).toBeCloseTo(Math.sqrt(12), 9);
    expect(pooledNoise([{ ms: 7, count: 5 }])).toBeCloseTo(7, 9);
  });

  it('is nothing where no strip could say', () => {
    expect(pooledNoise([])).toBeNull();
  });
});
