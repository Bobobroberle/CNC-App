import type { WebSocketLike } from '@lowrider/fluidnc-client';
import { tagCells, tagPaper, TAG_MODULES } from '@lowrider/workshop';
import type { Drawable, FrameSource, SourceFrame, StampDomain } from '../lib/frameStamp';
import {
  SIM_BLANKS,
  SIM_BOARD,
  SIM_JIG,
  SIM_LONG,
  Simulator,
  type Mark,
  type SimBlank,
} from './simulator';

export {
  SIM_BLANKS,
  SIM_BOARD,
  SIM_ERRORS,
  SIM_GANTRY,
  SIM_JIG,
  SIM_JIG_PLACES,
  SIM_LONG,
  SURFACE_Z,
  type SimPlace,
  type SimScene,
} from './simulator';

/** The address that connects to the simulator instead of a Jackpot. */
export const SIM_ADDRESS = 'simulator';

export function isSimulatorAddress(address: string): boolean {
  return address.trim().toLowerCase() === SIM_ADDRESS;
}

/** One machine per page; it keeps running between connections like a real one. */
let machine: Simulator | null = null;
export function simulator(): Simulator {
  machine ??= new Simulator();
  // For the tests and the curious: the simulated machine with what it has cut.
  (globalThis as { lowriderSimulator?: Simulator }).lowriderSimulator = machine;
  return machine;
}

/** Restarts the simulated machine with a fresh table (no marks, offsets cleared). */
export function resetSimulator() {
  machine = new Simulator();
}

const encoder = new TextEncoder();

/**
 * A Pi between the controller and the page, for the tests of a scan that runs on the Pi's clock. Set as
 * `window.lowriderPiClock`; **undefined – the default – is no Pi at all** and the socket and the camera behave as they always did.
 * With it, every message of the simulated controller goes to the page over a link that is late and uneven (in order, like
 * one TCP stream), and – unless `stamps` is false – the Pi puts the clock it has on each message, as the companion's relay
 * does (`STAMP:<mono ms>:<wall ms>` right before it), and `simulatorFrameSource()` gives the camera's pictures with the
 * stamp ustreamer would put on them. The Pi's clocks run `offsetMs` ahead of the page's `performance.now()` – a huge number
 * on purpose, so that any mixing of the two fails loudly instead of being a few milliseconds off.
 *
 * Which knob sits on which side of the stamp: `linkMs` and `linkJitterMs` are the time a message needs from the Pi to the page,
 * *after* it was stamped – the clock of the page sees them, the stamp does not. `stampLagMs` and `stampNoiseMs` are what is
 * left in the stamp: the time between the controller measuring a position and the Pi receiving it, and how much that wobbles.
 * The camera's own lag in the page (`lowriderCameraLag`) has no part in a picture's stamp or in what it shows.
 */
export interface PiClockSetup {
  /** The Pi's clocks minus the page's `performance.now()`, ms */
  offsetMs: number;
  /** Time a message needs from the Pi to the page, ms, and how much that varies (0 … this much more, uneven) */
  linkMs: number;
  linkJitterMs: number;
  /** The stamp of a report is off the moment it was measured by up to this much either way, ms */
  stampNoiseMs: number;
  /** The same for the stamp of a picture (which is whole milliseconds, like ustreamer's) */
  frameStampNoiseMs: number;
  /** Fixed ms between the controller measuring a position and the Pi stamping it (default 12) */
  stampLagMs?: number;
  /** false: an older companion – the link is as late and uneven, but nothing is stamped (default true) */
  stamps?: boolean;
  /** The pictures are stamped in another clock than the reports by this much, ms – a driver with its own clock (default 0) */
  frameClockOffsetMs?: number;
  /** `mono` (a grab time: `X-UStreamer-Grab-Time`, the default) or `wall` (the time of sending: `X-Timestamp`) */
  frameDomain?: StampDomain;
}

export function piClock(): PiClockSetup | undefined {
  return (globalThis as { lowriderPiClock?: PiClockSetup }).lowriderPiClock;
}

/** Whether a simulated Pi is set up (the app takes it for a companion that relays) */
export const simulatedPi = (): boolean => piClock() !== undefined;

/** The same noise on every page load: a test that fails must fail the same way again */
function noise(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const linkNoise = noise(0x1a2b3c);
const stampNoise = noise(0x4d5e6f);
const frameNoise = noise(0x708192);

/** What the Pi's real time was when the page's clock began (the wall clock of the Pi is that plus the offset) */
let wallBase: number | null = null;
const wallOf = (pageMs: number) => (wallBase ??= Date.now() - performance.now()) + pageMs;

/** The stamps of the Pi never go back (the relay's clock is the system's) */
let lastStampMs = -Infinity;

/** The text frame the relay puts before a message of the controller: the Pi's clocks when it came. */
function stampFrameFor(sampleMs: number, pi: PiClockSetup): string {
  const wobble = (stampNoise() * 2 - 1) * pi.stampNoiseMs;
  const at = Math.max(lastStampMs + 0.001, sampleMs + (pi.stampLagMs ?? 12) + wobble);
  lastStampMs = at;
  return `STAMP:${(at + pi.offsetMs).toFixed(3)}:${Math.round(wallOf(at) + pi.offsetMs)}`;
}

/** The socket that carries the machine's answers (the camera's frames catch the machine up to the moment they were taken) */
let liveSocket: SimulatorSocket | null = null;

/** A WebSocket that talks to the simulator, for FluidNCConnection's `createSocket`. */
export class SimulatorSocket implements WebSocketLike {
  binaryType = 'arraybuffer';
  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  /** When the last message is due at the page: the link keeps the order */
  private lastDue = 0;
  /** What is on its way over the link, in the order it was sent – delivered by one timer, so a stall of the page cannot swap two */
  private onTheWay: { due: number; frames: unknown[] }[] = [];
  private arrival: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    setTimeout(() => {
      this.readyState = 1;
      liveSocket = this;
      this.onopen?.({});
      this.emit(["Grbl 3.7 [FluidNC v3.7.12 (Simulator) '$' for help]"]);
      this.last = performance.now();
      this.timer = setInterval(() => this.advance(), 20);
    }, 30);
  }

  /**
   * Runs the simulated machine up to now (it moves in steps of the timer, 20 ms – a position read between two of them is
   * up to 20 ms old). Where a Pi is simulated the machine is caught up to the very moment a report or a picture is
   * taken, so that the stamp it gets belongs to the position it shows.
   */
  advance() {
    const now = performance.now();
    const sim = simulator();
    this.emit(sim.tick(((now - this.last) / 1000) * sim.speed));
    this.last = now;
  }

  send(data: string | Uint8Array) {
    if (this.readyState !== 1) return;
    const sim = simulator();
    if (typeof data !== 'string') {
      this.emit(sim.realtime(data[0]!));
      return;
    }
    if (data === '?') {
      if (piClock()) this.advance();
      this.emit([sim.status()]);
      return;
    }
    if (data.length === 1 && !data.endsWith('\n')) {
      this.emit(sim.realtime(data.charCodeAt(0)));
      return;
    }
    for (const line of data.split('\n')) {
      if (line === '' && data.endsWith('\n')) continue;
      this.emit(sim.line(line));
    }
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.arrival) clearTimeout(this.arrival);
    this.arrival = null;
    this.onTheWay = [];
    if (liveSocket === this) liveSocket = null;
    this.readyState = 3;
    this.onclose?.({});
  }

  private emit(lines: string[]) {
    if (lines.length === 0) return;
    const text = lines.map((l) => `${l}\n`).join('');
    const pi = piClock();
    if (!pi) {
      // Answer asynchronously, like a network.
      setTimeout(() => this.onmessage?.({ data: encoder.encode(text).buffer }), 2);
      return;
    }
    // Over the Pi: stamped when it gets the message (the stamp and its message leave together, in one piece), then late
    // and uneven on the way to the page – in order, as one stream is
    const now = performance.now();
    const frames: unknown[] = pi.stamps === false ? [] : [stampFrameFor(now, pi)];
    frames.push(encoder.encode(text).buffer);
    const due = Math.max(this.lastDue, now + pi.linkMs + linkNoise() * pi.linkJitterMs);
    this.lastDue = due;
    this.onTheWay.push({ due, frames });
    this.arm();
  }

  /** One timer for the head of the link: what is due goes to the page in the order it was sent, then the next is waited for */
  private arm() {
    if (this.arrival !== null || this.onTheWay.length === 0) return;
    this.arrival = setTimeout(
      () => {
        this.arrival = null;
        // a timer may fire a hair early: what is due within half a millisecond goes now
        while (this.onTheWay.length > 0 && this.onTheWay[0]!.due <= performance.now() + 0.5) {
          for (const data of this.onTheWay.shift()!.frames) this.onmessage?.({ data });
        }
        this.arm();
      },
      Math.max(0, this.onTheWay[0]!.due - performance.now()),
    );
  }
}

// ---------- camera ----------

/** The simulated camera: where it really sits and its scale. */
export const SIM_CAMERA = {
  /** Real offset of the image centre from the spindle, mm (the app starts not knowing it) */
  offset: { x: 35, y: -20 },
  pxPerMm: 10,
  width: 1200,
  height: 900,
};

/** The precision plate: 19 × 19 dots, 10 mm pitch, Ø 3 mm, lying 0.6° askew. */
export const SIM_PLATE = { x: 120, y: 120, angle: 0.6, n: 19, pitch: 10, r: 1.5 };

const rad = (deg: number) => (deg * Math.PI) / 180;

function place(base: { x: number; y: number; angle: number }, p: { x: number; y: number }) {
  const a = rad(base.angle);
  return {
    x: base.x + Math.cos(a) * p.x - Math.sin(a) * p.y,
    y: base.y + Math.sin(a) * p.x + Math.cos(a) * p.y,
  };
}

let canvas: HTMLCanvasElement | null = null;
let running = false;

/**
 * What a real camera does that the simulated one did not: it is late. The picture shows where the camera was
 * `ms` ago, give or take `jitterMs`, and out of focus by `blurPx` (motion blur or a poor focus wipes out fine texture)
 * – set by the tests, unseen by the app, which has to find out for itself.
 */
export const simulatorCameraLag = { ms: 0, jitterMs: 0, blurPx: 0 };
(globalThis as { lowriderCameraLag?: typeof simulatorCameraLag }).lowriderCameraLag =
  simulatorCameraLag;
const trail: { t: number; tool: { x: number; y: number } }[] = [];
let lastShown = 0;

let blurCopy: HTMLCanvasElement | null = null;

/** The picture, out of focus: drawn over itself through a blur filter (a browser without canvas filters shows it sharp). */
function blur(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, px: number) {
  blurCopy ??= document.createElement('canvas');
  blurCopy.width = source.width;
  blurCopy.height = source.height;
  blurCopy.getContext('2d')!.drawImage(source, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = `blur(${px}px)`;
  ctx.drawImage(blurCopy, 0, 0);
  ctx.filter = 'none';
}

/** Where the camera was `lag` ms ago, from the trail of the frames painted so far. */
function laggedTool(now: number, current: { x: number; y: number }) {
  trail.push({ t: now, tool: current });
  while (trail.length > 2 && trail[1]!.t < now - 3000) trail.shift();
  const { ms, jitterMs } = simulatorCameraLag;
  if (ms <= 0 && jitterMs <= 0) return current;
  // monotonic: a picture never shows an earlier place than the one before it
  const want = Math.max(lastShown, now - ms - (Math.sin(now * 0.37) * 0.5 + 0.5) * jitterMs);
  lastShown = want;
  for (let i = trail.length - 1; i >= 0; i--) {
    if (trail[i]!.t <= want) return trail[i]!.tool;
  }
  return trail[0]!.tool;
}

/**
 * The canvas the simulated camera paints into, at the spindle's real
 * position plus the camera offset, 10 px per mm. Created on first use.
 */
export function simulatorCamera(): HTMLCanvasElement {
  if (canvas) {
    if (!running) start();
    return canvas;
  }
  canvas = document.createElement('canvas');
  canvas.width = SIM_CAMERA.width;
  canvas.height = SIM_CAMERA.height;
  start();
  return canvas;
}

export function stopSimulatorCamera() {
  running = false;
}

function start() {
  running = true;
  const frame = () => {
    if (!running || !canvas) return;
    paint(
      canvas.getContext('2d')!,
      undefined,
      laggedTool(performance.now(), simulator().physical()),
    );
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/**
 * A still picture of the simulated camera with the spindle at machine
 * position `mpos` (the demo's pre-scanned map), without moving the machine.
 */
export function simulatorFrame(mpos: { x: number; y: number; z: number }): HTMLCanvasElement {
  const frame = document.createElement('canvas');
  frame.width = SIM_CAMERA.width;
  frame.height = SIM_CAMERA.height;
  paint(frame.getContext('2d')!, mpos);
  return frame;
}

function paint(
  ctx: CanvasRenderingContext2D,
  mpos?: { x: number; y: number; z: number },
  late?: { x: number; y: number },
) {
  const sim = simulator();
  const tool = late ?? sim.physical(mpos);
  const cam = { x: tool.x + SIM_CAMERA.offset.x, y: tool.y + SIM_CAMERA.offset.y };
  const s = SIM_CAMERA.pxPerMm;
  const { width: w, height: h } = SIM_CAMERA;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // MDF spoilboard
  ctx.fillStyle = '#b89a72';
  ctx.fillRect(0, 0, w, h);
  // World → image: Y up in the machine, down in the picture.
  ctx.setTransform(s, 0, 0, -s, w / 2 - cam.x * s, h / 2 + cam.y * s);
  const speckle = mdfSpeckle(ctx);
  if (speckle) {
    ctx.fillStyle = speckle;
    ctx.fillRect(cam.x - w / s, cam.y - h / s, (2 * w) / s, (2 * h) / s);
  }

  // Holes that went through the board into the spoilboard (the board lies on most of them)
  drawMarks(ctx, sim.spoil);

  if (sim.scene === 'blanks') {
    drawBlanks(ctx);
  } else if (sim.scene === 'jig') {
    drawJig(ctx, sim);
  } else if (sim.scene === 'long') {
    drawLong(ctx, sim);
  } else {
    // Plate: white with black dots
    ctx.save();
    ctx.translate(SIM_PLATE.x, SIM_PLATE.y);
    ctx.rotate(rad(SIM_PLATE.angle));
    const span = (SIM_PLATE.n - 1) * SIM_PLATE.pitch;
    ctx.fillStyle = '#f4f4f0';
    ctx.fillRect(-10, -10, span + 20, span + 20);
    ctx.fillStyle = '#141414';
    for (let i = 0; i < SIM_PLATE.n; i++) {
      for (let j = 0; j < SIM_PLATE.n; j++) {
        ctx.beginPath();
        ctx.arc(i * SIM_PLATE.pitch, j * SIM_PLATE.pitch, SIM_PLATE.r, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
    ctx.restore();

    // Board with holes (dark: through holes over the spoilboard's shadow), front or back up
    const board = sim.board;
    ctx.save();
    ctx.translate(board.x, board.y);
    ctx.rotate(rad(board.angle));
    if (board.flipped) ctx.scale(1, -1);
    // Soft shadow on the spoilboard, then the birch plywood face
    ctx.fillStyle = 'rgba(40, 28, 15, 0.25)';
    ctx.fillRect(0.8, board.flipped ? 0.8 : -0.8, SIM_BOARD.width, SIM_BOARD.height);
    const face = birchFace();
    if (face) {
      ctx.save();
      // The back has its own grain: the same veneer, the other way round.
      if (board.flipped) ctx.transform(-1, 0, 0, 1, SIM_BOARD.width, 0);
      ctx.drawImage(face, 0, 0, SIM_BOARD.width, SIM_BOARD.height);
      ctx.restore();
    } else {
      ctx.fillStyle = '#e9d9b8';
      ctx.fillRect(0, 0, SIM_BOARD.width, SIM_BOARD.height);
    }
    ctx.fillStyle = '#2b1e12';
    for (const hole of SIM_BOARD.holes) {
      ctx.beginPath();
      ctx.arc(hole.x, hole.y, hole.r, 0, 2 * Math.PI);
      ctx.fill();
    }
    // What was cut before the board was turned: on this side, or right through it.
    drawMarks(
      ctx,
      sim.boardMarks.filter((m) => m.through || m.back === board.flipped),
    );
    ctx.restore();
  }

  // What the tool cut since
  drawMarks(ctx, sim.marks);
}

/** The outline of a blank in its own coordinates (from its middle). */
function blankShape(ctx: CanvasRenderingContext2D, blank: SimBlank, grow = 0) {
  ctx.beginPath();
  if (blank.shape === 'round') ctx.arc(0, 0, blank.length / 2 + grow, 0, 2 * Math.PI);
  else {
    ctx.rect(
      -blank.length / 2 - grow,
      -blank.width / 2 - grow,
      blank.length + 2 * grow,
      blank.width + 2 * grow,
    );
  }
}

/**
 * The blanks of the series scene: pale wood with a little grain, each with
 * its soft shadow on the spoilboard. All shadows first, then all faces, so
 * two blanks that touch show as one light patch.
 */
function drawBlanks(ctx: CanvasRenderingContext2D) {
  const placed = (blank: SimBlank, draw: () => void) => {
    ctx.save();
    ctx.translate(blank.x, blank.y);
    ctx.rotate(rad(blank.angle));
    draw();
    ctx.restore();
  };
  for (const blank of SIM_BLANKS) {
    ctx.save();
    ctx.translate(0.8, -0.8);
    placed(blank, () => {
      blankShape(ctx, blank);
      ctx.fillStyle = 'rgba(40, 28, 15, 0.25)';
      ctx.fill();
    });
    ctx.restore();
  }
  SIM_BLANKS.forEach((blank, n) => {
    placed(blank, () => {
      const rnd = seeded(77 + n);
      blankShape(ctx, blank);
      ctx.fillStyle = ['#ead9b6', '#e6d3ae', '#ecdcbc'][n % 3]!;
      ctx.fill();
      ctx.save();
      ctx.clip();
      // Grain along the blank
      for (let i = 0; i < 9; i++) {
        const y = (rnd() - 0.5) * blank.width;
        ctx.strokeStyle = `rgba(176, 140, 92, ${0.1 + rnd() * 0.12})`;
        ctx.lineWidth = 0.15 + rnd() * 0.3;
        ctx.beginPath();
        ctx.moveTo(-blank.length / 2, y);
        ctx.bezierCurveTo(
          -blank.length / 6,
          y + (rnd() - 0.5) * 3,
          blank.length / 6,
          y + (rnd() - 0.5) * 3,
          blank.length / 2,
          y + (rnd() - 0.5) * 2,
        );
        ctx.stroke();
      }
      ctx.restore();
      if (!blank.touching) {
        // Thin edge line where the blank ends
        blankShape(ctx, blank, -0.15);
        ctx.strokeStyle = 'rgba(120, 92, 56, 0.4)';
        ctx.lineWidth = 0.25;
        ctx.stroke();
      }
    });
  });
}

/**
 * The jig of the jig scene: a dark plate with its soft shadow, the pale
 * coaster in its pocket and two printed tags – white paper, black code.
 */
function drawJig(ctx: CanvasRenderingContext2D, sim: Simulator) {
  const { width, height, blank, tags } = SIM_JIG;
  ctx.save();
  ctx.translate(sim.jig.x, sim.jig.y);
  ctx.rotate(rad(sim.jig.angle));
  ctx.fillStyle = 'rgba(40, 28, 15, 0.3)';
  ctx.fillRect(1, -1, width, height);
  // The plate: dark, coated plywood with a little sheen along it.
  ctx.fillStyle = '#75573c';
  ctx.fillRect(0, 0, width, height);
  const rnd = seeded(4711);
  for (let i = 0; i < 40; i++) {
    const y = rnd() * height;
    ctx.strokeStyle = `rgba(${rnd() < 0.5 ? '60, 42, 26' : '150, 118, 86'}, ${0.08 + rnd() * 0.1})`;
    ctx.lineWidth = 0.2 + rnd() * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y + (rnd() - 0.5) * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(40, 28, 15, 0.6)';
  ctx.lineWidth = 0.4;
  ctx.strokeRect(0.2, 0.2, width - 0.4, height - 0.4);

  // The coaster in its pocket, a hair of shadow in the gap around it.
  const half = blank.size / 2;
  ctx.fillStyle = '#2f2114';
  ctx.fillRect(blank.x - half - 0.6, blank.y - half - 0.6, blank.size + 1.2, blank.size + 1.2);
  ctx.fillStyle = '#ead9b6';
  ctx.fillRect(blank.x - half, blank.y - half, blank.size, blank.size);
  ctx.save();
  ctx.beginPath();
  ctx.rect(blank.x - half, blank.y - half, blank.size, blank.size);
  ctx.clip();
  for (let i = 0; i < 14; i++) {
    const y = blank.y - half + rnd() * blank.size;
    ctx.strokeStyle = `rgba(176, 140, 92, ${0.1 + rnd() * 0.12})`;
    ctx.lineWidth = 0.15 + rnd() * 0.3;
    ctx.beginPath();
    ctx.moveTo(blank.x - half, y);
    ctx.bezierCurveTo(
      blank.x - half / 3,
      y + (rnd() - 0.5) * 3,
      blank.x + half / 3,
      y + (rnd() - 0.5) * 3,
      blank.x + half,
      y + (rnd() - 0.5) * 2,
    );
    ctx.stroke();
  }
  ctx.restore();

  // The tags: stickers as they are printed, each turned the way it was stuck on.
  for (const tag of tags) drawTag(ctx, tag);

  // What was cut into it before it was moved.
  drawMarks(ctx, sim.jigMarks);
  ctx.restore();
}

/** A printed tag as it sticks on something: white paper, black code. */
function drawTag(
  ctx: CanvasRenderingContext2D,
  tag: { id: number; x: number; y: number; angle: number; size: number },
) {
  const cells = tagCells(tag.id);
  if (!cells) return;
  const m = tag.size / TAG_MODULES;
  const paper = tagPaper(tag.size);
  ctx.save();
  ctx.translate(tag.x, tag.y);
  ctx.rotate(rad(tag.angle));
  // Printed with y down: the first row of cells is the top one.
  ctx.scale(1, -1);
  ctx.fillStyle = '#f3f2ee';
  ctx.fillRect(-paper / 2, -paper / 2, paper, paper);
  ctx.fillStyle = '#161616';
  const corner = -tag.size / 2;
  ctx.fillRect(corner, corner, tag.size, m);
  ctx.fillRect(corner, -corner - m, tag.size, m);
  ctx.fillRect(corner, corner, m, tag.size);
  ctx.fillRect(-corner - m, corner, m, tag.size);
  cells.forEach((row, r) =>
    row.forEach((dark, c) => {
      // A hair over the cell's edge, so neighbours print as one patch.
      if (dark)
        ctx.fillRect(corner + (c + 1) * m - 0.02, corner + (r + 1) * m - 0.02, m + 0.04, m + 0.04);
    }),
  );
  ctx.restore();
}

/**
 * The board of the long scene: pale pine with long grain and its soft
 * shadow, the cuts made before it was last slid along, and the tags stuck
 * on it – on top, as paper lies over a groove.
 */
function drawLong(ctx: CanvasRenderingContext2D, sim: Simulator) {
  const { length, width } = SIM_LONG;
  ctx.save();
  ctx.translate(sim.long.x, sim.long.y);
  ctx.rotate(rad(sim.long.angle));
  ctx.fillStyle = 'rgba(40, 28, 15, 0.25)';
  ctx.fillRect(0.8, -0.8, length, width);
  ctx.fillStyle = '#e8d6ad';
  ctx.fillRect(0, 0, length, width);
  const rnd = seeded(1311);
  for (let i = 0; i < 70; i++) {
    const y = rnd() * width;
    ctx.strokeStyle = `rgba(${rnd() < 0.7 ? '178, 142, 92' : '206, 176, 128'}, ${0.1 + rnd() * 0.14})`;
    ctx.lineWidth = 0.2 + rnd() * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    // Long, gently wandering lines: a board sawn along the trunk.
    for (let x = 200; x <= length; x += 200) ctx.lineTo(x, y + (rnd() - 0.5) * 3);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(120, 92, 56, 0.5)';
  ctx.lineWidth = 0.3;
  ctx.strokeRect(0.15, 0.15, length - 0.3, width - 0.3);
  drawMarks(ctx, sim.longMarks);
  for (const tag of sim.longTags) drawTag(ctx, tag);
  ctx.restore();
}

function drawMarks(ctx: CanvasRenderingContext2D, marks: readonly Mark[]) {
  ctx.fillStyle = '#3a2817';
  ctx.strokeStyle = '#3a2817';
  ctx.lineCap = 'round';
  for (const m of marks) {
    if (m.x2 === undefined) {
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, 2 * Math.PI);
      ctx.fill();
    } else {
      ctx.lineWidth = 2 * m.r;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x2, m.y2!);
      ctx.stroke();
    }
  }
}

// ---------- surfaces ----------

/** Same pseudo-random sequence on every load, so the table always looks the same. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pixels per mm of the board texture (the camera shows 10). */
const FACE_PX_PER_MM = 5;
let face: HTMLCanvasElement | null | undefined;

/**
 * Birch plywood face for the simulated board, painted once: pale veneer with
 * long gentle grain, a football patch and a few small knots. Knots are drawn
 * long and narrow along the grain so the hole finder (round, dark) never takes
 * them for a hole.
 */
function birchFace(): HTMLCanvasElement | null {
  if (face !== undefined) return face;
  const c = document.createElement('canvas');
  c.width = SIM_BOARD.width * FACE_PX_PER_MM;
  c.height = SIM_BOARD.height * FACE_PX_PER_MM;
  const g = c.getContext('2d');
  if (!g) return (face = null);
  const k = FACE_PX_PER_MM;
  const rnd = seeded(20261103);
  g.fillStyle = '#ead9b6';
  g.fillRect(0, 0, c.width, c.height);
  // Broad colour bands across the sheet (rotary-cut veneer)
  for (let i = 0; i < 14; i++) {
    const y = rnd() * c.height;
    const band = g.createLinearGradient(0, y - 60 * k * rnd(), 0, y + 60 * k * rnd());
    const tone = rnd() < 0.5 ? '214, 190, 150' : '244, 230, 204';
    band.addColorStop(0, `rgba(${tone}, 0)`);
    band.addColorStop(0.5, `rgba(${tone}, ${0.25 + rnd() * 0.25})`);
    band.addColorStop(1, `rgba(${tone}, 0)`);
    g.fillStyle = band;
    g.fillRect(0, 0, c.width, c.height);
  }
  // Grain: long, slightly wavy lines along the board
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const y0 = rnd() * c.height;
    const amp = (0.6 + rnd() * 2.5) * k;
    const freq = (0.004 + rnd() * 0.01) / k;
    const phase = rnd() * 6.28;
    const drift = (rnd() - 0.5) * 6 * k;
    g.strokeStyle = `rgba(${rnd() < 0.8 ? '176, 140, 92' : '150, 112, 66'}, ${0.08 + rnd() * 0.16})`;
    g.lineWidth = (0.12 + rnd() * 0.35) * k;
    g.beginPath();
    for (let x = 0; x <= c.width; x += 6) {
      const y = y0 + Math.sin(x * freq + phase) * amp + (drift * x) / c.width;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // Football patch (typical repair in birch plywood faces)
  const patch = { x: 300 * k, y: 70 * k, rx: 22 * k, ry: 6.5 * k };
  g.fillStyle = 'rgba(246, 234, 210, 0.9)';
  g.beginPath();
  g.ellipse(patch.x, patch.y, patch.rx, patch.ry, 0, 0, 2 * Math.PI);
  g.fill();
  g.strokeStyle = 'rgba(150, 118, 76, 0.55)';
  g.lineWidth = 0.25 * k;
  g.stroke();
  // Small knots: narrow dark core, lighter halo, grain curling around
  const knots = [
    { x: 140, y: 150, l: 6 },
    { x: 330, y: 205, l: 4.5 },
    { x: 260, y: 115, l: 3.5 },
    { x: 75, y: 95, l: 5 },
  ];
  for (const n of knots) {
    const x = n.x * k;
    const y = n.y * k;
    for (let r = 5; r >= 1; r--) {
      g.strokeStyle = `rgba(160, 120, 72, ${0.12 + 0.05 * (5 - r)})`;
      g.lineWidth = 0.3 * k;
      g.beginPath();
      g.ellipse(x, y, (n.l + r * 2.2) * k, (0.6 + r * 1.1) * k, 0, 0, 2 * Math.PI);
      g.stroke();
    }
    g.fillStyle = 'rgba(176, 132, 80, 0.55)';
    g.beginPath();
    g.ellipse(x, y, n.l * 0.9 * k, 1.3 * k, 0, 0, 2 * Math.PI);
    g.fill();
    g.fillStyle = 'rgba(96, 64, 34, 0.85)';
    g.beginPath();
    g.ellipse(x, y, n.l * 0.55 * k, 0.55 * k, 0, 0, 2 * Math.PI);
    g.fill();
  }
  // Thin edge line where the sheet ends
  g.strokeStyle = 'rgba(120, 92, 56, 0.6)';
  g.lineWidth = 0.4 * k;
  g.strokeRect(0, 0, c.width, c.height);
  return (face = c);
}

let speckleTile: HTMLCanvasElement | null | undefined;

/** Fine fibre speckle of the MDF spoilboard, as a pattern in machine millimetres. */
function mdfSpeckle(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (speckleTile === undefined) {
    const t = document.createElement('canvas');
    t.width = t.height = 128;
    const g = t.getContext('2d');
    if (g) {
      const rnd = seeded(7);
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(90, 66, 40, 0.10)' : 'rgba(235, 215, 185, 0.10)';
        g.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
      }
    }
    speckleTile = g ? t : null;
  }
  if (!speckleTile) return null;
  const pattern = ctx.createPattern(speckleTile, 'repeat');
  // 128 px of the tile = 32 mm on the table
  pattern?.setTransform?.(new DOMMatrix().scale(0.25));
  return pattern;
}

// ---------- the camera's pictures with the stamp of the Pi ----------

/** Pictures a second the simulated server takes (a real camera: 15–30) */
const SIM_FRAME_FPS = 30;
/** Most pictures the simulated server keeps for the scan (the same as the real stream's ring) */
const SIM_FRAME_RING = 300;

/** A picture of the simulated camera, taken at the true moment: where the tool was and the stamp the Pi gave it. */
export interface SimFrame extends SourceFrame {
  /** Where the tool really was when it was taken (the camera sees the table from there) */
  tool: { x: number; y: number };
}

/**
 * The simulated camera server's stamped pictures (what `openStampedStream` is for a real one): taken at the true
 * moment – the machine is caught up to it first – and stamped with the Pi's clock plus the noise of the setup, to the
 * millisecond. **The page's camera lag (`lowriderCameraLag`) does not touch the stamp or the picture**; it only decides
 * when the page *says* it got it (`arrival`, for the recording). Nothing is drawn while the pictures are taken: a picture
 * is only a place and a stamp until `decode` paints it, as a JPEG is only bytes until it is decoded.
 */
class SimulatedFrames implements FrameSource<SimFrame> {
  ok = true;
  reason: string | undefined;
  evicted = 0;
  private kept: SimFrame[] = [];
  private spacing = 0.05;
  private lastKeptT = -Infinity;
  private lastStampMs = -Infinity;
  private seq = 0;
  private readonly timer = setInterval(() => this.take(), 1000 / SIM_FRAME_FPS);

  get domain(): StampDomain | null {
    return piClock()?.frameDomain ?? 'mono';
  }

  private take() {
    const pi = piClock();
    if (!pi || !this.ok) return;
    // the machine as it was at this very moment, not as it was at the last step of its timer
    liveSocket?.advance();
    const now = performance.now();
    const tool = simulator().physical();
    const wobble = (frameNoise() * 2 - 1) * pi.frameStampNoiseMs;
    const domain = pi.frameDomain ?? 'mono';
    const at = now + wobble + (pi.frameClockOffsetMs ?? 0);
    // whole milliseconds, going forward: what ustreamer prints
    const ms = Math.max(
      this.lastStampMs + 1,
      Math.round(domain === 'wall' ? wallOf(at) + pi.offsetMs : at + pi.offsetMs),
    );
    this.lastStampMs = ms;
    const t = ms / 1000;
    if (t - this.lastKeptT < this.spacing - 1e-6) return;
    this.lastKeptT = t;
    const lag = simulatorCameraLag;
    this.seq += 1;
    this.kept.push({
      stamp: {
        t,
        domain,
        source: domain === 'wall' ? 'x-timestamp' : 'x-ustreamer-grab-time',
      },
      // the page gets it late and unevenly – its own business, unseen by the stamp
      arrival: now + lag.ms + Math.sin(now * 0.37) * 0.5 * lag.jitterMs + lag.jitterMs * 0.5,
      tool: { x: tool.x, y: tool.y },
    });
    while (this.kept.length > SIM_FRAME_RING) {
      this.kept.shift();
      this.evicted += 1;
    }
  }

  frames(): readonly SimFrame[] {
    return this.kept.slice();
  }

  clear() {
    this.kept = [];
    this.lastKeptT = -Infinity;
  }

  setMinSpacing(seconds: number) {
    if (Number.isFinite(seconds) && seconds >= 0) this.spacing = seconds;
  }

  async decode(frame: SimFrame): Promise<Drawable | null> {
    const picture = document.createElement('canvas');
    picture.width = SIM_CAMERA.width;
    picture.height = SIM_CAMERA.height;
    paint(picture.getContext('2d')!, undefined, frame.tool);
    return picture;
  }

  close() {
    clearInterval(this.timer);
    if (this.ok) {
      this.ok = false;
      this.reason = 'closed';
    }
  }
}

/** The simulated camera server's stamped pictures, or null where no Pi is set up (`lowriderPiClock`). */
export function simulatorFrameSource(): FrameSource<SimFrame> | null {
  return piClock() ? new SimulatedFrames() : null;
}

/** Where the simulated workpieces lie, in machine coordinates (for the info card). */
export function simulatorScene() {
  return {
    plate: place(SIM_PLATE, { x: 0, y: 0 }),
    holes: SIM_BOARD.holes.map((h) => simulator().fromBoard(h)),
    jigTags: SIM_JIG.tags.map((t) => ({ id: t.id, ...simulator().fromJig(t) })),
    long: { ...simulator().long },
  };
}

/** Machine box (camera positions) that shows all blanks of the series scene, with a margin. */
export function simulatorBlanksArea(margin = 15) {
  const reach = (b: SimBlank) => Math.hypot(b.length, b.width) / 2 + margin;
  return {
    minX: Math.min(...SIM_BLANKS.map((b) => b.x - reach(b))),
    minY: Math.min(...SIM_BLANKS.map((b) => b.y - reach(b))),
    maxX: Math.max(...SIM_BLANKS.map((b) => b.x + reach(b))),
    maxY: Math.max(...SIM_BLANKS.map((b) => b.y + reach(b))),
  };
}
