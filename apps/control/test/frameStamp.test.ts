import { describe, expect, it, vi } from 'vitest';
import {
  domainFits,
  isOnline,
  releaseDrawable,
  stampOffsetS,
  stampOf,
  STAMP_WINDOW_S,
  type Drawable,
  type FrameStamp,
} from '../src/lib/frameStamp';

// what a Pi that has been up for 34 hours says (seconds, as ustreamer prints them) – and its real time
const MONO_S = '123456.789000';
const WALL_S = '1779800000.123000';
/** A report stamp in ms, as the relay sends it, at the same moments */
const clock = { mono: 123456789.0 + 40, wall: 1779800000123 + 40 };

describe('the stamp of a picture', () => {
  it('prefers the grab time of master, then that of the older versions, then the end of the grab, then the time of sending', () => {
    const all = {
      'x-ustreamer-grab-begin-time': '100.100000',
      'x-ustreamer-grab-time': '200.200000',
      'x-ustreamer-grab-end-time': '300.300000',
      'x-timestamp': '1779800000.400000',
    };
    expect(stampOf(all)).toEqual({
      domain: 'mono',
      t: 100.1,
      source: 'x-ustreamer-grab-begin-time',
    });
    const { 'x-ustreamer-grab-begin-time': _b, ...noBegin } = all;
    expect(stampOf(noBegin)).toEqual({ domain: 'mono', t: 200.2, source: 'x-ustreamer-grab-time' });
    const { 'x-ustreamer-grab-time': _g, ...noGrab } = noBegin;
    expect(stampOf(noGrab)).toEqual({
      domain: 'mono',
      t: 300.3,
      source: 'x-ustreamer-grab-end-time',
    });
    const { 'x-ustreamer-grab-end-time': _e, ...onlyWall } = noGrab;
    expect(stampOf(onlyWall)).toEqual({ domain: 'wall', t: 1779800000.4, source: 'x-timestamp' });
    expect(stampOf({})).toBeNull();
    expect(stampOf({ 'content-type': 'image/jpeg' })).toBeNull();
  });

  it('reads the headers in seconds, with the magnitudes of a real Pi', () => {
    expect(stampOf({ 'x-ustreamer-grab-time': MONO_S })).toEqual({
      domain: 'mono',
      t: 123456.789,
      source: 'x-ustreamer-grab-time',
    });
    // a time of 1.78e9 s keeps its milliseconds
    expect(stampOf({ 'x-timestamp': WALL_S })!.t).toBe(1779800000.123);
    expect(stampOf({ 'x-timestamp': ' 5.5 ' })!.t).toBe(5.5);
    expect(stampOf({ 'x-timestamp': '12' })!.t).toBe(12);
  });

  it('passes over a header that is no positive number – a driver that gave no time says 0.000000', () => {
    const second = {
      'x-ustreamer-grab-begin-time': '0.000000',
      'x-ustreamer-grab-end-time': '77.500000',
    };
    expect(stampOf(second)).toEqual({
      domain: 'mono',
      t: 77.5,
      source: 'x-ustreamer-grab-end-time',
    });
    for (const bad of [
      '0',
      '0.000000',
      '',
      'nan',
      'NaN',
      'inf',
      '-5',
      '+5',
      '1e3',
      '12 34',
      'abc',
      '1.',
      '.5',
      '1,5',
    ]) {
      expect(stampOf({ 'x-ustreamer-grab-time': bad })).toBeNull();
      expect(stampOf({ 'x-ustreamer-grab-time': bad, 'x-timestamp': '9.5' })).toEqual({
        domain: 'wall',
        t: 9.5,
        source: 'x-timestamp',
      });
    }
    expect(stampOf({ 'x-timestamp': '9'.repeat(40) })).toBeNull();
  });

  it('tells a placeholder from a picture of the camera', () => {
    expect(isOnline({})).toBe(true);
    expect(isOnline({ 'x-ustreamer-online': 'true' })).toBe(true);
    expect(isOnline({ 'x-ustreamer-online': 'false' })).toBe(false);
    expect(isOnline({ 'x-ustreamer-online': ' False ' })).toBe(false);
  });
});

describe('whether picture and reports are in one clock', () => {
  const mono = (t: number): FrameStamp => ({ domain: 'mono', t, source: 'x-ustreamer-grab-time' });
  const wall = (t: number): FrameStamp => ({ domain: 'wall', t, source: 'x-timestamp' });

  it('converts the report stamp (ms) to the picture stamp (s) in one place', () => {
    // the picture was taken 40 ms before the report
    expect(stampOffsetS(mono(123456.789), clock)).toBeCloseTo(-0.04, 6);
    expect(stampOffsetS(wall(1779800000.123), clock)).toBeCloseTo(-0.04, 6);
    // the right clock is chosen by the domain
    expect(stampOffsetS(mono(1779800000.123), clock)).toBeGreaterThan(1.7e9);
    expect(stampOffsetS(wall(123456.789), clock)).toBeLessThan(-1.7e9);
  });

  it('fits within the window around the report, in both clocks and both directions', () => {
    expect(domainFits(mono(123456.789), clock)).toBe(true);
    expect(domainFits(wall(1779800000.123), clock)).toBe(true);
    // late by a second, early by two
    expect(domainFits(mono(123456.829 + 1), clock)).toBe(true);
    expect(domainFits(mono(123456.829 - 2), clock)).toBe(true);
    // the window is 3 s by default and its edge counts
    expect(STAMP_WINDOW_S).toBe(3);
    expect(domainFits(mono(123456.829 + 3), clock)).toBe(true);
    expect(domainFits(mono(123456.829 + 3.01), clock)).toBe(false);
    expect(domainFits(mono(123456.829 - 3.01), clock)).toBe(false);
    expect(domainFits(mono(123456.829 + 3.01), clock, 5)).toBe(true);
    expect(domainFits(mono(123456.829 + 0.2), clock, 0.1)).toBe(false);
  });

  it('does not fit where the driver stamps with another clock', () => {
    // a mono stamp that is really the real-time clock (decades off), or the other way round
    expect(domainFits(mono(1779800000.123), clock)).toBe(false);
    expect(domainFits(wall(123456.789), clock)).toBe(false);
    // the Pi's clock was set by an hour meanwhile
    expect(domainFits(wall(1779800000.123 + 3600), clock)).toBe(false);
  });

  it('does not fit a clock that is no number', () => {
    expect(domainFits(mono(1), { mono: NaN, wall: 1 })).toBe(false);
    expect(domainFits(wall(1), { mono: 1, wall: Infinity })).toBe(false);
  });
});

describe('releasing decoded pictures', () => {
  it('closes what can be closed and leaves canvases and nothing alone', () => {
    const close = vi.fn();
    releaseDrawable({ close } as unknown as Drawable);
    expect(close).toHaveBeenCalledTimes(1);
    releaseDrawable(null);
    releaseDrawable({ width: 1 } as unknown as Drawable);
    releaseDrawable({ close: 5 } as unknown as Drawable);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
