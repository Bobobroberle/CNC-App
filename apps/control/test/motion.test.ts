import { describe, expect, it, vi } from 'vitest';
import { CompanionClient, companionBase, relayUrl, sensorStreamUrl } from '../src/lib/companion';
import {
  continuousJogTarget,
  moveToCommands,
  stickStep,
  frameLines,
  safeLift,
  spindleRestore,
  toolAtLine,
  UNHOMED_JOG_MM,
} from '../src/lib/motion';
import { listOf, loadJson, newId, saveJson } from '../src/lib/persist';
import { DEFAULT_PARSER_STATE } from '@lowrider/fluidnc-client';

describe('motion helpers', () => {
  it('lifts to a machine height only when homed', () => {
    expect(safeLift(true, 1)).toEqual(['G53 G0 Z1']);
    expect(safeLift(false, 1, 15)).toEqual(['G91 G0 Z15', 'G90']);
  });

  it('finds the tool of a tool change', () => {
    const lines = ['T1 M6', 'G0 X1', 'T2 (next)', 'M6 ; change', '(T9 comment) M6'];
    expect(toolAtLine(lines, 0)).toBe(1);
    expect(toolAtLine(lines, 3)).toBe(2);
    expect(toolAtLine(lines, 4)).toBe(2);
    expect(toolAtLine(['M6'], 0)).toBeNull();
    expect(toolAtLine(lines, 99)).toBe(2);
  });

  it('restores a running spindle', () => {
    expect(spindleRestore(null)).toBeNull();
    expect(spindleRestore(DEFAULT_PARSER_STATE)).toBeNull();
    expect(spindleRestore({ ...DEFAULT_PARSER_STATE, spindle: 'cw', speed: 0 })).toBeNull();
    expect(spindleRestore({ ...DEFAULT_PARSER_STATE, spindle: 'cw', speed: 18000 })).toBe(
      'S18000 M3',
    );
    expect(spindleRestore({ ...DEFAULT_PARSER_STATE, spindle: 'ccw', speed: 9000 })).toBe(
      'S9000 M4',
    );
  });

  it('frames at a machine height or above the job', () => {
    const b = { min: { x: 0, y: 0, z: -3, a: 0 }, max: { x: 10, y: 20, z: 2, a: 0 } };
    expect(frameLines(b, { homed: true, safeMachineZ: 1, feed: 2000 })).toContain('G53 G0 Z1');
    const unhomed = frameLines(b, { homed: false, safeMachineZ: 1, feed: 2000 });
    expect(unhomed).toContain('G90 G0 Z7');
    expect(unhomed.some((l) => l.startsWith('G53'))).toBe(false);
    const low = { ...b, max: { ...b.max, z: -1 } };
    expect(frameLines(low, { homed: false, safeMachineZ: 1, feed: 2000 })).toContain('G90 G0 Z5');
  });

  it('jogs continuously to the travel end once homed', () => {
    const r = { min: 3, max: 1223 };
    expect(continuousJogTarget(100, 1, r, true)).toEqual({ mode: 'machine', value: 1223 });
    expect(continuousJogTarget(100, -1, r, true)).toEqual({ mode: 'machine', value: 3 });
    expect(continuousJogTarget(1223, 1, r, true)).toBeNull();
    // Not homed (or no soft limits): a short relative move, so a broken link cannot run it out far.
    expect(continuousJogTarget(100, -1, r, false)).toEqual({ mode: 'relative', value: -200 });
    expect(continuousJogTarget(100, 1, r, false, UNHOMED_JOG_MM.z)).toEqual({
      mode: 'relative',
      value: 50,
    });
    expect(continuousJogTarget(100, 1, { min: 0, max: 80 }, false)).toEqual({
      mode: 'relative',
      value: 80,
    });
  });
});

describe('companion client', () => {
  it('builds addresses', () => {
    expect(companionBase('')).toBeNull();
    expect(companionBase('pi.local')).toBe('http://pi.local:8080');
    expect(companionBase('192.168.1.5:9000/')).toBe('http://192.168.1.5:9000');
    expect(companionBase('https://pi.example')).toBe('https://pi.example');
    expect(relayUrl('http://pi:8080')).toBe('ws://pi:8080/fluidnc');
    expect(sensorStreamUrl('https://pi')).toBe('wss://pi/api/sensors/stream');
  });

  it('calls the REST API', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push([String(url), init]);
      if (String(url).endsWith('/missing')) return new Response('', { status: 404 });
      if (String(url).includes('/api/jobs/a.nc') && !init?.method) return new Response('G0 X1');
      return new Response(JSON.stringify({ ok: true }));
    }) as unknown as typeof fetch;
    const c = new CompanionClient('http://pi:8080', f);
    expect(await c.health()).toEqual({ ok: true });
    await c.list('tools');
    await c.put('tools', { id: 't 1' });
    await c.putAll('tools', [{ id: 'a' }]);
    await c.remove('tools', 'a');
    await c.notify('job-done', 'Fertig', 'x');
    await c.saveJob('a.nc', 'G0');
    await c.jobs();
    expect(await c.job('a.nc')).toBe('G0 X1');
    expect(calls.map(([u, i]) => `${i?.method ?? 'GET'} ${u}`)).toEqual([
      'GET http://pi:8080/api/health',
      'GET http://pi:8080/api/library/tools',
      'PUT http://pi:8080/api/library/tools/t%201',
      'POST http://pi:8080/api/library/tools',
      'DELETE http://pi:8080/api/library/tools/a',
      'POST http://pi:8080/api/notify',
      'PUT http://pi:8080/api/jobs/a.nc',
      'GET http://pi:8080/api/jobs',
      'GET http://pi:8080/api/jobs/a.nc',
    ]);
    const bad = new CompanionClient(
      'http://pi:8080/missing'.replace('/missing', ''),
      async () => new Response('', { status: 500 }),
    );
    await expect(bad.health()).rejects.toThrow('HTTP 500');
    await expect(bad.job('x')).rejects.toThrow('HTTP 500');
  });
});

describe('persistence', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
  };

  it('loads, validates and falls back', () => {
    const s = memory();
    const num = (v: unknown) => (typeof v === 'number' ? v : null);
    expect(loadJson(s, 'k', num, 7)).toBe(7);
    saveJson(s, 'k', 3);
    expect(loadJson(s, 'k', num, 7)).toBe(3);
    saveJson(s, 'k', 'x');
    expect(loadJson(s, 'k', num, 7)).toBe(7);
    s.setItem('k', '{');
    expect(loadJson(s, 'k', num, 7)).toBe(7);
    expect(loadJson(undefined, 'k', num, 7)).toBe(7);
    saveJson(undefined, 'k', 1);
    saveJson(
      {
        setItem: () => {
          throw new Error('full');
        },
      },
      'k',
      1,
    );
  });

  it('validates lists and makes ids', () => {
    const nums = listOf((v) => (typeof v === 'number' ? v : null));
    expect(nums([1, 2])).toEqual([1, 2]);
    expect(nums([1, 'a'])).toBeNull();
    expect(nums('x')).toBeNull();
    expect(newId('tool')).toMatch(/^tool-/);
    expect(newId('a')).not.toBe(newId('a'));
  });
});

describe('drive here and joystick', () => {
  const s = {
    homed: true,
    softLimits: true,
    travel: { x: { min: 3, max: 1223 }, y: { min: 3, max: 2443 } },
    lift: true,
    safeMachineZ: 1,
    feedXY: 3000,
    feedZ: 600,
  };

  it('lifts and moves to a clamped machine position', () => {
    expect(moveToCommands({ x: 500, y: 600 }, { x: 100, y: 100 }, s)).toEqual({
      lines: ['$J=G53 G90 G21 Z1 F600', '$J=G53 G90 G21 X500 Y600 F3000'],
      limited: false,
    });
    expect(moveToCommands({ x: -50, y: 3000 }, { x: 100, y: 100 }, { ...s, lift: false })).toEqual({
      lines: ['$J=G53 G90 G21 X3 Y2443 F3000'],
      limited: true,
    });
    expect(
      moveToCommands({ x: -50, y: 50 }, { x: 0, y: 0 }, { ...s, softLimits: false })!.lines[1],
    ).toBe('$J=G53 G90 G21 X-50 Y50 F3000');
    expect(
      moveToCommands({ x: 100, y: 100 }, { x: 100, y: 100 }, { ...s, lift: false }),
    ).toBeNull();
    expect(moveToCommands({ x: 100, y: 100 }, { x: 100, y: 100 }, s)!.lines).toEqual([
      '$J=G53 G90 G21 Z1 F600',
    ]);
  });

  it('moves relatively without homing and never lifts', () => {
    const unhomed = { ...s, homed: false };
    expect(moveToCommands({ x: 110, y: 95 }, { x: 100, y: 100 }, unhomed)).toEqual({
      lines: ['$J=G91 G21 X10 Y-5 F3000'],
      limited: false,
    });
    expect(moveToCommands({ x: 100, y: 100 }, { x: 100, y: 100 }, unhomed)).toBeNull();
  });

  it('turns stick deflection into short jogs', () => {
    expect(stickStep(0.1, 0, 0.1, { x: 0, y: 0 }, s)).toBeNull();
    // full deflection: 3000 mm/min for 0.1 s = 5 mm
    expect(stickStep(1, 0, 0.1, { x: 100, y: 100 }, s)).toEqual({
      line: '$J=G53 G90 G21 X105 Y100 F3000',
      to: { x: 105, y: 100 },
    });
    // half deflection: a quarter of the feed
    expect(stickStep(0, -0.5, 0.1, { x: 100, y: 100 }, { ...s, homed: false })).toEqual({
      line: '$J=G91 G21 X0 Y-1.25 F750',
      to: { x: 100, y: 98.75 },
    });
    expect(stickStep(-1, 0, 0.1, { x: 3, y: 100 }, s)).toBeNull();
  });
});
