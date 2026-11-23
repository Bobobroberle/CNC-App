/** Position of all machine axes. X/Y/Z in mm, A in degrees. */
export interface Vec4 {
  x: number;
  y: number;
  z: number;
  a: number;
}

export type AxisKey = keyof Vec4;

export const AXES: readonly AxisKey[] = ['x', 'y', 'z', 'a'];

export const ZERO: Readonly<Vec4> = Object.freeze({ x: 0, y: 0, z: 0, a: 0 });

/** G17 = XY, G18 = ZX, G19 = YZ */
export type Plane = 'XY' | 'ZX' | 'YZ';

export type MotionMode = 'G0' | 'G1' | 'G2' | 'G3' | 'G80';

export type SpindleState = 'off' | 'cw' | 'ccw';

export interface ModalState {
  motion: MotionMode;
  plane: Plane;
  units: 'mm' | 'inch';
  distance: 'absolute' | 'incremental';
  arcDistance: 'absolute' | 'incremental';
  feedMode: 'unitsPerMinute' | 'inverseTime';
  /** 0 = G54 … 5 = G59 */
  wcs: number;
  spindle: SpindleState;
  mist: boolean;
  flood: boolean;
  /** mm/min (or deg/min) in G94, 1/min in G93 */
  feed: number;
  spindleSpeed: number;
  tool: number;
}

export const DEFAULT_MODAL_STATE: Readonly<ModalState> = Object.freeze({
  motion: 'G0',
  plane: 'XY',
  units: 'mm',
  distance: 'absolute',
  arcDistance: 'incremental',
  feedMode: 'unitsPerMinute',
  wcs: 0,
  spindle: 'off',
  mist: false,
  flood: false,
  feed: 0,
  spindleSpeed: 0,
  tool: 0,
});

export type Severity = 'error' | 'warning';

/**
 * Stable diagnostic codes. The UI translates them; `message` is an English
 * developer-facing description.
 */
export type DiagnosticCode =
  | 'unexpected-character'
  | 'unclosed-comment'
  | 'unsupported-expression'
  | 'misplaced-line-number'
  | 'duplicate-word'
  | 'unsupported-word'
  | 'unsupported-axis'
  | 'unsupported-gcode'
  | 'tool-length-table'
  | 'unsupported-mcode'
  | 'modal-group-conflict'
  | 'axis-words-without-motion'
  | 'missing-axis-words'
  | 'missing-feed-rate'
  | 'arc-missing-offsets'
  | 'arc-radius-too-small'
  | 'arc-radius-mismatch'
  | 'arc-full-circle-radius'
  | 'arc-offset-in-wrong-plane'
  | 'invalid-value'
  | 'unknown-position'
  | 'transform-unsupported'
  | 'transform-assumed-position';

export interface Diagnostic {
  severity: Severity;
  code: DiagnosticCode;
  /** 0-based index of the source line */
  lineIndex: number;
  message: string;
}

export type SegmentMotion = 'rapid' | 'linear' | 'arc';

export interface ArcInfo {
  plane: Plane;
  /** Centre in the two plane axes (machine frame), e.g. [x, y] for XY */
  center: [number, number];
  radius: number;
  /** Angle of the start point around the centre, radians */
  startAngle: number;
  /** Signed sweep in radians, positive = counter-clockwise in the plane */
  sweep: number;
}

export interface Segment {
  index: number;
  /** 0-based index of the source line */
  lineIndex: number;
  /** N word of the source line, if any */
  lineNumber?: number;
  motion: SegmentMotion;
  /** True for G53 moves */
  machineCoordinates: boolean;
  /**
   * Positions in the machine frame derived from the given work offsets. With
   * the default (all-zero) offsets they equal the program's work coordinates.
   */
  from: Vec4;
  to: Vec4;
  arc?: ArcInfo;
  /** mm/min (G94) or 1/min (G93) */
  feed: number;
  feedMode: ModalState['feedMode'];
  spindle: SpindleState;
  spindleSpeed: number;
  tool: number;
  /** Cartesian XYZ path length in mm (arc length for arcs) */
  length: number;
}

export type ProgramEventKind = 'toolChange' | 'dwell' | 'pause' | 'end' | 'spindle';

export interface ProgramEvent {
  kind: ProgramEventKind;
  lineIndex: number;
  /** Number of segments emitted before this event */
  segmentIndex: number;
  tool?: number;
  seconds?: number;
  spindle?: SpindleState;
  /** For pause: M0 (mandatory) or M1 (optional) */
  optional?: boolean;
}
