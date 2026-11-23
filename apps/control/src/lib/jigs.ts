import type { Matrix } from '@lowrider/cam';
import { transformProgram, type Fixture } from '@lowrider/gcode-core';
import {
  clampOnTable,
  clampToJig,
  jigReach,
  toJig,
  type Jig,
  type JigPose,
  type JigTag,
  type TagReading,
} from '@lowrider/workshop';
import type { Point } from './camera';
import type { TagReject } from './tagFinder';

/**
 * Jigs with printed tags, between the camera and the job: which tags have
 * been seen where, what the readiness list says about a jig's job, and the
 * program as it is loaded for a jig that lies turned. The geometry itself
 * (frames, zero, rotation) is `@lowrider/workshop`'s `jigs.ts`.
 */

/** A tag the camera has seen on the table. */
export interface Sighting extends TagReading {
  /** Seen in the live picture, or on the picture of the table (the photo map) */
  from: 'live' | 'map';
  /** Side as measured over side as printed */
  scale: number;
  /** How far from the crosshair it was seen (live picture), mm; 0 for the table picture */
  off: number;
  /** State of the photo map when it was seen (its version) */
  map: number;
}

/** The jigs a tag belongs to. */
export const jigsWithTag = (jigs: readonly Jig[], id: number): Jig[] =>
  jigs.filter((j) => j.tags.some((t) => t.id === id));

/**
 * What is known about the tags on the table after another look. A look at
 * the whole table picture replaces what an earlier one found there; a look
 * through the live picture replaces what it shows and forgets what should be
 * in view (`covers`) but is not. Something seen live is not overruled by a
 * table picture that has not changed since: that picture is the older one.
 */
export function withSightings(
  seen: readonly Sighting[],
  fresh: readonly Sighting[],
  look: { from: 'map'; map: number } | { from: 'live'; covers: (p: Point) => boolean },
): Sighting[] {
  const out = new Map<number, Sighting>();
  for (const s of seen) {
    const gone = look.from === 'map' ? s.from === 'map' : look.covers(s);
    if (!gone) out.set(s.id, s);
  }
  for (const f of fresh) {
    const known = out.get(f.id);
    if (look.from === 'map' && known?.from === 'live' && known.map === look.map) continue;
    // The same number twice in one look: the first stays.
    if (known && fresh.includes(known)) continue;
    out.set(f.id, f);
  }
  return [...out.values()].sort((a, b) => a.id - b.id);
}

/** A jig counts as moved when one of its tags is seen this far from where it was measured, mm */
export const MOVED_LIVE = 1.5;
/** … and this share of its distance from the crosshair more: away from the middle the lens bends the picture */
export const MOVED_LIVE_SHARE = 0.03;
/** … on the table picture, which is good to about half a millimetre */
export const MOVED_MAP = 2.5;

/** Whether a sighting says that a measured jig no longer lies where it was measured. */
export function hasMoved(measured: readonly TagReading[], seen: readonly Sighting[]): boolean {
  return seen.some((s) => {
    const was = measured.find((m) => m.id === s.id);
    if (!was) return false;
    const limit = s.from === 'live' ? MOVED_LIVE + MOVED_LIVE_SHARE * s.off : MOVED_MAP;
    return Math.hypot(s.x - was.x, s.y - was.y) > limit;
  });
}

/** A jig as it was measured in this session. */
export interface PlacedJig {
  jigId: string;
  /** The X/Y work zero that was set from it */
  zero: Point;
  /** How its program lay against the job as loaded */
  pose: Matrix;
  /** How far the program as taught was turned, degrees */
  rotation: number;
  /** Its tags as measured */
  tags: TagReading[];
  /** The Z work zero as it was then: a tag does not know the height */
  z: number;
  /** Seen somewhere else since */
  moved: boolean;
}

/**
 * What the readiness list says about the job of a jig: measured and as it
 * was (`ok`), not measured in this session, the jig seen somewhere else
 * since, the X/Y zero set anew since, or the program turned or shifted since.
 */
export type JigState = 'ok' | 'unmeasured' | 'moved' | 'zeroMoved' | 'turned';

export function jigState(
  placed: Pick<PlacedJig, 'zero' | 'pose' | 'moved'> | null,
  wco: readonly number[] | null,
  pose: Matrix,
): JigState {
  if (!placed) return 'unmeasured';
  if (placed.moved) return 'moved';
  if (wco && Math.hypot((wco[0] ?? 0) - placed.zero.x, (wco[1] ?? 0) - placed.zero.y) > 0.005) {
    return 'zeroMoved';
  }
  const same = (Object.keys(pose) as (keyof Matrix)[]).every(
    (k) => Math.abs(pose[k] - placed.pose[k]) < 1e-9,
  );
  return same ? 'ok' : 'turned';
}

/** The name of a jig's program when it is loaded turned to the jig. */
export const jigFileName = (fileName: string) =>
  `${fileName.replace(/\.[^.]*$/, '')}_vorrichtung.nc`;

/** A turn smaller than this leaves the program as it is, degrees */
const NO_TURN = 0.001;

/**
 * The program of a jig for a jig that lies turned by `rotation` against how
 * it was taught: turned about the work zero. Null when it is not turned.
 */
export function turnedProgram(text: string, rotation: number): string | null {
  if (Math.abs(rotation) < NO_TURN) return null;
  return transformProgram(text, { rotation, offset: { x: 0, y: 0 }, pivot: { x: 0, y: 0 } }).text;
}

/**
 * How far the job reaches from the point the measured angle turns about:
 * the corners of what it cuts (work XY, from the zero at `zero` on the
 * table), seen from the jig whose frame lies at `frame`.
 */
export function jobReach(
  tags: readonly JigTag[],
  frame: JigPose,
  zero: Point,
  bounds: { min: Point; max: Point },
): number {
  const corners = [
    { x: bounds.min.x, y: bounds.min.y },
    { x: bounds.max.x, y: bounds.min.y },
    { x: bounds.max.x, y: bounds.max.y },
    { x: bounds.min.x, y: bounds.max.y },
  ].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  return jigReach(
    tags,
    corners.map((p) => toJig(frame, { x: zero.x + p.x, y: zero.y + p.y })),
  );
}

/** A clamp on the table that belongs to a jig: it is put down anew when the jig is measured. */
export type JigFixture = Fixture & { jig?: string };

/** The clamps on the table as clamps of a jig whose frame lies at `frame`. */
export const clampsToJig = (frame: JigPose, fixtures: readonly Fixture[]) =>
  fixtures.map((f) => clampToJig(frame, f));

/**
 * The clamps on the table once a jig has been measured at `pose`: its own
 * where they are now, everything else as it was.
 */
export function withJigClamps(
  fixtures: readonly JigFixture[],
  jig: Pick<Jig, 'id' | 'clamps'>,
  pose: JigPose,
): JigFixture[] {
  return [
    ...fixtures.filter((f) => f.jig !== jig.id),
    ...jig.clamps.map((c) => ({ ...clampOnTable(pose, c), jig: jig.id })),
  ];
}

/** Why a jig could not be measured. */
export type JigTroubleKind =
  /** No calibrated camera picture, or the machine is not ready */
  | 'notReady'
  /** None of its tags has been seen */
  | 'unseen'
  /** A tag is not where it was last seen */
  | 'notThere'
  /** Something lies there that looks like a tag but cannot be taken for one */
  | 'refused'
  /** The tags do not fit the jig as taught */
  | 'distance'
  | 'turned'
  /** A move or setting the zero failed */
  | 'machine'
  | 'cancelled';

export interface JigTrouble {
  kind: JigTroubleKind;
  /** The tag it is about */
  tag?: number;
  /** For `refused`: why the finder did not take it */
  reason?: TagReject;
  /** For `refused` by size: the side as measured, mm; for `distance`: how far off, mm */
  mm?: number;
}

/** The four corners of a tag on the table, from its middle, its size and its angle. */
export function tagCorners(tag: Pick<TagReading, 'x' | 'y' | 'angle' | 'size'>): Point[] {
  const a = (tag.angle * Math.PI) / 180;
  const h = tag.size / 2;
  return [
    [-h, h],
    [h, h],
    [h, -h],
    [-h, -h],
  ].map(([x, y]) => ({
    x: tag.x + Math.cos(a) * x! - Math.sin(a) * y!,
    y: tag.y + Math.sin(a) * x! + Math.cos(a) * y!,
  }));
}

/** What stands at a tag on the pictures: its number, and the jig it belongs to. */
export function tagLabel(jigs: readonly Jig[], id: number, marker: string): string {
  const names = jigsWithTag(jigs, id).map((j) => j.name);
  return names.length > 0 ? `${marker} · ${names.join(', ')}` : marker;
}
