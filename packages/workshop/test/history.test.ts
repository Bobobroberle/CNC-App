import { describe, expect, it } from 'vitest';
import { DeviationRecorder, estimateAccuracy, wearTrend, type JobRecord } from '../src';

const record = (i: number, mean: number, over: Partial<JobRecord> = {}): JobRecord => ({
  id: `j${i}`,
  file: 'a.nc',
  startedAt: i * 1000,
  endedAt: i * 1000 + 600,
  duration: 600,
  estimate: 500,
  tools: [1],
  result: 'done',
  alarms: [],
  feedOverride: 100,
  deviation: { max: mean * 2, mean, p95: mean * 1.5, samples: 10 },
  trend: [],
  ...over,
});

describe('DeviationRecorder', () => {
  it('is empty at first', () => {
    const r = new DeviationRecorder();
    expect(r.stats()).toBeNull();
    expect(r.trend()).toEqual([]);
  });

  it('averages per bucket and computes stats', () => {
    const r = new DeviationRecorder(10, 1);
    r.add(0.2, 0.1);
    r.add(0.8, 0.3);
    r.add(3.5, 0.5);
    expect(r.trend()).toEqual([
      [0, 0.2],
      [3, 0.5],
    ]);
    expect(r.stats()).toEqual({ max: 0.5, mean: 0.3, p95: 0.5, samples: 3 });
  });

  it('halves its resolution instead of growing', () => {
    const r = new DeviationRecorder(4, 1);
    for (let s = 0; s < 4; s++) r.add(s, s);
    r.add(4, 4);
    expect(r.trend()).toEqual([
      [0, 0.5],
      [2, 2.5],
      [4, 4],
    ]);
    r.add(30, 1);
    expect(r.trend().length).toBeLessThanOrEqual(4);
  });

  it('merges an odd number of buckets', () => {
    const r = new DeviationRecorder(3, 1);
    r.add(0, 1);
    r.add(1, 1);
    r.add(2, 1);
    r.add(3, 3);
    expect(r.trend()).toEqual([
      [0, 1],
      [2, 2],
    ]);
  });
});

describe('wearTrend', () => {
  it('needs five measured jobs', () => {
    expect(wearTrend([1, 2, 3, 4].map((i) => record(i, 0.1)))).toBeNull();
    const mixed = [
      ...[1, 2, 3, 4].map((i) => record(i, 0.1)),
      record(5, 0.1, { result: 'aborted' }),
      record(6, 0.1, { deviation: null }),
    ];
    expect(wearTrend(mixed)).toBeNull();
  });

  it('is calm on a steady machine', () => {
    const t = wearTrend([5, 1, 3, 2, 4].map((i) => record(i, 0.1)))!;
    expect(t.slopePer10Jobs).toBeCloseTo(0);
    expect(t.warning).toBe(false);
  });

  it('warns about a drifting machine', () => {
    const t = wearTrend([0.1, 0.1, 0.12, 0.16, 0.22, 0.3].map((m, i) => record(i, m)))!;
    expect(t.slopePer10Jobs).toBeGreaterThan(0);
    expect(t.baseline).toBeCloseTo(0.1067, 3);
    expect(t.latest).toBe(0.3);
    expect(t.warning).toBe(true);
  });
});

describe('estimateAccuracy', () => {
  it('reports the mean error of finished jobs', () => {
    expect(estimateAccuracy([])).toBeNull();
    expect(estimateAccuracy([record(1, 0.1, { estimate: 0 })])).toBeNull();
    expect(
      estimateAccuracy([
        record(1, 0.1),
        record(2, 0.1, { duration: 500 }),
        record(3, 0.1, { duration: 0 }),
      ]),
    ).toBeCloseTo(10);
  });
});
