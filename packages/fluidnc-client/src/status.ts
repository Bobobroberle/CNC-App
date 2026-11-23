/** Axis values in report order (X, Y, Z, A …). */
export type AxisValues = number[];

export type MachineState =
  | 'Idle'
  | 'Run'
  | 'Hold'
  | 'Jog'
  | 'Alarm'
  | 'Door'
  | 'Check'
  | 'Home'
  | 'Sleep'
  | 'Unknown';

const STATES = new Set<MachineState>([
  'Idle',
  'Run',
  'Hold',
  'Jog',
  'Alarm',
  'Door',
  'Check',
  'Home',
  'Sleep',
]);

export interface Overrides {
  /** Percent */
  feed: number;
  rapid: number;
  spindle: number;
}

export interface Accessories {
  spindle: 'off' | 'cw' | 'ccw';
  flood: boolean;
  mist: boolean;
}

/** One `<…>` status report as sent by FluidNC. Fields are only present if reported. */
export interface StatusReport {
  state: MachineState;
  /** e.g. Hold:0 (complete) / Hold:1 (in progress), Door:0…3 */
  subState?: number;
  mpos?: AxisValues;
  wpos?: AxisValues;
  wco?: AxisValues;
  /** Current feed (units/min) */
  feed?: number;
  /** Current spindle speed */
  spindle?: number;
  /** Line number from `Ln:` (N word of the executing block) */
  lineNumber?: number;
  /** Planner blocks / RX bytes available, from `Bf:` */
  buffer?: { planner: number; rx: number };
  overrides?: Overrides;
  accessories?: Accessories;
  /** Triggered input pins, e.g. "XYZP" */
  pins?: string;
  /** SD card job progress from `SD:` */
  sd?: { percent: number; file: string };
  /** Unrecognised fields, verbatim */
  extra?: Record<string, string>;
}

const numbers = (text: string): number[] => text.split(',').map(Number);

export function isStatusReport(line: string): boolean {
  return line.startsWith('<') && line.endsWith('>');
}

/** Parses `<Idle|MPos:0,0,0|FS:0,0|…>`. Returns null if the line is not a status report. */
export function parseStatusReport(line: string): StatusReport | null {
  if (!isStatusReport(line)) return null;
  const [head = '', ...fields] = line.slice(1, -1).split('|');
  const [stateName = '', sub] = head.split(':');
  const report: StatusReport = {
    state: STATES.has(stateName as MachineState) ? (stateName as MachineState) : 'Unknown',
  };
  if (sub !== undefined && sub !== '') report.subState = Number(sub);

  for (const field of fields) {
    const colon = field.indexOf(':');
    const key = colon < 0 ? field : field.slice(0, colon);
    const value = colon < 0 ? '' : field.slice(colon + 1);
    switch (key) {
      case 'MPos':
        report.mpos = numbers(value);
        break;
      case 'WPos':
        report.wpos = numbers(value);
        break;
      case 'WCO':
        report.wco = numbers(value);
        break;
      case 'FS': {
        const [feed = 0, spindle = 0] = numbers(value);
        report.feed = feed;
        report.spindle = spindle;
        break;
      }
      case 'F':
        report.feed = Number(value);
        break;
      case 'Ln':
        report.lineNumber = Number(value);
        break;
      case 'Bf': {
        const [planner = 0, rx = 0] = numbers(value);
        report.buffer = { planner, rx };
        break;
      }
      case 'Ov': {
        const [feed = 100, rapid = 100, spindle = 100] = numbers(value);
        report.overrides = { feed, rapid, spindle };
        break;
      }
      case 'A':
        report.accessories = {
          spindle: value.includes('S') ? 'cw' : value.includes('C') ? 'ccw' : 'off',
          flood: value.includes('F'),
          mist: value.includes('M'),
        };
        break;
      case 'Pn':
        report.pins = value;
        break;
      case 'SD': {
        const comma = value.indexOf(',');
        report.sd =
          comma < 0
            ? { percent: Number(value), file: '' }
            : { percent: Number(value.slice(0, comma)), file: value.slice(comma + 1) };
        break;
      }
      default:
        report.extra = { ...report.extra, [key]: value };
    }
  }
  return report;
}

/** Complete machine status, merged from partial reports. */
export interface MachineStatus {
  state: MachineState;
  subState?: number;
  /** Machine position */
  mpos: AxisValues;
  /** Work position = MPos − WCO */
  wpos: AxisValues;
  wco: AxisValues;
  feed: number;
  spindle: number;
  lineNumber?: number;
  buffer?: { planner: number; rx: number };
  overrides: Overrides;
  accessories: Accessories;
  /** Empty when no pin is triggered */
  pins: string;
  sd?: { percent: number; file: string };
  /** Timestamp (ms) of the last report */
  updatedAt: number;
}

/**
 * Grbl/FluidNC only sends WCO and Ov every few reports and omits Pn/A when
 * nothing is active. The tracker keeps the last known values and derives the
 * missing position (MPos or WPos, depending on `$Report/Status`).
 */
export class StatusTracker {
  private current: MachineStatus | null = null;

  get status(): MachineStatus | null {
    return this.current;
  }

  reset(): void {
    this.current = null;
  }

  update(report: StatusReport, now = Date.now()): MachineStatus {
    const prev = this.current;
    const axisCount = (report.mpos ?? report.wpos ?? prev?.mpos ?? []).length;
    const wco = report.wco ?? prev?.wco ?? new Array<number>(axisCount).fill(0);
    const offset = (i: number) => wco[i] ?? 0;
    let mpos: AxisValues;
    let wpos: AxisValues;
    if (report.mpos) {
      mpos = report.mpos;
      wpos = mpos.map((v, i) => v - offset(i));
    } else if (report.wpos) {
      wpos = report.wpos;
      mpos = wpos.map((v, i) => v + offset(i));
    } else {
      mpos = prev?.mpos ?? [];
      wpos = mpos.map((v, i) => v - offset(i));
    }
    const status: MachineStatus = {
      state: report.state,
      mpos,
      wpos,
      wco,
      feed: report.feed ?? prev?.feed ?? 0,
      spindle: report.spindle ?? prev?.spindle ?? 0,
      overrides: report.overrides ?? prev?.overrides ?? { feed: 100, rapid: 100, spindle: 100 },
      // A: and Pn: are omitted when empty, so absence means "nothing active".
      accessories: report.accessories ?? { spindle: 'off', flood: false, mist: false },
      pins: report.pins ?? '',
      updatedAt: now,
    };
    if (report.subState !== undefined) status.subState = report.subState;
    if (report.lineNumber !== undefined) status.lineNumber = report.lineNumber;
    const buffer = report.buffer ?? prev?.buffer;
    if (buffer) status.buffer = buffer;
    if (report.sd) status.sd = report.sd;
    this.current = status;
    return status;
  }
}
