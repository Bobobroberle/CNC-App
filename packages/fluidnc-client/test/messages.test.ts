import { describe, expect, it } from 'vitest';
import {
  ALARM_CODES,
  alarmName,
  Emitter,
  errorName,
  overrideBytes,
  parseMessage,
  rapidOverrideByte,
  Realtime,
} from '../src';

describe('parseMessage', () => {
  it('classifies acknowledgements, errors and alarms', () => {
    expect(parseMessage('ok\r')).toEqual({ type: 'ok' });
    expect(parseMessage('error:22')).toEqual({ type: 'error', code: 22 });
    expect(parseMessage('ALARM:1')).toEqual({ type: 'alarm', code: 1 });
  });

  it('classifies status reports and welcome banners', () => {
    expect(parseMessage('<Idle|MPos:0,0,0>')).toMatchObject({
      type: 'status',
      report: { state: 'Idle' },
    });
    expect(parseMessage("Grbl 3.7 [FluidNC v3.7.12 (wifi) '$' for help]")).toMatchObject({
      type: 'welcome',
      version: 'v3.7.12',
    });
    expect(parseMessage("Grbl 1.1h ['$' for help]")).toMatchObject({
      type: 'welcome',
      version: '1.1h',
    });
  });

  it('classifies bracketed messages', () => {
    expect(parseMessage('[MSG:INFO: Homing done]')).toEqual({
      type: 'message',
      level: 'INFO',
      text: 'Homing done',
    });
    expect(parseMessage('[MSG:Caution: Unlocked]')).toEqual({
      type: 'message',
      level: 'Caution',
      text: 'Unlocked',
    });
    expect(parseMessage('[MSG:Homed:XYZ]')).toEqual({ type: 'homed', axes: 'XYZ' });
    expect(parseMessage('[MSG:Pgm End]')).toEqual({
      type: 'message',
      level: 'INFO',
      text: 'Pgm End',
    });
    expect(parseMessage('[GC:G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0]')).toEqual({
      type: 'parserState',
      words: ['G0', 'G54', 'G17', 'G21', 'G90', 'G94', 'M5', 'M9', 'T0', 'F0', 'S0'],
    });
    expect(parseMessage('[G54:-610.000,-1205.000,-50.000,0.000]')).toMatchObject({
      type: 'offset',
      name: 'G54',
      values: [-610, -1205, -50, 0],
    });
    expect(parseMessage('[PRB:1.000,2.000,-3.000:1]')).toMatchObject({
      type: 'offset',
      name: 'PRB',
      values: [1, 2, -3],
      text: '1.000,2.000,-3.000:1',
    });
    expect(parseMessage('[echo: G0X1]')).toEqual({ type: 'echo', text: 'G0X1' });
    expect(parseMessage('[VER:3.7]')).toEqual({ type: 'text', text: '[VER:3.7]' });
  });

  it('classifies settings and plain text', () => {
    expect(parseMessage('$Report/Interval=200')).toEqual({
      type: 'setting',
      key: 'Report/Interval',
      value: '200',
    });
    expect(parseMessage('$10=1')).toEqual({ type: 'setting', key: '10', value: '1' });
    expect(parseMessage('hello')).toEqual({ type: 'text', text: 'hello' });
  });
});

describe('codes', () => {
  it('names alarms and errors', () => {
    expect(alarmName(1)).toBe('HardLimit');
    expect(alarmName(99)).toBe('Unknown');
    expect(errorName(22)).toBe('GcodeUndefinedFeedRate');
    expect(errorName(999)).toBe('Unknown');
    expect(Object.keys(ALARM_CODES).length).toBeGreaterThan(10);
  });
});

describe('overrides', () => {
  it('steps the feed override with the fewest bytes', () => {
    const r = Realtime;
    expect(overrideBytes('feed', 100, 120)).toEqual([r.FeedOverridePlus10, r.FeedOverridePlus10]);
    expect(overrideBytes('feed', 100, 87)).toEqual([
      r.FeedOverrideMinus10,
      r.FeedOverrideMinus1,
      r.FeedOverrideMinus1,
      r.FeedOverrideMinus1,
    ]);
    expect(overrideBytes('feed', 180, 101)).toEqual([r.FeedOverrideReset, r.FeedOverridePlus1]);
    expect(overrideBytes('feed', 100, 100)).toEqual([]);
    expect(overrideBytes('feed', 100, 500)).toHaveLength(10);
    expect(overrideBytes('feed', 15, 1)).toEqual([
      r.FeedOverrideMinus1,
      r.FeedOverrideMinus1,
      r.FeedOverrideMinus1,
      r.FeedOverrideMinus1,
      r.FeedOverrideMinus1,
    ]);
  });

  it('uses spindle bytes and rapid levels', () => {
    expect(overrideBytes('spindle', 100, 111)).toEqual([
      Realtime.SpindleOverridePlus10,
      Realtime.SpindleOverridePlus1,
    ]);
    expect(rapidOverrideByte(100)).toBe(0x95);
    expect(rapidOverrideByte(50)).toBe(0x96);
    expect(rapidOverrideByte(25)).toBe(0x97);
  });
});

describe('Emitter', () => {
  class Test extends Emitter<{ ping: number }> {
    fire(n: number) {
      this.emit('ping', n);
    }
  }
  it('adds and removes listeners', () => {
    const t = new Test();
    const got: number[] = [];
    const off = t.on('ping', (n) => got.push(n));
    t.on('ping', (n) => got.push(n * 10));
    t.fire(1);
    off();
    t.fire(2);
    expect(got).toEqual([1, 10, 20]);
  });
});
