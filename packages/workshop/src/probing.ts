/**
 * Probe routines as data: a list of steps whose G-code may depend on the
 * results of earlier probes, and a function that turns the results into the
 * new zero point. All positions are machine coordinates (MPos), so the
 * routines do not depend on the active work offset; the zero is set with
 * `G10 L2 P0` (machine position of the work zero).
 */

export type Axis = 'x' | 'y' | 'z';
export type Results = Partial<Record<string, number>>;

export type ProbeStep =
  | { kind: 'move'; gcode: (r: Results) => string }
  | { kind: 'probe'; key: string; axis: Axis; gcode: (r: Results) => string };

export interface ProbeRoutine {
  name: 'z' | 'edge' | 'corner' | 'center' | 'toolLength';
  steps: ProbeStep[];
  /** Machine coordinates of the new work zero per axis */
  finish: (r: Results) => Partial<Record<Axis, number>>;
}

export interface ProbeParams {
  /** Search feed, mm/min */
  feed: number;
  /** Maximum search distance, mm */
  maxTravel: number;
  /** Back-off after contact, mm */
  retract: number;
  toolDiameter: number;
}

const f = (n: number) => String(Number(n.toFixed(3)));
const probe = (axis: Axis, distance: number, feed: number) =>
  `G91 G38.2 ${axis.toUpperCase()}${f(distance)} F${f(feed)}`;
const rel = (words: string) => `G91 G0 ${words}`;
const abs = (words: string) => `G90 G53 G0 ${words}`;

/** Start position of a routine: where the operator placed the tool (MPos). */
export interface Start {
  x: number;
  y: number;
  z: number;
}

/** Z on top of a touch plate of known thickness. */
export function zRoutine(p: ProbeParams, plateThickness: number): ProbeRoutine {
  return {
    name: 'z',
    steps: [
      { kind: 'probe', key: 'z', axis: 'z', gcode: () => probe('z', -p.maxTravel, p.feed) },
      { kind: 'move', gcode: () => rel(`Z${f(p.retract)}`) },
      { kind: 'move', gcode: () => 'G90' },
    ],
    finish: (r) => ({ z: r.z! - plateThickness }),
  };
}

/**
 * One edge along X or Y: the tool stands beside the workpiece, below its
 * top, and moves towards it (`direction` +1 or −1). The zero lies on the edge.
 * With an edge or corner plate in front of the workpiece, `wall` is the
 * thickness of the plate's side wall between tool and edge.
 */
export function edgeRoutine(
  p: ProbeParams,
  axis: 'x' | 'y',
  direction: 1 | -1,
  wall = 0,
): ProbeRoutine {
  const r = p.toolDiameter / 2;
  return {
    name: 'edge',
    steps: [
      { kind: 'probe', key: axis, axis, gcode: () => probe(axis, direction * p.maxTravel, p.feed) },
      { kind: 'move', gcode: () => rel(`${axis.toUpperCase()}${f(-direction * p.retract)}`) },
      { kind: 'move', gcode: () => 'G90' },
    ],
    finish: (res) => ({ [axis]: res[axis]! + direction * (r + wall) }),
  };
}

export type Corner = 'front-left' | 'front-right' | 'back-left' | 'back-right';

export interface CornerOptions {
  /** Thickness of the plate's top (Z); 0 when probing the bare workpiece */
  plateThickness: number;
  /**
   * Thickness of the side walls of an XYZ corner plate (wood does not
   * conduct, so the tool touches the plate's walls instead of the
   * workpiece); 0 when the workpiece itself is conductive.
   */
  wall?: number;
  /** Distance from the start position to the edges, mm (tool inside the corner) */
  inset: number;
  /** How far below the top surface the sides are probed, mm */
  depth: number;
}

/**
 * Outside corner, X, Y and Z in one go: Z on top, then each side from
 * outside. The tool starts above the workpiece (or the corner plate lying
 * on it), `inset` mm inside both edges.
 */
export function cornerRoutine(p: ProbeParams, corner: Corner, o: CornerOptions): ProbeRoutine {
  const r = p.toolDiameter / 2;
  // Probing direction towards the workpiece on each axis.
  const dx = corner.endsWith('left') ? 1 : -1;
  const dy = corner.startsWith('front') ? 1 : -1;
  const wall = o.wall ?? 0;
  const out = o.inset + wall + r + p.retract;
  const down = p.retract + o.depth + o.plateThickness;
  const side = (axis: 'x' | 'y', d: 1 | -1): ProbeStep[] => {
    const A = axis.toUpperCase();
    return [
      { kind: 'move', gcode: () => rel(`${A}${f(-d * out)}`) },
      { kind: 'move', gcode: () => rel(`Z${f(-down)}`) },
      { kind: 'probe', key: axis, axis, gcode: () => probe(axis, d * (out + p.maxTravel), p.feed) },
      { kind: 'move', gcode: () => rel(`${A}${f(-d * p.retract)}`) },
      { kind: 'move', gcode: () => rel(`Z${f(down)}`) },
    ];
  };
  return {
    name: 'corner',
    steps: [
      { kind: 'probe', key: 'z', axis: 'z', gcode: () => probe('z', -p.maxTravel, p.feed) },
      { kind: 'move', gcode: () => rel(`Z${f(p.retract)}`) },
      ...side('x', dx),
      { kind: 'move', gcode: (res) => abs(`X${f(res.x! + dx * (r + wall + o.inset))}`) },
      ...side('y', dy),
      { kind: 'move', gcode: () => 'G90' },
    ],
    finish: (res) => ({
      x: res.x! + dx * (r + wall),
      y: res.y! + dy * (r + wall),
      z: res.z! - o.plateThickness,
    }),
  };
}

/**
 * Centre of a bore or pocket: the tool starts roughly in the middle, below
 * the top. Probes both directions in X, moves to the X centre, then Y.
 */
export function centerRoutine(p: ProbeParams, start: Start): ProbeRoutine {
  return {
    name: 'center',
    steps: [
      { kind: 'probe', key: 'x1', axis: 'x', gcode: () => probe('x', p.maxTravel, p.feed) },
      { kind: 'move', gcode: () => abs(`X${f(start.x)}`) },
      { kind: 'probe', key: 'x2', axis: 'x', gcode: () => probe('x', -p.maxTravel, p.feed) },
      { kind: 'move', gcode: (r) => abs(`X${f((r.x1! + r.x2!) / 2)}`) },
      { kind: 'probe', key: 'y1', axis: 'y', gcode: () => probe('y', p.maxTravel, p.feed) },
      { kind: 'move', gcode: () => abs(`Y${f(start.y)}`) },
      { kind: 'probe', key: 'y2', axis: 'y', gcode: () => probe('y', -p.maxTravel, p.feed) },
      { kind: 'move', gcode: (r) => abs(`Y${f((r.y1! + r.y2!) / 2)}`) },
      { kind: 'move', gcode: () => 'G90' },
    ],
    finish: (r) => ({ x: (r.x1! + r.x2!) / 2, y: (r.y1! + r.y2!) / 2 }),
  };
}

/** Diameter of the bore measured by a centre routine. */
export function boreDiameter(r: Results, toolDiameter: number): { x: number; y: number } {
  return { x: r.x1! - r.x2! + toolDiameter, y: r.y1! - r.y2! + toolDiameter };
}

export interface ToolSetter {
  /** Machine position of the tool length sensor */
  x: number;
  y: number;
  /** Safe machine Z for travelling to it */
  safeZ: number;
}

/** Measures the tool length on a fixed sensor: fast search, back off, slow touch. */
export function toolLengthRoutine(p: ProbeParams, setter: ToolSetter): ProbeRoutine {
  return {
    name: 'toolLength',
    steps: [
      { kind: 'move', gcode: () => abs(`Z${f(setter.safeZ)}`) },
      { kind: 'move', gcode: () => abs(`X${f(setter.x)} Y${f(setter.y)}`) },
      { kind: 'probe', key: 'seek', axis: 'z', gcode: () => probe('z', -p.maxTravel, p.feed) },
      { kind: 'move', gcode: () => rel('Z2') },
      { kind: 'probe', key: 'z', axis: 'z', gcode: () => probe('z', -3, Math.max(10, p.feed / 4)) },
      { kind: 'move', gcode: () => abs(`Z${f(setter.safeZ)}`) },
      { kind: 'move', gcode: () => 'G90' },
    ],
    finish: () => ({}),
  };
}

/**
 * Tool length offset for FluidNC's dynamic TLO: a tool that touches the
 * sensor higher than the reference tool is longer.
 */
export function toolLengthOffsetCommand(referenceZ: number, measuredZ: number): string {
  return `G43.1 Z${f(measuredZ - referenceZ)}`;
}

/** Sets the work zero of the active system to machine positions (`G10 L2 P0`). */
export function zeroCommand(zero: Partial<Record<Axis, number>>): string | null {
  const words = (['x', 'y', 'z'] as const)
    .filter((a) => zero[a] !== undefined)
    .map((a) => `${a.toUpperCase()}${f(zero[a]!)}`);
  return words.length === 0 ? null : `G10 L2 P0 ${words.join(' ')}`;
}

/**
 * Contact position from a FluidNC probe report `[PRB:x,y,z:1]` (machine
 * coordinates), or null if the probe did not trigger.
 */
export function parseProbeReport(line: string): number[] | null {
  const m = /^\[PRB:([-\d.,]+):1\]$/.exec(line.trim());
  return m ? m[1]!.split(',').map(Number) : null;
}
