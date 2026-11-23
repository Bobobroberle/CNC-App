import { describe, expect, it } from 'vitest';
import {
  calibrateFromMove,
  edgeAngle,
  imageToMachine,
  machineToImage,
  offsetFromMark,
  skewAngle,
} from '../src/lib/camera';

const size = { width: 640, height: 480 };
const spindle = { x: 100, y: 200 };

describe('camera geometry', () => {
  const cal = { offsetX: 40, offsetY: -10, pxPerMm: 10, rotation: 0 };

  it('maps the image centre to the spindle plus offset', () => {
    expect(imageToMachine(cal, { x: 320, y: 240 }, size, spindle)).toEqual({ x: 140, y: 190 });
    // 50 px right and 30 px down = +5 mm X, −3 mm Y
    const p = imageToMachine(cal, { x: 370, y: 270 }, size, spindle);
    expect(p.x).toBeCloseTo(145);
    expect(p.y).toBeCloseTo(187);
  });

  it('round-trips with a rotated camera', () => {
    const rotated = { ...cal, rotation: 30 };
    const m = imageToMachine(rotated, { x: 100, y: 50 }, size, spindle);
    const back = machineToImage(rotated, m, size, spindle);
    expect(back.x).toBeCloseTo(100);
    expect(back.y).toBeCloseTo(50);
  });

  it('calibrates scale and rotation from a jog', () => {
    // Machine +10 mm X: a fixed feature moves 100 px left in a square camera.
    expect(calibrateFromMove({ x: 400, y: 240 }, { x: 300, y: 240 }, { x: 10, y: 0 })).toEqual({
      pxPerMm: 10,
      rotation: 0,
    });
    // Camera turned by −90°: the same move shows up as 100 px down.
    const r = calibrateFromMove({ x: 320, y: 200 }, { x: 320, y: 300 }, { x: 10, y: 0 })!;
    expect(r.pxPerMm).toBeCloseTo(10);
    expect(r.rotation).toBeCloseTo(-90);
    const cam = { offsetX: 0, offsetY: 0, ...r };
    // Check against the model: the feature is fixed in the machine frame.
    const feature = imageToMachine(cam, { x: 320, y: 200 }, size, { x: 0, y: 0 });
    const seen = machineToImage(cam, feature, size, { x: 10, y: 0 });
    expect(seen.x).toBeCloseTo(320);
    expect(seen.y).toBeCloseTo(300);
    expect(calibrateFromMove({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 10, y: 0 })).toBeNull();
    expect(calibrateFromMove({ x: 1, y: 1 }, { x: 50, y: 1 }, { x: 0, y: 0 })).toBeNull();
    expect(
      calibrateFromMove({ x: 300, y: 240 }, { x: 400, y: 240 }, { x: 10, y: 0 })!.rotation,
    ).toBeCloseTo(-180);
  });

  it('finds the spindle offset from a mark', () => {
    const offset = offsetFromMark(
      { pxPerMm: 10, rotation: 0 },
      { x: 150, y: 190 },
      { x: 100, y: 200 },
      { x: 420, y: 240 },
      size,
    );
    expect(offset).toEqual({ x: 40, y: -10 });
    const full = { offsetX: offset.x, offsetY: offset.y, pxPerMm: 10, rotation: 0 };
    expect(imageToMachine(full, { x: 420, y: 240 }, size, spindle)).toEqual({ x: 150, y: 190 });
  });

  it('measures edge angles', () => {
    expect(edgeAngle({ x: 0, y: 0 }, { x: 10, y: 1 })).toBeCloseTo(5.71, 2);
    expect(edgeAngle({ x: 10, y: 1 }, { x: 0, y: 0 })).toBeCloseTo(5.71, 2);
    expect(edgeAngle({ x: 0, y: 0 }, { x: 0, y: -10 })).toBe(90);
  });

  it('gives the same skew for any edge of a board, along X or along Y', () => {
    // A board turned by 1.5°: its long edge and its short edge.
    const a = (1.5 * Math.PI) / 180;
    const along = { x: 200 * Math.cos(a), y: 200 * Math.sin(a) };
    const across = { x: -150 * Math.sin(a), y: 150 * Math.cos(a) };
    expect(skewAngle({ x: 0, y: 0 }, along)).toBeCloseTo(1.5, 6);
    expect(skewAngle(along, { x: 0, y: 0 })).toBeCloseTo(1.5, 6);
    expect(skewAngle({ x: 0, y: 0 }, across)).toBeCloseTo(1.5, 6);
    expect(skewAngle(across, { x: 0, y: 0 })).toBeCloseTo(1.5, 6);
    // Turned the other way.
    expect(skewAngle({ x: 0, y: 0 }, { x: 100, y: -2 })).toBeCloseTo(-1.146, 3);
    expect(skewAngle({ x: 0, y: 0 }, { x: 2, y: 100 })).toBeCloseTo(-1.146, 3);
    expect(skewAngle({ x: 0, y: 0 }, { x: 10, y: 10 })).toBe(45);
  });
});
