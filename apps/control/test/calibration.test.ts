import { describe, expect, it } from 'vitest';
import {
  calibrationConfig,
  centreLoop,
  CENTRE_TOLERANCE,
  proposeCorrections,
  type CentreIO,
} from '../src/store/calibration';
import { DEFAULT_SETTINGS } from '../src/store/workshop';

/** A camera 20 px/mm over a dot at `dot`; the app believes `believed` px/mm. */
function fakeIO(dot: { x: number; y: number }, believed: number, backlash = 0) {
  let commanded = { x: 0, y: 0 };
  let lastDir = { x: 1, y: 1 };
  const moves: { x: number; y: number }[] = [];
  const io: CentreIO = {
    pxPerMm: believed,
    async marker() {
      // The physical position lags by the play after a move towards −.
      const phys = {
        x: commanded.x - (lastDir.x < 0 ? backlash : 0),
        y: commanded.y - (lastDir.y < 0 ? backlash : 0),
      };
      const dx = dot.x - phys.x;
      const dy = dot.y - phys.y;
      if (Math.hypot(dx, dy) > 5) return null;
      return { x: dx * 20, y: -dy * 20 };
    },
    toMm: (px, pxPerMm) => ({ x: px.x / pxPerMm, y: -px.y / pxPerMm }),
    async move(target) {
      lastDir = {
        x: target.x === commanded.x ? lastDir.x : Math.sign(target.x - commanded.x),
        y: target.y === commanded.y ? lastDir.y : Math.sign(target.y - commanded.y),
      };
      commanded = target;
      moves.push(target);
      return true;
    },
    cancelled: () => false,
  };
  return { io, moves, start: (p: { x: number; y: number }) => (commanded = p) };
}

describe('centring on a dot', () => {
  it('converges and approaches from the same side every time', async () => {
    const f = fakeIO({ x: 3.2, y: -1.7 }, 20);
    f.start({ x: 0, y: 0 });
    const found = (await centreLoop(f.io, { x: 0, y: 0 }))!;
    expect(Math.abs(found.x - 3.2)).toBeLessThan(CENTRE_TOLERANCE);
    expect(Math.abs(found.y + 1.7)).toBeLessThan(CENTRE_TOLERANCE);
    // Every target is reached by a move in + after a back-off.
    for (let i = 1; i < f.moves.length; i += 2) {
      expect(f.moves[i]!.x).toBeGreaterThan(f.moves[i - 1]!.x);
    }
  });

  it('learns the real scale when the camera calibration is off', async () => {
    const f = fakeIO({ x: 2, y: 2 }, 11); // believes 11 px/mm, really 20
    f.start({ x: 0, y: 0 });
    const found = (await centreLoop(f.io, { x: 0, y: 0 }))!;
    expect(Math.hypot(found.x - 2, found.y - 2)).toBeLessThan(CENTRE_TOLERANCE);
  });

  it('shows belt play as the difference of both approach directions', async () => {
    const up = fakeIO({ x: 1, y: 1 }, 20, 0.08);
    up.start({ x: 0, y: 0 });
    const low = (await centreLoop(up.io, { x: 0, y: 0 }, 1))!;
    const down = fakeIO({ x: 1, y: 1 }, 20, 0.08);
    down.start({ x: 2, y: 2 });
    const high = (await centreLoop(down.io, { x: 2, y: 2 }, -1))!;
    expect(high.x - low.x).toBeCloseTo(0.08, 1);
  });

  it('gives up without a dot or when cancelled', async () => {
    const f = fakeIO({ x: 50, y: 0 }, 20);
    f.start({ x: 0, y: 0 });
    expect(await centreLoop(f.io, { x: 0, y: 0 })).toBeNull();
    const c = fakeIO({ x: 1, y: 0 }, 20);
    expect(await centreLoop({ ...c.io, cancelled: () => true }, { x: 0, y: 0 })).toBeNull();
    const stuck = fakeIO({ x: 1, y: 0 }, 20);
    expect(await centreLoop({ ...stuck.io, move: async () => false }, { x: 0, y: 0 })).toBeNull();
  });
});

const CONFIG = `
axes:
  x:
    steps_per_mm: 50.000
  y:
    steps_per_mm: 50.000
    homing:
      positive_direction: false
    motor0:
      pulloff_mm: 4.000
    motor1:
      pulloff_mm: 4.000
`;

describe('corrections', () => {
  const errors = (scaleX: number, scaleY: number, squareness: number) => ({
    scaleX,
    scaleY,
    squareness,
    plateAngle: 0,
    rms: 0.01,
    max: 0.02,
    points: 9,
  });
  const settings = {
    ...DEFAULT_SETTINGS.calibration,
    gantryWidth: 1000,
    motor1Side: 'xMax' as const,
  };

  it('reads steps and pull-offs from config.yaml', () => {
    expect(calibrationConfig(CONFIG)).toEqual({
      stepsX: 50,
      stepsY: 50,
      pulloff0: 4,
      pulloff1: 4,
      homingPositive: false,
    });
    expect(calibrationConfig('axes:\n  x:\n    steps_per_mm: 80\n')).toBeNull();
    expect(calibrationConfig('board: x\n')).toBeNull();
  });

  it('proposes steps/mm and pull-offs from a precision plate', () => {
    const p = proposeCorrections(
      errors(1.002, 0.9995, 0.1),
      null,
      settings,
      calibrationConfig(CONFIG),
    );
    expect(p.missing).toEqual([]);
    expect(p.corrections.map((c) => [c.path, c.to])).toEqual([
      ['axes/x/steps_per_mm', 49.9],
      ['axes/y/steps_per_mm', 50.025],
      ['axes/y/motor0/pulloff_mm', 4.873],
      ['axes/y/motor1/pulloff_mm', 3.127],
    ]);
    expect(p.shift).toBeCloseTo(-1.745, 3);
  });

  it('trusts a print only for the angle, and only after turning it', () => {
    const print = { ...settings, precise: false };
    const config = calibrationConfig(CONFIG);
    const once = proposeCorrections(errors(1.01, 1.01, 0.12), null, print, config);
    expect(once.squareness).toBeNull();
    expect(once.missing).toEqual(['turnPlate']);
    expect(once.corrections).toEqual([]);
    const both = proposeCorrections(
      errors(1.01, 1.01, 0.12),
      errors(1.01, 1.01, 0.04),
      print,
      config,
    );
    expect(both.squareness).toBeCloseTo(0.08, 6);
    expect(both.corrections.every((c) => c.path.includes('pulloff'))).toBe(true);
  });

  it('keeps quiet below the noise and says what is missing', () => {
    const config = calibrationConfig(CONFIG);
    expect(proposeCorrections(null, null, settings, config).corrections).toEqual([]);
    const fine = proposeCorrections(errors(1.0001, 0.9999, 0.001), null, settings, config);
    expect(fine.corrections).toEqual([]);
    expect(fine.missing).toEqual([]);
    const averaged = proposeCorrections(
      errors(1.002, 1.0, 0),
      errors(1.0, 1.002, 0),
      settings,
      config,
    );
    expect(averaged.corrections.map((c) => c.to)).toEqual([49.95, 49.95]);
    const noGantry = proposeCorrections(
      errors(1, 1, 0.1),
      null,
      { ...settings, gantryWidth: null },
      config,
    );
    expect(noGantry.missing).toEqual(['gantry']);
    expect(proposeCorrections(errors(1, 1, 0.1), null, settings, null).missing).toEqual(['config']);
  });
});
