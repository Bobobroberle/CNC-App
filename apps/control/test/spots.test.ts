import { describe, expect, it } from 'vitest';
import {
  addWaypoint,
  MAX_WAYPOINTS,
  removeWaypoint,
  validWaypoints,
  type Waypoint,
} from '../src/lib/spots';

const point = (n: number): Waypoint => ({ id: `w${n}`, name: `Stelle ${n}`, x: n, y: n * 2 });

describe('saved places of the jog panel', () => {
  it('adds a place under its name, rounded to a micrometre, at the end of the list', () => {
    const one = addWaypoint([], '  Anschlag ', { x: 12.34567, y: 800 }, 'a') as Waypoint[];
    expect(one).toEqual([{ id: 'a', name: 'Anschlag', x: 12.346, y: 800 }]);
    expect(addWaypoint(one, 'Zwinge', { x: 1, y: 2 }, 'b')).toEqual([
      one[0],
      { id: 'b', name: 'Zwinge', x: 1, y: 2 },
    ]);
  });

  it('moves the place of that name when the name comes again (the case does not count)', () => {
    const list = [point(1), point(2)];
    const moved = addWaypoint(list, 'stelle 1', { x: 99, y: 98 }, 'new') as Waypoint[];
    expect(moved).toEqual([{ id: 'w1', name: 'stelle 1', x: 99, y: 98 }, point(2)]);
    // a full list still takes a place it already has
    const full = Array.from({ length: MAX_WAYPOINTS }, (_, i) => point(i + 1));
    expect(addWaypoint(full, 'Stelle 3', { x: 0, y: 0 }, 'n')).toHaveLength(MAX_WAYPOINTS);
  });

  it('refuses no name, a place that is no number and a full list – and changes nothing', () => {
    const list = [point(1)];
    expect(addWaypoint(list, '   ', { x: 1, y: 1 }, 'x')).toBe('name');
    expect(addWaypoint(list, 'A', { x: Number.NaN, y: 1 }, 'x')).toBe('name');
    expect(addWaypoint(list, 'A', { x: 1, y: Number.POSITIVE_INFINITY }, 'x')).toBe('name');
    const full = Array.from({ length: MAX_WAYPOINTS }, (_, i) => point(i + 1));
    expect(addWaypoint(full, 'Eine mehr', { x: 1, y: 1 }, 'x')).toBe('full');
    expect(list).toEqual([point(1)]);
  });

  it('deletes by id', () => {
    expect(removeWaypoint([point(1), point(2)], 'w1')).toEqual([point(2)]);
    expect(removeWaypoint([point(1)], 'nobody')).toEqual([point(1)]);
  });

  it('keeps only the well-formed places of what was stored, at most the limit', () => {
    const many = Array.from({ length: MAX_WAYPOINTS + 5 }, (_, i) => point(i + 1));
    expect(validWaypoints(many)).toHaveLength(MAX_WAYPOINTS);
    expect(validWaypoints('x')).toEqual([]);
    expect(validWaypoints(undefined)).toEqual([]);
    expect(
      validWaypoints([
        point(1),
        null,
        'x',
        { id: '', name: 'A', x: 1, y: 1 },
        { id: 'a', name: ' ', x: 1, y: 1 },
        { id: 'a', name: 'A', x: Number.NaN, y: 1 },
        { id: 'a', name: 'A', x: 1, y: '2' },
        { id: 'b', name: ' Rand ', x: 3, y: 4, extra: true },
      ]),
    ).toEqual([point(1), { id: 'b', name: 'Rand', x: 3, y: 4 }]);
  });
});
