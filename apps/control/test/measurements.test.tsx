// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MeasurementLog, summaryOf } from '../src/components/MeasurementLog';
import {
  MEASUREMENT_KINDS,
  MEASUREMENT_LIMIT,
  mergeMeasurements,
  newMeasurement,
  validMeasurement,
  type Measurement,
} from '../src/lib/measurements';
import { useCamera } from '../src/store/camera';
import { useMachine } from '../src/store/machine';
import {
  resetMeasurementExchange,
  syncMeasurements,
  syncMeasurementsDue,
  useMeasurements,
} from '../src/store/measurements';
import { DEFAULT_SETTINGS, useWorkshop } from '../src/store/workshop';

const entry = (
  at: string,
  kind: Measurement['kind'] = 'camera-offset',
  extra = '',
): Measurement => ({
  id: `${at}-${kind}${extra}`,
  at,
  kind,
  values: { offsetX: 12.5, offsetY: -3 },
});

describe('an entry of the log', () => {
  it('gets its id from the time and the kind, and a counter where two come in one millisecond', () => {
    const now = new Date('2026-11-24T10:00:00.000Z');
    const a = newMeasurement('camera-offset', { offsetX: 1 }, new Set(), now);
    expect(a).toEqual({
      id: '2026-11-24T10:00:00.000Z-camera-offset',
      at: '2026-11-24T10:00:00.000Z',
      kind: 'camera-offset',
      values: { offsetX: 1 },
    });
    const b = newMeasurement('camera-offset', {}, new Set([a.id]), now);
    expect(b.id).toBe(`${a.id}-2`);
    const c = newMeasurement('camera-offset', {}, new Set([a.id, b.id]), now);
    expect(c.id).toBe(`${a.id}-3`);
    // another kind in the same millisecond has its own id
    expect(newMeasurement('machine-tilt', {}, new Set([a.id]), now).id).toBe(
      '2026-11-24T10:00:00.000Z-machine-tilt',
    );
  });

  it('is accepted when it is well-formed – and is not when it comes from a Pi with something else on it', () => {
    const good = entry('2026-11-24T10:00:00.000Z');
    expect(validMeasurement(good)).toEqual(good);
    expect(
      validMeasurement({ ...good, values: { a: 'text', b: true, c: null, d: 1.5 } })?.values,
    ).toEqual({
      a: 'text',
      b: true,
      c: null,
      d: 1.5,
    });
    // every kind the app writes
    for (const kind of MEASUREMENT_KINDS)
      expect(validMeasurement({ ...good, kind })).not.toBeNull();
    const many = Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`k${i}`, i]));
    for (const bad of [
      null,
      'x',
      [],
      { ...good, id: '' },
      { ...good, id: 'x'.repeat(121) },
      { ...good, id: 5 },
      { ...good, at: 'yesterday' },
      { ...good, at: 5 },
      // a time that sorts wrongly as text: only what `toISOString` writes is one
      { ...good, at: 'Mon, 01 Jan 2001 00:00:00 GMT' },
      { ...good, at: '2026-11-24 10:00:00' },
      { ...good, at: '2026-11-24T10:00:00+01:00' },
      { ...good, kind: 'teleport' },
      { ...good, values: null },
      { ...good, values: [1] },
      { ...good, values: many },
      { ...good, values: { ['n'.repeat(61)]: 1 } },
      { ...good, values: { a: Number.NaN } },
      { ...good, values: { a: Infinity } },
      { ...good, values: { a: 'x'.repeat(401) } },
      { ...good, values: { a: { nested: 1 } } },
      { ...good, values: { a: [1] } },
    ]) {
      expect(validMeasurement(bad), JSON.stringify(bad)?.slice(0, 80)).toBeNull();
    }
  });

  it('keeps only what is allowed of a message from outside (no extra fields)', () => {
    const odd = { ...entry('2026-11-24T10:00:00.000Z'), evil: '<script>' };
    expect(validMeasurement(odd)).not.toHaveProperty('evil');
  });
});

describe('two logs as one', () => {
  it('has every entry once, oldest first, and is bounded', () => {
    const a = entry('2026-11-24T10:00:00.000Z');
    const b = entry('2026-11-24T11:00:00.000Z');
    const c = entry('2026-11-24T09:00:00.000Z');
    expect(mergeMeasurements([a, b], [c, a])).toEqual([c, a, b]);
    // equal times: by id
    const x = entry('2026-11-24T10:00:00.000Z', 'machine-tilt');
    expect(mergeMeasurements([x, a], [])).toEqual([a, x]);
    const many = Array.from({ length: MEASUREMENT_LIMIT + 5 }, (_, i) =>
      entry(new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString()),
    );
    const merged = mergeMeasurements(many, []);
    expect(merged).toHaveLength(MEASUREMENT_LIMIT);
    expect(merged.at(-1)).toEqual(many.at(-1));
    expect(merged[0]).toEqual(many[5]);
  });
});

describe('writing a measurement down', () => {
  beforeEach(() => {
    useMeasurements.setState({ list: [] });
    useMachine.setState({ connection: 'disconnected', url: '' });
    useWorkshop.getState().setSettings({ companionUrl: '' });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    useMachine.setState({ connection: 'disconnected', url: '' });
    useWorkshop.getState().setSettings({ companionUrl: '' });
  });

  it('keeps it here, newest last, with the time and the numbers', () => {
    const one = useMeasurements.getState().record('camera-offset', { offsetX: 1.25, offsetY: -2 })!;
    expect(one.kind).toBe('camera-offset');
    expect(one.values).toEqual({ offsetX: 1.25, offsetY: -2 });
    expect(Date.parse(one.at)).not.toBeNaN();
    const two = useMeasurements.getState().record('machine-tilt', { x: 0.1, y: 0.2, per100: 0.3 })!;
    expect(useMeasurements.getState().list.map((m) => m.id)).toEqual([one.id, two.id]);
  });

  it('writes nothing down while a simulator is the machine: it measures nothing of the real one', () => {
    useMachine.setState({ connection: 'connected', url: 'simulator' });
    expect(useMeasurements.getState().record('camera-offset', { offsetX: 1 })).toBeNull();
    expect(useMeasurements.getState().list).toEqual([]);
    // a Jackpot is a machine
    useMachine.setState({ connection: 'connected', url: '192.168.1.5' });
    expect(useMeasurements.getState().record('camera-offset', { offsetX: 1 })).not.toBeNull();
  });

  it('sends it to the Pi at once when there is one – and goes on when the Pi does not answer', async () => {
    const fetchFn = vi.fn(async (..._args: unknown[]) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchFn);
    useWorkshop.getState().setSettings({ companionUrl: 'http://pi:8080' });
    const one = useMeasurements.getState().record('camera-offset', { offsetX: 1 })!;
    await Promise.resolve();
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`http://pi:8080/api/library/measurements/${encodeURIComponent(one.id)}`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual(one);
    // the Pi is away: it is still written down here, and nothing is thrown
    fetchFn.mockRejectedValueOnce(new Error('network'));
    expect(useMeasurements.getState().record('camera-offset', { offsetX: 2 })).not.toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(useMeasurements.getState().list).toHaveLength(2);
    vi.unstubAllGlobals();
  });
});

describe('the log on the Pi and on this device', () => {
  beforeEach(() => useMeasurements.setState({ list: [] }));

  it('lacks nothing of either: what the Pi has comes in, what it lacks goes out', async () => {
    const mine = entry('2026-11-24T10:00:00.000Z');
    const theirs = entry('2026-11-24T09:00:00.000Z', 'machine-backlash');
    const both = entry('2026-11-24T08:00:00.000Z', 'machine-tilt');
    useMeasurements.setState({ list: [both, mine] });
    // a Pi that keeps what it is sent
    const onPi: unknown[] = [theirs, both, { junk: true }, 'x'];
    const putAll = vi.fn(async (_collection: string, docs: readonly unknown[]) => {
      onPi.push(...docs);
      return {};
    });
    const client = { list: vi.fn(async () => [...onPi]), putAll };
    expect(await syncMeasurements(client as never)).toBe(true);
    expect(useMeasurements.getState().list).toEqual([both, theirs, mine]);
    expect(putAll).toHaveBeenCalledTimes(1);
    // sent first, with a time limit: a Pi that stops answering must not hold the round up
    expect(putAll).toHaveBeenCalledWith('measurements', [mine], 10_000);
    expect(client.list).toHaveBeenCalledWith('measurements', 10_000);
    // nothing to send: nothing is sent
    putAll.mockClear();
    expect(await syncMeasurements(client as never)).toBe(true);
    expect(putAll).not.toHaveBeenCalled();
  });

  it('sends what the Pi lacks before it takes anything in: a Pi that does not take it leaves this device’s log as it is', async () => {
    const mine = entry('2026-11-24T10:00:00.000Z');
    // a log of the Pi that would push the oldest entry of this device out of its bounded list
    const theirs = Array.from({ length: MEASUREMENT_LIMIT }, (_, i) =>
      entry(`2026-12-01T10:00:${String(i % 60).padStart(2, '0')}.000Z`, 'camera-scale', `-${i}`),
    );
    useMeasurements.setState({ list: [mine] });
    const client = {
      list: vi.fn(async () => theirs),
      putAll: vi.fn(async () => {
        throw new Error('Pi went away');
      }),
    };
    expect(await syncMeasurements(client as never)).toBe(false);
    expect(useMeasurements.getState().list).toEqual([mine]);
    // the next time it goes: the Pi has it, and then the Pi's are taken in
    client.putAll.mockResolvedValueOnce({} as never);
    expect(await syncMeasurements(client as never)).toBe(true);
    expect(client.putAll).toHaveBeenLastCalledWith('measurements', [mine], 10_000);
  });

  it('says when the Pi did not answer, and loses nothing', async () => {
    const mine = entry('2026-11-24T10:00:00.000Z');
    useMeasurements.setState({ list: [mine] });
    const client = {
      list: vi.fn(async () => {
        throw new Error('network');
      }),
      putAll: vi.fn(),
    };
    expect(await syncMeasurements(client as never)).toBe(false);
    expect(useMeasurements.getState().list).toEqual([mine]);
    expect(client.putAll).not.toHaveBeenCalled();
  });
});

describe('the card of the log', () => {
  afterEach(cleanup);

  it('says in a line what each kind of entry found', () => {
    const at = '2026-11-24T10:00:00.000Z';
    const m = (kind: Measurement['kind'], values: Measurement['values']): Measurement => ({
      id: `${at}-${kind}`,
      at,
      kind,
      values,
    });
    expect(summaryOf(m('camera-scale', { pxPerMm: 21.5, rotation: 0.4, focusHeight: 80 }))).toBe(
      '21,50 px/mm · Drehung 0,40° · Kamerahöhe Z 80,00',
    );
    expect(summaryOf(m('camera-offset', { offsetX: 12.5, offsetY: -3.2 }))).toContain('X 12,500');
    expect(
      summaryOf(
        m('machine-grid', {
          scaleX: 1.0004,
          scaleY: 0.9995,
          squareness: 0.12,
          points: 9,
          turned: true,
        }),
      ),
    ).toBe('Maßstab X +0,040 % · Y −0,050 % · Rechtwinkligkeit 0,120° · 9 Punkte (Tafel gedreht)');
    expect(
      summaryOf(
        m('machine-grid', { scaleX: 1, scaleY: 1, squareness: 0, points: 4, turned: false }),
      ),
    ).not.toContain('gedreht');
    expect(summaryOf(m('machine-backlash', { x: 0.12, y: 0.2 }))).toBe(
      'Umkehrspiel X 0,120 · Y 0,200 mm',
    );
    expect(summaryOf(m('machine-tilt', { x: 0.1, y: -0.2, per100: 0.35 }))).toContain(
      '0,35 mm auf 100 mm',
    );
    expect(
      summaryOf(
        m('ruler-check', { sizeX: 500, sizeY: 400, scaleX: 1.001, scaleY: 1, squareness: -0.05 }),
      ),
    ).toBe('500 × 400 mm: Maßstab X +0,100 % · Y ±0,000 % · Rechtwinkligkeit -0,050°');
    expect(
      summaryOf(
        m('correction', {
          'axes/x/steps_per_mm.from': 800,
          'axes/x/steps_per_mm.to': 799.2,
          'axes/y/motor0/pulloff_mm.from': 3,
          'axes/y/motor0/pulloff_mm.to': 3.15,
        }),
      ),
    ).toBe('axes/x/steps_per_mm: 800,000 → 799,200; axes/y/motor0/pulloff_mm: 3,000 → 3,150');
    expect(summaryOf(m('tool-reference', { z: -12.345 }))).toBe('Z -12,345');
    // a value that is not there (an entry of another version) is a dash, not a crash
    expect(summaryOf(m('camera-offset', {}))).toBe('Versatz X – · Y – mm');
  });

  it('says how many there are when it shows only the latest, and nothing when it shows them all', () => {
    useMeasurements.setState({
      list: Array.from({ length: 31 }, (_, i) =>
        entry(`2026-11-24T10:00:${String(i).padStart(2, '0')}.000Z`, 'camera-offset'),
      ),
    });
    render(<MeasurementLog />);
    expect(screen.getByTestId('measurement-more').textContent).toContain('30');
    expect(screen.getByTestId('measurement-more').textContent).toContain('31');
    cleanup();
    useMeasurements.setState({ list: [entry('2026-11-24T10:00:00.000Z')] });
    render(<MeasurementLog />);
    expect(screen.queryByTestId('measurement-more')).toBeNull();
  });

  it('lists the latest first, and says when there is nothing', () => {
    useMeasurements.setState({ list: [] });
    const { rerender } = render(<MeasurementLog />);
    expect(screen.getByText('Noch nichts gemessen.')).not.toBeNull();
    useMeasurements.setState({
      list: [
        entry('2026-11-24T08:00:00.000Z', 'machine-tilt'),
        entry('2026-11-24T10:00:00.000Z', 'camera-offset'),
      ],
    });
    rerender(<MeasurementLog />);
    const items = screen.getByTestId('measurement-list').querySelectorAll('li');
    expect([...items].map((li) => li.getAttribute('data-kind'))).toEqual([
      'camera-offset',
      'machine-tilt',
    ]);
    // only the latest are shown
    useMeasurements.setState({
      list: Array.from({ length: 45 }, (_, i) =>
        entry(new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString()),
      ),
    });
    rerender(<MeasurementLog />);
    expect(screen.getByTestId('measurement-list').querySelectorAll('li')).toHaveLength(30);
  });
});

describe('measurements that are one', () => {
  beforeEach(() => {
    useMeasurements.setState({ list: [] });
    useMachine.setState({ connection: 'disconnected', url: '' });
  });
  afterEach(() => vi.useRealTimers());

  it('the same numbers of the same kind a moment later are not a second measurement (a button tapped twice)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T10:00:00.000Z'));
    const first = useMeasurements.getState().record('ruler-check', { sizeX: 100, scaleX: 1 })!;
    vi.setSystemTime(new Date('2026-11-24T10:00:30.000Z'));
    expect(useMeasurements.getState().record('ruler-check', { scaleX: 1, sizeX: 100 })).toBe(first);
    expect(useMeasurements.getState().list).toHaveLength(1);
    // other numbers, another kind, or a minute later: a measurement of its own
    useMeasurements.getState().record('ruler-check', { sizeX: 100, scaleX: 1.001 });
    useMeasurements.getState().record('tool-reference', { sizeX: 100, scaleX: 1 });
    vi.setSystemTime(new Date('2026-11-24T10:01:01.000Z'));
    useMeasurements.getState().record('ruler-check', { sizeX: 100, scaleX: 1 });
    expect(useMeasurements.getState().list).toHaveLength(4);
  });
});

describe('how often the log is exchanged', () => {
  const quiet = () => ({ list: vi.fn(async () => []), putAll: vi.fn(async () => ({})) });
  beforeEach(() => {
    useMeasurements.setState({ list: [] });
    resetMeasurementExchange();
  });

  it('at the first round, then not again for ten minutes – the Pi is asked every 30 s, the log is not', async () => {
    const client = quiet();
    const t0 = 1_000_000;
    expect(await syncMeasurementsDue(client as never, t0)).toBe('done');
    expect(await syncMeasurementsDue(client as never, t0 + 30_000)).toBe('skipped');
    expect(await syncMeasurementsDue(client as never, t0 + 9 * 60_000)).toBe('skipped');
    expect(client.list).toHaveBeenCalledTimes(1);
    expect(await syncMeasurementsDue(client as never, t0 + 10 * 60_000)).toBe('done');
    expect(client.list).toHaveBeenCalledTimes(2);
  });

  it('at once at the next round when an entry did not reach the Pi – and tries again when the Pi did not answer', async () => {
    const client = quiet();
    expect(await syncMeasurementsDue(client as never, 1000)).toBe('done');
    // an entry whose write failed
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network');
      }),
    );
    useWorkshop.getState().setSettings({ companionUrl: 'http://pi:8080' });
    useMeasurements.getState().record('camera-offset', { offsetX: 1 });
    await new Promise((r) => setTimeout(r, 0));
    vi.unstubAllGlobals();
    expect(await syncMeasurementsDue(client as never, 2000)).toBe('done');
    expect(client.list).toHaveBeenCalledTimes(2);
    expect(await syncMeasurementsDue(client as never, 3000)).toBe('skipped');
    // the Pi does not answer: still due
    const away = {
      list: vi.fn(async () => {
        throw new Error('network');
      }),
      putAll: vi.fn(),
    };
    resetMeasurementExchange();
    expect(await syncMeasurementsDue(away as never, 4000)).toBe('failed');
    expect(await syncMeasurementsDue(client as never, 4001)).toBe('done');
  });
});

describe('the camera offset set by a tap on the picture', () => {
  beforeEach(() => {
    useMeasurements.setState({ list: [] });
    useMachine.setState({ connection: 'disconnected', url: '' });
  });
  afterEach(() => {
    useCamera.getState().setSource(null);
    useCamera.setState({ tapMode: null, marked: null, taps: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (HTMLImageElement.prototype as any).naturalWidth;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (HTMLImageElement.prototype as any).naturalHeight;
  });

  it('is written to the log like the one found with the marker – it is what turns a tap into a G53 target', () => {
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
      configurable: true,
      get: () => 640,
    });
    Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', {
      configurable: true,
      get: () => 480,
    });
    useWorkshop.getState().setSettings({
      camera: { ...DEFAULT_SETTINGS.camera, streamUrl: 'http://pi:8081/stream', source: 'stream' },
    });
    useCamera.getState().setSource('stream');
    useMachine.setState({
      status: { state: 'Idle', mpos: [100, 200, 0], wco: [0, 0, 0], feed: 0, spindle: 0, sd: null },
    } as never);
    useCamera.setState({ tapMode: 'offset', marked: { x: 100, y: 200 } });
    useCamera.getState().tap({ x: 400, y: 300 });
    const now = useWorkshop.getState().settings.camera;
    const logged = useMeasurements.getState().list.filter((m) => m.kind === 'camera-offset');
    expect(logged).toHaveLength(1);
    expect(logged[0]!.values).toEqual({ offsetX: now.offsetX, offsetY: now.offsetY });
  });
});
