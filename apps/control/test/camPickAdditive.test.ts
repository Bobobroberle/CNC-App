import { rectangle } from '@lowrider/cam';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCam } from '../src/store/cam';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';

const cam = () => useCam.getState();
const items = () => cam().project!.items;

/** Three plates, each its own group: 0 0 10 10 · 30 20 50 30 · 100 5 130 45 */
let a = 0;
let b = 0;
let c = 0;
beforeEach(() => {
  cam().close();
  useJob.getState().unload();
  useFlip.getState().cancel();
  cam().add([rectangle(0, 0, 10, 10)]);
  cam().add([rectangle(30, 20, 20, 10)]);
  cam().add([rectangle(100, 5, 30, 40)]);
  [a, b, c] = items().map((i) => i.group) as [number, number, number];
  cam().select(null);
});

describe('a tap with Shift or Ctrl held is the tap of "Mehrfachauswahl" – without the switch', () => {
  const onA = { x: 0, y: 5 };
  const onB = { x: 30, y: 25 };

  it('takes a part in or out of the selection, the switch stays off', () => {
    expect(cam().pick(onA, 2, true, true)).toBe(true);
    expect(cam().selected).toBe(a);
    expect(cam().pick(onB, 2, true, true)).toBe(true);
    expect(cam().selected).toEqual([a, b]);
    // a part that is in is let go of
    expect(cam().pick(onA, 2, true, true)).toBe(true);
    expect(cam().selected).toBe(b);
    expect(cam().multi).toBe(false);
  });

  it('is what the switch does: the same answers for the same taps', () => {
    const keys: unknown[] = [];
    for (const way of ['keys', 'switch'] as const) {
      cam().select(null);
      cam().setMulti(way === 'switch');
      const seen: unknown[] = [];
      for (const at of [onA, onB, onA, { x: 70, y: 70 }, onB]) {
        seen.push(cam().pick(at, 2, true, way === 'keys'), cam().selected);
      }
      if (way === 'keys') keys.push(...seen);
      else expect(seen).toEqual(keys);
    }
    cam().setMulti(false);
  });

  it('without the key a tap picks one part alone, as ever – and keeps nothing', () => {
    cam().pick(onA, 2, true);
    cam().pick(onB, 2, true);
    expect(cam().selected).toBe(b);
    // false is no key
    cam().pick(onA, 2, true, false);
    expect(cam().selected).toBe(a);
  });

  it('finds nothing beside everything: the tap says so, the selection stays', () => {
    cam().select([a, c]);
    expect(cam().pick({ x: 70, y: 70 }, 2, true, true)).toBe(false);
    expect(cam().selected).toEqual([a, c]);
  });
});
