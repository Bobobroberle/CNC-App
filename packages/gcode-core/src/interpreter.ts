import { parseProgram, type ParsedLine } from './parser';
import {
  AXES,
  DEFAULT_MODAL_STATE,
  ZERO,
  type ArcInfo,
  type AxisKey,
  type Diagnostic,
  type ModalState,
  type MotionMode,
  type Plane,
  type ProgramEvent,
  type Segment,
  type SegmentMotion,
  type Vec4,
} from './types';

export const MM_PER_INCH = 25.4;

export interface InterpreterOptions {
  /** Machine-frame offsets of G54…G59 (index 0 = G54). Missing entries are zero. */
  wcsOffsets?: Vec4[];
  /** Start position in the machine frame. Defaults to all zero. */
  initialPosition?: Vec4;
  initialState?: Partial<ModalState>;
  /** Record per-line state (needed by the transformer). */
  recordLines?: boolean;
  /** Machine has a rotary axis A (default true). Without it, A words are errors. */
  rotaryAxis?: boolean;
}

/** What the axis words of a line were used for. */
export type AxisWordUse = 'none' | 'motion' | 'offset' | 'ignored';

export interface LineResult {
  lineIndex: number;
  stateBefore: ModalState;
  /** Work-frame position before / after the line */
  workBefore: Vec4;
  workAfter: Vec4;
  axisUse: AxisWordUse;
  /** True if the line was skipped because of an error */
  skipped: boolean;
}

export interface InterpretResult {
  segments: Segment[];
  events: ProgramEvent[];
  diagnostics: Diagnostic[];
  finalState: ModalState;
  /** Machine-frame position after the last line */
  finalPosition: Vec4;
  lines: LineResult[];
}

/** Grbl's tolerance for the arc end point radius check */
const ARC_RADIUS_TOLERANCE_ABS = 0.005;
const ARC_RADIUS_TOLERANCE_REL = 0.001;
const ARC_RADIUS_HARD_LIMIT = 0.5;
const ARC_ANGULAR_EPSILON = 5e-7;

const AXIS_LETTERS: Record<string, AxisKey> = { X: 'x', Y: 'y', Z: 'z', A: 'a' };
const VALUE_LETTERS = new Set(['X', 'Y', 'Z', 'A', 'I', 'J', 'K', 'R', 'F', 'S', 'T', 'P', 'L']);
const UNSUPPORTED_AXES = new Set(['B', 'C', 'U', 'V', 'W']);

/** G codes ×10, grouped by modal group. */
const G_GROUPS: Record<string, number[]> = {
  motion: [0, 10, 20, 30, 800, 382, 383, 384, 385],
  plane: [170, 180, 190],
  distance: [900, 910],
  arcDistance: [901, 911],
  units: [200, 210],
  feedMode: [930, 940],
  wcs: [540, 550, 560, 570, 580, 590],
  nonModal: [40, 100, 280, 281, 300, 301, 920, 921],
  absoluteOverride: [530],
  toolLength: [431, 490],
  cutterComp: [400],
  pathControl: [610],
};
const G_GROUP_OF = new Map<number, string>();
for (const [group, codes] of Object.entries(G_GROUPS)) {
  for (const code of codes) G_GROUP_OF.set(code, group);
}

const M_GROUPS: Record<string, number[]> = {
  stopping: [0, 1, 2, 30],
  spindle: [3, 4, 5],
  coolant: [7, 8, 9],
  toolChange: [6],
  io: [62, 63, 64, 65, 67, 68],
};
const M_GROUP_OF = new Map<number, string>();
for (const [group, codes] of Object.entries(M_GROUPS)) {
  for (const code of codes) M_GROUP_OF.set(code, group);
}

interface PlaneAxes {
  axis0: AxisKey;
  axis1: AxisKey;
  linear: AxisKey;
  offset0: string;
  offset1: string;
  /** Offset letter that does not belong to the plane */
  foreign: string;
}

const PLANES: Record<Plane, PlaneAxes> = {
  XY: { axis0: 'x', axis1: 'y', linear: 'z', offset0: 'I', offset1: 'J', foreign: 'K' },
  ZX: { axis0: 'z', axis1: 'x', linear: 'y', offset0: 'K', offset1: 'I', foreign: 'J' },
  YZ: { axis0: 'y', axis1: 'z', linear: 'x', offset0: 'J', offset1: 'K', foreign: 'I' },
};

export function planeAxes(plane: Plane): PlaneAxes {
  return PLANES[plane];
}

const MOTION_BY_CODE: Record<number, MotionMode> = {
  0: 'G0',
  10: 'G1',
  20: 'G2',
  30: 'G3',
  800: 'G80',
};

export function interpret(
  input: string | ParsedLine[],
  options: InterpreterOptions = {},
): InterpretResult {
  const lines = typeof input === 'string' ? parseProgram(input) : input;
  const wcsOffsets: Vec4[] = [];
  for (let i = 0; i < 6; i++) wcsOffsets.push({ ...(options.wcsOffsets?.[i] ?? ZERO) });
  let g92: Vec4 = { ...ZERO };
  let toolLengthOffset = 0;
  let position: Vec4 = { ...(options.initialPosition ?? ZERO) };
  const state: ModalState = { ...DEFAULT_MODAL_STATE, ...options.initialState };

  const segments: Segment[] = [];
  const events: ProgramEvent[] = [];
  const diagnostics: Diagnostic[] = [];
  const lineResults: LineResult[] = [];

  const offsetOf = (axis: AxisKey): number =>
    wcsOffsets[state.wcs]![axis] + g92[axis] + (axis === 'z' ? toolLengthOffset : 0);
  const toWork = (p: Vec4): Vec4 => ({
    x: p.x - offsetOf('x'),
    y: p.y - offsetOf('y'),
    z: p.z - offsetOf('z'),
    a: p.a - offsetOf('a'),
  });

  for (const line of lines) {
    const lineDiagnostics: Diagnostic[] = [...line.diagnostics];
    const stateBefore = options.recordLines ? { ...state } : state;
    const workBefore = options.recordLines ? toWork(position) : position;
    const result = executeLine(line, lineDiagnostics);
    diagnostics.push(...lineDiagnostics);
    if (options.recordLines) {
      lineResults.push({
        lineIndex: line.index,
        stateBefore,
        workBefore,
        workAfter: toWork(position),
        axisUse: result.axisUse,
        skipped: result.skipped,
      });
    }
  }

  return {
    segments,
    events,
    diagnostics,
    finalState: state,
    finalPosition: position,
    lines: lineResults,
  };

  function executeLine(
    line: ParsedLine,
    out: Diagnostic[],
  ): { axisUse: AxisWordUse; skipped: boolean } {
    const fail = (code: Diagnostic['code'], message: string) => {
      out.push({ severity: 'error', code, lineIndex: line.index, message });
      return { axisUse: 'none' as const, skipped: true };
    };
    const warn = (code: Diagnostic['code'], message: string) =>
      out.push({ severity: 'warning', code, lineIndex: line.index, message });

    if (out.some((d) => d.severity === 'error')) return { axisUse: 'none', skipped: true };
    if (line.system !== undefined) return { axisUse: 'none', skipped: false };

    const gCodes: number[] = [];
    const mCodes: number[] = [];
    const values: Record<string, number> = {};
    // CAM posts for tool tables emit "G43 Hn"; FluidNC only knows G43.1/G49 and rejects the line.
    if (line.words.some((w) => w.letter === 'G' && Math.round(w.value * 10) === 430)) {
      return fail('tool-length-table', 'G43 with a tool table (H word) is not supported');
    }
    for (const word of line.words) {
      if (word.letter === 'G') {
        gCodes.push(Math.round(word.value * 10));
      } else if (word.letter === 'M') {
        mCodes.push(Math.round(word.value));
      } else if (
        UNSUPPORTED_AXES.has(word.letter) ||
        (word.letter === 'A' && options.rotaryAxis === false)
      ) {
        return fail('unsupported-axis', `Axis ${word.letter} is not configured on this machine`);
      } else if (!VALUE_LETTERS.has(word.letter)) {
        return fail('unsupported-word', `Word ${word.letter} is not supported`);
      } else if (word.letter in values) {
        return fail('duplicate-word', `Word ${word.letter} appears more than once`);
      } else {
        values[word.letter] = word.value;
      }
    }

    const groupsSeen = new Map<string, number>();
    for (const code of gCodes) {
      const group = G_GROUP_OF.get(code);
      if (group === undefined) return fail('unsupported-gcode', `G${code / 10} is not supported`);
      if (groupsSeen.has(group)) {
        return fail('modal-group-conflict', `Two G codes of modal group "${group}" in one line`);
      }
      groupsSeen.set(group, code);
    }
    const mGroupsSeen = new Map<string, number>();
    for (const code of mCodes) {
      const group = M_GROUP_OF.get(code);
      if (group === undefined) return fail('unsupported-mcode', `M${code} is not supported`);
      if (mGroupsSeen.has(group) && group !== 'coolant' && group !== 'io') {
        return fail('modal-group-conflict', `Two M codes of modal group "${group}" in one line`);
      }
      mGroupsSeen.set(group, code);
    }
    const g = (group: string) => groupsSeen.get(group);

    // Modal values of this block that influence unit conversion come first.
    const units = g('units') === undefined ? state.units : g('units') === 200 ? 'inch' : 'mm';
    const unitFactor = units === 'inch' ? MM_PER_INCH : 1;
    const feedMode =
      g('feedMode') === undefined
        ? state.feedMode
        : g('feedMode') === 930
          ? 'inverseTime'
          : 'unitsPerMinute';

    const hasAxisWords = AXES.some((axis) => axis.toUpperCase() in values);
    const nonModal = g('nonModal');
    const motionCode = g('motion');
    let motion: MotionMode = state.motion;
    let probe = false;
    if (motionCode !== undefined) {
      if (motionCode >= 382 && motionCode <= 385) probe = true;
      else motion = MOTION_BY_CODE[motionCode]!;
    }

    // Validate everything that can fail before changing state.
    const consumesAxes =
      nonModal === 100 ||
      nonModal === 280 ||
      nonModal === 300 ||
      nonModal === 920 ||
      g('toolLength') === 431;
    const moves = hasAxisWords && !consumesAxes;
    if (moves && !probe && motion === 'G80') {
      return fail('axis-words-without-motion', 'Axis words without an active motion mode');
    }
    const isArc = !probe && (motion === 'G2' || motion === 'G3');
    if (isArc && motionCode !== undefined && !hasAxisWords && !consumesAxes) {
      return fail('missing-axis-words', 'Arc without axis words in the active plane');
    }
    if (values.P !== undefined && values.P < 0) {
      return fail('invalid-value', 'P must be a non-negative number');
    }
    if (nonModal === 40 && values.P === undefined) {
      return fail('invalid-value', 'G4 requires a P word (seconds)');
    }
    if (nonModal === 100) {
      const l = values.L;
      const p = values.P;
      if ((l !== 2 && l !== 20) || p === undefined || !Number.isInteger(p) || p > 6) {
        return fail('invalid-value', 'G10 requires L2 or L20 and P0…P6');
      }
    }
    if (g('toolLength') === 431 && values.Z === undefined) {
      return fail('missing-axis-words', 'G43.1 requires a Z word');
    }
    const machineCoordinates = g('absoluteOverride') === 530;
    if (machineCoordinates && moves && motion !== 'G0' && motion !== 'G1' && !probe) {
      return fail('invalid-value', 'G53 is only valid with G0 or G1');
    }
    const feedGiven = values.F !== undefined;
    let feed = state.feed;
    if (feedMode === 'inverseTime' && state.feedMode !== 'inverseTime') feed = 0;
    if (feedGiven) {
      if (values.F! < 0) return fail('invalid-value', 'F must not be negative');
      feed = feedMode === 'inverseTime' ? values.F! : values.F! * unitFactor;
    }
    if (moves && !probe && motion !== 'G0') {
      if (feedMode === 'inverseTime' && !feedGiven) {
        return fail('missing-feed-rate', 'Inverse time mode (G93) requires F on every move');
      }
      if (feed <= 0) return fail('missing-feed-rate', 'Feed move without a feed rate');
    }
    if (values.S !== undefined && values.S < 0)
      return fail('invalid-value', 'S must not be negative');

    let axisUse: AxisWordUse = hasAxisWords ? 'motion' : 'none';

    // 1. Feed mode, F, S, T
    state.feedMode = feedMode;
    state.feed = feed;
    if (values.S !== undefined) state.spindleSpeed = values.S;
    if (values.T !== undefined) state.tool = values.T;
    // 2. M6
    if (mGroupsSeen.has('toolChange')) {
      events.push({
        kind: 'toolChange',
        lineIndex: line.index,
        segmentIndex: segments.length,
        tool: state.tool,
      });
    }
    // 3. Spindle, coolant
    if (mGroupsSeen.has('spindle')) {
      const code = mGroupsSeen.get('spindle');
      state.spindle = code === 3 ? 'cw' : code === 4 ? 'ccw' : 'off';
      events.push({
        kind: 'spindle',
        lineIndex: line.index,
        segmentIndex: segments.length,
        spindle: state.spindle,
      });
    }
    for (const code of mCodes) {
      if (code === 7) state.mist = true;
      if (code === 8) state.flood = true;
      if (code === 9) {
        state.mist = false;
        state.flood = false;
      }
    }
    // 4. Dwell
    if (nonModal === 40) {
      events.push({
        kind: 'dwell',
        lineIndex: line.index,
        segmentIndex: segments.length,
        seconds: values.P!,
      });
    }
    // 5. Plane, units, tool length, WCS, distance modes
    const plane = g('plane');
    if (plane !== undefined) state.plane = plane === 170 ? 'XY' : plane === 180 ? 'ZX' : 'YZ';
    state.units = units;
    if (g('toolLength') === 431) {
      toolLengthOffset = values.Z! * unitFactor;
      axisUse = 'offset';
    }
    if (g('toolLength') === 490) toolLengthOffset = 0;
    const wcs = g('wcs');
    if (wcs !== undefined) state.wcs = wcs / 10 - 54;
    const distance = g('distance');
    if (distance !== undefined) state.distance = distance === 900 ? 'absolute' : 'incremental';
    const arcDistance = g('arcDistance');
    if (arcDistance !== undefined) {
      state.arcDistance = arcDistance === 901 ? 'absolute' : 'incremental';
    }

    // 6. Non-modal commands that consume axis words
    const axisValue = (axis: AxisKey): number | undefined => {
      const v = values[axis.toUpperCase()];
      return v === undefined ? undefined : axis === 'a' ? v : v * unitFactor;
    };
    if (nonModal === 100) {
      axisUse = hasAxisWords ? 'offset' : 'none';
      const index = values.P === 0 ? state.wcs : values.P! - 1;
      for (const axis of AXES) {
        const v = axisValue(axis);
        if (v === undefined) continue;
        if (values.L === 2) {
          wcsOffsets[index]![axis] = v;
        } else {
          wcsOffsets[index]![axis] =
            position[axis] - g92[axis] - (axis === 'z' ? toolLengthOffset : 0) - v;
        }
      }
    } else if (nonModal === 920) {
      axisUse = hasAxisWords ? 'offset' : 'none';
      for (const axis of AXES) {
        const v = axisValue(axis);
        if (v === undefined) continue;
        g92[axis] =
          position[axis] - wcsOffsets[state.wcs]![axis] - (axis === 'z' ? toolLengthOffset : 0) - v;
      }
    } else if (nonModal === 921) {
      g92 = { ...ZERO };
    } else if (nonModal === 280 || nonModal === 300) {
      axisUse = hasAxisWords ? 'ignored' : 'none';
      warn(
        'unknown-position',
        `G${nonModal / 10} moves to a stored position unknown to the preview`,
      );
    }

    // 7. Motion
    if (motionCode !== undefined && !probe) state.motion = motion;
    if (probe && hasAxisWords && !consumesAxes) {
      axisUse = 'ignored';
      warn('unknown-position', 'Probe move: the end position depends on the probe contact');
    } else if (moves) {
      const target = { ...position };
      for (const axis of AXES) {
        const v = axisValue(axis);
        if (v === undefined) continue;
        if (machineCoordinates) target[axis] = v;
        else if (state.distance === 'absolute') target[axis] = v + offsetOf(axis);
        else target[axis] = position[axis] + v;
      }
      if (motion === 'G0' || motion === 'G1') {
        addSegment(line, motion === 'G0' ? 'rapid' : 'linear', target, machineCoordinates);
      } else {
        const arc = computeArc(line, values, target, unitFactor, out);
        if (arc === null) return { axisUse: 'none', skipped: true };
        addSegment(line, 'arc', target, false, arc);
      }
    }

    // 8. Stops
    const stop = mGroupsSeen.get('stopping');
    if (stop === 0 || stop === 1) {
      events.push({
        kind: 'pause',
        lineIndex: line.index,
        segmentIndex: segments.length,
        optional: stop === 1,
      });
    } else if (stop === 2 || stop === 30) {
      events.push({ kind: 'end', lineIndex: line.index, segmentIndex: segments.length });
      state.motion = 'G1';
      state.plane = 'XY';
      state.distance = 'absolute';
      state.feedMode = 'unitsPerMinute';
      state.wcs = 0;
      state.spindle = 'off';
      state.mist = false;
      state.flood = false;
    }
    return { axisUse, skipped: false };
  }

  function computeArc(
    line: ParsedLine,
    values: Record<string, number>,
    target: Vec4,
    unitFactor: number,
    out: Diagnostic[],
  ): ArcInfo | null {
    const fail = (code: Diagnostic['code'], message: string) => {
      out.push({ severity: 'error', code, lineIndex: line.index, message });
      return null;
    };
    const p = PLANES[state.plane];
    const clockwise = state.motion === 'G2';
    if (!(p.axis0.toUpperCase() in values) && !(p.axis1.toUpperCase() in values)) {
      return fail('missing-axis-words', 'Arc without axis words in the active plane');
    }
    const start0 = position[p.axis0];
    const start1 = position[p.axis1];
    const end0 = target[p.axis0];
    const end1 = target[p.axis1];
    let offset0: number;
    let offset1: number;

    if (values.R !== undefined) {
      let r = values.R * unitFactor;
      const x = end0 - start0;
      const y = end1 - start1;
      if (x === 0 && y === 0) {
        return fail('arc-full-circle-radius', 'A full circle cannot be programmed with R');
      }
      let h = 4 * r * r - x * x - y * y;
      if (h < 0) {
        // Allow tiny rounding errors from CAM output.
        if (h < -1e-6 * Math.max(1, r * r)) {
          return fail('arc-radius-too-small', 'Arc radius is smaller than half the chord');
        }
        h = 0;
      }
      let hRatio = -Math.sqrt(h) / Math.hypot(x, y);
      if (!clockwise) hRatio = -hRatio;
      if (r < 0) {
        hRatio = -hRatio;
        r = -r;
      }
      offset0 = 0.5 * (x - y * hRatio);
      offset1 = 0.5 * (y + x * hRatio);
    } else {
      if (values[p.foreign] !== undefined) {
        return fail(
          'arc-offset-in-wrong-plane',
          `${p.foreign} is not an offset of the active plane`,
        );
      }
      const o0 = values[p.offset0];
      const o1 = values[p.offset1];
      if (o0 === undefined && o1 === undefined) {
        return fail('arc-missing-offsets', 'Arc requires I/J/K offsets or R');
      }
      if (state.arcDistance === 'absolute') {
        offset0 = (o0 ?? 0) * unitFactor + offsetOf(p.axis0) - start0;
        offset1 = (o1 ?? 0) * unitFactor + offsetOf(p.axis1) - start1;
      } else {
        offset0 = (o0 ?? 0) * unitFactor;
        offset1 = (o1 ?? 0) * unitFactor;
      }
    }

    const center0 = start0 + offset0;
    const center1 = start1 + offset1;
    const radius = Math.hypot(offset0, offset1);
    const endRadius = Math.hypot(end0 - center0, end1 - center1);
    const deltaR = Math.abs(endRadius - radius);
    if (
      deltaR > ARC_RADIUS_TOLERANCE_ABS &&
      (deltaR > ARC_RADIUS_HARD_LIMIT || deltaR > ARC_RADIUS_TOLERANCE_REL * radius)
    ) {
      return fail(
        'arc-radius-mismatch',
        `End point is ${deltaR.toFixed(4)} mm off the arc radius ${radius.toFixed(4)} mm`,
      );
    }

    const r0 = -offset0;
    const r1 = -offset1;
    const rt0 = end0 - center0;
    const rt1 = end1 - center1;
    let sweep = Math.atan2(r0 * rt1 - r1 * rt0, r0 * rt0 + r1 * rt1);
    if (clockwise) {
      if (sweep >= -ARC_ANGULAR_EPSILON) sweep -= 2 * Math.PI;
    } else if (sweep <= ARC_ANGULAR_EPSILON) {
      sweep += 2 * Math.PI;
    }
    return {
      plane: state.plane,
      center: [center0, center1],
      radius,
      startAngle: Math.atan2(r1, r0),
      sweep,
    };
  }

  function addSegment(
    line: ParsedLine,
    motion: SegmentMotion,
    target: Vec4,
    machineCoordinates: boolean,
    arc?: ArcInfo,
  ) {
    const from = position;
    let length: number;
    if (arc) {
      const linear = PLANES[arc.plane].linear;
      length = Math.hypot(arc.sweep * arc.radius, target[linear] - from[linear]);
    } else {
      length = Math.hypot(target.x - from.x, target.y - from.y, target.z - from.z);
    }
    const segment: Segment = {
      index: segments.length,
      lineIndex: line.index,
      motion,
      machineCoordinates,
      from,
      to: target,
      feed: motion === 'rapid' ? 0 : state.feed,
      feedMode: state.feedMode,
      spindle: state.spindle,
      spindleSpeed: state.spindleSpeed,
      tool: state.tool,
      length,
    };
    if (line.lineNumber !== undefined) segment.lineNumber = line.lineNumber;
    if (arc) segment.arc = arc;
    segments.push(segment);
    position = target;
  }
}
