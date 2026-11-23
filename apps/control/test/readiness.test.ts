import { describe, expect, it } from 'vitest';
import { blockers, jobReadiness, warnings, type ReadinessInput } from '../src/lib/readiness';

const base: ReadinessInput = {
  connected: true,
  busy: false,
  homed: true,
  errors: 0,
  controllerErrors: 0,
  outside: 0,
  zeroAtOrigin: false,
  collisions: 0,
  clamps: [],
  placeholderProfile: false,
};

describe('job readiness', () => {
  it('is all green for a homed machine and a clean job', () => {
    const items = jobReadiness(base);
    expect(items.every((i) => i.level === 'ok')).toBe(true);
    expect(items.map((i) => i.id)).toEqual(['connection', 'homed', 'errors', 'travel', 'zero']);
  });

  it('blocks the start already for one error in the program', () => {
    expect(blockers(jobReadiness({ ...base, errors: 1 })).map((i) => i.id)).toEqual(['errors']);
  });

  it('blocks on what would go wrong at the machine, warns on what may be intended', () => {
    const items = jobReadiness({
      ...base,
      busy: true,
      homed: false,
      errors: 2,
      controllerErrors: 1,
      outside: 3,
      zeroAtOrigin: true,
      collisions: 1,
      placeholderProfile: true,
    });
    expect(blockers(items).map((i) => i.id)).toEqual(['busy', 'errors', 'travel']);
    expect(warnings(items).map((i) => i.id)).toEqual([
      'homed',
      'controller',
      'zero',
      'collisions',
      'profile',
    ]);
    expect(items.find((i) => i.id === 'travel')?.params).toEqual({ count: 3 });
  });

  it('only asks for the connection while offline', () => {
    const items = jobReadiness({ ...base, connected: false, outside: null, zeroAtOrigin: null });
    expect(items.map((i) => [i.id, i.level])).toEqual([
      ['connection', 'block'],
      ['errors', 'ok'],
    ]);
  });

  it('names every clamp in the way, with what to do about it', () => {
    const items = jobReadiness({
      ...base,
      clamps: [
        { fixture: 1, name: 'Zwinge 2', kind: 'cut', clearance: -32 },
        { fixture: 0, name: 'Schraube 1', kind: 'low', clearance: 1.46 },
        { fixture: 2, name: 'Zwinge 3', kind: 'rapid', clearance: -25 },
      ],
    });
    const clamps = items.filter((i) => i.id === 'clamp');
    expect(clamps.map((i) => [i.key, i.ref, i.level])).toEqual([
      ['clampCut', 1, 'warn'],
      ['clampLow', 0, 'warn'],
      ['clampRapid', 2, 'warn'],
    ]);
    expect(clamps[0]!.params).toEqual({ name: 'Zwinge 2', mm: '0,0' });
    expect(clamps[1]!.params).toEqual({ name: 'Schraube 1', mm: '1,5' });
    // Worth a look, but the start stays open.
    expect(blockers(items)).toEqual([]);
    expect(warnings(items).length).toBe(3);
  });

  it('lets the back of a two-sided job start only after the front, the turn and the holes', () => {
    const flip = (state: ReadinessInput['flip']) =>
      jobReadiness({ ...base, flip: state }).find((i) => i.id === 'flip');
    expect(flip(null)).toBeUndefined();
    expect(flip(undefined)).toBeUndefined();
    // The front says what follows; it starts like any job.
    expect(flip('first')).toMatchObject({ level: 'ok', key: 'flipFirst' });
    // The back waits, and every step names what is open.
    expect(flip('front')).toMatchObject({ level: 'block', key: 'flipFront' });
    expect(flip('turn')).toMatchObject({ level: 'block', key: 'flipTurn' });
    expect(flip('locate')).toMatchObject({ level: 'block', key: 'flipLocate' });
    expect(flip('ready')).toMatchObject({ level: 'ok', key: 'flipReady' });
    // A side that has been cut may be cut again, knowingly.
    expect(flip('cutAgain')).toMatchObject({ level: 'warn', key: 'flipCutAgain' });
    expect(blockers(jobReadiness({ ...base, flip: 'turn' })).map((i) => i.id)).toEqual(['flip']);
    expect(blockers(jobReadiness({ ...base, flip: 'ready' }))).toEqual([]);
  });

  it('names a series and blocks it once the zero has moved away from under it', () => {
    const fine = jobReadiness({ ...base, series: { count: 5, moved: false } });
    expect(fine.find((i) => i.id === 'series')).toEqual({
      id: 'series',
      level: 'ok',
      key: 'seriesOk',
      params: { count: 5 },
    });
    const moved = jobReadiness({ ...base, series: { count: 5, moved: true } });
    expect(blockers(moved).map((i) => i.key)).toEqual(['seriesMoved']);
    // Aligned like any other job afterwards: turned about the zero, it misses every blank.
    const turned = jobReadiness({ ...base, series: { count: 5, moved: false, turned: true } });
    expect(blockers(turned).map((i) => i.key)).toEqual(['seriesTurned']);
    expect(jobReadiness({ ...base, series: null }).some((i) => i.id === 'series')).toBe(false);
  });

  it('names the jig a job belongs to and blocks it until the jig is measured as it lies', () => {
    const fine = jobReadiness({ ...base, jig: { name: 'Rahmen', state: 'ok' } });
    expect(fine.find((i) => i.id === 'jig')).toEqual({
      id: 'jig',
      level: 'ok',
      key: 'jigOk',
      params: { name: 'Rahmen' },
    });
    expect(blockers(fine)).toEqual([]);
    // Not measured in this session, the jig seen elsewhere, the zero or the job moved since.
    const keys = (['unmeasured', 'moved', 'zeroMoved', 'turned'] as const).map(
      (state) => blockers(jobReadiness({ ...base, jig: { name: 'Rahmen', state } }))[0]?.key,
    );
    expect(keys).toEqual(['jigUnmeasured', 'jigMoved', 'jigZeroMoved', 'jigTurned']);
    expect(jobReadiness({ ...base, jig: null }).some((i) => i.id === 'jig')).toBe(false);
  });

  it('offers sections for a part longer than the table, and carries the flow', () => {
    const tooLong = jobReadiness({ ...base, outside: 4, long: 'x' });
    expect(tooLong.find((i) => i.id === 'travel')).toEqual({
      id: 'travel',
      level: 'block',
      key: 'outsideLong',
      params: { count: 4, axis: 'X' },
    });
    // Too high as well, or too large both ways: no way out to offer.
    expect(
      jobReadiness({ ...base, outside: 4, long: null }).find((i) => i.id === 'travel')?.key,
    ).toBe('outside');
    const section = (state: NonNullable<ReadinessInput['sections']>['state']) =>
      jobReadiness({ ...base, sections: { state, n: 2, total: 3, at: 2 } }).find(
        (i) => i.id === 'sections',
      );
    expect(section('ready')).toEqual({
      id: 'sections',
      level: 'ok',
      key: 'sectionsReady',
      params: { n: 2, total: 3, at: 2 },
    });
    expect(section('cutAgain')?.level).toBe('warn');
    for (const state of ['earlier', 'past', 'slid', 'moved'] as const) {
      expect(section(state)?.level, state).toBe('block');
    }
    expect(jobReadiness({ ...base, sections: null }).some((i) => i.id === 'sections')).toBe(false);
  });
});
