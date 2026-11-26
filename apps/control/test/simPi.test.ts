import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FluidNCConnection } from '@lowrider/fluidnc-client';
import {
  piClock,
  resetSimulator,
  simulatedPi,
  simulatorCameraLag,
  simulatorFrameSource,
  SimulatorSocket,
  type PiClockSetup,
} from '../src/sim';

// The simulated Pi: a clock hours ahead of the page's, a link that is late and uneven, stamps before every message –
// and none of it unless a test sets it up.

const PI: PiClockSetup = {
  offsetMs: 7_200_000,
  linkMs: 40,
  linkJitterMs: 60,
  stampNoiseMs: 4,
  frameStampNoiseMs: 2,
};

const global = globalThis as { lowriderPiClock?: PiClockSetup };

beforeEach(() => {
  vi.useFakeTimers();
  resetSimulator();
});

afterEach(() => {
  delete global.lowriderPiClock;
  simulatorCameraLag.ms = 0;
  simulatorCameraLag.jitterMs = 0;
  vi.useRealTimers();
});

/** What a socket sends the page in `ms`, in the order it came: text frames as strings, the rest as the bytes' text */
function received(socket: SimulatorSocket): { at: number; frame: string; binary: boolean }[] {
  const out: { at: number; frame: string; binary: boolean }[] = [];
  socket.onmessage = ({ data }) =>
    out.push({
      at: performance.now(),
      binary: typeof data !== 'string',
      frame: typeof data === 'string' ? data : new TextDecoder().decode(data as ArrayBuffer),
    });
  return out;
}

describe('the simulated Pi', () => {
  it('is none by default: one frame per message, no stamp, almost at once – the simulator as it always was', async () => {
    expect(simulatedPi()).toBe(false);
    const socket = new SimulatorSocket();
    const frames = received(socket);
    await vi.advanceTimersByTimeAsync(40);
    frames.length = 0;
    socket.send('?');
    await vi.advanceTimersByTimeAsync(10);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.binary).toBe(true);
    expect(frames[0]!.frame).toMatch(/^<Idle\|MPos:/);
    expect(frames.every((f) => !f.frame.startsWith('STAMP:'))).toBe(true);
    socket.close();
  });

  it("puts a stamp frame right before each message, on a clock far from the page's, late and in order", async () => {
    global.lowriderPiClock = PI;
    expect(piClock()).toBe(PI);
    const socket = new SimulatorSocket();
    const frames = received(socket);
    await vi.advanceTimersByTimeAsync(40);
    frames.length = 0;
    const sentAt = performance.now();
    for (let i = 0; i < 5; i++) {
      socket.send('?');
      await vi.advanceTimersByTimeAsync(7);
    }
    await vi.advanceTimersByTimeAsync(300);
    const stamps = frames.filter((f) => !f.binary);
    const data = frames.filter((f) => f.binary);
    expect(data.length).toBeGreaterThanOrEqual(5);
    // a stamp before each message, in the form the library takes, and the stamp and its message in one piece
    expect(stamps).toHaveLength(data.length);
    frames.forEach((f, i) => expect(f.binary).toBe(i % 2 === 1));
    expect(frames.every((f, i) => i % 2 === 1 || /^STAMP:\d+\.\d{3}:\d+$/.test(f.frame))).toBe(
      true,
    );
    // the Pi's clock runs two hours ahead (plus a few ms), the page sees each message at least `linkMs` after it was measured
    const monos = stamps.map((f) => Number(f.frame.split(':')[1]));
    for (const mono of monos) {
      expect(mono - sentAt).toBeGreaterThan(PI.offsetMs);
      expect(mono - sentAt).toBeLessThan(PI.offsetMs + 400);
    }
    // never going back
    monos.slice(1).forEach((m, i) => expect(m).toBeGreaterThan(monos[i]!));
    expect(
      Math.min(...frames.filter((f) => f.binary).map((f) => f.at)) - sentAt,
    ).toBeGreaterThanOrEqual(PI.linkMs - 1);
    socket.close();
  });

  it("is understood by the library as a relay's stamp: the report carries it, the reports before and after theirs", async () => {
    global.lowriderPiClock = PI;
    const connection = new FluidNCConnection({
      url: 'x',
      createSocket: () => new SimulatorSocket(),
    });
    const reports: { mono: number; wall: number }[] = [];
    connection.on('status', (_report, stamp) => {
      if (stamp) reports.push(stamp);
    });
    const opened = connection.connect();
    await vi.advanceTimersByTimeAsync(600);
    await opened;
    expect(reports.length).toBeGreaterThan(0);
    for (const s of reports) {
      expect(s.mono).toBeGreaterThan(PI.offsetMs);
      // the wall clock of the simulated Pi is real time plus the offset: years of milliseconds, not the page's counter
      expect(s.wall).toBeGreaterThan(1.7e12);
    }
    connection.disconnect();
  });

  it('can be an older companion: as late and uneven, but nothing stamped', async () => {
    global.lowriderPiClock = { ...PI, stamps: false };
    const socket = new SimulatorSocket();
    const frames = received(socket);
    // the greeting is on its way over the same link
    await vi.advanceTimersByTimeAsync(400);
    frames.length = 0;
    socket.send('?');
    await vi.advanceTimersByTimeAsync(300);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.binary).toBe(true);
    socket.close();
  });
});

describe("the simulated camera server's pictures", () => {
  it('is nothing without a Pi', () => {
    expect(simulatorFrameSource()).toBeNull();
  });

  it("are stamped on the Pi's clock to the millisecond, in order, spaced as asked – whatever the camera lag in the page", async () => {
    global.lowriderPiClock = PI;
    simulatorCameraLag.ms = 300;
    simulatorCameraLag.jitterMs = 40;
    const source = simulatorFrameSource()!;
    expect(source.ok).toBe(true);
    expect(source.domain).toBe('mono');
    source.setMinSpacing(0.1);
    const from = performance.now();
    await vi.advanceTimersByTimeAsync(1000);
    const frames = source.frames();
    expect(frames.length).toBeGreaterThan(5);
    expect(frames.length).toBeLessThan(12);
    for (const f of frames) {
      expect(f.stamp.domain).toBe('mono');
      expect(f.stamp.source).toBe('x-ustreamer-grab-time');
      // whole milliseconds
      expect(Math.abs(f.stamp.t * 1000 - Math.round(f.stamp.t * 1000))).toBeLessThan(1e-6);
      // the Pi's clock at the moment it was taken (not 0.3 s earlier, as the page's camera shows it)
      expect(f.stamp.t * 1000 - from).toBeGreaterThan(PI.offsetMs - 10);
      expect(f.stamp.t * 1000 - from).toBeLessThan(PI.offsetMs + 1010);
      // the page gets it late, by the camera's lag
      expect(f.arrival).toBeGreaterThan(f.stamp.t * 1000 - PI.offsetMs + 250);
    }
    frames
      .slice(1)
      .forEach((f, i) => expect(f.stamp.t - frames[i]!.stamp.t).toBeGreaterThanOrEqual(0.1 - 1e-6));
    // `clear` forgets them, and the ring stays bounded
    source.clear();
    expect(source.frames()).toHaveLength(0);
    source.close();
    expect(source.ok).toBe(false);
    expect(source.reason).toBe('closed');
  });

  it('can be in another clock than the reports (a driver with its own), or in the wall clock', async () => {
    global.lowriderPiClock = { ...PI, frameClockOffsetMs: 3_600_000 };
    const off = simulatorFrameSource()!;
    await vi.advanceTimersByTimeAsync(200);
    const stamp = off.frames()[0]!.stamp;
    // an hour from the reports' clock – what `domainFits` is there to find out
    expect(stamp.t * 1000 - performance.now()).toBeGreaterThan(PI.offsetMs + 3_500_000);
    off.close();

    global.lowriderPiClock = { ...PI, frameDomain: 'wall' };
    const wall = simulatorFrameSource()!;
    await vi.advanceTimersByTimeAsync(200);
    expect(wall.domain).toBe('wall');
    expect(wall.frames()[0]!.stamp).toMatchObject({ domain: 'wall', source: 'x-timestamp' });
    expect(wall.frames()[0]!.stamp.t).toBeGreaterThan(1.7e9);
    wall.close();
  });
});
