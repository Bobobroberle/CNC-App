import { describe, expect, it } from 'vitest';
import { findMarker, otsu, toGray } from '../src/lib/markers';

/** A light picture with dark anti-aliased discs (4×4 supersampling). */
function picture(
  width: number,
  height: number,
  discs: { x: number; y: number; r: number }[],
  extra?: (x: number, y: number) => boolean,
) {
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let dark = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const px = x + (sx + 0.5) / 4;
          const py = y + (sy + 0.5) / 4;
          if (discs.some((d) => (px - d.x) ** 2 + (py - d.y) ** 2 <= d.r * d.r)) dark++;
        }
      }
      if (extra?.(x, y)) dark = 16;
      gray[y * width + x] = Math.round(230 - (dark / 16) * 200);
    }
  }
  return gray;
}

describe('marker detection', () => {
  it('finds the dot nearest the centre with sub-pixel precision', () => {
    const gray = picture(160, 120, [
      { x: 81.3, y: 57.6, r: 12 },
      { x: 20, y: 20, r: 12 },
      { x: 140, y: 100, r: 12 },
    ]);
    const m = findMarker(gray, 160, 120)!;
    expect(m.x).toBeCloseTo(81.3, 1);
    expect(m.y).toBeCloseTo(57.6, 1);
    expect(m.diameter).toBeGreaterThan(22);
    expect(m.diameter).toBeLessThan(26);
  });

  it('ignores lines, specks, cut-off dots and flat pictures', () => {
    const line = (x: number, y: number) => y >= 58 && y <= 62 && x > 10 && x < 150;
    const gray = picture(
      160,
      120,
      [
        { x: 2, y: 60, r: 10 }, // cut off at the edge
        { x: 100, y: 30, r: 1.5 }, // speck
      ],
      line,
    );
    expect(findMarker(gray, 160, 120)).toBeNull();
    expect(findMarker(new Uint8Array(160 * 120).fill(128), 160, 120)).toBeNull();
    // A ring is not a filled dot.
    const ring = picture(160, 120, [{ x: 80, y: 60, r: 20 }]);
    const hole = picture(160, 120, [{ x: 80, y: 60, r: 14 }]);
    for (let i = 0; i < ring.length; i++) if (hole[i]! < 200) ring[i] = 230;
    expect(findMarker(ring, 160, 120)).toBeNull();
  });

  it('finds a light hole on dark material when asked to', () => {
    const dark = picture(160, 120, [{ x: 70.4, y: 66.2, r: 15 }]).map((v) => 255 - v);
    expect(findMarker(dark, 160, 120)).toBeNull();
    const m = findMarker(dark, 160, 120, { light: true })!;
    expect(m.x).toBeCloseTo(70.4, 1);
    expect(m.y).toBeCloseTo(66.2, 1);
  });

  it('turns RGBA into luminance and splits dark from light', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255]);
    expect([...toGray(rgba, 3, 1)]).toEqual([255, 0, 76]);
    const t = otsu(new Uint8Array([10, 12, 11, 200, 210, 205]));
    expect(t).toBeGreaterThanOrEqual(12);
    expect(t).toBeLessThan(200);
  });
});
