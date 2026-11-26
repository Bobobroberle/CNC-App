/**
 * A LowRider with FluidNC, simulated in the browser: answers like the real
 * controller (status reports, ok/error, $ commands, config file), executes
 * jogs and G-code in real time and leaves marks where the tool dips into the
 * material, for the simulated camera to see. The mechanics have small known
 * errors (scale, squareness, play, Z tilt) so the calibration has something
 * to find. Everything is in machine millimetres.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** What is wrong with the simulated machine, on purpose. */
export const SIM_ERRORS = {
  /** mm travelled per commanded mm */
  kx: 1.0015,
  ky: 0.9985,
  /** Lean of the Y motion towards +X, degrees */
  gamma: 0.08,
  /** Play of X after a move towards −X, mm */
  playX: 0.05,
  /** Sideways lean of Z, mm in X per mm of Z */
  tiltZ: 0.0015,
};

/** Top of the material, machine Z. */
export const SURFACE_Z = -80;

/** A cut the tool left behind, as the camera sees it from above. */
export interface Mark {
  /** Physical XY where the tool cut, mm */
  x: number;
  y: number;
  /** For a groove: where it ended */
  x2?: number;
  y2?: number;
  /** Radius of the cut, mm */
  r: number;
  /** Lowest point of the cut, machine Z */
  z: number;
}

/**
 * The board on the table: 12 mm birch plywood lying 1.5° askew, with two
 * Ø 8 holes 200 mm apart and one Ø 6. Positions on it are counted from its
 * front left corner as it lies at the start (front up).
 */
export const SIM_BOARD = {
  x: 420,
  y: 120,
  angle: 1.5,
  width: 400,
  height: 250,
  thickness: 12,
  holes: [
    { x: 20, y: 20, r: 4 },
    { x: 220, y: 20, r: 4 },
    { x: 20, y: 200, r: 3 },
  ],
};

/**
 * What lies on the table: the board with the dot plate beside it, or – the
 * table cleared – a handful of small blanks for a series, a jig with
 * printed tags that holds a coaster, or a board longer than the machine
 * reaches.
 */
export type SimScene = 'board' | 'blanks' | 'jig' | 'long';

/**
 * The board of the long scene: 2.6 m of pine along X, more than twice what
 * the machine travels there, lying a little askew. Positions on it are
 * counted from its front left corner.
 */
export const SIM_LONG = { x: 60, y: 150, angle: 0.3, length: 2600, width: 300 };

/** A printed tag stuck on the long board, in the board's coordinates. */
export interface SimTag {
  id: number;
  x: number;
  y: number;
  /** degrees, counter-clockwise */
  angle: number;
  size: number;
}

/**
 * How the long board comes to lie when it is slid along by hand: a little
 * farther or less far than asked, a little sideways and turned – differently
 * each time (mm, degrees).
 */
const SLID_BY_HAND = [
  { x: 14, y: -6, angle: 0.35 },
  { x: -11, y: 7, angle: -0.3 },
  { x: 8, y: 4, angle: 0.2 },
];

/**
 * The jig of the jig scene: a dark plate with a square coaster in its pocket
 * and two 40 mm tags far apart, the second stuck on a quarter turn round.
 * Positions are counted from the plate's front left corner; `blank` is the
 * coaster by its middle.
 */
export const SIM_JIG = {
  width: 220,
  height: 150,
  blank: { x: 110, y: 75, size: 90 },
  tags: [
    { id: 1, x: 30, y: 30, angle: 0, size: 40 },
    { id: 2, x: 190, y: 120, angle: 90, size: 40 },
  ],
};

/** Where a thing lies on the table: a corner of it and how it is turned. */
export interface SimPlace {
  x: number;
  y: number;
  /** degrees, counter-clockwise */
  angle: number;
}

/**
 * Where the jig comes to lie, one after the other: every time it is put on
 * the table (the scene switched on) or moved, it lies at the next of these –
 * shifted and turned by a few degrees, then by a quarter and a half turn.
 */
export const SIM_JIG_PLACES: readonly SimPlace[] = [
  { x: 470, y: 160, angle: 3 },
  { x: 590, y: 225, angle: -5.5 },
  { x: 720, y: 150, angle: 92 },
  { x: 760, y: 345, angle: 183 },
];

/** A small blank on the table, by its middle (physical table XY). */
export interface SimBlank {
  id: string;
  shape: 'rect' | 'round';
  x: number;
  y: number;
  /** Long and short side; a round blank's diameter twice, mm */
  length: number;
  width: number;
  /** Direction of the long side, degrees counter-clockwise */
  angle: number;
  /** Pushed against its neighbour: the camera sees no gap between the two */
  touching?: boolean;
}

/**
 * The blanks of the series scene, as thrown onto the table: three key tags
 * at odd angles, a round coaster, a square one, a long sign (longer than one
 * camera picture) and two tags of which one lies with a corner on the other.
 */
export const SIM_BLANKS: readonly SimBlank[] = [
  { id: 'tag-1', shape: 'rect', x: 450, y: 175, length: 70, width: 40, angle: 20 },
  { id: 'tag-2', shape: 'rect', x: 560, y: 165, length: 70, width: 40, angle: -35 },
  { id: 'tag-3', shape: 'rect', x: 665, y: 185, length: 70, width: 40, angle: 78 },
  { id: 'round', shape: 'round', x: 455, y: 295, length: 60, width: 60, angle: 0 },
  { id: 'square', shape: 'rect', x: 560, y: 290, length: 55, width: 55, angle: 12 },
  { id: 'sign', shape: 'rect', x: 700, y: 335, length: 150, width: 40, angle: -4 },
  { id: 'pair-1', shape: 'rect', x: 765, y: 180, length: 70, width: 40, angle: 0, touching: true },
  { id: 'pair-2', shape: 'rect', x: 782, y: 224, length: 70, width: 40, angle: 22, touching: true },
];

/** A point of the table in a blank's own coordinates: from its middle, x along its long side. */
export function toBlank(blank: SimBlank, p: Point2): Point2 {
  const a = (blank.angle * Math.PI) / 180;
  const dx = p.x - blank.x;
  const dy = p.y - blank.y;
  return { x: Math.cos(a) * dx + Math.sin(a) * dy, y: -Math.sin(a) * dx + Math.cos(a) * dy };
}

/** Whether a point of the table lies on a blank. */
export function onBlank(blank: SimBlank, p: Point2): boolean {
  const q = toBlank(blank, p);
  return blank.shape === 'round'
    ? Math.hypot(q.x, q.y) <= blank.length / 2
    : Math.abs(q.x) <= blank.length / 2 && Math.abs(q.y) <= blank.width / 2;
}

/** Where the board lies: its corner, its angle, and which side is up. */
export interface BoardPose {
  x: number;
  y: number;
  /** degrees, counter-clockwise */
  angle: number;
  /** Back up: seen from above, its own Y runs clockwise from its X */
  flipped: boolean;
}

/** A cut in the board, in the board's own coordinates (as seen from its front). */
export interface BoardMark extends Mark {
  /** Cut from the back */
  back: boolean;
  /** Goes through the board: seen from both sides */
  through: boolean;
}

interface Point2 {
  x: number;
  y: number;
}

/**
 * How a turned board comes to lie when it is put down by hand: a little
 * shifted and turned, differently each time (mm, degrees).
 */
const BY_HAND = [
  { x: 2.6, y: -1.9, angle: 1.4 },
  { x: -1.7, y: 2.3, angle: -1.1 },
  { x: 1.2, y: 2.8, angle: 0.8 },
  { x: -2.9, y: -1.1, angle: -1.6 },
];

type State = 'Idle' | 'Run' | 'Jog' | 'Hold' | 'Alarm' | 'Home';

interface Move {
  to: Vec3;
  /** mm/min */
  feed: number;
  jog: boolean;
  /** Dwell instead of a move, seconds */
  dwell?: number;
  /** Lines answered once this move is done (e.g. probe result, homed message) */
  after?: string[];
  /** Becomes the probe target: stops at the material */
  probe?: boolean;
  /** A cutting move (G1/G2/G3): the feed override applies to it */
  cut?: boolean;
}

const TRAVEL = {
  x: { min: 3, max: 1223 },
  y: { min: 3, max: 2443 },
  z: { min: -297, max: 3 },
};

const RAPID = 3000;

/**
 * The simulated gantry, as far as squaring it goes: the distance of the two Y rails, the side motor 1 sits on and the
 * way Y homes. What the operator is asked for in the accuracy check is true here. After every homing of Y the lean of
 * the axes is the machine's own (`SIM_ERRORS.gamma`: the switches are not quite level) plus what the two pull-offs make
 * of the gantry – so a correction written to config.yaml acts after the next homing, and a wrong side makes it worse.
 */
export const SIM_GANTRY = {
  width: 1400,
  motor1Side: 'xMax' as 'xMin' | 'xMax',
  homingPositive: false,
};

/** Config items the simulator keeps (`$/axes/x/max_rate_mm_per_min=…`) */
const SETTING_KEYS: Record<string, string> = {
  'axes/x/steps_per_mm': 'stepsX',
  'axes/y/steps_per_mm': 'stepsY',
  'axes/y/motor0/pulloff_mm': 'pulloff0',
  'axes/y/motor1/pulloff_mm': 'pulloff1',
  'axes/x/max_rate_mm_per_min': 'maxRateX',
  'axes/y/max_rate_mm_per_min': 'maxRateY',
  'axes/z/max_rate_mm_per_min': 'maxRateZ',
  'axes/x/acceleration_mm_per_sec2': 'accelX',
  'axes/y/acceleration_mm_per_sec2': 'accelY',
  'axes/z/acceleration_mm_per_sec2': 'accelZ',
};
const PLANNER_BLOCKS = 16;

const fmt = (v: number) => v.toFixed(3);

function configText(c: Record<string, string>): string {
  return [
    'board: Jackpot V2 TMC2226',
    'name: LowRider v4 (Simulator)',
    'start:',
    '  must_home: false',
    'axes:',
    '  x:',
    `    steps_per_mm: ${c.stepsX}`,
    `    max_rate_mm_per_min: ${c.maxRateX}`,
    `    acceleration_mm_per_sec2: ${c.accelX}`,
    '    max_travel_mm: 1220',
    '    soft_limits: false',
    '    homing:',
    '      cycle: 2',
    '      positive_direction: false',
    '      mpos_mm: 3',
    '    motor0:',
    '      pulloff_mm: 4.000',
    '  y:',
    `    steps_per_mm: ${c.stepsY}`,
    `    max_rate_mm_per_min: ${c.maxRateY}`,
    `    acceleration_mm_per_sec2: ${c.accelY}`,
    '    max_travel_mm: 2440',
    '    soft_limits: false',
    '    homing:',
    '      cycle: 2',
    '      positive_direction: false',
    '      mpos_mm: 3',
    '    motor0:',
    `      pulloff_mm: ${c.pulloff0}`,
    '    motor1:',
    `      pulloff_mm: ${c.pulloff1}`,
    '  z:',
    '    steps_per_mm: 200.000',
    `    max_rate_mm_per_min: ${c.maxRateZ}`,
    `    acceleration_mm_per_sec2: ${c.accelZ}`,
    '    max_travel_mm: 300.000',
    '    soft_limits: false',
    '    homing:',
    '      cycle: 1',
    '      positive_direction: true',
    '      mpos_mm: 3',
  ].join('\n');
}

export class Simulator {
  mpos: Vec3 = { x: 160, y: 140, z: -60 };
  state: State = 'Idle';
  /** Offsets G54–G59 (machine position of each work zero) */
  wcs: Record<string, Vec3> = Object.fromEntries(
    ['G54', 'G55', 'G56', 'G57', 'G58', 'G59'].map((k) => [k, { x: 0, y: 0, z: 0 }]),
  );
  active = 'G54';
  absolute = true;
  feed = 1000;
  spindle = 0;
  /** Feed and spindle override in percent (realtime bytes 0x90–0x94, 0x99–0x9d) */
  overrides = { feed: 100, spindle: 100 };
  tool = 1;
  marks: Mark[] = [];
  /** Radius of the cutter in the spindle, mm: how wide its cuts are */
  toolRadius = 0.5;
  /** What lies on the table */
  scene: SimScene = 'board';
  /** Where the jig of the jig scene lies: its front left corner and its angle */
  jig: SimPlace = SIM_JIG_PLACES[0]!;
  /** What was cut into the jig and its coaster before it was last moved (the plate's coordinates) */
  jigMarks: Mark[] = [];
  private jigMoves = 0;
  private jigShown = 0;
  /** Where the board of the long scene lies: its front left corner and its angle */
  long: SimPlace = { x: SIM_LONG.x, y: SIM_LONG.y, angle: SIM_LONG.angle };
  /** What was cut into the long board before it was last slid along (the board's coordinates) */
  longMarks: Mark[] = [];
  /** The tags stuck on the long board */
  longTags: SimTag[] = [];
  private slides = 0;
  /** Where the board lies and which side is up */
  board: BoardPose = { x: SIM_BOARD.x, y: SIM_BOARD.y, angle: SIM_BOARD.angle, flipped: false };
  /** What was cut into the board before it was last turned */
  boardMarks: BoardMark[] = [];
  /** Cuts that went through the board into the spoilboard; the board lies on them now */
  spoil: Mark[] = [];
  /** Files on the SD card */
  files = new Map<string, string>();
  /** The file running from the SD card */
  private job: { name: string; lines: string[]; index: number } | null = null;
  private flips = 0;
  /** Time lapse factor: the demo setup runs the machine fast, then back to real time */
  speed = 1;
  /** Direction of the last X move (for the play) */
  private lastX = 1;
  /** Lean of the axes in degrees (+ = the X+ end of the gantry ahead towards +Y): set by every homing of Y */
  private lean = SIM_ERRORS.gamma;
  private queue: Move[] = [];
  private moveStart: Vec3 | null = null;
  private moveElapsed = 0;
  private config: Record<string, string> = {
    stepsX: '50.000',
    stepsY: '50.000',
    pulloff0: '4.000',
    pulloff1: '4.000',
    maxRateX: '9000.000',
    maxRateY: '9000.000',
    maxRateZ: '1200.000',
    accelX: '200.000',
    accelY: '200.000',
    accelZ: '80.000',
  };
  /**
   * Files on the controller's own flash. config.yaml as a person wrote it –
   * with a comment and blank lines, which FluidNC's own `$CD` would not keep.
   */
  localFiles = new Map<string, string>([
    [
      'config.yaml',
      `# V1E LowRider v4 – simulated Jackpot\n${configText(this.config).replace(/\n(axes|start):/g, '\n\n$1:')}\n`,
    ],
  ]);
  /** Answers waiting for the machine (ok after G4 P0, a free planner block …) */
  private waiting: { until: 'idle' | 'block'; lines: string[] }[] = [];

  /** Where the tool physically is, with the machine's errors. */
  physical(p: Vec3 = this.mpos): Vec3 {
    const g = (this.lean * Math.PI) / 180;
    return {
      x:
        SIM_ERRORS.kx * p.x +
        SIM_ERRORS.ky * Math.sin(g) * p.y -
        (this.lastX < 0 ? SIM_ERRORS.playX : 0) +
        SIM_ERRORS.tiltZ * p.z,
      y: SIM_ERRORS.ky * Math.cos(g) * p.y,
      z: p.z,
    };
  }

  /** Commanded machine XY that brings the tool physically to `p` at height `z` (inverse of `physical`). */
  commandedFor(p: { x: number; y: number }, z: number): { x: number; y: number } {
    const g = (this.lean * Math.PI) / 180;
    const y = p.y / (SIM_ERRORS.ky * Math.cos(g));
    const play = this.lastX < 0 ? SIM_ERRORS.playX : 0;
    const x = (p.x - SIM_ERRORS.ky * Math.sin(g) * y + play - SIM_ERRORS.tiltZ * z) / SIM_ERRORS.kx;
    return { x, y };
  }

  get busy(): boolean {
    return this.queue.length > 0;
  }

  status(): string {
    const w = this.wcs[this.active]!;
    const m = this.queue[0];
    const feed = m && !m.dwell ? this.rate(m, this.mpos) : 0;
    const rpm = Math.round((this.spindle * this.overrides.spindle) / 100);
    const sd = this.job
      ? `|SD:${((100 * this.job.index) / Math.max(1, this.job.lines.length)).toFixed(2)},/sd/${this.job.name}`
      : '';
    return (
      `<${this.state}|MPos:${fmt(this.mpos.x)},${fmt(this.mpos.y)},${fmt(this.mpos.z)}` +
      `|FS:${Math.round(feed)},${rpm}|WCO:${fmt(w.x)},${fmt(w.y)},${fmt(w.z)}` +
      `|Ov:${this.overrides.feed},100,${this.overrides.spindle}${sd}>`
    );
  }

  /** Advances the machine by `dt` seconds; returns lines that became due. */
  tick(dt: number): string[] {
    const out: string[] = [];
    let left = dt;
    while (left > 0 && this.state !== 'Hold' && this.state !== 'Alarm') {
      this.feedJob();
      if (this.queue.length === 0) break;
      const m = this.queue[0]!;
      if (m.dwell !== undefined) {
        const take = Math.min(left, m.dwell - this.moveElapsed);
        this.moveElapsed += take;
        left -= take;
        if (this.moveElapsed >= m.dwell - 1e-9) this.finish(out);
        continue;
      }
      this.moveStart ??= { ...this.mpos };
      const from = this.moveStart;
      const length = Math.hypot(m.to.x - from.x, m.to.y - from.y, m.to.z - from.z);
      const duration = length / (this.rate(m, from) / 60);
      const take = Math.min(left, duration - this.moveElapsed);
      this.moveElapsed += take;
      left -= take;
      const t = duration > 0 ? Math.min(1, this.moveElapsed / duration) : 1;
      const at = {
        x: from.x + (m.to.x - from.x) * t,
        y: from.y + (m.to.y - from.y) * t,
        z: from.z + (m.to.z - from.z) * t,
      };
      // A probe stops where the tool meets the material.
      if (m.probe && at.z <= SURFACE_Z && from.z > SURFACE_Z) {
        const k = (from.z - SURFACE_Z) / (from.z - m.to.z);
        this.mpos = {
          x: from.x + (m.to.x - from.x) * k,
          y: from.y + (m.to.y - from.y) * k,
          z: SURFACE_Z,
        };
        m.after = [`[PRB:${fmt(this.mpos.x)},${fmt(this.mpos.y)},${fmt(this.mpos.z)}:1]`];
        this.finish(out);
        continue;
      }
      this.mpos = at;
      if (t >= 1) {
        if (m.probe) {
          out.push(`[PRB:${fmt(at.x)},${fmt(at.y)},${fmt(at.z)}:0]`, 'ALARM:4');
          this.queue = [];
          this.job = null;
          this.state = 'Alarm';
          this.moveStart = null;
          this.moveElapsed = 0;
          break;
        }
        this.cut(from, at);
        this.finish(out);
      }
    }
    if (
      this.queue.length === 0 &&
      (this.state === 'Run' || this.state === 'Jog' || this.state === 'Home')
    ) {
      this.state = 'Idle';
      // FluidNC acknowledges $SD/Run when the file has run to its end.
      if (this.job && this.job.index >= this.job.lines.length) {
        this.job = null;
        out.push('ok');
      }
    }
    // Answers that waited for room in the planner or for the machine to stop.
    this.waiting = this.waiting.filter((w) => {
      const ready =
        w.until === 'idle' ? this.queue.length === 0 : this.queue.length < PLANNER_BLOCKS;
      if (ready) out.push(...w.lines);
      return !ready;
    });
    return out;
  }

  /** Takes lines of the running SD file into the planner while it has room. */
  private feedJob() {
    const job = this.job;
    if (!job) return;
    while (job.index < job.lines.length && this.queue.length < PLANNER_BLOCKS) {
      const text = job.lines[job.index++]!.replace(/\(.*?\)/g, '')
        .replace(/;.*$/, '')
        .trim();
      if (text !== '' && !text.startsWith('$')) this.gcode(text.toUpperCase(), false);
    }
    // A file of comments only still ends.
    if (this.queue.length === 0 && this.state === 'Idle') this.state = 'Run';
  }

  private finish(out: string[]) {
    const m = this.queue.shift()!;
    if (m.after) out.push(...m.after);
    this.moveStart = null;
    this.moveElapsed = 0;
  }

  /** Records where a finished move went through the material. */
  private cut(from: Vec3, to: Vec3) {
    if (to.z >= SURFACE_Z && from.z >= SURFACE_Z) return;
    const a = this.physical(from);
    const b = this.physical(to);
    const r = this.toolRadius;
    const z = Math.min(from.z, to.z);
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.05) {
      // The same hole again (the X play may show between two pecks).
      const dot = this.marks.find(
        (m) => m.x2 === undefined && Math.hypot(m.x - b.x, m.y - b.y) < 0.1,
      );
      // Pecking the same hole deepens it.
      if (dot) Object.assign(dot, { z: Math.min(dot.z, z), r: Math.max(dot.r, r) });
      else this.marks.push({ x: b.x, y: b.y, r, z });
    } else {
      this.marks.push({ x: a.x, y: a.y, x2: b.x, y2: b.y, r, z });
    }
  }

  // ---------- the board ----------

  /** A point of the board (its own coordinates, seen from the front) on the table. */
  fromBoard(p: Point2, pose: BoardPose = this.board): Point2 {
    const a = (pose.angle * Math.PI) / 180;
    const y = pose.flipped ? -p.y : p.y;
    return {
      x: pose.x + Math.cos(a) * p.x - Math.sin(a) * y,
      y: pose.y + Math.sin(a) * p.x + Math.cos(a) * y,
    };
  }

  /** A point of the table in the board's own coordinates. */
  toBoard(p: Point2, pose: BoardPose = this.board): Point2 {
    const a = (pose.angle * Math.PI) / 180;
    const dx = p.x - pose.x;
    const dy = p.y - pose.y;
    const y = -Math.sin(a) * dx + Math.cos(a) * dy;
    return { x: Math.cos(a) * dx + Math.sin(a) * dy, y: pose.flipped ? -y : y };
  }

  /** A cut of the table as a cut of the board, if it lies on the board. */
  private onBoard(m: Mark): BoardMark | null {
    const inside = (p: Point2) =>
      p.x >= 0 && p.x <= SIM_BOARD.width && p.y >= 0 && p.y <= SIM_BOARD.height;
    const a = this.toBoard(m);
    const b = m.x2 === undefined ? null : this.toBoard({ x: m.x2, y: m.y2! });
    if (!inside(a) || (b && !inside(b))) return null;
    return {
      x: a.x,
      y: a.y,
      ...(b ? { x2: b.x, y2: b.y } : {}),
      r: m.r,
      z: m.z,
      back: this.board.flipped,
      through: m.z <= SURFACE_Z - SIM_BOARD.thickness + 0.01,
    };
  }

  /**
   * Everything cut into the board so far, in the board's own coordinates
   * (seen from its front): what the camera sees of it depends on the side.
   */
  boardCuts(): BoardMark[] {
    return [
      ...this.boardMarks,
      ...this.marks.flatMap((m) => {
        const cut = this.onBoard(m);
        return cut ? [cut] : [];
      }),
    ];
  }

  /**
   * What was cut on each blank of the series scene, in the blank's own
   * coordinates (from its middle, x along its long side), and what was cut
   * beside all of them, into the table (table XY).
   */
  blankCuts(): { blanks: { id: string; cuts: Mark[] }[]; stray: Mark[] } {
    const blanks = SIM_BLANKS.map((b) => ({ id: b.id, cuts: [] as Mark[] }));
    const stray: Mark[] = [];
    for (const m of this.marks) {
      const i = SIM_BLANKS.findIndex((b) => onBlank(b, m));
      const blank = SIM_BLANKS[i];
      if (!blank) {
        stray.push(m);
        continue;
      }
      const a = toBlank(blank, m);
      const b = m.x2 === undefined ? null : toBlank(blank, { x: m.x2, y: m.y2! });
      blanks[i]!.cuts.push({ x: a.x, y: a.y, ...(b ? { x2: b.x, y2: b.y } : {}), r: m.r, z: m.z });
    }
    return { blanks, stray };
  }

  // ---- the jig ----

  /**
   * Clears the table for another scene. The jig is put on the table by
   * hand: every time it comes back it lies at its next place.
   */
  setScene(scene: SimScene) {
    if (scene === this.scene) return;
    if (scene === 'jig' && this.jigShown++ > 0) this.moveJig();
    this.scene = scene;
  }

  /** A point of the jig's plate (from its front left corner) on the table. */
  fromJig(p: Point2, place: SimPlace = this.jig): Point2 {
    const a = (place.angle * Math.PI) / 180;
    return {
      x: place.x + Math.cos(a) * p.x - Math.sin(a) * p.y,
      y: place.y + Math.sin(a) * p.x + Math.cos(a) * p.y,
    };
  }

  /** A point of the table in the coordinates of the jig's plate. */
  toJig(p: Point2, place: SimPlace = this.jig): Point2 {
    const a = (place.angle * Math.PI) / 180;
    const dx = p.x - place.x;
    const dy = p.y - place.y;
    return { x: Math.cos(a) * dx + Math.sin(a) * dy, y: -Math.sin(a) * dx + Math.cos(a) * dy };
  }

  /** A cut of the table as a cut of the jig's plate, if it lies on the plate. */
  private onJig(m: Mark): Mark | null {
    const inside = (p: Point2) =>
      p.x >= 0 && p.x <= SIM_JIG.width && p.y >= 0 && p.y <= SIM_JIG.height;
    const a = this.toJig(m);
    const b = m.x2 === undefined ? null : this.toJig({ x: m.x2, y: m.y2! });
    if (!inside(a) || (b && !inside(b))) return null;
    return { x: a.x, y: a.y, ...(b ? { x2: b.x, y2: b.y } : {}), r: m.r, z: m.z };
  }

  /**
   * Puts the jig somewhere else on the table, as the operator does between
   * two jobs: at the next of its places, or at a given one. What was cut
   * into it goes with it.
   */
  moveJig(to?: SimPlace) {
    const kept: Mark[] = [];
    for (const m of this.marks) {
      const cut = this.scene === 'jig' ? this.onJig(m) : null;
      if (cut) this.jigMarks.push(cut);
      else kept.push(m);
    }
    this.marks = kept;
    this.jig = to ?? SIM_JIG_PLACES[++this.jigMoves % SIM_JIG_PLACES.length]!;
  }

  /**
   * Everything cut on the jig so far: on its coaster in the coaster's own
   * coordinates (from its middle, x along the plate), on the plate beside
   * the coaster (plate coordinates), and beside the jig, into the table.
   */
  jigCuts(): { blank: Mark[]; plate: Mark[]; stray: Mark[] } {
    const out = { blank: [] as Mark[], plate: [] as Mark[], stray: [] as Mark[] };
    const { blank } = SIM_JIG;
    const sort = (m: Mark) => {
      const on = (x: number, y: number) =>
        Math.abs(x - blank.x) <= blank.size / 2 && Math.abs(y - blank.y) <= blank.size / 2;
      if (on(m.x, m.y) && (m.x2 === undefined || on(m.x2, m.y2!))) {
        out.blank.push({
          ...m,
          x: m.x - blank.x,
          y: m.y - blank.y,
          ...(m.x2 === undefined ? {} : { x2: m.x2 - blank.x, y2: m.y2! - blank.y }),
        });
      } else out.plate.push(m);
    };
    this.jigMarks.forEach(sort);
    for (const m of this.marks) {
      const cut = this.onJig(m);
      if (cut) sort(cut);
      else out.stray.push(m);
    }
    return out;
  }

  // ---- the long board ----

  /** A cut of the table as a cut of the long board, if it lies on the board. */
  private onLong(m: Mark): Mark | null {
    const inside = (p: Point2) =>
      p.x >= 0 && p.x <= SIM_LONG.length && p.y >= 0 && p.y <= SIM_LONG.width;
    const a = this.toJig(m, this.long);
    const b = m.x2 === undefined ? null : this.toJig({ x: m.x2, y: m.y2! }, this.long);
    if (!inside(a) || (b && !inside(b))) return null;
    return { x: a.x, y: a.y, ...(b ? { x2: b.x, y2: b.y } : {}), r: m.r, z: m.z };
  }

  /**
   * Sticks tags on the long board, as the operator does before he slides it
   * along: at these places of the table (physical XY), each turned as given.
   * Tags that were on it come off.
   */
  stickTags(tags: readonly { id: number; x: number; y: number; angle: number }[]) {
    this.longTags = tags.map((tag) => ({
      id: tag.id,
      ...this.toJig(tag, this.long),
      angle: tag.angle - this.long.angle,
      size: 40,
    }));
  }

  /**
   * Slides the long board along by about (`dx`, `dy`), as the operator does
   * between two sections: by hand it comes to lie a little off and turned,
   * differently each time; `exact` slides it as asked. What was cut into it
   * and the tags on it go with it.
   */
  slideLong(dx: number, dy: number, exact = false) {
    const kept: Mark[] = [];
    for (const m of this.marks) {
      const cut = this.scene === 'long' ? this.onLong(m) : null;
      if (cut) this.longMarks.push(cut);
      else kept.push(m);
    }
    this.marks = kept;
    const off = exact
      ? { x: 0, y: 0, angle: 0 }
      : SLID_BY_HAND[this.slides++ % SLID_BY_HAND.length]!;
    // It turns about where the hands hold it: the middle of its tags, else its own middle.
    const n = this.longTags.length;
    const held =
      n > 0
        ? {
            x: this.longTags.reduce((sum, t) => sum + t.x, 0) / n,
            y: this.longTags.reduce((sum, t) => sum + t.y, 0) / n,
          }
        : { x: SIM_LONG.length / 2, y: SIM_LONG.width / 2 };
    const from = this.fromJig(held, this.long);
    const angle = this.long.angle + off.angle;
    const lever = this.fromJig(held, { x: 0, y: 0, angle });
    this.long = { x: from.x + dx + off.x - lever.x, y: from.y + dy + off.y - lever.y, angle };
  }

  /**
   * Everything cut on the long board so far, in the board's own coordinates,
   * in the order it was cut, and what was cut beside it, into the table.
   */
  longCuts(): { board: Mark[]; stray: Mark[] } {
    const out = { board: [...this.longMarks], stray: [] as Mark[] };
    for (const m of this.marks) {
      const cut = this.onLong(m);
      if (cut) out.board.push(cut);
      else out.stray.push(m);
    }
    return out;
  }

  /** The hole drilled nearest to a place (within 6 mm), else the place itself: physical table XY. */
  drilledNear(p: Point2): Point2 {
    let best: Point2 = p;
    let bestDistance = 6;
    for (const m of this.marks) {
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      if (m.x2 === undefined && d < bestDistance) {
        best = m;
        bestDistance = d;
      }
    }
    return { x: best.x, y: best.y };
  }

  /**
   * Turns the board over, as the operator does between the two sides of a
   * job. `a` and `b` are the two registration holes (physical table XY,
   * roughly – the nearest drilled holes are taken); the flip line runs
   * through the middle between them: `across` them (they swap places),
   * `along` them (each stays where it is), or in a given direction
   * (radians). On pins (`exact`) the board lands exactly so; put down by
   * hand it lies a few millimetres off and a little turned.
   */
  flipBoard(a: Point2, b: Point2, line: 'across' | 'along' | number, exact: boolean) {
    const p = this.drilledNear(a);
    const q = this.drilledNear(b);
    // The flip line: through the middle between the holes, or through both.
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    const between = Math.atan2(q.y - p.y, q.x - p.x);
    const phi = line === 'across' ? between + Math.PI / 2 : line === 'along' ? between : line;
    const reflect = (v: Point2): Point2 => {
      const dx = v.x - mid.x;
      const dy = v.y - mid.y;
      const c = Math.cos(2 * phi);
      const s = Math.sin(2 * phi);
      return { x: mid.x + c * dx + s * dy, y: mid.y + s * dx - c * dy };
    };

    // What was cut so far belongs to the board now; what went deeper stays in the table.
    const kept: Mark[] = [];
    for (const m of this.marks) {
      const cut = this.onBoard(m);
      if (!cut) kept.push(m);
      else {
        this.boardMarks.push(cut);
        if (m.z < SURFACE_Z - SIM_BOARD.thickness - 0.2) this.spoil.push(m);
      }
    }
    this.marks = kept;

    const corner = reflect(this.board);
    let pose: BoardPose = {
      x: corner.x,
      y: corner.y,
      angle: (2 * phi * 180) / Math.PI - this.board.angle,
      flipped: !this.board.flipped,
    };
    if (!exact) {
      const off = BY_HAND[this.flips % BY_HAND.length]!;
      const centre = this.fromBoard({ x: SIM_BOARD.width / 2, y: SIM_BOARD.height / 2 }, pose);
      const turn = (off.angle * Math.PI) / 180;
      const dx = pose.x - centre.x;
      const dy = pose.y - centre.y;
      pose = {
        ...pose,
        x: centre.x + Math.cos(turn) * dx - Math.sin(turn) * dy + off.x,
        y: centre.y + Math.sin(turn) * dx + Math.cos(turn) * dy + off.y,
        angle: pose.angle + off.angle,
      };
    }
    this.flips++;
    this.board = pose;
  }

  private push(move: Move) {
    if (move.to.x !== this.mpos.x && this.queue.length === 0) {
      this.lastX = Math.sign(move.to.x - this.mpos.x);
    } else if (this.queue.length > 0) {
      const prev = this.queue[this.queue.length - 1]!.to;
      if (move.to.x !== prev.x) this.lastX = Math.sign(move.to.x - prev.x);
    }
    this.queue.push(move);
  }

  /**
   * The speed of a move, mm/min: its feed (with the override for cuts), but
   * never faster than every axis it moves may go – like FluidNC's planner
   * (`limit_rate_by_axis_maximum`: max_rate_mm_per_min / share of the axis).
   */
  private rate(m: Move, from: Vec3): number {
    const feed = m.feed * (m.cut ? this.overrides.feed / 100 : 1);
    const d = { x: m.to.x - from.x, y: m.to.y - from.y, z: m.to.z - from.z };
    const length = Math.hypot(d.x, d.y, d.z);
    if (length === 0) return feed;
    const limits = { x: this.config.maxRateX, y: this.config.maxRateY, z: this.config.maxRateZ };
    let cap = Infinity;
    for (const a of ['x', 'y', 'z'] as const) {
      const share = Math.abs(d[a]) / length;
      if (share > 1e-9) cap = Math.min(cap, Number(limits[a]) / share);
    }
    return Math.min(feed, cap);
  }

  /** End position of everything queued so far. */
  private planned(): Vec3 {
    return { ...(this.queue.length ? this.queue[this.queue.length - 1]!.to : this.mpos) };
  }

  private clamp(p: Vec3): Vec3 {
    const c = (v: number, r: { min: number; max: number }) => Math.min(r.max, Math.max(r.min, v));
    return { x: c(p.x, TRAVEL.x), y: c(p.y, TRAVEL.y), z: c(p.z, TRAVEL.z) };
  }

  /** A realtime byte: jog cancel, feed hold, resume, reset. */
  realtime(code: number): string[] {
    // Overrides: reset, ±10, ±1 – feed from 0x90, spindle from 0x99; 10–200 % like FluidNC.
    const STEPS = [null, 10, -10, 1, -1] as const;
    for (const [base, kind] of [
      [0x90, 'feed'],
      [0x99, 'spindle'],
    ] as const) {
      const step = STEPS[code - base];
      if (step === undefined) continue;
      const next = step === null ? 100 : this.overrides[kind] + step;
      this.overrides[kind] = Math.min(200, Math.max(10, next));
    }
    if (code === 0x85 && this.state === 'Jog') {
      this.queue = this.queue.filter((m) => !m.jog);
      this.moveStart = null;
      this.moveElapsed = 0;
      this.state = 'Idle';
    }
    if (code === 0x21 && (this.state === 'Run' || this.state === 'Jog')) this.state = 'Hold';
    if (code === 0x7e && this.state === 'Hold') {
      this.state = this.queue.length || this.job ? 'Run' : 'Idle';
    }
    if (code === 0x18) {
      this.queue = [];
      this.job = null;
      this.waiting = [];
      this.moveStart = null;
      this.moveElapsed = 0;
      this.spindle = 0;
      this.overrides = { feed: 100, spindle: 100 };
      this.state = 'Idle';
      return ["Grbl 3.7 [FluidNC v3.7.12 (Simulator) '$' for help]"];
    }
    return [];
  }

  /** One line from the app; returns the immediate answer (ok/error and data). */
  line(raw: string): string[] {
    const text = raw
      .replace(/\(.*?\)/g, '')
      .replace(/;.*$/, '')
      .trim();
    if (text === '') return ['ok'];
    if (text.startsWith('$')) return this.dollar(text);
    if (this.state === 'Alarm') return ['error:9'];
    return this.gcode(text.toUpperCase());
  }

  private dollar(text: string): string[] {
    const upper = text.toUpperCase();
    if (upper === '$I') return ['[VER:3.7.12 FluidNC v3.7.12 (Simulator):]', '[OPT:PHS]', 'ok'];
    if (upper === '$G') {
      const mode = this.absolute ? 'G90' : 'G91';
      const s = this.spindle > 0 ? 'M3' : 'M5';
      return [
        `[GC:G0 ${this.active} G17 G21 ${mode} G94 ${s} M9 T${this.tool} F${this.feed} S${this.spindle}]`,
        'ok',
      ];
    }
    if (upper === '$#') {
      return [
        ...Object.entries(this.wcs).map(([k, v]) => `[${k}:${fmt(v.x)},${fmt(v.y)},${fmt(v.z)}]`),
        '[G28:0.000,0.000,0.000]',
        '[G30:0.000,0.000,0.000]',
        '[G92:0.000,0.000,0.000]',
        '[TLO:0.000]',
        'ok',
      ];
    }
    if (upper === '$X') {
      this.state = 'Idle';
      return ['[MSG:Caution: Unlocked]', 'ok'];
    }
    if (upper === '$H' || /^\$H[XYZ]$/.test(upper))
      return this.home(upper.length > 2 ? upper[2]! : 'ZXY');
    if (upper === '$SD/LIST') {
      const size = (text: string) => new TextEncoder().encode(text).length;
      return [...[...this.files].map(([name, t]) => `[FILE: ${name}|SIZE:${size(t)}]`), 'ok'];
    }
    if (upper.startsWith('$SD/RUN=')) {
      const name = text.slice('$SD/Run='.length).replace(/^\//, '');
      const file = this.files.get(name);
      if (file === undefined || this.state !== 'Idle') return ['error:60'];
      // Answered when the file has run through, like FluidNC does.
      this.job = { name, lines: file.split(/\r?\n/), index: 0 };
      this.state = 'Run';
      return [];
    }
    if (upper === '$CONFIG/FILENAME') return ['$Config/Filename=config.yaml', 'ok'];
    if (upper.startsWith('$LOCALFS/SHOW=')) {
      const file = this.localFiles.get(text.slice('$LocalFS/Show='.length).replace(/^\//, ''));
      // FluidNC's output has no blank lines.
      const lines = (file ?? configText(this.config)).split(/\r?\n/).filter((l) => l !== '');
      return [...lines, 'ok'];
    }
    if (upper === '$CD') return [...configText(this.config).split('\n'), 'ok'];
    if (upper.startsWith('$CD=') || upper === '$BYE') return ['ok'];
    if (upper.startsWith('$J=')) return this.jog(upper.slice(3));
    const setting = /^\$\/([a-z0-9_/]+)(?:=(.*))?$/i.exec(text);
    if (setting) {
      const path = setting[1]!.toLowerCase();
      const key = SETTING_KEYS[path];
      if (setting[2] === undefined) {
        return key ? [`$/${path}=${this.config[key]}`, 'ok'] : ['ok'];
      }
      if (key) {
        const value = Number(setting[2]);
        // FluidNC validates against the item's range (Axis.cpp) and refuses with error:… otherwise.
        if (!Number.isFinite(value) || value <= 0) return ['error:3'];
        this.config[key] = value.toFixed(3);
      }
      return ['ok'];
    }
    return ['ok'];
  }

  /**
   * The lean after homing Y: each end of the gantry stops at its own switch and the pull-off leaves it that far from it –
   * further +Y when homing towards −Y. The X+ end ahead of the X− end by Δ is a lean of atan(Δ / rail distance).
   */
  private leanAfterHoming(): number {
    const p0 = Number(this.config.pulloff0);
    const p1 = Number(this.config.pulloff1);
    const plus = SIM_GANTRY.motor1Side === 'xMax' ? p1 : p0;
    const minus = SIM_GANTRY.motor1Side === 'xMax' ? p0 : p1;
    const along = (p: number) => (SIM_GANTRY.homingPositive ? -p : p);
    // both pull-offs 4 mm: the gantry is as the switches make it (that is `SIM_ERRORS.gamma`)
    const ahead = along(plus) - along(minus);
    return SIM_ERRORS.gamma + (Math.atan(ahead / SIM_GANTRY.width) * 180) / Math.PI;
  }

  private home(axes: string): string[] {
    const home = this.planned();
    if (axes.includes('Z')) home.z = TRAVEL.z.max;
    // Z first, then X and Y, like the homing cycles.
    if (axes.includes('Z')) this.push({ to: { ...this.mpos, z: home.z }, feed: 1200, jog: false });
    if (axes.includes('X')) home.x = TRAVEL.x.min;
    if (axes.includes('Y')) {
      home.y = TRAVEL.y.min;
      this.lean = this.leanAfterHoming();
    }
    this.push({ to: home, feed: 2500, jog: false, after: [`[MSG:Homed:${axes}]`] });
    this.state = 'Home';
    this.waiting.push({ until: 'idle', lines: ['ok'] });
    return [];
  }

  private words(text: string): Map<string, number> {
    const out = new Map<string, number>();
    for (const m of text.matchAll(/([A-Z])\s*([-+]?\d*\.?\d+)/g)) {
      const letter = m[1]!;
      // G and M can appear several times; keep the motion-relevant ones apart.
      if (letter === 'G' || letter === 'M') out.set(`${letter}${Number(m[2])}`, 1);
      else out.set(letter, Number(m[2]));
    }
    return out;
  }

  private target(w: Map<string, number>, machine: boolean, relative: boolean): Vec3 {
    const from = this.planned();
    const off = machine ? { x: 0, y: 0, z: 0 } : this.wcs[this.active]!;
    const axis = (k: 'x' | 'y' | 'z') => {
      const v = w.get(k.toUpperCase());
      if (v === undefined) return from[k];
      return relative ? from[k] + v : v + off[k];
    };
    return { x: axis('x'), y: axis('y'), z: axis('z') };
  }

  private jog(text: string): string[] {
    const w = this.words(text);
    const relative = w.has('G91');
    const to = this.clamp(this.target(w, w.has('G53'), relative));
    const feed = w.get('F') ?? this.feed;
    this.push({ to, feed, jog: true });
    if (this.state === 'Idle') this.state = 'Jog';
    return ['ok'];
  }

  /** A G-code line; `answer` false for lines of a file, which are not acknowledged one by one. */
  private gcode(text: string, answer = true): string[] {
    const w = this.words(text);
    if (w.has('G90')) this.absolute = true;
    if (w.has('G91')) this.absolute = false;
    for (const k of ['G54', 'G55', 'G56', 'G57', 'G58', 'G59']) if (w.has(k)) this.active = k;
    if (w.has('F')) this.feed = w.get('F')!;
    if (w.has('S')) this.spindle = Math.round(w.get('S')!);
    if (w.has('M5')) this.spindle = 0;
    if (w.has('T')) this.tool = w.get('T')!;
    if (w.has('G10') && w.get('L') === 2) {
      const p = w.get('P') ?? 0;
      const key = p === 0 ? this.active : `G${53 + p}`;
      const cur = this.wcs[key]!;
      this.wcs[key] = {
        x: w.get('X') ?? cur.x,
        y: w.get('Y') ?? cur.y,
        z: w.get('Z') ?? cur.z,
      };
      return ['ok'];
    }
    if (w.has('G10') && w.get('L') === 20) {
      // The place the machine stands at gets these work coordinates ("X = 0 here").
      const p = w.get('P') ?? 0;
      const key = p === 0 ? this.active : `G${53 + p}`;
      const cur = this.wcs[key]!;
      const at = this.planned();
      const axis = (k: 'x' | 'y' | 'z') => {
        const v = w.get(k.toUpperCase());
        return v === undefined ? cur[k] : at[k] - v;
      };
      this.wcs[key] = { x: axis('x'), y: axis('y'), z: axis('z') };
      return ['ok'];
    }
    if (w.has('G4')) {
      this.queue.push({ to: this.planned(), feed: 0, jog: false, dwell: w.get('P') ?? 0 });
      if (answer) this.waiting.push({ until: 'idle', lines: ['ok'] });
      if (this.state === 'Idle') this.state = 'Run';
      return [];
    }
    const machine = w.has('G53');
    const probe = w.has('G38.2') || /G38\.2/.test(text);
    const moves = ['X', 'Y', 'Z'].some((a) => w.has(a));
    if (moves && !w.has('G10') && !w.has('G92')) {
      const to = this.clamp(this.target(w, machine, !this.absolute));
      const rapid = w.has('G0') && !w.has('G1');
      const arc = w.has('G2') || w.has('G3');
      if (arc) this.arc(to, w.get('I') ?? 0, w.get('J') ?? 0, w.has('G2'));
      else this.push({ to, feed: rapid ? RAPID : this.feed, jog: false, probe, cut: !rapid });
      if (this.state === 'Idle') this.state = 'Run';
      if (!answer) return [];
      if (probe) {
        // FluidNC answers a probe only once it touched (or failed).
        this.waiting.push({ until: 'idle', lines: ['ok'] });
        return [];
      }
      if (this.queue.length >= PLANNER_BLOCKS) {
        this.waiting.push({ until: 'block', lines: ['ok'] });
        return [];
      }
    }
    return ['ok'];
  }

  /** An arc in the XY plane (a helix with Z), as short straight moves. */
  private arc(to: Vec3, i: number, j: number, clockwise: boolean) {
    const from = this.planned();
    const cx = from.x + i;
    const cy = from.y + j;
    const r = Math.hypot(i, j);
    const a0 = Math.atan2(from.y - cy, from.x - cx);
    let sweep = Math.atan2(to.y - cy, to.x - cx) - a0;
    // The same end as the start is a full circle.
    if (clockwise && sweep >= -1e-9) sweep -= 2 * Math.PI;
    if (!clockwise && sweep <= 1e-9) sweep += 2 * Math.PI;
    const steps = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 12)));
    for (let k = 1; k <= steps; k++) {
      const a = a0 + (sweep * k) / steps;
      const at =
        k === steps
          ? to
          : {
              x: cx + r * Math.cos(a),
              y: cy + r * Math.sin(a),
              z: from.z + ((to.z - from.z) * k) / steps,
            };
      this.push({ to: at, feed: this.feed, jog: false, cut: true });
    }
  }
}
