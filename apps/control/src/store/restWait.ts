import {
  account,
  calmNow,
  FlushLearner,
  lookDiff,
  period,
  positionCalm,
  type Frame,
  type Look,
  type Report,
} from '../lib/calm';
import { cameraElement, pictureSize, type CameraPicture } from './camera';
import { useMachine } from './machine';
import { wait } from './settle';

/** How often the picture is looked at, ms – timers, not the screen's frames: a hidden page is slow and then shows nothing, which is no evidence */
export const SAMPLE_MS = 25;
/** Side of a patch of the picture that is looked at, px at the camera's own resolution, and of the blocks it is averaged in */
const PATCH = 48;
const BLOCK = 4;
/** The middle of the patches, as shares of the picture: the centre and the four quarters */
const CENTRES: readonly (readonly [number, number])[] = [
  [0.5, 0.5],
  [0.3, 0.3],
  [0.7, 0.3],
  [0.3, 0.7],
  [0.7, 0.7],
];
/** Most new frames one point keeps (a move of a few seconds at 40 looks a second is far below it) */
const MAX_FRAMES = 600;
/** Axes may differ by this much between the reports that make a position calm, mm (`settled`'s own tolerance) */
const ON_TARGET = 0.02;
/** Reports that must agree: the one that said "stopped" and the next */
const REPORTS = 2;
/**
 * The longest a point waits beyond its fixed pause for a picture that is still changing, ms – and, of the waits that ended
 * without a calm picture (`unsure`), all the points of one scan together
 */
export const EXTRA_MS = 1500;
export const EXTRA_BUDGET_MS = 15_000;
/** Points in a row that ended without a calm picture before what was learned is let go and the fixed pause runs again */
export const GIVE_UP_AFTER = 2;
/** New frames within this many ms say the picture is still being delivered */
const RECENT_MS = 250;

/**
 * Looks at the camera's picture at its own resolution, many times a second, and keeps the frames that are new (those that
 * differ from the one before at all – see `lib/calm.ts`). A picture that cannot be read – another origin that does not allow
 * it, no size yet – makes it `usable = false` and then it says nothing.
 */
export interface Watching {
  readonly frames: readonly Frame[];
  readonly usable: boolean;
  start(): void;
  stop(): void;
}

export class Eye implements Watching {
  readonly frames: Frame[] = [];
  usable = true;
  private last: Look | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private canvas: HTMLCanvasElement | null = null;

  constructor(
    private readonly source: () => CameraPicture | null = cameraElement,
    private readonly now: () => number = () => performance.now(),
  ) {}

  start(): void {
    const tick = () => {
      if (this.stopped) return;
      this.sample();
      this.timer = setTimeout(tick, SAMPLE_MS);
    };
    tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  /** One look: block means of the patches, grey levels */
  private read(el: CameraPicture): Look | null {
    const { width, height } = pictureSize(el);
    if (width < 2 * PATCH || height < 2 * PATCH || typeof document === 'undefined') return null;
    this.canvas ??= document.createElement('canvas');
    this.canvas.width = CENTRES.length * PATCH;
    this.canvas.height = PATCH;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      this.usable = false;
      return null;
    }
    let data: Uint8ClampedArray;
    try {
      CENTRES.forEach(([cx, cy], i) => {
        const sx = Math.min(width - PATCH, Math.max(0, Math.round(width * cx - PATCH / 2)));
        const sy = Math.min(height - PATCH, Math.max(0, Math.round(height * cy - PATCH / 2)));
        ctx.drawImage(el, sx, sy, PATCH, PATCH, i * PATCH, 0, PATCH, PATCH);
      });
      data = ctx.getImageData(0, 0, CENTRES.length * PATCH, PATCH).data;
    } catch {
      // a picture from another origin that does not allow reading it
      this.usable = false;
      return null;
    }
    const per = PATCH / BLOCK;
    const look = new Float32Array(CENTRES.length * per * per);
    const row = CENTRES.length * PATCH * 4;
    let k = 0;
    for (let p = 0; p < CENTRES.length; p++) {
      for (let by = 0; by < per; by++) {
        for (let bx = 0; bx < per; bx++) {
          let sum = 0;
          for (let y = 0; y < BLOCK; y++) {
            let i = (by * BLOCK + y) * row + (p * PATCH + bx * BLOCK) * 4;
            for (let x = 0; x < BLOCK; x++, i += 4)
              sum += (data[i]! * 77 + data[i + 1]! * 150 + data[i + 2]! * 29) >> 8;
          }
          look[k++] = sum / (BLOCK * BLOCK);
        }
      }
    }
    return look;
  }

  private sample(): void {
    const el = this.source();
    if (!el || !this.usable) return;
    const look = this.read(el);
    if (!look) return;
    if (this.last && lookDiff(this.last, look) <= 0) return;
    this.last = look;
    this.frames.push({ t: this.now(), look });
    if (this.frames.length > MAX_FRAMES) this.frames.shift();
  }
}

/** How a wait ended */
export interface RestResult {
  /**
   * `adaptive`: the picture was taken before the fixed pause was over, on evidence it shows the machine at rest;
   * `fixed`: at the fixed pause (no evidence, still learning, or the picture was calm by then); `unsure`: the picture was
   * still changing (or stood still after changing) at the longest wait and was taken anyway, as it would have been before
   */
  kind: 'adaptive' | 'fixed' | 'unsure';
  /** From the machine reporting rest to the picture being taken, ms */
  ms: number;
  /** The wait was longer than the fixed pause because the picture was still changing */
  extended: boolean;
  /** What had been learned of the camera when this point began */
  learned: boolean;
  /**
   * The wait was given up because the scan was cancelled or the link went away: the picture is not one the wait vouches for –
   * it is none to lay down, and the point teaches the waiter nothing
   */
  aborted?: true;
}

export interface RestOptions {
  /** Today's pause after the machine reports rest, ms: the settle time and the picture's lag */
  fixedMs: number;
  cancelled(): boolean;
}

/**
 * The wait for a picture at a stop, for one scan: the first points keep the fixed pause and are watched, and from what they
 * show (`FlushLearner`) the following ones take the picture as soon as the machine and the picture are calm. Anything that
 * does not hold up – no noise to tell new frames by, no move seen in the pictures, a picture still changing – is the fixed
 * pause, and a picture that is still changing at it is waited for (a little, and only so much in all).
 */
export class RestWaiter {
  readonly learner = new FlushLearner();
  private unsure = 0;
  private extraLeft = EXTRA_BUDGET_MS;

  private readonly source: () => CameraPicture | null;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly eye: (source: () => CameraPicture | null, now: () => number) => Watching;

  /** What it looks through, the clock, the pause between looks and how the picture is watched – the tests put their own in */
  constructor(
    env: {
      source?: () => CameraPicture | null;
      now?: () => number;
      sleep?: (ms: number) => Promise<void>;
      eye?: (source: () => CameraPicture | null, now: () => number) => Watching;
    } = {},
  ) {
    this.source = env.source ?? cameraElement;
    this.now = env.now ?? (() => performance.now());
    this.sleep = env.sleep ?? wait;
    this.eye = env.eye ?? ((source, now) => new Eye(source, now));
  }

  /** Starts watching, before the move is sent */
  begin(): Rest {
    return new Rest(this, this.eye(this.source, this.now), this.now, this.sleep);
  }

  /** @internal */
  settle(result: RestResult): void {
    if (result.kind === 'unsure') {
      if (++this.unsure >= GIVE_UP_AFTER) {
        // what was learned does not hold: the fixed pause again, and learning anew
        this.learner.lose();
        this.unsure = 0;
      }
    } else this.unsure = 0;
  }

  /** @internal */
  get budget(): number {
    return this.extraLeft;
  }

  /** @internal */
  spend(ms: number): void {
    this.extraLeft = Math.max(0, this.extraLeft - ms);
  }
}

/** One point: watches from the move on, and says when a picture may be taken */
export class Rest {
  private readonly reports: Report[] = [];
  private readonly off: () => void;

  constructor(
    private readonly waiter: RestWaiter,
    private readonly eye: Watching,
    private readonly now: () => number,
    private readonly sleep: (ms: number) => Promise<void>,
  ) {
    eye.start();
    this.off = useMachine.subscribe((s, prev) => {
      if (!s.status || s.status === prev.status) return;
      this.reports.push({
        x: s.status.mpos[0] ?? 0,
        y: s.status.mpos[1] ?? 0,
        z: s.status.mpos[2] ?? 0,
        idle: s.status.state === 'Idle',
      });
      if (this.reports.length > 50) this.reports.shift();
    });
  }

  stop(): void {
    this.eye.stop();
    this.off();
  }

  /** Waits (after `settled()`) until a picture may be taken */
  async finish(o: RestOptions): Promise<RestResult> {
    const learner = this.waiter.learner;
    const known = learner.known;
    const early = known ? learner.waitMs() : Infinity;
    const cap = o.fixedMs + Math.min(EXTRA_MS, this.waiter.budget);
    const t0 = this.now();
    let extended = false;
    const done = (kind: RestResult['kind']): RestResult => {
      const ms = this.now() - t0;
      const result = { kind, ms, extended, learned: known };
      // only a wait that came to nothing is charged: a camera that is simply late has to be waited for on every point
      if (kind === 'unsure') this.waiter.spend(Math.max(0, ms - o.fixedMs));
      this.waiter.settle(result);
      return result;
    };
    for (;;) {
      const t = this.now();
      const elapsed = t - t0;
      // gone before the picture was shown to be calm: no answer to the waiter's books either (the next point starts afresh)
      if (o.cancelled() || useMachine.getState().connection !== 'connected')
        return { kind: 'fixed', ms: elapsed, extended, learned: known, aborted: true };
      const frames = this.eye.usable ? this.eye.frames : [];
      const acc = account(frames, known ? learner.limit : null);
      const calm = acc.limit !== null && calmNow(frames, t, acc.limit);
      const learn = () =>
        learner.add({ flushMs: acc.final! - t0, noise: acc.noise, period: period(frames) });
      if (
        known &&
        elapsed >= early &&
        calm &&
        acc.moved &&
        positionCalm(this.reports, REPORTS, ON_TARGET)
      ) {
        learn();
        return done(elapsed < o.fixedMs ? 'adaptive' : 'fixed');
      }
      if (elapsed >= o.fixedMs) {
        if (calm) {
          if (acc.moved) learn();
          return done('fixed');
        }
        // not calm: still changing – or, after changing, standing still on a camera that has shown noise, which a camera that
        // delivers does not
        const changing = frames.filter((f) => t - f.t <= RECENT_MS).length >= 3;
        const frozen = learner.noisy && frames.length >= 3 && !changing;
        if (changing || frozen) {
          if (elapsed >= cap) return done('unsure');
          extended = true;
        } else return done('fixed');
      }
      await this.sleep(SAMPLE_MS);
    }
  }
}
