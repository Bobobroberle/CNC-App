import type { MachineStatus } from '@lowrider/fluidnc-client';
import { beforeEach, describe, expect, it } from 'vitest';
import { lookDiff, type Frame, type Look } from '../src/lib/calm';
import { useMachine } from '../src/store/machine';
import {
  EXTRA_BUDGET_MS,
  EXTRA_MS,
  GIVE_UP_AFTER,
  RestWaiter,
  type Watching,
} from '../src/store/restWait';

// The wait for a picture at a stop, played on a clock of its own: a camera that is late by `lag` ms, has noise or none, and
// may stand still for a while; a machine that reports every 200 ms and stops at a known time. Nothing here sleeps.

const FIXED = 850;
const STOP = 1000;

interface Camera {
  /** The picture shows the table this many ms late */
  lag: number;
  /** Every new picture differs a little from the one before (a real sensor); false – the simulator as it was */
  noise: boolean;
  /** Nothing new is delivered between these times (ms) */
  freeze?: [number, number];
  /** Nothing to see: the table looks the same wherever the machine is */
  flat?: boolean;
  /** A flicker of the light: every fifth picture is far brighter than the noise (the noise of a live camera is not even) */
  flicker?: boolean;
  /**
   * What the camera shows before the move reaches it is the table as it lay before the move, standing still – not the slope
   * the move would make, going back in time (a camera so late that, at the stop, it still shows the stop before)
   */
  still?: boolean;
}

/** How the machine reports: how often (ms, a multiple of 25) and whether the position still rings after the stop */
interface Reports {
  every?: number;
  /** The reports of the stop before this time (ms) alternate by 0.1 mm either way – the gantry has not come to rest */
  ringUntil?: number;
}

/** One point: a machine that moves until STOP and a camera, both read off a virtual clock */
class World implements Watching {
  t = 0;
  readonly frames: Frame[] = [];
  usable = true;
  idle = false;
  private rung = 0;
  private last: Look | null = null;
  private held: { base: number; noise: number } | null = null;

  constructor(
    private readonly camera: Camera,
    private readonly reportPhase = 0,
    private readonly reports: Reports = {},
  ) {}

  start(): void {}
  stop(): void {}

  /** The grey level the table shows when it was photographed at `at`: a slope up to the stop, flat after */
  private base(at: number): number {
    if (this.camera.flat) return 100;
    const when = this.camera.still ? Math.max(0, at) : at;
    return when < STOP ? 100 + (STOP - when) / 10 : 100;
  }

  /** What the picture shows now – the level of the table and the noise of the picture it is */
  private shown(): { base: number; noise: number } {
    const frozen =
      this.camera.freeze && this.t >= this.camera.freeze[0] && this.t < this.camera.freeze[1];
    if (frozen && this.held) return this.held;
    const at = this.t - this.camera.lag;
    const n = Math.floor(at / 33);
    const flicker = this.camera.flicker && n % 5 === 0 ? 3 : 0;
    const now = { base: this.base(at), noise: (this.camera.noise && n % 2 ? 0.4 : 0) + flicker };
    this.held = now;
    return now;
  }

  /** The level on the picture at this moment – 100 is the table at rest */
  level(): number {
    return this.shown().base;
  }

  advance(ms: number): void {
    for (let done = 0; done < ms; done += 25) {
      this.t += 25;
      const { base, noise } = this.shown();
      const look = [base + noise, base + noise, base + noise, base + noise];
      if (!this.last || lookDiff(this.last, look) > 0) {
        this.frames.push({ t: this.t, look });
        this.last = look;
      }
      if (
        (this.t - this.reportPhase) % (this.reports.every ?? 200) === 0 &&
        this.t >= this.reportPhase
      ) {
        const moving = this.t < STOP;
        // ringing: the position of the stop is 10 mm give or take 0.1 – a report to the one before it differs by 0.2
        const rings = !moving && this.t < (this.reports.ringUntil ?? 0);
        const x = rings ? 10 + (this.rung++ % 2 ? 0.1 : -0.1) : 10;
        const mpos = moving ? [this.t / 100, 20, 0] : [x, 20, 0];
        this.idle ||= !moving;
        useMachine.setState({
          status: {
            state: moving ? 'Run' : 'Idle',
            mpos,
            wpos: mpos,
            wco: [0, 0, 0],
          } as unknown as MachineStatus,
        });
      }
    }
  }
}

let world: World;
const waiter = (extra: ConstructorParameters<typeof RestWaiter>[0] = {}) =>
  new RestWaiter({
    now: () => world.t,
    sleep: async (ms) => world.advance(ms),
    eye: () => world,
    ...extra,
  });

beforeEach(() => {
  useMachine.setState({ connection: 'connected', status: null });
});

/** A point: the machine moves, the first report that says Idle is what `settled()` returns, then the wait */
async function point(
  w: RestWaiter,
  camera: Camera,
  o: { phase?: number; cancelled?: () => boolean; reports?: Reports } = {},
) {
  world = new World(camera, o.phase ?? 0, o.reports);
  const rest = w.begin();
  while (!world.idle && world.t < 5000) world.advance(25);
  const result = await rest.finish({ fixedMs: FIXED, cancelled: o.cancelled ?? (() => false) });
  rest.stop();
  return { result, level: world.level() };
}

const QUICK: Camera = { lag: 100, noise: true };

/** The waiter has learned the camera: three points at the fixed pause */
async function learned(w: RestWaiter, camera: Camera = QUICK) {
  for (let i = 0; i < 3; i++) {
    const { result } = await point(w, camera, { phase: 50 * i });
    expect(result.kind).toBe('fixed');
    expect(result.learned).toBe(false);
  }
  expect(w.learner.known).toBe(true);
}

describe('the wait for a picture at a stop', () => {
  it('keeps the fixed pause on the first points and learns the camera from them', async () => {
    const w = waiter();
    for (let i = 0; i < 3; i++) {
      expect(w.learner.known).toBe(false);
      const { result, level } = await point(w, QUICK, { phase: 50 * i });
      // at the fixed pause, with the picture at rest
      expect(result.kind).toBe('fixed');
      expect(result.ms).toBeGreaterThanOrEqual(FIXED);
      expect(result.ms).toBeLessThan(FIXED + 50);
      expect(level).toBe(100);
    }
    expect(w.learner.known).toBe(true);
  });

  it('then takes the picture as soon as the machine and the picture are calm – and never before the picture shows the stop', async () => {
    const w = waiter();
    await learned(w);
    for (const phase of [0, 50, 100, 150]) {
      const { result, level } = await point(w, QUICK, { phase });
      expect(result.kind).toBe('adaptive');
      expect(result.learned).toBe(true);
      expect(result.extended).toBe(false);
      // the table was at rest in the picture when it was taken (and the camera is 100 ms late)
      expect(level).toBe(100);
      // well before the fixed pause, but not before the picture had been calm for 150 ms
      expect(result.ms).toBeGreaterThan(150);
      expect(result.ms).toBeLessThan(FIXED / 2);
    }
  });

  it('waits for a camera that gets slower: the picture is still changing when the learned wait is over', async () => {
    const w = waiter();
    await learned(w);
    const { result, level } = await point(w, { lag: 600, noise: true });
    expect(level).toBe(100);
    // the learned wait was about 200 ms; the picture showed the stop 600 ms after it
    expect(result.ms).toBeGreaterThanOrEqual(600 + 150 - 100);
    expect(result.kind).not.toBe('unsure');
  });

  it('does not take a picture from before the stop when the camera stops delivering at the very moment the machine stops', async () => {
    const w = waiter();
    await learned(w);
    // frozen from 900 to 1600 on the screen: the last picture shows the table 100 ms before the stop
    const short = await point(w, { ...QUICK, freeze: [900, 1600] });
    expect(short.level).toBe(100);
    // the picture was calm again only 150 ms after the stream came back – before the fixed pause was over
    expect(short.result.kind).toBe('adaptive');
    expect(short.result.ms).toBeGreaterThanOrEqual(1600 + 150 - STOP);
    // frozen for longer than the fixed pause: it is waited for, beyond it
    const long = await point(w, { ...QUICK, freeze: [900, 2300] });
    expect(long.level).toBe(100);
    expect(long.result.extended).toBe(true);
    expect(long.result.ms).toBeGreaterThanOrEqual(2300 + 150 - STOP);
    expect(long.result.kind).not.toBe('unsure');
  });

  it('is no evidence where the camera has no noise: new frames cannot be told from a stream that stopped, so the fixed pause runs', async () => {
    const w = waiter();
    for (let i = 0; i < 5; i++) {
      const { result, level } = await point(w, { lag: 100, noise: false }, { phase: 50 * i });
      expect(result.kind).toBe('fixed');
      expect(result.extended).toBe(false);
      expect(result.ms).toBeGreaterThanOrEqual(FIXED);
      expect(result.ms).toBeLessThan(FIXED + 50);
      expect(level).toBe(100);
    }
    expect(w.learner.known).toBe(false);
  });

  it('learns nothing from a table with nothing to see, and keeps the fixed pause on it', async () => {
    const w = waiter();
    for (let i = 0; i < 5; i++) {
      const { result } = await point(w, { lag: 100, noise: true, flat: true });
      expect(result.kind).toBe('fixed');
      expect(result.ms).toBeLessThan(FIXED + 50);
    }
    expect(w.learner.known).toBe(false);
  });

  it('keeps the fixed pause where the picture cannot be read, and where the machine or the link goes away', async () => {
    const w = waiter();
    world = new World(QUICK);
    world.usable = false;
    const rest = w.begin();
    while (!world.idle && world.t < 5000) world.advance(25);
    const result = await rest.finish({ fixedMs: FIXED, cancelled: () => false });
    rest.stop();
    expect(result.kind).toBe('fixed');
    expect(result.ms).toBeGreaterThanOrEqual(FIXED);
    // cancelled: at once – and said to be given up, so that no picture is laid down for it
    const cancelled = await point(w, QUICK, { cancelled: () => true });
    expect(cancelled.result.ms).toBe(0);
    expect(cancelled.result.aborted).toBe(true);
    // no link: at once, the same
    useMachine.setState({ connection: 'disconnected' });
    const gone = await point(w, QUICK);
    expect(gone.result.ms).toBe(0);
    expect(gone.result.aborted).toBe(true);
    // a wait that ran to its end is none of that
    useMachine.setState({ connection: 'connected' });
    expect((await point(w, QUICK)).result.aborted).toBeUndefined();
  });

  it('counts a wait that was given up as nothing: it neither ends a run of unsure points nor makes one', async () => {
    const w = waiter();
    await learned(w);
    expect((await point(w, { lag: 5000, noise: true })).result.kind).toBe('unsure');
    // the operator cancels (or the link goes) on the next point: that is no answer about the camera …
    expect((await point(w, QUICK, { cancelled: () => true })).result.aborted).toBe(true);
    // … so the next unsure point is the second one of the run, and what was learned goes
    expect((await point(w, { lag: 5000, noise: true })).result.kind).toBe('unsure');
    expect(w.learner.known).toBe(false);
  });

  it('waits for a picture that is still changing, but only so long – and lets go of what it learned after two such points', async () => {
    const w = waiter();
    await learned(w);
    // a camera 5 s late: at the fixed pause the picture still shows the move
    const first = await point(w, { lag: 5000, noise: true });
    expect(first.result.kind).toBe('unsure');
    expect(first.result.extended).toBe(true);
    expect(first.result.ms).toBeGreaterThanOrEqual(FIXED + EXTRA_MS);
    expect(first.result.ms).toBeLessThan(FIXED + EXTRA_MS + 50);
    // one is not enough to let go of it (and the constant says two: the test says it in numbers too)
    expect(GIVE_UP_AFTER).toBe(2);
    expect(w.learner.known).toBe(true);
    expect((await point(w, { lag: 5000, noise: true })).result.kind).toBe('unsure');
    // two in a row: the camera is not the one that was learned – the fixed pause and learning again
    expect(w.learner.known).toBe(false);
    const again = await point(w, QUICK);
    expect(again.result.kind).toBe('fixed');
    expect(again.result.learned).toBe(false);
  });

  it('takes no shortcut on a picture that shows nothing of the move, however calm it is: the fixed pause, as before – which cannot help a picture that is old', async () => {
    const w = waiter();
    await learned(w);
    // the camera is so late that at the stop it still shows the table as it lay before the move: standing still, with noise.
    // Calm – but there is nothing in it that says the move was seen, so it is no evidence (the move shows from 1.9 s on)
    const { result, level } = await point(w, { lag: 1900, noise: true, still: true });
    expect(result.learned).toBe(true);
    expect(result.kind).toBe('fixed');
    expect(result.ms).toBeGreaterThanOrEqual(FIXED);
    expect(result.extended).toBe(false);
    // what the fixed pause takes then is a picture from before the stop – the behaviour of the fixed pause, and what no
    // wait can see (docs/scan.md, "Die Grenzen der Tests")
    expect(level).toBeGreaterThan(100);
    // a picture that is old only until the move shows in it, as it does at the next stop, is waited for as always
    const quick = await point(w, QUICK);
    expect(quick.result.kind).toBe('adaptive');
    expect(quick.level).toBe(100);
  });

  it('does not take the picture before the machine has said twice that it stands, however calm the picture is already', async () => {
    const w = waiter();
    // a camera that is not late: its picture is final the moment the machine stops
    const live: Camera = { lag: 0, noise: true };
    await learned(w, live);
    // the machine reports every 0.6 s: the first Idle is a report at 1200 ms, the second one at 1800 ms. The picture is calm
    // from the first (the learned wait is 100 ms) – but one report is not two
    const slow = await point(w, live, { reports: { every: 600 } });
    expect(slow.result.kind).toBe('adaptive');
    expect(slow.result.ms).toBeGreaterThanOrEqual(600);
    expect(slow.level).toBe(100);
  });

  it('does not take the picture while the machine still rings: its reports must agree to 0.02 mm', async () => {
    const w = waiter();
    const live: Camera = { lag: 0, noise: true };
    await learned(w, live);
    // Idle every 0.2 s, but each report 0.2 mm from the one before it until 1.7 s: no two of them agree, and the picture
    // (calm for a long time) does not say how the gantry stands – the fixed pause it is
    const ringing = await point(w, live, { reports: { ringUntil: 1700 } });
    expect(ringing.result.kind).toBe('fixed');
    expect(ringing.result.ms).toBeGreaterThanOrEqual(FIXED);
    // the same machine at rest is quick
    const quiet = await point(w, live);
    expect(quiet.result.kind).toBe('adaptive');
    expect(quiet.result.ms).toBeLessThan(FIXED / 2);
  });

  it('never takes the picture before the wait it learned, even where the picture is calm sooner', async () => {
    const w = waiter();
    // learned on a camera that shows the stop 0.6 s late: the picture is final 0.6 s after the machine reports rest
    await learned(w, { lag: 600, noise: true });
    const learnedWait = w.learner.waitMs();
    expect(learnedWait).toBeGreaterThanOrEqual(600);
    expect(learnedWait).toBeLessThan(FIXED);
    // now it is quick (a camera that was given a shorter pipeline): calm at about 0.25 s – and still not before the learned wait
    const { result, level } = await point(w, QUICK);
    expect(result.kind).toBe('adaptive');
    expect(result.ms).toBeGreaterThanOrEqual(learnedWait);
    expect(result.ms).toBeLessThan(FIXED);
    expect(level).toBe(100);
  });

  it('shows what the shortcuts it does not take would have done, on the same cameras: a plain wait and a calm by the clock each take a picture from before the stop', async () => {
    const toRest = (camera: Camera) => {
      world = new World(camera);
      while (!world.idle && world.t < 5000) world.advance(25);
      return world;
    };
    // 1. a plain wait of 350 ms after the machine reports rest, on a camera that is 0.4 s late: the picture still shows the move
    const plain = toRest({ lag: 400, noise: true });
    plain.advance(350);
    expect(plain.level()).toBeGreaterThan(100);
    // … and the wait, learned on that camera, does not
    const w = waiter();
    await learned(w, { lag: 400, noise: true });
    const wise = await point(w, { lag: 400, noise: true });
    expect(wise.result.kind).toBe('adaptive');
    expect(wise.level).toBe(100);
    // 2. "calm" told by the clock alone – nothing has differed from the newest picture for 150 ms – on a stream that stops
    // delivering at 0.9 s: it holds for a stream that delivers nothing, and the picture is the one before the stop
    const clock = toRest({ lag: 100, noise: true, freeze: [900, 1600] });
    const calmByClock = () => {
      const newest = clock.frames[clock.frames.length - 1]!;
      return clock.frames
        .filter((f) => clock.t - f.t <= 150)
        .every((f) => lookDiff(f.look, newest.look) <= 0.65);
    };
    while (!calmByClock()) clock.advance(25);
    expect(clock.level()).toBeGreaterThan(100);
    // … and the wait on the same stream does not take it (the test for it is above: 'does not take a picture from before the stop')
    const frozen = await point(w, { lag: 100, noise: true, freeze: [900, 1600] });
    expect(frozen.level).toBe(100);
  });

  it('spends its budget only on waits that came to nothing: a camera that is simply late is waited for on every point', async () => {
    const w = waiter();
    // 1.5 s late – more than the fixed pause: every point of a table's worth waits beyond it, and none ends without a calm picture
    for (let i = 0; i < 32; i++) {
      const { result, level } = await point(w, { lag: 1500, noise: true }, { phase: 25 * (i % 8) });
      expect(level, `point ${i}`).toBe(100);
      expect(result.kind, `point ${i}`).not.toBe('unsure');
      expect(result.extended, `point ${i}`).toBe(true);
    }
  });

  it('spends no more than a budget on waiting for pictures that never become calm – and takes none early meanwhile', async () => {
    const w = waiter();
    const spent: number[] = [];
    // a flicker of the light: the noise is not even, so the camera cannot be judged and the picture is never called calm
    for (let i = 0; i < EXTRA_BUDGET_MS / EXTRA_MS + 4; i++) {
      const { result } = await point(
        w,
        { lag: 100, noise: true, flicker: true },
        { phase: 25 * (i % 8) },
      );
      expect(result.kind).not.toBe('adaptive');
      spent.push(Math.max(0, result.ms - FIXED));
    }
    expect(w.learner.known).toBe(false);
    // ten points used the whole budget; the rest ended at the fixed pause
    expect(spent.slice(0, 10).every((ms) => ms >= EXTRA_MS)).toBe(true);
    expect(spent.slice(10).every((ms) => ms < 50)).toBe(true);
    expect(spent.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(EXTRA_BUDGET_MS + 14 * 50);
  });
});
