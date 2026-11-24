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
import { useMachine } from '../src/store/machine';
import { syncMeasurements, useMeasurements } from '../src/store/measurements';
import { useWorkshop } from '../src/store/workshop';

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
    expect(putAll).toHaveBeenCalledWith('measurements', [mine]);
    // nothing to send: nothing is sent
    putAll.mockClear();
    expect(await syncMeasurements(client as never)).toBe(true);
    expect(putAll).not.toHaveBeenCalled();
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
