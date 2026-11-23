import { describe, expect, it } from 'vitest';
import {
  rectangleCheck,
  axisErrors,
  combineReversal,
  correctedSteps,
  fitAffine,
  planGrid,
  predictMarker,
  squaringPulloff,
  twoHoleAlignment,
  zTilt,
  type MarkerPair,
  type Vec,
} from '../src/calibration';

const RAD = Math.PI / 180;

/**
 * A simulated machine: commanded c → physical E·c. Returns the commanded
 * position at which the camera is centred over each plate marker.
 */
function measure(
  grid: Vec[],
  m: { kx: number; ky: number; gamma: number },
  plate: { angle: number; skew?: number; at: Vec; turned?: boolean },
): MarkerPair[] {
  const g = m.gamma * RAD;
  const [e11, e12, e22] = [m.kx, m.ky * Math.sin(g), m.ky * Math.cos(g)];
  const r = plate.angle * RAD;
  const b = (plate.skew ?? 0) * RAD;
  return grid.map((p) => {
    // Plate coordinates of the marker: turned by 90°, the plate's −Y edge runs along machine X.
    const o = plate.turned ? { x: p.y, y: -p.x } : p;
    // A plate whose own Y lines lean towards +X by `skew`
    const s = { x: o.x + Math.sin(b) * o.y, y: Math.cos(b) * o.y };
    const q = plate.turned ? { x: -s.y, y: s.x } : s;
    const P = {
      x: plate.at.x + Math.cos(r) * q.x - Math.sin(r) * q.y,
      y: plate.at.y + Math.sin(r) * q.x + Math.cos(r) * q.y,
    };
    // c = E⁻¹·P
    const cy = P.y / e22;
    const cx = (P.x - e12 * cy) / e11;
    return { nominal: p, machine: { x: cx, y: cy } };
  });
}

describe('measurement grid', () => {
  it('visits rows back and forth', () => {
    expect(planGrid(180, 90, 3, 2)).toEqual([
      { x: 0, y: 0 },
      { x: 90, y: 0 },
      { x: 180, y: 0 },
      { x: 180, y: 90 },
      { x: 90, y: 90 },
      { x: 0, y: 90 },
    ]);
    expect(planGrid(100, 100, 1, 1)).toEqual([{ x: 0, y: 0 }]);
  });
});

describe('axis errors', () => {
  const grid = planGrid(180, 180, 3, 3);

  it('recovers scale and squareness whatever the plate angle', () => {
    const pairs = measure(
      grid,
      { kx: 1.002, ky: 0.998, gamma: 0.1 },
      { angle: 1.5, at: { x: 300, y: 500 } },
    );
    const e = axisErrors(pairs)!;
    expect(e.scaleX).toBeCloseTo(1.002, 6);
    expect(e.scaleY).toBeCloseTo(0.998, 6);
    expect(e.squareness).toBeCloseTo(0.1, 6);
    expect(e.plateAngle).toBeCloseTo(1.5, 6);
    expect(e.rms).toBeLessThan(1e-9);
    expect(e.max).toBeLessThan(1e-9);
    expect(e.points).toBe(9);
  });

  it('separates the plate from the machine by turning it 90°', () => {
    const machine = { kx: 1, ky: 1, gamma: 0.08 };
    const first = axisErrors(
      measure(grid, machine, { angle: 0.3, skew: 0.05, at: { x: 0, y: 0 } }),
    )!;
    const turned = axisErrors(
      measure(grid, machine, { angle: 0.3, skew: 0.05, at: { x: 400, y: 0 }, turned: true }),
    )!;
    // A plate leaning the same way hides part of the machine's error ...
    expect(first.squareness).toBeCloseTo(0.03, 4);
    // ... and adds to it once turned.
    expect(turned.squareness).toBeCloseTo(0.13, 4);
    const r = combineReversal(first, turned);
    expect(r.squareness).toBeCloseTo(0.08, 3);
    expect(r.plateSquareness).toBeCloseTo(0.05, 3);
  });

  it('needs three points off one line', () => {
    expect(fitAffine([])).toBeNull();
    const line = planGrid(100, 0, 3, 1).map((p) => ({ nominal: p, machine: p }));
    expect(fitAffine(line)).toBeNull();
    expect(axisErrors(line)).toBeNull();
  });
});

describe('next marker', () => {
  const pairs = measure(
    planGrid(180, 180, 3, 3),
    { kx: 1, ky: 1, gamma: 0 },
    { angle: 2, at: { x: 50, y: 60 } },
  );

  it('predicts from one, two and three points', () => {
    expect(predictMarker([], { x: 0, y: 0 })).toBeNull();
    const one = predictMarker(pairs.slice(0, 1), pairs[1]!.nominal)!;
    expect(one.x).toBeCloseTo(50 + 90, 6);
    expect(one.y).toBeCloseTo(60, 6);
    const two = predictMarker(pairs.slice(0, 2), pairs[3]!.nominal)!;
    expect(two.x).toBeCloseTo(pairs[3]!.machine.x, 6);
    expect(two.y).toBeCloseTo(pairs[3]!.machine.y, 6);
    const three = predictMarker(pairs.slice(0, 4), pairs[8]!.nominal)!;
    expect(three.x).toBeCloseTo(pairs[8]!.machine.x, 6);
  });
});

describe('corrections', () => {
  it('scales steps/mm against the measured travel', () => {
    expect(correctedSteps(50, 1.002)).toBe(49.9);
    expect(correctedSteps(50, 0.998)).toBe(50.1);
  });

  it('squares the gantry with the Y pull-offs', () => {
    // 0.1° over 1000 mm: the X+ end runs 1.745 mm ahead and must come back.
    const base = {
      pulloff0: 4,
      pulloff1: 4,
      gantryWidth: 1000,
      squareness: 0.1,
      homingPositive: false,
    };
    const r = squaringPulloff({ ...base, motor1Side: 'xMax' });
    expect(r.shift).toBeCloseTo(-1.745, 3);
    expect(r.pulloff1 - r.pulloff0).toBeCloseTo(-1.745, 2);
    expect(r.pulloff0 + r.pulloff1).toBeCloseTo(8, 3);
    const left = squaringPulloff({ ...base, motor1Side: 'xMin' });
    expect(left.pulloff1 - left.pulloff0).toBeCloseTo(1.745, 2);
    const up = squaringPulloff({ ...base, motor1Side: 'xMax', homingPositive: true });
    expect(up.pulloff1 - up.pulloff0).toBeCloseTo(1.745, 2);
  });

  it('keeps both pull-offs clear of the switch', () => {
    const r = squaringPulloff({
      pulloff0: 1.5,
      pulloff1: 1.5,
      gantryWidth: 1000,
      squareness: 0.2,
      motor1Side: 'xMax',
      homingPositive: false,
    });
    expect(Math.min(r.pulloff0, r.pulloff1)).toBeCloseTo(1, 3);
    expect(r.pulloff1 - r.pulloff0).toBeCloseTo(-3.491, 2);
  });

  it('reads the tilt of Z from two heights', () => {
    const t = zTilt({ x: 10, y: 20 }, { x: 9.8, y: 20 }, 50);
    expect(t.x).toBeCloseTo(0.229, 3);
    expect(t.y).toBeCloseTo(0, 6);
    expect(t.per100).toBeCloseTo(0.4, 6);
  });
});

describe('two holes', () => {
  it('finds zero and rotation that put the job holes onto the found ones', () => {
    const job = { a: { x: 20, y: 10 }, b: { x: 220, y: 10 } };
    // Workpiece turned 1.5° and lying with its origin at machine (300, 400)
    const r = (1.5 * Math.PI) / 180;
    const place = (p: Vec) => ({
      x: 300 + Math.cos(r) * p.x - Math.sin(r) * p.y,
      y: 400 + Math.sin(r) * p.x + Math.cos(r) * p.y,
    });
    const a = twoHoleAlignment({ a: place(job.a), b: place(job.b) }, job)!;
    expect(a.rotation).toBeCloseTo(1.5, 9);
    expect(a.origin.x).toBeCloseTo(300, 9);
    expect(a.origin.y).toBeCloseTo(400, 9);
    expect(a.distanceError).toBeCloseTo(0, 9);
  });

  it('keeps the angle between −180° and 180° and reports a wrong distance', () => {
    const a = twoHoleAlignment(
      { a: { x: 0, y: 0 }, b: { x: -100.5, y: 0 } },
      { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
    )!;
    expect(Math.abs(a.rotation)).toBeCloseTo(180, 9);
    expect(a.distanceError).toBeCloseTo(0.5, 9);
    expect(
      twoHoleAlignment(
        { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } },
        { a: { x: 0, y: 0 }, b: { x: 9, y: 0 } },
      ),
    ).toBeNull();
    expect(
      twoHoleAlignment(
        { a: { x: 0, y: 0 }, b: { x: 9, y: 0 } },
        { a: { x: 1, y: 1 }, b: { x: 1, y: 1 } },
      ),
    ).toBeNull();
  });
});

describe('rectangle check with a rule', () => {
  /** Marks a machine with these errors cuts for a nominal rectangle, measured exactly. */
  const cut = (w: number, h: number, kx: number, ky: number, gammaDeg: number) => {
    const g = (gammaDeg * Math.PI) / 180;
    const A = { x: 0, y: 0 };
    const B = { x: kx * w, y: 0 };
    const D = { x: ky * h * Math.sin(g), y: ky * h * Math.cos(g) };
    const C = { x: B.x + D.x, y: D.y };
    const d = (p: { x: number; y: number }, q: { x: number; y: number }) =>
      Math.hypot(p.x - q.x, p.y - q.y);
    return {
      bottom: d(A, B),
      top: d(D, C),
      left: d(A, D),
      right: d(B, C),
      diagonalAC: d(A, C),
      diagonalBD: d(B, D),
    };
  };

  it('finds scale and lean of the machine that cut the marks', () => {
    const r = rectangleCheck({ x: 500, y: 400 }, cut(500, 400, 1.002, 0.997, 0.05))!;
    expect(r.scaleX).toBeCloseTo(1.002, 6);
    expect(r.scaleY).toBeCloseTo(0.997, 6);
    expect(r.squareness).toBeCloseTo(0.05, 6);
    expect(r.rms).toBeLessThan(1e-9);
    expect(r.trapezoid).toBeLessThan(1e-9);
    expect(r.points).toBe(4);
    expect(rectangleCheck({ x: 500, y: 400 }, cut(500, 400, 1, 1, -0.1))!.squareness).toBeCloseTo(
      -0.1,
      6,
    );
  });

  it('shows when the measurements do not fit together', () => {
    const m = { ...cut(500, 400, 1, 1, 0), top: 501, diagonalBD: 641.5 };
    const r = rectangleCheck({ x: 500, y: 400 }, m)!;
    expect(r.trapezoid).toBeCloseTo(1, 6);
    expect(r.rms).toBeGreaterThan(0.1);
  });

  it('refuses missing or impossible values', () => {
    const ok = cut(500, 400, 1, 1, 0);
    expect(rectangleCheck({ x: 500, y: 400 }, { ...ok, left: 0 })).toBeNull();
    expect(rectangleCheck({ x: 500, y: 400 }, { ...ok, top: Number.NaN })).toBeNull();
    expect(rectangleCheck({ x: 0, y: 400 }, ok)).toBeNull();
    expect(rectangleCheck({ x: 500, y: 0 }, ok)).toBeNull();
    expect(rectangleCheck({ x: 500, y: 400 }, { ...ok, diagonalAC: 720 })).toBeNull();
  });
});
