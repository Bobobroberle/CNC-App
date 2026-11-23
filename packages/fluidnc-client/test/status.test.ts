import { describe, expect, it } from 'vitest';
import { isStatusReport, parseStatusReport, StatusTracker } from '../src';

describe('parseStatusReport', () => {
  it('parses a full FluidNC report', () => {
    const r = parseStatusReport(
      '<Run|MPos:10.000,20.500,-3.000,90.000|FS:1200,18000|Ln:42|Bf:15,96|Ov:110,50,100|A:SFM|Pn:XP|WCO:1,2,3,0|SD:12.5,/sd/job.nc>',
    );
    expect(r).toEqual({
      state: 'Run',
      mpos: [10, 20.5, -3, 90],
      feed: 1200,
      spindle: 18000,
      lineNumber: 42,
      buffer: { planner: 15, rx: 96 },
      overrides: { feed: 110, rapid: 50, spindle: 100 },
      accessories: { spindle: 'cw', flood: true, mist: true },
      pins: 'XP',
      wco: [1, 2, 3, 0],
      sd: { percent: 12.5, file: '/sd/job.nc' },
    });
  });

  it('parses sub states, WPos, F-only feed and unknown fields', () => {
    expect(parseStatusReport('<Hold:1|WPos:1,2,3|F:500|Foo:bar|Flag>')).toEqual({
      state: 'Hold',
      subState: 1,
      wpos: [1, 2, 3],
      feed: 500,
      extra: { Foo: 'bar', Flag: '' },
    });
    expect(parseStatusReport('<Door:>')).toEqual({ state: 'Door' });
  });

  it('fills defaults for short fields', () => {
    const r = parseStatusReport('<Idle|FS:|Bf:|Ov:|A:C|SD:50>')!;
    expect(r.feed).toBe(0);
    expect(r.spindle).toBe(0);
    expect(r.buffer).toEqual({ planner: 0, rx: 0 });
    expect(r.overrides).toEqual({ feed: 0, rapid: 100, spindle: 100 });
    expect(r.accessories).toEqual({ spindle: 'ccw', flood: false, mist: false });
    expect(r.sd).toEqual({ percent: 50, file: '' });
    expect(parseStatusReport('<Idle|A:F>')!.accessories?.spindle).toBe('off');
  });

  it('maps unknown states and rejects other lines', () => {
    expect(parseStatusReport('<Bogus>')?.state).toBe('Unknown');
    expect(parseStatusReport('<>')?.state).toBe('Unknown');
    expect(parseStatusReport('ok')).toBeNull();
    expect(isStatusReport('<Idle>')).toBe(true);
  });
});

describe('StatusTracker', () => {
  it('keeps WCO and overrides between reports and derives WPos', () => {
    const t = new StatusTracker();
    expect(t.status).toBeNull();
    t.update(
      parseStatusReport('<Idle|MPos:10,10,0|FS:0,0|WCO:5,5,-1|Ov:120,100,90|Bf:15,128>')!,
      1,
    );
    const s = t.update(parseStatusReport('<Run|MPos:11,10,0|FS:300,0|Ln:7|SD:5,/sd/a.nc>')!, 2);
    expect(s.wpos).toEqual([6, 5, 1]);
    expect(s.overrides).toEqual({ feed: 120, rapid: 100, spindle: 90 });
    expect(s.buffer).toEqual({ planner: 15, rx: 128 });
    expect(s.lineNumber).toBe(7);
    expect(s.sd?.file).toBe('/sd/a.nc');
    expect(s.updatedAt).toBe(2);
  });

  it('derives MPos from WPos and keeps the last position without one', () => {
    const t = new StatusTracker();
    t.update(parseStatusReport('<Idle|WPos:1,2,3|WCO:10,10,10>')!);
    expect(t.status?.mpos).toEqual([11, 12, 13]);
    const s = t.update(parseStatusReport('<Hold:0>')!);
    expect(s.mpos).toEqual([11, 12, 13]);
    expect(s.wpos).toEqual([1, 2, 3]);
    expect(s.subState).toBe(0);
    expect(s.feed).toBe(0);
  });

  it('treats missing A: and Pn: as inactive and handles short WCO', () => {
    const t = new StatusTracker();
    t.update(parseStatusReport('<Run|MPos:0,0,0,0|A:S|Pn:Z|WCO:1>')!);
    const s = t.update(parseStatusReport('<Run|MPos:1,1,1,1>')!);
    expect(s.accessories.spindle).toBe('off');
    expect(s.pins).toBe('');
    expect(s.wpos).toEqual([0, 1, 1, 1]);
    t.reset();
    expect(t.update(parseStatusReport('<Idle>')!).mpos).toEqual([]);
  });
});
