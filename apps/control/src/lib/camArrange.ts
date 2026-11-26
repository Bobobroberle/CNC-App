import type { Bounds } from '@lowrider/cam';
import { itemsBounds, partsOf, type CamItem } from './camItems';

/**
 * Aligning and distributing what is selected in the drawing, as in a graphics program: pure maths on
 * boxes in table coordinates (mm, y up – "top" is the larger y). The unit that is arranged is a
 * group, rigid: its box is the box of all its parts, a circle by its true radius, a turned part by
 * its turned outline. The registration holes of a two-sided part are never one of the units. The
 * answer is how far each unit moves; the store applies it as one step.
 */

/** A group with the box around all its parts. */
export interface Unit {
  group: number;
  box: Bounds;
}

/** How far a unit moves, mm. */
export interface Shift {
  dx: number;
  dy: number;
}

/** The shift of every unit that has one, by the unit's group. */
export type Shifts = ReadonlyMap<number, Shift>;

/** Aligned to the left or right edge, the middle between them, the top or bottom edge, the middle between those. */
export type Edge = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom';
/** Distributed along `h` (left to right) or `v` (bottom to top). */
export type Axis = 'h' | 'v';
/** Equal room between the boxes, or equal distances between their middles. */
export type Spread = 'gaps' | 'centres';

export const EDGES: readonly Edge[] = ['left', 'centre', 'right', 'top', 'middle', 'bottom'];

/** A shift smaller than this moves nothing (floating point noise of an alignment that already holds), mm. */
export const MOVES = 1e-9;

/** The units of some items, in the order of the list: the groups of the parts, each with its box. */
export function unitsOf(items: readonly CamItem[]): Unit[] {
  const groups = new Map<number, CamItem[]>();
  for (const item of partsOf(items)) {
    groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  }
  const units: Unit[] = [];
  for (const [group, list] of groups) {
    const box = itemsBounds(list);
    if (box) units.push({ group, box });
  }
  return units;
}

const between = (a: number, b: number) => (a + b) / 2;
/** `-0` is no distance */
const plain = (v: number) => v + 0;

/**
 * Every unit moved so that it lies on the same edge – or the same middle line – as the selection's
 * whole box: the unit that already lies furthest out stays. Fewer than two units: nothing to align.
 */
export function alignDeltas(units: readonly Unit[], edge: Edge): Shifts {
  const shifts = new Map<number, Shift>();
  if (units.length < 2) return shifts;
  const all = {
    minX: Math.min(...units.map((u) => u.box.minX)),
    minY: Math.min(...units.map((u) => u.box.minY)),
    maxX: Math.max(...units.map((u) => u.box.maxX)),
    maxY: Math.max(...units.map((u) => u.box.maxY)),
  };
  for (const { group, box } of units) {
    let dx = 0;
    let dy = 0;
    if (edge === 'left') dx = all.minX - box.minX;
    else if (edge === 'right') dx = all.maxX - box.maxX;
    else if (edge === 'centre') {
      dx = between(all.minX, all.maxX) - between(box.minX, box.maxX);
    } else if (edge === 'bottom') dy = all.minY - box.minY;
    else if (edge === 'top') dy = all.maxY - box.maxY;
    else dy = between(all.minY, all.maxY) - between(box.minY, box.maxY);
    shifts.set(group, { dx: plain(dx), dy: plain(dy) });
  }
  return shifts;
}

/**
 * Units spread evenly along an axis, the two outermost ones staying where they are. Ordered by the
 * middle of their boxes (units with the same middle keep the order of the list). `gaps`: the room
 * between neighbouring boxes is equal – it is negative where the boxes overlap more than they are
 * wide; `centres`: the middles lie equally far apart. Fewer than three units: nothing to spread.
 */
export function distributeDeltas(units: readonly Unit[], axis: Axis, mode: Spread): Shifts {
  if (units.length < 3) return new Map();
  const found = new Map<number, Shift>();
  const low = (b: Bounds) => (axis === 'h' ? b.minX : b.minY);
  const high = (b: Bounds) => (axis === 'h' ? b.maxX : b.maxY);
  const middle = (b: Bounds) => between(low(b), high(b));
  const order = units
    .map((unit, index) => ({ unit, index }))
    .sort((a, b) => middle(a.unit.box) - middle(b.unit.box) || a.index - b.index)
    .map((o) => o.unit);
  const last = order.length - 1;
  const move = (u: Unit, by: number) =>
    found.set(u.group, axis === 'h' ? { dx: plain(by), dy: 0 } : { dx: 0, dy: plain(by) });
  // The answer lists the units in the order they were given
  const shifts = (): Shifts => new Map(units.map((u) => [u.group, found.get(u.group)!]));
  move(order[0]!, 0);
  move(order[last]!, 0);
  if (mode === 'centres') {
    const first = middle(order[0]!.box);
    const step = (middle(order[last]!.box) - first) / last;
    for (let i = 1; i < last; i++) move(order[i]!, first + i * step - middle(order[i]!.box));
    return shifts();
  }
  const widths = order.reduce((sum, u) => sum + high(u.box) - low(u.box), 0);
  const gap = (high(order[last]!.box) - low(order[0]!.box) - widths) / last;
  // Where the low edge of the next unit goes: after the first one and a gap
  let at = high(order[0]!.box) + gap;
  for (let i = 1; i < last; i++) {
    const box = order[i]!.box;
    move(order[i]!, at - low(box));
    at += high(box) - low(box) + gap;
  }
  return shifts();
}

/** Whether a set of shifts moves anything at all. */
export const movesAnything = (shifts: Shifts): boolean =>
  [...shifts.values()].some((s) => Math.abs(s.dx) > MOVES || Math.abs(s.dy) > MOVES);
