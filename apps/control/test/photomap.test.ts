import { describe, expect, it } from 'vitest';
import { imageToMachine } from '../src/lib/camera';
import {
  applyTransform,
  blendView,
  boundsOf,
  CHUNK_MM,
  chunkKey,
  chunkRect,
  chunksFor,
  cropRect,
  estimateScan,
  fitView,
  frameCorners,
  imageTransform,
  planScan,
  toMachine,
  toScreen,
  unionRect,
  visibleSize,
  zoomAround,
} from '../src/lib/photomap';

const size = { width: 640, height: 480 };
const spindle = { x: 100, y: 200 };

describe('photo map geometry', () => {
  for (const rotation of [0, 3, -20, 90]) {
    const cal = { offsetX: 40, offsetY: -10, pxPerMm: 10, rotation };
    it(`places image pixels where the camera sees them (rotation ${rotation}°)`, () => {
      const target = { k: 4, left: 50, top: 300 };
      const m = imageTransform(cal, spindle, size, target);
      for (const px of [
        { x: 320, y: 240 },
        { x: 0, y: 0 },
        { x: 600, y: 100 },
      ]) {
        const machine = imageToMachine(cal, px, size, spindle);
        const p = applyTransform(m, px);
        expect(p.x).toBeCloseTo(4 * (machine.x - 50));
        expect(p.y).toBeCloseTo(4 * (300 - machine.y));
      }
    });
  }

  it('crops the frame to its centre', () => {
    expect(cropRect(size, 0.5)).toEqual({ u: 160, v: 120, w: 320, h: 240 });
  });

  it('finds the corners of the cropped frame in machine XY', () => {
    const cal = { offsetX: 0, offsetY: 0, pxPerMm: 10, rotation: 0 };
    const [tl, tr, br, bl] = frameCorners(cal, spindle, size, 0.5);
    // 320 × 240 px at 10 px/mm = 32 × 24 mm around the spindle
    expect(tl.x).toBeCloseTo(84);
    expect(tl.y).toBeCloseTo(212);
    expect(tr.x).toBeCloseTo(116);
    expect(br.y).toBeCloseTo(188);
    expect(bl.x).toBeCloseTo(84);
    expect(boundsOf([tl, tr, br, bl])).toEqual({
      minX: expect.closeTo(84),
      minY: expect.closeTo(188),
      maxX: expect.closeTo(116),
      maxY: expect.closeTo(212),
    });
  });

  it('joins boxes', () => {
    const a = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    const b = { minX: -1, minY: 2, maxX: 0.5, maxY: 3 };
    expect(unionRect(null, null)).toBeNull();
    expect(unionRect(a, null)).toBe(a);
    expect(unionRect(null, b)).toBe(b);
    expect(unionRect(a, b)).toEqual({ minX: -1, minY: 0, maxX: 1, maxY: 3 });
  });

  it('shrinks the usable frame when the camera is turned', () => {
    const straight = visibleSize({ offsetX: 0, offsetY: 0, pxPerMm: 10, rotation: 0 }, size, 0.5);
    expect(straight).toEqual({ width: 32, height: 24 });
    const turned = visibleSize({ offsetX: 0, offsetY: 0, pxPerMm: 10, rotation: 10 }, size, 0.5);
    expect(turned.width).toBeLessThan(32);
    expect(turned.width / turned.height).toBeCloseTo(32 / 24);
    // Turned by 90° the frame stands upright: 24 mm along X, 32 mm along Y.
    const upright = visibleSize({ offsetX: 0, offsetY: 0, pxPerMm: 10, rotation: 90 }, size, 0.5);
    expect(upright.width).toBeCloseTo(24);
    expect(upright.height).toBeCloseTo(32);
    const back = visibleSize({ offsetX: 0, offsetY: 0, pxPerMm: 10, rotation: -100 }, size, 0.5);
    expect(back.width).toBeLessThan(24);
    expect(back.height).toBeLessThan(32);
  });
});

describe('scan planner', () => {
  const visible = { width: 50, height: 30 };

  it('covers the area in a serpentine with overlap', () => {
    const points = planScan({ minX: 0, minY: 0, maxX: 130, maxY: 50 }, visible, 0.2);
    // X: centres 25 … 105, step ≤ 40 → 25, 65, 105; Y: 15 … 35, step ≤ 24 → 15, 35
    expect(points).toEqual([
      { x: 25, y: 15 },
      { x: 65, y: 15 },
      { x: 105, y: 15 },
      { x: 105, y: 35 },
      { x: 65, y: 35 },
      { x: 25, y: 35 },
    ]);
  });

  it('scans a zero-height area as one strip along X', () => {
    const points = planScan({ minX: 100, minY: 40, maxX: 300, maxY: 40 }, visible, 0.2);
    expect(points.every((p) => p.y === 40)).toBe(true);
    expect(points[0]!.x).toBe(125);
    expect(points[points.length - 1]!.x).toBe(275);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.x - points[i - 1]!.x).toBeLessThanOrEqual(40 + 1e-9);
    }
  });

  it('takes one picture of an area smaller than a frame, and accepts reversed bounds', () => {
    expect(planScan({ minX: 10, minY: 10, maxX: 20, maxY: 20 }, visible)).toEqual([
      { x: 15, y: 15 },
    ]);
    expect(planScan({ minX: 20, minY: 20, maxX: 10, maxY: 10 }, visible)).toEqual([
      { x: 15, y: 15 },
    ]);
  });

  it('estimates the time from travel and the pause per picture', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    // 100 mm at 1000 mm/min = 6 s, plus 2 × 0.5 s
    expect(estimateScan(points, null, 1000, 500)).toBeCloseTo(7);
    // From a start 100 mm away: another 6 s
    expect(estimateScan(points, { x: -100, y: 0 }, 1000, 500)).toBeCloseTo(13);
    expect(estimateScan([], null, 1000, 500)).toBe(0);
  });
});

describe('map chunks', () => {
  it('lists the chunks a box touches', () => {
    expect(chunksFor({ minX: 10, minY: 10, maxX: 20, maxY: 20 })).toEqual([{ cx: 0, cy: 0 }]);
    const many = chunksFor({ minX: -1, minY: CHUNK_MM - 1, maxX: 1, maxY: CHUNK_MM + 1 });
    expect(many).toHaveLength(4);
    expect(many.map((c) => chunkKey(c.cx, c.cy))).toEqual(['-1,0', '-1,1', '0,0', '0,1']);
  });

  it('knows the box of a chunk', () => {
    expect(chunkRect(1, -1, 100)).toEqual({ minX: 100, minY: -100, maxX: 200, maxY: 0 });
  });
});

describe('map view', () => {
  const view = { scale: 2, originX: 100, originY: 300 };

  it('maps machine XY to the screen and back', () => {
    expect(toScreen(view, { x: 10, y: 20 })).toEqual({ x: 120, y: 260 });
    expect(toMachine(view, { x: 120, y: 260 })).toEqual({ x: 10, y: 20 });
  });

  it('zooms around a screen point and clamps the scale', () => {
    const z = zoomAround(view, { x: 120, y: 260 }, 2);
    expect(z.scale).toBe(4);
    expect(toScreen(z, { x: 10, y: 20 })).toEqual({ x: 120, y: 260 });
    expect(zoomAround(view, { x: 0, y: 0 }, 1000).scale).toBe(50);
    expect(zoomAround(view, { x: 0, y: 0 }, 0.0001).scale).toBe(0.05);
  });

  it('fits a box into the screen', () => {
    const v = fitView({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, { width: 248, height: 248 }, 24);
    expect(v.scale).toBe(2);
    expect(toScreen(v, { x: 50, y: 25 })).toEqual({ x: 124, y: 124 });
  });

  it('glides between two views', () => {
    const screen = { width: 200, height: 100 };
    const a = fitView({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, screen, 0);
    const b = fitView({ minX: 50, minY: 0, maxX: 75, maxY: 12.5 }, screen, 0);
    expect(blendView(a, b, 0, screen)).toEqual(a);
    const end = blendView(a, b, 1, screen);
    expect(end.scale).toBeCloseTo(b.scale);
    expect(end.originX).toBeCloseTo(b.originX);
    const mid = blendView(a, b, 0.5, screen);
    expect(mid.scale).toBeCloseTo(Math.sqrt(a.scale * b.scale));
  });
});

describe('camera calibrated for the map', () => {
  it('needs a measured scale, not just a camera height', async () => {
    const { cameraCalibrated } = await import('../src/store/photomap');
    expect(cameraCalibrated({ scaleCalibrated: false, focusHeight: 30 })).toBe(false);
    expect(cameraCalibrated({ scaleCalibrated: true, focusHeight: null })).toBe(false);
    expect(cameraCalibrated({ scaleCalibrated: true, focusHeight: 30 })).toBe(true);
  });
});
