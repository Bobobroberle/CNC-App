import { describe, expect, it } from 'vitest';
import type { CameraCalibration } from '../src/lib/camera';
import {
  COVERED,
  FlatField,
  Mosaic,
  frameWindow,
  highPassFrame,
  trustedBox,
  chunkOrigin,
  edgeWeight,
  gainAt,
  invert,
  type Affine,
  type Frame,
} from '../src/lib/mosaic';
import {
  CHUNK_PX,
  CROP,
  MAP_PX_PER_MM,
  imageTransform,
  planScan,
  visibleSize,
  type Rect,
} from '../src/lib/photomap';
import { lum, renderFrame, world, type Shot } from './synthetic';

const SIZE = { width: 320, height: 240 };
const CAL: CameraCalibration = { offsetX: 0, offsetY: 0, pxPerMm: 8, rotation: 0 };
const FRAME_MM = { w: SIZE.width / CAL.pxPerMm, h: SIZE.height / CAL.pxPerMm }; // 40 × 30

const place = (cal: CameraCalibration, sp: { x: number; y: number }): Affine =>
  imageTransform(cal, sp, SIZE, { k: MAP_PX_PER_MM, left: 0, top: 0 });

/** What the map shows at machine point (x, y), luminance, or null. */
function shown(mosaic: Mosaic, x: number, y: number): { lum: number; sum: number } | null {
  const p = mosaic.at(x * MAP_PX_PER_MM, -y * MAP_PX_PER_MM);
  return p ? { lum: lum([p.r, p.g, p.b]), sum: p.sum } : null;
}

/** The crosshair positions of a scan of `area`, as the app plans them. */
function scanCentres(area: Rect, cal: CameraCalibration = CAL) {
  return planScan(area, visibleSize(cal, SIZE));
}

describe('the weights of a frame', () => {
  it('are 1 over the trusted middle, 0 at the edge, and fall smoothly over the rim between', () => {
    expect(edgeWeight(160, 120, 320, 240)).toBe(1);
    expect(edgeWeight(0, 120, 320, 240)).toBe(0);
    expect(edgeWeight(160, 240, 320, 240)).toBe(0);
    // the middle CROP of each side counts fully, right up to its border
    const border = (1 - CROP) / 2;
    expect(edgeWeight(320 * border, 120, 320, 240)).toBeCloseTo(1, 9);
    expect(edgeWeight(320 * (1 - border), 120, 320, 240)).toBeCloseTo(1, 9);
    expect(edgeWeight(160, 240 * border, 320, 240)).toBeCloseTo(1, 9);
    const a = edgeWeight(10, 120, 320, 240);
    const b = edgeWeight(30, 120, 320, 240);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(1);
    expect(edgeWeight(100, 60, 320, 240)).toBeCloseTo(edgeWeight(220, 180, 320, 240), 9);
  });

  it('give an affine map and its inverse that undo one another', () => {
    const m: Affine = [1.3, 0.2, -0.4, 1.1, 30, -12];
    const inv = invert(m)!;
    const x = m[0] * 7 + m[2] * 9 + m[4];
    const y = m[1] * 7 + m[3] * 9 + m[5];
    expect(inv[0] * x + inv[2] * y + inv[4]).toBeCloseTo(7, 9);
    expect(inv[1] * x + inv[3] * y + inv[5]).toBeCloseTo(9, 9);
    expect(invert([0, 0, 0, 0, 1, 1])).toBeNull();
  });
});

describe('a frame laid onto the map', () => {
  it('shows the table where it was taken – the same as the table, within what a smaller raster loses', () => {
    const mosaic = new Mosaic();
    const sp = { x: 100, y: 60 };
    mosaic.paste(renderFrame(CAL, sp, SIZE), place(CAL, sp));
    let err = 0;
    let n = 0;
    for (let dy = -10; dy <= 10; dy += 1.3) {
      for (let dx = -14; dx <= 14; dx += 1.3) {
        const p = shown(mosaic, sp.x + dx, sp.y + dy);
        expect(p, `${dx},${dy}`).not.toBeNull();
        err += Math.abs(p!.lum - lum(world(sp.x + dx, sp.y + dy)));
        n++;
      }
    }
    expect(err / n).toBeLessThan(3);
  });

  it('is turned and scaled the way the calibration says', () => {
    const cal: CameraCalibration = { offsetX: 12, offsetY: -7, pxPerMm: 8, rotation: 17 };
    const mosaic = new Mosaic();
    const sp = { x: -40, y: 220 };
    mosaic.paste(renderFrame(cal, sp, SIZE), place(cal, sp));
    let err = 0;
    let n = 0;
    for (let dy = -6; dy <= 6; dy += 1.1) {
      for (let dx = -6; dx <= 6; dx += 1.1) {
        const x = sp.x + cal.offsetX + dx;
        const y = sp.y + cal.offsetY + dy;
        const p = shown(mosaic, x, y);
        expect(p).not.toBeNull();
        err += Math.abs(p!.lum - lum(world(x, y)));
        n++;
      }
    }
    expect(err / n).toBeLessThan(3.5);
  });

  it('fades out at its rim: only where the middle of a frame lies is the map "covered"', () => {
    const mosaic = new Mosaic();
    const sp = { x: 0, y: 0 };
    mosaic.paste(renderFrame(CAL, sp, SIZE), place(CAL, sp));
    const centre = shown(mosaic, 0, 0)!;
    expect(centre.sum).toBeGreaterThan(COVERED);
    const rim = shown(mosaic, FRAME_MM.w / 2 - 0.4, 0);
    expect(rim === null || rim.sum < COVERED).toBe(true);
    // the alpha channel says so: full in the middle, less at the rim
    const alphaAt = (x: number, y: number) => {
      const gx = Math.floor(x * MAP_PX_PER_MM);
      const gy = Math.floor(-y * MAP_PX_PER_MM);
      const cx = Math.floor(gx / CHUNK_PX);
      const cy = Math.floor(-(gy + 1) / CHUNK_PX);
      const chunk = mosaic.chunk(cx, cy, false)!;
      const o = chunkOrigin(cx, cy);
      return chunk.rgba[((gy - o.y) * CHUNK_PX + (gx - o.x)) * 4 + 3]!;
    };
    expect(alphaAt(0, 0)).toBe(255);
    expect(alphaAt(FRAME_MM.w / 2 - 0.4, 0)).toBeLessThan(255);
  });

  it('lets a newer picture of the same place win over many earlier ones within a few frames', () => {
    const mosaic = new Mosaic();
    const sp = { x: 100, y: 60 };
    const m = place(CAL, sp);
    for (let i = 0; i < 8; i++) mosaic.paste(renderFrame(CAL, sp, SIZE, { exposure: 1 }), m);
    const before = shown(mosaic, 100, 60)!.lum;
    for (let i = 0; i < 4; i++) mosaic.paste(renderFrame(CAL, sp, SIZE, { exposure: 1.5 }), m);
    const after = shown(mosaic, 100, 60)!.lum;
    const target = before * 1.5;
    expect((after - before) / (target - before)).toBeGreaterThan(0.75);
  });

  it('crosses the border of two chunks without a seam – chunks are 128 mm', () => {
    const mosaic = new Mosaic();
    const sp = { x: 127, y: 60 }; // the frame lies on chunk 0 and chunk 1
    mosaic.paste(renderFrame(CAL, sp, SIZE), place(CAL, sp));
    expect(mosaic.chunks.size).toBe(2);
    for (const x of [124, 126, 127.9, 128.1, 130, 132]) {
      const p = shown(mosaic, x, 60);
      expect(p).not.toBeNull();
      expect(Math.abs(p!.lum - lum(world(x, 60)))).toBeLessThan(6);
    }
  });

  it('cannot be placed with a map that has no inverse – nothing is drawn', () => {
    const mosaic = new Mosaic();
    expect(mosaic.paste(renderFrame(CAL, { x: 0, y: 0 }, SIZE), [0, 0, 0, 0, 0, 0])).toEqual([]);
    expect(mosaic.chunks.size).toBe(0);
  });

  it('forgets the chunks used least recently when there are too many', () => {
    const mosaic = new Mosaic();
    for (let i = 0; i < 4; i++) {
      const sp = { x: i * 200, y: 0 };
      mosaic.paste(renderFrame(CAL, sp, SIZE), place(CAL, sp));
    }
    const before = mosaic.chunks.size;
    const gone = mosaic.evict(3);
    expect(mosaic.chunks.size).toBe(3);
    expect(gone).toHaveLength(before - 3);
    mosaic.clear();
    expect(mosaic.chunks.size).toBe(0);
    expect(mosaic.box()).toBeNull();
  });
});

/** The old way: the middle 70 % of every frame, cut out and pasted, the last one on top. */
function hardPaste(frames: { frame: Frame; m: Affine }[]) {
  const map = new Map<string, number>();
  for (const { frame, m } of frames) {
    const inv = invert(m)!;
    const { width: w, height: h, data } = frame;
    const corners = [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ].map(([u, v]) => ({ x: m[0] * u! + m[2] * v! + m[4], y: m[1] * u! + m[3] * v! + m[5] }));
    for (
      let gy = Math.floor(Math.min(...corners.map((c) => c.y)));
      gy <= Math.ceil(Math.max(...corners.map((c) => c.y)));
      gy++
    ) {
      for (
        let gx = Math.floor(Math.min(...corners.map((c) => c.x)));
        gx <= Math.ceil(Math.max(...corners.map((c) => c.x)));
        gx++
      ) {
        const u = inv[0] * (gx + 0.5) + inv[2] * (gy + 0.5) + inv[4];
        const v = inv[1] * (gx + 0.5) + inv[3] * (gy + 0.5) + inv[5];
        if (u < w * 0.15 || u > w * 0.85 || v < h * 0.15 || v > h * 0.85) continue;
        const i = (Math.floor(v) * w + Math.floor(u)) * 4;
        map.set(`${gx},${gy}`, (data[i]! * 77 + data[i + 1]! * 150 + data[i + 2]! * 29) / 256);
      }
    }
  }
  return map;
}

/** The biggest jump between neighbouring map pixels that the table itself does not have: what a seam is. */
function seam(
  read: (x: number, y: number) => number | null,
  area: { x0: number; x1: number; y0: number; y1: number },
) {
  let worst = 0;
  let sum = 0;
  let n = 0;
  for (let y = area.y0; y < area.y1; y += 0.25) {
    for (let x = area.x0; x < area.x1; x += 0.25) {
      const here = read(x, y);
      const next = read(x + 0.25, y);
      const below = read(x, y + 0.25);
      if (here === null || next === null || below === null) continue;
      const jump = Math.max(
        Math.abs(next - here - (lum(world(x + 0.25, y)) - lum(world(x, y)))),
        Math.abs(below - here - (lum(world(x, y + 0.25)) - lum(world(x, y)))),
      );
      worst = Math.max(worst, jump);
      sum += jump;
      n++;
    }
  }
  return { worst, mean: sum / n };
}

describe('the seams between the frames', () => {
  // Frames of a scan with a vignette and a brightness of their own each – what a real camera does
  const shots: Shot[] = [
    { vignette: 0.35, exposure: 1.0 },
    { vignette: 0.35, exposure: 1.09 },
    { vignette: 0.35, exposure: 0.93 },
    { vignette: 0.35, exposure: 1.06 },
    { vignette: 0.35, exposure: 0.96 },
    { vignette: 0.35, exposure: 1.1 },
  ];
  const scan: Rect = { minX: 100, minY: 60, maxX: 200, maxY: 120 };
  const centres = scanCentres(scan);
  const frames = centres.map((sp, i) => ({
    sp,
    shot: shots[i % shots.length]!,
    frame: renderFrame(CAL, sp, SIZE, shots[i % shots.length]!),
    m: place(CAL, sp),
  }));
  const hard = hardPaste(frames);
  const readHard = (x: number, y: number) =>
    hard.get(`${Math.floor(x * 4)},${Math.floor(-y * 4)}`) ?? null;
  // the middle of the scanned area: where every pixel is covered by the trusted middle of some frame
  const area = { x0: scan.minX + 2, x1: scan.maxX - 2, y0: scan.minY + 2, y1: scan.maxY - 2 };

  it('are as large as the vignette and the brightness make them where frames are cut and pasted', () => {
    const { worst } = seam(readHard, area);
    expect(worst).toBeGreaterThan(12);
  });

  it('almost vanish where they are blended, the brightness matched and the vignette taken out', () => {
    const mosaic = new Mosaic();
    const flat = new FlatField();
    // the camera is known from earlier frames of other places, as it is after a few pictures
    for (let i = 0; i < 30; i++) {
      const sp = { x: -300 - i * 17, y: 40 + (i % 5) * 23 };
      flat.add(renderFrame(CAL, sp, SIZE, { vignette: 0.35, exposure: 0.9 + (i % 7) * 0.03 }));
    }
    for (const { frame, m } of frames) {
      const map = flat.gainMap();
      const gain = mosaic.matchGain(frame, m, map);
      mosaic.paste(frame, m, { gain, flat: map });
    }
    const read = (x: number, y: number) => shown(mosaic, x, y)?.lum ?? null;
    const { worst } = seam(read, area);
    const hardWorst = seam(readHard, area).worst;
    expect(worst).toBeLessThan(hardWorst / 2.5);
    expect(worst).toBeLessThan(8);
  });

  it('are smaller with the blending alone than with cut and paste – with no help from the vignette or the matching', () => {
    const mosaic = new Mosaic();
    for (const { frame, m } of frames) mosaic.paste(frame, m);
    const blended = seam((x, y) => shown(mosaic, x, y)?.lum ?? null, area).worst;
    expect(blended).toBeLessThan(seam(readHard, area).worst);
  });
});

describe('the brightness of a frame against the map', () => {
  it('is the factor that makes it match what lies there', () => {
    const mosaic = new Mosaic();
    const a = { x: 100, y: 60 };
    const b = { x: 100 + FRAME_MM.w * 0.5, y: 60 };
    mosaic.paste(renderFrame(CAL, a, SIZE, { exposure: 1 }), place(CAL, a));
    const brighter = renderFrame(CAL, b, SIZE, { exposure: 1.12 });
    const gain = mosaic.matchGain(brighter, place(CAL, b));
    expect(gain).toBeCloseTo(1 / 1.12, 1);
  });

  it('is 1 where the frame hardly meets the map – nothing to compare with', () => {
    const mosaic = new Mosaic();
    mosaic.paste(renderFrame(CAL, { x: 0, y: 0 }, SIZE), place(CAL, { x: 0, y: 0 }));
    const far = { x: 500, y: 500 };
    expect(mosaic.matchGain(renderFrame(CAL, far, SIZE, { exposure: 1.3 }), place(CAL, far))).toBe(
      1,
    );
    expect(new Mosaic().matchGain(renderFrame(CAL, far, SIZE), place(CAL, far))).toBe(1);
  });

  it('never goes beyond a fifth either way – a scene that changes is no change of exposure', () => {
    const mosaic = new Mosaic();
    const sp = { x: 0, y: 0 };
    mosaic.paste(renderFrame(CAL, sp, SIZE, { exposure: 1 }), place(CAL, sp));
    expect(
      mosaic.matchGain(renderFrame(CAL, sp, SIZE, { exposure: 2 }), place(CAL, sp)),
    ).toBeCloseTo(0.8, 6);
    expect(
      mosaic.matchGain(renderFrame(CAL, sp, SIZE, { exposure: 0.4 }), place(CAL, sp)),
    ).toBeCloseTo(1.2, 6);
  });
});

describe('the vignette of the camera', () => {
  const learn = (vignette: number, n: number) => {
    const flat = new FlatField();
    for (let i = 0; i < n; i++) {
      const sp = { x: -200 + i * 31, y: 20 + (i % 6) * 29 };
      flat.add(renderFrame(CAL, sp, SIZE, { vignette, exposure: 0.92 + (i % 5) * 0.04 }));
    }
    return flat;
  };

  it('is not known from a few frames – the map stays as it is', () => {
    expect(new FlatField().gainMap()).toBeNull();
    expect(learn(0.35, 4).gainMap()).toBeNull();
  });

  it('is learned from the frames: the corners come up, the middle stays', () => {
    const map = learn(0.35, 40).gainMap()!;
    const centre = gainAt(map, 160, 120, 320, 240);
    const corner = gainAt(map, 6, 6, 320, 240);
    expect(centre).toBeCloseTo(1, 1);
    expect(corner).toBeGreaterThan(1.15);
    // after the gain, the corner of a frame is as bright as the middle, within what the table varies
    const frame = renderFrame(CAL, { x: 700, y: 400 }, SIZE, { vignette: 0.35 });
    const at = (u: number, v: number) => {
      const i = (v * 320 + u) * 4;
      return frame.data[i + 1]! * gainAt(map, u, v, 320, 240);
    };
    const flatFrame = renderFrame(CAL, { x: 700, y: 400 }, SIZE, { vignette: 0 });
    const ref = (u: number, v: number) => flatFrame.data[(v * 320 + u) * 4 + 1]!;
    let err = 0;
    let errRaw = 0;
    let n = 0;
    for (let v = 5; v < 235; v += 10) {
      for (let u = 5; u < 315; u += 10) {
        err += Math.abs(at(u, v) - ref(u, v));
        errRaw += Math.abs(frame.data[(v * 320 + u) * 4 + 1]! - ref(u, v));
        n++;
      }
    }
    expect(err / n).toBeLessThan((errRaw / n) * 0.6);
  });

  it('counts for more with more frames, and is forgotten on request', () => {
    const few = learn(0.35, 8).gainMap()!;
    const many = learn(0.35, 40).gainMap()!;
    expect(gainAt(few, 6, 6, 320, 240)).toBeLessThan(gainAt(many, 6, 6, 320, 240));
    const flat = learn(0.35, 40);
    expect(flat.count).toBe(40);
    flat.reset();
    expect(flat.count).toBe(0);
    expect(flat.gainMap()).toBeNull();
  });

  it('is not made of a frame that is nearly black', () => {
    const flat = new FlatField();
    const dark: Frame = { data: new Uint8ClampedArray(64 * 48 * 4), width: 64, height: 48 };
    for (let i = 0; i < 10; i++) flat.add(dark);
    expect(flat.count).toBe(0);
  });
});

describe('the area of a scan', () => {
  const covered = (cal: CameraCalibration, area: Rect, shot: Shot = {}) => {
    const mosaic = new Mosaic();
    for (const c of planScan(area, visibleSize(cal, SIZE))) {
      const sp = { x: c.x - cal.offsetX, y: c.y - cal.offsetY };
      mosaic.paste(renderFrame(cal, sp, SIZE, shot), place(cal, sp));
    }
    let holes = 0;
    let n = 0;
    // right up to the rim of the area (half a map pixel inside it)
    for (let y = area.minY + 0.13; y < area.maxY; y += 0.5) {
      for (let x = area.minX + 0.13; x < area.maxX; x += 0.5) {
        const p = shown(mosaic, x, y);
        n++;
        if (!p || p.sum < COVERED) holes++;
      }
    }
    return { holes, n };
  };

  it('is covered right up to its edge – the finders trust only what is fully covered', () => {
    const area: Rect = { minX: 100, minY: 60, maxX: 260, maxY: 150 };
    const { holes, n } = covered(CAL, area);
    expect(n).toBeGreaterThan(1000);
    expect(holes).toBe(0);
  });

  it('is covered with the camera turned and set off, too', () => {
    for (const rotation of [17, -8, 90, 135]) {
      const cal: CameraCalibration = { offsetX: 12, offsetY: -7, pxPerMm: 8, rotation };
      const area: Rect = { minX: -40, minY: 200, maxX: 120, maxY: 290 };
      expect(covered(cal, area).holes, `rotation ${rotation}`).toBe(0);
    }
  });

  it('is covered with a vignette and different brightnesses, too', () => {
    const area: Rect = { minX: 0, minY: 0, maxX: 120, maxY: 80 };
    expect(covered(CAL, area, { vignette: 0.4, exposure: 1.1 }).holes).toBe(0);
  });
});

describe('a table that is not as the calibration says', () => {
  /** A board edge: dark left of x = 150, bright right of it */
  const edge = (x: number): [number, number, number] => (x < 150 ? [60, 52, 40] : [200, 172, 132]);

  /** Width in mm in which the map goes from 10 % to 90 % of the step, along the row y */
  function edgeWidth(trueScale: number): number {
    const mosaic = new Mosaic();
    const truth: CameraCalibration = { ...CAL, pxPerMm: CAL.pxPerMm * trueScale };
    const area: Rect = { minX: 120, minY: 60, maxX: 180, maxY: 90 };
    for (const c of planScan(area, visibleSize(CAL, SIZE))) {
      // the frame shows the table at the true scale; the map believes the calibration
      mosaic.paste(
        renderFrame(truth, c, SIZE, {}, (x) => edge(x)),
        place(CAL, c),
      );
    }
    const dark = lum(edge(0));
    const bright = lum(edge(300));
    const lo = dark + 0.1 * (bright - dark);
    const hi = dark + 0.9 * (bright - dark);
    let from = NaN;
    let to = NaN;
    for (let x = 140; x < 160; x += 0.05) {
      const p = shown(mosaic, x, 75);
      if (!p) continue;
      if (Number.isNaN(from) && p.lum > lo) from = x;
      if (Number.isNaN(to) && p.lum > hi) to = x;
    }
    return to - from;
  }

  it('shows a sharp edge about as sharp as the map can draw it with a calibration right, and softer – not doubled – with a scale 1 % off', () => {
    const exact = edgeWidth(1);
    const off = edgeWidth(1.01);
    expect(exact).toBeLessThan(1);
    // what blending costs when two frames disagree by a few tenths of a millimetre
    expect(off).toBeLessThan(exact + 1.2);
  });
});

describe('the vignette of the camera, from frames of a board edge', () => {
  it('is no gradient across the picture: left and right of the middle get the same gain', () => {
    const flat = new FlatField();
    for (let i = 0; i < 40; i++) {
      const frame = renderFrame(CAL, { x: -200 + i * 31, y: 20 + (i % 6) * 29 }, SIZE, {
        vignette: 0.3,
      });
      // a board edge at the same place of every frame: the left half of the picture is dark
      for (let y = 0; y < SIZE.height; y++) {
        for (let x = 0; x < SIZE.width / 2; x++) {
          const o = (y * SIZE.width + x) * 4;
          frame.data[o] = frame.data[o]! * 0.4;
          frame.data[o + 1] = frame.data[o + 1]! * 0.4;
          frame.data[o + 2] = frame.data[o + 2]! * 0.4;
        }
      }
      flat.add(frame);
    }
    const map = flat.gainMap()!;
    for (const v of [30, 120, 210]) {
      const left = gainAt(map, 20, v, 320, 240);
      const right = gainAt(map, 300, v, 320, 240);
      expect(Math.abs(left - right)).toBeLessThan(0.05);
    }
    // and it never darkens anything
    expect(gainAt(map, 160, 120, 320, 240)).toBeGreaterThanOrEqual(1);
    expect(gainAt(map, 5, 5, 320, 240)).toBeGreaterThanOrEqual(1);
  });
});

describe('what a registration compares', () => {
  const frame = (f: (x: number, y: number) => number): Frame => {
    const data = new Uint8ClampedArray(SIZE.width * SIZE.height * 4);
    for (let y = 0; y < SIZE.height; y++) {
      for (let x = 0; x < SIZE.width; x++) {
        const o = (y * SIZE.width + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = f(x, y);
        data[o + 3] = 255;
      }
    }
    return { data, width: SIZE.width, height: SIZE.height };
  };
  const m = imageTransform(CAL, { x: 0, y: 0 }, SIZE, { k: MAP_PX_PER_MM, left: 0, top: 0 });

  it('is the trusted middle of a frame: the box of the map it covers, and nothing outside it', () => {
    const f = frame(() => 100);
    const box = trustedBox(f, m);
    // CROP of 40 × 30 mm at 4 px per mm
    expect(box.width).toBeCloseTo(40 * CROP * MAP_PX_PER_MM, -0.5);
    expect(box.height).toBeCloseTo(30 * CROP * MAP_PX_PER_MM, -0.5);
    const win = frameWindow(f, m, { x0: box.x0 - 20, y0: box.y0 - 20, width: box.width + 40, height: box.height + 40 });
    const at = (x: number, y: number) => win.valid[(y - (box.y0 - 20)) * win.width + (x - (box.x0 - 20))];
    expect(at(box.x0 + 5, box.y0 + 5)).toBe(1);
    expect(at(box.x0 + box.width - 5, box.y0 + box.height - 5)).toBe(1);
    expect(at(box.x0 - 5, box.y0 + 5)).toBe(0);
    expect(at(box.x0 + box.width + 5, box.y0 + 5)).toBe(0);
  });

  it('is sampled every few pixels, brightness and vignette gain applied, and empty for a map that has no inverse', () => {
    const f = frame(() => 100);
    const box = trustedBox(f, m);
    const coarse = frameWindow(f, m, box, 2, 1.5);
    expect(coarse.width).toBe(Math.ceil(box.width / 2));
    expect(coarse.gray[Math.floor(coarse.gray.length / 2)]).toBeCloseTo(150, 0);
    const dead = frameWindow(f, [0, 0, 0, 0, 0, 0], box);
    expect(dead.valid.every((v) => v === 0)).toBe(true);
  });

  it('has the slow changes taken out: a ramp or a brightness vanishes, a texture stays', () => {
    const ramp = highPassFrame(frame((x) => 40 + x * 0.5), 16);
    const mid = (SIZE.height / 2) * SIZE.width + SIZE.width / 2;
    expect(Math.abs(ramp.gray![mid]!)).toBeLessThan(0.5);
    const flat = highPassFrame(frame(() => 180), 16);
    expect(Math.abs(flat.gray![mid]!)).toBeLessThan(1e-3);
    const dots = highPassFrame(frame((x, y) => ((x >> 2) + (y >> 2)) % 2 ? 200 : 60), 16);
    let energy = 0;
    for (let i = 0; i < dots.gray!.length; i += 7) energy += Math.abs(dots.gray![i]!);
    expect(energy / (dots.gray!.length / 7)).toBeGreaterThan(30);
  });
});
