import {
  bounds,
  contourSpan,
  nearestOnContour,
  operationTabSites,
  tabSites,
  tidySketch,
  wrapUnit,
  type Bounds,
  type OperationKind,
  type Point,
  type Tabs,
} from '@lowrider/cam';
import type { CamItem, TabSpec } from './camItems';

/**
 * Holding tabs of the drawing, per thing: what the CAM's defaults and the thing's own values make of
 * them (`itemTabs`), where they stand and what to draw there (`itemTabMarks`). All of it is pure; the
 * places themselves come from the library's `operationTabSites`, the function the toolpath asks as well
 * – with the operation the cut uses (its kind, its tabs, the cutter's diameter), so what the table
 * shows is what is cut. (With "Ecken meiden" the places depend on the cutter and on the kind of cut:
 * a `tabSites` that is asked without them is not the place the cut lifts at.)
 */

/** What a tab can be: the ranges of the fields, and of what a project file may hold */
export const TAB_LIMITS = {
  count: { min: 0, max: 50 },
  width: { min: 0.1, max: 100 },
  /** The deepest cut a drawing may hold (`MAX_DEPTH` of the project file) */
  height: { min: 0.1, max: 500 },
  /** Most places by hand on one thing */
  places: 50,
} as const;

export type TabValue = 'count' | 'width' | 'height';

/** A typed value brought into its range (the count into whole numbers). */
export function clampTab(key: TabValue, value: number): number {
  const { min, max } = TAB_LIMITS[key];
  const v = key === 'count' ? Math.round(value) : value;
  return Math.min(max, Math.max(min, v));
}

/** Only outside and inside cuts free a part – only they can leave tabs. */
export const takesTabs = (kind: OperationKind) => kind === 'outside' || kind === 'inside';

/** Whether the tabs of the thing are on (and it is cut in a way that has tabs). */
export const tabsOn = (item: Pick<CamItem, 'kind' | 'tabs'>) => item.tabs && takesTabs(item.kind);

/**
 * The values the thing's tabs have: its own where it has them, else the drawing's defaults. "Ecken
 * meiden" (`avoidCorners`) is off where neither says so: a drawing or a part that never heard of it is
 * cut as it always was.
 */
export function tabValues(item: Pick<CamItem, 'tabSpec'>, defaults: Tabs) {
  const spec = item.tabSpec;
  return {
    mode: spec?.mode ?? ('auto' as const),
    count: spec?.count ?? defaults.count,
    width: spec?.width ?? defaults.width,
    height: spec?.height ?? defaults.height,
    avoidCorners: spec?.avoidCorners ?? defaults.avoidCorners === true,
  };
}

/**
 * The tabs of one contour of a thing for the toolpath and the table: undefined when the thing has
 * none. Without a spec these are the drawing's defaults themselves; automatic with own values, the
 * count (own or default) spread evenly; by hand only the places put on that contour.
 */
export function itemTabs(item: CamItem, contour: number, defaults: Tabs): Tabs | undefined {
  if (!tabsOn(item)) return undefined;
  const spec = item.tabSpec;
  if (!spec) return defaults;
  const { count, width, height, avoidCorners } = tabValues(item, defaults);
  // (the flag only where it is on: the same tabs as ever, without a key the cut would ignore)
  if (spec.mode === 'auto')
    return { count, width, height, ...(avoidCorners ? { avoidCorners } : {}) };
  // Places put by hand are never moved: no "Ecken meiden" for them
  const at = (spec.at ?? []).filter((p) => p.c === contour).map((p) => p.u);
  return { count: at.length, width, height, at };
}

/**
 * The closed contours of a thing that are cut free and have no tab: by hand, the ones with no place
 * put on them; spread by count, all of them for a count of 0 (a part of several contours – a grid of
 * discs – is held only where every one of them is).
 */
export function looseContours(item: CamItem, defaults: Tabs): number[] {
  // A hidden part is not cut: nothing of it is loose
  if (!tabsOn(item) || item.hidden === true) return [];
  const { mode, count } = tabValues(item, defaults);
  const closed = item.contours.flatMap((contour, c) => (contour.closed ? [c] : []));
  if (mode === 'auto') return count > 0 ? [] : closed;
  const put = new Set((item.tabSpec?.at ?? []).map((p) => p.c));
  return closed.filter((c) => !put.has(c));
}

/**
 * Whether the thing is held at all: its tabs are on and every closed contour of it has a place for
 * one – automatic with a count of at least one, by hand with a place put on each. (A part cut free
 * without any is loose.)
 */
export const itemHasTabs = (item: CamItem, defaults: Tabs): boolean =>
  tabsOn(item) && looseContours(item, defaults).length === 0;

/**
 * Whether the tabs are on and some contour is cut free without one – by hand with no place put on
 * it, or a count of 0: the part would not be held.
 */
export const tabsMissing = (item: CamItem, defaults: Tabs) =>
  tabsOn(item) && !itemHasTabs(item, defaults);

/**
 * A spec with nothing in it that the defaults would not say is no spec: `undefined`, so the project
 * file stays as an older app wrote it. Values that are not numbers go, and the places of an
 * automatic spec.
 */
export function tidySpec(spec: TabSpec): TabSpec | undefined {
  const out: TabSpec = { mode: spec.mode };
  for (const key of ['count', 'width', 'height'] as const) {
    if (spec[key] !== undefined && Number.isFinite(spec[key])) out[key] = spec[key];
  }
  if (typeof spec.avoidCorners === 'boolean') out.avoidCorners = spec.avoidCorners;
  if (spec.mode === 'manual') out.at = spec.at ?? [];
  const bare = out.mode === 'auto' && out.count === undefined;
  return bare &&
    out.width === undefined &&
    out.height === undefined &&
    out.avoidCorners === undefined
    ? undefined
    : out;
}

/** How far apart two fractions of a loop are, as a fraction of it (the shorter way round). */
const gap = (a: number, b: number) => {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
};

/** Whether two places of a contour are one (`tabSites` takes them for one too). */
export const samePlace = (a: number, b: number) => gap(wrapUnit(a), wrapUnit(b)) < 1e-9;

/**
 * The item without the places of contours it no longer has (a grid made smaller) and without a place
 * that stands where another one does (it could not be seen or taken, and would count twice); the same
 * item if there are none.
 */
export function pruneTabs(item: CamItem): CamItem {
  const at = item.tabSpec?.at;
  if (!item.tabSpec || !at) return item;
  const kept = at.filter(
    (p, i) =>
      p.c < item.contours.length && !at.slice(0, i).some((q) => q.c === p.c && samePlace(q.u, p.u)),
  );
  return kept.length === at.length ? item : { ...item, tabSpec: { ...item.tabSpec, at: kept } };
}

/** Where a point of one box lies in another, by shares of their width and height (a flat box is its middle). */
function intoBox(from: Bounds, to: Bounds, p: Point): Point {
  const share = (v: number, lo: number, hi: number) => (hi > lo ? (v - lo) / (hi - lo) : 0.5);
  return {
    x: to.minX + share(p.x, from.minX, from.maxX) * (to.maxX - to.minX),
    y: to.minY + share(p.y, from.minY, from.maxY) * (to.maxY - to.minY),
  };
}

/**
 * Which contour of a thing made anew is the one an old contour was: the same one when it has as many
 * (a rectangle with other measures), by its cell in the grid when both are grids (the new ones may
 * have more columns, so the numbers move); none for any other change of how many there are.
 */
function contourAfter(before: CamItem, after: CamItem): (c: number) => number | null {
  const a = before.sketch && tidySketch(before.sketch);
  const b = after.sketch && tidySketch(after.sketch);
  if (a?.type === 'grid' && b?.type === 'grid') {
    return (c) => {
      const column = c % a.nx;
      const row = Math.floor(c / a.nx);
      return column < b.nx && row < b.ny ? row * b.nx + column : null;
    };
  }
  return before.source.length === after.source.length ? (c) => c : () => null;
}

/**
 * The places of a thing's tabs by hand, carried over to the same thing with other measures (`after`:
 * made anew from its sketch, `before`: as it was). A place is a fraction of a contour's length and the
 * length changes with the measures, so each place is taken to the same share of the contour's own box
 * (the middle of the lower side stays the middle of the lower side) and then to the nearest place of
 * the new line – all in the sketch's own coordinates, where the placement does not matter. Places on a
 * contour that is no longer there, or that now stand together, are dropped; the thing then shows it
 * (a contour without a tab). Without places by hand `after` is returned as it is.
 */
export function carryTabs(before: CamItem, after: CamItem): CamItem {
  const at = before.tabSpec?.at;
  if (!before.tabSpec || !at || at.length === 0) return after;
  const to = contourAfter(before, after);
  const put: { c: number; u: number }[] = [];
  for (const p of at) {
    const c = to(p.c);
    const was = before.source[p.c];
    const now = c === null ? undefined : after.source[c];
    if (c === null || !was?.closed || !now?.closed) continue;
    const site = tabSites(was, { count: 0, at: [p.u] })[0];
    const near =
      site && nearestOnContour(now, intoBox(bounds(was.points), bounds(now.points), site.point));
    if (!near) continue;
    // Where it already stood to within a hair (the same shape, or a scale that keeps the share): untouched
    const u = c === p.c && samePlace(near.u, p.u) ? p.u : near.u;
    if (!put.some((q) => q.c === c && samePlace(q.u, u))) put.push({ c, u });
  }
  return { ...after, tabSpec: { ...before.tabSpec, at: put } };
}

/** One tab as the table draws it: where, how wide, and the bar along the line. */
export interface TabMark {
  /** The item's id and the contour of it */
  item: number;
  c: number;
  /** Fraction of the drawn contour, and the point on it (work mm) */
  u: number;
  x: number;
  y: number;
  /** The material that stays, mm */
  w: number;
  /** The place in the list of the item's manual places; −1 where they are spread evenly */
  index: number;
  /** The bar: the stretch of the contour that is `w` long, round its corners (work mm) */
  span: Point[];
  /** Unit vectors across the line at the start and the end of the bar, for the end ticks */
  ends: [Point, Point];
}

/** Across a line that runs from `a` to `b`; a point twice takes the way the line runs there. */
function across(a: Point, b: Point, tangent: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const t = length > 0 ? { x: dx / length, y: dy / length } : tangent;
  // (+ 0: never −0)
  return { x: -t.y + 0, y: t.x };
}

/** What the picture of a thing's tabs was made from: the same again is the same picture */
interface Drawn {
  count: number;
  width: number;
  height: number;
  avoidCorners: boolean;
  toolDiameter: number;
  kind: OperationKind;
  marks: TabMark[];
}

/**
 * The tabs of one thing as the table draws them: all contours, in the order of the places. The places
 * are the ones the cut asks for (`operationTabSites`), so they depend on the cutter's diameter and on the
 * kind of cut – both are part of what the picture is made from.
 */
export function itemTabMarks(item: CamItem, defaults: Tabs, toolDiameter: number): TabMark[] {
  // A hidden part is drawn faint and has no tabs to show: it is not cut
  if (!tabsOn(item) || item.hidden === true) return [];
  // The same thing with the same defaults draws the same: what a finger moves is one thing, not all
  const seen = drawn.get(item);
  const avoidCorners = defaults.avoidCorners === true;
  if (
    seen &&
    seen.count === defaults.count &&
    seen.width === defaults.width &&
    seen.height === defaults.height &&
    seen.avoidCorners === avoidCorners &&
    seen.toolDiameter === toolDiameter &&
    seen.kind === item.kind
  ) {
    return seen.marks;
  }
  const marks = makeMarks(item, defaults, toolDiameter);
  drawn.set(item, {
    count: defaults.count,
    width: defaults.width,
    height: defaults.height,
    avoidCorners,
    toolDiameter,
    kind: item.kind,
    marks,
  });
  return marks;
}

const drawn = new WeakMap<CamItem, Drawn>();

function makeMarks(item: CamItem, defaults: Tabs, toolDiameter: number): TabMark[] {
  const marks: TabMark[] = [];
  const own = item.tabSpec?.mode === 'manual' ? (item.tabSpec.at ?? []) : [];
  item.contours.forEach((contour, c) => {
    const tabs = itemTabs(item, c, defaults);
    if (!tabs) return;
    // The places the cut lifts at: asked with the operation it is cut with, never `tabSites` alone
    for (const site of operationTabSites(contour, { kind: item.kind, tabs }, { toolDiameter })) {
      const span = contourSpan(contour, site.u, tabs.width);
      const first = span[0]!;
      const last = span[span.length - 1]!;
      marks.push({
        item: item.id,
        c,
        u: site.u,
        x: site.point.x,
        y: site.point.y,
        w: tabs.width,
        index: own.findIndex((p) => p.c === c && samePlace(p.u, site.u)),
        span,
        ends: [
          across(first, span[1] ?? first, site.tangent),
          across(span[span.length - 2] ?? last, last, site.tangent),
        ],
      });
    }
  });
  return marks;
}

/** The tab of a thing nearest to a work point, within `reach` mm – the one a finger takes hold of. */
export function tabNear(
  marks: readonly TabMark[],
  item: number,
  at: Point,
  reach: number,
): TabMark | null {
  let best: TabMark | null = null;
  let bestDistance = reach;
  for (const m of marks) {
    const d = Math.hypot(m.x - at.x, m.y - at.y);
    if (m.item === item && d <= bestDistance) {
      best = m;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Where a finger at a work point would put a tab on a thing: the contour and the place of it nearest
 * to the point, if one lies within `reach` mm – else null (a tap beside the line puts nothing).
 */
export function placeNear(
  item: CamItem,
  at: Point,
  reach: number,
): { c: number; u: number; point: Point } | null {
  let best: { c: number; u: number; point: Point } | null = null;
  let bestDistance = reach;
  item.contours.forEach((contour, c) => {
    const near = contour.closed ? nearestOnContour(contour, at) : null;
    if (near && near.distance <= bestDistance) {
      best = { c, u: near.u, point: near.point };
      bestDistance = near.distance;
    }
  });
  return best;
}
