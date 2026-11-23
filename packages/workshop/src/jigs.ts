import type { Vec } from './calibration';
import { isTagId, TAG_SIZES } from './tags';

/**
 * Jigs with printed tags: a jig that is used again and again (a frame for
 * coasters, a fence for cutting boards) carries one or two tags. Taught
 * once – jig on the table, job loaded, zero set – the app keeps where the
 * work zero and the program lie relative to the tags; whenever the camera
 * finds the tags again, zero and rotation follow from them.
 *
 * Everything is in table millimetres with y up and angles counter-clockwise
 * in degrees. The jig's own frame has its origin in the middle of its first
 * tag; its x axis points to the second tag or, with one tag only, along
 * that tag's own x axis.
 */

/** A tag measured on the table. */
export interface TagReading extends Vec {
  id: number;
  /** Direction of the tag's own x axis against table +X, degrees */
  angle: number;
  /** Side of its dark square as printed, mm */
  size: number;
}

/** A tag of a jig, in the jig's frame. */
export interface JigTag extends Vec {
  id: number;
  size: number;
  /** Direction of the tag's own x axis in the jig's frame, degrees */
  angle: number;
}

/** Where a jig lies on the table: the origin of its frame and how the frame is turned. */
export interface JigPose extends Vec {
  angle: number;
}

/** A box on the table (a clamp, a screw head): what the collision checks call a fixture. */
export interface TableZone {
  name: string;
  round?: boolean;
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/** A clamp that belongs to a jig, in the jig's frame. */
export interface JigClamp extends Vec {
  name: string;
  round?: boolean;
  /** Its footprint along and across its own axes, mm */
  width: number;
  depth: number;
  /** Direction of its width in the jig's frame, degrees */
  turn: number;
  /** Bottom and top, as heights above the work zero */
  bottom: number;
  top: number;
}

export interface Jig {
  id: string;
  name: string;
  /** One tag, or two far apart */
  tags: JigTag[];
  /** The X/Y work zero in the jig's frame */
  zero: Vec;
  /** Direction of the program's X axis in the jig's frame, degrees */
  turn: number;
  /** The job as it lay when the jig was taught */
  job: { fileName: string; text: string; toolDiameter: number };
  /** How far the job reaches from the point the measured angle turns about, mm */
  reach: number;
  clamps: JigClamp[];
  createdAt: number;
}

const DEG = 180 / Math.PI;

/** Degrees folded into (−180, 180]. */
export function foldDegrees(deg: number): number {
  const a = ((deg % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
}

function turned(p: Vec, deg: number): Vec {
  const c = Math.cos(deg / DEG);
  const s = Math.sin(deg / DEG);
  return { x: c * p.x - s * p.y, y: s * p.x + c * p.y };
}

/** Stored numbers: a tenth of a micrometre is plenty and keeps the records short. */
const kept = (v: number) => Number(v.toFixed(4));
const keptPoint = (p: Vec): Vec => ({ x: kept(p.x), y: kept(p.y) });

/** A point of the table in a jig's frame. */
export const toJig = (pose: JigPose, p: Vec): Vec =>
  turned({ x: p.x - pose.x, y: p.y - pose.y }, -pose.angle);

/** A point of a jig's frame on the table. */
export function fromJig(pose: JigPose, p: Vec): Vec {
  const q = turned(p, pose.angle);
  return { x: pose.x + q.x, y: pose.y + q.y };
}

/** Two tags closer than this do not give a direction, mm */
const MIN_BASELINE = 1;

/**
 * The frame one or two measured tags span: origin in the middle of the
 * first; x axis towards the second or, alone, along the first tag's own.
 * Null without a tag, or with two in the same place.
 */
export function jigFrame(readings: readonly TagReading[]): JigPose | null {
  const [a, b] = readings;
  if (!a) return null;
  if (!b) return { x: a.x, y: a.y, angle: a.angle };
  if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_BASELINE) return null;
  return { x: a.x, y: a.y, angle: Math.atan2(b.y - a.y, b.x - a.x) * DEG };
}

/**
 * What is kept of a setup when a jig is taught: its tags, and where the work
 * zero (`zero`, table XY) and the program lie in the jig's frame. The
 * program's axes are the table's at that moment.
 */
export function teachJig(
  readings: readonly TagReading[],
  zero: Vec,
): Pick<Jig, 'tags' | 'zero' | 'turn'> | null {
  const frame = jigFrame(readings);
  if (!frame) return null;
  return {
    tags: readings.slice(0, 2).map((r) => ({
      id: r.id,
      size: r.size,
      ...keptPoint(toJig(frame, r)),
      angle: kept(foldDegrees(r.angle - frame.angle)),
    })),
    zero: keptPoint(toJig(frame, zero)),
    turn: kept(foldDegrees(-frame.angle)),
  };
}

/** The tags of a jig are this much farther apart or closer than when it was taught, at most, mm */
export const JIG_DISTANCE_LIMIT = 1;
/** A tag is turned against the line through both by this much more or less than taught, at most, degrees */
export const JIG_ANGLE_LIMIT = 3;

/**
 * Why a jig cannot be placed from what was measured: a tag was not read
 * (`missing`), the two tags are not as far apart as they were (`distance` –
 * one has moved, or it is another jig), or a tag is turned differently on
 * the jig than it was (`turned` – stuck on anew).
 */
export type JigProblem = 'missing' | 'distance' | 'turned';

export interface JigPlace {
  /** Where the jig lies */
  pose: JigPose;
  /** The X/Y work zero on the table */
  zero: Vec;
  /** How far the program as taught is turned about the work zero, degrees */
  rotation: number;
  /** Measured minus taught distance of the two tags, mm; 0 with one tag */
  distanceError: number;
}

export interface JigTrouble {
  problem: JigProblem;
  /** The tag it is about */
  tag?: number;
}

/**
 * Where a taught jig lies now, from its tags as measured, and with it the
 * work zero and the turn of its program. With two tags the direction comes
 * from the line through both and the place from the middle between them, so
 * a small difference in their distance is shared out; with one tag both
 * come from that tag alone.
 */
export function locateJig(
  jig: Pick<Jig, 'tags' | 'zero' | 'turn'>,
  readings: readonly TagReading[],
): JigPlace | JigTrouble {
  const seen: TagReading[] = [];
  for (const tag of jig.tags) {
    const reading = readings.find((r) => r.id === tag.id);
    if (!reading) return { problem: 'missing', tag: tag.id };
    seen.push(reading);
  }
  const [t0, t1] = jig.tags;
  const [r0, r1] = seen;
  if (!t0 || !r0) return { problem: 'missing' };
  let angle: number;
  let distanceError = 0;
  let taughtMid: Vec = t0;
  let seenMid: Vec = r0;
  if (t1 && r1) {
    const taught = { x: t1.x - t0.x, y: t1.y - t0.y };
    const now = { x: r1.x - r0.x, y: r1.y - r0.y };
    distanceError = Math.hypot(now.x, now.y) - Math.hypot(taught.x, taught.y);
    if (Math.abs(distanceError) > JIG_DISTANCE_LIMIT) return { problem: 'distance' };
    angle = foldDegrees((Math.atan2(now.y, now.x) - Math.atan2(taught.y, taught.x)) * DEG);
    taughtMid = { x: (t0.x + t1.x) / 2, y: (t0.y + t1.y) / 2 };
    seenMid = { x: (r0.x + r1.x) / 2, y: (r0.y + r1.y) / 2 };
    // Each tag still sits on the jig the way it did: the code says which way round.
    for (const [tag, reading] of [
      [t0, r0],
      [t1, r1],
    ] as const) {
      if (Math.abs(foldDegrees(reading.angle - angle - tag.angle)) > JIG_ANGLE_LIMIT) {
        return { problem: 'turned', tag: tag.id };
      }
    }
  } else {
    angle = foldDegrees(r0.angle - t0.angle);
  }
  const offset = turned(taughtMid, angle);
  const pose = { x: seenMid.x - offset.x, y: seenMid.y - offset.y, angle };
  return {
    pose,
    zero: fromJig(pose, jig.zero),
    rotation: foldDegrees(angle + jig.turn),
    distanceError,
  };
}

/**
 * Where all tags of a jig should lie, judged from one of them alone: good
 * enough to drive the camera over the others. Null when the reading is not
 * of a tag of the jig.
 */
export function expectTags(
  jig: Pick<Jig, 'tags'>,
  reading: TagReading,
): (Vec & { id: number })[] | null {
  const tag = jig.tags.find((t) => t.id === reading.id);
  if (!tag) return null;
  const angle = reading.angle - tag.angle;
  const offset = turned(tag, angle);
  const pose = { x: reading.x - offset.x, y: reading.y - offset.y, angle };
  return jig.tags.map((t) => ({ id: t.id, ...fromJig(pose, t) }));
}

/** How well the camera places a corner or the middle of a tag at the crosshair, mm */
export const TAG_CORNER_ERROR = 0.1;

/** The point the measured angle turns about, in the jig's frame: the tag, or the middle of two. */
export function jigPivot(tags: readonly Vec[]): Vec {
  const [a, b] = tags;
  if (!a) return { x: 0, y: 0 };
  return b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: a.x, y: a.y };
}

/** How far the farthest of `points` (the job's corners, in the jig's frame) is from the pivot, mm. */
export function jigReach(tags: readonly Vec[], points: readonly Vec[]): number {
  const pivot = jigPivot(tags);
  return points.reduce((far, p) => Math.max(far, Math.hypot(p.x - pivot.x, p.y - pivot.y)), 0);
}

/**
 * What to expect of a jig placed by its tags. The place of a tag is good to
 * about `TAG_CORNER_ERROR`; the angle is the weak part: it rests on two
 * such points, as far apart as one tag is wide or as two tags lie apart.
 * `error` is what that adds up to at the far end of the job, `reach` mm
 * from the pivot.
 */
export function jigAccuracy(
  tags: readonly Pick<JigTag, 'x' | 'y' | 'size'>[],
  reach: number,
): { baseline: number; angle: number; error: number } {
  const [a, b] = tags;
  const baseline = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : (a?.size ?? 0);
  if (baseline <= 0) return { baseline: 0, angle: 90, error: Infinity };
  const slope = (2 * TAG_CORNER_ERROR) / baseline;
  return {
    baseline,
    angle: Math.atan(slope) * DEG,
    error: TAG_CORNER_ERROR + Math.max(0, reach) * slope,
  };
}

/** A clamp on the table as a clamp of the jig whose frame lies at `pose`. */
export function clampToJig(pose: JigPose, zone: TableZone): JigClamp {
  const centre = toJig(pose, {
    x: (zone.min.x + zone.max.x) / 2,
    y: (zone.min.y + zone.max.y) / 2,
  });
  return {
    name: zone.name,
    ...(zone.round ? { round: true } : {}),
    ...keptPoint(centre),
    width: kept(zone.max.x - zone.min.x),
    depth: kept(zone.max.y - zone.min.y),
    turn: kept(foldDegrees(-pose.angle)),
    bottom: zone.min.z,
    top: zone.max.z,
  };
}

/**
 * A clamp of a jig on the table, the jig lying at `pose`. Zones on the table
 * are boxes along the machine axes: a clamp that is turned now gets the box
 * around it – a little too large, never too small. A round one stays round.
 */
export function clampOnTable(pose: JigPose, clamp: JigClamp): TableZone {
  const centre = fromJig(pose, clamp);
  const a = (pose.angle + clamp.turn) / DEG;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const side = Math.min(clamp.width, clamp.depth);
  const halfX = clamp.round ? side / 2 : (c * clamp.width + s * clamp.depth) / 2;
  const halfY = clamp.round ? side / 2 : (s * clamp.width + c * clamp.depth) / 2;
  return {
    name: clamp.name,
    ...(clamp.round ? { round: true } : {}),
    min: { x: kept(centre.x - halfX), y: kept(centre.y - halfY), z: clamp.bottom },
    max: { x: kept(centre.x + halfX), y: kept(centre.y + halfY), z: clamp.top },
  };
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isPoint = (v: unknown): v is Vec => isObject(v) && finite(v.x) && finite(v.y);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

function isJigTag(v: unknown): v is JigTag {
  return (
    isPoint(v) &&
    isTagId((v as Partial<JigTag>).id) &&
    (TAG_SIZES as readonly unknown[]).includes((v as Partial<JigTag>).size) &&
    finite((v as Partial<JigTag>).angle)
  );
}

function isJigClamp(v: unknown): v is JigClamp {
  if (!isPoint(v)) return false;
  const c = v as Partial<JigClamp>;
  return (
    typeof c.name === 'string' &&
    [c.width, c.depth, c.turn, c.bottom, c.top].every(finite) &&
    c.width! > 0 &&
    c.depth! > 0
  );
}

/** A stored jig, or null when it is not one (storage of another version, a broken record). */
export function validateJig(value: unknown): Jig | null {
  if (!isObject(value)) return null;
  const j = value as Partial<Jig>;
  if (!isText(j.id) || !isText(j.name)) return null;
  if (!Array.isArray(j.tags) || j.tags.length < 1 || j.tags.length > 2) return null;
  if (!j.tags.every(isJigTag) || j.tags[0]!.id === j.tags[1]?.id) return null;
  if (!isPoint(j.zero) || !finite(j.turn) || !finite(j.reach) || !finite(j.createdAt)) return null;
  const job = j.job;
  if (!isObject(job) || !isText(job.fileName) || !isText(job.text)) return null;
  if (!finite(job.toolDiameter) || job.toolDiameter <= 0) return null;
  if (!Array.isArray(j.clamps) || !j.clamps.every(isJigClamp)) return null;
  return j as Jig;
}
