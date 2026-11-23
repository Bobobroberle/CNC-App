import { describe, expect, it } from 'vitest';
import {
  boxZone,
  CLAMP_DEFAULTS,
  fixturesInWork,
  MIN_ZONE,
  moveZone,
  newZone,
  nextNumber,
  pinFixtures,
  resizeZone,
  withHeight,
  zoneAt,
  zoneCentre,
  zoneDistance,
  zoneHandles,
  zoneRadius,
} from '../src/lib/clamps';

describe('clamp zones', () => {
  const clamp = newZone('clamp', { x: 500, y: 300 }, 'Zwinge 1');
  const screw = newZone('screw', { x: 700, y: 300 }, 'Schraube 2');

  it('puts a clamp down as a 60 × 40 box and a screw as a small circle, each with its height', () => {
    expect(clamp).toEqual({
      name: 'Zwinge 1',
      min: { x: 470, y: 280, z: -1000 },
      max: { x: 530, y: 320, z: 30 },
    });
    expect(screw.round).toBe(true);
    expect(zoneRadius(screw)).toBe(CLAMP_DEFAULTS.screw.width / 2);
    expect(zoneCentre(screw)).toEqual({ x: 700, y: 300 });
    expect(screw.max.z).toBe(5);
  });

  it('numbers new zones with the first free number', () => {
    expect(nextNumber([])).toBe(1);
    expect(nextNumber([clamp, screw])).toBe(3);
    expect(nextNumber([screw])).toBe(1);
    expect(nextNumber([{ ...clamp, name: 'Spanner links' }, clamp])).toBe(2);
  });

  it('stays on the table when the work zero moves', () => {
    // Zero at machine (440, 140): the clamp lies at work (30…90, 140…180).
    const before = fixturesInWork([clamp], 'machine', [440, 140, -50]);
    expect(before[0]!.min).toEqual({ x: 30, y: 140, z: -1000 });
    expect(before[0]!.max).toEqual({ x: 90, y: 180, z: 30 });
    // The zero moves 100 mm to the right: the clamp is 100 mm further left of it.
    const after = fixturesInWork([clamp], 'machine', [540, 140, -50]);
    expect(after[0]!.min.x).toBe(-70);
    expect(after[0]!.max.x).toBe(-10);
    // Without a work offset nobody knows where it lies relative to the job.
    expect(fixturesInWork([clamp], 'machine', null)).toEqual([]);
    expect(fixturesInWork([clamp], 'machine', undefined)).toEqual([]);
    expect(fixturesInWork([clamp], 'machine', [])).toEqual([clamp]);
  });

  it('pins fixtures of older storage (relative to the work zero) where they lie now', () => {
    const old = boxZone('Zwinge', -40, -20, -10, 10, 15);
    // Until the machine reports its offset they count as they were typed.
    expect(fixturesInWork([old], 'work', null)).toEqual([old]);
    expect(fixturesInWork([old], 'work', [600, 1200, -60])).toEqual([old]);
    const pinned = pinFixtures([old], [600, 1200, -60]);
    expect(pinned[0]!.min).toEqual({ x: 560, y: 1190, z: -1000 });
    expect(pinned[0]!.max).toEqual({ x: 580, y: 1210, z: 15 });
    // Seen from the same zero nothing has changed.
    expect(fixturesInWork(pinned, 'machine', [600, 1200, -60])).toEqual([old]);
    expect(pinFixtures([old], [])).toEqual([old]);
    expect(boxZone('S', 0, 10, 0, 10, 5, true).round).toBe(true);
  });

  it('measures the distance from a zone: 0 inside, round zones as circles', () => {
    expect(zoneDistance(clamp, { x: 500, y: 300 })).toBe(0);
    expect(zoneDistance(clamp, { x: 540, y: 300 })).toBe(10);
    expect(zoneDistance(clamp, { x: 500, y: 270 })).toBe(10);
    expect(zoneDistance(clamp, { x: 533, y: 324 })).toBe(5);
    expect(zoneDistance(screw, { x: 703, y: 304 })).toBe(0);
    // The corner of the screw's box is outside its circle.
    expect(zoneDistance(screw, { x: 706, y: 306 })).toBeCloseTo(Math.hypot(6, 6) - 6);
  });

  it('finds what a finger takes: body, handle, the zone on top, a small zone still', () => {
    const zones = [clamp, screw];
    // Nothing selected: bodies only.
    expect(zoneAt(zones, { x: 500, y: 300 }, 5)).toEqual({ index: 0, part: 'body' });
    expect(zoneAt(zones, { x: 470, y: 280 }, 5)).toEqual({ index: 0, part: 'body' });
    expect(zoneAt(zones, { x: 600, y: 300 }, 5)).toBeNull();
    // A screw of 12 mm under a finger of 24 mm radius: hit up to 24 mm from its centre.
    expect(zoneAt(zones, { x: 720, y: 300 }, 24)).toEqual({ index: 1, part: 'body' });
    expect(zoneAt(zones, { x: 726, y: 300 }, 24)).toBeNull();
    // A zone larger than the finger is only hit on itself.
    expect(zoneAt(zones, { x: 536, y: 300 }, 10)).toBeNull();
    // Selected: its corners win near them …
    expect(zoneAt(zones, { x: 528, y: 318 }, 10, 0)).toEqual({ index: 0, part: 'ne' });
    expect(zoneAt(zones, { x: 468, y: 281 }, 10, 0)).toEqual({ index: 0, part: 'sw' });
    expect(zoneAt(zones, { x: 529, y: 282 }, 10, 0)).toEqual({ index: 0, part: 'se' });
    expect(zoneAt(zones, { x: 472, y: 322 }, 10, 0)).toEqual({ index: 0, part: 'nw' });
    // … but with a finger as large as the zone its middle still moves it.
    expect(zoneAt(zones, { x: 505, y: 303 }, 40, 0)).toEqual({ index: 0, part: 'body' });
    expect(zoneAt(zones, { x: 520, y: 312 }, 40, 0)).toEqual({ index: 0, part: 'ne' });
    // The rim handle of a selected screw sits on its right.
    expect(zoneHandles(screw)).toEqual([{ part: 'rim', x: 706, y: 300 }]);
    expect(zoneAt(zones, { x: 707, y: 300 }, 5, 1)).toEqual({ index: 1, part: 'rim' });
    expect(zoneAt(zones, { x: 701, y: 300 }, 5, 1)).toEqual({ index: 1, part: 'body' });
    // A selection that is gone is ignored; overlapping zones give the upper one.
    expect(zoneAt(zones, { x: 500, y: 300 }, 5, 7)).toEqual({ index: 0, part: 'body' });
    const over = newZone('clamp', { x: 510, y: 300 }, 'Zwinge 3');
    expect(zoneAt([clamp, over], { x: 505, y: 300 }, 5)).toEqual({ index: 1, part: 'body' });
  });

  it('moves, resizes from a corner or the rim, never below the smallest size', () => {
    const moved = moveZone(clamp, 10, -5);
    expect(moved.min).toEqual({ x: 480, y: 275, z: -1000 });
    expect(moved.max).toEqual({ x: 540, y: 315, z: 30 });

    const wider = resizeZone(clamp, 'ne', { x: 560, y: 350 });
    expect([wider.min.x, wider.min.y, wider.max.x, wider.max.y]).toEqual([470, 280, 560, 350]);
    const sw = resizeZone(clamp, 'sw', { x: 450, y: 270 });
    expect([sw.min.x, sw.min.y, sw.max.x, sw.max.y]).toEqual([450, 270, 530, 320]);
    const se = resizeZone(clamp, 'se', { x: 550, y: 290 });
    expect([se.min.x, se.min.y, se.max.x, se.max.y]).toEqual([470, 290, 550, 320]);
    const nw = resizeZone(clamp, 'nw', { x: 480, y: 330 });
    expect([nw.min.x, nw.min.y, nw.max.x, nw.max.y]).toEqual([480, 280, 530, 330]);
    // Pulled through the opposite corner: it stops at the smallest size.
    const tiny = resizeZone(clamp, 'ne', { x: 0, y: 0 });
    expect([tiny.max.x - tiny.min.x, tiny.max.y - tiny.min.y]).toEqual([MIN_ZONE, MIN_ZONE]);
    const tinySw = resizeZone(clamp, 'sw', { x: 900, y: 900 });
    expect([tinySw.min.x, tinySw.min.y]).toEqual([530 - MIN_ZONE, 320 - MIN_ZONE]);

    const larger = resizeZone(screw, 'rim', { x: 700, y: 310 });
    expect(zoneRadius(larger)).toBe(10);
    expect(zoneCentre(larger)).toEqual({ x: 700, y: 300 });
    expect(zoneRadius(resizeZone(screw, 'rim', { x: 700, y: 300 }))).toBe(MIN_ZONE / 2);
    expect(resizeZone(clamp, 'body', { x: 0, y: 0 })).toBe(clamp);

    expect(withHeight(clamp, 45).max.z).toBe(45);
    expect(withHeight(clamp, 45).min).toEqual(clamp.min);
  });
});
