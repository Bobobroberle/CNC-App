import { describe, expect, it } from 'vitest';
import type { CameraCalibration } from '../src/lib/camera';
import {
  TRACE_FORMAT,
  TraceRecorder,
  packTrace,
  traceFileName,
  unpackTrace,
} from '../src/lib/scanTrace';
import { solveStrip } from '../src/lib/strips';
import { renderFrame } from './synthetic';

const SIZE = { width: 320, height: 240 };
const CAL: CameraCalibration = { offsetX: 0, offsetY: 0, pxPerMm: 8, rotation: 0 };

describe('a recording of a scan', () => {
  it('keeps what happened with the time it happened, and the pictures by name', () => {
    let clock = 1000;
    const rec = new TraceRecorder(() => clock, { pxPerMm: 8 }, 1e6, '2026-11-26T10:00:00.000Z');
    expect(rec.beginScan({ minX: 0 }, 'strips', { precise: false })).toBe(1);
    clock += 120;
    rec.report('Jog', [10.5, 20, -3]);
    clock += 30;
    rec.stamp();
    rec.gap(41.4);
    rec.note('jog-send', { target: 300, feed: 2400 });
    expect(
      rec.addFrame(
        { kind: 'run', t: rec.t(), width: 2, height: 1, k: 1, codec: 'rgba' },
        new Uint8Array(8),
      ),
    ).toBe(true);
    expect(
      rec.addFrame(
        {
          kind: 'anchor',
          t: rec.t(),
          width: 2,
          height: 1,
          k: 0.5,
          codec: 'jpeg',
          spindle: { x: 1, y: 2 },
        },
        new Uint8Array(5),
      ),
    ).toBe(true);
    const f = rec.snapshot();
    expect(f.reports).toEqual([{ t: 120, state: 'Jog', mpos: [10.5, 20, -3] }]);
    expect(f.stamps).toEqual([{ t: 150, scan: 1 }]);
    expect(f.gaps).toEqual([[150, 41]]);
    expect(f.events[0]).toMatchObject({ kind: 'jog-send', t: 150, scan: 1, target: 300 });
    expect(f.frames.map((x) => x.file)).toEqual(['run/00001.rgba', 'anchor/00001.jpg']);
    expect(rec.bytes).toBe(13);
    expect(rec.scans).toBe(1);
  });

  it('keeps both clocks of a report and of a picture: when the page got it and the stamp the Pi gave it', () => {
    let clock = 5000;
    const rec = new TraceRecorder(() => clock, {}, 1e6, '2026-11-26T10:00:00.000Z');
    rec.beginScan({ minX: 0 }, 'strips');
    clock += 200;
    rec.report('Jog', [1, 2, 3], { mono: 7_200_123_456.789, wall: 1_779_807_200_123 });
    // a report that came without a stamp (a relay that was not asked) has none in the file – and so does an older file
    rec.report('Jog', [2, 2, 3], null);
    rec.report('Idle', [3, 2, 3]);
    clock += 50;
    // `at` turns a moment on the page's clock into the recording's
    expect(rec.at(5300)).toBe(300);
    rec.picture(5300, { domain: 'mono', t: 7_200_123.4, source: 'x-ustreamer-grab-time' });
    const f = rec.snapshot();
    expect(f.reports[0]).toEqual({
      t: 200,
      state: 'Jog',
      mpos: [1, 2, 3],
      stamp: { mono: 7_200_123_456.789, wall: 1_779_807_200_123 },
    });
    expect(f.reports[1]).toEqual({ t: 200, state: 'Jog', mpos: [2, 2, 3] });
    expect(f.reports[2]).toEqual({ t: 200, state: 'Idle', mpos: [3, 2, 3] });
    expect(f.pictures).toEqual([
      {
        t: 300,
        scan: 1,
        stamp: { domain: 'mono', t: 7_200_123.4, source: 'x-ustreamer-grab-time' },
      },
    ]);
    // and the file with them is still the file: packed, unpacked, version unchanged
    const back = unpackTrace(packTrace(f, rec.files))!;
    expect(back.file.pictures).toEqual(f.pictures);
    expect(back.file.reports[0]!.stamp).toEqual(f.reports[0]!.stamp);
    expect(back.file.version).toBe(1);
  });

  it("says which clock the scans ran on: in the meta and in each scan's options, and `mixed` where they differ", () => {
    const rec = new TraceRecorder(() => 0, {});
    rec.beginScan({}, 'strips');
    rec.setClock('pi');
    rec.beginScan({}, 'strips');
    rec.setClock('pi');
    expect(rec.snapshot().meta.clock).toBe('pi');
    rec.beginScan({}, 'strips', { tempo: 'fast' });
    rec.setClock('browser');
    const f = rec.snapshot();
    expect(f.meta.clock).toBe('mixed');
    expect(f.scans.map((x) => x.options.clock)).toEqual(['pi', 'pi', 'browser']);
    // what the scan was begun with stays
    expect(f.scans[2]!.options.tempo).toBe('fast');
    // before any scan there is nothing to put it on, and the meta says it all the same
    const bare = new TraceRecorder(() => 0, {});
    bare.setClock('browser');
    expect(bare.snapshot().meta.clock).toBe('browser');
  });

  it('is full at its cap: more pictures are counted and left out, the numbers stay', () => {
    const rec = new TraceRecorder(() => 0, {}, 10);
    expect(
      rec.addFrame(
        { kind: 'dense', t: 0, width: 1, height: 1, k: 1, codec: 'jpeg' },
        new Uint8Array(8),
      ),
    ).toBe(true);
    expect(
      rec.addFrame(
        { kind: 'dense', t: 1, width: 1, height: 1, k: 1, codec: 'jpeg' },
        new Uint8Array(8),
      ),
    ).toBe(false);
    rec.report('Idle', [0, 0, 0]);
    expect(rec.snapshot().dropped).toBe(1);
    expect(rec.snapshot().reports).toHaveLength(1);
  });

  it('is packed into one zip and read back the same – and not read from anything else', () => {
    const rec = new TraceRecorder(() => 5, { a: 1 }, 1e6, '2026-11-26T10:00:00.000Z');
    rec.beginScan(null, 'stops');
    rec.addFrame(
      { kind: 'rest', t: 1, width: 1, height: 1, k: 1, codec: 'rgba' },
      Uint8Array.from([1, 2, 3, 4]),
    );
    const zip = packTrace(rec.snapshot(), rec.files);
    const back = unpackTrace(zip)!;
    expect(back.file).toEqual(rec.snapshot());
    expect([...back.files.get('rest/00001.rgba')!]).toEqual([1, 2, 3, 4]);
    expect(back.file.format).toBe(TRACE_FORMAT);
    expect(unpackTrace(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(unpackTrace(packTrace({ ...rec.snapshot(), version: 99 as 1 }, rec.files))).toBeNull();
    expect(
      unpackTrace(packTrace({ ...rec.snapshot(), format: 'x' as typeof TRACE_FORMAT }, rec.files)),
    ).toBeNull();
  });

  it('is named by the day and the time', () => {
    expect(traceFileName(new Date(2026, 10, 26, 14, 3, 5))).toBe(
      'lowrider-scan-20261126-140305.zip',
    );
  });

  it('carries everything the solver was given: worked through from the file alone it gives the same answer', () => {
    // a strip, as the app would take it: anchors at rest and pictures on the run, the clock a few mm off
    const truth = (n: number) => 100 + n * 10;
    const frames = Array.from({ length: 6 }, (_, n) => ({
      frame: renderFrame(CAL, { x: truth(n + 1), y: 80 }, SIZE),
      k: 1,
      predicted: truth(n + 1) + 3.5,
    }));
    const start = { frame: renderFrame(CAL, { x: 100, y: 80 }, SIZE), k: 1, along: 100 };
    const end = { frame: renderFrame(CAL, { x: 170, y: 80 }, SIZE), k: 1, along: 170 };
    const options = { cal: CAL, axis: 'x' as const, across: 80, speed: 40 };
    const direct = solveStrip(start, end, frames, options);

    const rec = new TraceRecorder(() => 0, { cal: CAL });
    rec.beginScan(null, 'strips');
    const keep = (kind: 'anchor' | 'run', f: { frame: { data: Uint8ClampedArray } }) =>
      rec.addFrame(
        { kind, t: 0, width: SIZE.width, height: SIZE.height, k: 1, codec: 'rgba' },
        new Uint8Array(f.frame.data),
      );
    keep('anchor', start);
    keep('anchor', end);
    frames.forEach((f) => keep('run', f));
    rec.note('solved', {
      axis: 'x',
      across: 80,
      speed: 40,
      anchors: [
        { file: 'anchor/00001.rgba', along: 100 },
        { file: 'anchor/00002.rgba', along: 170 },
      ],
      frames: frames.map((f, i) => ({
        file: `run/${String(i + 1).padStart(5, '0')}.rgba`,
        predicted: f.predicted,
      })),
    });

    const back = unpackTrace(packTrace(rec.snapshot(), rec.files))!;
    const event = back.file.events.find((e) => e.kind === 'solved')!;
    const load = (file: string) => ({
      data: new Uint8ClampedArray(back.files.get(file)!),
      width: SIZE.width,
      height: SIZE.height,
    });
    const anchors = event.anchors as { file: string; along: number }[];
    const again = solveStrip(
      { frame: load(anchors[0]!.file), k: 1, along: anchors[0]!.along },
      { frame: load(anchors[1]!.file), k: 1, along: anchors[1]!.along },
      (event.frames as { file: string; predicted: number }[]).map((f) => ({
        frame: load(f.file),
        k: 1,
        predicted: f.predicted,
      })),
      { ...options, speed: event.speed as number },
    );
    expect(again).toEqual(direct);
    expect(direct.placed).toBeGreaterThanOrEqual(5);
  });
});
